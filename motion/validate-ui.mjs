import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(root, 'output', 'ui-checks');
const require = createRequire(import.meta.url);
const {chromium} = require('playwright');
const baseUrl = 'http://127.0.0.1:8766/';
const result = {startedAt:new Date().toISOString(), baseUrl, browser:'Microsoft Edge / Playwright headless', sourceHashes:{}, checks:[], screenshots:[], pageErrors:[], failedRequests:[], badResponses:[]};
await mkdir(out, {recursive:true});
for (const file of ['index.html', 'player.js', 'film.js', 'assets.html', 'state-previews.js']) {
  result.sourceHashes[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
}

async function check(name, body) {
  try {
    const evidence = await body();
    result.checks.push({name, status:'PASS', evidence});
    console.log(`PASS ${name}`);
  } catch (error) {
    result.checks.push({name, status:'FAIL', error:error.message});
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function state(page) {
  return page.evaluate(() => ({
    frame:window.currentFrame,
    chapter:document.getElementById('chapter').textContent,
    seek:Number(document.getElementById('seek').value),
    playName:document.getElementById('play').getAttribute('aria-label'),
    mutePressed:document.getElementById('mute').getAttribute('aria-pressed'),
    time:document.getElementById('time').textContent,
  }));
}

async function setSeek(page, frame) {
  await page.locator('#seek').fill(String(frame));
  await page.locator('#seek').dispatchEvent('input');
}

async function ready(page) {
  await page.goto(baseUrl, {waitUntil:'load'});
  await page.evaluate(() => window.filmReady);
  await page.locator('#play').waitFor({state:'visible'});
}

async function inspectLayout(page, name) {
  await check(`${name}: no horizontal overflow`, async () => {
    const dimensions = await page.evaluate(() => ({
      viewport:innerWidth,
      documentWidth:document.documentElement.scrollWidth,
      bodyWidth:document.body.scrollWidth,
      canvasBox:document.getElementById('film').getBoundingClientRect().toJSON(),
    }));
    assert.ok(dimensions.documentWidth <= dimensions.viewport, JSON.stringify(dimensions));
    assert.ok(dimensions.bodyWidth <= dimensions.viewport, JSON.stringify(dimensions));
    assert.ok(dimensions.canvasBox.width > 0 && dimensions.canvasBox.height > 0, 'Canvas must have rendered size');
    return dimensions;
  });
  await check(`${name}: controls visible and labelled`, async () => {
    const controls = page.locator('button, input[type="range"], a.button');
    const evidence = [];
    for (let index=0; index<await controls.count(); index++) {
      const item = controls.nth(index);
      assert.ok(await item.isVisible(), `Control ${index} is hidden`);
      const data = await item.evaluate(element => ({
        id:element.id || element.getAttribute('data-frame') || element.tagName,
        label:element.getAttribute('aria-label') || element.innerText || element.labels?.[0]?.innerText || '',
        disabled:element.disabled || false,
      }));
      assert.ok(data.label.trim(), `Control ${index} has no accessible label`);
      assert.equal(data.disabled, false, `${data.id} is disabled`);
      evidence.push(data);
    }
    assert.equal(evidence.length, 12, 'Expected Play, Restart, Mute, Seek, 6 chapter buttons, download and asset library');
    assert.ok(await page.locator('#film').getAttribute('aria-label'));
    return evidence;
  });
  await check(`${name}: keyboard reaches controls with visible focus`, async () => {
    await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0,0); });
    const focus = [];
    for (let index=0; index<4; index++) {
      await page.keyboard.press('Tab');
      focus.push(await page.evaluate(() => ({
        id:document.activeElement.id,
        visible:document.activeElement.matches(':focus-visible'),
        outlineWidth:getComputedStyle(document.activeElement).outlineWidth,
        outlineStyle:getComputedStyle(document.activeElement).outlineStyle,
      })));
    }
    assert.deepEqual(focus.map(item=>item.id), ['play','restart','mute','seek']);
    assert.ok(focus.every(item=>item.visible && parseFloat(item.outlineWidth)>=2 && item.outlineStyle!=='none'));
    return focus;
  });
}

