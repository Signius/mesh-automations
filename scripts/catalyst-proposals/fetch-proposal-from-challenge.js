// fetch-proposal-from-challenge.js
import axios from 'axios';

/**
 * Fetch full proposal object (including voting) by _fundingId
 * from the challenge-level JSON.
 *
 * @param {Object} params
 * @param {string} params.buildId       – NEXT_PUBLIC_BUILD_ID
 * @param {string} params.fundId        – Funding round (e.g. '10')
 * @param {string} params.challengeSlug – Challenge slug (e.g. 'osde-open-source-dev-ecosystem')
 * @param {string} params.fundingId     – Proposal’s _fundingId (e.g. '1100271')
 * @returns {Promise<Object|null>}      – The proposal object or null if not found
 */
export async function fetchProposalFromChallenge({ buildId, fundId, challengeSlug, fundingId }) {
  if (!buildId) throw new Error('Missing NEXT_PUBLIC_BUILD_ID');
  const url = `https://projectcatalyst.io/_next/data/${buildId}/en/funds/${fundId}/${challengeSlug}.json?fundId=${encodeURIComponent(fundId)}&challengeSlug=${encodeURIComponent(challengeSlug)}`;
  const res = await axios.get(url, { headers: { Accept: 'application/json' } });
  if (res.status !== 200) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);

  const projects = res.data?.pageProps?.data?.projects ?? [];
  const project = projects.find(p => p._fundingId === fundingId);
  if (!project) {
    console.warn(`_fundingId ${fundingId} not found in challenge ${challengeSlug}`);
    return null;
  }
  return project;
}
