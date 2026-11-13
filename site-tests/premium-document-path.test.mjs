import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import {runInNewContext} from 'node:vm';

const origin='https://safenotarize.com';
const read=path=>readFileSync(new URL('../'+path,import.meta.url),'utf8');
const services=read('assets/premium/services.js');
const handoff=read('assets/document-handoff.js');
const config={
  enabled:true,mode:'live',acceptingOrders:true,allowedOrigins:[origin],
  endpoint:'https://safenotarize-phase-c-premium-production.karlberryj.workers.dev/phase-c',
  stripePublishableKey:'pk_live_fixture',turnstileSiteKey:'fixture',
  pricing:{base:3000,notarization:2500,service:500,additionalSigner:1000,additionalStamp:1000,witness:1500}
};

function element(location,initialHref=''){
  let href=initialHref;
  const attributes=new Map(),listeners=new Map(),classes=new Set();
  return {
    children:[],hidden:false,classes,
    classList:{add:name=>classes.add(name),toggle:(name,on)=>on?classes.add(name):classes.delete(name)},
    get href(){return new URL(href,location).href;},
    set href(value){href=value;},
    setAttribute(name,value){attributes.set(name,value);},
    getAttribute(name){return attributes.get(name);},
    append(...children){this.children.push(...children);},
    addEventListener(name,listener){listeners.set(name,listener);},
    click(){listeners.get('click')?.();},
    focus(){this.focused=true;},scrollIntoView(){},after(){}
  };
}
function anchorHref(html,id){
  const anchor=[...html.matchAll(/<a\b[^>]*>/g)].find(match=>match[0].includes('id="'+id+'"'));
  return anchor[0].match(/href="([^"]+)"/)[1].replaceAll('&amp;','&');
}
function renderServices(path,{lang='en',window={},elements={},selectors={},groups={}}={}){
  const location=new URL(path,origin);
  const chooser=selectors['[data-sn-service-choice]'];
  if(chooser)chooser.hidden=true;
  window.history ??= { replaceState(_state,_title,url){location.href=new URL(url,location).href;} };
  const document={
    documentElement:{lang},createElement:()=>element(location),
    getElementById:id=>elements[id]??null,
    querySelector:selector=>selectors[selector]??null,
    querySelectorAll:selector=>groups[selector]??[]
  };
  runInNewContext(services,{window,document,location,URL,URLSearchParams});
  return window.SafeNotarizePremium;
}
function chooser(){
  const options=element(origin),intro={querySelector:()=>element(origin),querySelectorAll:()=>[]};
  return {'[data-sn-service-choice]':options,'[data-sn-service-intro]':intro};
}
const premiumHref=selectors=>selectors['[data-sn-service-choice]'].children[1].children.at(-1).href;
const documentOptions=selectors=>selectors['[data-sn-service-choice]'].children.find(node=>node.id==='sn-document-options');

test('a completed official form goes directly to checkout and retains its document type',()=>{
  const choices=chooser();
  renderServices('/book.html?document_ready=1&document_source=official&document_type=ps-1583',
    {window:{SN_PREMIUM:config},selectors:choices});
  const checkout=new URL(premiumHref(choices));
  assert.equal(checkout.pathname,'/premium.html');
  assert.equal(checkout.searchParams.get('document_source'),'own');
  assert.equal(checkout.searchParams.get('document_type'),'ps-1583');
  assert.equal(documentOptions(choices),undefined);
});

test('Premium keeps the vehicle release context through choosing and returning from checkout',()=>{
  const choices=chooser();
  renderServices('/book-ht.html?document_ready=1&document_source=own&document_type=vehicle-release',
    {lang:'ht',window:{SN_PREMIUM:config},selectors:choices});
  const checkout=new URL(premiumHref(choices));
  assert.equal(checkout.pathname,'/premium.html');
  assert.equal(checkout.searchParams.get('document_source'),'own');
  assert.equal(checkout.searchParams.get('document_type'),'vehicle-release');
  const back=new URL(renderServices(checkout.href).backPath,origin);
  assert.equal(back.pathname,'/start-ht.html');
  assert.equal(back.searchParams.get('document_type'),'vehicle-release');
  assert.equal(documentOptions(choices),undefined);
});

