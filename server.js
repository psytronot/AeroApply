import express from 'express';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { chromium } from 'playwright';
import { AGENTS, buildAgentPrompt, callModel, normalizeCommands, runCommand } from './src/agent-orchestrator.js';

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json({ limit: '4mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const PROFILE = path.join(__dirname, 'profile.json');
const JOBS = path.join(__dirname, 'jobs.json');
const DATA = path.join(__dirname, 'data');
const BROWSER_STATE = path.join(DATA, 'browser-state');
fs.mkdirSync(DATA, { recursive: true });
fs.mkdirSync(BROWSER_STATE, { recursive: true });

let browserContext = null;
let browserPage = null;
let browserStarting = null;

const readJson = (file, fallback) => {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
};
const writeJson = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2));
const getProfile = () => readJson(PROFILE, { candidate: {} }).candidate;
const getJobs = () => readJson(JOBS, []);
const saveJobs = jobs => writeJson(JOBS, jobs);

app.get('/api/health', async (req, res) => {
  const pageAlive = !!browserPage && !browserPage.isClosed();
  if (!pageAlive) browserPage = null;
  res.json({
    ok: true,
    model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
    nvidiaConfigured: Boolean(process.env.NVIDIA_API_KEY?.trim()),
    browserOpen: Boolean(browserPage),
    browserUrl: browserPage ? safePageUrl() : null,
    browserTitle: browserPage ? await safePageTitle() : null,
  });
});
app.get('/api/profile', (req,res) => res.json(getProfile()));
app.get('/api/agents', (req,res) => res.json(AGENTS));
app.put('/api/profile', (req,res) => {
  if (!req.body || Array.isArray(req.body)) return res.status(400).json({error:'Profile object required'});
  const p = { candidate: { ...getProfile(), ...req.body } };
  writeJson(PROFILE, p);
  res.json(p.candidate);
});
app.get('/api/jobs', (req,res) => res.json(getJobs()));

app.post('/api/jobs/import', (req,res) => {
  const incoming = Array.isArray(req.body) ? req.body : (Array.isArray(req.body?.jobs) ? req.body.jobs : []);
  if (!incoming.length) return res.status(400).json({error:'Provide a non-empty jobs array'});
  const existing = getJobs();
  const seen = new Set(existing.map(j => jobKey(j)));
  let added = 0;
  for (const raw of incoming) {
    const job = normalizeJob(raw);
    const key = jobKey(job);
    if (!key || seen.has(key)) continue;
    existing.unshift(job); seen.add(key); added++;
  }
  saveJobs(existing);
  res.json({ added, skipped: incoming.length - added, total: existing.length });
});

app.post('/api/jobs/save', (req,res) => {
  const job = normalizeJob(req.body);
  if (!job.title && !job.description && !job.url) return res.status(400).json({error:'Job needs a title, description, or URL'});
  const jobs = getJobs();
  const key = jobKey(job);
  const idx = jobs.findIndex(x => jobKey(x) === key);
  if (idx >= 0) jobs[idx] = { ...jobs[idx], ...job, updated_at: new Date().toISOString() };
  else jobs.unshift(job);
  saveJobs(jobs);
  res.json(idx >= 0 ? jobs[idx] : job);
});

app.post('/api/jobs/:id/status', (req,res) => {
  const allowed = new Set(['NEW','APPLY','REVIEW','SKIP','SUBMITTED']);
  const status = String(req.body?.status || '').toUpperCase();
  if (!allowed.has(status)) return res.status(400).json({error:`Invalid status. Use: ${[...allowed].join(', ')}`});
  const jobs = getJobs();
  const i = jobs.findIndex(j => j.id === req.params.id);
  if (i < 0) return res.status(404).json({error:'Job not found'});
  jobs[i].status = status;
  jobs[i].updated_at = new Date().toISOString();
  saveJobs(jobs);
  res.json(jobs[i]);
});

app.post('/api/score', async (req,res) => {
  const job = normalizeJob(req.body);
  const p = getProfile();
  if (!job.description && !job.title) return res.status(400).json({error:'Read or paste a job description before scoring'});
  try {
    const result = hasNvidiaKey()
      ? safeJson(await nvidia(buildScorePrompt(p, job)))
      : heuristicScore(p, job);
    validateScore(result);
    job.score = result;
    const jobs = getJobs();
    const i = jobs.findIndex(j => jobKey(j) === jobKey(job));
    if (i >= 0) jobs[i] = { ...jobs[i], ...job };
    else jobs.unshift(job);
    saveJobs(jobs);
    res.json(result);
  } catch (e) {
    res.status(502).json({error: friendlyNvidiaError(e)});
  }
});

