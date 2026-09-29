import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root=path.dirname(fileURLToPath(import.meta.url));
const out=path.join(root,'output','character-checks');
const require=createRequire(import.meta.url);
const {chromium}=require('playwright');
const url='http://127.0.0.1:8766/?export';
const report={startedAt:new Date().toISOString(),url,browser:'Microsoft Edge / Playwright headless',sourceHashes:{},checks:[],captures:[],requests:[],pageErrors:[],badResponses:[]};
const snapshots=new Map();
const sources=['film.js','player.js','index.html','assets.html','state-previews.js','sprites/06-normal.png','sprites/01-idle.png','sprites/05-spectrum.png'];
await mkdir(out,{recursive:true});
for(const file of sources)report.sourceHashes[file]=createHash('sha256').update(await readFile(path.join(root,file))).digest('hex');
async function check(name,body){try{const evidence=await body();report.checks.push({name,status:'PASS',evidence});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,status:'FAIL',error:error.message});console.error(`FAIL ${name}: ${error.message}`);}}
const browser=await chromium.launch({channel:'msedge',headless:true});
report.browserVersion=browser.version();
try{
  const context=await browser.newContext({viewport:{width:1080,height:1920},deviceScaleFactor:1});
  const page=await context.newPage();
  page.on('request',request=>{if(/\/sprites\//.test(request.url()))report.requests.push(request.url());});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  page.on('response',response=>{if(response.status()>=400)report.badResponses.push({url:response.url(),status:response.status()});});
  await page.goto(url,{waitUntil:'load'});
  await page.evaluate(()=>window.filmReady);
  await page.evaluate(()=>{
    const original=CanvasRenderingContext2D.prototype.drawImage;
    window.characterTestDraws=[];
    CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
      if(this.canvas.id==='film'){
        const destination=args.length===8?args.slice(4):args.length===4?args:[args[0],args[1],image.width,image.height];
        const [x,y,w,h]=destination;
        const matrix=this.getTransform();
        const points=[[x,y],[x+w,y],[x,y+h],[x+w,y+h]].map(([xx,yy])=>({x:matrix.a*xx+matrix.c*yy+matrix.e,y:matrix.b*xx+matrix.d*yy+matrix.f}));
        const xs=points.map(p=>p.x),ys=points.map(p=>p.y);
        window.characterTestDraws.push({source:image.currentSrc||image.src||`canvas:${image.id||'generated'}`,bounds:{x:Math.min(...xs),y:Math.min(...ys),width:Math.max(...xs)-Math.min(...xs),height:Math.max(...ys)-Math.min(...ys)}});
      }
      return original.call(this,image,...args);
    };
    window.inspectCharacterPixels=(canvas,descriptor,frame)=>{
      const context=canvas.getContext('2d');
      const pixels=context.getImageData(0,0,canvas.width,canvas.height);
      const hero=descriptor.heroBounds;
      function rgb(x,y){const xx=Math.max(0,Math.min(canvas.width-1,Math.round(x))),yy=Math.max(0,Math.min(canvas.height-1,Math.round(y))),i=(yy*canvas.width+xx)*4;return[pixels.data[i],pixels.data[i+1],pixels.data[i+2]];}
      const body=[];
      for(let iy=0;iy<28;iy++)for(let ix=0;ix<36;ix++)body.push(rgb(hero.x+hero.width*(.21+.58*ix/35),hero.y+hero.height*(.12+.58*iy/27)));
      const eyeMetrics=[];
      for(const [left,right] of [[.16,.48],[.52,.84]]){
        const box={x:Math.round(hero.x+hero.width*left),y:Math.round(hero.y+hero.height*.1),w:Math.max(1,Math.round(hero.width*(right-left))),h:Math.max(1,Math.round(hero.height*.49))};
        const mask=new Uint8Array(box.w*box.h),seen=new Uint8Array(mask.length),components=[];
        for(let y=0;y<box.h;y++)for(let x=0;x<box.w;x++){const p=rgb(box.x+x,box.y+y);mask[y*box.w+x]=p.every(v=>v<70)?1:0;}
        for(let i=0;i<mask.length;i++)if(mask[i]&&!seen[i]){
          const queue=[i];seen[i]=1;let minX=box.w,maxX=0,minY=box.h,maxY=0;
          for(let head=0;head<queue.length;head++){const q=queue[head],x=q%box.w,y=Math.floor(q/box.w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]])if(nx>=0&&nx<box.w&&ny>=0&&ny<box.h){const n=ny*box.w+nx;if(mask[n]&&!seen[n]){seen[n]=1;queue.push(n);}}}
          components.push({area:queue.length,width:maxX-minX+1,height:maxY-minY+1,rectangularFill:queue.length/((maxX-minX+1)*(maxY-minY+1))});
        }
        components.sort((a,b)=>b.area-a.area);
        eyeMetrics.push({crop:box,largestDarkComponent:components[0]||null});
      }
      return{frame,descriptor,draws:window.characterTestDraws,body,eyeMetrics};
    };
    window.captureCharacterPixels=(frame)=>{
      window.characterTestDraws=[];window.renderFrame(frame);
      return window.inspectCharacterPixels(document.getElementById('film'),JSON.parse(JSON.stringify(window.characterState)),frame);
    };
    const preview=document.createElement('canvas');preview.id='character-validation-preview';preview.width=540;preview.height=380;
    window.characterValidationPreview=preview;
    window.captureCharacterPreview=(state,time)=>{
      const descriptor=window.renderCharacterPreview(state,time,preview);
      const captured=window.inspectCharacterPixels(preview,descriptor,null);
      captured.time=time;captured.png=preview.toDataURL();return captured;
    };
    window.comparePreviewAura=(state,times)=>{
      const [timeA,timeB]=times,context=preview.getContext('2d');
      const descriptorA=window.renderCharacterPreview(state,timeA,preview),dataA=context.getImageData(0,0,preview.width,preview.height).data;
      const descriptorB=window.renderCharacterPreview(state,timeB,preview),dataB=context.getImageData(0,0,preview.width,preview.height).data;
      const box=descriptorA.heroBounds,green=(d,i)=>d[i+1]>75&&d[i+1]>d[i]*1.23&&d[i+1]>d[i+2]*1.23;
      let countA=0,countB=0,changed=0,total=0;
      for(let y=0;y<preview.height;y++)for(let x=0;x<preview.width;x++){
        if(x>=box.x-3&&x<=box.x+box.width+3&&y>=box.y-3&&y<=box.y+box.height+3)continue;
        const i=(y*preview.width+x)*4,a=green(dataA,i),b=green(dataB,i);if(a)countA++;if(b)countB++;
        if(a||b){total++;if(Math.abs(dataA[i]-dataB[i])+Math.abs(dataA[i+1]-dataB[i+1])+Math.abs(dataA[i+2]-dataB[i+2])>35)changed++;}
      }
      return{state,times,heroA:descriptorA.heroBounds,heroB:descriptorB.heroBounds,greenSamplesA:countA,greenSamplesB:countB,changedGreenSamples:changed,changedGreenFraction:total?changed/total:0};
    };
  });

  await check('active sources and loaded resources exclude focused and wink poses',async()=>{
    const forbidden=/02-focused|03-wink/;
    for(const file of ['film.js','player.js','index.html','assets.html','state-previews.js'])assert.equal(forbidden.test(await readFile(path.join(root,file),'utf8')),false,`Deprecated pose reference in ${file}`);
    assert.equal(report.requests.some(request=>forbidden.test(request)),false,JSON.stringify(report.requests));
    assert.ok(report.requests.some(request=>/06-normal\.png/.test(request)),'Normal pose was not actually requested');
    return{checkedFiles:['film.js','player.js','index.html','assets.html','state-previews.js'],loadedSprites:report.requests};
  });

  const frames=[{frame:90,state:'normal',eyeMode:'rectangular',aura:'none',file:'normal-0090.png'},{frame:315,state:'working',eyeMode:'friendly-spiral',aura:'green-code',file:'working-build-0315.png'},{frame:540,state:'working',eyeMode:'friendly-spiral',aura:'green-code',file:'working-swarm-0540.png'},{frame:765,state:'working',eyeMode:'friendly-spiral',aura:'green-code',file:'working-sync-0765.png'},{frame:990,state:'ultracode',eyeMode:'friendly-spiral',aura:'flowing-rainbow',file:'ultracode-0990.png'},{frame:1020,state:'ultracode',eyeMode:'friendly-spiral',aura:'flowing-rainbow',file:'ultracode-1020.png'},{frame:1050,state:'ultracode',eyeMode:'friendly-spiral',aura:'flowing-rainbow',file:'ultracode-1050.png'}];
  for(const item of frames)await check(`frame ${item.frame}: ${item.state} rendered state`,async()=>{
    const capture=await page.evaluate(frame=>window.captureCharacterPixels(frame),item.frame);
    snapshots.set(item.frame,capture);
    const screenshot=path.join(out,item.file);
    await page.locator('#film').screenshot({path:screenshot});
    report.captures.push({frame:item.frame,file:item.file,descriptor:capture.descriptor,draws:capture.draws,eyeMetrics:capture.eyeMetrics});
    assert.equal(capture.descriptor.state,item.state);
    assert.equal(capture.descriptor.eyeMode,item.eyeMode);
    assert.equal(capture.descriptor.aura,item.aura);
    assert.ok(capture.draws.length>0,'No actual canvas image draws recorded');
    assert.ok(capture.descriptor.heroBounds.width>100&&capture.descriptor.heroBounds.height>60,'Invalid hero bounds');
    if(item.state==='normal')assert.ok(capture.draws.some(draw=>/06-normal\.png/.test(draw.source)),'Normal descriptor does not match the rendered source');
    if(item.state==='working'){
      assert.ok(report.requests.some(request=>/01-idle\.png/.test(request)),'Friendly spiral source was not loaded');
      assert.ok(capture.draws.some(draw=>draw.source.startsWith('canvas:')),'Working body and rotating eyes were not composited');
      assert.equal(capture.descriptor.eyeMotion,'counter-rotating-pixel-spirals');
    }
    return{descriptor:capture.descriptor,imageDrawCount:capture.draws.length,eyeMetrics:capture.eyeMetrics,screenshot:item.file};
  });

  for(const [state,times] of [['normal',[3]],['working',[3,4,5]],['ultracode',[3,4,5]]])for(const time of times)await check(`isolated ${state} preview at ${time} seconds renders`,async()=>{
    const capture=await page.evaluate(({state,time})=>window.captureCharacterPreview(state,time),{state,time});
    const filename=`preview-${state}-${time}s.png`;
    await writeFile(path.join(out,filename),Buffer.from(capture.png.split(',')[1],'base64'));delete capture.png;
    snapshots.set(`${state}-${time}`,capture);
    report.captures.push({preview:state,time,file:filename,descriptor:capture.descriptor,eyeMetrics:capture.eyeMetrics});
    assert.equal(capture.descriptor.state,state);
    assert.ok(capture.body.some(rgb=>rgb[1]>100),'Preview body was not rendered');
    return{descriptor:capture.descriptor,screenshot:filename};
  });
  await check('normal preview contains two solid rectangular eye components',async()=>{
    const metrics=snapshots.get('normal-3').eyeMetrics.map(item=>item.largestDarkComponent);
    assert.ok(metrics.every(item=>item&&item.area>50),'Could not resolve both dark eyes in rendered canvas');
    assert.ok(metrics.every(item=>item.rectangularFill>.9),JSON.stringify(metrics));
    return metrics;
  });
  await check('working preview eye components preserve open spiral geometry',async()=>{
    const metrics=snapshots.get('working-3').eyeMetrics.map(item=>item.largestDarkComponent);
    assert.ok(metrics.every(item=>item&&item.area>30),'Could not resolve both rendered working eyes');
    assert.ok(metrics.every(item=>item.rectangularFill<.85),JSON.stringify(metrics));
    return metrics;
  });
  // Regression: oversized dense curls obscure the face. Measure actual ink
  // across three rotations, independently of the renderer's reported eye boxes.
  for(const state of ['working','ultracode'])await check(`${state} curls stay compact and open through rotation`,async()=>{
    const evidence=[];
    for(const time of [3,4,5]){
      const shot=snapshots.get(`${state}-${time}`),hero=shot.descriptor.heroBounds;
      for(const eye of shot.eyeMetrics){
        const ink=eye.largestDarkComponent;
        assert.ok(ink&&ink.area>30,'Both eyes must remain readable');
        const width=ink.width/hero.width,occupancy=ink.area/(hero.width*hero.height);
        assert.ok(width<.21,`Eye overwhelms face: width fraction ${width}`);
        assert.ok(occupancy<.035,`Eye ink is too dense: body fraction ${occupancy}`);
        assert.ok(ink.rectangularFill<.55,'Curl must have a visibly open center');
        evidence.push({time,width,occupancy,fill:ink.rectangularFill});
      }
    }
    return evidence;
  });

  await check('normal preview has no green aura outside the fixed body',async()=>{
    const evidence=await page.evaluate(()=>window.comparePreviewAura('normal',[3,4]));
    assert.equal(evidence.greenSamplesA,0,JSON.stringify(evidence));assert.equal(evidence.greenSamplesB,0,JSON.stringify(evidence));return evidence;
  });
  for(const pair of [[3,4],[4,5]])await check(`isolated working aura has green pixels and motion: ${pair.join(' to ')} seconds`,async()=>{
    const evidence=await page.evaluate(times=>window.comparePreviewAura('working',times),pair);
    assert.deepEqual(evidence.heroA,evidence.heroB,'Preview body moved and would confound the aura measurement');
    assert.ok(evidence.greenSamplesA>20&&evidence.greenSamplesB>20,`No visible green aura pixels outside the body: ${JSON.stringify(evidence)}`);
    assert.ok(evidence.changedGreenSamples>20&&evidence.changedGreenFraction>.1,`Aura appears static: ${JSON.stringify(evidence)}`);
    return evidence;
  });

  function hueBin(rgb){const [r,g,b]=rgb.map(v=>v/255),max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;if(max<.25||delta<.15)return null;let hue=max===r?((g-b)/delta)%6:max===g?(b-r)/delta+2:(r-g)/delta+4;hue=(hue*60+360)%360;return Math.floor(hue/45);}
  for(const pair of [[3,4],[4,5]])await check(`isolated rainbow wave changes inside fixed body region: ${pair.join(' to ')} seconds`,async()=>{
    const a=snapshots.get(`ultracode-${pair[0]}`),b=snapshots.get(`ultracode-${pair[1]}`);let count=0,changed=0,sumDifference=0;const huesA=new Set(),huesB=new Set();
    assert.deepEqual(a.descriptor.heroBounds,b.descriptor.heroBounds,'Preview body moved and would confound the wave measurement');
    a.body.forEach((pixel,index)=>{const other=b.body[index],ha=hueBin(pixel),hb=hueBin(other);if(ha!==null)huesA.add(ha);if(hb!==null)huesB.add(hb);if(ha===null||hb===null)return;const difference=pixel.reduce((sum,value,channel)=>sum+Math.abs(value-other[channel]),0)/3;count++;sumDifference+=difference;if(difference>20)changed++;});
    const evidence={times:pair,fixedHeroBounds:a.descriptor.heroBounds,normalizedCrop:{x:[.21,.79],y:[.12,.70],grid:[36,28]},chromaticSamples:count,changedSamples:changed,changedFraction:changed/count,meanRgbDifference:sumDifference/count,hueBinsA:[...huesA].sort(),hueBinsB:[...huesB].sort(),phaseA:a.descriptor.rainbowPhase,phaseB:b.descriptor.rainbowPhase};
    assert.ok(count>200,'Insufficient colorful body pixels');
    assert.ok(huesA.size>=4&&huesB.size>=4,'Rendered body lacks a multicolor spectrum');
    assert.ok(evidence.changedFraction>.3&&evidence.meanRgbDifference>15,`Only global motion or static rainbow detected: ${JSON.stringify(evidence)}`);
    assert.notEqual(evidence.phaseA,evidence.phaseB,'Wave phase does not advance');
    return evidence;
  });

  await check('same frame renders identical pixels',async()=>{
    const pngs=[];
    for(let repeat=0;repeat<3;repeat++)pngs.push(await page.evaluate(()=>{window.renderFrame(990);return document.getElementById('film').toDataURL();}));
    const evidence=await page.evaluate(async(pngs)=>{
      const canvas=document.createElement('canvas');canvas.width=1080;canvas.height=1920;
      const context=canvas.getContext('2d',{willReadFrequently:true}),captures=[];
      for(const png of pngs){const image=new Image();image.src=png;await image.decode();context.clearRect(0,0,canvas.width,canvas.height);context.drawImage(image,0,0);captures.push(context.getImageData(0,0,canvas.width,canvas.height).data);}
      const comparisons=[];
      for(let repeat=1;repeat<3;repeat++){
        const a=captures[repeat-1],b=captures[repeat];let changedPixels=0,maxChannelDelta=0,totalChannelDelta=0,minX=canvas.width,minY=canvas.height,maxX=-1,maxY=-1;const samples=[];
        for(let i=0;i<a.length;i+=4){let different=false;for(let channel=0;channel<4;channel++){const delta=Math.abs(a[i+channel]-b[i+channel]);if(delta)different=true;maxChannelDelta=Math.max(maxChannelDelta,delta);totalChannelDelta+=delta;}if(different){changedPixels++;const pixel=i/4,x=pixel%canvas.width,y=Math.floor(pixel/canvas.width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);if(samples.length<5)samples.push({x,y,a:Array.from(a.slice(i,i+4)),b:Array.from(b.slice(i,i+4))});}}
        comparisons.push({from:repeat,to:repeat+1,changedPixels,maxChannelDelta,totalChannelDelta,bounds:changedPixels?{minX,minY,maxX,maxY}:null,samples});
      }
      return{frame:990,comparisons};
    },pngs);
    evidence.pngHashes=pngs.map(png=>createHash('sha256').update(Buffer.from(png.split(',')[1],'base64')).digest('hex'));
    await writeFile(path.join(out,'repeat-frame-pixels.json'),JSON.stringify(evidence,null,2)+'\n');
    assert.ok(evidence.comparisons.every(item=>item.changedPixels===0),`Frame-addressable render varies in raw pixels: ${JSON.stringify(evidence)}`);
    return evidence;
  });
  await check('live asset library displays all three labelled character states',async()=>{
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('http://127.0.0.1:8766/assets.html',{waitUntil:'load'});
    await page.evaluate(()=>window.filmReady);
    const cards=await page.locator('[data-character]').evaluateAll(elements=>elements.map(canvas=>({state:canvas.dataset.character,label:canvas.getAttribute('aria-label'),width:canvas.width,height:canvas.height})));
    assert.deepEqual(cards.map(card=>card.state),['normal','working','ultracode']);
    assert.ok(cards.every(card=>card.label&&card.width>0&&card.height>0));
    await page.screenshot({path:path.join(out,'state-library.png')});
    report.captures.push({type:'browser-library',file:'state-library.png',viewport:{width:1440,height:1000}});
    return{cards,screenshot:'state-library.png'};
  });
  await check('no browser exceptions or missing resources',async()=>{assert.equal(report.pageErrors.length,0,JSON.stringify(report.pageErrors));assert.equal(report.badResponses.length,0,JSON.stringify(report.badResponses));return{pageErrors:report.pageErrors,badResponses:report.badResponses};});
  await check('tested source and sprite hashes remain unchanged',async()=>{
    for(const file of sources)assert.equal(createHash('sha256').update(await readFile(path.join(root,file))).digest('hex'),report.sourceHashes[file],`File changed during validation: ${file}`);
    return report.sourceHashes;
  });
  await context.close();
}catch(error){report.checks.push({name:'validation execution',status:'FAIL',error:error.stack||error.message});console.error(error);}finally{
  await browser.close();
  report.finishedAt=new Date().toISOString();
  report.summary={passed:report.checks.filter(item=>item.status==='PASS').length,failed:report.checks.filter(item=>item.status==='FAIL').length};
  report.visualReview='Screenshots saved for independent visual inspection; automatic checks alone do not establish expression quality.';
  report.unverified=['Exported MP4 and full-timeline continuity','Audio playback and audiovisual synchronization','Perceived expression and aura quality until screenshot inspection'];
  await writeFile(path.join(out,'results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report.summary));
  process.exitCode=report.summary.failed?1:0;
}
