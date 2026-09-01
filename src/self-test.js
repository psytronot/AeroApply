import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const profile=JSON.parse(fs.readFileSync(path.join(root,'profile.json'),'utf8')).candidate;
if(!profile.name||!profile.education?.length||!profile.target_role_patterns?.length)throw new Error('Profile validation failed');
console.log('Profile OK:',profile.name);
console.log('Tracks:',profile.target_tracks.length,'| Role patterns:',profile.target_role_patterns.length);
