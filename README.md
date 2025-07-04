# DRep Voting History Automation

A Node.js automation tool for tracking and documenting DRep (Delegate Representative) voting activities in the Cardano Blockchain Governance system.

## What it Does

- Automatically fetches DRep voting history using the Koios API
- Generates organized markdown documentation of voting records
- Tracks missing voting rationales
- Organizes voting history by year
- Integrates with documentation systems
- Updates Catalyst proposal information and voting status
- Tracks proposal funding and implementation progress
- Collects Discord engagement statistics via API
- Monitors community activity and participation metrics

## Repository Structure

- `scripts/` - Automation scripts for data collection and processing
- `voting-history/` - Voting rationales
- `apps/docs/` - Documentation output
- `config.json` - Configuration settings
- `catalyst-proposals/` - Catalyst proposal tracking and updates
- `mesh-gov-updates/` - Community statistics and governance data

## Setup

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure your environment:
   - Copy `.env.example` to `.env`
   - Update `config.json` with your DRep ID and organization details

## Usage

The automation runs through GitHub Actions to:
- Fetch latest voting data
- Generate documentation
- Track missing rationales
- Update voting history
- Monitor and update Catalyst proposal status
- Track proposal funding and implementation milestones
- Collect Discord engagement statistics monthly
- Update community activity metrics



