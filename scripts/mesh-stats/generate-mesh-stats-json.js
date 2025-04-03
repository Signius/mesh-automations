import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function saveJson(stats) {
    const jsonDir = path.join('mesh-gov-updates', 'mesh-stats');
    const jsonPath = path.join(jsonDir, 'mesh_stats.json');

    // Create directory if it doesn't exist
    if (!fs.existsSync(jsonDir)) {
        fs.mkdirSync(jsonDir, { recursive: true });
    }

    fs.writeFileSync(jsonPath, JSON.stringify(stats, null, 2));
    console.log(`Saved JSON to ${jsonPath}`);
} 