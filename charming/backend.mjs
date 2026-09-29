export const manifest = {
  $schema: 'https://charm.ing/schema/app-manifest/2026-07-31.json',
  id: 'cavelux-clawd-studio',
  meta: {name:'Cavelux Clawd Studio',icon:{emoji:'🐙',bg:'#92fa11'}},
  capabilities: {imports:['charming:storage/kv@1.0','charming:storage/blob@1.0']},
};

function object(value,keys,label){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(`${label} must be an object.`);
  if(Object.keys(value).some(key=>!keys.includes(key)))throw new Error(`${label} contains an unknown field.`);
}
function id(value){if(typeof value!=='string'||!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(value))throw new Error('Preset id is invalid.');return value;}
function name(value){if(typeof value!=='string'||!value.trim()||value.trim().length>48||/[\u0000-\u001f\u007f]/.test(value))throw new Error('Preset name must contain 1 to 48 visible characters.');return value.trim();}
function number(value,min,max,label){if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw new Error(`${label} must be between ${min} and ${max}.`);return value;}
function settings(value){
  object(value,['state','eyeSpeed','scale','background','aura','time'],'Settings');
  if(!['normal','working','ultracode'].includes(value.state))throw new Error('Settings state is invalid.');
  if(!['dark','light','transparent'].includes(value.background))throw new Error('Settings background is invalid.');
  if(typeof value.aura!=='boolean')throw new Error('Settings aura must be a boolean.');
  return{state:value.state,eyeSpeed:number(value.eyeSpeed,0,3,'eyeSpeed'),scale:number(value.scale,.4,1.4,'scale'),background:value.background,aura:value.aura,time:number(value.time,0,10,'time')};
}
function record(value){
  object(value,['id','name','settings','createdAt','updatedAt'],'Stored preset');
  if(typeof value.createdAt!=='string'||typeof value.updatedAt!=='string'||Number.isNaN(Date.parse(value.createdAt))||Number.isNaN(Date.parse(value.updatedAt)))throw new Error('Stored preset has invalid timestamps.');
  return{id:id(value.id),name:name(value.name),settings:settings(value.settings),createdAt:value.createdAt,updatedAt:value.updatedAt};
}

export const routes = [
  {
    op:'listPresets',method:'GET',path:'/api/presets',title:'List saved character presets',
    description:'Read the named character presets stored for this studio.',
    inputSchema:{type:'object',properties:{},additionalProperties:false},
    outputSchema:{type:'object',required:['presets'],properties:{presets:{type:'array',items:{type:'object'}}}},
    annotations:{readOnlyHint:true},public:true,
    handler:async(input,{env})=>{
      object(input,[],'Input');const keys=await env.storage.list();
      if(!Array.isArray(keys)||keys.some(key=>typeof key!=='string'))throw new Error('Preset storage is unavailable.');
      const values=await Promise.all(keys.filter(key=>key.startsWith('preset/')).map(key=>env.storage.get(key)));
      const presets=values.filter(value=>value!==undefined).map(record).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name));
      return{presets};
    },
  },
  {
    op:'savePreset',method:'POST',path:'/api/presets/save',title:'Save a character preset',
    description:'Create or update a named preset with validated motion and appearance settings.',
    inputSchema:{type:'object',required:['id','name','settings'],additionalProperties:false,properties:{
      id:{type:'string',minLength:1,maxLength:64,pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'},name:{type:'string',minLength:1,maxLength:48},
      settings:{type:'object',required:['state','eyeSpeed','scale','background','aura','time'],additionalProperties:false,properties:{state:{type:'string',enum:['normal','working','ultracode']},eyeSpeed:{type:'number',minimum:0,maximum:3},scale:{type:'number',minimum:.4,maximum:1.4},background:{type:'string',enum:['dark','light','transparent']},aura:{type:'boolean'},time:{type:'number',minimum:0,maximum:10}}},
    }},
    outputSchema:{type:'object',required:['preset'],properties:{preset:{type:'object'}}},
    annotations:{readOnlyHint:false},public:true,
    handler:async(input,{env})=>{
      object(input,['id','name','settings'],'Input');const presetId=id(input.id),presetName=name(input.name),configuration=settings(input.settings);
      const key='preset/'+presetId,previous=await env.storage.get(key),now=new Date().toISOString();
      const preset={id:presetId,name:presetName,settings:configuration,createdAt:previous===undefined?now:record(previous).createdAt,updatedAt:now};
      await env.storage.put(key,preset);return{preset};
    },
  },
  {
    op:'deletePreset',method:'POST',path:'/api/presets/delete',title:'Delete a saved preset',
    description:'Delete only the preset with the supplied id.',
    inputSchema:{type:'object',required:['id'],properties:{id:{type:'string',minLength:1,maxLength:64,pattern:'^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$'}},additionalProperties:false},
    outputSchema:{type:'object',required:['id','deleted'],properties:{id:{type:'string'},deleted:{type:'boolean'}}},
    annotations:{readOnlyHint:false,destructiveHint:true},public:true,
    handler:async(input,{env})=>{object(input,['id'],'Input');const presetId=id(input.id);return{id:presetId,deleted:await env.storage.delete('preset/'+presetId)};},
  },
];