app.post('/api/tailor', async (req,res) => {
  const job = normalizeJob(req.body);
  const p = getProfile();
  if (!job.description && !job.title) return res.status(400).json({error:'Read or paste a job description before tailoring'});
  try {
    const result = hasNvidiaKey()
      ? safeJson(await nvidia(buildTailorPrompt(p, job)))
      : heuristicTailor(p, job);
    validateTailor(result);
    res.json(result);
  } catch (e) {
    res.status(502).json({error: friendlyNvidiaError(e)});
  }
});

app.post('/api/agents/run', async (req,res) => {
  const task = String(req.body?.task || '').trim();
  if (!task) return res.status(400).json({error:'Provide an agent task'});
  if (!hasNvidiaKey()) return res.status(400).json({error:'NVIDIA_API_KEY is not configured'});

  const requested = Array.isArray(req.body?.agents) && req.body.agents.length
    ? AGENTS.filter(a => req.body.agents.includes(a.id))
    : AGENTS;
  if (!requested.length) return res.status(400).json({error:'No valid agents selected'});

  const context = {
    profile: getProfile(),
    jobs_count: getJobs().length,
    model: process.env.NVIDIA_MODEL || DEFAULT_MODEL,
    project: 'AeroApply local v0.3',
  };
  const results = [];
  let previous = {};
  try {
    for (const agent of requested) {
      const prompt = buildAgentPrompt(agent, task, {...context, previous_agents: previous});
      const output = await callModel(prompt, nvidia);
      const record = {agent: agent.id, name: agent.name, output};
      results.push(record);
      previous[agent.id] = output;
      if (agent.id === 'executor') {
        const commands = normalizeCommands(output.commands);
        record.execution = [];
        for (const command of commands) record.execution.push(await runCommand(command, __dirname));
      }
    }
    const execution = results.find(x => x.agent === 'executor')?.execution || [];
    res.json({ok: execution.every(x => x.ok), task, results, execution});
  } catch (e) {
    res.status(502).json({error:friendlyNvidiaError(e), results});
  }
});

app.post('/api/agents/execute', async (req,res) => {
  const commands = normalizeCommands(req.body?.commands);
  if (!commands.length) return res.status(400).json({error:'No allowlisted commands supplied'});
  const results = [];
  for (const command of commands) results.push(await runCommand(command, __dirname));
  res.json({ok:results.every(x => x.ok), results});
});

app.post('/api/nvidia/test', async (req,res) => {
  if (!hasNvidiaKey()) return res.status(400).json({error:'NVIDIA_API_KEY is not configured'});
  try {
    const raw = await nvidia('Return JSON only: {"ok":true,"message":"Nemotron connection successful"}');
    const result = safeJson(raw);
    res.json({ok:true, model: process.env.NVIDIA_MODEL || DEFAULT_MODEL, result});
  } catch (e) {
    res.status(502).json({error:friendlyNvidiaError(e)});
  }
});

app.post('/api/browser/open', async (req,res) => {
  const url = String(req.body?.url || '').trim();
  if (!/^https?:\/\//i.test(url)) return res.status(400).json({error:'Valid http(s) URL required'});
  try {
    await ensureBrowser();
    await browserPage.goto(url, { waitUntil:'domcontentloaded', timeout:30000 });
    res.json({ok:true,title:await safePageTitle(),url:safePageUrl(),note:'AeroApply browser session is local and persistent.'});
  } catch(e) {
    browserPage = null;
    res.status(502).json({error:`Browser navigation failed: ${e.message}`});
  }
});

app.post('/api/browser/read-page', async (req,res) => {
  if (!pageReady()) return res.status(400).json({error:'Open a job page first'});
  try {
    const text = await browserPage.locator('body').innerText({timeout:10000});
    res.json({url:safePageUrl(),title:await safePageTitle(),text:text.trim().slice(0,120000)});
  } catch(e) { res.status(502).json({error:`Could not read page: ${e.message}`}); }
});

app.post('/api/browser/fill-known', async (req,res) => {
  if (!pageReady()) return res.status(400).json({error:'Open an application page first'});
  const p = getProfile();
  const fields = {
    email:p.contact?.email,
    phone:p.contact?.phone,
    firstName:(p.name || '').trim().split(/\s+/)[0],
    lastName:(p.name || '').trim().split(/\s+/).slice(1).join(' '),
    linkedin:p.contact?.linkedin,
    github:p.contact?.github,
    location:p.location,
  };
  const selectors = {
    email:['input[type="email"]','input[autocomplete="email"]','input[name*="email" i]'],
    phone:['input[type="tel"]','input[autocomplete="tel"]','input[name*="phone" i]','input[name*="mobile" i]'],
    firstName:['input[autocomplete="given-name"]','input[name*="first" i][name*="name" i]','input[name="firstName" i]'],
    lastName:['input[autocomplete="family-name"]','input[name*="last" i][name*="name" i]','input[name="lastName" i]'],
    linkedin:['input[name*="linkedin" i]','input[placeholder*="linkedin" i]'],
    github:['input[name*="github" i]','input[placeholder*="github" i]'],
    location:['input[name*="city" i]','input[autocomplete="address-level2"]','input[name*="location" i]'],
  };
  const filled = [];
  const skipped = [];
  for (const [key,value] of Object.entries(fields)) {
    if (!value || !selectors[key]) { skipped.push(key); continue; }
    let done = false;
    for (const selector of selectors[key]) {
      const loc = browserPage.locator(selector).filter({visible:true}).first();
      if (await loc.count().catch(()=>0) && await loc.isEnabled().catch(()=>false)) {
        await loc.fill(String(value));
        filled.push(key); done = true; break;
      }
    }
    if (!done) skipped.push(key);
  }
  res.json({filled,skipped,warning:'Only known profile fields were filled. Review every field; no submit action is performed.'});
});

app.post('/api/browser/snapshot', async (req,res) => {
  if (!pageReady()) return res.status(400).json({error:'Open a page first'});
  try {
    const file = path.join(DATA, `page-${Date.now()}.png`);
    await browserPage.screenshot({path:file,fullPage:false});
    res.json({path:file,url:safePageUrl()});
  } catch(e) { res.status(502).json({error:`Screenshot failed: ${e.message}`}); }
});

const PORT = Number(process.env.PORT || 8787);
const DEFAULT_MODEL = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
const server = app.listen(PORT, () => console.log(`AeroApply running at http://localhost:${PORT}`));

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
async function shutdown() {
  try { if (browserContext) await browserContext.close(); } catch {}
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 1500).unref();
}

