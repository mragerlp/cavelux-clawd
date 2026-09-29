import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url)),out=path.join(root,'output','editorial-checks');
const {chromium}=createRequire(import.meta.url)('playwright');
const expected=[
  {frame:150,chapter:'DEFINE',copy:['CLEAR','INTENT.']},
  {frame:375,chapter:'BUILD',copy:['SYSTEMS,','BUILT RIGHT.','define. build. verify.','tools -> context','test. integrate. ship.']},
  {frame:600,chapter:'ORCHESTRATE',copy:['ONE BRIEF.','MANY AGENTS.']},
  {frame:825,chapter:'INTEGRATE',copy:['COMPLEXITY.','UNDER CONTROL.']},
  {frame:1050,chapter:'THROUGHPUT',copy:['FULL','THROUGHPUT.']},
  {frame:1290,chapter:'DELIVER',copy:['cavelux.ai','ENGINEERED TO DELIVER.']},
];
const report={startedAt:new Date().toISOString(),checks:[],frames:[],pageErrors:[]};
await mkdir(out,{recursive:true});
const check=(name,fn)=>{try{const evidence=fn();report.checks.push({name,status:'PASS',evidence});console.log('PASS '+name);}catch(error){report.checks.push({name,status:'FAIL',error:error.message});console.error('FAIL '+name+': '+error.message);}};
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
  const page=await browser.newPage({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  page.on('pageerror',error=>report.pageErrors.push(error.message));
  await page.addInitScript(()=>{
    const original=CanvasRenderingContext2D.prototype.fillText;
    window.editorialText=[];
    CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...rest){
      if(this.canvas.id==='film'){
        const m=this.measureText(value),t=this.getTransform();
        window.editorialText.push({text:String(value),font:this.font,alpha:this.globalAlpha,x,y,
          left:t.a*(x-m.actualBoundingBoxLeft)+t.e,right:t.a*(x+m.actualBoundingBoxRight)+t.e,
          top:t.d*(y-m.actualBoundingBoxAscent)+t.f,bottom:t.d*(y+m.actualBoundingBoxDescent)+t.f});
      }
      return original.call(this,value,x,y,...rest);
    };
  });
  await page.goto('http://127.0.0.1:8766/?export=1',{waitUntil:'load'});await page.evaluate(()=>window.filmReady);
  for(const item of expected){
    const result=await page.evaluate(frame=>{window.editorialText=[];window.renderFrame(frame);return{frame,chapter:window.filmSpec.chapters[window.currentChapter],draws:window.editorialText};},item.frame);
    report.frames.push(result);
    check(`${item.chapter}: approved copy is drawn on canvas`,()=>{assert.equal(result.chapter,item.chapter);for(const copy of item.copy)assert.ok(result.draws.some(draw=>draw.text===copy),`Missing rendered copy: ${copy}`);return item.copy;});
    check(`${item.chapter}: headline ink fits the composition`,()=>{const headlines=result.draws.filter(draw=>item.copy.includes(draw.text)&&parseFloat(draw.font.match(/([\d.]+)px/)?.[1]??0)>=60);assert.ok(headlines.length>0||item.chapter==='DELIVER');for(const draw of headlines){assert.ok(draw.left>=84&&draw.right<=996,`Headline outside safe width: ${JSON.stringify(draw)}`);assert.ok(draw.top>=245&&draw.bottom<680,`Headline outside title region: ${JSON.stringify(draw)}`);}return headlines;});
    if(!process.argv.includes('--baseline')){const png=await page.locator('#film').evaluate(c=>c.toDataURL());await writeFile(path.join(out,`${item.chapter.toLowerCase()}.png`),Buffer.from(png.split(',')[1],'base64'));}
  }
  check('film has no retired exploratory copy',()=>{const forbidden=/curios|possibility|in concert|one spark|many minds|same curiosity|whole new frequency|signal\s*[→>-]+\s*spectrum|a small|^in motion\.$|spectrum\./i;const matches=report.frames.flatMap(f=>f.draws.filter(d=>forbidden.test(d.text)).map(d=>({frame:f.frame,text:d.text})));assert.deepEqual(matches,[]);return{matches};});
  await page.evaluate(()=>document.documentElement.classList.remove('export'));
  const ui=await page.evaluate(()=>({title:document.title,heading:document.querySelector('h1').innerText.replace(/\s+/g,' '),chapters:Array.from(document.querySelectorAll('[data-frame]'),b=>b.innerText)}));
  check('player title and chapter navigation use engineering language',()=>{assert.equal(ui.title,'CAVELUX — Engineered to deliver.');assert.equal(ui.heading,'Engineered to deliver.');assert.deepEqual(ui.chapters,expected.map((item,i)=>`0${i+1} ${item.chapter}`));return ui;});
  check('browser reports no rendering errors',()=>{assert.deepEqual(report.pageErrors,[]);return report.pageErrors;});
}finally{
  await browser.close();report.sourceHash=createHash('sha256').update(await readFile(path.join(root,'film.js'))).digest('hex');report.finishedAt=new Date().toISOString();report.summary={passed:report.checks.filter(c=>c.status==='PASS').length,failed:report.checks.filter(c=>c.status==='FAIL').length};
  await writeFile(path.join(out,process.argv.includes('--baseline')?'baseline.json':'results.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));process.exitCode=report.summary.failed?1:0;
}
