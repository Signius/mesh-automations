import axios from 'axios';
import { PROJECTS_INFO } from './mockData.js';
import fs from 'fs';
import path from 'path';

// Initialize constants
const MILESTONES_BASE_URL = process.env.NEXT_PUBLIC_MILESTONES_URL || 'https://milestones.projectcatalyst.io';
const DOCS_DIR = 'apps/docs/src/pages/en/catalyst-proposals';

// Get project IDs from environment variable
const README_PROJECT_IDS = process.env.README_PROJECT_IDS;
console.log('Project IDs from environment:', README_PROJECT_IDS);

// Supabase credentials check - we'll use mock data if they're missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL2;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY2;
const USE_MOCK_DATA = !supabaseUrl || !supabaseKey;

let supabase;
if (!USE_MOCK_DATA) {
    const { createClient } = await import('@supabase/supabase-js');
    supabase = createClient(supabaseUrl, supabaseKey);
}

// Extract just the project IDs
// Use environment variable project IDs if available, otherwise use the ones from PROJECTS_INFO
const PROJECT_IDS = README_PROJECT_IDS
    ? README_PROJECT_IDS.split(',').map(id => id.trim())
    : PROJECTS_INFO.map(project => project.id);

/**
 * Retrieves the proposal details.
 */
async function getProposalDetails(projectId) {
    console.log(`Getting proposal details for project ${projectId}`);

    if (USE_MOCK_DATA) {
        // Use mock data from our predefined array
        const mockProject = PROJECTS_INFO.find(p => p.id === projectId);
        if (mockProject) {
            console.log(`Using mock data for project ${projectId}`);
            return {
                id: mockProject.id,
                title: mockProject.name,
                budget: mockProject.budget,
                milestones_qty: mockProject.milestones_qty,
                funds_distributed: mockProject.funds_distributed,
                project_id: mockProject.id,
                name: mockProject.name,
                category: mockProject.category,
                url: mockProject.url,
                status: mockProject.status,
                finished: mockProject.finished
            };
        }
        return null;
    }

    // Real data from Supabase
    const { data, error } = await supabase
        .from('proposals')
        .select(`
      id,
      title,
      budget,
      milestones_qty,
      funds_distributed,
      project_id
    `)
        .eq('project_id', projectId)
        .single();

    if (error) {
        console.error(`Error fetching proposal details for project ${projectId}:`, error);
        return null;
    }

    // Find supplementary info from our predefined array
    const supplementaryInfo = PROJECTS_INFO.find(p => p.id === projectId);

    const enhancedData = {
        ...data,
        name: supplementaryInfo?.name || data.title,
        category: supplementaryInfo?.category || '',
        url: supplementaryInfo?.url || '',
        status: supplementaryInfo?.status || 'In Progress',
        finished: supplementaryInfo?.finished || ''
    };

    console.log(`Found proposal details for project ${projectId}:`, enhancedData);
    return enhancedData;
}

/**
 * Fetches milestone snapshot data.
 */
