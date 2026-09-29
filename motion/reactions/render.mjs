import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startServer,ROOT as motionRoot} from '../server.mjs';

const root=path.dirname(fileURLToPath(import.meta.url));
const output=path.join(root,'output'),framesRoot=path.join(root,'.frames');
const base='http://127.0.0.1:8766';
const catalog=JSON.parse(await readFile(path.join(root,'catalog.json'),'utf8'));
const only=process.argv.find(x=>x.startsWith('--only='))?.slice(7).split(',');
if(only)for(const id of only)assert(catalog.some(item=>item.id===id),'Unknown reaction: '+id);
const selected=only?catalog.filter(item=>only.includes(item.id)):catalog;
let server,browser;
function run(command,args){
  const result=spawnSync(command,args,{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
  if(result.error||result.status!==0)throw new Error(`${command} failed: ${result.error?.message??result.stderr}`);
  return result.stdout;
}
async function png(page,id,time,file){
  const data=await page.evaluate(({id,time})=>{
    const canvas=document.createElement('canvas');canvas.width=512;canvas.height=512;
    window.renderReaction(id,time,canvas,{background:'transparent'});
    return canvas.toDataURL('image/png').split(',')[1];
  },{id,time});
  await writeFile(file,Buffer.from(data,'base64'));
}
try{
  let health;
  try{health=await(await fetch(base+'/__cavelux_health',{signal:AbortSignal.timeout(1500)})).json();}
  catch{server=await startServer();health=await(await fetch(base+'/__cavelux_health')).json();}
  assert.equal(path.resolve(health.root),motionRoot,'Preview port belongs to another checkout');
  await mkdir(output,{recursive:true});
  browser=await chromium.launch({channel:'msedge',headless:true});
  const page=await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base+'/reactions/render-test.html',{waitUntil:'load'});
  await page.evaluate(()=>window.reactionsReady);
  const results=[];
  for(const item of selected){
    const dir=path.join(framesRoot,item.id);await mkdir(dir,{recursive:true});
    const count=Math.round(item.duration*item.fps);
    for(let frame=0;frame<count;frame++)await png(page,item.id,frame/item.fps,path.join(dir,`${String(frame).padStart(4,'0')}.png`));
    await png(page,item.id,item.posterTime,path.join(output,item.id+'.png'));
    const input=path.join(dir,'%04d.png');
    run('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(item.fps),'-i',input,
      '-filter_complex','[0:v]split[rgba][palette];[palette]palettegen=max_colors=192:reserve_transparent=1:stats_mode=full[p];[rgba][p]paletteuse=dither=bayer:bayer_scale=3:alpha_threshold=128',
      '-loop','0','-frames:v',String(count),path.join(output,item.id+'.gif')]);
    run('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate',String(item.fps),'-i',input,
      '-f','lavfi','-i',`color=c=0x101210:s=512x512:r=${item.fps}`,
      '-filter_complex','[1:v][0:v]overlay=shortest=1:format=auto,format=yuv420p[v]',
      '-map','[v]','-frames:v',String(count),'-r',String(item.fps),'-c:v','libx264','-crf','20','-preset','medium','-movflags','+faststart',path.join(output,item.id+'.mp4')]);
    const files={};
    for(const ext of ['gif','mp4','png']){const bytes=await readFile(path.join(output,item.id+'.'+ext));files[ext]={bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};}
    results.push({...item,width:512,height:512,frames:count,files});
    console.log(JSON.stringify({rendered:item.id,frames:count,gifBytes:files.gif.bytes}));
  }
  assert.deepEqual(errors,[],'Renderer raised a browser error');
  if(!only){
    const sources={};
    for(const file of ['renderer.js','catalog.json','../film.js','../sprites/06-normal.png','../sprites/01-idle.png','../sprites/05-spectrum.png'])sources[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
    await writeFile(path.join(output,'manifest.json'),JSON.stringify({pack:'Cavelux Clawd / Pack 01',width:512,height:512,gifLoop:0,transparency:'GIF binary alpha; PNG full alpha; MP4 carbon background',sources,reactions:results},null,2)+'\n');
    run('python',[path.join(root,'package.py')]);
  }
  console.log(JSON.stringify({check:'reaction render',result:'PASS',reactions:results.length,exitCode:0}));
}finally{if(browser)await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
