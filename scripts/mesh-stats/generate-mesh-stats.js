import { fetchMeshStats, fetchMeshContributors } from './fetch-mesh-stats-data.js';
import { saveJson } from './generate-mesh-stats-json.js';

// Configuration
const CONFIG = {
    generateJson: true,      // Set to false to skip JSON generation
};

async function main() {
    const githubToken = process.env.GITHUB_TOKEN;
    if (!githubToken) {
        console.error('GITHUB_TOKEN environment variable is required');
        process.exit(1);
    }

    try {
        console.log('Starting Mesh SDK Stats Generation...\n');
        const [stats, contributors] = await Promise.all([
            fetchMeshStats(githubToken),
            fetchMeshContributors(githubToken)
        ]);

        // Combine stats and contributors data
        const combinedStats = {
            ...stats,
            contributors
        };

        // Generate outputs based on configuration
        if (CONFIG.generateJson) {
            saveJson(combinedStats);
        }

        console.log('\nStats generated successfully!');
    } catch (error) {
        console.error('Error generating stats:', error);
        process.exit(1);
    }
}

main(); 