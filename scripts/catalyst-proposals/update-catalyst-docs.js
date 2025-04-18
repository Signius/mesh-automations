import axios from 'axios';
import { PROJECTS_INFO } from './mockData.js';
import { saveCatalystData } from './save-catalyst-data.js';
import { fetchProposalFromChallenge } from './fetch-proposal-from-challenge.js';

// Environment checks
const buildId      = 'pJZYf0Bzp4nPDQmwjxLiJ';
const supabaseUrl  = process.env.NEXT_PUBLIC_SUPABASE_URL2;
const supabaseKey  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY2;
const USE_MOCK_DATA = !supabaseUrl || !supabaseKey;

if (!buildId) {
  throw new Error('Environment variable NEXT_PUBLIC_BUILD_ID is required');
}

let supabase;
if (!USE_MOCK_DATA) {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Determine which projects to process
const README_PROJECT_IDS = process.env.README_PROJECT_IDS;
const PROJECT_IDS = README_PROJECT_IDS
  ? README_PROJECT_IDS.split(',').map(id => id.trim())
  : PROJECTS_INFO.map(p => p.id);

/**
 * Retrieves the basic proposal details from Supabase or mock data.
 */
async function getProposalDetails(projectId) {
  if (USE_MOCK_DATA) {
    const mock = PROJECTS_INFO.find(p => p.id === projectId);
    if (!mock) return null;
    return {
      id: mock.id,
      title: mock.name,
      budget: mock.budget,
      milestones_qty: mock.milestones_qty,
      funds_distributed: mock.funds_distributed,
      project_id: mock.id,
      name: mock.name,
      category: mock.category,
      url: mock.url,
      status: mock.status,
      finished: mock.finished
    };
  }

  const { data, error } = await supabase
    .from('proposals')
    .select(`id, title, budget, milestones_qty, funds_distributed, project_id`)
    .eq('project_id', projectId)
    .single();

  if (error) {
    console.error(`Error fetching proposal ${projectId}:`, error);
    return null;
  }

  const sup = PROJECTS_INFO.find(p => p.id === projectId) ?? {};
  return {
    ...data,
    name: sup.name || data.title,
    category: sup.category || '',
    url: sup.url || '',
    status: sup.status || 'In Progress',
    finished: sup.finished || ''
  };
}

/**
 * Retrieves snapshot data (milestones) via Supabase function or mock.
 */
async function fetchSnapshotData(projectId) {
  if (USE_MOCK_DATA) return [];
  try {
    const res = await axios.post(
      `${supabaseUrl}/rest/v1/rpc/getproposalsnapshot`,
      { _project_id: projectId },
      { headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Content-Profile': 'public',
          'x-client-info': 'supabase-js/2.2.3'
        }
      }
    );
    return res.data;
  } catch (err) {
    console.error(`Snapshot fetch error for ${projectId}:`, err);
    return [];
  }
}

/**
 * Main processing function.
 */
async function main() {
  console.log('Processing Catalyst data...');
  console.log('Using mock data:', USE_MOCK_DATA);

  const projectsByFund = { '10': [], '11': [], '12': [], '13': [] };

  for (const projectId of PROJECT_IDS) {
    const details = await getProposalDetails(projectId);
    if (!details) continue;

    const snapshot = await fetchSnapshotData(projectId);
    const milestonesCompleted = USE_MOCK_DATA
      ? PROJECTS_INFO.find(p => p.id === projectId)?.milestonesCompleted || 0
      : snapshot.filter(m => m.som_signoff_count > 0 && m.poa_signoff_count > 0).length;

    // Extract fund, challengeSlug from the URL
    const { pathname } = new URL(details.url);
    const [, , fundStr, challengeSlug] = pathname.split('/');
    if (!fundStr || !challengeSlug) {
      console.warn('Unexpected URL:', details.url);
      continue;
    }

    // Fetch the full proposal object (with voting) by _fundingId
    let proposalObj = null;
    try {
      proposalObj = await fetchProposalFromChallenge({
        buildId,
        fundId: fundStr,
        challengeSlug,
        fundingId: String(projectId)
      });
    } catch (err) {
      console.error(`Error fetching proposalObj for ${projectId}:`, err);
    }

    const voting = proposalObj?.voting ?? {};

    // Group by fund
    if (projectsByFund[fundStr]) {
      projectsByFund[fundStr].push({
        details,
        milestonesCompleted,
        voting
      });
    }
  }

  // Save final result
  const allProjects = Object.values(projectsByFund).flat();
  await saveCatalystData(allProjects);
  console.log('Catalyst data saved.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
