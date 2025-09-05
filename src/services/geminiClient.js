import { GEMINI_API_KEY, GEMINI_API_URL } from './config.js';

export async function callGemini(contents, extra = {}) {
  const body = JSON.stringify({ contents, ...extra });
  const resp = await fetch(`${GEMINI_API_URL}?key=${GEMINI_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!resp.ok) {
    throw new Error(`Gemini API error: ${resp.status} ${resp.statusText}`);
  }
  return resp.json();
}

export async function generateText(prompt) {
  const data = await callGemini([{ role: 'user', parts: [{ text: prompt }] }]);
  return extractText(data);
}

export function extractText(data) {
  if (!data) return '';
  const c = data.candidates && data.candidates[0];
  if (c && c.content && c.content.parts && c.content.parts[0] && c.content.parts[0].text) {
    return c.content.parts[0].text;
  }
  return '';
}


