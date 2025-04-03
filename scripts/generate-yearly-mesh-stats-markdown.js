import path from 'path';
import fs from 'fs';

export function generateYearlyMarkdown(year, monthlyDownloads, githubStats) {
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

    const markdown = `---
title: ${year} Mesh SDK Usage Statistics
description: Historical statistics and usage metrics for Mesh SDK packages in ${year}
sidebarTitle: ${year} Stats
---

# 📊 Mesh SDK Usage Statistics ${year}

## 📈 Monthly Download Statistics for @meshsdk/core

| Month${'&nbsp;'.repeat(35)} |   Download Count |   Performance |
| :---------------------------------------- | --------------: | -----------: |
${monthlyDownloads.core.map(m => {
        const currentDate = new Date();
        const currentYear = currentDate.getFullYear();
        const currentMonth = currentDate.getMonth() + 1;

        // Only show performance trends up to current month
        const trend = (year < currentYear || (year === currentYear && m.month <= currentMonth))
            ? (m.downloads === maxDownloads ? '🔥' :
                m.downloads > monthlyDownloads.core[m.month - 2]?.downloads ? '📈' :
                    m.downloads < monthlyDownloads.core[m.month - 2]?.downloads ? '📉' : '➡️')
            : '➡️';
        return `| ${monthNames[m.month - 1]} | ${m.downloads.toLocaleString()} | ${trend} |`;
    }).join('\n')}

**Peak Month**: ${maxMonthName} with ${maxDownloads.toLocaleString()} downloads

## 📦 Yearly Package Download Totals

| Package Name${'&nbsp;'.repeat(32)} |   Total Downloads |   Rating |
| :---------------------------------------- | ---------------: | -------: |
| @meshsdk/core | ${yearlyTotals.core.toLocaleString()} | ${yearlyTotals.core > 20000 ? '🌟' : '⭐'} |
| @meshsdk/react | ${yearlyTotals.react.toLocaleString()} | ${yearlyTotals.react > 20000 ? '🌟' : '⭐'} |
| @meshsdk/transaction | ${yearlyTotals.transaction.toLocaleString()} | ${yearlyTotals.transaction > 20000 ? '🌟' : '⭐'} |
| @meshsdk/wallet | ${yearlyTotals.wallet.toLocaleString()} | ${yearlyTotals.wallet > 20000 ? '🌟' : '⭐'} |
| @meshsdk/provider | ${yearlyTotals.provider.toLocaleString()} | ${yearlyTotals.provider > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-csl | ${yearlyTotals.coreCsl.toLocaleString()} | ${yearlyTotals.coreCsl > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-cst | ${yearlyTotals.coreCst.toLocaleString()} | ${yearlyTotals.coreCst > 20000 ? '🌟' : '⭐'} |

## 🔍 GitHub Usage Statistics

| Month${'&nbsp;'.repeat(62)} |   Projects |   Files |
| :---------------------------------------- | -------------: | -----------: |
${monthNames.map(month => {
        const monthStats = githubStats[month] || { core_in_package_json: 0, core_in_any_file: 0 };
        return `| ${month} | ${monthStats.core_in_package_json.toLocaleString()} | ${monthStats.core_in_any_file.toLocaleString()} |`;
    }).join('\n')}`;

    return markdown;
}

export function saveMarkdownFile(year, markdown) {
    const markdownPath = path.join('apps', 'docs', 'src', 'pages', 'en', 'mesh-stats', `${year}.md`);
    fs.writeFileSync(markdownPath, markdown);
    console.log(`Saved markdown to ${markdownPath}`);
}