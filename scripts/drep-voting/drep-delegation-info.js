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

    // Prepare the data to save
    const delegationData = {
        timestamp: new Date().toISOString(),
        drepId: drepId,
        totalDelegators: delegators.length,
        totalDelegationFromDelegators: totalDelegationFromDelegators.toString(),
        totalAmountDelegatedToDRep: drepInfo?.amount || 'N/A',
        drepInfo: drepInfo,
        delegators: delegators
    };

    // Save to JSON file
    const outputPath = path.join(__dirname, '..', '..', 'mesh-gov-updates', 'drep-voting', 'drep-delegation-info.json');
    fs.writeFileSync(outputPath, JSON.stringify(delegationData, null, 2));
    console.log(`\nDelegation information saved to ${outputPath}`);

    // Log summary
    console.log('\nDelegation Summary:');
    console.log(`- Total Delegators: ${delegators.length}`);
    console.log(`- Total Delegation from Delegators: ${totalDelegationFromDelegators.toString()}`);
    console.log(`- Total Amount Delegated to DRep: ${drepInfo?.amount || 'N/A'}`);
}

main(); 