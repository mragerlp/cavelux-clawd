import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {ROOT, PORT, startServer} from '../motion/server.mjs';

const repository = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let ownedServer;
try {
  try { ownedServer = await startServer(); }
  catch (error) {
    if (error.code !== 'EADDRINUSE') throw error;
    const response = await fetch(`http://127.0.0.1:${PORT}/__cavelux_health`, {signal:AbortSignal.timeout(3000)});
    const health = await response.json();
    if (!response.ok || health.service !== 'cavelux-motion-film' || path.resolve(health.root) !== path.resolve(ROOT)) {
      throw new Error(`Port ${PORT} is occupied by another project.`);
    }
  }
  for (const args of [
    ['motion/render.mjs','--check-only'],
    ['motion/validate-character-states.mjs'],
    ['motion/validate-hypnosis.mjs'],
    ['motion/validate-ui.mjs'],
  ]) {
    await new Promise((resolve,reject) => {
      const child=spawn(process.execPath,args,{cwd:repository,stdio:'inherit',windowsHide:true});
      child.once('error',reject);
      child.once('close',code=>code===0?resolve():reject(new Error(`${args[0]} failed with exit ${code}`)));
    });
  }
  console.log(JSON.stringify({check:'motion suite',result:'PASS',exitCode:0}));
} finally {
  if (ownedServer) await new Promise(resolve=>ownedServer.close(resolve));
}
