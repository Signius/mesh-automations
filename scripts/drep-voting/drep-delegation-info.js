import 'dotenv/config';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read config file
const config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
const drepId = config.drepId;

if (!drepId) {
    console.error('DRep ID not found in config.json');
    process.exit(1);
}

async function getDRepDelegators(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        const response = await axios.get(`https://api.koios.rest/api/v1/drep_delegators?_drep_id=${drepId}`, {
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'accept': 'application/json'
            }
        });

        if (!Array.isArray(response.data)) {
            throw new Error('Invalid response format: expected an array');
        }

        console.log(`Found ${response.data.length} delegators for DRep ${drepId}`);
        return response.data;
    } catch (error) {
        console.error('Error fetching DRep delegators:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return [];
    }
}

async function getDRepInfo(drepId) {
    try {
        const apiKey = process.env.KOIOS_API_KEY;
        if (!apiKey) {
            throw new Error('KOIOS_API_KEY environment variable is not set');
        }

        const response = await axios.post('https://api.koios.rest/api/v1/drep_info',
            { _drep_ids: [drepId] },
            {
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'accept': 'application/json',
                    'content-type': 'application/json'
                }
            }
        );

        if (!Array.isArray(response.data) || response.data.length === 0) {
            throw new Error('Invalid response format or DRep not found');
        }

        const drepInfo = response.data[0];
        console.log(`DRep Info for ${drepId}:`);
        console.log(`- Total Amount Delegated to DRep: ${drepInfo.amount}`);
        console.log(`- Active: ${drepInfo.active}`);
        console.log(`- Registered: ${drepInfo.registered}`);
        console.log(`- Expires Epoch: ${drepInfo.expires_epoch_no}`);

        return drepInfo;
    } catch (error) {
        console.error('Error fetching DRep info:', error.message);
        if (error.response) {
            console.error('API Response:', error.response.data);
        }
        return null;
    }
}

async function main() {
    const delegators = await getDRepDelegators(drepId);
    const drepInfo = await getDRepInfo(drepId);

    // Calculate total delegation amount from delegators
    const totalDelegationFromDelegators = delegators.reduce((sum, delegator) => {
        return sum + BigInt(delegator.amount);
    }, BigInt(0));

    // Read existing JSON file
    const outputPath = path.join(__dirname, '..', '..', 'mesh-gov-updates', 'drep-voting', 'drep-delegation-info.json');
    let existingData = { timeline: { epochs: {}, delegations: [] } };
    try {
        if (fs.existsSync(outputPath)) {
            existingData = JSON.parse(fs.readFileSync(outputPath, 'utf8'));
        }
    } catch (error) {
        console.error('Error reading existing JSON file:', error.message);
    }

    // Get current epoch
    const currentEpoch = drepInfo?.expires_epoch_no || 0;

    // Calculate new delegations and removals
    const existingDelegations = new Map(
        existingData.timeline.delegations.map(d => [d.stake_address, d])
    );
    const currentDelegations = new Map(
        delegators.map(d => [d.stake_address, d])
    );

    // Find new delegations and removals
    const newDelegations = [];
    const removedDelegations = [];

    for (const [stakeAddress, delegator] of currentDelegations) {
        if (!existingDelegations.has(stakeAddress)) {
            newDelegations.push({
                stake_address: stakeAddress,
                epoch_no: currentEpoch,
                amount_lovelace: delegator.amount
            });
        }
    }

    for (const [stakeAddress, delegator] of existingDelegations) {
        if (!currentDelegations.has(stakeAddress)) {
            removedDelegations.push(delegator);
        }
    }

    // Update timeline data
    const newEpochData = {
        new_delegations: newDelegations.length,
        new_amount_lovelace: newDelegations.reduce((sum, d) => sum + BigInt(d.amount_lovelace), BigInt(0)).toString(),
        cumulative_amount_lovelace: totalDelegationFromDelegators.toString()
    };

    // Update the timeline
    existingData.timeline.epochs[currentEpoch] = newEpochData;
    existingData.timeline.current_epoch = currentEpoch;
    existingData.timeline.total_delegations = delegators.length;
    existingData.timeline.total_amount_ada = Number(totalDelegationFromDelegators) / 1000000;

    // Update delegations list
    existingData.timeline.delegations = delegators.map(d => ({
        stake_address: d.stake_address,
        epoch_no: currentEpoch,
        amount_lovelace: d.amount
    }));

    // Save to JSON file
    fs.writeFileSync(outputPath, JSON.stringify(existingData, null, 2));
    console.log(`\nDelegation information saved to ${outputPath}`);

    // Log summary
    console.log('\nDelegation Summary:');
    console.log(`- Total Delegators: ${delegators.length}`);
    console.log(`- New Delegations: ${newDelegations.length}`);
    console.log(`- Removed Delegations: ${removedDelegations.length}`);
    console.log(`- Total Delegation Amount: ${totalDelegationFromDelegators.toString()}`);
}

main(); 