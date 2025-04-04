import axios from 'axios';
import { PROJECTS_INFO } from './mockData.js';
import { updateFundFile, updateOverviewFile } from './generate-catalyst-markdown.js';
import { saveCatalystData } from './save-catalyst-data.js';

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
    console.log('Generating markdown files...');
    console.log('Using mock data:', USE_MOCK_DATA);

    // Group projects by fund
    const projectsByFund = {
        '10': [],
        '11': [],
        '12': [],
        '13': []
    };

    // Process each project
    for (const projectId of PROJECT_IDS) {
        const projectDetails = await getProposalDetails(projectId);
        if (!projectDetails) continue;

        const snapshotData = await fetchSnapshotData(projectId);

        // Get milestones completed data
        let milestonesCompleted;
        if (USE_MOCK_DATA) {
            const mockProject = PROJECTS_INFO.find(p => p.id === projectId);
            milestonesCompleted = mockProject?.milestonesCompleted || 0;
        } else {
            milestonesCompleted = snapshotData.filter(
                milestone => milestone.som_signoff_count > 0 && milestone.poa_signoff_count > 0
            ).length;
        }

        // Add to fund group
        const fundNumber = String(projectId).substring(0, 2);
        if (projectsByFund[fundNumber]) {
            projectsByFund[fundNumber].push({
                projectDetails,
                milestonesCompleted
            });
        }
    }

    // Update each fund file
    for (const [fundNumber, projects] of Object.entries(projectsByFund)) {
        if (projects.length > 0) {
            await updateFundFile(fundNumber, projects);
        }
    }

    // Update overview file
    const allProjects = Object.values(projectsByFund).flat();
    await updateOverviewFile(allProjects);

    // Save the data as JSON
    await saveCatalystData(allProjects);

    console.log('All markdown files have been updated and data has been saved.');
}

main().catch(error => {
    console.error('Script failed:', error);
    process.exit(1);
}); 