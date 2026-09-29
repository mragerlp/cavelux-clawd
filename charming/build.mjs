import {mkdir,readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.dirname(fileURLToPath(import.meta.url));

export async function buildStudio(){
  const [module,controller,styles,renderer]=await Promise.all([readFile(path.join(root,'backend.mjs'),'utf8'),readFile(path.join(root,'ui.js'),'utf8'),readFile(path.join(root,'styles.css'),'utf8'),readFile(path.join(root,'../motion/film.js'),'utf8')]);
  if(!renderer.includes('CAVELUX_CHARACTER_ONLY')||!renderer.includes('eyeSpeed'))throw new Error('Shared renderer does not expose the studio contract.');
  const ui=`(function(){'use strict';async function boot(){const host=document.getElementById('app');host.innerHTML='<div class="boot" role="status"><p>CAVELUX / CHARACTER STUDIO</p><h1>One small spark.</h1><p>Loading the character assets…</p></div>';window.CAVELUX_STUDIO_READY=false;try{const hidden=document.createElement('canvas');hidden.id='film';hidden.width=1080;hidden.height=1920;hidden.hidden=true;hidden.setAttribute('aria-hidden','true');host.appendChild(hidden);window.CAVELUX_CHARACTER_ONLY=true;const urls=await Promise.all(['06-normal.png','01-idle.png','05-spectrum.png'].map(key=>window.charming.assets.load(key)));window.CAVELUX_ASSET_URLS={normal:urls[0],working:urls[1],spectrum:urls[2]};
${renderer}
await window.filmReady;
${controller}
}catch(error){host.innerHTML='<div class="boot"><p>CAVELUX / CHARACTER STUDIO</p><h1>The character could not load.</h1><p id="boot-error" role="alert"></p><button id="boot-retry" type="button">Retry loading assets</button></div>';document.getElementById('boot-error').textContent='The studio needs its three uploaded character PNGs. '+error.message;document.getElementById('boot-retry').onclick=boot;}}boot();})();\n`;
  const bytes=Buffer.byteLength(module)+Buffer.byteLength(ui);
  if(bytes>65536)throw new Error(`Combined Charming module + UI exceeds64KiB: ${bytes}bytes`);
  if(/(?:^|\n)\s*import\s/m.test(ui)||/\beval\s*\(|new Function\s*\(/.test(ui))throw new Error('Classic UI bundle contains dynamic code or imports.');
  await mkdir(path.join(root,'dist'),{recursive:true});
  const source={module,ui,styles};await writeFile(path.join(root,'dist/source.json'),JSON.stringify(source,null,2)+'\n');await writeFile(path.join(root,'dist/ui.bundle.js'),ui);await writeFile(path.join(root,'dist/styles.css'),styles);
  const evidence={moduleBytes:Buffer.byteLength(module),uiBytes:Buffer.byteLength(ui),combinedBytes:bytes,limitBytes:65536,assetKeys:['06-normal.png','01-idle.png','05-spectrum.png']};
  await writeFile(path.join(root,'dist/build.json'),JSON.stringify(evidence,null,2)+'\n');console.log(JSON.stringify(evidence));return source;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await buildStudio();
