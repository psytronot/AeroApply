import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Activity, Bot, BriefcaseBusiness, CheckCircle2, ChevronRight, Circle, Cpu, Gauge, Globe2, Moon, Play, RefreshCw, ShieldCheck, Sparkles, Sun, Terminal, UserRound, X } from 'lucide-react';

const navItems = [
  ['Overview', Gauge], ['Job Queue', BriefcaseBusiness], ['Agent Operations', Bot],
  ['Browser', Globe2], ['Run History', Activity], ['Audit & QA', ShieldCheck],
];
const agentNames = ['Planner', 'Coder', 'Tester', 'Reviewer', 'Executor'];

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { 'content-type': 'application/json', ...(options.headers || {}) }, ...options });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Request failed (${response.status})`);
  return body;
}

function App() {
  const [section, setSection] = useState('Overview');
  const [theme, setTheme] = useState(() => localStorage.getItem('aeroapply.theme') || 'dark');
  const [health, setHealth] = useState({ ok: false, nvidiaConfigured: false, browserOpen: false });
  const [profile, setProfile] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [selected, setSelected] = useState(0);
  const [running, setRunning] = useState(false);
  const [runResults, setRunResults] = useState([]);
  const [logs, setLogs] = useState([]);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [jobUrl, setJobUrl] = useState('');
  const [jobText, setJobText] = useState('');
  const [browserText, setBrowserText] = useState('');
  const [score, setScore] = useState(null);
  const [tailored, setTailored] = useState(null);
  const [showRunDialog, setShowRunDialog] = useState(false);

  const selectedJob = jobs[selected] || null;
  const addLog = (message, type = 'info') => setLogs(prev => [{ at: new Date().toLocaleTimeString(), message, type }, ...prev].slice(0, 80));
  const refresh = async () => {
    try {
      const [h, p, j] = await Promise.all([api('/api/health'), api('/api/profile'), api('/api/jobs')]);
      setHealth(h); setProfile(p); setJobs(Array.isArray(j) ? j : []); setError('');
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { document.documentElement.dataset.theme = theme; localStorage.setItem('aeroapply.theme', theme); }, [theme]);
  useEffect(() => { refresh(); const id = setInterval(refresh, 10000); return () => clearInterval(id); }, []);

  const metrics = useMemo(() => ({
    discovered: jobs.length,
    qualified: jobs.filter(j => Number(j.score?.match_score ?? j.score?.atsScore ?? j.score ?? 0) >= 80).length,
    active: running ? 1 : 0,
    logged: jobs.filter(j => ['SUBMITTED', 'APPLIED'].includes(String(j.status || '').toUpperCase())).length,
  }), [jobs, running]);

  const inspect = async () => {
    if (!jobUrl.trim()) return setError('Enter an http(s) job URL.');
    setError(''); setNotice('Opening job in local Playwright session…'); addLog(`NAVIGATE ${jobUrl}`, 'info');
    try { const r = await api('/api/browser/open', { method: 'POST', body: JSON.stringify({ url: jobUrl }) }); setNotice(`Browser ready: ${r.title || r.url}`); addLog(`BROWSER READY ${r.url}`, 'success'); }
    catch (e) { setError(e.message); addLog(`BROWSER ERROR ${e.message}`, 'error'); }
  };
  const readPage = async () => {
    try { const r = await api('/api/browser/read-page', { method: 'POST', body: '{}' }); setJobText(r.text); setJobUrl(r.url || jobUrl); setNotice('Current page read into the job inspector.'); addLog('READ current browser page', 'success'); }
    catch (e) { setError(e.message); }
  };
  const scoreJob = async () => {
    const job = selectedJob || { url: jobUrl, description: jobText };
    if (!job.description && !job.title) return setError('Read or paste a job description first.');
    setError(''); setNotice('Nemotron is evaluating the job…'); addLog('SCORE job with Nemotron', 'info');
    try { const r = await api('/api/score', { method: 'POST', body: JSON.stringify({ ...job, description: job.description || jobText }) }); setScore(r); await refresh(); setNotice(`Match score ${r.match_score ?? 'n/a'}% · ${r.recommendation || 'REVIEW'}`); addLog(`MATCH ${r.match_score ?? '?'}% ${r.recommendation || ''}`, 'success'); }
    catch (e) { setError(e.message); }
  };
  const tailorJob = async () => {
    const job = selectedJob || { url: jobUrl, description: jobText };
    if (!job.description && !job.title) return setError('Read or paste a job description first.');
    setError(''); setNotice('Nemotron is generating a verified-facts tailoring plan…');
    try { const r = await api('/api/tailor', { method: 'POST', body: JSON.stringify({ ...job, description: job.description || jobText }) }); setTailored(r); setNotice('Tailoring plan generated — review before using it.'); addLog('TAILOR resume against verified profile', 'success'); }
    catch (e) { setError(e.message); }
  };
  const runPipeline = async () => {
    setShowRunDialog(false); setRunning(true); setRunResults([]); setError(''); addLog('RUN five-agent workflow', 'info');
    try {
      const r = await api('/api/agents/run', { method: 'POST', body: JSON.stringify({ task: selectedJob ? `Prepare a safe application workflow for ${selectedJob.title} at ${selectedJob.company}.` : 'Run a synthetic AeroApply application workflow and verify every stage.', agents: ['planner', 'coder', 'tester', 'reviewer', 'executor'] }) });
      setRunResults(r.results || []); setNotice(r.ok ? 'Five-agent workflow completed.' : 'Workflow completed with a reviewable execution result.');
      (r.results || []).forEach(x => addLog(`${x.name.toUpperCase()} completed`, 'success'));
    } catch (e) { setError(e.message); addLog(`PIPELINE ERROR ${e.message}`, 'error'); } finally { setRunning(false); }
  };

  return <div className="app">
    <aside className="sidebar">
      <div className="brand"><div className="brandMark">A</div><div><strong>AEROAPPLY</strong><span>MISSION CONTROL</span></div></div>
      <nav className="nav">{navItems.map(([label, Icon]) => <button key={label} className={section === label ? 'navActive' : ''} onClick={() => setSection(label)}><Icon size={16}/>{label}{label === 'Job Queue' && <em>{jobs.length}</em>}</button>)}</nav>
      <div className="sidebarBottom"><div className="profile"><UserRound size={15}/><span>{profile?.name || 'Sai Akhil Malladi'}</span></div><div className="system"><i className={health.ok ? 'online' : ''}/>{health.ok ? 'Local engine operational' : 'Engine unavailable'}</div></div>
    </aside>

    <section className="content">
      <header className="header"><div><p className="kicker">OPERATIONS / LOCAL ENGINE</p><h1>{section === 'Overview' ? 'Application command center' : section}</h1></div><div className="headerActions"><button className="iconBtn" aria-label="Toggle theme" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>{theme === 'dark' ? <Sun size={16}/> : <Moon size={16}/>}</button><span className={`status ${health.nvidiaConfigured ? 'success' : 'warning'}`}>● {health.nvidiaConfigured ? 'NEMOTRON CONNECTED' : 'NEMOTRON NOT CONFIGURED'}</span><span className={`status ${health.browserOpen ? 'success' : ''}`}>● {health.browserOpen ? 'BROWSER READY' : 'BROWSER IDLE'}</span><button className="primaryBtn" onClick={() => running ? setRunning(false) : setShowRunDialog(true)}><Play size={14}/>{running ? 'Stop pipeline' : 'Run pipeline'}</button></div></header>

      {error && <div className="alert error"><X size={14}/>{error}<button onClick={() => setError('')} aria-label="Dismiss"><X size={13}/></button></div>}
      {notice && <div className="alert"><CheckCircle2 size={14}/>{notice}</div>}

      {section === 'Overview' && <>
        <div className="metrics">{[[metrics.discovered,'Jobs discovered','from local queue'],[metrics.qualified,'Qualified queue','≥ 80% match'],[metrics.active,'Active runs',running ? 'Live execution' : 'Standing by'],[metrics.logged,'Applications logged','local evidence']].map(([v,l,m]) => <div className="metric" key={l}><span>{l}</span><strong>{String(v).padStart(2,'0')}</strong><small>{m}</small></div>)}</div>
        <div className="workspace">
          <section className="mainPanel"><div className="panelHead"><div><p className="eyebrow">ACTIVE PIPELINE</p><h2>{selectedJob ? `${selectedJob.company} / ${selectedJob.title}` : 'Synthetic application run'}</h2><span>{selectedJob?.location || 'Local fixture'} · {selectedJob ? 'Selected job' : 'No external submission'}</span></div><span className={`badge ${running ? 'warning' : 'success'}`}>{running ? 'EXECUTING' : 'STANDING BY'}</span></div>
            <div className="agentRail">{agentNames.map((name, i) => { const result = runResults.find(x => x.name === name); return <div className="agent" key={name}><div className={`agentDot ${running && i === 4 ? 'live' : ''}`}>{result ? <CheckCircle2 size={15}/> : <Circle size={13}/>}</div><div><b>{name}</b><small>{result ? 'RUN COMPLETE' : `STAGE ${i + 1}`}</small><span>{result ? 'Evidence received' : 'Waiting'}</span></div>{i < 4 && <ChevronRight className="arrow" size={15}/>}</div>})}</div>
            <div className="timeline"><div className="timelineHead"><span>LIVE EXECUTION JOURNAL</span><span>{logs.length ? logs[0].at : 'No events'}</span></div>{(logs.length ? logs : [{at:'—',message:'No execution events yet',type:'info'}]).slice(0,8).map((x,i)=><div className="event" key={`${x.at}-${i}`}><span className="time">{x.at}</span><i className={x.type}/><span>{x.message}</span>{x.type === 'error' ? <X size={13}/> : <CheckCircle2 size={13}/>}</div>)}</div>
          </section>
          <aside className="sidePanel"><div className="sideBlock"><div className="sideTitle"><span>BROWSER</span><span className={`badge ${health.browserOpen ? 'success' : ''}`}>{health.browserOpen ? 'READY' : 'IDLE'}</span></div><div className="browser"><div className="browserBar"><i/><i/><i/><span>{health.browserUrl || 'local Playwright session'}</span></div><div className="browserBody"><Globe2 size={25}/><b>{health.browserOpen ? 'Playwright session ready' : 'Browser idle'}</b><span>Persistent local context</span><code>{health.browserUrl || 'awaiting navigation'}</code></div></div></div><div className="sideBlock"><div className="sideTitle"><span>POLICY GATE</span><ShieldCheck size={15}/></div><div className="policy"><div><CheckCircle2 size={14}/>Allowlisted browser actions</div><div><CheckCircle2 size={14}/>No arbitrary code execution</div><div><CheckCircle2 size={14}/>No blind submission</div><div><CheckCircle2 size={14}/>CAPTCHA → human pause</div></div></div><div className="sideBlock"><div className="sideTitle"><span>AI PROVIDER</span><Cpu size={15}/></div><div className="provider"><div><b>OpenAI-compatible gateway</b><span>NVIDIA / Nemotron</span></div><span className="badge outline">CONFIGURABLE</span></div></div></aside>
        </div>
      </>}

      {(section === 'Overview' || section === 'Job Queue') && <section className="queue"><div className="queueHead"><div><p className="eyebrow">APPLICATION QUEUE</p><h2>Qualified jobs</h2></div><span>{jobs.length} loaded · sorted by local score</span></div><div className="table">{jobs.length ? jobs.map((job,i)=><button className={`row ${selected === i ? 'rowSelected' : ''}`} key={job.id || i} onClick={() => { setSelected(i); setJobText(job.description || ''); setJobUrl(job.url || ''); setScore(job.score || null); }}><span className="company">{job.company || 'Unknown'}</span><span className="role">{job.title || 'Untitled job'}<small>{job.location || 'Location unspecified'}</small></span><strong className="score">{job.score?.match_score ?? job.score?.atsScore ?? job.score ?? '—'}{job.score ? '%' : ''}</strong><span className="state">{job.status || 'NEW'}</span><ChevronRight size={15}/></button>) : <div className="empty">No jobs loaded. Import jobs through the existing `/api/jobs/import` endpoint or inspect a job URL below.</div>}</div></section>}

      {section === 'Overview' && <section className="inspector"><div className="sectionTitle"><div><p className="eyebrow">JOB INSPECTOR</p><h2>Find → score → tailor → review</h2></div><button className="ghostBtn" onClick={refresh}><RefreshCw size={14}/>Refresh</button></div><div className="twoCol"><div><label>Job URL</label><div className="inputRow"><input value={jobUrl} onChange={e=>setJobUrl(e.target.value)} placeholder="https://company.example/jobs/..."/><button className="primaryBtn" onClick={inspect}>Open in browser</button></div><button className="secondaryBtn" onClick={readPage}>Read current page</button><label>Job description</label><textarea value={jobText} onChange={e=>setJobText(e.target.value)} placeholder="Paste a job description or read the current browser page."/></div><div className="actionPanel"><div className="actionButtons"><button className="primaryBtn" onClick={scoreJob}><Sparkles size={14}/>Score with Nemotron</button><button className="secondaryBtn" onClick={tailorJob}>Build ATS tailoring plan</button></div>{score && <div className="result"><strong>{score.match_score ?? score.atsScore ?? '—'}%</strong><span>{score.recommendation || 'REVIEW'}</span><p>{score.rationale || score.gaps?.join?.(', ') || 'Review the structured AI result before applying.'}</p></div>}{tailored && <pre className="json">{JSON.stringify(tailored, null, 2)}</pre>}</div></div></section>}

      {section === 'Agent Operations' && <section className="console"><div className="sectionTitle"><div><p className="eyebrow">AGENT OPERATIONS</p><h2>Planner → Coder → Tester → Reviewer → Executor</h2></div><button className="primaryBtn" onClick={()=>setShowRunDialog(true)}><Play size={14}/>Run controlled workflow</button></div><div className="agentGrid">{agentNames.map((name,i)=>{const r=runResults.find(x=>x.name===name);return <div className="agentCard" key={name}><span>0{i+1}</span><h3>{name}</h3><p>{r ? JSON.stringify(r.output).slice(0,500) : 'No run output yet.'}</p><code>{r ? 'evidence: received' : 'state: waiting'}</code></div>})}</div></section>}

      {section === 'Browser' && <section className="console"><div className="sectionTitle"><div><p className="eyebrow">BROWSER CONTROL</p><h2>Local Playwright session</h2></div><span className="badge">{health.browserUrl || 'IDLE'}</span></div><div className="browserLarge"><div className="browserBar"><i/><i/><i/><span>{health.browserUrl || 'No page open'}</span></div><pre>{browserText || 'Use the Job Inspector to open and read a page. CAPTCHA/MFA must remain a human-intervention state.'}</pre></div></section>}

      {(section === 'Run History' || section === 'Audit & QA') && <section className="console"><div className="sectionTitle"><div><p className="eyebrow">{section.toUpperCase()}</p><h2>{section === 'Run History' ? 'Local execution evidence' : 'Safety and QA posture'}</h2></div></div><div className="qaGrid"><div><b>Five-agent contract</b><span>Planner, Coder, Tester, Reviewer, Executor</span></div><div><b>Executor boundary</b><span>Allowlisted browser actions only; no blind submit</span></div><div><b>Human gate</b><span>CAPTCHA, MFA and unknown required questions pause the run</span></div><div><b>Persistence</b><span>Local JSON runtime plus Floot V1 database schema exported separately</span></div></div><pre className="terminal">{logs.length ? logs.map(x=>`[${x.at}] ${x.message}`).join('\n') : 'No audit events recorded in this session.'}</pre></section>}

      <footer className="footer"><Terminal size={13}/> AeroApply V1 port · local engine · human approval boundary preserved · no external application is silently submitted</footer>
    </section>

    <AnimatePresence>{showRunDialog && <motion.div className="dialogBackdrop" initial={{opacity:0}} animate={{opacity:1}} exit={{opacity:0}} onMouseDown={e=>e.currentTarget===e.target&&setShowRunDialog(false)}><motion.div className="dialog" role="dialog" aria-modal="true" initial={{scale:.97,y:8}} animate={{scale:1,y:0}}><p className="eyebrow">SAFETY GATE</p><h2>Start application pipeline?</h2><p>This runs the five-agent workflow through the local API. It does not authorize blind external submission. CAPTCHA/MFA/unknown required questions remain human gates.</p><div className="dialogActions"><button className="ghostBtn" onClick={()=>setShowRunDialog(false)}>Cancel</button><button className="primaryBtn" onClick={runPipeline}>Start controlled run</button></div></motion.div></motion.div>}</AnimatePresence>
  </div>;
}

export default App;
