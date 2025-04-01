import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { BigQuery } from '@google-cloud/bigquery';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read credentials from env variable and create a BigQuery client.
if (!process.env.GOOGLE_CREDENTIALS_JSON) {
  console.error('GOOGLE_CREDENTIALS_JSON environment variable is required');
  process.exit(1);
}

const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS_JSON);
const bigquery = new BigQuery({
  credentials,
  projectId: credentials.project_id,
});

/**
 * Fetch current GitHub stats via GitHub API.
 */
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

/**
 * Fetch monthly npm download stats.
 */
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

/**
 * Generate Markdown report.
 */
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

| Month | Downloads | Trend |
|-------|-----------|-------|
${monthlyDownloads.core.map(m => {
    const trend = m.downloads === maxDownloads ? '🔥' :
      m.downloads > monthlyDownloads.core[m.month - 2]?.downloads ? '📈' :
        m.downloads < monthlyDownloads.core[m.month - 2]?.downloads ? '📉' : '➡️';
    return `| ${monthNames[m.month - 1]} | ${m.downloads.toLocaleString()} | ${trend} |`;
  }).join('\n')}

**Peak Month**: ${maxMonthName} with ${maxDownloads.toLocaleString()} downloads

## 📦 Yearly Package Download Totals

| Package | Total Downloads | Status |
|---------|----------------|---------|
| @meshsdk/core | ${yearlyTotals.core.toLocaleString()} | ${yearlyTotals.core > 50000 ? '🌟' : '⭐'} |
| @meshsdk/react | ${yearlyTotals.react.toLocaleString()} | ${yearlyTotals.react > 50000 ? '🌟' : '⭐'} |
| @meshsdk/transaction | ${yearlyTotals.transaction.toLocaleString()} | ${yearlyTotals.transaction > 50000 ? '🌟' : '⭐'} |
| @meshsdk/wallet | ${yearlyTotals.wallet.toLocaleString()} | ${yearlyTotals.wallet > 50000 ? '🌟' : '⭐'} |
| @meshsdk/provider | ${yearlyTotals.provider.toLocaleString()} | ${yearlyTotals.provider > 50000 ? '🌟' : '⭐'} |
| @meshsdk/core-csl | ${yearlyTotals.coreCsl.toLocaleString()} | ${yearlyTotals.coreCsl > 50000 ? '🌟' : '⭐'} |
| @meshsdk/core-cst | ${yearlyTotals.coreCst.toLocaleString()} | ${yearlyTotals.coreCst > 50000 ? '🌟' : '⭐'} |

## 🔍 GitHub Usage Statistics

