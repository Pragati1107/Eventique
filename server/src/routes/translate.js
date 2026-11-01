/* Translates UI strings for the 22-language switcher.
   Uses Google Translate's free web endpoint by default (no key needed), or the Anthropic API when
   ANTHROPIC_API_KEY is set. Results are cached in memory per language. */
const router = require('express').Router();
const rateLimit = require('express-rate-limit');
const { HttpError, asyncH, str } = require('../lib/core');

const KEY = process.env.ANTHROPIC_API_KEY || '';
const MODEL = process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
const cache = new Map();
const LANGS = ['Hindi', 'Bengali', 'Telugu', 'Marathi', 'Tamil', 'Urdu', 'Gujarati', 'Kannada', 'Malayalam', 'Odia', 'Punjabi', 'Assamese', 'Maithili', 'Santali', 'Kashmiri', 'Nepali', 'Sindhi', 'Konkani', 'Dogri', 'Manipuri', 'Bodo', 'Sanskrit'];

/* Google codes. Bodo and Kashmiri are not offered by Google Translate. */
const GOOGLE = { Hindi: 'hi', Bengali: 'bn', Telugu: 'te', Marathi: 'mr', Tamil: 'ta', Urdu: 'ur', Gujarati: 'gu', Kannada: 'kn', Malayalam: 'ml', Odia: 'or', Punjabi: 'pa', Assamese: 'as', Maithili: 'mai', Santali: 'sat', Nepali: 'ne', Sindhi: 'sd', Konkani: 'gom', Dogri: 'doi', Manipuri: 'mni-Mtei', Sanskrit: 'sa' };

async function googleTranslate(lang, texts) {
  const tl = GOOGLE[lang];
  if (!tl) throw new HttpError(501, `${lang} translation is not available yet. Showing English.`);
  const out = {};
  for (let i = 0; i < texts.length; i += 40) {
    const part = texts.slice(i, i + 40);
    const r = await fetch(`https://translate.googleapis.com/translate_a/t?client=gtx&sl=en&tl=${encodeURIComponent(tl)}`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: part.map((q) => 'q=' + encodeURIComponent(q)).join('&'),
    });
    if (r.status === 429) throw new HttpError(429, 'Busy, try again shortly.');
    if (!r.ok) { console.error('[translate] google', r.status); throw new HttpError(502, 'Translation service error.'); }
    let j = await r.json();
    if (!Array.isArray(j)) j = [j];
    part.forEach((t, k) => {
      let v = j[k]; if (Array.isArray(v)) v = v[0];
      out[t] = typeof v === 'string' && v.trim() ? v.trim() : t;
    });
  }
  return out;
}

router.use(rateLimit({ windowMs: 60e3, limit: 60, standardHeaders: true, legacyHeaders: false }));
router.post('/', asyncH(async (req, res) => {
  const lang = str(req.body.lang, 30);
  if (!LANGS.includes(lang)) throw new HttpError(400, 'Unsupported language.');
  const texts = (Array.isArray(req.body.texts) ? req.body.texts : []).map((t) => str(t, 400)).filter(Boolean).slice(0, 80);
  if (!cache.has(lang)) cache.set(lang, new Map());
  const memo = cache.get(lang);
  const todo = texts.filter((t) => !memo.has(t));
  if (todo.length) {
    if (!KEY) {
      const out = await googleTranslate(lang, todo);
      todo.forEach((t) => memo.set(t, out[t] || t));
    } else {
      const prompt = `Translate each English user-interface string into ${lang}, for "Eventique", an Indian wedding and event vendor-booking app. Use natural, polite, everyday ${lang} in its usual script. Keep unchanged: the brand name Eventique, people's names, business names, city names, numbers, dates, ₹ amounts, emojis and symbols. Return ONLY a JSON object mapping each exact English string to its translation.\n\n${JSON.stringify(todo)}`;
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: MODEL, max_tokens: 4000, messages: [{ role: 'user', content: prompt }] }),
      });
      if (r.status === 429) throw new HttpError(429, 'Busy, try again shortly.');
      if (!r.ok) throw new HttpError(502, 'Translation service error.');
      const j = await r.json();
      const text = (j.content || []).map((c) => c.text || '').join('');
      let out = {};
      try { out = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)); } catch { out = {}; }
      todo.forEach((t) => memo.set(t, typeof out[t] === 'string' && out[t].trim() ? out[t].trim() : t));
    }
  }
  res.json({ translations: Object.fromEntries(texts.map((t) => [t, memo.get(t)])) });
}));

module.exports = { router, enabled: true, engine: KEY ? 'anthropic' : 'google' };
