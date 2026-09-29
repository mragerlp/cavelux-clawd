import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'output/work-eye-checks');
const baseline = process.argv.includes('--baseline');
const hash = data => createHash('sha256').update(data).digest('hex');
const report = {startedAt: new Date().toISOString(), baseline, sourceSHA256: hash(await readFile(path.join(root, 'film.js'))), checks: [], previews: {}, scenes: [], pageErrors: []};
await mkdir(out, {recursive: true});
const previous = baseline ? null : JSON.parse(await readFile(path.join(out, 'baseline.json'), 'utf8'));
const health = await fetch('http://127.0.0.1:8766/__cavelux_health').then(r => r.json());
assert.equal(path.resolve(health.root).toLowerCase(), root.toLowerCase());
const cleanError = error => String(error).replace(/\x1b\[[0-9;]*m/g, '');
const check = (name, fn) => {try {report.checks.push({name, status: 'PASS', evidence: fn()});} catch (error) {report.checks.push({name, status: 'FAIL', error: cleanError(error.message)});}};
const browser = await chromium.launch({channel: 'msedge', headless: true});
try {
  const page = await browser.newPage({viewport: {width: 1080, height: 1920}, deviceScaleFactor: 1});
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.goto('http://127.0.0.1:8766/?export=1', {waitUntil: 'load'});
  await page.evaluate(() => window.filmReady);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 720; canvas.height = 500;
    window.workEyeCapture = (state, time, workingActive) => {
      const options = {background: 'transparent'};
      if (workingActive !== null) options.workingActive = workingActive;
      const descriptor = window.renderCharacterPreview(state, time, canvas, options);
      const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
      const b = descriptor.heroBounds, black = i => pixels[i+3] > 200 && pixels[i] < 64 && pixels[i+1] < 64 && pixels[i+2] < 64;
      const eyes = [[.16, .48], [.52, .84]].map(([left, right]) => {
        const box = {x: Math.round(b.x + b.width*left), y: Math.round(b.y + b.height*.1), width: Math.round(b.width*(right-left)), height: Math.round(b.height*.49)};
        const mask = new Uint8Array(box.width*box.height), seen = new Uint8Array(mask.length), components = [];
        for (let y = 0; y < box.height; y++) for (let x = 0; x < box.width; x++) mask[y*box.width+x] = black(((box.y+y)*canvas.width+box.x+x)*4) ? 1 : 0;
        for (let start = 0; start < mask.length; start++) if (mask[start] && !seen[start]) {
          const queue = [start]; seen[start] = 1; let x0=box.width, x1=0, y0=box.height, y1=0, touchesEdge=false;
          for (let head = 0; head < queue.length; head++) {
            const p=queue[head], x=p%box.width, y=Math.floor(p/box.width);
            x0=Math.min(x0,x); x1=Math.max(x1,x); y0=Math.min(y0,y); y1=Math.max(y1,y);
            touchesEdge ||= x===0 || y===0 || x===box.width-1 || y===box.height-1;
            for (const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]) if (xx>=0 && yy>=0 && xx<box.width && yy<box.height) {const q=yy*box.width+xx;if(mask[q]&&!seen[q]){seen[q]=1;queue.push(q);}}
          }
          if (touchesEdge) for (const p of queue) mask[p]=0;
          else components.push({area:queue.length, width:x1-x0+1, height:y1-y0+1, rectangularFill:queue.length/((x1-x0+1)*(y1-y0+1))});
        }
        components.sort((a,z)=>z.area-a.area);
        return {box, components, mask: Array.from(mask)};
      });
      let outsideGreen=0, coloredBodyPixels=0;
      for (let y=0;y<canvas.height;y++) for(let x=0;x<canvas.width;x++) {
        const i=(y*canvas.width+x)*4;
        if (pixels[i+3] <= 60) continue;
        const outside=x<b.x-3 || x>b.x+b.width+3 || y<b.y-3 || y>b.y+b.height+3;
        if(outside && pixels[i+1]>75 && pixels[i+1]>pixels[i]*1.23 && pixels[i+1]>pixels[i+2]*1.23) outsideGreen++;
        if(!outside && Math.max(...pixels.slice(i,i+3))-Math.min(...pixels.slice(i,i+3))>50) coloredBodyPixels++;
      }
      return {descriptor, eyes, outsideGreen, coloredBodyPixels, png:canvas.toDataURL()};
    };
  });
  for (const state of ['working', 'ultracode']) {
    const captures = {};
    for (const [name, time, active] of [['inactive3',3,false], ['inactive4',4,false], ['default3',3,null], ['default4',4,null], ['active3',3,true]]) {
      const result = await page.evaluate(args => window.workEyeCapture(...args), [state,time,active]);
      const png = Buffer.from(result.png.split(',')[1], 'base64');
      result.pngSHA256 = hash(png); delete result.png;
      for (const eye of result.eyes) {eye.maskSHA256 = hash(Buffer.from(eye.mask)); delete eye.mask;}
      captures[name] = result;
      if (name !== 'active3') await writeFile(path.join(out, `${baseline?'baseline-':''}${state}-${name}.png`), png);
    }
    report.previews[state] = captures;
    check(`${state}: inactive descriptor preserves body state with rectangular eyes and no code aura`, () => {
      for (const c of [captures.inactive3,captures.inactive4]) {
        assert.equal(c.descriptor.state,state); assert.equal(c.descriptor.workingActive,false); assert.equal(c.descriptor.eyeMode,'rectangular');
        assert.equal(c.descriptor.eyeMotion,'none'); assert.equal(c.outsideGreen,0); assert.equal(c.descriptor.auraBounds,null);
        assert.ok(c.coloredBodyPixels>1000);
      }
      return {state, outsideGreen:captures.inactive3.outsideGreen};
    });
    check(`${state}: both full eye regions are plain rectangles without residual spiral ink`, () => {
      for (const c of [captures.inactive3,captures.inactive4]) for (const eye of c.eyes) {
        const main=eye.components[0]; assert.ok(main && main.area>25, 'Plain eye must be visible');
        assert.ok(main.rectangularFill>.9, `Eye is not rectangular: ${JSON.stringify(main)}`);
        assert.ok(eye.components.slice(1).reduce((sum,x)=>sum+x.area,0)<=main.area*.05, 'Residual disconnected dark eye ink remains');
      }
      assert.deepEqual(captures.inactive3.eyes.map(e=>e.maskSHA256),captures.inactive4.eyes.map(e=>e.maskSHA256),'Inactive black eye masks must stay still');
      return captures.inactive3.eyes.map(e=>e.components);
    });
    check(`${state}: default active eyes retain original pixels and animate`, () => {
      assert.equal(captures.default3.pngSHA256,captures.active3.pngSHA256);
      assert.equal(captures.default3.descriptor.workingActive,true); assert.equal(captures.default3.descriptor.eyeMode,'friendly-spiral');
      for(let i=0;i<2;i++) assert.notEqual(captures.default3.eyes[i].maskSHA256,captures.default4.eyes[i].maskSHA256,'Each active spiral must move');
      if(previous) for(const key of ['default3','default4']) assert.equal(captures[key].pngSHA256,previous.previews[state][key].pngSHA256,'Default active appearance changed from pre-edit baseline');
      return {referenceCompared:!!previous, default3:captures.default3.pngSHA256, default4:captures.default4.pngSHA256};
    });
    check(`${state}: body behavior remains independent of inactive eyes`, () => {
      if(state==='ultracode') {assert.notEqual(captures.inactive3.pngSHA256,captures.inactive4.pngSHA256);assert.notEqual(captures.inactive3.descriptor.rainbowPhase,captures.inactive4.descriptor.rainbowPhase);}
      else assert.equal(captures.inactive3.pngSHA256,captures.inactive4.pngSHA256,'Idle working preview should be still without aura');
      return {sameImage:captures.inactive3.pngSHA256===captures.inactive4.pngSHA256};
    });
  }
  const scenes = [
    {name:'Build',start:7.5,times:[[1,false],[2,true],[5,true],[5.5,false],[6.5,false]]},
    {name:'Orchestrate',start:15,times:[[.75,false],[1.5,true],[5,true],[5.5,false],[6.5,false]]},
    {name:'Integrate',start:22.5,times:[[.5,false],[1,true],[5,true],[5.5,false],[6.5,false]]},
    {name:'Ultracode',start:30,times:[[.3,false],[.5,true],[4,true],[4.5,false],[5,false],[6.5,false]]},
  ];
  for(const scene of scenes) {
    const observations=[];
    for(const [local,active] of scene.times) {
      const frame=Math.round((scene.start+local)*30);
      const descriptor=await page.evaluate(frame=>{window.renderFrame(frame);return window.characterState;},frame);
      observations.push({frame,local,expectedWorkingActive:active,descriptor});
    }
    report.scenes.push({name:scene.name,observations});
    check(`${scene.name}: hero eyes follow ready, active-work, and done timing`,()=>{
      for(const o of observations) {assert.equal(o.descriptor.workingActive,o.expectedWorkingActive,`Frame ${o.frame} activity`);assert.equal(o.descriptor.eyeMode,o.expectedWorkingActive?'friendly-spiral':'rectangular',`Frame ${o.frame} eyes`);}
      return observations.map(o=>({frame:o.frame,active:o.descriptor.workingActive,eyeMode:o.descriptor.eyeMode}));
    });
  }
  const signatures=[];
  for(const frame of [90,1290]) signatures.push(await page.evaluate(frame=>{window.renderFrame(frame);return {frame,...window.characterState};},frame));
  check('opening and closing signatures keep normal rectangular eyes',()=>{for(const d of signatures){assert.equal(d.state,'normal');assert.equal(d.eyeMode,'rectangular');assert.equal(d.workingActive,false);}return signatures;});
  check('browser has no rendering errors',()=>{assert.deepEqual(report.pageErrors,[]);return [];});
  const endHash=hash(await readFile(path.join(root,'film.js')));
  check('source remained fixed during capture',()=>{assert.equal(endHash,report.sourceSHA256);return endHash;});
} catch(error) {report.checks.push({name:'harness execution',status:'FAIL',error:cleanError(error.stack)});}
finally {
  await browser.close();report.finishedAt=new Date().toISOString();
  report.summary={passed:report.checks.filter(c=>c.status==='PASS').length,failed:report.checks.filter(c=>c.status==='FAIL').length};
  await writeFile(path.join(out,baseline?'baseline.json':'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({baseline,sourceSHA256:report.sourceSHA256,...report.summary,failures:report.checks.filter(c=>c.status==='FAIL').map(c=>({name:c.name,error:c.error}))},null,2));
  process.exitCode=report.summary.failed?1:0;
}
