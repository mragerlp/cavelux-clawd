import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';

const root=path.dirname(fileURLToPath(import.meta.url));
const require=createRequire(import.meta.url),{chromium}=require('playwright');
const out=path.join(root,'e2e-evidence');await mkdir(out,{recursive:true});
const cases=[['share-break',2.4,'normal'],['typing',2.4,'working'],['approved',2,'normal'],['panic',2.4,'normal'],['side-eye',2.4,'normal'],['shrug',2.4,'normal'],['celebrate',2.4,'ultracode'],['presenting',2.4,'normal']];
const report={startedAt:new Date().toISOString(),checks:[],pageErrors:[],badResponses:[]};
async function check(name,body){try{const evidence=await body();report.checks.push({name,status:'PASS',evidence});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,status:'FAIL',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:512,height:512},deviceScaleFactor:1});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)report.badResponses.push({url:response.url(),status:response.status()});});
  await page.goto('http://127.0.0.1:8766/reactions/render-test.html',{waitUntil:'load'});
  await page.evaluate(()=>window.filmReady);
  await page.evaluate(async()=>{if(window.reactionsReady)await window.reactionsReady;});
  for(const[id,duration,state]of cases)await check(`${id}: visible motion, seamless loop, transparent safe area`,async()=>{
    const result=await page.evaluate(({id,duration,state})=>{
      if(typeof window.renderReaction!=='function')throw new Error('renderReaction is not implemented');
      const canvas=document.getElementById('reaction'),g=canvas.getContext('2d',{willReadFrequently:true});
      const capture=time=>{const descriptor=window.renderReaction(id,time,canvas,{background:'transparent'});return{descriptor,data:g.getImageData(0,0,512,512).data,png:canvas.toDataURL()};};
      const first=capture(0),action=capture(duration*.43),end=capture(duration);let changed=0,seamChanges=0;
      for(let i=0;i<first.data.length;i+=4){if(first.data.slice(i,i+4).some((v,c)=>v!==action.data[i+c]))changed++;if(first.data.slice(i,i+4).some((v,c)=>v!==end.data[i+c]))seamChanges++;}
      const bounds=[];let unsafePixels=0,badCorners=0,minVisiblePixels=Infinity;
      for(let frame=0;frame<Math.round(duration*20);frame++){
        const shot=capture(frame/20),data=shot.data;let x0=512,y0=512,x1=-1,y1=-1,count=0;
        for(let y=0;y<512;y++)for(let x=0;x<512;x++){const alpha=data[(y*512+x)*4+3];if(alpha>8){count++;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);if(x<8||y<8||x>=504||y>=504)unsafePixels++;}}
        for(const[x,y]of[[0,0],[511,0],[0,511],[511,511]])if(data[(y*512+x)*4+3]!==0)badCorners++;
        minVisiblePixels=Math.min(minVisiblePixels,count);bounds.push({frame,x0,y0,x1,y1});
      }
      return{id,duration,state:action.descriptor.state,changedPixels:changed,seamChanges,unsafePixels,badCorners,minVisiblePixels,bounds,descriptor:action.descriptor,png:action.png};
    },{id,duration,state});
    await writeFile(path.join(out,`renderer-${id}.png`),Buffer.from(result.png.split(',')[1],'base64'));delete result.png;
    assert.equal(result.state,state);assert.ok(result.changedPixels>350,`Reaction is static: ${result.changedPixels} changed pixels`);assert.equal(result.seamChanges,0,'Start and exact duration must match in every pixel');assert.equal(result.unsafePixels,0,'Animation clips the 8px safe area');assert.equal(result.badCorners,0);assert.ok(result.minVisiblePixels>12000,'Clawd silhouette is missing or too small');return result;
  });
  await check('side-eye shifts two rectangular eyes and blinks without changing the body',async()=>{
    const result=await page.evaluate(()=>{
      const c=document.getElementById('reaction'),g=c.getContext('2d'),shots=[];
      for(const time of[0,2.4*.43,2.4*.6]){
        const spec=window.renderReaction('side-eye',time,c),pixels=g.getImageData(0,0,512,512).data,b=spec.bodyBounds,seen=new Uint8Array(512*512),eyes=[];
        const dark=p=>pixels[p*4+3]>200&&Math.max(pixels[p*4],pixels[p*4+1],pixels[p*4+2])<70;
        for(let y=Math.ceil(b.y+8);y<b.y+b.height*.68;y++)for(let x=Math.ceil(b.x+16);x<b.x+b.width-16;x++){
          const start=y*512+x;if(seen[start]||!dark(start))continue;const queue=[start];seen[start]=1;let x0=x,y0=y,x1=x,y1=y;
          for(let i=0;i<queue.length;i++){const p=queue[i],px=p%512,py=Math.floor(p/512);x0=Math.min(x0,px);x1=Math.max(x1,px);y0=Math.min(y0,py);y1=Math.max(y1,py);for(const[nx,ny]of[[px-1,py],[px+1,py],[px,py-1],[px,py+1]])if(nx>=0&&nx<512&&ny>=0&&ny<512){const n=ny*512+nx;if(!seen[n]&&dark(n)){seen[n]=1;queue.push(n);}}}
          const width=x1-x0+1,height=y1-y0+1;if(width<60&&height<60&&queue.length>15&&queue.length>width*height*.9)eyes.push({x:x0,y:y0,width,height,pixels:queue.length});
        }
        shots.push({eyes:eyes.sort((a,b)=>a.x-b.x),pixels});
      }
      let bodyChangedPixels=0;for(let y=0;y<512;y++)for(let x=0;x<512;x++){
        const inEye=shots.slice(0,2).some(shot=>shot.eyes.some(e=>x>=e.x-2&&x<e.x+e.width+2&&y>=e.y-2&&y<e.y+e.height+2));
        if(!inEye){const i=(y*512+x)*4;if(shots[0].pixels.slice(i,i+4).some((v,c)=>v!==shots[1].pixels[i+c]))bodyChangedPixels++;}
      }
      return{eyes:shots.map(s=>s.eyes),bodyChangedPixels};
    });
    assert.deepEqual(result.eyes.map(eyes=>eyes.length),[2,2,2]);for(let i=0;i<2;i++){assert.ok(result.eyes[1][i].x>result.eyes[0][i].x+7);assert.ok(Math.abs(result.eyes[1][i].width-result.eyes[0][i].width)<=1,'Eye width stays constant within a raster edge');assert.ok(Math.abs(result.eyes[1][i].height-result.eyes[0][i].height)<=1,'Eye height stays constant within a raster edge');assert.ok(result.eyes[2][i].height<=4,'Blink should be a flat rectangular eye');}assert.equal(result.bodyChangedPixels,0,'A side glance must not change or spin the head');return result;
  });
  await check('typing contains moving black spiral ink inside both eye regions',async()=>{
    const result=await page.evaluate(()=>{
      const c=document.getElementById('reaction'),g=c.getContext('2d');window.renderReaction('typing',0,c);const a=g.getImageData(0,0,512,512).data;const spec=window.renderReaction('typing',1.2,c),b=g.getImageData(0,0,512,512).data,hero=spec.bodyBounds;
      return[[.16,.47],[.53,.84]].map(([left,right])=>{let blackPixels=0,inkChanged=0;for(let y=Math.ceil(hero.y+hero.height*.1);y<hero.y+hero.height*.64;y++)for(let x=Math.ceil(hero.x+hero.width*left);x<hero.x+hero.width*right;x++){const i=(y*512+x)*4,dark=data=>data[i+3]>200&&Math.max(data[i],data[i+1],data[i+2])<70;if(dark(a))blackPixels++;if(dark(a)!==dark(b))inkChanged++;}return{blackPixels,inkChanged};});
    });for(const eye of result){assert.ok(eye.blackPixels>60,'Small working curl must contain readable black ink');assert.ok(eye.inkChanged/eye.blackPixels>.2,'Working curl ink must visibly animate relative to its size');}return result;
  });
  await check('unknown reaction IDs and invalid times are rejected',async()=>{
    const result=await page.evaluate(()=>{
      if(typeof window.renderReaction!=='function')throw new Error('renderReaction is not implemented');
      const canvas=document.getElementById('reaction'),cases=[['unknown',0],['typing',NaN],['typing',Infinity],['typing',-1]];
      return cases.map(([id,time])=>{try{window.renderReaction(id,time,canvas);return false;}catch{return true;}});
    });assert.deepEqual(result,[true,true,true,true]);return result;
  });
  await check('background selection preserves opaque and transparent exports',async()=>{
    const result=await page.evaluate(()=>{if(typeof window.renderReaction!=='function')throw new Error('renderReaction is not implemented');const c=document.getElementById('reaction');return['dark','transparent','light'].map(background=>{window.renderReaction('approved',.8,c,{background});return{background,pixel:Array.from(c.getContext('2d').getImageData(0,0,1,1).data)};});});
    assert.equal(result[0].pixel[3],255);assert.equal(result[1].pixel[3],0);assert.equal(result[2].pixel[3],255);assert.ok(result[2].pixel[0]>200);return result;
  });
  await check('renderer loads without browser errors or missing resources',async()=>{assert.deepEqual(report.pageErrors,[]);assert.deepEqual(report.badResponses,[]);return{pageErrors:report.pageErrors,badResponses:report.badResponses};});
}finally{
  await browser.close();report.finishedAt=new Date().toISOString();report.summary={passed:report.checks.filter(c=>c.status==='PASS').length,failed:report.checks.filter(c=>c.status==='FAIL').length};
  const file=process.argv.includes('--baseline')?'renderer-baseline.json':'renderer-checks.json';await writeFile(path.join(out,file),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));process.exitCode=report.summary.failed?1:0;
}
