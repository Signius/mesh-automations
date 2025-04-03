import { fetchMeshStats, fetchMeshContributors } from './fetch-mesh-data.js';
import { saveMarkdown } from './generate-markdown.js';
import { saveJson } from './generate-json.js';

// Configuration
const CONFIG = {
    generateMarkdown: true,  // Set to false to skip markdown generation
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

        if (CONFIG.generateMarkdown) {
            saveMarkdown(combinedStats);
        }

        console.log('\nStats generated successfully!');
    } catch (error) {
        console.error('Error generating stats:', error);
        process.exit(1);
    }
}

main(); 