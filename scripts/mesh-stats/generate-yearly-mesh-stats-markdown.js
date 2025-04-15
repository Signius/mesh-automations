import path from 'path';
import fs from 'fs';
import { processYearlyStats } from './process-yearly-stats.js';

export function generateYearlyMarkdown(year, monthlyDownloads, githubStats) {
    const processedData = processYearlyStats(year, monthlyDownloads, githubStats);

    const markdown = `---
title: ${year} Mesh SDK Usage Statistics
description: Historical statistics and usage metrics for Mesh SDK packages in ${year}
sidebarTitle: ${year} Stats
---

# 📊 Mesh SDK Usage Statistics ${year}

## 📈 Monthly Download Statistics for @meshsdk/core

| Month${'&nbsp;'.repeat(35)} |   Download Count |   Performance |
| :---------------------------------------- | --------------: | -----------: |
${processedData.monthlyDownloads.map(m =>
        `| ${m.month} | ${m.downloads.toLocaleString()} | ${m.trend} |`
    ).join('\n')}

**Peak Month**: ${processedData.peakMonth.name} with ${processedData.peakMonth.downloads.toLocaleString()} downloads

## 📦 Yearly Package Download Totals

| Package Name${'&nbsp;'.repeat(32)} |   Total Downloads |   Rating |
| :---------------------------------------- | ---------------: | -------: |
| @meshsdk/core | ${processedData.yearlyTotals.core.toLocaleString()} | ${processedData.yearlyTotals.core > 20000 ? '🌟' : '⭐'} |
| @meshsdk/react | ${processedData.yearlyTotals.react.toLocaleString()} | ${processedData.yearlyTotals.react > 20000 ? '🌟' : '⭐'} |
| @meshsdk/transaction | ${processedData.yearlyTotals.transaction.toLocaleString()} | ${processedData.yearlyTotals.transaction > 20000 ? '🌟' : '⭐'} |
| @meshsdk/wallet | ${processedData.yearlyTotals.wallet.toLocaleString()} | ${processedData.yearlyTotals.wallet > 20000 ? '🌟' : '⭐'} |
| @meshsdk/provider | ${processedData.yearlyTotals.provider.toLocaleString()} | ${processedData.yearlyTotals.provider > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-csl | ${processedData.yearlyTotals.coreCsl.toLocaleString()} | ${processedData.yearlyTotals.coreCsl > 20000 ? '🌟' : '⭐'} |
| @meshsdk/core-cst | ${processedData.yearlyTotals.coreCst.toLocaleString()} | ${processedData.yearlyTotals.coreCst > 20000 ? '🌟' : '⭐'} |

## 🔍 GitHub Usage Statistics

| Month${'&nbsp;'.repeat(62)} |   Projects |   Files |
| :---------------------------------------- | -------------: | -----------: |
${processedData.githubStats.map(stat =>
        `| ${stat.month} | ${stat.projects.toLocaleString()} | ${stat.files.toLocaleString()} |`
    ).join('\n')}`;

    return markdown;
}

export function saveMarkdownFile(year, markdown) {
    const markdownDir = path.join('mesh-gov-updates', 'mesh-stats', 'markdown');

    // Create directory if it doesn't exist
    if (!fs.existsSync(markdownDir)) {
        fs.mkdirSync(markdownDir, { recursive: true });
    }

    const markdownPath = path.join(markdownDir, `${year}.md`);
    fs.writeFileSync(markdownPath, markdown);
    console.log(`Saved markdown to ${markdownPath}`);
}