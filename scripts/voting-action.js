import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;
const organizationName = config.organizationName;

// Read missing rationales file
const missingRationalesPath = path.join(__dirname, '..', 'voting-history', 'missing-voting-rationales', 'rationales.json');
let missingRationales = {};
try {
    missingRationales = JSON.parse(fs.readFileSync(missingRationalesPath, 'utf8'));
} catch (error) {
    console.warn('Could not read missing rationales file:', error.message);
}

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

if (!organizationName) {
    console.error('Organization name not found in config.json');
    process.exit(1);
}

// Define the base directory for voting history files
const votingHistoryDir = path.join(__dirname, '..', 'apps', 'docs', 'src', 'pages', 'en', 'drep-voting');

// Function to read front matter from a file
function readFrontMatter(filePath) {
    try {
        const content = fs.readFileSync(filePath, 'utf8');
        const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
        if (frontMatterMatch) {
            const frontMatter = frontMatterMatch[1];
            const yearMatch = frontMatter.match(/title:\s*(\d{4})/);
            if (yearMatch) {
                return parseInt(yearMatch[1]);
            }
        }
    } catch (error) {
        console.warn(`Could not read front matter from ${filePath}:`, error.message);
    }
    return null;
}

// Function to find the correct file for a given year
function findFileForYear(year) {
    const files = fs.readdirSync(votingHistoryDir);
    for (const file of files) {
        if (file.endsWith('.md')) {
            const fileYear = readFrontMatter(path.join(votingHistoryDir, file));
            if (fileYear === year) {
                return path.join(votingHistoryDir, file);
            }
        }
    }
    return null;
}

async function fetchMetadata(metaUrl) {
    try {
        const response = await axios.get(metaUrl);
        return response.data;
    } catch (error) {
        console.error(`Error fetching metadata from ${metaUrl}:`, error.message);
        return null;
    }
}

