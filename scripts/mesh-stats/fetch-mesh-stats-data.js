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
            // Fetch commits contributors
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
                        pull_requests: 0,
                        repositories: [{
                            name: repo.name,
                            contributions: contributor.contributions,
                            pull_requests: 0
                        }]
                    });
                } else {
                    const existingContributor = contributorsMap.get(contributor.login);
                    existingContributor.contributions += contributor.contributions;

                    // Check if contributor already has this repository
                    const existingRepo = existingContributor.repositories.find(r => r.name === repo.name);
                    if (existingRepo) {
                        existingRepo.contributions += contributor.contributions;
                    } else {
                        existingContributor.repositories.push({
                            name: repo.name,
                            contributions: contributor.contributions,
                            pull_requests: 0
                        });
                    }
                }
            });

            // Fetch pull requests for this repo
            console.log(`Fetching pull requests for ${repo.name}...`);
            let page = 1;
            let pullsData = [];
            let hasMorePulls = true;

            // First get open PRs
            while (hasMorePulls) {
                try {
                    const pullsResponse = await axios.get(
                        `https://api.github.com/repos/MeshJS/${repo.name}/pulls`,
                        {
                            params: {
                                state: 'all',  // Get all PRs: open, closed, and merged
                                per_page: 100,
                                page: page
                            },
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Authorization': `token ${githubToken}`
                            }
                        }
                    );

                    if (pullsResponse.data.length === 0) {
                        hasMorePulls = false;
                    } else {
                        console.log(`  - Found ${pullsResponse.data.length} PRs on page ${page}`);
                        pullsData = pullsData.concat(pullsResponse.data);
                        page++;
                    }
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.warn(`Repository ${repo.name} might be private or not exist. Skipping regular PRs.`);
                    } else if (error.response && error.response.status === 403) {
                        console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping regular PRs.`);
                    } else {
                        console.error(`Error fetching PRs for ${repo.name} page ${page}:`, error.message);
                    }
                    hasMorePulls = false;
                }
            }

            // Also try the issues endpoint which can sometimes catch PRs missed by the pulls endpoint
            console.log(`Fetching PRs via issues endpoint for ${repo.name}...`);
            page = 1;
            hasMorePulls = true;

            while (hasMorePulls) {
                try {
                    // Use the issues endpoint which also lists PRs
                    const issuesResponse = await axios.get(
                        `https://api.github.com/repos/MeshJS/${repo.name}/issues`,
                        {
                            params: {
                                state: 'all',
                                filter: 'all',
                                per_page: 100,
                                page: page
                            },
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Authorization': `token ${githubToken}`
                            }
                        }
                    );

                    if (issuesResponse.data.length === 0) {
                        hasMorePulls = false;
                    } else {
                        // Filter to only include pull requests from issues
                        const prsFromIssues = issuesResponse.data.filter(issue => issue.pull_request);
                        console.log(`  - Found ${prsFromIssues.length} PRs from issues on page ${page}`);

                        if (prsFromIssues.length > 0) {
                            // For each PR from issues, fetch full PR data to get required info
                            for (const prIssue of prsFromIssues) {
                                try {
                                    const pullUrl = prIssue.pull_request.url;
                                    const fullPrResponse = await axios.get(
                                        pullUrl,
                                        {
                                            headers: {
                                                'Accept': 'application/vnd.github.v3+json',
                                                'Authorization': `token ${githubToken}`
                                            }
                                        }
                                    );

                                    // Check if we already have this PR and add it if not
                                    const existingPrNumbers = new Set(pullsData.map(pr => pr.number));
                                    if (!existingPrNumbers.has(fullPrResponse.data.number)) {
                                        pullsData.push(fullPrResponse.data);
                                        console.log(`  - Added PR #${fullPrResponse.data.number} by ${fullPrResponse.data.user?.login || 'unknown'}`);
                                    }
                                } catch (error) {
                                    console.error(`Error fetching full PR data for issue #${prIssue.number}:`, error.message);
                                }
                            }
                        }

                        page++;
                    }
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.warn(`Repository ${repo.name} might be private or not exist. Skipping issues PRs.`);
                    } else if (error.response && error.response.status === 403) {
                        console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping issues PRs.`);
                    } else {
                        console.error(`Error fetching issues/PRs for ${repo.name} page ${page}:`, error.message);
                    }
                    hasMorePulls = false;
                }
            }

            console.log(`Total PRs found for ${repo.name}: ${pullsData.length}`);

            // Log PR authors for debugging
            const prAuthors = pullsData.map(pr => pr.user?.login).filter(Boolean);
            const prAuthorsCount = {};
            prAuthors.forEach(author => {
                prAuthorsCount[author] = (prAuthorsCount[author] || 0) + 1;
            });
            console.log(`PR authors for ${repo.name}:`, prAuthorsCount);

            // Count PRs by user
            pullsData.forEach(pr => {
                if (!pr.user || !pr.user.login) return;

                const login = pr.user.login;
                if (!contributorsMap.has(login)) {
                    // If this user isn't a commit contributor yet, add them
                    contributorsMap.set(login, {
                        login: login,
                        avatar_url: pr.user.avatar_url,
                        contributions: 0,
                        pull_requests: 1,
                        repositories: [{
                            name: repo.name,
                            contributions: 0,
                            pull_requests: 1
                        }]
                    });
                } else {
                    // User exists, increment PR count
                    const contributor = contributorsMap.get(login);
                    contributor.pull_requests += 1;

                    // Find or create repository entry
                    const repoEntry = contributor.repositories.find(r => r.name === repo.name);
                    if (repoEntry) {
                        repoEntry.pull_requests += 1;
                    } else {
                        contributor.repositories.push({
                            name: repo.name,
                            contributions: 0,
                            pull_requests: 1
                        });
                    }
                }
            });

            // Also fetch merged PRs specifically to ensure we don't miss any
            console.log(`Fetching merged pull requests for ${repo.name}...`);
            page = 1;
            hasMorePulls = true;

            while (hasMorePulls) {
                try {
                    const mergedPullsResponse = await axios.get(
                        `https://api.github.com/repos/MeshJS/${repo.name}/pulls`,
                        {
                            params: {
                                state: 'closed',
                                per_page: 100,
                                page: page
                            },
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Authorization': `token ${githubToken}`
                            }
                        }
                    );

                    if (mergedPullsResponse.data.length === 0) {
                        hasMorePulls = false;
                    } else {
                        // Filter to only include merged PRs, not just closed ones
                        const mergedPRs = mergedPullsResponse.data.filter(pr => pr.merged_at !== null);
                        console.log(`  - Found ${mergedPRs.length} merged PRs on page ${page}`);

                        // Add only PRs that aren't already in pullsData
                        const existingPrNumbers = new Set(pullsData.map(pr => pr.number));
                        const newMergedPRs = mergedPRs.filter(pr => !existingPrNumbers.has(pr.number));

                        if (newMergedPRs.length > 0) {
                            console.log(`  - Adding ${newMergedPRs.length} new merged PRs`);
                            pullsData = pullsData.concat(newMergedPRs);
                        }

                        page++;
                    }
                } catch (error) {
                    if (error.response && error.response.status === 404) {
                        console.warn(`Repository ${repo.name} might be private or not exist. Skipping merged PRs.`);
                    } else if (error.response && error.response.status === 403) {
                        console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping merged PRs.`);
                    } else {
                        console.error(`Error fetching merged PRs for ${repo.name} page ${page}:`, error.message);
                    }
                    hasMorePulls = false;
                }
            }
        } catch (error) {
            console.error(`Error fetching data for ${repo.name}:`, error.message);
        }
    }

    // Convert to array and sort
    const contributors = Array.from(contributorsMap.values())
        .sort((a, b) => {
            // Primary sort by total contributions
            const totalA = a.contributions + a.pull_requests;
            const totalB = b.contributions + b.pull_requests;
            return totalB - totalA;
        });

    // Sort repositories for each contributor
    contributors.forEach(contributor => {
        contributor.repositories.sort((a, b) => {
            const totalA = a.contributions + a.pull_requests;
            const totalB = b.contributions + b.pull_requests;
            return totalB - totalA;
        });
    });

    return {
        unique_count: contributors.length,
        contributors,
        total_pull_requests: contributors.reduce((sum, c) => sum + c.pull_requests, 0),
        total_commits: contributors.reduce((sum, c) => sum + c.contributions, 0),
        total_contributions: contributors.reduce((sum, c) => sum + c.contributions + c.pull_requests, 0)
    };
}
