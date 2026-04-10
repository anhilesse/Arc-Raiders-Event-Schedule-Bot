# Arc Raiders Discord Bot 🎮

Automatically pings a Discord role whenever an Arc Raiders map event starts — Matriarch, Night Raid, Electromagnetic Storm, and more. Uses the **MetaForge community API** for live event data.

---

## Features

- 🔔 Pings a role when events are about to start (configurable timing)
- 🗺️ Covers all 5 maps: Dam, Spaceport, Buried City, Blue Gate, Stella Montis
- 🎯 Filter to only watch specific events (e.g. just Matriarch and Night Raid)
- 📅 `/arc-events` command to see upcoming events on demand
- Easy slash command setup — no config files to edit per server

---

## Setup

### 1. Create a Discord Bot

1. Go to https://discord.com/developers/applications and click **New Application**
2. Go to the **Bot** tab → click **Add Bot**
3. Under **Token**, click **Reset Token** and copy it
4. Under **Privileged Gateway Intents**, enable **Server Members Intent** (optional but good practice)
5. Go to **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Bot permissions: `Send Messages`, `Embed Links`, `Mention Everyone` (for role pings)
6. Copy the generated URL and open it to invite the bot to your server

### 2. Install & Run

```bash
# Clone / download this folder, then:
npm install

# Create your .env file
cp .env.example .env
# Edit .env and paste your bot token
```

```bash
npm start
```

### 3. Configure in Discord

Use slash commands in your server:

```
/arc-setup channel:#event-alerts role:@arc-events notify_minutes:5
```

Optional: filter to specific events only:
```
/arc-setup channel:#arc-alerts role:@matriarch-ping events:Matriarch,Night Raid
```

---

## Slash Commands

| Command | Description |
|---|---|
| `/arc-setup` | Configure channel, role, timing, and event filter |
| `/arc-status` | View current configuration |
| `/arc-stop` | Disable notifications |
| `/arc-events` | Show current/upcoming events right now |

### `/arc-setup` options

| Option | Required | Description |
|---|---|---|
| `channel` | ✅ | Channel to post alerts in |
| `role` | ✅ | Role to @mention |
| `notify_minutes` | ❌ | How many minutes before event start to notify (default: 5) |
| `events` | ❌ | Comma-separated list of events to watch. Leave blank for all. |

### Watchable events

```
Matriarch, Harvester, Night Raid, Electromagnetic Storm,
Prospecting Probes, Lush Blooms, Hidden Bunker,
Uncovered Caches, Husk Graveyard, Close Scrutiny,
Locked Gate, Cold Snap, Launch Tower Loot
```

---

## Hosting (keep it running 24/7)

**Free options:**
- [Railway](https://railway.app) — paste the files, add `DISCORD_TOKEN` as an env var, done
- [Render](https://render.com) — free tier works for bots
- [Fly.io](https://fly.io) — generous free tier

**Self-host:** Any machine running Node.js 18+. Use `pm2` to keep it alive:
```bash
npm install -g pm2
pm2 start bot.js --name arc-bot
pm2 save && pm2 startup
```

---

## Notes

- Event data is provided by [MetaForge](https://metaforge.app/arc-raiders) (community-maintained API)
- The bot polls every 60 seconds
- Each event is only announced once per occurrence
- Per MetaForge's terms: this bot credits their API. Please don't use this commercially without contacting them first.
