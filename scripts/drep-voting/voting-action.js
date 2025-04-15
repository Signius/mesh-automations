import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { saveVotingJson } from '../drep-voting/generate-voting-json.js';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const CONFIG = {
    generateJson: true      // Set to false to skip JSON generation
};

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;
const organizationName = config.organizationName;

// Read missing rationales file
const missingRationalesPath = path.join(__dirname, '..', '..', 'voting-history', 'missing-voting-rationales', 'rationales.json');
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
const votingHistoryDir = path.join('mesh-gov-updates', 'drep-voting', 'markdown');

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

            // Get proposal details
            const proposal = proposalDetails[vote.proposal_id] || {};

            // Add proposal details to vote
            processedVote.proposalTitle = proposal.meta_json?.body?.title || missingRationales[vote.proposal_id]?.title || 'Unknown Proposal';
            processedVote.proposalType = proposal.proposal_type || 'Unknown';
            processedVote.proposedEpoch = proposal.proposed_epoch || 'N/A';
            processedVote.expirationEpoch = proposal.expiration || 'N/A';
            processedVote.rationale = metadata?.body?.comment || metadata?.body?.rationale || missingRationales[vote.proposal_id]?.rationale || 'No rationale available';

            // Get year from blockTime
            const year = new Date(processedVote.blockTime).getFullYear();

            // Add to year group
            if (!votesByYear[year]) {
                votesByYear[year] = [];
            }
            votesByYear[year].push(processedVote);
        }

        // Generate outputs for each year based on configuration
        for (const [year, votes] of Object.entries(votesByYear)) {
            if (CONFIG.generateJson) {
                saveVotingJson(votes, year);
            }
        }

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