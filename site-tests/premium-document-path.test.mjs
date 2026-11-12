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
  return {
    children:[],hidden:false,classList:{add(){}},
    get href(){return new URL(href,location).href;},
    set href(value){href=value;},
    append(...children){this.children.push(...children);},
    after(){},addEventListener(){}
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
  const options=element(origin),intro={querySelector:()=>element(origin)};
  return {'[data-sn-service-choice]':options,'[data-sn-service-intro]':intro};
}
const premiumHref=selectors=>selectors['[data-sn-service-choice]'].children[1].children.at(-1).href;

for(const lang of ['en','ht']){
  const ht=lang==='ht';
  const suffix=ht?'-ht':'';
  test('Premium opens the '+lang+' document choices and keeps the selected service on both paths',()=>{
    const start='/start'+suffix;
    const html=read(start.slice(1)+'.html');
    const selectors=chooser();
    renderServices(start,{lang,window:{SN_PREMIUM:config},selectors});
    const preparation=origin+start+'.html?service=premium';
    assert.equal(premiumHref(selectors),preparation);
    const elements={
      'have-btn':element(preparation,anchorHref(html,'have-btn')),
      'need-btn':element(preparation,anchorHref(html,'need-btn')),
      subtitle:element(preparation)
    };
    const choices=chooser();
    choices['#have-list li:last-child']=element(preparation);
    renderServices(preparation,{lang,window:{SN_PREMIUM:config},elements,selectors:choices});
    assert.equal(choices['[data-sn-service-choice]'].hidden,true);
    const own=new URL(elements['have-btn'].href);
    assert.equal(own.pathname,'/premium.html');
    assert.equal(own.searchParams.get('service'),'premium');
    assert.equal(own.searchParams.get('document_source'),'own');
    assert.equal(own.searchParams.get('lang'),ht?'ht':null);
    assert.equal(elements['need-btn'].href,origin+'/documents/library'+suffix+'.html?service=premium');
    const api=renderServices(own.href,{window:{SN_PREMIUM:config}});
    assert.equal(api.backToDocumentOptions,true);
    assert.equal(api.backPath,start+'.html?service=premium');
    assert.equal(api.libraryPath,'/documents/library'+suffix+'.html?service=premium');
  });

  test('all '+lang+' library creators carry the selected service through the shared PDF handoff',async()=>{
    const path='/documents/library'+suffix+'.html';
    const html=read(path.slice(1));
    assert.match(html,/<script src="\/assets\/premium\/services\.js\?v=7" defer><\/script>/);
    const targets=[...html.matchAll(/href=["']([^"']*(?:create(?:-ht)?\.html\?type=|\/create\/)[^"']*)["']/g)]
      .map(match=>match[1].replaceAll('&amp;','&'))
      .filter(href=>!href.includes('/create/ds-3053.html'));
    assert.equal(new Set(targets).size,26);
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
  }
});

test('Regular keeps its completed-document booking link',()=>{
  const location=new URL('/start?service=regular',origin);
  const html=read('start.html');
  const elements={'have-btn':element(location,anchorHref(html,'have-btn')),'need-btn':element(location,anchorHref(html,'need-btn'))};
  const selectors=chooser();
  renderServices(location.href,{window:{SN_PREMIUM:config},elements,selectors});
  assert.equal(selectors['[data-sn-service-choice]'].hidden,true);
  const book=new URL(elements['have-btn'].href);
  assert.equal(book.pathname,'/book.html');
  assert.equal(book.searchParams.get('service'),'regular');
  assert.equal(book.searchParams.get('document_source'),'own');
  assert.equal(elements['need-btn'].href,origin+'/documents/library.html?service=regular');
});
