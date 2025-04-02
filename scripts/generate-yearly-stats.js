import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchGitHubStats(githubToken) {
    // Search for @meshsdk/core in package.json
    const corePackageJsonResponse = await axios.get(
        'https://api.github.com/search/code',
        {
            params: {
                q: '"@meshsdk/core" in:file filename:package.json'
            },
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
            }
        }
    );

    // Search for @meshsdk/core in any file
    const coreAnyFileResponse = await axios.get(
        'https://api.github.com/search/code',
        {
            params: {
                q: '"@meshsdk/core"'
            },
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
            }
        }
    );

    return {
        core_in_package_json: corePackageJsonResponse.data.total_count || 'not recorded',
        core_in_any_file: coreAnyFileResponse.data.total_count || 'not recorded'
    };
}

async function fetchMonthlyDownloads(packageName, year) {
    const downloads = [];
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;

    for (let month = 1; month <= 12; month++) {
        // Skip future months
        if (year === currentYear && month > currentMonth) {
            downloads.push({
                month,
                downloads: 0
            });
            continue;
        }

        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        try {
            const response = await axios.get(
                `https://api.npmjs.org/downloads/point/${startDate}:${endDate}/${packageName}`
            );
            downloads.push({
                month,
                downloads: response.data.downloads
            });
        } catch (error) {
            console.error(`Error fetching downloads for ${packageName} in ${year}-${month}:`, error.message);
            downloads.push({
                month,
                downloads: 0
            });
        }
    }
    return downloads;
}

function generateYearlyMarkdown(year, monthlyDownloads, githubStats) {
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Calculate yearly totals for each package
    const yearlyTotals = {
        core: monthlyDownloads.core.reduce((sum, m) => sum + m.downloads, 0),
        react: monthlyDownloads.react.reduce((sum, m) => sum + m.downloads, 0),
        transaction: monthlyDownloads.transaction.reduce((sum, m) => sum + m.downloads, 0),
        wallet: monthlyDownloads.wallet.reduce((sum, m) => sum + m.downloads, 0),
        provider: monthlyDownloads.provider.reduce((sum, m) => sum + m.downloads, 0),
        coreCsl: monthlyDownloads.coreCsl.reduce((sum, m) => sum + m.downloads, 0),
        coreCst: monthlyDownloads.coreCst.reduce((sum, m) => sum + m.downloads, 0)
    };

    // Calculate the most downloaded month for @meshsdk/core
    const maxDownloads = Math.max(...monthlyDownloads.core.map(m => m.downloads));
    const maxMonth = monthlyDownloads.core.find(m => m.downloads === maxDownloads);
    const maxMonthName = monthNames[maxMonth.month - 1];

    const markdown = `# 📊 Mesh SDK Usage Statistics ${year}

## 📈 Monthly Download Statistics for @meshsdk/core

| Month${'&nbsp;'.repeat(35)} |   Download Count |   Performance |
| :---------------------------------------- | --------------: | -----------: |
${monthlyDownloads.core.map(m => {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Only show performance trends up to current month
        const trend = (year < currentYear || (year === currentYear && m.month <= currentMonth))
            ? (m.downloads === maxDownloads ? '🔥' :
                m.downloads > monthlyDownloads.core[m.month - 2]?.downloads ? '📈' :
                    m.downloads < monthlyDownloads.core[m.month - 2]?.downloads ? '📉' : '➡️')
            : '➡️';
        return `| ${monthNames[m.month - 1]} | ${m.downloads.toLocaleString()} | ${trend} |`;
    }).join('\n')}

**Peak Month**: ${maxMonthName} with ${maxDownloads.toLocaleString()} downloads

## 📦 Yearly Package Download Totals

| Package Name${'&nbsp;'.repeat(32)} |   Total Downloads |   Rating |
| :---------------------------------------- | ---------------: | -------: |
| @meshsdk/core | ${yearlyTotals.core.toLocaleString()} | ${yearlyTotals.core > 20000 ? '🌟' : '⭐'} |
| @meshsdk/react | ${yearlyTotals.react.toLocaleString()} | ${yearlyTotals.react > 20000 ? '🌟' : '⭐'} |
| @meshsdk/transaction | ${yearlyTotals.transaction.toLocaleString()} | ${yearlyTotals.transaction > 20000 ? '🌟' : '⭐'} |
| @meshsdk/wallet | ${yearlyTotals.wallet.toLocaleString()} | ${yearlyTotals.wallet > 20000 ? '🌟' : '⭐'} |
| @meshsdk/provider | ${yearlyTotals.provider.toLocaleString()} | ${yearlyTotals.provider > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-csl | ${yearlyTotals.coreCsl.toLocaleString()} | ${yearlyTotals.coreCsl > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-cst | ${yearlyTotals.coreCst.toLocaleString()} | ${yearlyTotals.coreCst > 20000 ? '🌟' : '⭐'} |

## 🔍 GitHub Usage Statistics

| Month${'&nbsp;'.repeat(62)} |   Projects |   Files |
| :---------------------------------------- | -------------: | -----------: |
${monthNames.map(month => {
        const monthStats = githubStats[month] || { core_in_package_json: 'not recorded', core_in_any_file: 'not recorded' };
        const formatValue = (value) => value === 'not recorded' ? value : value.toLocaleString();
        return `| ${month} | ${formatValue(monthStats.core_in_package_json)} | ${formatValue(monthStats.core_in_any_file)} |`;
    }).join('\n')}`;

    return markdown;
}

