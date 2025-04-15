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
    const processedGithubStats = monthNames.map(month => ({
        month,
        projects: githubStats[month]?.core_in_package_json || 0,
        files: githubStats[month]?.core_in_any_file || 0,
        repositories: githubStats[month]?.core_in_repositories || 0
    }));

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