function hasNvidiaKey() { return Boolean(process.env.NVIDIA_API_KEY?.trim()); }
function pageReady() {
  if (!browserPage || browserPage.isClosed()) { browserPage = null; return false; }
  return true;
}
async function ensureBrowser() {
  if (pageReady()) return browserPage;
  if (browserStarting) return browserStarting;
  browserStarting = (async () => {
    if (!browserContext) {
      browserContext = await chromium.launchPersistentContext(BROWSER_STATE, {
        headless: String(process.env.BROWSER_HEADLESS || 'false').toLowerCase() === 'true',
        viewport: {width:1440,height:900},
      });
      browserContext.on('close', () => { browserContext = null; browserPage = null; });
    }
    browserPage = browserContext.pages()[0] || await browserContext.newPage();
    return browserPage;
  })();
  try { return await browserStarting; } finally { browserStarting = null; }
}
function safePageUrl() { try { return browserPage?.url() || null; } catch { return null; } }
async function safePageTitle() { try { return await browserPage.title(); } catch { return null; } }
function jobKey(j) { return String(j.url || j.job_url || j.id || `${j.company}|${j.title}|${j.location}`).trim(); }
function normalizeJob(raw={}) {
  const location = typeof raw.location === 'string' ? raw.location : (raw.location?.display_name || '');
  const category = typeof raw.category === 'string' ? raw.category : (raw.category?.label || '');
  return {
    id: raw.id || raw.job_id || crypto.randomUUID(),
    title: raw.title || raw.job_title || '',
    company: raw.company || raw.company_name || '',
    location,
    url: raw.url || raw.job_url || raw.redirect_url || '',
    description: raw.description || raw.jd || '',
    category,
    employment_type: raw.employment_type || raw.contract_type || '',
    salary_min: raw.salary_min ?? null,
    salary_max: raw.salary_max ?? null,
    source: raw.source || '',
    created: raw.created || '',
    status: raw.status || 'NEW',
    imported_at: raw.imported_at || new Date().toISOString(),
    ...(raw.score ? {score: raw.score} : {}),
  };
}
function tokens(s) { return String(s||'').toLowerCase().replace(/[^a-z0-9+#./ -]/g,' ').split(/\s+/).filter(Boolean); }
function heuristicScore(p,j) {
  const text = `${j.title} ${j.description} ${j.category}`.toLowerCase();
  const hits = p.target_tracks.filter(x => text.includes(x.toLowerCase()));
  const roleHits = p.target_role_patterns.filter(x => text.includes(x.toLowerCase()));
  const early = /\b(intern|apprentice|trainee|graduate|junior|entry[- ]level|get)\b/i.test(text);
  const senior = /\b(lead|principal|staff|senior|manager|director|head)\b/i.test(`${j.title} ${j.description}`);
  const years = text.match(/\b([3-9]|1\d)\+?\s+years?\b/i);
  let score = Math.min(100, 35 + hits.length*7 + roleHits.length*9 + (early?12:0) - (senior?35:0));
  if (years) score -= 20;
  score = Math.max(0, score);
  return {match_score:score,recommendation:score>=75?'APPLY':score>=55?'REVIEW':'SKIP',job_category:hits[0]||'Aerospace / AI-ML',matching_skills:hits.slice(0,8),missing_skills:[],experience_risk:senior?'HIGH':years?'MEDIUM':'LOW',rationale:'Local deterministic scoring. Configure NVIDIA_API_KEY to use Nemotron.',resume_variant:variantFor(hits,text)};
}
function heuristicTailor(p,j) {
  return {headline:p.headline,summary:`Tailor the profile toward ${j.title||'this role'} using only verified candidate facts.`,skills_to_prioritize:p.profile_skills.slice(0,8),project_bullets_to_emphasize:[],keywords:tokens(`${j.title} ${j.description}`).filter(x=>x.length>3).slice(0,25),cover_letter:`I am applying for the ${j.title||'role'} opportunity at ${j.company||'your organization'}. My background in Aerospace Engineering, space technology and Generative AI/ML gives me a multidisciplinary foundation relevant to this opportunity. I would welcome the chance to contribute while continuing to develop as an early-career engineer.`};
}
function variantFor(hits,text) { if(hits.some(x=>/AI|Automation/i.test(x)))return 'ai-ml'; if(hits.some(x=>/Propulsion/i.test(x)))return 'propulsion'; if(hits.some(x=>/Structure|Design/i.test(x)))return 'aerospace-structures'; if(hits.some(x=>/Space|Satellite/i.test(x)))return 'space'; if(hits.some(x=>/UAV|eVTOL/i.test(x)))return 'uav-evtOL'; return 'aerospace-general'; }
function buildScorePrompt(p,j) { return `You are the primary job-intelligence agent for AeroApply. Evaluate ONE job for an early-career Aerospace Engineering candidate who is also pursuing AI/ML opportunities. Be strict, truthful and conservative. Do not invent experience. Consider junior/graduate/internship/apprenticeship/trainee roles across aerospace, aviation, space, UAV/drone, eVTOL and AI/ML. India-wide. Seniority mismatch is a major penalty. Return JSON only: {"match_score":0,"recommendation":"APPLY|REVIEW|SKIP","job_category":"","matching_skills":[],"missing_skills":[],"experience_risk":"LOW|MEDIUM|HIGH","rationale":"","resume_variant":""}. Candidate: ${JSON.stringify(p)} Job: ${JSON.stringify(j)}`; }
function buildTailorPrompt(p,j) { return `Create a truthful ATS tailoring plan for this candidate and ONE job. Never add an employer, date, degree, skill, project, metric or experience that is not in the candidate profile. The candidate is early-career. Return JSON only with keys headline, summary, skills_to_prioritize, project_bullets_to_emphasize, keywords, cover_letter. Candidate: ${JSON.stringify(p)} Job: ${JSON.stringify(j)}`; }
async function nvidia(prompt) {
  const base = (process.env.NVIDIA_BASE_URL || 'https://integrate.api.nvidia.com/v1').replace(/\/$/,'');
  const model = process.env.NVIDIA_MODEL || DEFAULT_MODEL;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60000);
  try {
    const r = await fetch(`${base}/chat/completions`, {method:'POST',headers:{Authorization:`Bearer ${process.env.NVIDIA_API_KEY.trim()}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'system',content:'Return valid JSON only. No markdown or commentary.'},{role:'user',content:prompt}],temperature:0.1,top_p:0.9,max_tokens:3500,stream:false}),signal:controller.signal});
    const body = await r.text();
    if (!r.ok) throw new Error(`NVIDIA API ${r.status}: ${body.slice(0,500)}`);
    let payload; try { payload = JSON.parse(body); } catch { throw new Error('NVIDIA returned invalid JSON response'); }
    return payload.choices?.[0]?.message?.content || '';
  } finally { clearTimeout(timer); }
}
function safeJson(s) {
  const raw = String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try { return JSON.parse(raw); } catch {}
  const first = raw.indexOf('{'); const last = raw.lastIndexOf('}');
  if (first >= 0 && last > first) return JSON.parse(raw.slice(first,last+1));
  throw new Error('Nemotron response was not valid JSON');
}
function validateScore(x) {
  if (!x || typeof x !== 'object') throw new Error('Invalid score response');
  if (!Number.isFinite(Number(x.match_score))) throw new Error('Score response missing match_score');
  if (!['APPLY','REVIEW','SKIP'].includes(x.recommendation)) throw new Error('Score response has invalid recommendation');
}
function validateTailor(x) {
  if (!x || typeof x !== 'object' || !x.headline || !x.summary) throw new Error('Invalid tailoring response');
}
function friendlyNvidiaError(e) {
  if (e?.name === 'AbortError') return 'Nemotron request timed out after 60 seconds.';
  return e?.message || 'Unknown error';
}
