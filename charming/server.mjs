import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {routes} from './backend.mjs';
import {DiskStorage} from './disk-storage.mjs';
import {buildStudio} from './build.mjs';
const root=path.dirname(fileURLToPath(import.meta.url)),port=8787;
await buildStudio();
const storage=new DiskStorage(path.join(root,'.local/presets.json'));
const runtime=`window.charming={api:function(id){if(id!=='cavelux-clawd-studio')throw new Error('Unknown local manifest');const run=async(op,input)=>{const response=await fetch('/api/'+op,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input||{})});const body=await response.json();if(!body.ok){const error=new Error(body.error.message);error.kind=body.error.kind;throw error;}return body.value;};return{listPresets:input=>run('listPresets',input),savePreset:input=>run('savePreset',input),deletePreset:input=>run('deletePreset',input)};},assets:{load:async key=>{const response=await fetch('/assets/'+encodeURIComponent(key));if(!response.ok)throw new Error('Missing character asset: '+key);const blob=await response.blob();return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(blob);});}},viewer:{role:'owner',can:()=>true},user:{id:'local-test-author'},withUser:action=>action()};`;
const send=(response,status,type,body)=>{response.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store'});response.end(body);};
const server=http.createServer(async(request,response)=>{
  try{
    const url=new URL(request.url,'http://127.0.0.1:'+port);
    if(url.pathname==='/health'){send(response,200,'application/json',JSON.stringify({ok:true,surface:'local Charming contract harness',storage:'disk adapter',hosted:false}));return;}
    if(url.pathname==='/'||url.pathname==='/studio'){
      const source=JSON.parse(await readFile(path.join(root,'dist/source.json'),'utf8'));
      send(response,200,'text/html; charset=utf-8',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Cavelux Clawd Studio — Local</title><style>${source.styles}</style></head><body><div id="app"></div><script>${runtime}</script><script>${source.ui.replace(/<\/script/gi,'<\\/script')}</script></body></html>`);return;
    }
    if(url.pathname.startsWith('/assets/')){
      const key=decodeURIComponent(url.pathname.slice(8));if(!['06-normal.png','01-idle.png','05-spectrum.png'].includes(key)){send(response,404,'text/plain','Unknown asset');return;}
      send(response,200,'image/png',await readFile(path.join(root,'../motion/sprites',key)));return;
    }
    if(url.pathname.startsWith('/api/')){
      if(request.method!=='POST'){send(response,405,'application/json',JSON.stringify({ok:false,error:{kind:'method_not_allowed',message:'Use POST in this local harness.'}}));return;}
      const route=routes.find(item=>item.op===url.pathname.slice(5));if(!route){send(response,404,'application/json',JSON.stringify({ok:false,error:{kind:'unknown_operation',message:'Unknown operation.'}}));return;}
      let body='';for await(const chunk of request){body+=chunk;if(body.length>16384)throw new Error('Request is too large.');}
      const input=body?JSON.parse(body):{},value=await route.handler(input,{env:{storage},request});send(response,200,'application/json',JSON.stringify({ok:true,value}));return;
    }
    if(url.pathname==='/favicon.ico'){send(response,204,'image/x-icon','');return;}
    send(response,404,'text/plain','Not found');
  }catch(error){send(response,400,'application/json',JSON.stringify({ok:false,error:{kind:'operation_failed',message:error.message}}));}
});
server.listen(port,'127.0.0.1',()=>console.log(`Local studio: http://127.0.0.1:${port}/studio (disk persistence; not hosted evidence)`));
