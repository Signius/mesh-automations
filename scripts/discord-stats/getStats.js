// getStats.js
import { Client, GatewayIntentBits } from 'discord.js'
import fs from 'fs'
import path from 'path'

// ——— Config from ENV ———
const DISCORD_TOKEN = process.env.DISCORD_TOKEN
const GUILD_ID = process.env.GUILD_ID
const OUTPUT_FILE = path.resolve(process.cwd(), 'mesh-gov-updates/discord-stats/stats.json')

if (!DISCORD_TOKEN || !GUILD_ID) {
    console.error('❌ DISCORD_TOKEN and GUILD_ID must be set')
    process.exit(1)
}

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

    // Determine last calendar month
    const now = new Date()
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), 1)
    const monthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    const yearMonth = `${monthStart.getFullYear()}-${String(monthStart.getMonth() + 1).padStart(2, '0')}`

    let totalMessages = 0
    const channels = guild.channels.cache.filter(c => c.isTextBased() && c.viewable)

    for (const channel of channels.values()) {
        let lastId = null
        while (true) {
            const options = { limit: 100, before: lastId }
            const messages = await channel.messages.fetch(options)
            if (messages.size === 0) break

            for (const msg of messages.values()) {
                const ts = msg.createdAt
                if (ts >= monthStart && ts < monthEnd) totalMessages++
                if (ts < monthStart) {
                    // As soon as we see older messages, stop paginating this channel
                    messages.clear()
                    break
                }
            }

            lastId = messages.last()?.id
            if (!lastId) break
            // minor pause to respect rate limits
            await new Promise(r => setTimeout(r, 500))
        }
    }

    // read existing stats
    let data = {}
    if (fs.existsSync(OUTPUT_FILE)) {
        data = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf8'))
    }

    data[yearMonth] = { memberCount, totalMessages }

    // Ensure directory exists before writing file
    const outputDir = path.dirname(OUTPUT_FILE)
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true })
    }

    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(data, null, 2))
    console.log(`📊 Wrote stats for ${yearMonth}`)

    process.exit(0)
})

client.login(DISCORD_TOKEN)
