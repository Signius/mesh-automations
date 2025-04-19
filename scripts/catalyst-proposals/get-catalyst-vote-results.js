// get-catalyst-vote-results.js

// ← YOUR fallback for the Next.js build ID:
const DEFAULT_BUILD_ID = 'pJZYf0Bzp4nPDQmwjxLiJ';

/**
 * Fetch the Next.js build ID by scraping the challenge page HTML,
 * or fall back to DEFAULT_BUILD_ID on any error.
 * @param {string} fundId
 * @param {string} challengeSlug
 * @returns {Promise<string>}
 */
async function fetchBuildId(fundId, challengeSlug) {
  const pageUrl = `https://projectcatalyst.io/funds/${fundId}/${challengeSlug}`;

  try {
    const res = await fetch(pageUrl);
    if (!res.ok) throw new Error(`Failed to load page: ${res.status}`);
    const html = await res.text();
    const match = html.match(/\/_next\/data\/([^/]+)\/en\/funds\//);
    if (match && match[1]) {
      return match[1];
    }
    throw new Error('No buildId match in HTML');
  } catch (err) {
    console.warn(
      `Warning: could not fetch new buildId (${err.message}), using default "${DEFAULT_BUILD_ID}"`
    );
    return DEFAULT_BUILD_ID;
  }
}

/**
 * Fetch the full JSON payload for a fund/challenge.
 * @param {string} fundId
 * @param {string} challengeSlug
 * @returns {Promise<Object>}
 */
async function fetchChallengeData(fundId, challengeSlug) {
  const buildId = await fetchBuildId(fundId, challengeSlug);
  const url =
    `https://projectcatalyst.io/_next/data/${buildId}/en/funds/` +
    `${fundId}/${challengeSlug}.json` +
    `?fundId=${fundId}&challengeSlug=${challengeSlug}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Data fetch failed: ${res.status}`);
  }
  return res.json();
}

/**
 * Get voting results for a single project.
 * @param {Object} params
 * @param {string} params.fundId
 * @param {string} params.challengeSlug
 * @param {string} params.fundingId
 * @returns {Promise<{ yes: string|null, no: string|null, abstain: string|null, votesCast: number }>}
 */
export async function getProjectVotingResults({
  fundId,
  challengeSlug,
  fundingId,
}) {
  const json = await fetchChallengeData(fundId, challengeSlug);
  const projects = json.pageProps.data.projects || [];
  const project = projects.find(
    (p) => String(p._fundingId) === String(fundingId)
  );

  if (!project) {
    throw new Error(`Project with fundingId=${fundingId} not found`);
  }

  const { voting } = project;
  return {
    yes: voting.yes ? voting.yes.amount : null,
    no: voting.no ? voting.no.amount : null,
    abstain: voting.abstain ? voting.abstain.amount : null,
    votesCast: voting.votesCast,
  };
}
