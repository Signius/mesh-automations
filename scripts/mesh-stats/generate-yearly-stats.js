import axios from 'axios';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { generateYearlyStatsJson, saveStatsJson } from './generate-yearly-mesh-stats-json.js';

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

    // Read core_in_repositories data from file (fallback value)
    const coreInReposPath = path.join('mesh-gov-updates', 'mesh-stats', 'core-in-repositories.json');
    let coreInReposData = { last_updated: '', core_in_repositories: 0 };
    if (fs.existsSync(coreInReposPath)) {
        coreInReposData = JSON.parse(fs.readFileSync(coreInReposPath, 'utf8'));
    }

    return {
        core_in_package_json: corePackageJsonResponse.data.total_count,
        core_in_any_file: coreAnyFileResponse.data.total_count,
        core_in_repositories: coreInReposData.core_in_repositories
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

async function loadPreviousStats(year) {
    try {
        const statsPath = path.join('mesh-gov-updates', 'mesh-stats', `mesh-yearly-stats-${year}.json`);
        console.log(`Attempting to load previous stats from: ${statsPath}`);

        if (fs.existsSync(statsPath)) {
            console.log(`Found existing stats file for ${year}`);
            const content = fs.readFileSync(statsPath, 'utf8');
            return JSON.parse(content);
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
                const currentMonthStats = monthlyGitHubStats[currentMonthName] || {
                    core_in_package_json: 0,
                    core_in_any_file: 0,
                    core_in_repositories: 0
                };
                console.log(`Current month stats before update:`, currentMonthStats);
                console.log(`New GitHub stats:`, currentGitHubStats);

                // Only update if it's the current month
                if (currentMonth === new Date().getMonth()) {
                    if (currentGitHubStats.core_in_package_json > currentMonthStats.core_in_package_json ||
                        currentGitHubStats.core_in_any_file > currentMonthStats.core_in_any_file ||
                        currentGitHubStats.core_in_repositories > currentMonthStats.core_in_repositories) {
                        console.log(`Updating current month stats for ${currentMonthName} as new numbers are higher`);
                        monthlyGitHubStats[currentMonthName] = {
                            ...currentMonthStats,
                            core_in_package_json: currentGitHubStats.core_in_package_json,
                            core_in_any_file: currentGitHubStats.core_in_any_file,
                            core_in_repositories: currentGitHubStats.core_in_repositories
                        };
                    }
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

            // Generate and save JSON stats
            const statsData = generateYearlyStatsJson(year, monthlyDownloads, monthlyGitHubStats);
            saveStatsJson(statsData);
        }

        console.log('\nYearly stats generated successfully!');
    } catch (error) {
        console.error('Error generating yearly stats:', error);
        process.exit(1);
    }
}

main();
