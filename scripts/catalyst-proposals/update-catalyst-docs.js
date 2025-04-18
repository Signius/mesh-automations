import axios from 'axios';
import { PROJECTS_INFO } from './mockData.js';
import { saveCatalystData } from './save-catalyst-data.js';
import { fetchVotingResults } from './fetch-voting-results.js';

// Initialize constants
const MILESTONES_BASE_URL = process.env.NEXT_PUBLIC_MILESTONES_URL || 'https://milestones.projectcatalyst.io';

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
    ? README_PROJECT_IDS.split(',').map(id => id.trim())
    : PROJECTS_INFO.map(project => project.id);

/**
 * Retrieves the proposal details.
 */
async function getProposalDetails(projectId) {
    console.log(`Getting proposal details for project ${projectId}`);

    if (USE_MOCK_DATA) {
        // Use mock data from our predefined array
        const mockProject = PROJECTS_INFO.find(p => p.id === projectId);
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
                finished: mockProject.finished
            };
        }
        return null;
    }

    // Real data from Supabase
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
        console.error(`Error fetching proposal details for project ${projectId}:`, error);
        return null;
    }

    // Find supplementary info from our predefined array
    const supplementaryInfo = PROJECTS_INFO.find(p => p.id === projectId);

    const enhancedData = {
        ...data,
        name: supplementaryInfo?.name || data.title,
        category: supplementaryInfo?.category || '',
        url: supplementaryInfo?.url || '',
        status: supplementaryInfo?.status || 'In Progress',
        finished: supplementaryInfo?.finished || ''
    };

    console.log(`Found proposal details for project ${projectId}:`, enhancedData);
    return enhancedData;
}

/**
 * Fetches milestone snapshot data.
 */
async function fetchSnapshotData(projectId) {
    if (USE_MOCK_DATA) {
        // Return empty array for mock data as we'll use hardcoded completion values
        return [];
    }

    try {
        const response = await axios({
            method: 'POST',
            url: `${supabaseUrl}/rest/v1/rpc/getproposalsnapshot`,
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json',
                'Content-Profile': 'public',
                'x-client-info': 'supabase-js/2.2.3'
            },
            data: { _project_id: projectId }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching snapshot data for project ${projectId}:`, error);
        return [];
    }
}

/**
 * Main function.
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

    // parse URL for fund, challengeSlug, projectSlug
    const urlObj = new URL(details.url);
    const [, , fundStr, challengeSlug, projectSlug] = urlObj.pathname.split('/');
    if (!fundStr || !challengeSlug || !projectSlug) continue;

    let voting = {};
    try {
      voting = await fetchVotingResults({ buildId: 'pJZYf0Bzp4nPDQmwjxLiJ', fundId: fundStr, challengeSlug, projectSlug });
    } catch (err) {
      console.error(`Voting error for ${projectSlug}:`, err);
    }

    if (projectsByFund[fundStr]) {
      projectsByFund[fundStr].push({ details, milestonesCompleted, voting });
    }
  }

  const all = Object.values(projectsByFund).flat();
  await saveCatalystData(all);
  console.log('Catalyst data has been processed and saved.');
}

main().catch(err => {
  console.error('Script failed:', err);
  process.exit(1);
});
