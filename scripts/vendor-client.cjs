// Rebuild the installed app's public dependencies without a runtime CDN.
// npm ci --prefix scripts/vendor-deps
// node scripts/vendor-client.cjs [optional-build-directory]
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),deps=path.resolve(process.argv[2]||path.join(__dirname,'vendor-deps'));
const vendor=path.join(root,'vendor');
(async()=>{
 const esbuild=require(path.join(deps,'node_modules/esbuild'));
 const expected={'@supabase/supabase-js':'2.57.4','esbuild':'0.28.2','@fontsource/dm-sans':'5.3.0','@fontsource/playfair-display':'5.3.0'};
 for(const [name,version] of Object.entries(expected)){
  const actual=JSON.parse(fs.readFileSync(path.join(deps,'node_modules',name,'package.json'),'utf8')).version;
  if(actual!==version)throw Error(`Unexpected ${name} version: ${actual}`);
 }
 fs.mkdirSync(path.join(vendor,'fonts'),{recursive:true});
 const result=await esbuild.build({stdin:{contents:"export { createClient } from '@supabase/supabase-js';",resolveDir:deps,sourcefile:'picgift-client.js'},bundle:true,format:'esm',platform:'browser',target:'es2020',minify:true,legalComments:'eof',metafile:true,outfile:path.join(vendor,'supabase.js')});
 const notices=new Map();
 for(const input of Object.keys(result.metafile.inputs)){
  let directory=path.dirname(path.resolve(input));
  while(directory!==path.dirname(directory)){
   if(fs.existsSync(path.join(directory,'package.json'))){
    const pkg=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
    const license=['LICENSE','LICENSE.md','LICENSE.txt','LICENSE-MIT'].find(file=>fs.existsSync(path.join(directory,file)));
    if(license)notices.set(pkg.name+'@'+pkg.version,fs.readFileSync(path.join(directory,license),'utf8'));
    break;
   }
   directory=path.dirname(directory);
  }
 }
 let css='/* Bundled Latin fonts: no external font request is needed to open PicGift. */\n';
 for(const [id,family,weights] of [['dm-sans','DM Sans',[400,500,600,700,800]],['playfair-display','Playfair Display',[400,500,600,700]]]){
  const pkg=path.join(deps,'node_modules/@fontsource',id);
  notices.set('@fontsource/'+id+'@5.3.0',fs.readFileSync(path.join(pkg,'LICENSE'),'utf8'));
  for(const weight of weights){
   const file=`${id}-latin-${weight}-normal.woff2`;
   fs.copyFileSync(path.join(pkg,'files',file),path.join(vendor,'fonts',file));
   css+=`@font-face{font-family:'${family}';font-style:normal;font-display:swap;font-weight:${weight};src:url('./fonts/${file}') format('woff2')}\n`;
  }
 }
 fs.writeFileSync(path.join(vendor,'fonts.css'),css);
 fs.writeFileSync(path.join(vendor,'THIRD_PARTY_NOTICES.txt'),Array.from(notices,([name,license])=>name+'\n'+'='.repeat(name.length)+'\n'+license).join('\n\n'));
 console.log(`Bundled Supabase and ${9} local fonts; ${notices.size} license notices.`);
})().catch(error=>{console.error(error.message);process.exitCode=1});
