import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url))); const port=8799; const base=`http://127.0.0.1:${port}`;
const env={...process.env,PORT:String(port),BROWSER_HEADLESS:'true',NVIDIA_API_KEY:''};
const server=spawn(process.execPath,['server.js'],{cwd:root,env,stdio:['ignore','pipe','pipe']}); let browser,page; const failures=[];
const pass=n=>console.log(`PASS  ${n}`); const fail=(n,e)=>{failures.push(n);console.error(`FAIL  ${n}: ${e.message}`)};
async function waitForServer(){for(let i=0;i<50;i++){try{const r=await fetch(`${base}/api/health`);if(r.ok)return}catch{}await new Promise(r=>setTimeout(r,100))}throw new Error('Server did not start')}
async function post(url,body={}){const r=await fetch(`${base}${url}`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});const x=await r.json();if(!r.ok)throw new Error(x.error||`HTTP ${r.status}`);return x}
try{
 await waitForServer(); const health=await(await fetch(`${base}/api/health`)).json(); if(!health.ok||health.nvidiaConfigured)throw new Error('Health endpoint incorrect');pass('health endpoint');
 const profile=await(await fetch(`${base}/api/profile`)).json();if(profile.name!=='Sai Akhil Malladi')throw new Error('Profile not loaded');pass('profile load');
 await post('/api/jobs/import',{jobs:[{id:'qa-1',title:'Junior Aerospace Engineer',company:'QA Aerospace',location:'Bengaluru, India',url:`${base}/qa-job.html`,description:'Junior aerospace engineering role requiring CAD, ANSYS, aerospace systems and AI/ML.'}]});pass('job import');
 const score=await post('/api/score',{id:'qa-1',title:'Junior Aerospace Engineer',company:'QA Aerospace',description:'Junior aerospace engineering role requiring CAD, ANSYS, aerospace systems and AI/ML.'});if(!Number.isFinite(score.match_score)||!score.recommendation)throw new Error('Invalid score');pass('score endpoint');
 const tailor=await post('/api/tailor',{title:'AI/ML Intern',company:'QA AI',description:'AI/ML internship using Python and machine learning.'});if(!tailor.headline||!tailor.summary)throw new Error('Invalid tailoring');pass('tailor endpoint');
 browser=await chromium.launch();page=await browser.newPage();await page.goto(`${base}/`);await page.waitForLoadState('domcontentloaded');if(!(await page.locator('h1').innerText()).includes('Local aerospace + AI/ML'))throw new Error('Dashboard did not render');pass('dashboard render');
 await page.fill('#url',`${base}/qa-job.html`);await page.click('button:has-text("Open in AeroApply Browser")');await page.waitForTimeout(300);pass('open browser action');
 await page.click('button:has-text("Read current page")');await page.waitForTimeout(200);const jd=await page.locator('#jd').inputValue();if(!jd.includes('Junior Aerospace Engineer'))throw new Error('Page text not imported');pass('read current page action');
 await page.click('button:has-text("Score with Nemotron")');await page.waitForTimeout(200);if(!(await page.locator('#scoreout').innerText()).includes('/100'))throw new Error('Score UI not updated');pass('score UI');
 await page.click('button:has-text("Generate tailoring plan")');await page.waitForTimeout(200);if(!(await page.locator('#tailout').innerText()).includes('headline'))throw new Error('Tailoring UI not updated');pass('tailoring UI');
 await page.click('button:has-text("Fill known fields")');await page.waitForTimeout(200);if(!(await page.locator('#browserout').innerText()).includes('Filled:'))throw new Error('Fill UI not updated');pass('fill-known UI');
 await page.click('button:has-text("Refresh")');await page.waitForTimeout(100);if(!(await page.locator('#jobs').innerText()).includes('Junior Aerospace Engineer'))throw new Error('Queue not rendered');pass('queue render');
}catch(e){console.error(e);process.exitCode=1}finally{if(browser)await browser.close().catch(()=>{});server.kill('SIGTERM');if(failures.length)console.error(`${failures.length} failures`);if(!failures.length&&process.exitCode!==1)console.log('QA smoke suite complete.')}
