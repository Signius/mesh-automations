import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function saveJson(stats) {
    const jsonPath = path.join('mesh-gov-updates', 'mesh-stats', 'mesh_stats.json');
    fs.writeFileSync(jsonPath, JSON.stringify(stats, null, 2));
    console.log(`Saved JSON to ${jsonPath}`);
} 