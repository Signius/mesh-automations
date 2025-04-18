import axios from 'axios';

/**
 * Fetch voting results for a single proposal page.
 *
 * @param {Object} params
 * @param {string} params.buildId        – Next.js build ID (e.g. process.env.NEXT_PUBLIC_BUILD_ID)
 * @param {string} params.fundId         – Funding round ID (e.g. '10')
 * @param {string} params.challengeSlug  – Challenge slug (e.g. 'osde-open-source-dev-ecosystem')
 * @param {string} params.projectSlug    – Proposal page slug (e.g. 'meshjs-sdk-operations-…')
 * @returns {Promise<Object>}            – { votesCast, yes, no, abstain, meetsApprovalThreshold, … }
 */
export async function fetchVotingResults({
  buildId,
  fundId,
  challengeSlug,
  projectSlug
}) {
  if (!buildId) {
    throw new Error('Missing NEXT_PUBLIC_BUILD_ID');
  }

  const url = `https://projectcatalyst.io/_next/data/${buildId}/en/funds/${fundId}/${challengeSlug}/${projectSlug}.json`;
  const res = await axios.get(url, { headers: { Accept: 'application/json' } });
  if (res.status !== 200) {
    throw new Error(`Voting fetch failed: ${res.status} ${res.statusText}`);
  }

  // Next.js payload nests it under pageProps.voting
  const voting = res.data?.pageProps?.voting;
  if (!voting) {
    console.warn(`No voting data found for ${projectSlug}`);
    return {};
  }

  return voting;
}
