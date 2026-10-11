const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),crypto=require('node:crypto');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
test('app artwork remains the exact owner-approved original across seasonal releases',()=>{
 const brand=JSON.parse(fs.readFileSync('assets/brand/app-icon.json','utf8'));
 const approved='88fdc7aa818cf005872573e143f9c0814c39a095eb014553d5244604a9ce9891';
 assert.equal(brand.sourceSha256.toLowerCase(),approved);
 assert.equal(hash(brand.source),approved);
 const targets=['assets/halloween/icon-512.png','assets/halloween/picgift-favicon-hd.png',
  'android/app/src/main/res/drawable-nodpi/ic_launcher_official.png','assets/brand/picgift-play-icon.png'];
 for(const file of targets){
  const png=fs.readFileSync(file);
  assert.equal(png.subarray(1,4).toString(),'PNG');
  assert.equal(png.readUInt32BE(16),512);assert.equal(png.readUInt32BE(20),512);
  assert.equal(hash(file),hash(targets[0]),'launcher, PWA and store diverged');
 }
 const workflow=fs.readFileSync('.github/workflows/official-logo.yml','utf8');
 assert.ok(!workflow.includes('git push'),'legacy generator must not overwrite the icon on main');
 assert.ok(workflow.includes('node scripts/app-icons.cjs --check'));
});