async function loadPreviousStats(year) {
    try {
        const statsPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', `${year}.md`);
        console.log(`Attempting to load previous stats from: ${statsPath}`);

        if (fs.existsSync(statsPath)) {
            console.log(`Found existing stats file for ${year}`);
            const content = fs.readFileSync(statsPath, 'utf8');
            // Extract GitHub stats from the markdown
            const githubStatsMatch = content.match(/## 🔍 GitHub Usage Statistics\n\n\| Month(?:&nbsp;)*? *\| *Projects *\| *Files *\|\n\| *:[-]+ *\| *[-]+: *\| *[-]+: *\|\n([\s\S]*?)(?=\n\n|$)/);

            if (githubStatsMatch) {
                console.log(`Successfully matched GitHub stats section for ${year}`);
                const rows = githubStatsMatch[1].split('\n').filter(row => row.trim());
                const monthlyStats = {};

                rows.forEach(row => {
                    // Updated regex to handle comma-formatted numbers
                    const match = row.match(/\| (.*?) \| ([\d,]+) \| ([\d,]+) \|/);
                    if (match) {
                        const [_, month, projects, files] = match;
                        monthlyStats[month] = {
                            core_in_package_json: parseInt(projects.replace(/,/g, '')),
                            core_in_any_file: parseInt(files.replace(/,/g, ''))
                        };
                    }
                });

                console.log(`Loaded monthly stats for ${year}:`, monthlyStats);
                return { github: monthlyStats };
            } else {
                console.log(`No GitHub stats section found in ${year} file`);
            }
        } else {
            console.log(`No existing stats file found for ${year}`);
        }
    } catch (error) {
        console.error(`Error loading previous stats for ${year}:`, error);
    }
    return { github: {} };
}

async function main() {
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: currentYear - 2023 }, (_, i) => 2024 + i);
    const githubToken = process.env.GITHUB_TOKEN;
    const currentMonth = new Date().getMonth();
    const currentMonthName = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ][currentMonth];

    if (!githubToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    try {
        console.log('Starting Yearly Mesh SDK Stats Generation...\n');

        for (const year of years) {
            console.log(`\n=== Processing year ${year} ===`);

            // Load previous stats
            const previousStats = await loadPreviousStats(year);
            console.log(`Previous stats loaded for ${year}:`, previousStats);

            // Keep all previous GitHub stats exactly as they are
            const monthlyGitHubStats = { ...previousStats?.github };
            console.log(`Monthly GitHub stats after loading:`, monthlyGitHubStats);

            // Only fetch and update GitHub stats for current year and current month
            if (year === currentYear) {
                console.log(`Fetching current GitHub stats for ${currentMonthName} ${year}`);
                // Fetch current GitHub stats
                const currentGitHubStats = await fetchGitHubStats(githubToken);

                // Only update current month's stats if they've increased
                const currentMonthStats = monthlyGitHubStats[currentMonthName] || { core_in_package_json: 'not recorded', core_in_any_file: 'not recorded' };
                console.log(`Current month stats before update:`, currentMonthStats);
                console.log(`New GitHub stats:`, currentGitHubStats);

                if (currentMonthStats.core_in_package_json === 'not recorded' ||
                    currentMonthStats.core_in_any_file === 'not recorded' ||
                    currentGitHubStats.core_in_package_json > currentMonthStats.core_in_package_json ||
                    currentGitHubStats.core_in_any_file > currentMonthStats.core_in_any_file) {
                    console.log(`Updating stats for ${currentMonthName} as new numbers are higher or previous values were not recorded`);
                    monthlyGitHubStats[currentMonthName] = currentGitHubStats;
                }
            }

            // Fetch monthly downloads for all packages
            const monthlyDownloads = {
                core: await fetchMonthlyDownloads('@meshsdk/core', year),
                react: await fetchMonthlyDownloads('@meshsdk/react', year),
                transaction: await fetchMonthlyDownloads('@meshsdk/transaction', year),
                wallet: await fetchMonthlyDownloads('@meshsdk/wallet', year),
                provider: await fetchMonthlyDownloads('@meshsdk/provider', year),
                coreCsl: await fetchMonthlyDownloads('@meshsdk/core-csl', year),
                coreCst: await fetchMonthlyDownloads('@meshsdk/core-cst', year)
            };

            // Generate markdown
            const markdown = generateYearlyMarkdown(year, monthlyDownloads, monthlyGitHubStats);

            // Save markdown file
            const markdownPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', `${year}.md`);
            fs.writeFileSync(markdownPath, markdown);
            console.log(`Saved markdown to ${markdownPath}`);
        }

        console.log('\nYearly stats generated successfully!');
    } catch (error) {
        console.error('Error generating yearly stats:', error);
        process.exit(1);
    }
}

main(); 