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
const BACKFILL      = false     // ← flip to false once your one-off is done
const BACKFILL_YEAR = 2025      // ← year to backfill from January

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages
  ]
})

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`)
  const guild       = await client.guilds.fetch(GUILD_ID)
  const memberCount = guild.memberCount

  // collect or load existing stats
  let data = {}
  if (fs.existsSync(OUTPUT_FILE)) {
    data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
  }

  const channels = guild.channels.cache.filter(c => c.isTextBased() && c.viewable).values()
  const now      = new Date()

  if (BACKFILL) {
    console.log('🔄 Backfilling Jan → last full month of', BACKFILL_YEAR)
    const buckets   = {}
    const startDate = new Date(BACKFILL_YEAR, 0, 1)              // Jan 1, BACKFILL_YEAR
    const endDate   = new Date(now.getFullYear(), now.getMonth(), 1) // 1st of current month

    for (const channel of channels) {
      let lastId = null

      outer: while (true) {
        const msgs = await channel.messages.fetch({ limit: 100, before: lastId })
        if (msgs.size === 0) break

        for (const msg of msgs.values()) {
          const ts = msg.createdAt
          if (ts < startDate) break outer
          if (ts < endDate) {
            const key = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`
            buckets[key] = (buckets[key] || 0) + 1
          }
        }

        lastId = msgs.last()?.id
        if (!lastId) break
        await new Promise(r => setTimeout(r, 500))
      }
    }

    // populate data object for each month of the year up to last full month
    for (let m = 0; m < now.getMonth(); m++) {
      const dt  = new Date(BACKFILL_YEAR, m, 1)
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`
      data[key] = {
        memberCount,
        totalMessages: buckets[key] || 0
      }
      console.log(`  → ${key}: ${data[key].totalMessages} msgs, ${memberCount} members`)
    }

  } else {
    // last-month only
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const monthEnd   = new Date(now.getFullYear(), now.getMonth(),    1)
    const key        = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

    let totalMessages = 0
    for (const channel of channels) {
      let lastId = null
      while (true) {
        const msgs = await channel.messages.fetch({ limit: 100, before: lastId })
        if (msgs.size === 0) break

        for (const msg of msgs.values()) {
          const ts = msg.createdAt
          if (ts >= monthStart && ts < monthEnd) totalMessages++
          if (ts < monthStart) { msgs.clear(); break }
        }

        lastId = msgs.last()?.id
        if (!lastId) break
        await new Promise(r => setTimeout(r, 500))
      }
    }

    data[key] = { memberCount, totalMessages }
    console.log(`📊 Wrote stats for ${key}: ${totalMessages} msgs, ${memberCount} members`)
  }

  // sort keys chronologically before writing
  const ordered = {}
  Object.keys(data)
    .sort()                   // e.g. ['2025-01', '2025-02', …]
    .forEach(k => { ordered[k] = data[k] })

  // ensure folder exists
  const outDir = path.dirname(OUTPUT_FILE)
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(ordered, null, 2))
  console.log(`✅ Stats written to ${OUTPUT_FILE}`)
  process.exit(0)
})

client.login(DISCORD_TOKEN)
