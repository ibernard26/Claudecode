const fetch = require('node-fetch');
require('dotenv').config();
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-2.1';

/**
 * callClaude(userQuery, searchSummary)
 * - Builds a prompt using the JSON schema and calls Anthropic Claude Pro.
 * - Attempts to parse JSON out of the model's output; returns { error: ... } on parse failure.
 */
async function callClaude(userQuery, searchSummary) {
  if (!ANTHROPIC_API_KEY) return { error: 'missing_api_key', message: 'Set ANTHROPIC_API_KEY in .env' };

  let systemPrompt = `You are an intelligent, concise assistant. When the user asks something that requires knowledge, cite web search summaries when available and always return output in JSON exactly matching this schema (and nothing else):\n\n`;
  systemPrompt += `{
  "summary": "short 1-2 sentence summary of the answer",
  "results": [
    {"title": "Title of result","url": "https://...","snippet": "1-2 sentence snippet","relevance": 0.0,"source_label": "Bing/Internal","confidence": "high|medium|low"}
  ],
  "actions": [{"label":"Open link","type":"open","target":0}],
  "explainers": ["optional bullet points"]
}\n\n`;
  systemPrompt += `If you cannot produce valid JSON for any reason, return {"error":"message"}. Keep answers short and factual.\n\n`;

  // Include web search summary if available
  let searchText = '';
  if (searchSummary && Array.isArray(searchSummary) && searchSummary.length > 0) {
    searchText = '\nWebSearch results:\n' + searchSummary.slice(0,5).map((r,i)=>`${i+1}. ${r.name} -- ${r.snippet || r.snippetText || ''} (${r.url})`).join('\n');
  }

  const userChunk = `User query: ${userQuery}${searchText}\n\nRespond with JSON only.`;

  const body = {
    model: MODEL,
    prompt: systemPrompt + '\n' + userChunk,
    max_tokens_to_sample: 800
  };

  try {
    const resp = await fetch('https://api.anthropic.com/v1/complete', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY
      },
      body: JSON.stringify(body)
    });

    if (!resp.ok) {
      const text = await resp.text();
      return { error: 'api_error', details: text };
    }
    const data = await resp.json();

    // Anthropic response may include `completion` or `completion` text. Try known keys.
    const raw = data.completion || data?.completion?.[0] || data?.text || data?.message || JSON.stringify(data);

    // Extract JSON substring
    try {
      const start = raw.indexOf('{');
      const jsonText = start >= 0 ? raw.slice(start) : raw;
      const parsed = JSON.parse(jsonText);
      return parsed;
    } catch (e) {
      // return raw output so client can display for debugging
      return { error: 'invalid_json', raw: raw };
    }
  } catch (err) {
    return { error: 'request_failed', details: err.message };
  }
}

module.exports = { callClaude };
