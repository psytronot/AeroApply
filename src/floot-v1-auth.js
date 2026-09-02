// Ported from Floot AeroApply v1 helpers/authIntegration.tsx.
const KEY='aeroapply.jobboard.connections';
export function loadConnections(){try{return JSON.parse(localStorage.getItem(KEY)||'[]')}catch{return[]}}
export function saveConnections(connections){localStorage.setItem(KEY,JSON.stringify(connections))}
export async function connectBoard(provider){await new Promise(r=>setTimeout(r,350));const connection={provider,connected:true,accountLabel:`${provider} account`};saveConnections([...loadConnections().filter(c=>c.provider!==provider),connection]);return connection}
export async function revokeBoard(provider){saveConnections(loadConnections().filter(c=>c.provider!==provider))}
export function isExpired(connection){return !!connection.expiresAt&&new Date(connection.expiresAt).getTime()<=Date.now()}
