const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ─── State ───────────────────────────────────────────────────────────────────
// Map of guildId → { channelId, roleId, notifyMinutes, watchedEvents, seenKeys }
const guildConfigs = new Map();
// In production, persist this to a JSON file or DB. For now it's in-memory.

const METAFORGE_URL = 'https://metaforge.app/api/arc-raiders/events-schedule';

// Known event types (for autocomplete / filtering)
const ALL_EVENTS = [
  'Matriarch',
  'Harvester',
  'Night Raid',
  'Electromagnetic Storm',
  'Prospecting Probes',
  'Lush Blooms',
  'Hidden Bunker',
  'Uncovered Caches',
  'Husk Graveyard',
  'Close Scrutiny',
  'Locked Gate',
  'Cold Snap',
  'Launch Tower Loot',
];

// Major events highlighted in red embed
const MAJOR_EVENTS = new Set([
  'matriarch', 'night raid', 'electromagnetic storm', 'hidden bunker',
  'close scrutiny', 'locked gate', 'cold snap',
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────
function getConfig(guildId) {
  return guildConfigs.get(guildId) ?? null;
}

function embedColor(eventName) {
  return MAJOR_EVENTS.has(eventName?.toLowerCase()) ? 0xe74c3c : 0x3498db;
}

function mapEmoji(mapName) {
  const m = mapName?.toLowerCase() ?? '';
  if (m.includes('dam'))       return '🌊';
  if (m.includes('space'))     return '🚀';
  if (m.includes('buried'))    return '🏚️';
  if (m.includes('blue'))      return '🚪';
  if (m.includes('stella'))    return '⛰️';
  return '🗺️';
}

async function fetchEvents() {
  const res = await fetch(METAFORGE_URL, {
    headers: { 'User-Agent': 'ArcRaidersDiscordBot/1.0 (discord bot)' },
  });
  if (!res.ok) throw new Error(`MetaForge API error: ${res.status}`);
  return res.json();
}

// Build a unique key for a specific event occurrence so we don't double-post
function eventKey(event) {
  return `${event.map}::${event.name}::${event.startTime ?? event.start}`;
}

// ─── Polling loop ─────────────────────────────────────────────────────────────
async function pollEvents() {
  let rawData;
  try {
    rawData = await fetchEvents();
  } catch (err) {
    console.error('[poll] Failed to fetch events:', err.message);
    return;
  }

  // Normalise: the API may return { events: [...] } or an array directly
  const events = Array.isArray(rawData) ? rawData : (rawData.events ?? rawData.data ?? []);
  const now = Date.now();

  for (const [guildId, cfg] of guildConfigs) {
    const guild = client.guilds.cache.get(guildId);
    if (!guild) continue;

    const channel = guild.channels.cache.get(cfg.channelId);
    if (!channel) continue;

    const role = guild.roles.cache.get(cfg.roleId);

    for (const event of events) {
      const name = event.name ?? event.event ?? event.eventName ?? 'Unknown';
      const map  = event.map  ?? event.mapName ?? event.region ?? 'Unknown';
      const startTs = event.startTime ?? event.start ?? event.startsAt;

      // Filter by watched events list (if set)
      const normalizedName = name.toLowerCase();
      if (cfg.watchedEvents.length > 0) {
        const watched = cfg.watchedEvents.map(e => e.toLowerCase());
        if (!watched.some(w => normalizedName.includes(w))) continue;
      }

      // Filter: only fire notifyMinutes before start (or right as it starts)
      if (startTs) {
        const startMs = new Date(startTs).getTime();
        const msUntil = startMs - now;
        const minutesUntil = msUntil / 60_000;
        // Notify window: between (notifyMinutes + 1) and notifyMinutes before start
        if (minutesUntil > cfg.notifyMinutes + 1 || minutesUntil < -2) continue;
      }

      const key = eventKey({ map, name, startTime: startTs });
      if (cfg.seenKeys.has(key)) continue;
      cfg.seenKeys.add(key);

      // Keep seenKeys from growing forever
      if (cfg.seenKeys.size > 500) {
        const iter = cfg.seenKeys.values();
        cfg.seenKeys.delete(iter.next().value);
      }

      const isMajor = MAJOR_EVENTS.has(normalizedName);
      const endTs   = event.endTime ?? event.end ?? event.endsAt;

      const embed = {
        color: embedColor(name),
        title: `${isMajor ? '🔴' : '🔵'} ${name} — ${mapEmoji(map)} ${map}`,
        description: event.description ?? (isMajor
          ? '**Major event!** High risk, high reward.'
          : 'Event is starting soon.'),
        fields: [],
        footer: { text: 'Data via MetaForge · metaforge.app/arc-raiders' },
        timestamp: new Date().toISOString(),
      };

      if (startTs) embed.fields.push({ name: '⏰ Starts', value: `<t:${Math.floor(new Date(startTs).getTime() / 1000)}:R>`, inline: true });
      if (endTs)   embed.fields.push({ name: '🏁 Ends',   value: `<t:${Math.floor(new Date(endTs).getTime()   / 1000)}:R>`, inline: true });

      const mention = role ? `${role}` : '';
      await channel.send({ content: mention ? `${mention} **${name}** is starting on **${map}**!` : undefined, embeds: [embed] })
        .catch(e => console.error('[send]', e.message));
    }
  }
}

// ─── Slash commands ───────────────────────────────────────────────────────────
const commands = [
  new SlashCommandBuilder()
    .setName('arc-setup')
    .setDescription('Set up event notifications for this server')
    .addChannelOption(o => o.setName('channel').setDescription('Channel to post alerts in').setRequired(true))
    .addRoleOption(o    => o.setName('role').setDescription('Role to ping').setRequired(true))
    .addIntegerOption(o => o.setName('notify_minutes').setDescription('Minutes before event to notify (default 5)').setRequired(false).setMinValue(0).setMaxValue(60))
    .addStringOption(o  => o.setName('events').setDescription('Comma-separated events to watch (leave blank = all). E.g. Matriarch,Night Raid').setRequired(false)),

  new SlashCommandBuilder()
    .setName('arc-status')
    .setDescription('Show current bot configuration for this server'),

  new SlashCommandBuilder()
    .setName('arc-stop')
    .setDescription('Stop event notifications for this server'),

  new SlashCommandBuilder()
    .setName('arc-events')
    .setDescription('Fetch and display current/upcoming events right now'),
].map(c => c.toJSON());

// ─── Register commands on ready ───────────────────────────────────────────────
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    // Register to every guild the bot is in (instant, no 1-hour delay)
    const guilds = client.guilds.cache.map(g => g.id);
    for (const guildId of guilds) {
      await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
      console.log(`✅ Slash commands registered for guild ${guildId}`);
    }
    if (guilds.length === 0) {
      console.warn('⚠️  Bot is not in any guilds yet — invite it first, then restart.');
    }
  } catch (err) {
    console.error('Failed to register commands:', err);
  }

  // Poll every 60 seconds
  setInterval(pollEvents, 60_000);
  pollEvents(); // immediate first run
});

