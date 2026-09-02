// Ported from Floot AeroApply v1 helpers/profilePipeline.tsx.
const PLACEHOLDER_RE=/\[(?:company|hiring manager|role|name|organization)[^\]]*\]/i;
export function parseResumeText(text,sourceFormat){
  const lines=String(text||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const lower=String(text||'').toLowerCase();
  const section=names=>{const start=lines.findIndex(l=>names.some(n=>l.toLowerCase()===n));if(start<0)return [];return lines.slice(start+1).filter(l=>!/^(experience|work experience|skills|education|contact)$/i.test(l)).slice(0,20);};
  const email=String(text||'').match(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/)?.[0];
  const phone=String(text||'').match(/(?:\+?\d[\d\s().-]{8,}\d)/)?.[0];
  const skills=section(['skills','technical skills']);
  return {contact:{name:lines[0]||'',email,phone},education:section(['education','academic background']),experience:section(['experience','work experience','professional experience']),skills:skills.length?skills:(lower.match(/solidworks|catia|python|machine learning|artificial intelligence|systems engineering|aerodynamics|propulsion/gi)||[]),sourceFormat,confidence:Math.min(1,[email,phone,skills.length,section(['education']).length,section(['experience','work experience']).length].filter(Boolean).length/5)};
}
export function selectResumeVariant(jobText,variants){const h=String(jobText||'').toLowerCase();return variants.map(v=>({v,score:v.roleKeywords.filter(k=>h.includes(k.toLowerCase())).length})).sort((a,b)=>b.score-a.score)[0]?.v||null;}
export function validateGeneratedCoverLetter(letter,company,manager){return Boolean(String(letter||'').trim()&&String(company||'').trim()&&letter.toLowerCase().includes(company.toLowerCase())&&!PLACEHOLDER_RE.test(letter)&&(!manager||!letter.includes('[Hiring Manager]')));}
