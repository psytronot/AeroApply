import { AGENTS, buildAgentPrompt, normalizeCommands, safeJson } from './agent-orchestrator.js';
const expected=['planner','coder','tester','reviewer','executor'];
if(AGENTS.map(a=>a.id).join(',')!==expected.join(','))throw new Error('Agent roster/order is incorrect');
for(const agent of AGENTS){const prompt=buildAgentPrompt(agent,'QA the dashboard',{project:'AeroApply'});if(!prompt.includes(`You are the ${agent.name} agent`))throw new Error(`${agent.name} prompt missing role`);}
if(normalizeCommands(['npm test','rm -rf /','npm run qa']).join('|')!=='npm test|npm run qa')throw new Error('Command allowlist failed');
if(safeJson('```json\n{"ok":true}\n```').ok!==true)throw new Error('JSON parser failed');
console.log('Agent roster OK: Planner → Coder → Tester → Reviewer → Executor');
console.log('Agent prompt contracts OK');
console.log('Executor command allowlist OK');
