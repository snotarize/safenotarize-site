import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Script} from 'node:vm';

const generated=[
 'affidavit-of-support','business-authorization-letter','child-passport-consent',
 'employment-verification-letter','invitation-letter','minor-medical-consent',
 'proof-of-residency-affidavit','temporary-guardianship-authorization',
 'vehicle-bill-of-sale','vehicle-gift-affidavit'
];
const booking=['book.html','book-ht.html'];
const creators=['documents/create.html','documents/create-ht.html',...generated.map(x=>'documents/create/'+x+'.html')];
const read=p=>readFileSync(new URL('../'+p,import.meta.url),'utf8');
function inlineScripts(html){
 return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter(x=>!/(?:\bsrc=|application\/ld\+json|application\/json)/i.test(x[1])&&x[2].trim()).map(x=>x[2]);
}
test('public config points to the approved Standard Worker and Turnstile widget',()=>{
 const s=read('assets/document-handoff-config.js');
 assert.match(s,/enabled:\s*true/);
 assert.match(s,/multidocEnabled:\s*false/);
 assert.match(s,/endpoint:\s*'https:\/\/safenotarize-standard-production-handoff\.karlberryj\.workers\.dev'/);
 assert.match(s,/turnstileSiteKey:\s*'0x4AAAAAAF2zhQ7vo9NKBGsh'/);
 assert.doesNotMatch(s,/pat[A-Za-z0-9]{15}|Bearer\s+\S{16}|hook\.us2\.make\.com\/[A-Za-z0-9]{10}/);
});
test('client enforces HTTPS origin and Cloudflare Turnstile, no fake fixture',()=>{
 const s=read('assets/document-handoff.js');
 new Script(s,{filename:'assets/document-handoff.js'});
 assert.match(s,/u\.protocol==='https:'/);
 assert.match(s,/challenges\.cloudflare\.com\/turnstile\/v0\/api\.js/);
 assert.doesNotMatch(s,/test\.invalid|\.example\.test/);
 assert.match(s,/data\.attached!==true/);
});
for(const path of [...booking,...creators]){
 test(path+' retains valid inline JavaScript and shared feature flag',()=>{
  const html=read(path);
  assert.match(html,/<script src="\/assets\/document-handoff-config\.js" defer><\/script>/);
  assert.match(html,/<script src="\/assets\/document-handoff\.js" defer><\/script>/);
  const scripts=inlineScripts(html);
  assert.ok(scripts.length>0,'Inline JS expected');
  for(let i=0;i<scripts.length;i++)new Script(scripts[i],{filename:path+':script-'+i});
  if(booking.includes(path)){
   assert.match(html,/SafeNotarizeDocumentHandoff\.book\(payload\)/);
   assert.match(html,/transferConfirmed/);
   assert.match(html,/fetch\(MAKE_BOOKING_WEBHOOK_URL/);
  }else{
   assert.match(html,/SafeNotarizeDocumentHandoff\.stage\(/);
   assert.match(html,/snDocRevision/);
   assert.match(html,/clearPending\(\)/);
   assert.match(html,/doc\.save\(/);
  }
 });
}
test('OneNotary API pilot pages remain separate and unmodified by feature',()=>{
 const paths=['documents/create/affidavit-of-support-authorization-pilot.html','documents/create/affidavit-of-support-pilot.html'];
 for(const p of paths){
  const html=read(p);
  assert.doesNotMatch(html,/\/assets\/document-handoff\.js/);
 }
});
