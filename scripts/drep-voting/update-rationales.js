import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_URL = 'https://raw.githubusercontent.com/MeshJS/governance/refs/heads/main/vote-context';
const CURRENT_YEAR = new Date().getFullYear();
const CONFIG_PATH = path.join(__dirname, '..', '..', 'config.json');
const missingRationalesPath = path.join(__dirname, '..', '..', 'voting-history', 'missing-voting-rationales', 'rationales.json');

// Load config
const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
const drepId = config.drepId;

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

// Load existing rationales
let missingRationales = {};
try {
    missingRationales = JSON.parse(fs.readFileSync(missingRationalesPath, 'utf8'));
} catch (error) {
    console.warn('Could not read missing rationales file:', error.message);
}

async function getProposalList() {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) throw new Error('KOIOS_API_KEY environment variable is not set');

        const response = await axios.get(
            `https://api.koios.rest/api/v1/voter_proposal_list?_voter_id=${drepId}`,
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'accept': 'application/json'
                }
            }
        );

        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        const proposalMap = response.data.reduce((acc, proposal) => {
            if (!proposal.proposal_id) return acc;
            acc[proposal.proposal_id] = {
                title: proposal.meta_json?.body?.title || 'Unknown Proposal',
                proposal
            };
            return acc;
        }, {});

        console.log(`Successfully mapped ${Object.keys(proposalMap).length} proposals`);
        return proposalMap;
    } catch (error) {
        console.error('Error fetching proposal list:', error.message);
        if (error.response) console.error('API Response:', error.response.data);
        return {};
    }
}

async function getAvailableVoteContextFolders() {
    const url = 'https://api.github.com/repos/MeshJS/governance/contents/vote-context/2025';

    try {
        const response = await axios.get(url, {
            headers: {
                'Accept': 'application/vnd.github.v3+json'
                // Add Authorization header if hitting rate limits
            }
        });

        return response.data
            .filter(item => item.type === 'dir')
            .map(item => item.name); // e.g., ["506_phgh", "507_r9wx"]
    } catch (error) {
        console.error('Failed to fetch vote-context folders:', error.message);
        return [];
    }
}

async function fetchVoteContext(epoch, shortId) {
    const url = `${BASE_URL}/${CURRENT_YEAR}/${epoch}_${shortId}/Vote_Context.jsonId`;

    try {
        const response = await axios.get(url, { responseType: 'text' });

        // Print raw response data for debugging
        console.log('--- Raw response.data ---\n' + response.data + '\n--- END RAW ---');

        let parsedData;
        try {
            // Normalize all literal line breaks in the raw JSON string before parsing
            const normalizedRaw = response.data.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
            parsedData = JSON.parse(normalizedRaw);
        } catch (parseError) {
            const cleaned = response.data.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            parsedData = JSON.parse(cleaned);
        }

        if (parsedData?.body?.comment && typeof parsedData.body.comment === 'string') {
            // Print raw comment before normalization
            console.log('--- Raw comment ---\n' + parsedData.body.comment + '\n--- END RAW COMMENT ---');
            // Print JSON stringified version to see if \n are present
            console.log('--- JSON.stringify(comment) ---\n' + JSON.stringify(parsedData.body.comment) + '\n--- END JSON.stringify ---');
            // No need to normalize again, already done above
            return parsedData.body.comment.trim();
        }
    } catch (error) {
        if (error.response?.status !== 404) {
            console.warn(`Fetch failed for ${epoch}_${shortId}:`, error.message);
        }
    }

    return null;
}

async function scanVoteContexts(proposalMap) {
    const availableFolders = await getAvailableVoteContextFolders();

    const newRationales = {};
    const processedIds = new Set();

    for (const folderName of availableFolders) {
        const match = folderName.match(/^(\d+)_(\w{4})$/);
        if (!match) continue;

        const [_, epoch, shortId] = match;

        for (const [proposalId, proposalData] of Object.entries(proposalMap)) {
            if (processedIds.has(proposalId)) continue;
            if (!proposalId.endsWith(shortId)) continue;

            const rationale = await fetchVoteContext(epoch, shortId);
            if (rationale) {
                newRationales[proposalId] = {
                    title: proposalData.title,
                    rationale
                };
                processedIds.add(proposalId);
                break; // Stop checking more folders once matched
            }
        }
    }

    return newRationales;
}

async function updateMissingRationales() {
    try {
        const proposalMap = await getProposalList();
        console.log(`Found ${Object.keys(proposalMap).length} proposals`);

        const newRationales = await scanVoteContexts(proposalMap);
        console.log(`Found ${Object.keys(newRationales).length} new rationales`);

        let updated = false;

        for (const [proposalId, data] of Object.entries(newRationales)) {
            if (!missingRationales[proposalId]) {
                // Debug: print rationale to check for newlines
                console.log('--- Rationale for', proposalId, '---\n' + data.rationale + '\n--- END ---');
                missingRationales[proposalId] = {
                    title: data.title,
                    rationale: data.rationale // Store as-is, preserve formatting
                };
                updated = true;
                console.log(`✅ Added new rationale for proposal ${proposalId}`);
            }
        }

        if (updated) {
            const jsonString = JSON.stringify(missingRationales, null, 4);
            fs.writeFileSync(missingRationalesPath, jsonString, { encoding: 'utf8' });
            console.log('✅ Updated missing rationales file');
        } else {
            console.log('No new rationales to add');
        }

    } catch (error) {
        console.error('❌ Error updating missing rationales:', error.message);
        process.exit(1);
    }
}

updateMissingRationales();