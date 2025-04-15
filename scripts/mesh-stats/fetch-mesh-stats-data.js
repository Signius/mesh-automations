import axios from 'axios';
import fs from 'fs';
import path from 'path';
import * as cheerio from 'cheerio';

// Add Discord webhook URL - this should be set as an environment variable
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

async function sendDiscordNotification(message) {
    if (!DISCORD_WEBHOOK_URL) {
        console.error('Discord webhook URL not set');
        return;
    }

    try {
        await axios.post(DISCORD_WEBHOOK_URL, {
            content: message
        });
    } catch (error) {
        console.error('Failed to send Discord notification:', error.message);
    }
}

export async function fetchMeshStats(githubToken) {
    console.log('Fetching GitHub statistics...');

    // Search for @meshsdk/core in package.json
    const corePackageJsonResponse = await axios.get(
        'https://api.github.com/search/code',
        {
            params: { q: '"@meshsdk/core" in:file filename:package.json' },
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
            }
        }
    );
    console.log('GitHub package.json count:', corePackageJsonResponse.data.total_count);

    // Search for @meshsdk/core in any file
    const coreAnyFileResponse = await axios.get(
        'https://api.github.com/search/code',
        {
            params: { q: '"@meshsdk/core"' },
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
            }
        }
    );
    console.log('GitHub total mentions:', coreAnyFileResponse.data.total_count);

    // Read core_in_repositories data from file (fallback value)
    const coreInReposPath = path.join('mesh-gov-updates', 'mesh-stats', 'core-in-repositories.json');
    let coreInReposData = { last_updated: '', core_in_repositories: 0 };
    if (fs.existsSync(coreInReposPath)) {
        coreInReposData = JSON.parse(fs.readFileSync(coreInReposPath, 'utf8'));
    }

    console.log('Fetching GitHub Dependents count from webpage using Cheerio...');

    // Helper function to fetch the dependents count using Cheerio.
    async function fetchDependentsCount() {
        try {
            const dependentsUrl = 'https://github.com/MeshJS/mesh/network/dependents?dependent_type=REPOSITORY&package_id=UGFja2FnZS0zNDczNjUyOTU4';
            const response = await axios.get(dependentsUrl, {
                headers: { 'User-Agent': 'Mozilla/5.0' }
            });
            const html = response.data;
            const $ = cheerio.load(html);

            // Use a selector targeting the anchor element with class "btn-link selected"
            const selector = 'a.btn-link.selected';
            const countText = $(selector).text().trim();

            if (countText) {
                // For example, countText might be "689 Repositories"
                const [rawCount] = countText.split(' ');
                const dependentsCount = parseInt(rawCount.replace(/,/g, ''), 10);
                if (!isNaN(dependentsCount)) {
                    return dependentsCount;
                } else {
                    console.error('Extracted text is not a valid number:', countText);
                    await sendDiscordNotification('⚠️ Failed to parse dependents count from GitHub. Extracted text is not a valid number.');
                    return null;
                }
            } else {
                console.error('CSS selector did not match any content.');
                await sendDiscordNotification('⚠️ Failed to fetch dependents count from GitHub. CSS selector did not match any content.');
                return null;
            }
        } catch (error) {
            console.error('Error fetching dependents count using Cheerio:', error.message);
            await sendDiscordNotification('⚠️ Failed to fetch dependents count from GitHub. Error: ' + error.message);
            return null;
        }
    }

    const fetchedDependentsCount = await fetchDependentsCount();
    let finalDependentsCount;
    if (fetchedDependentsCount !== null) {
        console.log('Fetched Dependents Count:', fetchedDependentsCount);
        finalDependentsCount = fetchedDependentsCount;
        // Update the file with the new count and timestamp
        coreInReposData = {
            last_updated: new Date().toISOString(),
            core_in_repositories: fetchedDependentsCount
        };

        // Ensure the directory exists before writing the file.
        const dir = path.dirname(coreInReposPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(coreInReposPath, JSON.stringify(coreInReposData, null, 2), 'utf8');
    } else {
        console.log('Using fallback value from file for Dependents Count:', coreInReposData.core_in_repositories);
        finalDependentsCount = coreInReposData.core_in_repositories;
    }

    console.log('\nFetching NPM statistics...');
    const currentDate = new Date();
    const lastDay = new Date(currentDate);
    lastDay.setDate(lastDay.getDate() - 1);

    // Calculate last week using proper week boundaries (Monday to Sunday)
    const lastWeek = new Date(currentDate);
    lastWeek.setDate(lastWeek.getDate() - 7);
    const lastWeekStart = new Date(lastWeek);
    lastWeekStart.setDate(lastWeekStart.getDate() - lastWeekStart.getDay() + 1); // Set to Monday
    const lastWeekEnd = new Date(lastWeekStart);
    lastWeekEnd.setDate(lastWeekEnd.getDate() + 6); // Set to Sunday

    // Calculate last month using calendar month boundaries
    const lastMonth = new Date(currentDate);
    lastMonth.setMonth(lastMonth.getMonth() - 1);
    const lastMonthStart = new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1);
    const lastMonthEnd = new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0);

    // Calculate last year using calendar year boundaries
    const lastYear = new Date(currentDate);
    lastYear.setFullYear(lastYear.getFullYear() - 1);
    const lastYearStart = new Date(lastYear.getFullYear(), 0, 1); // January 1st of last year
    const lastYearEnd = new Date(lastYear.getFullYear(), 11, 31); // December 31st of last year

    const formatDate = date => date.toISOString().split('T')[0];
    const getDownloads = async (startDate, endDate) => {
        const response = await axios.get(
            `https://api.npmjs.org/downloads/point/${startDate}:${endDate}/@meshsdk/core`
        );
        return response.data.downloads;
    };

    const lastDayDownloads = await getDownloads(formatDate(lastDay), formatDate(currentDate));
    const lastWeekDownloads = await getDownloads(formatDate(lastWeekStart), formatDate(lastWeekEnd));
    const lastMonthDownloads = await getDownloads(formatDate(lastMonthStart), formatDate(lastMonthEnd));
    const lastYearDownloads = await getDownloads(formatDate(lastYearStart), formatDate(lastYearEnd));

    const corePackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core');
    const reactPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/react');
    const transactionPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/transaction');
    const walletPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/wallet');
    const providerPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/provider');
    const coreCslPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core-csl');
    const coreCstPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core-cst');

    console.log('NPM Downloads:');
    console.log('- Last 24 Hours:', lastDayDownloads);
    console.log('- Last Week:', lastWeekDownloads);
    console.log('- Last Month:', lastMonthDownloads);
    console.log('- Last Year:', lastYearDownloads);
    console.log('- Core Package Last Year:', corePackageDownloads.data.downloads);
    console.log('- React Package Last Year:', reactPackageDownloads.data.downloads);
    console.log('- Transaction Package Last Year:', transactionPackageDownloads.data.downloads);
    console.log('- Wallet Package Last Year:', walletPackageDownloads.data.downloads);
    console.log('- Provider Package Last Year:', providerPackageDownloads.data.downloads);
    console.log('- Core CSL Package Last Year:', coreCslPackageDownloads.data.downloads);
    console.log('- Core CST Package Last Year:', coreCstPackageDownloads.data.downloads);

    // Get package version info
    const packageInfo = await axios.get('https://registry.npmjs.org/@meshsdk/core');
    const latestVersion = packageInfo.data['dist-tags'].latest;
    console.log('Latest Version:', latestVersion);

    // Get dependents count from the npm registry (separate from the scraped value)
    const dependentsResponse = await axios.get(
        'https://registry.npmjs.org/-/v1/search',
        {
            params: { text: 'dependencies:@meshsdk/core', size: 1 }
        }
    );
    console.log('Total Dependents from npm:', dependentsResponse.data.total);

    // Create npm-stat URLs
    const currentDateStr = currentDate.toISOString().split('T')[0];
    const oneYearAgo = new Date(currentDate);
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    const npmStatUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core&from=${oneYearAgoStr}&to=${currentDateStr}`;
    const npmStatCompareUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core,@meshsdk/react&from=${oneYearAgoStr}&to=${currentDateStr}`;

    return {
        github: {
            core_in_package_json: finalDependentsCount,
            core_in_any_file: coreAnyFileResponse.data.total_count,
            core_in_repositories: finalDependentsCount
        },
        npm: {
            downloads: {
                last_day: lastDayDownloads,
                last_week: lastWeekDownloads,
                last_month: lastMonthDownloads,
                last_year: lastYearDownloads,
                core_package_last_12_months: corePackageDownloads.data.downloads
            },
            react_package_downloads: reactPackageDownloads.data.downloads,
            transaction_package_downloads: transactionPackageDownloads.data.downloads,
            wallet_package_downloads: walletPackageDownloads.data.downloads,
            provider_package_downloads: providerPackageDownloads.data.downloads,
            core_csl_package_downloads: coreCslPackageDownloads.data.downloads,
            core_cst_package_downloads: coreCstPackageDownloads.data.downloads,
            latest_version: latestVersion,
            dependents_count: dependentsResponse.data.total
        },
        urls: {
            npm_stat_url: npmStatUrl,
            npm_stat_compare_url: npmStatCompareUrl
        }
    };
}

