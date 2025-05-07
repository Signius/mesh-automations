import axios from 'axios';
import fs from 'fs';
import path from 'path';

export async function fetchYearlyContributors(githubToken) {
    console.log('\nFetching repository contributors...');

    // Create contributions directory if it doesn't exist
    const contributionsDir = path.join('mesh-gov-updates', 'mesh-stats', 'contributions');
    if (!fs.existsSync(contributionsDir)) {
        fs.mkdirSync(contributionsDir, { recursive: true });
    }

    // Get all repositories with pagination
    let allRepos = [];
    let page = 1;
    let hasMoreRepos = true;
    let earliestYear = new Date().getFullYear(); // Initialize with current year

    while (hasMoreRepos) {
        try {
            console.log(`Fetching repositories page ${page}...`);
            const reposResponse = await axios.get('https://api.github.com/orgs/MeshJS/repos', {
                params: {
                    type: 'all',
                    per_page: 100,
                    page: page
                },
                headers: {
                    'Accept': 'application/vnd.github.v3+json',
                    'Authorization': `token ${githubToken}`
                }
            });

            if (reposResponse.data.length === 0) {
                hasMoreRepos = false;
            } else {
                // Find the earliest repository creation date
                reposResponse.data.forEach(repo => {
                    const createdYear = new Date(repo.created_at).getFullYear();
                    if (createdYear < earliestYear) {
                        earliestYear = createdYear;
                    }
                });
                allRepos = allRepos.concat(reposResponse.data);
                page++;
            }
        } catch (error) {
            console.error(`Error fetching repositories page ${page}:`, error.message);
            hasMoreRepos = false;
        }
    }

    console.log(`Found ${allRepos.length} repositories in the MeshJS organization`);
    console.log(`Earliest repository creation year: ${earliestYear}`);

    // Get existing yearly files
    const existingYears = new Set();
    if (fs.existsSync(contributionsDir)) {
        const files = fs.readdirSync(contributionsDir);
        files.forEach(file => {
            const match = file.match(/contributors-(\d{4})\.json/);
            if (match) {
                existingYears.add(parseInt(match[1]));
            }
        });
    }

    const currentYear = new Date().getFullYear();
    // If we have existing years, only update the current year
    // Otherwise, process all years from earliest to current
    const yearsToUpdate = existingYears.size > 0 ?
        [currentYear] :
        Array.from({ length: currentYear - earliestYear + 1 }, (_, i) => earliestYear + i);

    console.log(`Years to process: ${yearsToUpdate.join(', ')}`);

    // Process each year
    for (const year of yearsToUpdate) {
        console.log(`\nProcessing data for year ${year}...`);
        const contributorsMap = new Map();

        for (const repo of allRepos) {
            console.log(`Fetching contributors for ${repo.name}...`);
            try {
                // Fetch commits with timestamps
                let commitsPage = 1;
                let hasMoreCommits = true;

                while (hasMoreCommits) {
                    try {
                        const commitsResponse = await axios.get(`https://api.github.com/repos/MeshJS/${repo.name}/commits`, {
                            params: {
                                per_page: 100,
                                page: commitsPage
                            },
                            headers: {
                                'Accept': 'application/vnd.github.v3+json',
                                'Authorization': `token ${githubToken}`
                            }
                        });

                        if (commitsResponse.data.length === 0) {
                            hasMoreCommits = false;
                        } else {
                            for (const commit of commitsResponse.data) {
                                if (!commit.author || !commit.author.login) continue;

                                const commitDate = new Date(commit.commit.author.date);
                                if (commitDate.getFullYear() !== year) continue;

                                const login = commit.author.login;
                                const timestamp = commit.commit.author.date;

                                if (!contributorsMap.has(login)) {
                                    const repoData = {};
                                    repoData[repo.name] = {
                                        commits: 1,
                                        pull_requests: 0,
                                        contributions: 1,
                                        commit_timestamps: [timestamp],
                                        pr_timestamps: []
                                    };

                                    contributorsMap.set(login, {
                                        login: login,
                                        avatar_url: commit.author.avatar_url,
                                        commits: 1,
                                        pull_requests: 0,
                                        contributions: 1,
                                        repositories: repoData
                                    });
                                } else {
                                    const existingContributor = contributorsMap.get(login);
                                    existingContributor.commits += 1;
                                    existingContributor.contributions += 1;

                                    if (existingContributor.repositories[repo.name]) {
                                        existingContributor.repositories[repo.name].commits += 1;
                                        existingContributor.repositories[repo.name].contributions += 1;
                                        existingContributor.repositories[repo.name].commit_timestamps.push(timestamp);
                                    } else {
                                        existingContributor.repositories[repo.name] = {
                                            commits: 1,
                                            pull_requests: 0,
                                            contributions: 1,
                                            commit_timestamps: [timestamp],
                                            pr_timestamps: []
                                        };
                                    }
                                }
                            }
                            commitsPage++;
                        }
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            console.warn(`Repository ${repo.name} might be private or not exist. Skipping commits.`);
                        } else if (error.response && error.response.status === 403) {
                            console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping commits.`);
                        } else {
                            console.error(`Error fetching commits for ${repo.name} page ${commitsPage}:`, error.message);
                        }
                        hasMoreCommits = false;
                    }
                }

                // Fetch pull requests
                let page = 1;
                let pullsData = [];
                let hasMorePulls = true;

                while (hasMorePulls) {
                    try {
                        const pullsResponse = await axios.get(
                            `https://api.github.com/repos/MeshJS/${repo.name}/pulls`,
                            {
                                params: {
                                    state: 'closed',
                                    per_page: 100,
                                    page: page
                                },
                                headers: {
                                    'Accept': 'application/vnd.github.v3+json',
                                    'Authorization': `token ${githubToken}`
                                }
                            }
                        );

                        if (pullsResponse.data.length === 0) {
                            hasMorePulls = false;
                        } else {
                            const mergedPRs = pullsResponse.data.filter(pr => {
                                if (!pr.merged_at) return false;
                                const prDate = new Date(pr.merged_at);
                                return prDate.getFullYear() === year;
                            });
                            pullsData = pullsData.concat(mergedPRs);
                            page++;
                        }
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            console.warn(`Repository ${repo.name} might be private or not exist. Skipping PRs.`);
                        } else if (error.response && error.response.status === 403) {
                            console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping PRs.`);
                        } else {
                            console.error(`Error fetching PRs for ${repo.name} page ${page}:`, error.message);
                        }
                        hasMorePulls = false;
                    }
                }

                // Process PRs
                pullsData.forEach(pr => {
                    if (!pr.user || !pr.user.login) return;
                    if (!pr.merged_at) return;

                    const login = pr.user.login;
                    const timestamp = pr.merged_at;

                    if (!contributorsMap.has(login)) {
                        const repoData = {};
                        repoData[repo.name] = {
                            commits: 0,
                            pull_requests: 1,
                            contributions: 1,
                            commit_timestamps: [],
                            pr_timestamps: [timestamp]
                        };

                        contributorsMap.set(login, {
                            login: login,
                            avatar_url: pr.user.avatar_url,
                            commits: 0,
                            pull_requests: 1,
                            contributions: 1,
                            repositories: repoData
                        });
                    } else {
                        const contributor = contributorsMap.get(login);
                        contributor.pull_requests += 1;
                        contributor.contributions += 1;

                        if (contributor.repositories[repo.name]) {
                            contributor.repositories[repo.name].pull_requests += 1;
                            contributor.repositories[repo.name].contributions += 1;
                            contributor.repositories[repo.name].pr_timestamps.push(timestamp);
                        } else {
                            contributor.repositories[repo.name] = {
                                commits: 0,
                                pull_requests: 1,
                                contributions: 1,
                                commit_timestamps: [],
                                pr_timestamps: [timestamp]
                            };
                        }
                    }
                });

                // Fetch issues that are pull requests
                let issuesPage = 1;
                let issuesData = [];
                let hasMoreIssues = true;

                while (hasMoreIssues) {
                    try {
                        const issuesResponse = await axios.get(
                            `https://api.github.com/repos/MeshJS/${repo.name}/issues`,
                            {
                                params: {
                                    state: 'closed',
                                    per_page: 100,
                                    page: issuesPage
                                },
                                headers: {
                                    'Accept': 'application/vnd.github.v3+json',
                                    'Authorization': `token ${githubToken}`
                                }
                            }
                        );

                        if (issuesResponse.data.length === 0) {
                            hasMoreIssues = false;
                        } else {
                            const prIssues = issuesResponse.data.filter(issue => {
                                if (!issue.pull_request || !issue.closed_at) return false;
                                if (!issue.pull_request.merged_at) return false;
                                const issueDate = new Date(issue.pull_request.merged_at);
                                return issueDate.getFullYear() === year;
                            });
                            issuesData = issuesData.concat(prIssues);
                            issuesPage++;
                        }
                    } catch (error) {
                        if (error.response && error.response.status === 404) {
                            console.warn(`Repository ${repo.name} might be private or not exist. Skipping issues.`);
                        } else if (error.response && error.response.status === 403) {
                            console.warn(`API rate limit exceeded or insufficient permissions for ${repo.name}. Skipping issues.`);
                        } else {
                            console.error(`Error fetching issues for ${repo.name} page ${issuesPage}:`, error.message);
                        }
                        hasMoreIssues = false;
                    }
                }

                // Process issues that are pull requests
                issuesData.forEach(issue => {
                    if (!issue.user || !issue.user.login) return;
                    if (!issue.closed_at) return;

                    const login = issue.user.login;
                    const timestamp = issue.closed_at;

                    if (!contributorsMap.has(login)) {
                        const repoData = {};
                        repoData[repo.name] = {
                            commits: 0,
                            pull_requests: 1,
                            contributions: 1,
                            commit_timestamps: [],
                            pr_timestamps: [timestamp]
                        };

                        contributorsMap.set(login, {
                            login: login,
                            avatar_url: issue.user.avatar_url,
                            commits: 0,
                            pull_requests: 1,
                            contributions: 1,
                            repositories: repoData
                        });
                    } else {
                        const contributor = contributorsMap.get(login);
                        contributor.pull_requests += 1;
                        contributor.contributions += 1;

                        if (contributor.repositories[repo.name]) {
                            contributor.repositories[repo.name].pull_requests += 1;
                            contributor.repositories[repo.name].contributions += 1;
                            contributor.repositories[repo.name].pr_timestamps.push(timestamp);
                        } else {
                            contributor.repositories[repo.name] = {
                                commits: 0,
                                pull_requests: 1,
                                contributions: 1,
                                commit_timestamps: [],
                                pr_timestamps: [timestamp]
                            };
                        }
                    }
                });
            } catch (error) {
                console.error(`Error fetching data for ${repo.name}:`, error.message);
            }
        }

        // Convert repositories from object to array for each contributor
        const contributors = Array.from(contributorsMap.values()).map(contributor => {
            const reposArray = Object.entries(contributor.repositories).map(([repoName, repoData]) => {
                return {
                    name: repoName,
                    ...repoData,
                    commit_timestamps: repoData.commit_timestamps.sort((a, b) => new Date(b) - new Date(a)),
                    pr_timestamps: repoData.pr_timestamps.sort((a, b) => new Date(b) - new Date(a))
                };
            });

            reposArray.sort((a, b) => b.contributions - a.contributions);

            return {
                ...contributor,
                repositories: reposArray
            };
        });

        // Sort contributors by total contributions
        contributors.sort((a, b) => b.contributions - a.contributions);

        const yearlyStats = {
            year: year,
            unique_count: contributors.length,
            contributors,
            total_pull_requests: contributors.reduce((sum, c) => sum + c.pull_requests, 0),
            total_commits: contributors.reduce((sum, c) => sum + c.commits, 0),
            total_contributions: contributors.reduce((sum, c) => sum + c.commits + c.pull_requests, 0)
        };

        // Save yearly stats to file
        const yearlyFilePath = path.join(contributionsDir, `contributors-${year}.json`);
        fs.writeFileSync(yearlyFilePath, JSON.stringify(yearlyStats, null, 2), 'utf8');
        console.log(`Saved contributors data for ${year} to ${yearlyFilePath}`);
    }
} 