// Ported from Floot AeroApply v1 helpers/agentContracts.tsx and botPipeline.tsx.
export const AGENT_CONTRACT = ['planner','coder','tester','reviewer','executor'];
export const EXECUTOR_ACTIONS = ['navigate','back','click','fill','select','check','upload','scroll','wait','read','screenshot','detect','pause_for_human','resume'];

export function executorPolicy(action, target) {
  if (!EXECUTOR_ACTIONS.includes(action)) return { allowed:false, reason:'Action is not allowlisted.' };
  if (target && /javascript:|data:|file:|chrome:\/\//i.test(target)) return { allowed:false, reason:'Unsafe target.' };
  if (action === 'submit') return { allowed:false, reason:'Blind submission is forbidden.' };
  return { allowed:true };
}

export function filterJobs(jobs, filters={}) {
  const title = filters.title?.trim().toLowerCase();
  const excludedCompanies = (filters.excludedCompanies || []).map(x => x.toLowerCase());
  const excludedKeywords = (filters.excludedKeywords || []).map(x => x.toLowerCase());
  return jobs.filter(job => {
    const haystack = `${job.title} ${(job.keywords || []).join(' ')}`.toLowerCase();
    if (title && !job.title.toLowerCase().includes(title)) return false;
    if (filters.remoteOnly && !job.remote) return false;
    if (filters.minSalary != null && (job.salary ?? 0) < filters.minSalary) return false;
    if (excludedCompanies.some(x => job.company.toLowerCase().includes(x))) return false;
    if (excludedKeywords.some(x => haystack.includes(x))) return false;
    return true;
  });
}

export class ApplicationRun {
  constructor(dailyCap){ this.dailyCap=dailyCap; this.state='idle'; this.submitted=0; }
  start(){ if(this.state==='idle'||this.state==='stopped') this.state='running'; }
  pause(){ if(this.state==='running') this.state='paused'; }
  resume(){ if(this.state==='paused') this.state='running'; }
  stop(){ this.state='stopped'; this.submitted=0; }
  canSubmit(){ return this.state==='running' && this.submitted<this.dailyCap; }
  recordSubmission(){ if(!this.canSubmit()) return false; this.submitted++; if(this.submitted>=this.dailyCap) this.state='cap_reached'; return true; }
}

export const routeForApplyMode = job => job.applyMode === 'easy_apply' ? 'automated_safe_flow' : 'manual_review';
export const nextCooldownMs = (baseMs=1500,jitterMs=750) => Math.max(0,baseMs+Math.floor(Math.random()*jitterMs));
export const canStartBatch = (currentSubmitted,dailyCap) => dailyCap>0 && currentSubmitted<dailyCap;
export const isDuplicateJob = (job, applied) => applied.some(x => Boolean(job.id&&x.id===job.id)||Boolean(job.url&&x.url===job.url));

export function handleEdgeCase(type, detail='') {
  if(type==='DUPLICATE_JOB') return {action:'skip',state:'idle',burnsQuota:false,message:'Duplicate job skipped.'};
  if(type==='CAPTCHA') return {action:'pause',state:'needs_manual_action',burnsQuota:false,message:'CAPTCHA detected. Solve it manually, then resume.'};
  if(type==='UNMAPPED_SCREENING') return {action:'pause',state:'needs_manual_action',burnsQuota:false,message:detail||'Unmapped screening question requires your answer.'};
  if(type==='FILE_TOO_LARGE') return {action:'reject',state:'idle',burnsQuota:false,message:'Resume exceeds the configured ATS file-size limit.'};
  return {action:'reject',state:'idle',burnsQuota:false,message:'Unsupported resume file type.'};
}

export function validateResumeFile(file,maxBytes=10*1024*1024){
  const extension=String(file.name||'').toLowerCase().split('.').pop()||'';
  if(!new Set(['pdf','doc','docx','png','jpg','jpeg']).has(extension)) return handleEdgeCase('UNSUPPORTED_FILE');
  if(file.size>maxBytes) return handleEdgeCase('FILE_TOO_LARGE');
  return {action:'accept',state:'idle',burnsQuota:false,message:'Resume accepted.'};
}

export function applicationLogCsv(rows){
  const header=['Job Title','Company','Date Applied','Platform','Match Score','Status','Job URL'];
  const esc=v=>`"${String(v??'').replaceAll('"','""')}"`;
  return [header,...rows.map(r=>[r.title,r.company,r.dateApplied,r.platform,r.matchScore,r.status,r.url])].map(row=>row.map(esc).join(',')).join('\n');
}

export const screeningBank={
  'years of experience': a=>/^\d+(?:\.\d+)?$/.test(a.trim()),
  'visa sponsorship': a=>/^(yes|no|not required)$/i.test(a.trim()),
  'salary expectations': a=>/^(?:₹|\$)?\s?\d[\d,]*(?:\s?-\s?(?:₹|\$)?\s?\d[\d,]*)?$/.test(a.trim()),
  'notice period': a=>/^(?:immediate|\d+\s*(?:days?|weeks?|months?))$/i.test(a.trim()),
};
export function matchScreeningPrompt(prompt,answer){ const p=prompt.toLowerCase(); const key=Object.keys(screeningBank).find(k=>p.includes(k)); return key?{key,valid:screeningBank[key](answer),answer}:{key:null,valid:false,answer}; }
