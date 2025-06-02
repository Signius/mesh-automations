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

async function fetchVoteContext(epoch, shortId) {
    const url = `${BASE_URL}/${CURRENT_YEAR}/${epoch}_${shortId}/Vote_Context.jsonId`;

    try {
        const response = await axios.get(url);

        let parsedData;
        try {
            parsedData = typeof response.data === 'string'
                ? JSON.parse(response.data)
                : response.data;
        } catch (parseError) {
            const cleanedData = response.data.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');
            parsedData = JSON.parse(cleanedData);
        }

        if (parsedData?.body?.comment) {
            return parsedData.body.comment;
        }
    } catch (error) {
        // Likely a 404 or bad JSON
    }

    return null;
}

async function scanVoteContexts(proposalMap) {
    const newRationales = {};
    const processedIds = new Set();

    for (let epoch = 500; epoch <= 600; epoch++) {
        for (const [proposalId, proposalData] of Object.entries(proposalMap)) {
            if (processedIds.has(proposalId)) continue;

            const shortId = proposalId.slice(-4);
            const rationale = await fetchVoteContext(epoch, shortId);

            if (rationale) {
                newRationales[proposalId] = {
                    title: proposalData.title,
                    rationale
                };
                processedIds.add(proposalId);
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
                missingRationales[proposalId] = {
                    title: data.title,
                    rationale: data.rationale
                };
                updated = true;
                console.log(`Added new rationale for proposal ${proposalId}`);
            }
        }

        if (updated) {
            const jsonString = JSON.stringify(missingRationales, null, 4);
            fs.writeFileSync(missingRationalesPath, jsonString, { encoding: 'utf8' });
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
