import { fetchYearlyContributors } from './fetch-yearly-contributors.js';

const githubToken = process.env.GITHUB_TOKEN;

if (!githubToken) {
    console.error('GitHub token not found in environment variables');
    process.exit(1);
}

try {
    await fetchYearlyContributors(githubToken);
    console.log('Successfully generated yearly contributors statistics');
} catch (error) {
    console.error('Error generating yearly contributors statistics:', error);
    process.exit(1);
} 