import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import path from 'node:path';

export class DiskStorage{
  constructor(file){this.file=file;this.queue=Promise.resolve();}
  async read(){try{const values=JSON.parse(await readFile(this.file,'utf8'));if(!values||typeof values!=='object'||Array.isArray(values))throw new Error('Invalid local KV file.');return values;}catch(error){if(error.code==='ENOENT')return{};throw error;}}
  async get(key){await this.queue;const values=await this.read();return Object.hasOwn(values,key)?values[key]:undefined;}
  async list(){await this.queue;return Object.keys(await this.read());}
  mutate(action){const operation=this.queue.then(async()=>{const values=await this.read(),result=action(values);await mkdir(path.dirname(this.file),{recursive:true});const temporary=this.file+'.tmp';await writeFile(temporary,JSON.stringify(values,null,2)+'\n');await rename(temporary,this.file);return result;});this.queue=operation.catch(()=>{});return operation;}
  put(key,value){return this.mutate(values=>{values[key]=structuredClone(value);});}
  delete(key){return this.mutate(values=>{const existed=Object.hasOwn(values,key);delete values[key];return existed;});}
}
