const axios = require('axios');
const fs = require('fs');
const path = require('path');

async function fetchMeshStats(githubToken) {
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

    // Get npm download stats
    const lastDay = await axios.get('https://api.npmjs.org/downloads/point/last-day/@meshsdk/core');
    const lastWeek = await axios.get('https://api.npmjs.org/downloads/point/last-week/@meshsdk/core');
    const lastMonth = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/core');
    const lastYear = await axios.get('https://api.npmjs.org/downloads/point/last-year/@meshsdk/core');
    const reactPackageDownloads = await axios.get('https://api.npmjs.org/downloads/point/last-month/@meshsdk/react');

    // Get package version info
    const packageInfo = await axios.get('https://registry.npmjs.org/@meshsdk/core');
    const latestVersion = packageInfo.data['dist-tags'].latest;

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

    // Create npm-stat URLs
    const currentDate = new Date().toISOString().split('T')[0];
    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    const oneYearAgoStr = oneYearAgo.toISOString().split('T')[0];

    const npmStatUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core&from=${oneYearAgoStr}&to=${currentDate}`;
    const npmStatCompareUrl = `https://npm-stat.com/charts.html?package=@meshsdk/core,@meshsdk/react&from=${oneYearAgoStr}&to=${currentDate}`;

    // Get weekly trend data
    const weeklyTrendResponse = await axios.get(
        `https://api.npmjs.org/downloads/range/${oneYearAgoStr}:${currentDate}/@meshsdk/core`
    );
    const weeklyDownloads = weeklyTrendResponse.data.downloads.reduce((sum, day) => sum + day.downloads, 0);

    return {
        github: {
            core_in_package_json: corePackageJsonResponse.data.total_count,
            core_in_any_file: coreAnyFileResponse.data.total_count
        },
        npm: {
            downloads: {
                last_day: lastDay.data.downloads,
                last_week: lastWeek.data.downloads,
                last_month: lastMonth.data.downloads,
                last_year: lastYear.data.downloads,
                weekly_sum: weeklyDownloads
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
}

function generateMarkdown(stats) {
    const currentDate = new Date().toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });

    return `# Mesh SDK Usage Statistics
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
| Weekly Sum | ${stats.npm.downloads.weekly_sum} |

## Useful Links
- [NPM Stats Chart](${stats.urls.npm_stat_url})
- [NPM Stats Comparison](${stats.urls.npm_stat_compare_url})
`;
}

async function main() {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    try {
        const stats = await fetchMeshStats(githubToken);

        // Save JSON data
        fs.writeFileSync('mesh_stats.json', JSON.stringify(stats, null, 2));

        // Generate and save markdown
        const markdown = generateMarkdown(stats);
        const markdownPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', '2001.md');
        fs.writeFileSync(markdownPath, markdown);

        console.log('Stats generated successfully!');
    } catch (error) {
        console.error('Error generating stats:', error);
        process.exit(1);
    }
}

main(); 