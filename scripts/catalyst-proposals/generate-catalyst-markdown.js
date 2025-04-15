import fs from 'fs';
import path from 'path';

const MILESTONES_BASE_URL = process.env.NEXT_PUBLIC_MILESTONES_URL || 'https://milestones.projectcatalyst.io';
const DOCS_DIR = 'mesh-gov-updates/catalyst-proposals/markdown';

/**
 * Formats a text to ensure it doesn't exceed the maximum length.
 * If it does, it will be truncated and split with line breaks.
 * @param {string} text - The text to format
 * @param {number} maxLength - Maximum length per line
 * @return {string} Formatted text
 */
function formatText(text, maxLength = 70) {
    if (!text || text.length <= maxLength) return text;

    // Split the text into words
    const words = text.split(' ');
    let formattedText = '';
    let currentLine = '';

    for (const word of words) {
        // If adding this word exceeds maxLength, add a line break
        if ((currentLine + word).length > maxLength && currentLine.length > 0) {
            formattedText += currentLine.trim() + '<br>';
            currentLine = '';
        }

        currentLine += word + ' ';
    }

    // Add the final line
    formattedText += currentLine.trim();
    return formattedText;
}

/**
 * Generates markdown for a project table.
 */
function generateProjectTable(project, milestonesCompleted) {
    // Add heading for project ID that can be linked to
    let tableMarkdown = `###### ${project.project_id}

`;

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

    // Format the project name
    const formattedName = formatText(project.name, 70);

    // Create standard markdown table which will work more consistently across renderers
    tableMarkdown += `| Field | Value${'&nbsp;'.repeat(115)} |
|:--------------------------------|:--------------------------------|
| **Project ID** | ${project.project_id} |
| **Name** | ${formattedName} |
| **Link** | [Open full project](${project.url}) |
| **Milestones** | [Milestones](${MILESTONES_BASE_URL}/projects/${project.project_id}) |
| **${project.category.includes('Challenge') ? 'Challenge' : 'Funding Category'}** | ${formatText(project.category, 50)} |
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

                // Add project row with fund prefix and linked title using project ID
                summaryMarkdown += `| F${fundNumber} - ${projectDetails.name} | [${projectDetails.project_id}](/en/catalyst-proposals/${fundNumber.padStart(4, '0')}#${projectDetails.project_id}) | \`${milestoneBar}\` ${milestonePercentComplete}% | \`${fundBar}\` ${fundPercentComplete}% |\n`;
            });
        });

    return summaryMarkdown + '\n';
}

/**
 * Updates a fund-specific markdown file
 */
export async function updateFundFile(fundNumber, projects) {
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
export async function updateOverviewFile(projects) {
    const filePath = path.join(DOCS_DIR, '0001.md');
    let content = fs.readFileSync(filePath, 'utf8');

    // Keep the frontmatter and content until the MeshJS Proposal Overview section
    const frontmatterMatch = content.match(/^---\n(?:[^\n]*\n)*?---/);
    const overviewMatch = content.match(/# Project Catalyst Proposals[\s\S]*?\n## MeshJS Proposal Overview/);

    if (!frontmatterMatch || !overviewMatch) {
        console.error('Could not find frontmatter or overview section in 0001.md');
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
    newContent += `> **Data Source**: ${process.env.USE_MOCK_DATA ? 'Mock data (Credentials not available)' : 'Real data from Catalyst'}\n`;
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
            newContent += `- ${formatText(project.projectDetails.name, 50)} (${project.projectDetails.project_id})\n`;
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