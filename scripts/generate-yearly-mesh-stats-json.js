import path from 'path';
import fs from 'fs';

export function generateYearlyStatsJson(year, monthlyDownloads, githubStats) {
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

    // Format monthly downloads data
    const formattedMonthlyDownloads = {
        core: monthlyDownloads.core.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        react: monthlyDownloads.react.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        transaction: monthlyDownloads.transaction.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        wallet: monthlyDownloads.wallet.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        provider: monthlyDownloads.provider.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        coreCsl: monthlyDownloads.coreCsl.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        })),
        coreCst: monthlyDownloads.coreCst.map(m => ({
            month: monthNames[m.month - 1],
            downloads: m.downloads
        }))
    };

    // Format GitHub stats
    const formattedGithubStats = monthNames.map(month => ({
        month,
        projects: githubStats[month]?.core_in_package_json || 0,
        files: githubStats[month]?.core_in_any_file || 0
    }));

    const statsData = {
        year,
        yearlyTotals,
        monthlyDownloads: formattedMonthlyDownloads,
        githubStats: formattedGithubStats,
        lastUpdated: new Date().toISOString()
    };

    return statsData;
}

export function saveStatsJson(statsData) {
    const jsonPath = path.join('mesh-gov-updates', 'mesh-stats', 'mesh-yearly-stats.json');
    fs.writeFileSync(jsonPath, JSON.stringify(statsData, null, 2));
    console.log(`Saved stats JSON to ${jsonPath}`);
} 