for(const lang of ['en','ht']){
  const ht=lang==='ht';
  const suffix=ht?'-ht':'';
  test('the '+lang+' start reveals the document answers in place and updates both links when the service changes',()=>{
    const start='/start'+suffix+'.html';
    const selectors=chooser();
    let selectedUrl;
    renderServices(start,{lang,window:{SN_PREMIUM:config,history:{replaceState(_state,_title,url){selectedUrl=url;}}},selectors});
    const [standard,onDemand]=selectors['[data-sn-service-choice]'].children;
    const standardButton=standard.children.at(-1),onDemandButton=onDemand.children.at(-1);
    const options=documentOptions(selectors);
    const [question,answers]=options.children;
    const [ready,need]=answers.children;
    assert.equal(options.hidden,true);
    standardButton.click();
    assert.equal(options.hidden,false);
    assert.equal(question.focused,true);
    assert.equal(standardButton.getAttribute('aria-pressed'),'true');
    assert.ok(standard.classes.has('sn-service-selected'));
    assert.equal(selectedUrl,start+'?service=regular');
    const standardUrl=new URL(ready.href);
    assert.equal(standardUrl.pathname,'/book'+suffix+'.html');
    assert.equal(standardUrl.searchParams.get('document_source'),'own');
    assert.equal(standardUrl.searchParams.get('document_ready'),'1');
    assert.equal(standardUrl.searchParams.get('service'),'regular');
    assert.equal(need.href,origin+'/documents/library'+suffix+'.html?service=regular');

    onDemandButton.click();
    assert.equal(standardButton.getAttribute('aria-pressed'),'false');
    assert.equal(onDemandButton.getAttribute('aria-pressed'),'true');
    assert.equal(selectedUrl,start+'?service=premium');
    const own=new URL(ready.href);
    assert.equal(own.pathname,'/premium.html');
    assert.equal(own.searchParams.get('service'),'premium');
    assert.equal(own.searchParams.get('document_source'),'own');
    assert.equal(own.searchParams.get('lang'),ht?'ht':null);
    assert.equal(need.href,origin+'/documents/library'+suffix+'.html?service=premium');
    const api=renderServices(own.href,{window:{SN_PREMIUM:config}});
    assert.equal(api.backToDocumentOptions,true);
    assert.equal(api.backPath,start+'?service=premium');
    assert.equal(api.libraryPath,'/documents/library'+suffix+'.html?service=premium');

    const preselected=chooser();
    renderServices(selectedUrl,{lang,window:{SN_PREMIUM:config},selectors:preselected});
    assert.equal(documentOptions(preselected).hidden,false);
    assert.equal(preselected['[data-sn-service-choice]'].children[1].children.at(-1).getAttribute('aria-pressed'),'true');
  });

  test('all '+lang+' library creators carry the selected service through the shared PDF handoff',async()=>{
    const path='/documents/library'+suffix+'.html';
    const html=read(path.slice(1));
    assert.match(html,/<script src="\/assets\/premium\/services\.js\?v=7" defer><\/script>/);
    const ownPanel=html.match(/<section[^>]+id="notarize-panel"[^>]*>[\s\S]*?<\/section>/)[0];
    assert.equal(anchorHref(ownPanel,'create-own-document'),'/documents/create'+suffix+'.html?type=custom');
    assert.equal(html.match(/type=custom/g).length,1);
    assert.doesNotMatch(html, /id="library-language"/);
    const targets=[...html.matchAll(/href=["']([^"']*(?:create(?:-ht)?\.html\?type=|\/create\/)[^"']*)["']/g)]
      .map(match=>match[1].replaceAll('&amp;','&'))
      .filter(href=>!href.includes('/create/ds-3053.html'));
    assert.equal(new Set(targets).size,27);
    for(const service of ['regular','premium']){
      const library=new URL(path+'?service='+service,origin);
      const links=[...new Set(targets)].map(href=>element(library,href));
      const outside=element(library,'https://example.invalid/documents/create.html?type=custom');
      renderServices(library.href,{lang,groups:{'a[href*="create"]':[...links,outside]}});
      assert.equal(outside.href,'https://example.invalid/documents/create.html?type=custom');

      for(const link of links){
        const location=new URL(link.href);
        assert.equal(location.searchParams.get('service'),service);
        const type=location.searchParams.get('type')||location.pathname.split('/').at(-1).replace('.html','');
        const next=element(location,'/book'+suffix+'.html?document_ready=1&document_source=library&document_type='+encodeURIComponent(type));
        const nodes={download:element(location),'next-box':{querySelector:()=>null},continue:next,
          'sn-download-copy':element(location),'sn-handoff-turnstile':element(location)};
        const back=element(location,path);
        const session=new Map();
        const sessionStorage={getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value),removeItem:key=>session.delete(key)};
        let pass;
        const window={
          SN_HANDOFF:{enabled:true,endpoint:'https://handoff.example.test',allowedSiteOrigins:[origin],turnstileSiteKey:'fixture'},
          addEventListener(){},
          turnstile:{render(_holder,options){pass=options.callback;return 'widget';},execute(){pass('test-token');},remove(){}}
        };
        const id='f235dd9d-0881-44c3-8be3-875883d66341';
        const token='a'.repeat(64);
        const document={
          readyState:'complete',documentElement:{lang},getElementById:key=>nodes[key]??null,
          querySelector:()=>null,querySelectorAll:()=>[back]
        };
        runInNewContext(handoff,{document,window,location,sessionStorage,URL,URLSearchParams,Blob,FormData,setTimeout,clearTimeout,
          fetch:async(url,options)=>{
            assert.equal(url,'https://handoff.example.test/upload');
            assert.equal(options.body.get('document_type'),type);
            return Response.json({id,token});
          }
        });
        await window.SafeNotarizeDocumentHandoff.stage(new Blob(['%PDF fixture']),type+'.pdf',type);
        const checkout=new URL(next.href);
        assert.equal(checkout.pathname,service==='premium'?'/premium.html':'/book'+suffix+'.html');
        assert.equal(checkout.searchParams.get('document_ready'),service==='premium'?null:'1');
        assert.equal(checkout.searchParams.get('service'),service);
        assert.equal(checkout.searchParams.get('document_source'),'library');
        assert.equal(checkout.searchParams.get('document_type'),type);
        assert.equal(checkout.searchParams.get('lang'),service==='premium'&&ht?'ht':null);
        assert.equal(checkout.href.includes(token),false);
        assert.equal(back.href,library.href);
        const api=renderServices(checkout.href,{window:{SN_PREMIUM:config,SafeNotarizeDocumentHandoff:window.SafeNotarizeDocumentHandoff}});
        const context=api.documentContext();
        assert.equal(context.source,'library');
        assert.equal(context.pending.id,id);
        assert.equal(context.pending.token,token);
      }
    }
  });
}

test('the booking chooser opens Premium with a matching saved PDF and otherwise shows document choices',()=>{
  const path='/book.html?document_ready=1&document_source=library&document_type=custom';
  for(const available of [true,false]){
    const selectors=chooser();
    renderServices(path,{
      selectors,window:{SN_PREMIUM:config,SafeNotarizeDocumentHandoff:{
        canBook:payload=>available&&payload.document_type==='custom',pending:()=>({id:'fixture'})
      }}
    });
    const href=new URL(premiumHref(selectors));
    assert.equal(href.pathname,available?'/premium.html':'/start.html');
    assert.equal(href.searchParams.get(available?'document_type':'service'),available?'custom':'premium');
    assert.equal(documentOptions(selectors),undefined);
    const standard=new URL(selectors['[data-sn-service-choice]'].children[0].children.at(-1).href);
    assert.equal(standard.pathname,'/book.html');
    assert.equal(standard.searchParams.get('document_source'),'library');
    assert.equal(standard.searchParams.get('document_type'),'custom');
    assert.equal(standard.searchParams.get('service'),'regular');
  }
});

test('the Standard fallback remains usable when on-demand is unavailable',()=>{
  const selectors=chooser();
  renderServices('/start.html?service=premium',{window:{SN_PREMIUM:{...config,acceptingOrders:false}},selectors});
  assert.equal(selectors['[data-sn-service-choice]'].hidden,true);
  const html=read('start.html');
  const book=new URL(anchorHref(html,'have-btn'),origin);
  assert.equal(book.pathname,'/book.html');
  assert.equal(book.searchParams.get('service'),'regular');
  assert.equal(book.searchParams.get('document_source'),'own');
  assert.equal(anchorHref(html,'need-btn'),'/documents/library.html?service=regular');
});
