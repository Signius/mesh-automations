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

function generateMarkdown(stats) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    const markdown = `# Mesh SDK Usage Statistics
Last updated: ${currentDate}

## GitHub Usage
| Metric | Count |
|--------|-------|
| Projects using @meshsdk/core in package.json | ${stats.github.core_in_package_json} |
| Total mentions of @meshsdk/core | ${stats.github.core_in_any_file} |

## NPM Statistics
| Metric | Value |
|--------|-------|
| Latest Version | ${stats.npm.latest_version} |
| Total Dependents | ${stats.npm.dependents_count} |
| @meshsdk/react Monthly Downloads | ${stats.npm.react_package_downloads} |

## Download Statistics
| Period | Downloads |
|--------|-----------|
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
        const stats = await fetchMeshStats(githubToken);

        // Save JSON data
        fs.writeFileSync('mesh_stats.json', JSON.stringify(stats, null, 2));
        console.log('\nSaved mesh_stats.json');

        // Generate and save markdown
        const markdown = generateMarkdown(stats);
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