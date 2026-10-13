const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const vm=require('node:vm');

function verifyBundle(directory){
 const root=path.resolve(directory);
 const files=[];
 const walk=folder=>{for(const entry of fs.readdirSync(folder,{withFileTypes:true})){
  const full=path.join(folder,entry.name);
  assert.ok(!entry.isSymbolicLink(),'No symlinks in the installed interface');
  if(entry.isDirectory())walk(full);else files.push(path.relative(root,full).split(path.sep).join('/'));
 }};
 walk(root);
 const bundled=new Set(files);
 for(const name of files)assert.ok(/^(?:[^/]+\.(?:html|js|css)|scenes\.json|manifest\.webmanifest|bundle-manifest\.json|(?:assets|locales|vendor)\/.+)$/.test(name),'Unexpected packaged file: '+name);
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'bundle-manifest.json'),'utf8'));
 assert.equal(manifest.bundled,true);
 assert.deepEqual([...manifest.files].sort(),files.filter(x=>x!=='bundle-manifest.json').sort(),'Manifest must exactly describe the installed files');
 for(const required of ['index.html','app.js','generator.js','config.js','vendor/supabase.js','vendor/fonts.css','locales/en.json'])assert.ok(bundled.has(required),'Missing startup resource: '+required);
 let references=0;
 const missing=[];
 function reference(file,value,remoteAllowed=false){
  if(!value||value.startsWith('#')||/^(?:data:|mailto:|tel:|blob:|javascript:)/i.test(value))return;
  const url=new URL(value.replace(/&amp;/g,'&'),'https://picgift.onrender.com/app/'+file);
  if(url.origin!=='https://picgift.onrender.com'){assert.ok(remoteAllowed,'Remote startup dependency in '+file+': '+url.origin);return}
  let target=decodeURIComponent(url.pathname).replace(/^\/(?:app\/)?/,'');
  if(!target)target='index.html';
  if(!bundled.has(target))missing.push(file+': '+target);references++;
 }
 for(const name of files){
  if(!/\.(?:html|js|css)$/.test(name)&&!['scenes.json','manifest.webmanifest'].includes(name))continue;
  const text=fs.readFileSync(path.join(root,name),'utf8');
  if(name.endsWith('.html'))for(const tag of text.matchAll(/<(script|link|img|source|a)\b[^>]*>/gi)){
   const ref=tag[0].match(/\b(?:src|href)\s*=\s*["']([^"']+)["']/i);
   if(ref)reference(name,ref[1],tag[1].toLowerCase()==='a');
  }
  if(name.endsWith('.css')){
   for(const ref of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/g))reference(name,ref[1]);
   for(const ref of text.matchAll(/@import\s+["']([^"']+)["']/g))reference(name,ref[1]);
  }
  if(name.endsWith('.js')){
   // Parse without executing: SDK diagnostic strings can contain fake import examples.
   const module=new vm.SourceTextModule(text,{identifier:name});
   for(const ref of module.dependencySpecifiers)reference(name,ref);
  }
  if(['scenes.json','manifest.webmanifest'].includes(name)){
   const inspect=value=>{
    if(typeof value==='string'&&/^(?:\.\/|\/)?assets\//.test(value))reference(name,value);
    else if(value&&typeof value==='object')Object.values(value).forEach(inspect);
   };
   inspect(JSON.parse(text));
  }
 }
 assert.deepEqual([...new Set(missing)],[],'Missing installed interface references');
 return {files:files.length,references};
}
module.exports={verifyBundle};
if(require.main===module){
 if(typeof vm.SourceTextModule!=='function'){
  const child=require('node:child_process').spawnSync(process.execPath,['--experimental-vm-modules',__filename,...process.argv.slice(2)],{stdio:'inherit'});
  process.exit(child.status??1);
 }
 const result=verifyBundle(process.argv[2]||'android/app/build/generated/picgiftAssets/app');
 console.log(`Installed interface verified: ${result.files} files, ${result.references} local references.`);
}
