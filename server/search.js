const fetch = require('node-fetch');
require('dotenv').config();

const BING_API_KEY = process.env.BING_API_KEY;

/**
 * bingSearch(query)
 * - Calls Bing Web Search (v7) and returns a simplified array of results.
 */
async function bingSearch(query) {
  if (!BING_API_KEY) throw new Error('BING_API_KEY not set');
  const endpoint = `https://api.bing.microsoft.com/v7.0/search?q=${encodeURIComponent(query)}&mkt=en-US`;
  const resp = await fetch(endpoint, { headers: { 'Ocp-Apim-Subscription-Key': BING_API_KEY } });
  if (!resp.ok) throw new Error('Bing API error: ' + resp.statusText);
  const data = await resp.json();

  const webPages = data.webPages?.value || [];
  return webPages.map(w => ({ name: w.name, url: w.url, snippet: w.snippet || w.displayUrl }));
}

module.exports = { bingSearch };
