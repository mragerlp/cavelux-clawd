import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const base='http://127.0.0.1:8766';
const health=await(await fetch(`${base}/__cavelux_health`)).json();
assert.equal(path.resolve(health.root),root,'The preview server is serving the wrong checkout');
const out=path.join(root,'output','hypnosis-checks');
await mkdir(out,{recursive:true});
const report={startedAt:new Date().toISOString(),root,checks:[]};
async function check(name,body){try{const evidence=await body();report.checks.push({name,status:'PASS',evidence});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,status:'FAIL',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage();
  await page.goto(`${base}/index.html?export=1`,{waitUntil:'load'});
  await page.evaluate(()=>window.filmReady);
  for(const state of ['normal','working','ultracode']){
    const result=await page.evaluate(({state})=>{
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=500;
      const captures=[.2,.65].map(time=>{
        const descriptor=window.renderCharacterPreview(state,time,canvas,{aura:false});
        return{descriptor,pixels:canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,png:canvas.toDataURL()};
      });
      const box=captures[0].descriptor.heroBounds;
      const regions=captures[0].descriptor.eyeBounds??[[.16,.48],[.52,.84]].map(([left,right])=>({x:box.x+left*box.width,y:box.y+.08*box.height,width:(right-left)*box.width,height:.55*box.height}));
      const inside=(x,y,r)=>x>=r.x&&x<r.x+r.width&&y>=r.y&&y<r.y+r.height;
      const black=(d,i)=>d[i+3]>200&&d[i]<64&&d[i+1]<64&&d[i+2]<64;
      const eyes=regions.map(()=>({blackBefore:0,blackAfter:0,changed:0}));
      let outsideEyeBlackChanges=0;
      for(let y=Math.ceil(box.y);y<box.y+box.height;y++)for(let x=Math.ceil(box.x);x<box.x+box.width;x++){
        const i=(y*canvas.width+x)*4,a=black(captures[0].pixels,i),b=black(captures[1].pixels,i);
        const region=regions.findIndex(r=>inside(x,y,r));
        if(region>=0){if(a)eyes[region].blackBefore++;if(b)eyes[region].blackAfter++;if(a!==b)eyes[region].changed++;}
        else if(a!==b)outsideEyeBlackChanges++;
      }
      return{state,times:[.2,.65],heroBefore:captures[0].descriptor.heroBounds,heroAfter:captures[1].descriptor.heroBounds,eyes,outsideEyeBlackChanges,pngs:captures.map(c=>c.png)};
    },{state});
    for(let i=0;i<result.pngs.length;i++)await writeFile(path.join(out,`${state}-${i}.png`),Buffer.from(result.pngs[i].split(',')[1],'base64'));
    delete result.pngs;
    try{
      assert.deepEqual(result.heroBefore,result.heroAfter,'Whole character moved between isolated previews');
      assert.ok(result.eyes.every(eye=>eye.blackBefore>50&&eye.blackAfter>50),'Both black eyes must remain visible');
      if(state==='normal')assert.ok(result.eyes.every(eye=>eye.changed===0),'Normal rectangular eyes must remain static');
      else assert.ok(result.eyes.every(eye=>eye.changed>60),`Expected actual black spiral motion in both eyes: ${JSON.stringify(result.eyes)}`);
      assert.ok(result.outsideEyeBlackChanges<10,`Black silhouette outside the eye regions moved: ${result.outsideEyeBlackChanges}`);
      report.checks.push({name:`${state} isolated black-eye motion`,status:'PASS',evidence:result});
      console.log(`PASS ${state} black-eye motion`);
    }catch(error){report.checks.push({name:`${state} isolated black-eye motion`,status:'FAIL',error:error.message,evidence:result});console.error(`FAIL ${state}: ${error.message}`);}
  }
  await check('dark to transparent background preserves export alpha on the same canvas',async()=>{
    const result=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=500;
      window.renderCharacterPreview('normal',3,canvas);
      const g=canvas.getContext('2d'),dark=Array.from(g.getImageData(0,0,1,1).data);
      window.renderCharacterPreview('normal',3,canvas,{background:'transparent'});
      const transparent=Array.from(g.getImageData(0,0,1,1).data),data=g.getImageData(0,0,canvas.width,canvas.height).data;
      let visiblePixels=0;for(let i=3;i<data.length;i+=4)if(data[i]>200)visiblePixels++;
      const png=canvas.toDataURL();window.renderCharacterPreview('normal',3,canvas,{background:'light'});
      return{dark,transparent,light:Array.from(g.getImageData(0,0,1,1).data),visiblePixels,alpha:g.getContextAttributes().alpha,png};
    });
    await writeFile(path.join(out,'transparent-normal.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
    assert.equal(result.alpha,true);assert.equal(result.dark[3],255);assert.equal(result.transparent[3],0);assert.ok(result.visiblePixels>1000);assert.ok(result.light.slice(0,3).every(value=>value>200));
    return result;
  });
  await check('scale control and range clamping change actual body bounds',async()=>{
    const result=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=500;
      const small=window.renderCharacterPreview('normal',1,canvas,{scale:.4});
      const large=window.renderCharacterPreview('normal',1,canvas,{scale:1.4});
      const clamped=window.renderCharacterPreview('normal',1,canvas,{scale:9,eyeSpeed:9});
      return{small:small.heroBounds,large:large.heroBounds,clampedScale:clamped.scale,clampedSpeed:clamped.eyeSpeed};
    });
    assert.ok(Math.abs(result.large.width/result.small.width-3.5)<1e-9);assert.equal(result.clampedScale,1.4);assert.equal(result.clampedSpeed,3);return result;
  });
  for(const state of ['working','ultracode'])await check(`${state} eyeSpeed zero freezes actual eye pixels`,async()=>{
    const result=await page.evaluate(state=>{
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=500;
      const take=(time,eyeSpeed=0)=>{const d=window.renderCharacterPreview(state,time,canvas,{eyeSpeed,aura:false});const g=canvas.getContext('2d'),pixels=g.getImageData(0,0,canvas.width,canvas.height).data;return{d,pixels};};
      const a=take(.2),b=take(.65),normalSpeed=take(.65,1),doubleSpeed=take(.325,2);let changed=0,blackPixels=0,doubleSpeedMismatches=0;
      for(const box of a.d.eyeBounds)for(let y=Math.ceil(box.y);y<box.y+box.height;y++)for(let x=Math.ceil(box.x);x<box.x+box.width;x++){
        const i=(y*canvas.width+x)*4,black=data=>data[i]<64&&data[i+1]<64&&data[i+2]<64&&data[i+3]>200;
        if(black(a.pixels))blackPixels++;if(black(a.pixels)!==black(b.pixels))changed++;if(black(normalSpeed.pixels)!==black(doubleSpeed.pixels))doubleSpeedMismatches++;
      }
      return{changed,blackPixels,doubleSpeedMismatches,phaseA:a.d.eyePhase,phaseB:b.d.eyePhase};
    },state);
    assert.equal(result.changed,0);assert.ok(result.blackPixels>100);assert.equal(result.doubleSpeedMismatches,0,'Double eyeSpeed must reach the same eye raster in half the time');assert.equal(result.phaseA,0);assert.equal(result.phaseB,0);return result;
  });
  await check('working aura can be disabled independently of eye motion',async()=>{
    const result=await page.evaluate(()=>{
      const canvas=document.createElement('canvas');canvas.width=720;canvas.height=500;
      return[true,false].map(aura=>{const d=window.renderCharacterPreview('working',.65,canvas,{background:'transparent',aura});const p=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data,b=d.heroBounds;let outsideGreen=0;
        for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++){if(x>=b.x-3&&x<=b.x+b.width+3&&y>=b.y-3&&y<=b.y+b.height+3)continue;const i=(y*canvas.width+x)*4;if(p[i+3]>60&&p[i+1]>75&&p[i+1]>p[i]*1.23&&p[i+1]>p[i+2]*1.23)outsideGreen++;}
        return{aura,outsideGreen,eyePhase:d.eyePhase,descriptorAura:d.aura};});
    });
    assert.ok(result[0].outsideGreen>20);assert.equal(result[1].outsideGreen,0);assert.equal(result[0].eyePhase,result[1].eyePhase);assert.equal(result[1].descriptorAura,'none');return result;
  });
  await check('character-only embedding honors three asset URL overrides without brand or film canvas',async()=>{
    const preview=await browser.newPage(),requests=[],errors=[];
    try{
      await preview.goto(`${base}/__cavelux_health`);await preview.setContent('<!doctype html><canvas id="preview" width="720" height="500"></canvas>');
      preview.on('request',request=>requests.push(request.url()));preview.on('pageerror',error=>errors.push(error.message));
      const urls={normal:`${base}/sprites/06-normal.png?studio-contract=1`,working:`${base}/sprites/01-idle.png?studio-contract=1`,spectrum:`${base}/sprites/05-spectrum.png?studio-contract=1`};
      await preview.evaluate(urls=>{window.CAVELUX_CHARACTER_ONLY=true;window.CAVELUX_ASSET_URLS=urls;},urls);
      await preview.addScriptTag({content:await readFile(path.join(root,'film.js'),'utf8')});await preview.evaluate(()=>window.filmReady);
      const result=await preview.evaluate(()=>{const canvas=document.getElementById('preview'),d=window.renderCharacterPreview('working',.65,canvas,{background:'transparent',eyeSpeed:2,aura:false});return{hasFilmCanvas:!!document.getElementById('film'),initialFrame:window.currentFrame??null,descriptor:d,cornerAlpha:canvas.getContext('2d').getImageData(0,0,1,1).data[3],png:canvas.toDataURL()};});
      await writeFile(path.join(out,'embedded-working.png'),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
      assert.deepEqual(requests.sort(),Object.values(urls).sort());assert.deepEqual(errors,[]);assert.equal(result.hasFilmCanvas,false);assert.equal(result.initialFrame,null);assert.equal(result.cornerAlpha,0);assert.equal(result.descriptor.eyeSpeed,2);assert.ok(result.descriptor.eyePhase>2);return{...result,requests,errors};
    }finally{await preview.close();}
  });
}finally{
  await browser.close();report.finishedAt=new Date().toISOString();
  report.summary={passed:report.checks.filter(c=>c.status==='PASS').length,failed:report.checks.filter(c=>c.status==='FAIL').length};
  await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));process.exitCode=report.summary.failed?1:0;
}
