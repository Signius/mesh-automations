// getStats.js
import { Client, GatewayIntentBits } from 'discord.js'
import fs from 'fs'
import path from 'path'

// ——— Config from ENV ———
const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID      = process.env.GUILD_ID
const OUTPUT_FILE   = path.resolve(process.cwd(), 'mesh-gov-updates/discord-stats/stats.json')

if (!DISCORD_TOKEN || !GUILD_ID) {
  console.error('❌ DISCORD_TOKEN and GUILD_ID must be set')
  process.exit(1)
}

// ——— Backfill toggle ———
// Set to `true` to backfill January 2025 → last full month;
// set to `false` to run the “last month only” logic.
const BACKFILL      = false

// Year to backfill from January 1st of (only used if BACKFILL = true)
const BACKFILL_YEAR = 2025

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
})

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  const guild = await client.guilds.fetch(GUILD_ID)
  const memberCount = guild.memberCount

  // grab all text‐channels we can read
  const channels = guild.channels.cache.filter(
    c => c.isTextBased() && c.viewable
  ).values()

  let data = {}
  if (fs.existsSync(OUTPUT_FILE)) {
    data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
  }

  if (BACKFILL) {
    // —— backfill mode ——
    console.log('🔄 Running one‐off backfill for all of 2025 up to last month')
    const buckets = {}

    const now       = new Date()
    const startDate = new Date(BACKFILL_YEAR, 0, 1)             // Jan 1, 2025
    const endDate   = new Date(now.getFullYear(), now.getMonth(), 1) // 1st of current month

    // scan every channel once, bucket by YYYY-MM
    for (const channel of channels) {
      let lastId = null

      outer: while (true) {
        const opts     = { limit: 100, before: lastId }
        const messages = await channel.messages.fetch(opts)
        if (messages.size === 0) break

        for (const msg of messages.values()) {
          const ts = msg.createdAt

          if (ts < startDate) {
            // we’ve gone past Jan 1, 2025 → stop this channel
            break outer
          }
          if (ts < endDate) {
            const ym = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`
            buckets[ym] = (buckets[ym] || 0) + 1
          }
        }

        lastId = messages.last()?.id
        if (!lastId) break
        // pause to respect rate-limits
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // write each month’s stats
    for (let month = 0; month < now.getMonth(); month++) {
      const dt  = new Date(BACKFILL_YEAR, month, 1)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`

      data[key] = {
        memberCount,
        totalMessages: buckets[key] || 0
      }
      console.log(`  → ${key}: ${data[key].totalMessages} msgs, ${memberCount} members`)
    }
  } else {
    // —— normal “last month only” mode ——
    const now        = new Date()
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth(),    1)
    const key        = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

    let totalMessages = 0
    for (const channel of channels) {
      let lastId = null
      while (true) {
        const opts     = { limit: 100, before: lastId }
        const messages = await channel.messages.fetch(opts)
        if (messages.size === 0) break

        for (const msg of messages.values()) {
          const ts = msg.createdAt
          if (ts >= monthStart && ts < monthEnd) totalMessages++
          if (ts < monthStart) { messages.clear(); break }
        }

        lastId = messages.last()?.id
        if (!lastId) break
        await new Promise(r => setTimeout(r, 500))
      }
    }

    data[key] = { memberCount, totalMessages }
    console.log(`📊 Wrote stats for ${key}: ${totalMessages} msgs, ${memberCount} members`)
  }

  // ensure output folder exists
  const outDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true })
  }
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2))

  process.exit(0)
})

client.login(DISCORD_TOKEN)
