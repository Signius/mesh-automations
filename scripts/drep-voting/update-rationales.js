import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_URL = 'https://raw.githubusercontent.com/MeshJS/governance/refs/heads/main/vote-context';
const CURRENT_YEAR = new Date().getFullYear();

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

// Read existing missing rationales
const missingRationalesPath = path.join(__dirname, '..', '..', 'voting-history', 'missing-voting-rationales', 'rationales.json');
let missingRationales = {};
try {
    missingRationales = JSON.parse(fs.readFileSync(missingRationalesPath, 'utf8'));
} catch (error) {
    console.warn('Could not read missing rationales file:', error.message);
}

async function getProposalList() {
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

        // Create a map of proposal details by proposal_id
        const proposalMap = response.data.reduce((acc, proposal) => {
            if (!proposal.proposal_id) {
                console.warn('Found proposal without proposal_id, skipping');
                return acc;
            }
            acc[proposal.proposal_id] = {
                title: proposal.meta_json?.body?.title || 'Unknown Proposal',
                proposal: proposal
            };
            return acc;
        }, {});

        console.log(`Successfully mapped ${Object.keys(proposalMap).length} proposals`);
        return proposalMap;
    } catch (error) {
        console.error('Error fetching proposal list:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return {};
    }
}

async function fetchVoteContext(epoch, shortId) {
    try {
        const url = `${BASE_URL}/${CURRENT_YEAR}/${epoch}_${shortId}/Vote_Context.jsonId`;
        const response = await axios.get(url);

        if (response.data) {
            try {
                const parsedData = typeof response.data === 'string' ? JSON.parse(response.data) : response.data;
                if (parsedData?.body?.comment) {
                    return parsedData.body.comment;
                }
            } catch (parseError) {
                console.warn(`Failed to parse response for ${epoch}_${shortId}:`, parseError.message);
            }
        }
        return null;
    } catch (error) {
        // File not found or other error
        return null;
    }
}

async function scanVoteContexts(proposalMap) {
    const newRationales = {};
    const processedIds = new Set();

    // Scan through epochs 500-600 for the current year
    for (let epoch = 500; epoch <= 600; epoch++) {
        for (const [proposalId, proposalData] of Object.entries(proposalMap)) {
            // Skip if we've already processed this proposal
            if (processedIds.has(proposalId)) continue;

            // Extract last 4 characters of proposal ID
            const shortId = proposalId.slice(-4);

            const rationale = await fetchVoteContext(epoch, shortId);
            if (rationale) {
                newRationales[proposalId] = {
                    title: proposalData.title,
                    rationale: rationale
                };
                processedIds.add(proposalId);
            }
        }
    }

    return newRationales;
}

async function updateMissingRationales() {
    try {
        // Get proposal list with titles
        const proposalMap = await getProposalList();
        console.log(`Found ${Object.keys(proposalMap).length} proposals`);

        // Scan vote contexts
        const newRationales = await scanVoteContexts(proposalMap);
        console.log(`Found ${Object.keys(newRationales).length} new rationales`);

        // Update missing rationales
        let updated = false;
        for (const [proposalId, data] of Object.entries(newRationales)) {
            if (!missingRationales[proposalId]) {
                missingRationales[proposalId] = data;
                updated = true;
                console.log(`Added new rationale for proposal ${proposalId}`);
            }
        }

        // Save updated rationales if changes were made
        if (updated) {
            fs.writeFileSync(
                missingRationalesPath,
                JSON.stringify(missingRationales, null, 4)
            );
            console.log('Updated missing rationales file');
        } else {
            console.log('No new rationales to add');
        }

    } catch (error) {
        console.error('Error updating missing rationales:', error.message);
        process.exit(1);
    }
}

updateMissingRationales(); 