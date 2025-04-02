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
        core_in_package_json: corePackageJsonResponse.data.total_count,
        core_in_any_file: coreAnyFileResponse.data.total_count
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
        const trend = m.downloads === maxDownloads ? '🔥' :
            m.downloads > monthlyDownloads.core[m.month - 2]?.downloads ? '📈' :
                m.downloads < monthlyDownloads.core[m.month - 2]?.downloads ? '📉' : '➡️';
        return `| ${monthNames[m.month - 1]}${'&nbsp;'.repeat(40 - monthNames[m.month - 1].length)} | ${m.downloads.toLocaleString().padStart(15)} | ${trend.padStart(11)} |`;
    }).join('\n')}

**Peak Month**: ${maxMonthName} with ${maxDownloads.toLocaleString()} downloads

## 📦 Yearly Package Download Totals

| Package Name${'&nbsp;'.repeat(32)} |   Total Downloads |   Rating |
| :---------------------------------------- | ---------------: | -------: |
| @meshsdk/core | ${yearlyTotals.core.toLocaleString().padStart(15)} | ${(yearlyTotals.core > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/react | ${yearlyTotals.react.toLocaleString().padStart(15)} | ${(yearlyTotals.react > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/transaction | ${yearlyTotals.transaction.toLocaleString().padStart(15)} | ${(yearlyTotals.transaction > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/wallet | ${yearlyTotals.wallet.toLocaleString().padStart(15)} | ${(yearlyTotals.wallet > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/provider | ${yearlyTotals.provider.toLocaleString().padStart(15)} | ${(yearlyTotals.provider > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/core-csl | ${yearlyTotals.coreCsl.toLocaleString().padStart(15)} | ${(yearlyTotals.coreCsl > 50000 ? '🌟' : '⭐').padStart(7)} |
| @meshsdk/core-cst | ${yearlyTotals.coreCst.toLocaleString().padStart(15)} | ${(yearlyTotals.coreCst > 50000 ? '🌟' : '⭐').padStart(7)} |

## 🔍 GitHub Usage Statistics

| Month${'&nbsp;'.repeat(44)} |   Project Count |   File Count |
| :---------------------------------------- | -------------: | -----------: |
${monthNames.map(month => {
        const monthStats = githubStats[month] || { core_in_package_json: 0, core_in_any_file: 0 };
        return `| ${month}${'&nbsp;'.repeat(40 - month.length)} | ${monthStats.core_in_package_json.toLocaleString().padStart(14)} | ${monthStats.core_in_any_file.toLocaleString().padStart(11)} |`;
    }).join('\n')}`;

    return markdown;
}

async function extractGitHubStatsFromMarkdown(markdownContent) {
    const stats = {};
    const monthNames = [
        'January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'
    ];

    // Extract the GitHub stats table content
    const tableMatch = markdownContent.match(/## 🔍 GitHub Usage Statistics\n\n\|.*?\n\|.*?\n((?:\|.*?\n)*)/);
    if (tableMatch) {
        const tableRows = tableMatch[1].trim().split('\n');
        tableRows.forEach(row => {
            const [, month, projectCount, fileCount] = row.match(/\|\s*(.*?)\s*\|\s*(\d[,\d]*)\s*\|\s*(\d[,\d]*)\s*\|/);
            const cleanMonth = month.trim();
            if (monthNames.includes(cleanMonth)) {
                stats[cleanMonth] = {
                    core_in_package_json: parseInt(projectCount.replace(/,/g, '')),
                    core_in_any_file: parseInt(fileCount.replace(/,/g, ''))
                };
            }
        });
    }
    return stats;
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
            const markdownPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', `${year}.md`);

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

            let githubStats = {};

            if (fs.existsSync(markdownPath)) {
                // Read existing GitHub stats from the markdown file
                const existingContent = fs.readFileSync(markdownPath, 'utf8');
                githubStats = await extractGitHubStatsFromMarkdown(existingContent);
            }

            if (year === currentYear) {
                // Update GitHub stats for the current month
                console.log(`Fetching current GitHub stats for ${currentMonthName} ${year}`);
                const currentGitHubStats = await fetchGitHubStats(githubToken);
                githubStats[currentMonthName] = currentGitHubStats;
            }

            const markdown = generateYearlyMarkdown(year, monthlyDownloads, githubStats);
            fs.writeFileSync(markdownPath, markdown);
            console.log(`Updated markdown file for year ${year} at ${markdownPath}`);
        }

        console.log('\nYearly stats generated successfully!');
    } catch (error) {
        console.error('Error generating yearly stats:', error);
        process.exit(1);
    }
}

main();
