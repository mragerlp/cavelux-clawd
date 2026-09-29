import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawn} from 'node:child_process';
import {startServer,ROOT,PORT} from '../motion/server.mjs';

const repository=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
let server;
try{
  try{server=await startServer();}
  catch(error){
    if(error.code!=='EADDRINUSE')throw error;
    const response=await fetch(`http://127.0.0.1:${PORT}/__cavelux_health`,{signal:AbortSignal.timeout(3000)});
    const health=await response.json();
    assert(response.ok&&health.service==='cavelux-motion-film'&&path.resolve(health.root)===path.resolve(ROOT),'Preview port belongs to another checkout');
  }
  for(const[command,args]of[
    ['python',['motion/reactions/verify-packaging.py']],
    [process.execPath,['motion/reactions/verify-renderer.mjs']],
    ['python',['motion/reactions/verify-assets.py']],
    [process.execPath,['motion/reactions/verify-ui.mjs']],
  ])await new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:repository,stdio:'inherit',windowsHide:true});
    child.once('error',reject);
    child.once('close',code=>code===0?resolve():reject(new Error(`${args[0]} failed with exit ${code}`)));
  });
  console.log(JSON.stringify({check:'reaction pack suite',result:'PASS',exitCode:0}));
}finally{if(server)await new Promise(resolve=>server.close(resolve));}