| Month | Projects | Files |
|-------|----------|-------|
${monthNames.map((month, index) => {
    const monthStats = githubStats[month] || { core_in_package_json: 0, core_in_any_file: 0 };
    return `| ${month} | ${monthStats.core_in_package_json.toLocaleString()} | ${monthStats.core_in_any_file.toLocaleString()} |`;
  }).join('\n')}`;

  return markdown;
}

/**
 * Load previously saved stats from markdown.
 */
async function loadPreviousStats(year) {
  try {
    const statsPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', `${year}.md`);
    if (fs.existsSync(statsPath)) {
      const content = fs.readFileSync(statsPath, 'utf8');
      // Extract GitHub stats from the markdown
      const githubStatsMatch = content.match(/## 🔍 GitHub Usage Statistics\n\n\| Month \| Projects \| Files \|\n\|-------\|----------\|-------\|\n([\s\S]*?)(?=\n\n|$)/);

      if (githubStatsMatch) {
        const rows = githubStatsMatch[1].split('\n');
        const monthlyStats = {};

        rows.forEach(row => {
          const match = row.match(/\| (.*?) \| (\d+) \| (\d+) \|/);
          if (match) {
            const [ , month, projects, files ] = match;
            monthlyStats[month] = {
              core_in_package_json: parseInt(projects),
              core_in_any_file: parseInt(files)
            };
          }
        });

        return { github: monthlyStats };
      }
    }
  } catch (error) {
    console.error(`Error loading previous stats for ${year}:`, error);
  }
  return null;
}

/**
 * Fetch historical GitHub stats from BigQuery (GH Archive) for a specific month.
 */
async function fetchHistoricalGitHubStatsForMonth(year, month) {
  const monthStr = month.toString().padStart(2, '0');
  // Calculate the last day of the given month and year
  const lastDayOfMonth = new Date(year, month, 0).getDate().toString().padStart(2, '0'); // Gets the last day (e.g., 31 for Jan, 29 for Feb 2024)

  // Define the start and end suffixes for the tables (YYYYMMDD format)
  const startSuffix = `${year}${monthStr}01`;
  const endSuffix = `${year}${monthStr}${lastDayOfMonth}`;

  // The query searches for occurrences of "@meshsdk/core" in the payload.
  // We cast the payload to STRING in order to run REGEXP_CONTAINS.
  // We use a wildcard table `gharchive.*` and filter by _TABLE_SUFFIX.
  const query = `
    SELECT
      SUM(CASE WHEN REGEXP_CONTAINS(CAST(payload AS STRING), r'"@meshsdk/core"') THEN 1 ELSE 0 END) AS core_in_any_file,
      SUM(CASE WHEN REGEXP_CONTAINS(CAST(payload AS STRING), r'"@meshsdk/core"') AND REGEXP_CONTAINS(CAST(payload AS STRING), r'package\\.json') THEN 1 ELSE 0 END) AS core_in_package_json
    FROM \`bigquery-public-data.gharchive.*\`
    WHERE _TABLE_SUFFIX BETWEEN '${startSuffix}' AND '${endSuffix}'
  `;

  console.log(`Executing BigQuery query for ${year}-${monthStr} (Tables: ${startSuffix} to ${endSuffix})`); // Added for debugging

  try {
    const [job] = await bigquery.createQueryJob({ query });
    console.log(`Job ${job.id} started.`); // Added for debugging

    const [rows] = await job.getQueryResults();
    console.log(`Job ${job.id} completed.`); // Added for debugging

    return {
      // Handle potential null results if no matching events are found
      core_in_any_file: rows[0]?.core_in_any_file || 0,
      core_in_package_json: rows[0]?.core_in_package_json || 0
    };
  } catch (error) {
    console.error(`Error fetching historical stats for ${year}-${monthStr}:`, error.message);
    // Log more details if available
    if (error.errors) {
      console.error("BigQuery API Errors:", JSON.stringify(error.errors, null, 2));
    }
    return {
      core_in_any_file: 0,
      core_in_package_json: 0
    };
  }
}

async function main() {
  const currentYear = new Date().getFullYear();
  const years = [2024, currentYear];
  const githubToken = process.env.GITHUB_TOKEN;
  const currentMonthIndex = new Date().getMonth(); // 0-indexed
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthName = monthNames[currentMonthIndex];

  if (!githubToken) {
    console.error('GITHUB_TOKEN environment variable is required');
    process.exit(1);
  }

  try {
    console.log('Starting Yearly Mesh SDK Stats Generation...\n');

    for (const year of years) {
      console.log(`Generating stats for ${year}...`);

      // Load previous stats (if available)
      const previousStats = await loadPreviousStats(year);

      // Fetch current GitHub stats from API
      const currentGitHubStats = await fetchGitHubStats(githubToken);

      // Initialize or get existing monthly GitHub stats from loaded data
      const monthlyGitHubStats = previousStats?.github || {};

      // For past months (for years before the current year, or for previous months in the current year),
      // check if data is missing or empty. If so, fetch historical stats via BigQuery.
      for (let i = 0; i < 12; i++) {
        const monthName = monthNames[i];
        // If this month is in the past (for previous years or for current year before the current month)
        if (year < currentYear || (year === currentYear && i < currentMonthIndex)) {
          const existingStats = monthlyGitHubStats[monthName];
          if (!existingStats || 
              (existingStats.core_in_package_json === 0 && existingStats.core_in_any_file === 0)) {
            console.log(`Fetching historical stats for ${monthName} ${year} from BigQuery...`);
            monthlyGitHubStats[monthName] = await fetchHistoricalGitHubStatsForMonth(year, i + 1);
          }
        }
      }

      // For the current month, update stats only if there is an increase
      if (year === currentYear) {
        const currentMonthStats = monthlyGitHubStats[currentMonthName] || { core_in_package_json: 0, core_in_any_file: 0 };
        if (currentGitHubStats.core_in_package_json > currentMonthStats.core_in_package_json ||
            currentGitHubStats.core_in_any_file > currentMonthStats.core_in_any_file) {
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