async function getProposalDetails(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        const response = await axios.get(`https://api.koios.rest/api/v1/voter_proposal_list?_voter_id=${drepId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'accept': 'application/json'
            }
        });

        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        console.log(`Found ${response.data.length} proposals in voter_proposal_list`);

        // Create a map of proposal details by proposal_id
        const proposalMap = response.data.reduce((acc, proposal) => {
            if (!proposal.proposal_id) {
                console.warn('Found proposal without proposal_id, skipping');
                return acc;
            }
            acc[proposal.proposal_id] = proposal;
            return acc;
        }, {});

        console.log(`Successfully mapped ${Object.keys(proposalMap).length} proposals`);
        return proposalMap;
    } catch (error) {
        console.error('Error fetching proposal details:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return {};
    }
}

// Function to generate a single vote table
function generateVoteTable(vote, proposalDetails, metadata) {
    const voteEmoji = vote.vote === 'Yes' ? '✅' : vote.vote === 'No' ? '❌' : '⚪';
    const voteText = `${voteEmoji}${vote.vote}`;

    // Get proposal details
    const proposal = proposalDetails[vote.proposalId] || {};

    // Extract proposal title from proposal details first, then fallback to metadata and rationales.json
    let proposalTitle = proposal.meta_json?.body?.title;
    if (!proposalTitle && vote.proposalId) {
        proposalTitle = missingRationales[vote.proposalId]?.title;
    }
    proposalTitle = proposalTitle || 'Unknown Proposal';

    // Format dates
    const submittedDate = vote.blockTime ? new Date(vote.blockTime).toLocaleDateString() : 'N/A';
    const proposedEpoch = proposal.proposed_epoch || 'N/A';
    const expirationEpoch = proposal.expiration || 'N/A';

    // Get proposal type
    const proposalType = proposal.proposal_type || 'Unknown';

    // Process rationale text to prevent table disruption
    let rationale = metadata?.body?.comment || metadata?.body?.rationale || 'No rationale available';

    // Check for missing rationale in the rationales.json file
    if (rationale === 'No rationale available' && vote.proposalId) {
        const missingRationale = missingRationales[vote.proposalId];
        if (missingRationale && missingRationale.rationale) {
            rationale = missingRationale.rationale;
        }
    }

    rationale = rationale.replace(/\n/g, ' ');
    rationale = rationale.replace(/\s+/g, ' ');
    rationale = rationale.replace(/\|/g, '\\|');
    /*if (rationale.length > 500) {
        rationale = rationale.substring(0, 497) + '...';
    }*/

    return `| ${organizationName}      | Cardano Governance Actions |
| -------------- | ------------------------------------------------------- |
| Proposal Title | [${proposalTitle}](https://adastat.net/governances/${vote.proposalTxHash || 'N/A'}) |
| Hash           | ${vote.proposalTxHash || 'N/A'} |
| Action ID      | ${vote.proposalId || 'N/A'} |
| Type           | ${proposalType} |
| Proposed Epoch | ${proposedEpoch} |
| Expires Epoch  | ${expirationEpoch} |
| Vote           | ${voteText} |
| Vote Submitted | ${submittedDate} |
| Rationale       | ${rationale} |
| Link | [adastat tx link](https://adastat.net/transactions/${vote.voteTxHash || 'N/A'}) |`;
}

// Function to generate yearly markdown file
function generateYearlyMarkdown(votes, year) {
    const filePath = findFileForYear(year);
    if (!filePath) {
        console.error(`No file found for year ${year}`);
        return;
    }

    // Read the existing front matter
    const content = fs.readFileSync(filePath, 'utf8');
    const frontMatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    const frontMatter = frontMatterMatch ? frontMatterMatch[0] : '';

    let newContent = `${frontMatter}\n\n# DRep Voting History for ${year}\n\n`;

    // Sort votes by submission date
    votes.sort((a, b) => new Date(b.blockTime) - new Date(a.blockTime));

    // Add each vote table with a separator
    votes.forEach((vote, index) => {
        if (index > 0) {
            newContent += '\n\n---\n\n'; // Add separator between votes
        }
        newContent += vote.table + '\n';
    });

    fs.writeFileSync(filePath, newContent);
    console.log(`Updated markdown file for year ${year}: ${filePath}`);
}

// Function to update Annual Records section in index file
function updateAnnualRecords() {
    const indexFilePath = path.join(votingHistoryDir, '1001.md');
    try {
        let content = fs.readFileSync(indexFilePath, 'utf8');

        // Find all markdown files in the voting history directory
        const files = fs.readdirSync(votingHistoryDir);
        const yearFiles = files
            .filter(file => file.endsWith('.md') && file !== '1001.md')
            .map(file => {
                const year = readFrontMatter(path.join(votingHistoryDir, file));
                return { file, year };
            })
            .filter(({ year }) => year !== null)
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

async function getDRepVotes(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        // Fetch proposal details first
        const proposalDetails = await getProposalDetails(drepId);

        const response = await axios.get(`https://api.koios.rest/api/v1/drep_votes?_drep_id=${drepId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'accept': 'application/json'
            }
        });

        // Validate response data
        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        // Group votes by year
        const votesByYear = {};

        // Process and validate each vote
        for (const vote of response.data) {
            // Validate required fields
            if (!vote.proposal_id || !vote.vote || !vote.block_time) {
                console.error('Invalid vote data: missing required fields');
                continue;
            }

            // Validate vote enum value
            const validVotes = ['Yes', 'No', 'Abstain'];
            if (!validVotes.includes(vote.vote)) {
                console.error(`Invalid vote value: ${vote.vote}. Must be one of: ${validVotes.join(', ')}`);
                continue;
            }

            const processedVote = {
                proposalId: vote.proposal_id,
                proposalTxHash: vote.proposal_tx_hash + '00',
                proposalIndex: vote.proposal_index,
                voteTxHash: vote.vote_tx_hash,
                blockTime: new Date(vote.block_time * 1000).toISOString(),
                vote: vote.vote,
                metaUrl: vote.meta_url,
                metaHash: vote.meta_hash
            };

            // Fetch metadata if metaUrl is available
            let metadata = null;
            if (processedVote.metaUrl) {
                metadata = await fetchMetadata(processedVote.metaUrl);
            }

            // Generate vote table
            processedVote.table = generateVoteTable(processedVote, proposalDetails, metadata);

            // Get year from blockTime
            const year = new Date(processedVote.blockTime).getFullYear();

            // Add to year group
            if (!votesByYear[year]) {
                votesByYear[year] = [];
            }
            votesByYear[year].push(processedVote);
        }

        // Generate markdown files for each year
        for (const [year, votes] of Object.entries(votesByYear)) {
            generateYearlyMarkdown(votes, parseInt(year));
        }

        // Update the Annual Records section after processing all votes
        updateAnnualRecords();

        console.log('All votes processed and organized by year successfully');
    } catch (error) {
        console.error('Error fetching DRep votes:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        process.exit(1);
    }
}

getDRepVotes(drepId); 