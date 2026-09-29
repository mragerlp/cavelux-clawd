(() => {
  'use strict';
  const host=document.getElementById('app');
  const charming=window.charming,api=charming.api('cavelux-clawd-studio');
  const descriptions={normal:'A quiet spark. Ready for what comes next.',working:'Curiosity in motion. A little code in the orbit.',ultracode:'Same character. A whole new frequency.'};
  const stateNames={normal:'Normal',working:'Working',ultracode:'Ultracode'};
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let configuration={state:'normal',eyeSpeed:1,scale:1,background:'dark',aura:true,time:3};
  let playing=false,raf=0,origin=3,started=0,selectedId=null,presets=[],refreshId=0,writeBusy=false;
  host.innerHTML=`
    <main class="studio">
      <header class="studio-header"><a class="brand-link" href="https://cavelux.ai" target="_blank" rel="noopener">CAVELUX<span class="brand-square" aria-hidden="true"></span></a><span class="studio-label">CHARACTER STUDIO / 01</span><a class="source-link" href="https://github.com/mragerlp/cavelux-clawd" target="_blank" rel="noopener">Source on GitHub <span aria-hidden="true">↗</span></a></header>
      <section class="intro"><div><p class="kicker">THE CHARACTER, IN YOUR HANDS.</p><h1>Clawd. <span>In character.</span></h1></div><p class="intro-copy">A small companion for big ideas.<br>Find a state. Set the motion. Make it yours.</p></section>
      <div class="workspace">
        <section class="preview-section" aria-label="Character preview and playback">
          <div class="stage-meta"><span><i aria-hidden="true"></i><span id="state-label">NORMAL / REGULAR EYES</span></span><span id="playback-status">PAUSED</span></div>
          <div id="stage" class="stage" data-background="dark"><div class="stage-bracket top-left" aria-hidden="true"></div><div class="stage-bracket top-right" aria-hidden="true"></div><canvas id="preview" width="1080" height="760" role="img" aria-label="Normal Cavelux Clawd character with rectangular eyes"></canvas><div class="stage-bracket bottom-left" aria-hidden="true"></div><div class="stage-bracket bottom-right" aria-hidden="true"></div></div>
          <div class="preview-caption"><p id="state-description">${descriptions.normal}</p><span>1080 × 760</span></div>
          <div class="playback"><button id="play" class="primary" type="button" aria-label="Play character animation"><span id="play-icon" aria-hidden="true">▶</span><span id="play-text">Play</span></button><div class="timeline-control"><div class="range-label"><label for="timeline">Timeline</label><output id="time-output" for="timeline">03.00s <span>/ 10.00s</span></output></div><input id="timeline" type="range" min="0" max="10" step="0.01" value="3" aria-label="Animation timeline in seconds"></div><button id="reset-time" class="icon-button" type="button" aria-label="Return timeline to zero">↺</button></div>
          <div class="export-row"><button id="export-png" type="button">Export PNG <span aria-hidden="true">↓</span></button><button id="export-json" type="button">Export preset <span aria-hidden="true">↓</span></button><span class="loop-note">10 SECOND PREVIEW</span></div>
          <div class="export-feedback"><p id="export-status" class="status" role="status" aria-live="polite"></p><a id="export-link" hidden rel="noopener" target="_blank"></a></div>
        </section>
        <aside class="inspector" aria-label="Character controls">
          <section class="control-section"><div class="section-heading"><h2>Character state</h2><span>01—03</span></div><div class="state-options" role="group" aria-label="Character state"><button id="state-normal" type="button" data-state="normal" aria-pressed="true"><span>01</span><strong>Normal</strong><small>Regular eyes</small></button><button id="state-working" type="button" data-state="working" aria-pressed="false"><span>02</span><strong>Working</strong><small>Code in orbit</small></button><button id="state-ultracode" type="button" data-state="ultracode" aria-pressed="false"><span>03</span><strong>Ultracode</strong><small>Full spectrum</small></button></div></section>
          <section class="control-section motion-controls"><div class="section-heading"><h2>Fine-tune</h2><span>THE FEEL</span></div><div class="control"><div class="range-label"><label for="eye-speed">Eye rotation</label><output id="eye-speed-output" for="eye-speed">1.0×</output></div><input id="eye-speed" type="range" min="0" max="3" step="0.1" value="1"><p class="hint">Spiral eyes in Working and Ultracode.</p></div><div class="control"><div class="range-label"><label for="scale">Character scale</label><output id="scale-output" for="scale">100%</output></div><input id="scale" type="range" min="0.4" max="1.4" step="0.05" value="1"></div><div class="control horizontal"><label for="background">Background</label><select id="background"><option value="dark">Carbon</option><option value="light">Paper</option><option value="transparent">Transparent</option></select></div><div class="control horizontal"><div><label for="aura">Code aura</label><p class="hint">Orbiting glyphs in Working.</p></div><label class="switch"><input id="aura" type="checkbox" checked aria-label="Show code aura"><span aria-hidden="true"></span></label></div></section>
          <section class="control-section preset-section"><div class="section-heading"><h2>Saved looks</h2><button id="new-preset" class="text-button" type="button">New preset +</button></div><form id="preset-form"><label class="sr-only" for="preset-name">Preset name</label><div class="save-row"><input id="preset-name" type="text" maxlength="48" autocomplete="off" placeholder="Name this look" aria-describedby="status"><button id="save-preset" type="submit">Save</button></div></form><p id="status" class="status" role="status" aria-live="polite">Loading saved presets…</p><button id="retry-presets" class="text-button" type="button" hidden>Retry loading presets</button><ul id="presets-list" class="presets-list" aria-label="Saved presets"></ul></section>
        </aside>
      </div>
      <footer class="studio-footer"><span>CURIOSITY, BY DESIGN.</span><p>Regular eyes. Working spirals. Full-spectrum possibility.</p><span id="motion-preference"></span></footer>
    </main>`;
  const byId=id=>document.getElementById(id),canvas=byId('preview');
  const notify=(message,error=false)=>{byId('status').textContent=message;byId('status').dataset.error=String(error);};
  function render(){
    window.renderCharacterPreview(configuration.state,configuration.time,canvas,{background:configuration.background,scale:configuration.scale,eyeSpeed:configuration.eyeSpeed,aura:configuration.aura});
    byId('time-output').innerHTML=configuration.time.toFixed(2).padStart(5,'0')+'s <span>/ 10.00s</span>';
    byId('timeline').value=configuration.time;window.CAVELUX_STUDIO_STATE={...configuration,playing};
  }
  function updateControls(){
    document.querySelectorAll('[data-state]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.state===configuration.state)));
    byId('state-label').textContent=configuration.state==='normal'?'NORMAL / REGULAR EYES':configuration.state==='working'?'WORKING / CODE AURA':'ULTRACODE / RAINBOW WAVE';
    byId('state-description').textContent=descriptions[configuration.state];canvas.setAttribute('aria-label',`${stateNames[configuration.state]} Cavelux Clawd character preview`);
    byId('eye-speed').value=configuration.eyeSpeed;byId('eye-speed-output').textContent=configuration.eyeSpeed.toFixed(1)+'×';
    byId('scale').value=configuration.scale;byId('scale-output').textContent=Math.round(configuration.scale*100)+'%';
    byId('background').value=configuration.background;byId('stage').dataset.background=configuration.background;byId('aura').checked=configuration.aura;
    render();
  }
  function pause(){playing=false;cancelAnimationFrame(raf);byId('play-text').textContent='Play';byId('play-icon').textContent='▶';byId('play').setAttribute('aria-label','Play character animation');byId('playback-status').textContent='PAUSED';window.CAVELUX_STUDIO_STATE={...configuration,playing};}
  function tick(now){if(!playing)return;configuration.time=(origin+Math.max(0,now-started)/1000)%10;render();raf=requestAnimationFrame(tick);}
  function play(){playing=true;origin=configuration.time===10?0:configuration.time;started=performance.now();byId('play-text').textContent='Pause';byId('play-icon').textContent='Ⅱ';byId('play').setAttribute('aria-label','Pause character animation');byId('playback-status').textContent='PLAYING';raf=requestAnimationFrame(tick);}
  byId('play').onclick=()=>playing?pause():play();byId('reset-time').onclick=()=>{pause();configuration.time=0;render();};
  byId('timeline').oninput=event=>{pause();configuration.time=Number(event.target.value);render();};
  document.querySelectorAll('[data-state]').forEach(button=>{button.onclick=()=>{configuration.state=button.dataset.state;updateControls();};});
  for(const [element,key] of [['eye-speed','eyeSpeed'],['scale','scale']])byId(element).oninput=event=>{configuration[key]=Number(event.target.value);updateControls();};
  byId('background').onchange=event=>{configuration.background=event.target.value;updateControls();};byId('aura').onchange=event=>{configuration.aura=event.target.checked;render();};
  const preference=()=>{byId('motion-preference').textContent=reduced.matches?'REDUCED MOTION / MANUAL PLAY':'MOTION STARTS WITH YOU.';if(reduced.matches)pause();};reduced.addEventListener('change',preference);preference();
  document.addEventListener('visibilitychange',()=>{if(document.hidden)pause();});
  let exportBusy=false,exportObjectUrl=null;
  const exportNotice=(message,error=false)=>{byId('export-status').textContent=message;byId('export-status').dataset.error=String(error);};
  const errorText=error=>error?.message||'Please try again.';
  function signedExportUrl(key){const url=charming.assets.getUrl(key);if(typeof url!=='string'||!/^https?:\/\//i.test(url))throw new Error('The export service returned an invalid file URL.');return url;}
  async function prepareExport(kind,makeBlob,filename){
    if(exportBusy)return;exportBusy=true;byId('export-png').disabled=true;byId('export-json').disabled=true;
    const label=kind==='png'?'PNG':'Preset JSON',key=kind==='png'?'clawd-export.png':'clawd-preset.json',link=byId('export-link');
    link.hidden=true;link.removeAttribute('href');link.removeAttribute('download');link.onclick=null;
    if(exportObjectUrl){URL.revokeObjectURL(exportObjectUrl);exportObjectUrl=null;}exportNotice('Preparing '+label+'…');
    try{
      const blob=await makeBlob();if(!(blob instanceof Blob)||!blob.size)throw new Error('The file could not be prepared. Try again.');
      const native=typeof charming.assets?.upload==='function'&&typeof charming.assets?.getUrl==='function'&&typeof charming.openLink==='function'&&(!charming.viewer||charming.viewer.can('savePreset'));
      if(native){
        const file=new File([blob],filename,{type:blob.type}),uploaded=await charming.assets.upload(file,{key});
        if(!uploaded||uploaded.key!==key)throw new Error('The export service did not confirm the expected file.');
        link.href=signedExportUrl(key);link.textContent='Open exported '+label;link.hidden=false;
        const open=async()=>{try{const url=signedExportUrl(key);link.href=url;await charming.openLink(url);exportNotice(label+' ready. Use the link below if it did not open.');}catch(error){exportNotice(label+' ready, but it could not be opened. Use the link below to try again. '+errorText(error),true);}};
        link.onclick=event=>{event.preventDefault();open();};
        try{await charming.openLink(link.href);exportNotice(label+' ready. Use the link below if it did not open.');}
        catch(error){exportNotice(label+' ready, but it could not be opened. Use the link below to try again. '+errorText(error),true);}
      }else{
        exportObjectUrl=URL.createObjectURL(blob);link.href=exportObjectUrl;link.download=filename;link.textContent='Save exported '+label;link.hidden=false;
        link.click();exportNotice(label+' ready. Use the link below if the download did not start.');
      }
    }catch(error){exportNotice(label+' export failed. '+errorText(error),true);}
    finally{exportBusy=false;byId('export-png').disabled=false;byId('export-json').disabled=false;}
  }
  byId('export-png').onclick=()=>{pause();render();const filename=`cavelux-clawd-${configuration.state}.png`;prepareExport('png',()=>new Promise(resolve=>canvas.toBlob(resolve,'image/png')),filename);};
  byId('export-json').onclick=()=>{const data={schemaVersion:1,name:byId('preset-name').value.trim()||'Untitled look',settings:{...configuration,time:Number(configuration.time.toFixed(3))}};prepareExport('json',()=>new Blob([JSON.stringify(data,null,2)+'\n'],{type:'application/json'}),`cavelux-clawd-${configuration.state}.json`);};
  window.addEventListener('pagehide',()=>{if(exportObjectUrl)URL.revokeObjectURL(exportObjectUrl);});
  const canWrite=op=>!charming.viewer||charming.viewer.can(op)||(charming.user===null&&charming.login?.available);
  const withUser=action=>charming.withUser?charming.withUser(action):action();
  function renderPresets(){
    const list=byId('presets-list');list.replaceChildren();
    if(!presets.length){const empty=document.createElement('li');empty.className='empty-presets';empty.textContent='Save a look to return to it later.';list.appendChild(empty);return;}
    presets.forEach(preset=>{
      const row=document.createElement('li'),load=document.createElement('button'),remove=document.createElement('button');row.className='preset-row';
      load.type='button';load.className='preset-load';load.dataset.presetLoad=preset.id;load.setAttribute('aria-label','Load preset '+preset.name);
      const title=document.createElement('strong'),detail=document.createElement('span');title.textContent=preset.name;detail.textContent=stateNames[preset.settings.state]+' / '+preset.settings.eyeSpeed.toFixed(1)+'×';load.append(title,detail);
      load.onclick=()=>{pause();configuration={...preset.settings};selectedId=preset.id;byId('preset-name').value=preset.name;updateControls();notify('Loaded '+preset.name+'.');};
      remove.type='button';remove.className='preset-delete';remove.textContent='×';remove.dataset.presetDelete=preset.id;remove.setAttribute('aria-label','Delete preset '+preset.name);remove.disabled=!canWrite('deletePreset')||writeBusy;
      remove.onclick=async()=>{if(writeBusy)return;writeBusy=true;renderPresets();try{const result=await withUser(()=>api.deletePreset({id:preset.id}));if(result===null){notify('Preset kept. Sign in when you are ready.');return;}presets=presets.filter(item=>item.id!==preset.id);if(selectedId===preset.id){selectedId=null;byId('preset-name').value='';}notify('Deleted '+preset.name+'.');}catch(error){notify('Could not delete this preset. '+error.message,true);}finally{writeBusy=false;renderPresets();}};
      row.append(load,remove);list.appendChild(row);
    });
  }
  async function refreshPresets(){const request=++refreshId;byId('retry-presets').hidden=true;try{const result=await api.listPresets({});if(request!==refreshId)return;if(!result||!Array.isArray(result.presets))throw new Error('The preset service returned an invalid response.');presets=result.presets;renderPresets();notify(presets.length?`${presets.length} saved ${presets.length===1?'look':'looks'}.`:'Ready to save your first look.');}catch(error){if(request!==refreshId)return;notify('Saved presets are unavailable. '+error.message,true);byId('retry-presets').hidden=false;}}
  byId('retry-presets').onclick=refreshPresets;
  byId('new-preset').onclick=()=>{selectedId=null;byId('preset-name').value='';byId('preset-name').focus();notify('Name the current look to save a new preset.');};
  byId('preset-form').onsubmit=async event=>{
    event.preventDefault();if(writeBusy)return;const presetName=byId('preset-name').value.trim();if(!presetName||presetName.length>48){notify('Give this look a name of 1 to 48 characters.',true);byId('preset-name').focus();return;}
    const payload={id:selectedId||crypto.randomUUID(),name:presetName,settings:{...configuration,time:Number(configuration.time.toFixed(3))}};
    writeBusy=true;byId('save-preset').disabled=true;notify('Saving preset…');
    try{const result=await withUser(()=>api.savePreset(payload));if(result===null){notify('Not saved. Your current look is still here.');return;}selectedId=result.preset.id;presets=[result.preset,...presets.filter(item=>item.id!==result.preset.id)];renderPresets();notify('Saved '+result.preset.name+'.');}
    catch(error){notify('Could not save this preset. '+error.message,true);}
    finally{writeBusy=false;byId('save-preset').disabled=!canWrite('savePreset');renderPresets();}
  };
  byId('save-preset').disabled=!canWrite('savePreset');
  if(charming.onStateChange)charming.onStateChange(()=>refreshPresets());
  updateControls();refreshPresets();
  window.CAVELUX_STUDIO_READY=true;
})();
