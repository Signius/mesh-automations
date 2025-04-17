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

// Function to fetch rationale from Cardano governance repository
async function fetchGovernanceRationale(proposalId, year = null, epoch = null) {
    try {
        const baseUrl = 'https://raw.githubusercontent.com/Andre-Diamond/mesh-governance/refs/heads/main/vote-context';

        // If we have year and epoch, try the direct path first
        if (year && epoch) {
            const directUrl = `${baseUrl}/${year}/${epoch}/Vote_Context.jsonId`;
            try {
                const response = await axios.get(directUrl);
                if (response.data?.body?.comment) {
                    return response.data.body.comment;
                }
            } catch (error) {
                console.warn(`Direct path not found for proposal ${proposalId}, trying year folders`);
            }
        }

        // If direct path failed or we don't have year/epoch, search through year folders
        const currentYear = new Date().getFullYear();
        const years = year ? [year] : [currentYear]; // Only search current year if no year provided
        const epochs = epoch ? [epoch] : []; // If no epoch provided, we'll search all epochs in the year folders

        for (const currentYear of years) {
            // If we have a specific epoch, try that first
            if (epochs.length > 0) {
                for (const currentEpoch of epochs) {
                    const searchUrl = `${baseUrl}/${currentYear}/${currentEpoch}/Vote_Context.jsonId`;
                    try {
                        const response = await axios.get(searchUrl);
                        if (response.data?.body?.comment) {
                            return response.data.body.comment;
                        }
                    } catch (error) {
                        // Continue to next combination
                        continue;
                    }
                }
            }

            // If no specific epoch or if specific epoch search failed, try to list all epochs in the year folder
            try {
                const yearUrl = `${baseUrl}/${currentYear}`;
                const response = await axios.get(yearUrl);
                if (response.data) {
                    // Assuming the response contains a list of epoch folders
                    const epochFolders = response.data.filter(item => item.type === 'dir');
                    for (const folder of epochFolders) {
                        const searchUrl = `${baseUrl}/${currentYear}/${folder.name}/Vote_Context.jsonId`;
                        try {
                            const rationaleResponse = await axios.get(searchUrl);
                            if (rationaleResponse.data?.body?.comment) {
                                return rationaleResponse.data.body.comment;
                            }
                        } catch (error) {
                            continue;
                        }
                    }
                }
            } catch (error) {
                console.warn(`Could not list epochs for year ${currentYear}:`, error.message);
                continue;
            }
        }

        return null;
    } catch (error) {
        console.warn(`Could not fetch rationale from governance repository for proposal ${proposalId}:`, error.message);
        return null;
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

            // Try to get rationale from multiple sources in order of preference
            let rationale = null;
            if (metadata?.body?.comment) {
                rationale = metadata.body.comment;
            } else if (metadata?.body?.rationale) {
                rationale = metadata.body.rationale;
            } else if (missingRationales[vote.proposal_id]?.rationale) {
                rationale = missingRationales[vote.proposal_id].rationale;
            } else {
                // Try to fetch from governance repository as last resort
                const year = new Date(processedVote.blockTime).getFullYear();
                const epoch = proposal.proposed_epoch;
                rationale = await fetchGovernanceRationale(vote.proposal_id, year, epoch);
            }

            // Add proposal details to vote
            processedVote.proposalTitle = proposal.meta_json?.body?.title || missingRationales[vote.proposal_id]?.title || 'Unknown Proposal';
            processedVote.proposalType = proposal.proposal_type || 'Unknown';
            processedVote.proposedEpoch = proposal.proposed_epoch || 'N/A';
            processedVote.expirationEpoch = proposal.expiration || 'N/A';
            processedVote.rationale = rationale || 'No rationale available';

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