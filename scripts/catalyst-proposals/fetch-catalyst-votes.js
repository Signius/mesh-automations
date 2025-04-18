import axios from 'axios';

/**
 * Fetches votesCast, yes/no/abstain amounts for a given Catalyst proposal page.
 *
 * @param {string} pageUrl  – the full URL of the proposal page
 * @returns {Promise<{votesCast: number, yesAmount: string, noAmount: string, abstainAmount: string}>}
 */
export async function fetchProposalVotes(pageUrl) {
  try {
    const { data: html } = await axios.get(pageUrl);
    // Extract the __NEXT_DATA__ JSON blob
    const match = html.match(
      /<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/
    );
    if (!match) throw new Error('Could not find Next.js data in HTML');

    const nextData = JSON.parse(match[1]);
    const voting = nextData.props.pageProps.voting || {};

    return {
      votesCast: voting.votesCast || 0,
      yesAmount: voting.yes?.amount || '0',
      noAmount: voting.no?.amount || '0',
      abstainAmount: voting.abstain?.amount || '0',
    };
  } catch (err) {
    console.error(`Error fetching votes for ${pageUrl}:`, err.message);
    return { votesCast: 0, yesAmount: '0', noAmount: '0', abstainAmount: '0' };
  }
}