async function fetchSnapshotData(projectId) {
    if (USE_MOCK_DATA) {
        // Return empty array for mock data as we'll use hardcoded completion values
        return [];
    }

    try {
        const response = await axios({
            method: 'POST',
            url: `${supabaseUrl}/rest/v1/rpc/getproposalsnapshot`,
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Content-Profile': 'public',
                'x-client-info': 'supabase-js/2.2.3'
            },
            data: { _project_id: projectId }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching snapshot data for project ${projectId}:`, error);
        return [];
    }
}

/**
 * Generates markdown for a project table.
 */
function generateProjectTable(project, milestonesCompleted) {
    // Format the budget to include commas for thousands
    const formattedBudget = new Intl.NumberFormat('en-US').format(project.budget);

    // Get the funds_distributed or use 0 if not available
    const fundsDistributed = project.funds_distributed || 0;
    const formattedFundsDistributed = new Intl.NumberFormat('en-US').format(fundsDistributed);

    // Calculate completion percentage and create progress bar for funds
    const fundPercentComplete = Math.round((fundsDistributed / project.budget) * 100);
    const filledBlocks = Math.round(fundPercentComplete / 5);
    const emptyBlocks = 20 - filledBlocks;
    const progressBar = '█'.repeat(filledBlocks) + '·'.repeat(emptyBlocks);

    // Determine status emoji based on milestone completion
    let statusEmoji;
    const milestonePercentComplete = Math.round((milestonesCompleted / project.milestones_qty) * 100);

    if (milestonePercentComplete === 100) {
        statusEmoji = '✅';
    } else if (milestonePercentComplete >= 75) {
        statusEmoji = '🔆';
    } else if (milestonePercentComplete >= 50) {
        statusEmoji = '🔄';
    } else if (milestonePercentComplete > 0) {
        statusEmoji = '🚀';
    } else {
        statusEmoji = '📋';
    }

    // Create standard markdown table which will work more consistently across renderers
    const tableMarkdown = `
| Property${' '.repeat(17)} | Value${' '.repeat(60)} |
|:---------|:------|
| **Project ID** | ${project.project_id} |
| **Name** | ${project.name} |
| **Link** | [Open full project](${project.url}) |
| **Milestones** | [Milestones](${MILESTONES_BASE_URL}/projects/${project.project_id}) |
| **${project.category.includes('Challenge') ? 'Challenge' : 'Funding Category'}** | ${project.category} |
| **Proposal Budget** | ADA ${formattedBudget} |
| **Status** | ${statusEmoji} ${project.status} |
| **Milestones completed** | ${milestonesCompleted}/${project.milestones_qty} (${milestonePercentComplete}%) |
| **Funds distributed** | ADA ${formattedFundsDistributed} of ${formattedBudget} (${fundPercentComplete}%) |
| **Funding Progress** | \`${progressBar}\` |
${project.finished ? `| **Finished** | ${project.finished} |` : ''}
`;

    return tableMarkdown;
}

/**
 * Generates a summary table with progress bars for all proposals.
 */
function generateSummaryTable(projects) {
    let summaryMarkdown = `### Overview of All Proposals

| Project | ID | Milestones | Funding |
|:--------|:---|:-----------|:--------|
`;

    // Sort projects by fund number and group them
    const sortedProjects = projects.flat().sort((a, b) => {
        // Extract fund number from project ID (first two digits) - ensure it's a string
        const fundA = String(a.projectDetails.project_id).substring(0, 2);
        const fundB = String(b.projectDetails.project_id).substring(0, 2);
        return Number(fundA) - Number(fundB);
    });

    // Group projects by fund
    const groupedProjects = {};
    sortedProjects.forEach(project => {
        // Get fund number from project ID (first two digits) - ensure it's a string
        const fundNumber = String(project.projectDetails.project_id).substring(0, 2);
        if (!groupedProjects[fundNumber]) {
            groupedProjects[fundNumber] = [];
        }
        groupedProjects[fundNumber].push(project);
    });

    // Add projects fund by fund
    Object.keys(groupedProjects)
        .sort((a, b) => Number(a) - Number(b))
        .forEach(fundNumber => {
            // Add projects for this fund
            groupedProjects[fundNumber].forEach(project => {
                const { projectDetails, milestonesCompleted } = project;

                // Calculate milestone progress
                const milestonePercentComplete = Math.round((milestonesCompleted / projectDetails.milestones_qty) * 100);
                const milestoneFilled = Math.round(milestonePercentComplete / 5);
                const milestoneEmpty = 20 - milestoneFilled;
                const milestoneBar = '█'.repeat(milestoneFilled) + '·'.repeat(milestoneEmpty);

                // Calculate funding progress
                const fundsDistributed = projectDetails.funds_distributed || 0;
                const fundPercentComplete = Math.round((fundsDistributed / projectDetails.budget) * 100);
                const fundFilled = Math.round(fundPercentComplete / 5);
                const fundEmpty = 20 - fundFilled;
                const fundBar = '█'.repeat(fundFilled) + '·'.repeat(fundEmpty);

                // Add project row with fund prefix
                summaryMarkdown += `| F${fundNumber} - ${projectDetails.name} | ${projectDetails.project_id} | \`${milestoneBar}\` ${milestonePercentComplete}% | \`${fundBar}\` ${fundPercentComplete}% |\n`;
            });
        });

    return summaryMarkdown + '\n';
}

/**
 * Updates a fund-specific markdown file
 */
async function updateFundFile(fundNumber, projects) {
    const filePath = path.join(DOCS_DIR, `${fundNumber.padStart(4, '0')}.md`);
    let content = fs.readFileSync(filePath, 'utf8');

    // Keep the frontmatter and title
    const frontmatterMatch = content.match(/^---\n[\s\S]*?\n---/);
    const titleMatch = content.match(/^# Fund \d+/m);

    if (!frontmatterMatch || !titleMatch) {
        console.error(`Could not find frontmatter or title in ${filePath}`);
        return;
    }

    // Generate new content
    let newContent = frontmatterMatch[0] + '\n\n' + titleMatch[0] + '\n\n';

    // Add project tables
    projects.forEach(project => {
        newContent += generateProjectTable(project.projectDetails, project.milestonesCompleted) + '\n\n';
    });

    // Write the file
    fs.writeFileSync(filePath, newContent);
    console.log(`Updated ${filePath}`);
}

/**
 * Updates the overview markdown file (0001.md)
 */
async function updateOverviewFile(projects) {
    const filePath = path.join(DOCS_DIR, '0001.md');
    let content = fs.readFileSync(filePath, 'utf8');

    console.log('Reading content from 0001.md...');
    console.log('First 200 characters of content:', content.substring(0, 200));

    // Keep the frontmatter and content until the MeshJS Proposal Overview section
    const frontmatterMatch = content.match(/^---\n(?:[^\n]*\n)*?---/);
    console.log('Frontmatter match:', frontmatterMatch ? 'Found' : 'Not found');
    if (frontmatterMatch) {
        console.log('Frontmatter content:', frontmatterMatch[0]);
    }

    const overviewMatch = content.match(/# Project Catalyst Proposals[\s\S]*?\n## MeshJS Proposal Overview/);
    console.log('Overview match:', overviewMatch ? 'Found' : 'Not found');
    if (overviewMatch) {
        console.log('Overview content length:', overviewMatch[0].length);
    }

    if (!frontmatterMatch || !overviewMatch) {
        console.error('Could not find frontmatter or overview section in 0001.md');
        console.error('Frontmatter match:', frontmatterMatch ? 'Found' : 'Not found');
        console.error('Overview match:', overviewMatch ? 'Found' : 'Not found');
        return;
    }

    // Get current timestamp
    const now = new Date();
    const timestamp = now.toLocaleString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short'
    });

    // Calculate totals for overall progress
    let totalMilestones = 0;
    let totalCompletedMilestones = 0;
    let totalBudget = 0;
    let totalFundsDistributed = 0;

    projects.forEach(project => {
        totalMilestones += project.projectDetails.milestones_qty;
        totalCompletedMilestones += project.milestonesCompleted;
        totalBudget += project.projectDetails.budget || 0;
        totalFundsDistributed += project.projectDetails.funds_distributed || 0;
    });

    // Generate overall milestone progress bar
    const overallMilestonePercentComplete = Math.round((totalCompletedMilestones / totalMilestones) * 100);
    const overallMilestoneFilled = Math.round(overallMilestonePercentComplete / 5);
    const overallMilestoneEmpty = 20 - overallMilestoneFilled;
    const overallMilestoneBar = '█'.repeat(overallMilestoneFilled) + '·'.repeat(overallMilestoneEmpty);

    // Generate overall funding progress bar
    const overallFundingPercentComplete = Math.round((totalFundsDistributed / totalBudget) * 100);
    const overallFundingFilled = Math.round(overallFundingPercentComplete / 5);
    const overallFundingEmpty = 20 - overallFundingFilled;
    const overallFundingBar = '█'.repeat(overallFundingFilled) + '·'.repeat(overallFundingEmpty);

    // Format currency values with commas
    const formattedTotalBudget = new Intl.NumberFormat('en-US').format(totalBudget);
    const formattedTotalFundsDistributed = new Intl.NumberFormat('en-US').format(totalFundsDistributed);

    // Generate new content
    let newContent = frontmatterMatch[0] + '\n\n' + overviewMatch[0] + '\n\n';
    newContent += `> **Data Source**: ${USE_MOCK_DATA ? 'Mock data (Credentials not available)' : 'Real data from Catalyst'}\n`;
    newContent += `> **Last Updated**: ${timestamp}\n\n`;

    // Add overall progress
    newContent += `### Overall Progress\n\n`;
    newContent += `| Milestones | Funding |\n`;
    newContent += `|:-----------|:--------|\n`;
    newContent += `| Total completed: ${totalCompletedMilestones}/${totalMilestones} (${overallMilestonePercentComplete}%)<br>\`${overallMilestoneBar}\` ${overallMilestonePercentComplete}% | Total distributed: ADA ${formattedTotalFundsDistributed}/${formattedTotalBudget} (${overallFundingPercentComplete}%)<br>\`${overallFundingBar}\` ${overallFundingPercentComplete}% |\n\n`;

    // Add summary table
    newContent += generateSummaryTable(projects);

    // Add proposals by fund section
    newContent += `### Proposals by Fund\n\n`;
    const fundNumbers = [...new Set(projects.map(p => String(p.projectDetails.project_id).substring(0, 2)))].sort();
    fundNumbers.forEach(fundNumber => {
        const fundProjects = projects.filter(p => String(p.projectDetails.project_id).substring(0, 2) === fundNumber);
        newContent += `#### [Fund ${fundNumber}](/en/catalyst-proposals/${fundNumber.padStart(4, '0')})\n`;
        fundProjects.forEach(project => {
            newContent += `- ${project.projectDetails.name} (${project.projectDetails.project_id})\n`;
        });
        newContent += '\n';
    });

    // Add the rest of the content (Documentation Organization, Resources, etc.)
    const restMatch = content.match(/\n### Documentation Organization[\s\S]*$/);
    if (restMatch) {
        newContent += restMatch[0];
    }

    // Write the file
    fs.writeFileSync(filePath, newContent);
    console.log('Updated 0001.md');
}

/**
 * Main function.
 */
async function main() {
    console.log('Generating markdown files...');
    console.log('Using mock data:', USE_MOCK_DATA);

    // Group projects by fund
    const projectsByFund = {
        '10': [],
        '11': [],
        '12': [],
        '13': []
    };

    // Process each project
    for (const projectId of PROJECT_IDS) {
        const projectDetails = await getProposalDetails(projectId);
        if (!projectDetails) continue;

        const snapshotData = await fetchSnapshotData(projectId);

        // Get milestones completed data
        let milestonesCompleted;
        if (USE_MOCK_DATA) {
            const mockProject = PROJECTS_INFO.find(p => p.id === projectId);
            milestonesCompleted = mockProject?.milestonesCompleted || 0;
        } else {
            milestonesCompleted = snapshotData.filter(
                milestone => milestone.som_signoff_count > 0 && milestone.poa_signoff_count > 0
            ).length;
        }

        // Add to fund group
        const fundNumber = String(projectId).substring(0, 2);
        if (projectsByFund[fundNumber]) {
            projectsByFund[fundNumber].push({
                projectDetails,
                milestonesCompleted
            });
        }
    }

    // Update each fund file
    for (const [fundNumber, projects] of Object.entries(projectsByFund)) {
        if (projects.length > 0) {
            await updateFundFile(fundNumber, projects);
        }
    }

    // Update overview file
    const allProjects = Object.values(projectsByFund).flat();
    await updateOverviewFile(allProjects);

    console.log('All markdown files have been updated.');
}

main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
}); 