import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function fetchMeshStats(githubToken) {
    console.log('Fetching GitHub statistics...');
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
    console.log('GitHub package.json count:', corePackageJsonResponse.data.total_count);

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
    console.log('GitHub total mentions:', coreAnyFileResponse.data.total_count);

    console.log('\nFetching NPM statistics...');
    // Get npm download stats
    const lastDay = await axios.get('https://api.npmjs.org/downloads/point/last-day/@meshsdk/core');
    const lastWeek = await axios.get('https://api.npmjs.org/downloads/point/last-week/@meshsdk/core');
    const lastMonth = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/core');
    const lastYear = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core');
    const reactPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/react');
    const transactionPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/transaction');
    const walletPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/wallet');
    const providerPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/provider');
    const coreCslPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/core-csl');
    const coreCstPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/core-cst');

    console.log('NPM Downloads:');
    console.log('- Last 24 Hours:', lastDay.data.downloads);
    console.log('- Last Week:', lastWeek.data.downloads);
    console.log('- Last Month:', lastMonth.data.downloads);
    console.log('- Last Year:', lastYear.data.downloads);
    console.log('- React Package Monthly:', reactPackageDownloads.data.downloads);
    console.log('- Transaction Package Monthly:', transactionPackageDownloads.data.downloads);
    console.log('- Wallet Package Monthly:', walletPackageDownloads.data.downloads);
    console.log('- Provider Package Monthly:', providerPackageDownloads.data.downloads);
    console.log('- Core CSL Package Monthly:', coreCslPackageDownloads.data.downloads);
    console.log('- Core CST Package Monthly:', coreCstPackageDownloads.data.downloads);

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
            core_in_package_json: corePackageJsonResponse.data.total_count,
            core_in_any_file: coreAnyFileResponse.data.total_count
        },
        npm: {
            downloads: {
                last_day: lastDay.data.downloads,
                last_week: lastWeek.data.downloads,
                last_month: lastMonth.data.downloads,
                last_year: lastYear.data.downloads
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

## GitHub Organization Contributor Statistics
| Metric${'&nbsp;'.repeat(78)} |   Value |
| :---------------------------------------- | ------: |
| Total Unique Contributors in MeshJS        | ${stats.contributors.unique_count} |

## GitHub Usage
| Repository Metric${'&nbsp;'.repeat(58)} |   Count |
| :---------------------------------------- | ------: |
| Public Projects using @meshsdk/core in package.json | ${stats.github.core_in_package_json} |
| Public Files containing @meshsdk/core references | ${stats.github.core_in_any_file} |

## Monthly NPM Package Downloads
| Package${'&nbsp;'.repeat(50)} |   Monthly Downloads |
| :---------------------------------------- | -----------------: |
| @meshsdk/core | ${stats.npm.downloads.last_month} |
| @meshsdk/react | ${stats.npm.react_package_downloads} |
| @meshsdk/transaction | ${stats.npm.transaction_package_downloads} |
| @meshsdk/wallet | ${stats.npm.wallet_package_downloads} |
| @meshsdk/provider | ${stats.npm.provider_package_downloads} |
| @meshsdk/core-csl | ${stats.npm.core_csl_package_downloads} |
| @meshsdk/core-cst | ${stats.npm.core_cst_package_downloads} |

## Download Statistics for @meshsdk/core
| Time Period${'&nbsp;'.repeat(49)} |   Download Count |
| :---------------------------------------- | --------------: |
| Last 24 Hours | ${stats.npm.downloads.last_day} |
| Last Week | ${stats.npm.downloads.last_week} |
| Last Month | ${stats.npm.downloads.last_month} |
| Last Year | ${stats.npm.downloads.last_year} |

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