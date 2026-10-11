// Deterministic app-icon packaging. The owner-approved source is never modified.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const sharp=require('sharp');
const root=path.resolve(__dirname,'..');
const brand=JSON.parse(fs.readFileSync(path.join(root,'assets/brand/app-icon.json'),'utf8'));
const source=fs.readFileSync(path.join(root,brand.source));
if(crypto.createHash('sha256').update(source).digest('hex')!==brand.sourceSha256.toLowerCase())
 throw Error('The official source changed. Owner approval and brand metadata must be reviewed.');
const outputs=[
 ['assets/halloween/icon-192.png',192],['assets/halloween/icon-512.png',512],
 ['assets/halloween/picgift-favicon-hd.png',512],
 ['android/app/src/main/res/drawable-nodpi/ic_launcher_official.png',512],
 ['assets/brand/picgift-play-icon.png',512],['assets/brand/picgift-app-icon.png',1024]
];
(async()=>{
 const meta=await sharp(source).metadata();
 if(meta.width!==1254||meta.height!==1254)throw Error('Unexpected official source dimensions');
 for(const [name,size] of outputs){
  const expected=await sharp(source).extract(brand.crop).resize(size,size).removeAlpha().png().toBuffer();
  const target=path.join(root,name);
  if(process.argv.includes('--check')){
   const current=await sharp(target).removeAlpha().raw().toBuffer({resolveWithObject:true});
   const pixels=await sharp(expected).removeAlpha().raw().toBuffer();
   if(current.info.width!==size||current.info.height!==size||current.data.length!==pixels.length)
    throw Error('Incorrect app icon dimensions: '+name);
   let changed=0;for(let i=0;i<pixels.length;i++)if(Math.abs(pixels[i]-current.data[i])>2)changed++;
   if(changed)throw Error('App icon does not match the approved source: '+name);
  }else{fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,expected);}
 }
 console.log('Official source verified; all six app icons '+(process.argv.includes('--check')?'match':'generated')+'.');
})().catch(error=>{console.error(error.message);process.exitCode=1});
