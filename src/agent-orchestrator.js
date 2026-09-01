import { spawn } from 'node:child_process';

export const AGENTS = [
  { id:'planner', name:'Planner', purpose:'Break the requested change into a concrete, verifiable implementation plan and acceptance criteria.' },
  { id:'coder', name:'Coder', purpose:'Translate the plan into precise code changes, file-level edits, and implementation notes without inventing project structure.' },
  { id:'tester', name:'Tester', purpose:'Design and execute verification strategy, identify regressions, and report reproducible failures.' },
  { id:'reviewer', name:'Reviewer', purpose:'Critically review the plan, proposed code, and test results for correctness, safety, maintainability, and scope.' },
  { id:'executor', name:'Executor', purpose:'Turn the approved work into a safe execution checklist and select only allowlisted local QA commands.' },
];

const ALLOWED_COMMANDS = new Set(['npm test','npm run qa','npm run test-browser']);

export function buildAgentPrompt(agent, task, context = {}) {
  const common = `You are the ${agent.name} agent in AeroApply, a local-first job intelligence and browser-assistance application.\n\nYour role: ${agent.purpose}\n\nRules:\n- Be truthful about the repository context provided below.\n- Do not invent files, APIs, test results, credentials, or completed actions.\n- Preserve the application's safety boundary: no final job application submission, no CAPTCHA/MFA bypass, and no false declarations.\n- Return JSON only.\n\nUSER TASK:\n${task}\n\nREPOSITORY CONTEXT:\n${JSON.stringify(context, null, 2)}`;
  const role = {
    planner:'Return {"status":"READY|BLOCKED","goal":"","steps":[],"acceptance_criteria":[],"risks":[],"questions":[]}.',
    coder:'Return {"status":"READY|BLOCKED","files_to_change":[],"changes":[],"patch_notes":[],"implementation_order":[],"risks":[]}. Do not claim you edited files unless the executor actually did so.',
    tester:'Return {"status":"READY|BLOCKED","test_plan":[],"commands":[],"expected_results":[],"observations":[],"failures":[],"regressions":[]}. Only list commands from the allowlist: npm test, npm run qa, npm run test-browser.',
    reviewer:'Return {"status":"APPROVE|CHANGES_REQUIRED|BLOCKED","strengths":[],"findings":[],"required_changes":[],"safety_checks":[],"approval_reason":""}.',
    executor:'Return {"status":"READY|BLOCKED","approved_actions":[],"commands":[],"rollback":[],"human_checkpoints":[]}. Commands must be from the allowlist: npm test, npm run qa, npm run test-browser. The executor may not claim to have run them; this endpoint runs them separately.',
  }[agent.id];
  return `${common}\n\nOUTPUT CONTRACT:\n${role}`;
}

export async function callModel(prompt, nvidiaFn) { return safeJson(await nvidiaFn(prompt)); }
export function safeJson(s) {
  const raw=String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'').trim();
  try{return JSON.parse(raw);}catch{}
  const first=raw.indexOf('{'),last=raw.lastIndexOf('}');
  if(first>=0&&last>first)return JSON.parse(raw.slice(first,last+1));
  throw new Error('Agent response was not valid JSON');
}
export function normalizeCommands(commands) { return Array.isArray(commands) ? commands.map(x=>String(x||'').trim()).filter(x=>ALLOWED_COMMANDS.has(x)) : []; }
export function runCommand(command,cwd,timeoutMs=120000){
  if(!ALLOWED_COMMANDS.has(command))throw new Error(`Command not allowed: ${command}`);
  return new Promise(resolve=>{
    const child=spawn('npm.cmd',command.slice(4).split(' '),{cwd,shell:false,windowsHide:true,env:process.env});
    let stdout='',stderr='';
    const timer=setTimeout(()=>{child.kill();resolve({command,ok:false,code:null,timedOut:true,stdout,stderr:`${stderr}\nTimed out after ${timeoutMs}ms`});},timeoutMs);
    child.stdout.on('data',d=>stdout+=d.toString()); child.stderr.on('data',d=>stderr+=d.toString());
    child.on('close',code=>{clearTimeout(timer);resolve({command,ok:code===0,code,timedOut:false,stdout,stderr});});
    child.on('error',err=>{clearTimeout(timer);resolve({command,ok:false,code:null,timedOut:false,stdout,stderr:`${stderr}\n${err.message}`});});
  });
}
