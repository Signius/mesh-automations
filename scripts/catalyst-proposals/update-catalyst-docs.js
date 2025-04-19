// index.js
import axios from 'axios';
import { PROJECTS_INFO } from './mockData.js';
import { saveCatalystData } from './save-catalyst-data.js';
// ← NEW: import your voting helper
import { getProjectVotingResults } from './get-catalyst-vote-results.js';

// Initialize constants
const MILESTONES_BASE_URL =
  process.env.NEXT_PUBLIC_MILESTONES_URL ||
  'https://milestones.projectcatalyst.io';

// Get project IDs from environment variable
const README_PROJECT_IDS = process.env.README_PROJECT_IDS;
console.log('Project IDs from environment:', README_PROJECT_IDS);

// Supabase credentials check - we'll use mock data if they're missing
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL2;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY2;
const USE_MOCK_DATA = !supabaseUrl || !supabaseKey;

let supabase;
if (!USE_MOCK_DATA) {
  const { createClient } = await import('@supabase/supabase-js');
  supabase = createClient(supabaseUrl, supabaseKey);
}

// Extract just the project IDs
// Use environment variable project IDs if available, otherwise use the ones from PROJECTS_INFO
const PROJECT_IDS = README_PROJECT_IDS
  ? README_PROJECT_IDS.split(',').map((id) => id.trim())
  : PROJECTS_INFO.map((project) => project.id);

/**
 * Retrieves the proposal details.
 */
async function getProposalDetails(projectId) {
  console.log(`Getting proposal details for project ${projectId}`);

  if (USE_MOCK_DATA) {
    const mockProject = PROJECTS_INFO.find((p) => p.id === projectId);
    if (mockProject) {
      console.log(`Using mock data for project ${projectId}`);
      return {
        id: mockProject.id,
        title: mockProject.name,
        budget: mockProject.budget,
        milestones_qty: mockProject.milestones_qty,
        funds_distributed: mockProject.funds_distributed,
        project_id: mockProject.id,
        name: mockProject.name,
        category: mockProject.category,
        url: mockProject.url,
        status: mockProject.status,
        finished: mockProject.finished,
      };
    }
    return null;
  }

  const { data, error } = await supabase
    .from('proposals')
    .select(`
      id,
      title,
      budget,
      milestones_qty,
      funds_distributed,
      project_id
    `)
    .eq('project_id', projectId)
    .single();

  if (error) {
    console.error(
      `Error fetching proposal details for project ${projectId}:`,
      error
    );
    return null;
  }

  const supplementaryInfo = PROJECTS_INFO.find((p) => p.id === projectId);

  return {
    ...data,
    name: supplementaryInfo?.name || data.title,
    category: supplementaryInfo?.category || '',
    url: supplementaryInfo?.url || '',
    status: supplementaryInfo?.status || 'In Progress',
    finished: supplementaryInfo?.finished || '',
  };
}

/**
 * Fetches milestone snapshot data.
 */
async function fetchSnapshotData(projectId) {
  if (USE_MOCK_DATA) {
    return [];
  }
  try {
    const response = await axios({
      method: 'POST',
      url: `${supabaseUrl}/rest/v1/rpc/getproposalsnapshot`,
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Content-Profile': 'public',
        'x-client-info': 'supabase-js/2.2.3',
      },
      data: { _project_id: projectId },
    });
    return response.data;
  } catch (error) {
    console.error(
      `Error fetching snapshot data for project ${projectId}:`,
      error
    );
    return [];
  }
}

/**
 * Main function.
 */
async function main() {
  console.log('Processing Catalyst data...');
  console.log('Using mock data:', USE_MOCK_DATA);

  const projectsByFund = {
    '10': [],
    '11': [],
    '12': [],
    '13': [],
  };

  for (const projectId of PROJECT_IDS) {
    const projectDetails = await getProposalDetails(projectId);
    if (!projectDetails) continue;

    // 1) snapshot for milestones
    const snapshotData = await fetchSnapshotData(projectId);
    const milestonesCompleted = USE_MOCK_DATA
      ? PROJECTS_INFO.find((p) => p.id === projectId)
          ?.milestonesCompleted || 0
      : snapshotData.filter(
          (m) => m.som_signoff_count > 0 && m.poa_signoff_count > 0
        ).length;

    // 2) parse fundId & challengeSlug from the project URL
    //    e.g. /funds/10/f10-osde-open-source-dev-ecosystem/...
    let fundIdFromUrl, challengeSlug;
    try {
      const url = new URL(projectDetails.url);
      const segments = url.pathname.split('/').filter(Boolean);
      // ["funds","10","f10-osde-open-source-dev-ecosystem", ...]
      fundIdFromUrl = segments[1];
      const rawSegment = segments[2] || '';
      // strip the leading `f<fundId>-`
      challengeSlug =
        rawSegment.replace(new RegExp(`^f${fundIdFromUrl}-`), '') || '';
    } catch (e) {
      console.warn(
        `Could not parse URL for project ${projectId}, skipping voting fetch:`,
        e
      );
    }

    // 3) fetch voting results
    let voting = null;
    if (fundIdFromUrl && challengeSlug) {
      try {
        voting = await getProjectVotingResults({
          fundId: fundIdFromUrl,
          challengeSlug,
          fundingId: projectId,
        });
      } catch (err) {
        console.error(
          `Error fetching voting for project ${projectId}:`,
          err
        );
      }
    }

    // 4) push into our grouped data
    const fundGroup = projectsByFund[fundIdFromUrl];
    if (fundGroup) {
      fundGroup.push({
        projectDetails: {
          ...projectDetails,
          // inject voting key (will be null if we failed)
          voting,
        },
        milestonesCompleted,
      });
    }
  }

  // Save everything out
  const allProjects = Object.values(projectsByFund).flat();
  await saveCatalystData(allProjects);

  console.log('Catalyst data has been processed and saved.');
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
