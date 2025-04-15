export function processYearlyStats(year, monthlyDownloads, githubStats) {
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

    // Process core package monthly downloads with trends
    const currentDate = new Date();
    const currentYear = currentDate.getFullYear();
    const currentMonth = currentDate.getMonth() + 1;
    const maxDownloads = Math.max(...monthlyDownloads.core.map(m => m.downloads));

    const processedMonthlyDownloads = monthlyDownloads.core.map(m => {
        const trend = (year < currentYear || (year === currentYear && m.month <= currentMonth))
            ? (m.downloads === maxDownloads ? '🔥' :
                m.downloads > monthlyDownloads.core[m.month - 2]?.downloads ? '📈' :
                    m.downloads < monthlyDownloads.core[m.month - 2]?.downloads ? '📉' : '➡️')
            : '➡️';

        return {
            month: monthNames[m.month - 1],
            downloads: m.downloads,
            trend
        };
    });

    // Process GitHub stats
    const processedGithubStats = monthNames.map(month => {
        // For each month, use the existing stats from githubStats
        // If no stats exist for a month, use 0
        const monthStats = githubStats[month] || {
            projects: 0,
            files: 0,
            repositories: 0
        };

        // Return the stats for this month in the correct format
        return {
            month,
            projects: monthStats.projects,
            files: monthStats.files,
            repositories: monthStats.repositories
        };
    });

    // Find peak month
    const maxMonth = monthlyDownloads.core.find(m => m.downloads === maxDownloads);
    const peakMonth = {
        name: monthNames[maxMonth.month - 1],
        downloads: maxDownloads
    };

    return {
        year,
        yearlyTotals,
        monthlyDownloads: processedMonthlyDownloads,
        githubStats: processedGithubStats,
        peakMonth,
        lastUpdated: new Date().toISOString()
    };
} 