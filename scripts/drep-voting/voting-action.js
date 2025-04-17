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
const { drepId, organizationName } = JSON.parse(
  fs.readFileSync('config.json', 'utf8')
);

if (!drepId) {
  console.error('DRep ID not found in config.json');
  process.exit(1);
}

if (!organizationName) {
  console.error('Organization name not found in config.json');
  process.exit(1);
}

// Read missing rationales file
const missingRationalesPath = path.join(
  __dirname,
  '..',
  '..',
  'voting-history',
  'missing-voting-rationales',
  'rationales.json'
);
let missingRationales = {};
try {
  missingRationales = JSON.parse(fs.readFileSync(missingRationalesPath, 'utf8'));
} catch (error) {
  console.warn('Could not read missing rationales file:', error.message);
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
        return parseInt(yearMatch[1], 10);
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

// Fetch JSON metadata from a URL
async function fetchMetadata(metaUrl) {
  try {
    const response = await axios.get(metaUrl);
    return response.data;
  } catch (error) {
    console.error(`Error fetching metadata from ${metaUrl}:`, error.message);
    return null;
  }
}

// Fetch proposal details via voter_proposal_list (unchanged)
async function getProposalDetails(drepId) {
  try {
    const apiKey = process.env.KOIOS_API_KEY;
    if (!apiKey) {
      throw new Error('KOIOS_API_KEY environment variable is not set');
    }

    const response = await axios.get(
      `https://api.koios.rest/api/v1/voter_proposal_list?_voter_id=${encodeURIComponent(drepId)}`,
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

    console.log(`Found ${response.data.length} proposals in voter_proposal_list`);

    return response.data.reduce((acc, proposal) => {
      if (proposal.proposal_id) {
        acc[proposal.proposal_id] = proposal;
      }
      return acc;
    }, {});
  } catch (error) {
    console.error('Error fetching proposal details:', error.message);
    if (error.response) {
      console.error('API Response:', error.response.data);
    }
    return {};
  }
}

// Fetch rationale from on‑chain governance repo as fallback
async function fetchGovernanceRationale(proposalId, year = null, epoch = null) {
  try {
    const baseUrl = 'https://raw.githubusercontent.com/Andre-Diamond/mesh-governance/refs/heads/main/vote-context';
    console.log(`\nFetching rationale for proposal ${proposalId} (year: ${year}, epoch: ${epoch})`);

    const shortenedId = proposalId.slice(-4);

    if (year && epoch) {
      const directUrl = `${baseUrl}/${year}/${epoch}_${shortenedId}/Vote_Context.json`;
      try {
        const { data } = await axios.get(directUrl);
        const parsed = typeof data === 'string' ? JSON.parse(data) : data;
        return parsed?.body?.comment || null;
      } catch {
        // fall through
      }
    }

    const currentYear = new Date().getFullYear();
    const years = year ? [year] : [currentYear];
    const epochs = epoch ? [epoch] : [];

    for (const y of years) {
      // try specified epoch(s) first
      for (const e of epochs) {
        const url = `${baseUrl}/${y}/${e}_${shortenedId}/Vote_Context.json`;
        try {
          const { data } = await axios.get(url);
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsed?.body?.comment) return parsed.body.comment;
        } catch {
          // continue
        }
      }
      // then try epoch range
      const start = epoch || 500;
      const end = epoch || 600;
      for (let e = start; e <= end; e++) {
        const url = `${baseUrl}/${y}/${e}_${shortenedId}/Vote_Context.json`;
        try {
          const { data } = await axios.get(url);
          const parsed = typeof data === 'string' ? JSON.parse(data) : data;
          if (parsed?.body?.comment) return parsed.body.comment;
        } catch {
          // continue
        }
      }
    }

    return null;
  } catch (error) {
    console.warn(`Could not fetch rationale for ${proposalId}:`, error.message);
    return null;
  }
}

// Main: fetch vote list from new endpoint and process
async function getDRepVotes(drepId) {
  try {
    const apiKey = process.env.KOIOS_API_KEY;
    if (!apiKey) throw new Error('KOIOS_API_KEY environment variable is not set');

    // New `vote_list` endpoint with PostgREST filter
    const base = 'https://api.koios.rest/api/v1/vote_list';
    const url = `${base}?drep_id=eq.${encodeURIComponent(drepId)}`;

    const resp = await axios.get(url, { headers: { api_key: apiKey } });
    const rawVotes = Array.isArray(resp.data) ? resp.data : [];
    console.log(`Fetched ${rawVotes.length} entries from vote_list`);

    const proposalMap = await getProposalDetails(drepId);
    const votesByYear = {};

    for (const v of rawVotes) {
      // Map fields into your standard shape
      const blockTime = new Date(v.block_height * 1000).toISOString();
      const voteRecord = {
        proposalId: v.gov_action_id,
        proposalTxHash: v.gov_action_tx_hash + '00',
        proposalIndex: v.gov_action_index,
        voteTxHash: v.tx_hash,
        blockTime,
        vote: v.vote_cast,
        metaUrl: v.meta_url,
        metaHash: v.meta_hash
      };

      // Metadata
      const metadata = voteRecord.metaUrl ? await fetchMetadata(voteRecord.metaUrl) : null;

      // Rationale resolution
      let rationale =
        missingRationales[voteRecord.proposalId]?.rationale ||
        metadata?.body?.comment ||
        metadata?.body?.rationale;

      if (!rationale) {
        const year = new Date(voteRecord.blockTime).getFullYear();
        rationale = await fetchGovernanceRationale(
          voteRecord.proposalId,
          year,
          proposalMap[voteRecord.proposalId]?.proposed_epoch
        );
      }

      // Proposal details
      const prop = proposalMap[voteRecord.proposalId] || {};
      voteRecord.proposalTitle =
        prop.meta_json?.body?.title ||
        missingRationales[voteRecord.proposalId]?.title ||
        'Unknown Proposal';
      voteRecord.proposalType = prop.proposal_type || 'Unknown';
      voteRecord.proposedEpoch = prop.proposed_epoch || 'N/A';
      voteRecord.expirationEpoch = prop.expiration || 'N/A';
      voteRecord.rationale = rationale || 'No rationale available';

      // Group by year
      const y = new Date(voteRecord.blockTime).getFullYear();
      votesByYear[y] = votesByYear[y] || [];
      votesByYear[y].push(voteRecord);
    }

    // Output JSON files per year
    for (const [year, votes] of Object.entries(votesByYear)) {
      if (CONFIG.generateJson) saveVotingJson(votes, year);
    }

    console.log('All votes processed and organized by year successfully');
  } catch (error) {
    console.error('Error fetching DRep votes:', error.message);
    if (error.response) console.error('API Response:', error.response.data);
    process.exit(1);
  }
}

getDRepVotes(drepId);
