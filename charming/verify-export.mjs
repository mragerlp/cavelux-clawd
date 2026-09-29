import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'e2e-evidence');
const result={surface:'Local browser with injected documented Charming helper responses; not hosted upload or opening evidence',startedAt:new Date().toISOString(),sourceHash:createHash('sha256').update(await readFile(path.join(root,'ui.js'))).digest('hex'),checks:[],errors:[]};
await mkdir(out,{recursive:true});
async function check(name,fn){try{const evidence=await fn();result.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(error){result.checks.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}}
const browser=await chromium.launch({channel:'msedge',headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1100},acceptDownloads:true}),page=await context.newPage();
page.on('pageerror',error=>result.errors.push(error.message));
page.setDefaultTimeout(2500);
async function reset(mode='success'){
  await page.goto('http://127.0.0.1:8787/studio');await page.waitForFunction(()=>window.CAVELUX_STUDIO_READY===true);
  await page.evaluate(mode=>{
    window.exportCalls=[];window.exportMode=mode;
    window.charming.assets.upload=async(file,options)=>{
      window.exportCalls.push({method:'upload',key:options.key,isFile:file instanceof File,name:file.name,type:file.type,bytes:file.size,signature:Array.from(new Uint8Array(await file.slice(0,8).arrayBuffer())),json:file.type==='application/json'?JSON.parse(await file.text()):null});
      if(window.exportMode==='upload-error')throw new Error('Upload unavailable');
      return{key:options.key,url:'https://example.invalid/unused-response-url'};
    };
    window.charming.assets.getUrl=key=>{window.exportCalls.push({method:'getUrl',key});if(window.exportMode==='url-error')throw new Error('URL unavailable');return'https://example.invalid/'+key+'?temporary=local-test';};
    window.charming.openLink=url=>{window.exportCalls.push({method:'openLink',url});if(window.exportMode==='open-error')throw new Error('Host opening unavailable');};
    if(mode==='viewer')window.charming.viewer={role:'viewer',can:()=>false};
  },mode);
}
const calls=()=>page.evaluate(()=>window.exportCalls);
const done=()=>page.waitForFunction(()=>document.getElementById('export-png')?.disabled===false&&document.getElementById('export-status')?.textContent);
try{
 await check('native PNG uploads a File to the fixed key then signs and opens it',async()=>{await reset();await page.locator('#export-png').click();await done();const log=await calls();assert.deepEqual(log.map(x=>x.method),['upload','getUrl','openLink']);assert.equal(log[0].key,'clawd-export.png');assert.equal(log[0].isFile,true);assert.equal(log[0].type,'image/png');assert.deepEqual(log[0].signature,[137,80,78,71,13,10,26,10]);assert.equal(log[2].url,'https://example.invalid/clawd-export.png?temporary=local-test');assert.equal(await page.locator('#export-link').innerText(),'Open exported PNG');assert.equal(await page.locator('#export-status').getAttribute('data-error'),'false');return log;});
 await check('native JSON uploads the selected settings and reuses its fixed key',async()=>{await reset();await page.locator('#state-ultracode').click();await page.locator('#export-json').click();await done();const log=await calls();assert.deepEqual(log.map(x=>x.method),['upload','getUrl','openLink']);assert.equal(log[0].key,'clawd-preset.json');assert.equal(log[0].json.settings.state,'ultracode');assert.equal(log[0].json.schemaVersion,1);await page.locator('#export-json').click();await done();assert.equal((await calls())[3].key,'clawd-preset.json');return log;});
 await check('upload failure stops signing and opening and shows an inline error',async()=>{await reset('upload-error');await page.locator('#export-png').click();await done();assert.deepEqual((await calls()).map(x=>x.method),['upload']);assert.equal(await page.locator('#export-link').isVisible(),false);assert.equal(await page.locator('#export-status').getAttribute('data-error'),'true');assert.match(await page.locator('#export-status').innerText(),/Upload unavailable/);return{message:await page.locator('#export-status').innerText()};});
 await check('URL failure never claims an artifact is ready',async()=>{await reset('url-error');await page.locator('#export-json').click();await done();assert.deepEqual((await calls()).map(x=>x.method),['upload','getUrl']);assert.equal(await page.locator('#export-link').isVisible(),false);assert.equal(await page.locator('#export-status').getAttribute('data-error'),'true');return{message:await page.locator('#export-status').innerText()};});
 await check('host opening failure keeps the generated link and retry does not upload again',async()=>{await reset('open-error');await page.locator('#export-png').click();await done();assert.equal(await page.locator('#export-link').isVisible(),true);assert.equal(await page.locator('#export-status').getAttribute('data-error'),'true');await page.evaluate(()=>{window.exportMode='success';});await page.locator('#export-link').click();await page.waitForFunction(()=>document.getElementById('export-status').dataset.error==='false');const log=await calls();assert.deepEqual(log.map(x=>x.method),['upload','getUrl','openLink','getUrl','openLink']);return log;});
 await check('read-only viewers use a Blob download without a native asset write',async()=>{await reset('viewer');const event=page.waitForEvent('download');await page.locator('#export-png').click();const download=await event;assert.equal(download.suggestedFilename(),'cavelux-clawd-normal.png');assert.deepEqual(await calls(),[]);assert.equal(await page.locator('#export-link').isVisible(),true);return{filename:download.suggestedFilename(),nativeCalls:[]};});
 await check('native export has no uncaught browser errors',async()=>{assert.deepEqual(result.errors,[]);return result.errors;});
}finally{await browser.close();result.summary={passed:result.checks.filter(x=>x.status==='PASS').length,failed:result.checks.filter(x=>x.status==='FAIL').length};result.finishedAt=new Date().toISOString();await writeFile(path.join(out,'export-results.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.summary));process.exitCode=result.summary.failed?1:0;}
