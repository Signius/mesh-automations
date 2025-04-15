import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function generateVoteTable(vote, organizationName) {
    const voteEmoji = vote.vote === 'Yes' ? '✅' : vote.vote === 'No' ? '❌' : '⚪';
    const voteText = `${voteEmoji}${vote.vote}`;

    // Format dates
    const submittedDate = vote.blockTime ? new Date(vote.blockTime).toLocaleDateString() : 'N/A';
    const proposedEpoch = vote.proposedEpoch || 'N/A';
    const expirationEpoch = vote.expirationEpoch || 'N/A';

    // Process rationale text to prevent table disruption
    let rationale = vote.rationale || 'No rationale available';
    rationale = rationale.replace(/\n/g, ' ');
    rationale = rationale.replace(/\s+/g, ' ');
    rationale = rationale.replace(/\|/g, '\\|');

    return `| ${organizationName}      | Cardano Governance Actions |
| -------------- | ------------------------------------------------------- |
| Proposal Title | [${vote.proposalTitle}](https://adastat.net/governances/${vote.proposalTxHash || 'N/A'}) |
| Hash           | ${vote.proposalTxHash || 'N/A'} |
| Action ID      | ${vote.proposalId || 'N/A'} |
| Type           | ${vote.proposalType || 'Unknown'} |
| Proposed Epoch | ${proposedEpoch} |
| Expires Epoch  | ${expirationEpoch} |
| Vote           | ${voteText} |
| Vote Submitted | ${submittedDate} |
| Rationale      | ${rationale} |
| Link           | [adastat tx link](https://adastat.net/transactions/${vote.voteTxHash || 'N/A'}) |`;
}

export function generateYearlyMarkdown(votes, year, organizationName) {
    const markdownDir = path.join('mesh-gov-updates', 'drep-voting', 'markdown');
    const markdownPath = path.join(markdownDir, `${year}.md`);

    // Create directory if it doesn't exist
    if (!fs.existsSync(markdownDir)) {
        fs.mkdirSync(markdownDir, { recursive: true });
    }

    const frontMatter = `---
title: ${year} DRep Voting History
description: Voting history and rationales for ${year}
sidebarTitle: ${year} Votes
---

# DRep Voting History for ${year}

`;

    let content = frontMatter;

    // Sort votes by submission date
    votes.sort((a, b) => new Date(b.blockTime) - new Date(a.blockTime));

    // Add each vote table with a separator
    votes.forEach((vote, index) => {
        if (index > 0) {
            content += '\n\n---\n\n'; // Add separator between votes
        }
        content += generateVoteTable(vote, organizationName) + '\n';
    });

    fs.writeFileSync(markdownPath, content);
    console.log(`Saved voting markdown to ${markdownPath}`);
}

export function updateAnnualRecords(votingHistoryDir) {
    const indexFilePath = path.join(votingHistoryDir, 'index.md');
    try {
        let content = fs.readFileSync(indexFilePath, 'utf8');

        // Find all markdown files in the voting history directory
        const files = fs.readdirSync(votingHistoryDir);
        const yearFiles = files
            .filter(file => file.endsWith('.md') && file !== '1001.md')
            .map(file => {
                const year = parseInt(file.replace('.md', ''));
                return { file, year };
            })
            .filter(({ year }) => !isNaN(year))
            .sort((a, b) => b.year - a.year); // Sort by year descending

        // Generate the new Annual Records section
        const annualRecordsSection = `## Annual Records\n\n${yearFiles
            .map(({ file, year }) => `- [${year} Voting History](./${file})`)
            .join('\n')}\n\n`;

        // Replace the existing Annual Records section
        content = content.replace(/## Annual Records\n\n[\s\S]*?(?=\n##|$)/, annualRecordsSection);

        // Write the updated content back to the file
        fs.writeFileSync(indexFilePath, content);
        console.log('Updated Annual Records section in index file');
    } catch (error) {
        console.error('Error updating Annual Records section:', error.message);
    }
} 