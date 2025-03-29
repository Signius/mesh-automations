import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchMeshStats(githubToken) {
    console.log('Fetching GitHub statistics...');

    // Helper function to handle rate limits and retries
    async function fetchWithRetry(url, params, maxRetries = 3) {
        let retries = 0;
        while (retries < maxRetries) {
            try {
                const response = await axios.get(url, {
                    params,
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${githubToken}`
                    }
                });

                // Check rate limit headers
                const remaining = parseInt(response.headers['x-ratelimit-remaining']);
                const reset = parseInt(response.headers['x-ratelimit-reset']);

                if (remaining < 10) {
                    const waitTime = (reset - Math.floor(Date.now() / 1000)) * 1000;
                    console.log(`Rate limit low (${remaining} remaining). Waiting ${Math.ceil(waitTime / 1000)} seconds...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                }

                return response;
            } catch (error) {
                if (error.response?.status === 403 && retries < maxRetries - 1) {
                    const reset = parseInt(error.response.headers['x-ratelimit-reset']);
                    const waitTime = (reset - Math.floor(Date.now() / 1000)) * 1000;
                    console.log(`Rate limit exceeded. Waiting ${Math.ceil(waitTime / 1000)} seconds before retry...`);
                    await new Promise(resolve => setTimeout(resolve, waitTime));
                    retries++;
                    continue;
                }
                throw error;
            }
        }
    }

    // Helper function to fetch all pages of results
    async function fetchAllPages(url, params) {
        let allItems = [];
        let page = 1;
        let hasMore = true;
        let lastResponse;

        while (hasMore) {
            console.log(`Fetching page ${page}...`);
            lastResponse = await fetchWithRetry(url, {
                ...params,
                page,
                per_page: 100
            });

            allItems = allItems.concat(lastResponse.data.items);

            // Check if there are more pages
            if (lastResponse.data.items.length < 100) {
                hasMore = false;
            } else {
                page++;
                // Add a longer delay between pages to respect rate limits
                await new Promise(resolve => setTimeout(resolve, 2000));
            }
        }

        return {
            items: allItems,
            total_count: lastResponse.data.total_count
        };
    }

    // Search for @meshsdk/core in package.json
    console.log('Fetching package.json results...');
    const corePackageJsonResponse = await fetchAllPages(
        'https://api.github.com/search/code',
        {
            q: '"@meshsdk/core" in:file filename:package.json'
        }
    );
    console.log('GitHub package.json count:', corePackageJsonResponse.total_count);

    // Extract unique repository owners from the search results
    const uniqueOwners = new Set(corePackageJsonResponse.items.map(item => item.repository.owner.login));
    console.log('Unique repository owners:', uniqueOwners.size);

    // Search for @meshsdk/core in any file
    console.log('Fetching general search results...');
    const coreAnyFileResponse = await fetchAllPages(
        'https://api.github.com/search/code',
        {
            q: '"@meshsdk/core"'
        }
    );
    console.log('GitHub total mentions:', coreAnyFileResponse.total_count);

    // Extract unique repository owners from the general search results
    const uniqueOwnersGeneral = new Set(coreAnyFileResponse.items.map(item => item.repository.owner.login));
    console.log('Unique repository owners (general search):', uniqueOwnersGeneral.size);

    console.log('\nFetching NPM statistics...');
    // Get npm download stats
    const lastDay = await axios.get('https://api.npmjs.org/downloads/point/last-day/@meshsdk/core');
    const lastWeek = await axios.get('https://api.npmjs.org/downloads/point/last-week/@meshsdk/core');
    const lastMonth = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/core');
    const lastYear = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core');
    const reactPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/react');

    console.log('NPM Downloads:');
    console.log('- Last 24 Hours:', lastDay.data.downloads);
    console.log('- Last Week:', lastWeek.data.downloads);
    console.log('- Last Month:', lastMonth.data.downloads);
    console.log('- Last Year:', lastYear.data.downloads);
    console.log('- React Package Monthly:', reactPackageDownloads.data.downloads);

    // Get package version info
    const packageInfo = await axios.get('https://registry.npmjs.org/@meshsdk/core');
    const latestVersion = packageInfo.data['dist-tags'].latest;
    console.log('Latest Version:', latestVersion);

    // Get dependents count
    const dependentsResponse = await axios.get(
        'https://registry.npmjs.org/-/v1/search',
        {
            params: {
                text: 'dependencies:@meshsdk/core',
                size: 1
            }
        }
    );
    console.log('Total Dependents:', dependentsResponse.data.total);

    // Create npm-stat URLs
    const currentDate = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    const npmStatUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core&from=${oneYearAgoStr}&to=${currentDate}`;
    const npmStatCompareUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core,@meshsdk/react&from=${oneYearAgoStr}&to=${currentDate}`;

    const stats = {
        github: {
            core_in_package_json: corePackageJsonResponse.total_count,
            core_in_any_file: coreAnyFileResponse.total_count,
            unique_package_json_owners: uniqueOwners.size,
            unique_general_owners: uniqueOwnersGeneral.size
        },
        npm: {
            downloads: {
                last_day: lastDay.data.downloads,
                last_week: lastWeek.data.downloads,
                last_month: lastMonth.data.downloads,
                last_year: lastYear.data.downloads
            },
            react_package_downloads: reactPackageDownloads.data.downloads,
            latest_version: latestVersion,
            dependents_count: dependentsResponse.data.total
        },
        urls: {
            npm_stat_url: npmStatUrl,
            npm_stat_compare_url: npmStatCompareUrl
        }
    };

    console.log('\nGenerated Stats Object:');
    console.log(JSON.stringify(stats, null, 2));

    return stats;
}

async function fetchMeshContributors(githubToken) {
    console.log('\nFetching repository contributors...');

    // First get all repositories from MeshJS organization
    const reposResponse = await axios.get(
        'https://api.github.com/orgs/MeshJS/repos',
        {
            headers: {
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
            }
        }
    );

    const contributorsData = {};
    const uniqueContributors = new Set();

    for (const repo of reposResponse.data) {
        console.log(`Fetching contributors for ${repo.name}...`);

        try {
            const contributorsResponse = await axios.get(
                `https://api.github.com/repos/MeshJS/${repo.name}/contributors`,
                {
                    headers: {
                        'Accept': 'application/vnd.github.v3+json',
                        'Authorization': `token ${githubToken}`
                    }
                }
            );

            contributorsData[repo.name] = contributorsResponse.data.map(contributor => ({
                login: contributor.login,
                contributions: contributor.contributions,
                avatar_url: contributor.avatar_url
            }));

            // Add to unique contributors set
            contributorsResponse.data.forEach(contributor => {
                uniqueContributors.add(contributor.login);
            });
        } catch (error) {
            console.error(`Error fetching contributors for ${repo.name}:`, error.message);
            contributorsData[repo.name] = [];
        }
    }

    return {
        by_repository: contributorsData,
        unique_count: uniqueContributors.size,
        unique_contributors: Array.from(uniqueContributors)
    };
}

function generateMarkdown(stats) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const markdown = `# Mesh SDK Usage Statistics
Last updated: ${currentDate}

## GitHub Usage
| ${'▪️'.repeat(8)} Metric ${'▪️'.repeat(8)} | ${'▪️'.repeat(5)} Value ${'▪️'.repeat(5)} |
|:---------|:------|
| Projects using @meshsdk/core in package.json | ${stats.github.core_in_package_json} |
| Unique repositories using @meshsdk/core | ${stats.github.unique_package_json_owners} |
| Total mentions of @meshsdk/core | ${stats.github.core_in_any_file} |
| Unique repositories mentioning @meshsdk/core | ${stats.github.unique_general_owners} |

## NPM Statistics
| ${'▪️'.repeat(8)} Metric ${'▪️'.repeat(8)} | ${'▪️'.repeat(5)} Value ${'▪️'.repeat(5)} |
|:-----------|:----------|
| Latest Version | ${stats.npm.latest_version} |
| Total Dependents | ${stats.npm.dependents_count} |
| @meshsdk/core Monthly Downloads | ${stats.npm.downloads.last_month} |
| @meshsdk/react Monthly Downloads | ${stats.npm.react_package_downloads} |

## Download Statistics for @meshsdk/core
| ${'▪️'.repeat(8)} Metric ${'▪️'.repeat(8)} | ${'▪️'.repeat(5)} Value ${'▪️'.repeat(5)} |
|:-----------|:-------------|
| Last 24 Hours | ${stats.npm.downloads.last_day} |
| Last Week | ${stats.npm.downloads.last_week} |
| Last Month | ${stats.npm.downloads.last_month} |
| Last Year | ${stats.npm.downloads.last_year} |

## Contributor Statistics
| ${'▪️'.repeat(8)} Metric ${'▪️'.repeat(8)} | ${'▪️'.repeat(5)} Value ${'▪️'.repeat(5)} |
|:-----------|:-------------|
| Total Unique Contributors | ${stats.contributors.unique_count} |

## Useful Links
- [NPM Stats Chart](${stats.urls.npm_stat_url})
- [NPM Stats Comparison](${stats.urls.npm_stat_compare_url})
`;

    console.log('\nGenerated Markdown:');
    console.log(markdown);

    return markdown;
}

async function main() {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    try {
        console.log('Starting Mesh SDK Stats Generation...\n');
        const [stats, contributors] = await Promise.all([
            fetchMeshStats(githubToken),
            fetchMeshContributors(githubToken)
        ]);

        // Combine stats and contributors data
        const combinedStats = {
            ...stats,
            contributors
        };

        // Save JSON data
        fs.writeFileSync('mesh_stats.json', JSON.stringify(combinedStats, null, 2));
        console.log('\nSaved mesh_stats.json');

        // Generate and save markdown
        const markdown = generateMarkdown(combinedStats);
        const markdownPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', '2001.md');
        fs.writeFileSync(markdownPath, markdown);
        console.log(`Saved markdown to ${markdownPath}`);

        console.log('\nStats generated successfully!');
    } catch (error) {
        console.error('Error generating stats:', error);
        process.exit(1);
    }
}

main(); 