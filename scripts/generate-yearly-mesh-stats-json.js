import path from 'path';
import fs from 'fs';
import { processYearlyStats } from './process-yearly-stats.js';

export function generateYearlyStatsJson(year, monthlyDownloads, githubStats) {
    const processedData = processYearlyStats(year, monthlyDownloads, githubStats);
    return processedData;
}

export function saveStatsJson(statsData) {
    const jsonPath = path.join('mesh-gov-updates', 'mesh-stats', 'mesh-yearly-stats.json');
    fs.writeFileSync(jsonPath, JSON.stringify(statsData, null, 2));
    console.log(`Saved stats JSON to ${jsonPath}`);
} 