// ─── Interaction handler ──────────────────────────────────────────────────────
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName, guildId } = interaction;

  // ── /arc-setup ──
  if (commandName === 'arc-setup') {
    if (!interaction.memberPermissions.has('ManageGuild')) {
      return interaction.reply({ content: '❌ You need **Manage Server** permission to set this up.', ephemeral: true });
    }

    const channel       = interaction.options.getChannel('channel');
    const role          = interaction.options.getRole('role');
    const notifyMinutes = interaction.options.getInteger('notify_minutes') ?? 5;
    const eventsRaw     = interaction.options.getString('events') ?? '';
    const watchedEvents = eventsRaw ? eventsRaw.split(',').map(s => s.trim()).filter(Boolean) : [];

    guildConfigs.set(guildId, {
      channelId: channel.id,
      roleId: role.id,
      notifyMinutes,
      watchedEvents,
      seenKeys: new Set(),
    });

    const watchStr = watchedEvents.length ? watchedEvents.join(', ') : 'All events';
    await interaction.reply({
      embeds: [{
        color: 0x2ecc71,
        title: '✅ Arc Raiders bot configured!',
        fields: [
          { name: '📢 Channel',        value: `<#${channel.id}>`,     inline: true },
          { name: '🔔 Role',           value: `<@&${role.id}>`,       inline: true },
          { name: '⏰ Notify before',  value: `${notifyMinutes} min`, inline: true },
          { name: '🎯 Watching',       value: watchStr },
        ],
        footer: { text: 'Use /arc-stop to disable or /arc-setup again to reconfigure.' },
      }],
    });
    return;
  }

  // ── /arc-status ──
  if (commandName === 'arc-status') {
    const cfg = getConfig(guildId);
    if (!cfg) {
      return interaction.reply({ content: '⚠️ Bot is not configured for this server. Use `/arc-setup` first.', ephemeral: true });
    }
    const watchStr = cfg.watchedEvents.length ? cfg.watchedEvents.join(', ') : 'All events';
    return interaction.reply({
      embeds: [{
        color: 0x3498db,
        title: '📋 Arc Raiders Bot Status',
        fields: [
          { name: '📢 Channel',       value: `<#${cfg.channelId}>`,   inline: true },
          { name: '🔔 Role',          value: `<@&${cfg.roleId}>`,     inline: true },
          { name: '⏰ Notify before', value: `${cfg.notifyMinutes} min`, inline: true },
          { name: '🎯 Watching',      value: watchStr },
        ],
      }],
      ephemeral: true,
    });
  }

  // ── /arc-stop ──
  if (commandName === 'arc-stop') {
    if (!interaction.memberPermissions.has('ManageGuild')) {
      return interaction.reply({ content: '❌ You need **Manage Server** permission.', ephemeral: true });
    }
    guildConfigs.delete(guildId);
    return interaction.reply({ content: '🛑 Event notifications stopped for this server.', ephemeral: true });
  }

  // ── /arc-events ──
  if (commandName === 'arc-events') {
    await interaction.deferReply();
    let rawData;
    try {
      rawData = await fetchEvents();
    } catch (err) {
      return interaction.editReply(`❌ Failed to fetch events: ${err.message}`);
    }

    const events = Array.isArray(rawData) ? rawData : (rawData.events ?? rawData.data ?? []);
    if (!events.length) {
      return interaction.editReply('No events found right now. Try again soon!');
    }

    const now = Date.now();
    // Show events starting in the next 2 hours, or currently active
    const upcoming = events.filter(e => {
      const start = new Date(e.startTime ?? e.start ?? e.startsAt ?? now).getTime();
      const end   = new Date(e.endTime   ?? e.end   ?? e.endsAt   ?? now + 3_600_000).getTime();
      return end > now && start < now + 2 * 3_600_000;
    }).slice(0, 10);

    if (!upcoming.length) {
      return interaction.editReply('No events active or starting in the next 2 hours.');
    }

    const fields = upcoming.map(e => {
      const name   = e.name ?? e.event ?? 'Unknown';
      const map    = e.map  ?? e.mapName ?? e.region ?? 'Unknown';
      const startTs = e.startTime ?? e.start ?? e.startsAt;
      const endTs   = e.endTime   ?? e.end   ?? e.endsAt;
      const startStr = startTs ? `<t:${Math.floor(new Date(startTs).getTime()/1000)}:R>` : 'Now';
      const endStr   = endTs   ? `<t:${Math.floor(new Date(endTs).getTime()/1000)}:R>`   : '—';
      return { name: `${mapEmoji(map)} ${name} — ${map}`, value: `Starts ${startStr} · Ends ${endStr}`, inline: false };
    });

    return interaction.editReply({
      embeds: [{
        color: 0x9b59b6,
        title: '📅 Upcoming Arc Raiders Events',
        fields,
        footer: { text: 'Data via MetaForge · metaforge.app/arc-raiders' },
        timestamp: new Date().toISOString(),
      }],
    });
  }
});

// ─── Login ────────────────────────────────────────────────────────────────────
client.login(process.env.DISCORD_TOKEN);
