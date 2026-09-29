import test from 'node:test';
import assert from 'node:assert/strict';
import {manifest,routes} from './backend.mjs';

const settings={state:'working',eyeSpeed:1,scale:1,background:'dark',aura:true,time:3};
function harness(){const values=new Map();return{values,env:{storage:{get:async key=>values.has(key)?structuredClone(values.get(key)):undefined,put:async(key,value)=>{values.set(key,structuredClone(value));},delete:async key=>values.delete(key),list:async()=>[...values.keys()]}}};}
function call(op,input,env){const route=routes.find(route=>route.op===op);assert.ok(route,`Missing route ${op}`);return route.handler(input,{env});}

test('canonical manifest and discoverable routes use the existing contract',()=>{
  assert.equal(manifest.$schema,'https://charm.ing/schema/app-manifest/2026-07-31.json');
  assert.equal(manifest.id,'cavelux-clawd-studio');
  assert.ok(manifest.capabilities.imports.includes('charming:storage/kv@1.0'));
  assert.ok(Array.isArray(routes));assert.deepEqual(routes.map(route=>route.op),['listPresets','savePreset','deletePreset']);
  assert.equal(routes[0].annotations.readOnlyHint,true);assert.equal(routes[1].annotations.readOnlyHint,false);assert.equal(routes[2].annotations.readOnlyHint,false);
});
test('empty authoritative storage returns an empty preset list',async()=>{const {env}=harness();assert.deepEqual(await call('listPresets',{},env),{presets:[]});});
test('save writes a named preset and later reads return the saved settings',async()=>{
  const {env,values}=harness();const saved=await call('savePreset',{id:'preset-test',name:'  Green room  ',settings},env);
  assert.equal(saved.preset.name,'Green room');assert.equal(saved.preset.id,'preset-test');assert.deepEqual(saved.preset.settings,settings);
  assert.ok(values.has('preset/preset-test'));assert.ok(!Number.isNaN(Date.parse(saved.preset.createdAt)));
  assert.deepEqual((await call('listPresets',{},env)).presets,[saved.preset]);
});
test('saving an existing id updates it without making a duplicate or losing createdAt',async()=>{
  const {env}=harness();const original=await call('savePreset',{id:'a',name:'First',settings},env);
  const changed=await call('savePreset',{id:'a',name:'Second',settings:{...settings,state:'ultracode',time:5}},env);
  assert.equal(changed.preset.createdAt,original.preset.createdAt);assert.equal((await call('listPresets',{},env)).presets.length,1);assert.equal(changed.preset.settings.time,5);
});
test('saved values cannot be changed by mutating an earlier response',async()=>{
  const {env}=harness();const result=await call('savePreset',{id:'a',name:'Original',settings},env);result.preset.settings.scale=.4;
  assert.equal((await call('listPresets',{},env)).presets[0].settings.scale,1);
});
test('delete removes only the selected preset and missing deletion is explicit',async()=>{
  const {env}=harness();await call('savePreset',{id:'a',name:'A',settings},env);await call('savePreset',{id:'b',name:'B',settings},env);
  assert.deepEqual(await call('deletePreset',{id:'a'},env),{id:'a',deleted:true});assert.deepEqual(await call('deletePreset',{id:'a'},env),{id:'a',deleted:false});
  assert.deepEqual((await call('listPresets',{},env)).presets.map(preset=>preset.id),['b']);
});
test('empty, long, and control-character names are rejected',async()=>{
  const {env}=harness();for(const name of ['', '   ', 'x'.repeat(49), 'bad\nname'])await assert.rejects(()=>call('savePreset',{id:'a',name,settings},env),/name/i);
});
test('path-like and prototype-like ids are rejected',async()=>{
  const {env}=harness();for(const id of ['../x','a/b','__proto__','', 'a'.repeat(65)])await assert.rejects(()=>call('savePreset',{id,name:'A',settings},env),/id/i);
});
test('settings reject unknown state, background, wrong boolean and extra keys',async()=>{
  const {env}=harness();for(const bad of [{...settings,state:'angry'},{...settings,background:'red'},{...settings,aura:'true'},{...settings,unsafe:1}])await assert.rejects(()=>call('savePreset',{id:'a',name:'A',settings:bad},env),/settings|state|background|aura/i);
});
test('numeric controls reject nonfinite, string, and out-of-range values',async()=>{
  const {env}=harness();for(const [key,value] of [['eyeSpeed',-1],['eyeSpeed',3.1],['eyeSpeed','1'],['scale',.39],['scale',1.41],['time',-.1],['time',10.1],['time',Infinity],['scale',NaN]])await assert.rejects(()=>call('savePreset',{id:'a',name:'A',settings:{...settings,[key]:value}},env),/eyeSpeed|scale|time/i);
});
test('boundary control values are valid',async()=>{
  const {env}=harness();for(const value of [{...settings,eyeSpeed:0,scale:.4,time:0},{...settings,eyeSpeed:3,scale:1.4,time:10}])assert.deepEqual((await call('savePreset',{id:'edge',name:'Edges',settings:value},env)).preset.settings,value);
});
test('incomplete and extra top-level inputs are rejected',async()=>{
  const {env}=harness();await assert.rejects(()=>call('savePreset',{id:'a',name:'A'},env));await assert.rejects(()=>call('savePreset',{id:'a',name:'A',settings,extra:true},env));await assert.rejects(()=>call('listPresets',{extra:1},env));await assert.rejects(()=>call('deletePreset',{id:'a',extra:1},env));
});
test('storage write failures reject instead of reporting a saved preset',async()=>{
  const {env}=harness();env.storage.put=async()=>{throw new Error('disk unavailable');};await assert.rejects(()=>call('savePreset',{id:'a',name:'A',settings},env),/disk unavailable/);
});
test('unavailable key listing is not presented as an empty library',async()=>{
  const {env}=harness();env.storage.list=async()=>null;await assert.rejects(()=>call('listPresets',{},env),/storage/i);
});
test('corrupt stored preset is reported while unrelated KV keys are ignored',async()=>{
  const {env,values}=harness();values.set('unrelated','not a preset');assert.deepEqual(await call('listPresets',{},env),{presets:[]});values.set('preset/bad',{name:'incomplete'});await assert.rejects(()=>call('listPresets',{},env),/preset|storage/i);
});