async function canvasEvidence(page) {
  return page.evaluate(() => {
    const canvas = document.getElementById('film');
    const pixels = canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;
    const colors = new Set();
    let nonBackground=0;
    let samples=0;
    for (let y=300; y<1500; y+=11) for (let x=110; x<940; x+=11) {
      const index=(y*canvas.width+x)*4;
      const key=`${pixels[index]},${pixels[index+1]},${pixels[index+2]}`;
      colors.add(key);
      if (key!=='16,18,16') nonBackground++;
      samples++;
    }
    return {width:canvas.width,height:canvas.height,frame:window.currentFrame,distinctSampleColors:colors.size,nonBackgroundSamples:nonBackground,samples};
  });
}

const browser = await chromium.launch({channel:'msedge', headless:true});
result.browserVersion = browser.version();
try {
  const desktopContext = await browser.newContext({viewport:{width:1440,height:1080}, reducedMotion:'no-preference', deviceScaleFactor:1});
  const desktop = await desktopContext.newPage();
  desktop.on('pageerror', error=>result.pageErrors.push({surface:'desktop',message:error.message}));
  desktop.on('requestfailed', request=>result.failedRequests.push({surface:'desktop',url:request.url(),failure:request.failure()}));
  desktop.on('response', response=>{if(response.status()>=400)result.badResponses.push({surface:'desktop',url:response.url(),status:response.status()});});
  await ready(desktop);

  await check('desktop: initially paused without autoplay', async () => {
    const before=await state(desktop);
    await desktop.waitForTimeout(350);
    const after=await state(desktop);
    assert.equal(before.frame,90);
    assert.equal(after.frame,before.frame);
    assert.equal(after.playName,'Play motion film');
    return {before,after};
  });
  await inspectLayout(desktop,'desktop');

  await check('desktop: Play starts at frame zero and advances', async () => {
    await desktop.evaluate(() => {
      const render=window.renderFrame;
      window.uiTestFrames=[];
      window.uiTestRequestedFrames=[];
      window.renderFrame=(frame)=>{const rendered=render(frame);window.uiTestRequestedFrames.push(frame);window.uiTestFrames.push(rendered.frame);return rendered;};
    });
    await desktop.getByRole('button',{name:'Play motion film',exact:true}).click();
    await desktop.waitForTimeout(400);
    const after=await state(desktop);
    const frames=await desktop.evaluate(()=>window.uiTestFrames.slice());
    const requestedFrames=await desktop.evaluate(()=>window.uiTestRequestedFrames.slice());
    assert.equal(frames[0],0, `First rendered frame was ${frames[0]}`);
    assert.ok(after.frame>=5 && after.frame<40, `Playback did not advance from zero: ${after.frame}`);
    assert.equal(after.playName,'Pause motion film');
    return {firstFrames:frames.slice(0,5),firstRequestedFrames:requestedFrames.slice(0,5),after};
  });
  await check('desktop: Pause freezes frame', async () => {
    await desktop.getByRole('button',{name:'Pause motion film',exact:true}).click();
    const before=await state(desktop);
    await desktop.waitForTimeout(350);
    const after=await state(desktop);
    assert.equal(after.frame,before.frame);
    assert.equal(after.playName,'Play motion film');
    return {before,after};
  });
  await check('desktop: Throughput chapter jump updates chapter and seek', async () => {
    await desktop.getByRole('button',{name:'05 THROUGHPUT',exact:true}).click();
    const after=await state(desktop);
    assert.equal(after.frame,900);
    assert.equal(after.seek,900);
    assert.equal(after.chapter,'05 / THROUGHPUT');
    return after;
  });
  await check('desktop: meaningful Throughput frame renders', async () => {
    await setSeek(desktop,1050);
    const evidence=await canvasEvidence(desktop);
    assert.equal(evidence.frame,1050);
    assert.equal(evidence.width,1080);
    assert.equal(evidence.height,1920);
    assert.ok(evidence.distinctSampleColors>30, 'Canvas lacks visible scene color detail');
    assert.ok(evidence.nonBackgroundSamples>300, 'Canvas appears empty');
    await desktop.evaluate(()=>window.scrollTo(0,0));
    const screenshot=path.join(out,'desktop-throughput.png');
    await desktop.screenshot({path:screenshot,fullPage:true});
    result.screenshots.push(screenshot);
    return evidence;
  });
  await check('desktop: Restart returns near zero and plays', async () => {
    await desktop.getByRole('button',{name:'Restart',exact:true}).click();
    await desktop.waitForTimeout(120);
    const after=await state(desktop);
    assert.ok(after.frame>=0 && after.frame<=12, `Restart landed at ${after.frame}`);
    assert.equal(after.chapter,'01 / DEFINE');
    assert.equal(after.playName,'Pause motion film');
    await desktop.getByRole('button',{name:'Pause motion film',exact:true}).click();
    return after;
  });
  await check('desktop: mute toggles aria-pressed and label', async () => {
    const before=await desktop.locator('#mute').getAttribute('aria-pressed');
    await desktop.locator('#mute').click();
    const muted={pressed:await desktop.locator('#mute').getAttribute('aria-pressed'),label:await desktop.locator('#mute').innerText()};
    await desktop.locator('#mute').click();
    const unmuted={pressed:await desktop.locator('#mute').getAttribute('aria-pressed'),label:await desktop.locator('#mute').innerText()};
    assert.equal(before,'false');
    assert.deepEqual(muted,{pressed:'true',label:'Sound off'});
    assert.deepEqual(unmuted,{pressed:'false',label:'Sound on'});
    return {before,muted,unmuted};
  });
  await check('desktop: seek reaches final frame', async () => {
    await setSeek(desktop,1349);
    const after=await state(desktop);
    assert.equal(after.frame,1349);
    assert.equal(after.seek,1349);
    assert.equal(after.chapter,'06 / DELIVER');
    assert.equal(after.playName,'Play motion film');
    return after;
  });

  const mobileContext = await browser.newContext({viewport:{width:390,height:844}, reducedMotion:'reduce', deviceScaleFactor:1, isMobile:true, hasTouch:true});
  const mobile = await mobileContext.newPage();
  mobile.on('pageerror', error=>result.pageErrors.push({surface:'mobile',message:error.message}));
  mobile.on('requestfailed', request=>result.failedRequests.push({surface:'mobile',url:request.url(),failure:request.failure()}));
  mobile.on('response', response=>{if(response.status()>=400)result.badResponses.push({surface:'mobile',url:response.url(),status:response.status()});});
  await ready(mobile);
  await check('mobile: reduced motion also starts paused without autoplay', async () => {
    const before=await state(mobile);
    await mobile.waitForTimeout(350);
    const after=await state(mobile);
    assert.equal(await mobile.evaluate(()=>matchMedia('(prefers-reduced-motion: reduce)').matches),true);
    assert.equal(before.frame,90);
    assert.equal(after.frame,before.frame);
    assert.equal(after.playName,'Play motion film');
    return {before,after,reducedMotion:true};
  });
  await inspectLayout(mobile,'mobile');
  await check('mobile: chapter navigation and canvas rendering', async () => {
    await mobile.getByRole('button',{name:'05 THROUGHPUT',exact:true}).click();
    const after=await state(mobile);
    assert.equal(after.frame,900);
    assert.equal(after.chapter,'05 / THROUGHPUT');
    await setSeek(mobile,1050);
    const evidence=await canvasEvidence(mobile);
    assert.ok(evidence.distinctSampleColors>30);
    assert.ok(evidence.nonBackgroundSamples>300);
    await mobile.evaluate(()=>window.scrollTo(0,0));
    const screenshot=path.join(out,'mobile-throughput.png');
    await mobile.screenshot({path:screenshot,fullPage:true});
    result.screenshots.push(screenshot);
    return {after,canvas:evidence};
  });

  await check('desktop: Asset library link opens with all images loaded', async () => {
    await desktop.getByRole('link',{name:'Asset library',exact:true}).click();
    await desktop.waitForLoadState('load');
    assert.equal(new URL(desktop.url()).pathname,'/assets.html');
    const images=await desktop.locator('img').evaluateAll(elements=>elements.map(element=>({
      src:element.getAttribute('src'),alt:element.alt,complete:element.complete,width:element.naturalWidth,height:element.naturalHeight,
    })));
    assert.equal(images.length,12,'Expected 6 overlays and 6 storyboard stills');
    assert.ok(images.every(image=>image.complete && image.width>0 && image.height>0),JSON.stringify(images));
    assert.ok(images.every(image=>image.alt.trim()),'Every image needs alternate text');
    const dimensions=await desktop.evaluate(()=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth}));
    assert.ok(dimensions.documentWidth<=dimensions.viewport,JSON.stringify(dimensions));
    await desktop.evaluate(()=>window.filmReady);
    const canvases=await desktop.locator('[data-character]').evaluateAll(elements=>elements.map(element=>({state:element.dataset.character,label:element.getAttribute('aria-label'),width:element.width,height:element.height,pixel:Array.from(element.getContext('2d').getImageData(element.width/2,element.height/2,1,1).data)})));
    assert.deepEqual(canvases.map(item=>item.state),['normal','working','ultracode']);
    assert.ok(canvases.every(item=>item.label&&item.width>0&&item.height>0));
    assert.ok(canvases.every(item=>item.pixel.some((channel,index)=>index<3&&channel>70)),'State preview center pixels are empty');
    return {images,dimensions,canvases};
  });
  await check('mobile: Asset library images load without horizontal overflow', async () => {
    await mobile.getByRole('link',{name:'Asset library',exact:true}).click();
    await mobile.waitForLoadState('load');
    const evidence=await mobile.evaluate(()=>({
      viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,
      images:Array.from(document.images).map(image=>({src:image.getAttribute('src'),complete:image.complete,width:image.naturalWidth})),
    }));
    assert.ok(evidence.documentWidth<=evidence.viewport,JSON.stringify(evidence));
    assert.equal(evidence.images.length,12);
    assert.ok(evidence.images.every(image=>image.complete && image.width>0));
    await mobile.evaluate(()=>window.filmReady);
    const first=await mobile.locator('[data-character="ultracode"]').evaluate(canvas=>canvas.toDataURL());
    await mobile.waitForTimeout(180);
    const second=await mobile.locator('[data-character="ultracode"]').evaluate(canvas=>canvas.toDataURL());
    assert.equal(first,second,'Reduced-motion library preview should remain still');
    evidence.reducedMotionPreviewsStatic=true;
    return evidence;
  });

  await check('both surfaces: no browser exceptions or HTTP errors', async () => {
    assert.equal(result.pageErrors.length,0,JSON.stringify(result.pageErrors));
    assert.equal(result.badResponses.length,0,JSON.stringify(result.badResponses));
    const unexpected=result.failedRequests.filter(item=>!String(item.failure?.errorText).includes('ERR_ABORTED'));
    assert.equal(unexpected.length,0,JSON.stringify(unexpected));
    return {pageErrors:result.pageErrors,badResponses:result.badResponses,failedRequests:result.failedRequests};
  });
  await desktopContext.close();
  await mobileContext.close();
} catch (error) {
  result.checks.push({name:'validation execution',status:'FAIL',error:error.stack || error.message});
  console.error(error);
} finally {
  await browser.close();
  result.finishedAt=new Date().toISOString();
  result.summary={passed:result.checks.filter(item=>item.status==='PASS').length,failed:result.checks.filter(item=>item.status==='FAIL').length};
  result.unverified=['Audible output and audiovisual synchronization','Download link contents','Full 45-second playback and exported MP4','Other browsers, locales, and RTL layouts'];
  await writeFile(path.join(out,'results.json'), JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result.summary));
  process.exitCode=result.summary.failed ? 1 : 0;
}
