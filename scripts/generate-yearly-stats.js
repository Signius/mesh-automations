import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchMonthlyDownloads(packageName, year) {
    const downloads = [];
    for (let month = 1; month <= 12; month++) {
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

async function fetchMonthlyGitHubStats(githubToken, year) {
    const stats = [];
    for (let month = 1; month <= 12; month++) {
        const startDate = `${year}-${month.toString().padStart(2, '0')}-01`;
        const endDate = new Date(year, month, 0).toISOString().split('T')[0];

        try {
            // Search for @meshsdk/core in package.json
            const corePackageJsonResponse = await axios.get(
                'https://api.github.com/search/code',
                {
                    params: {
                        q: `"@meshsdk/core" in:file filename:package.json created:${startDate}..${endDate}`
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
                        q: `"@meshsdk/core" created:${startDate}..${endDate}`
                    },
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${githubToken}`
                    }
                }
            );

            stats.push({
                month,
                core_in_package_json: corePackageJsonResponse.data.total_count,
                core_in_any_file: coreAnyFileResponse.data.total_count
            });
        } catch (error) {
            console.error(`Error fetching GitHub stats for ${year}-${month}:`, error.message);
            stats.push({
                month,
                core_in_package_json: 0,
                core_in_any_file: 0
            });
        }
    }
    return stats;
}

function generateYearlyMarkdown(year, monthlyDownloads, monthlyGitHubStats) {
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

    const markdown = `# Mesh SDK Usage Statistics ${year}

## Monthly Download Statistics for @meshsdk/core
| Month | Downloads |
|:------|:----------|
${monthlyDownloads.core.map(m => `| ${monthNames[m.month - 1]} | ${m.downloads.toLocaleString()} |`).join('\n')}

## Monthly GitHub Usage Statistics
| Month | Projects using @meshsdk/core | Files containing @meshsdk/core |
|:------|:---------------------------|:--------------------------------|
${monthlyGitHubStats.map(s => `| ${monthNames[s.month - 1]} | ${s.core_in_package_json.toLocaleString()} | ${s.core_in_any_file.toLocaleString()} |`).join('\n')}

## Yearly Package Download Totals
| Package | Total Downloads |
|:--------|:---------------|
| @meshsdk/core | ${yearlyTotals.core.toLocaleString()} |
| @meshsdk/react | ${yearlyTotals.react.toLocaleString()} |
| @meshsdk/transaction | ${yearlyTotals.transaction.toLocaleString()} |
| @meshsdk/wallet | ${yearlyTotals.wallet.toLocaleString()} |
| @meshsdk/provider | ${yearlyTotals.provider.toLocaleString()} |
| @meshsdk/core-csl | ${yearlyTotals.coreCsl.toLocaleString()} |
| @meshsdk/core-cst | ${yearlyTotals.coreCst.toLocaleString()} |
`;

    return markdown;
}

async function main() {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];

    try {
        console.log('Starting Yearly Mesh SDK Stats Generation...\n');

        for (const year of years) {
            console.log(`Generating stats for ${year}...`);

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

            // Fetch monthly GitHub stats
            const monthlyGitHubStats = await fetchMonthlyGitHubStats(githubToken, year);

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