export async function fetchMeshContributors(githubToken) {
    console.log('\nFetching repository contributors...');
    const reposResponse = await axios.get('https://api.github.com/orgs/MeshJS/repos', {
        headers: {
            'Accept': 'application/vnd.github.v3+json',
            'Authorization': `token ${githubToken}`
        }
    });

    const contributorsMap = new Map();
    for (const repo of reposResponse.data) {
        console.log(`Fetching contributors for ${repo.name}...`);
        try {
            const contributorsResponse = await axios.get(`https://api.github.com/repos/MeshJS/${repo.name}/contributors`, {
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${githubToken}`
                }
            });
            contributorsResponse.data.forEach(contributor => {
                if (!contributorsMap.has(contributor.login)) {
                    contributorsMap.set(contributor.login, {
                        login: contributor.login,
                        avatar_url: contributor.avatar_url,
                        contributions: contributor.contributions,
                        repositories: [{ name: repo.name, contributions: contributor.contributions }]
                    });
                } else {
                    const existingContributor = contributorsMap.get(contributor.login);
                    existingContributor.contributions += contributor.contributions;
                    existingContributor.repositories.push({
                        name: repo.name,
                        contributions: contributor.contributions
                    });
                }
            });
        } catch (error) {
            console.error(`Error fetching contributors for ${repo.name}:`, error.message);
        }
    }
    const contributors = Array.from(contributorsMap.values())
        .sort((a, b) => b.contributions - a.contributions);
    contributors.forEach(contributor => {
        contributor.repositories.sort((a, b) => b.contributions - a.contributions);
    });
    return { unique_count: contributors.length, contributors };
}
