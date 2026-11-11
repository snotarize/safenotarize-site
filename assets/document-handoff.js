/* SafeNotarize library-document handoff. Public site configuration ONLY: no private API keys. */
(() => {
  'use strict';
  const cfg=window.SN_HANDOFF || {};
  const ENDPOINT=typeof cfg.endpoint==='string'?cfg.endpoint.replace(/\/$/,''):'';
  function secureEndpoint(value){
    try{
      const u=new URL(value);
      return u.protocol==='https:' && !u.username && !u.password && !u.search &&
        !u.hash && !u.port && u.pathname==='/' && u.origin===value;
    }catch{return false;}
  }
  const enabled=cfg.enabled===true && secureEndpoint(ENDPOINT) &&
    Array.isArray(cfg.allowedSiteOrigins) && cfg.allowedSiteOrigins.includes(location.origin) &&
    typeof cfg.turnstileSiteKey==='string' && cfg.turnstileSiteKey.length>0;
  const SITE_KEY=cfg.turnstileSiteKey;
  // Multiple-PDF mode is enabled only by its separate release flag.
  const multidocEnabled=enabled && cfg.multidocEnabled===true;
  const STORAGE_KEY = 'sn_phase_b_handoff';
  const EXTRA_KEY = 'sn_phase_b_extra_handoffs';
  const MAX_EXTRAS = 8;
  const MAX_PDF = 5 * 1000 * 1000;
  const MAX_PENDING_AGE_MS=30*60*1000;
  let loader;
  function pending() {
    try { const v = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || 'null'); return v && typeof v.id==='string' && /^[0-9a-f-]{36}$/i.test(v.id) && typeof v.token==='string' && v.token.length>=24 && v.token.length<=512 && Number.isFinite(v.uploaded_at) && v.uploaded_at<=Date.now() && Date.now()-v.uploaded_at<MAX_PENDING_AGE_MS ? v : null; }
    catch { return null; }
  }
  function setPending(v) { try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(v)); } catch {} }
  function extraDocuments() {
    if(!multidocEnabled)return [];
    try {const v=JSON.parse(sessionStorage.getItem(EXTRA_KEY)||'[]');return Array.isArray(v)?v.filter(x=>x&&typeof x.id==='string'&&typeof x.token==='string'):[];}
    catch{return [];}
  }
  function setExtras(items){try{sessionStorage.setItem(EXTRA_KEY,JSON.stringify(items));}catch{}}
  function clearPending() { try { sessionStorage.removeItem(STORAGE_KEY);sessionStorage.removeItem(EXTRA_KEY); } catch {} }
  function loadTurnstile() {
    if (window.turnstile && typeof window.turnstile.render === 'function') return Promise.resolve(window.turnstile);
    if (loader) return loader;
    loader = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.onload = () => {
        const started = Date.now();
        const poll = () => {
          if (window.turnstile && window.turnstile.render) resolve(window.turnstile);
          else if (Date.now() - started > 10000) reject(new Error('Security check unavailable'));
          else setTimeout(poll, 80);
        }; poll();
      };
      s.onerror = () => reject(new Error('Security check could not load'));
      document.head.appendChild(s);
    });
    loader.catch(() => { loader=undefined; });
    return loader;
  }
  async function verificationToken() {
    const ts = await loadTurnstile();
    let holder = document.getElementById('sn-handoff-turnstile');
    if (!holder) {
      holder = document.createElement('div');
      holder.id = 'sn-handoff-turnstile';
      holder.style.cssText = 'margin:8px 0;min-height:1px';
      const status=document.getElementById('download-status');
      if(status)status.before(holder);
      else (document.querySelector('section.preview') || document.body).appendChild(holder);
    }
    return new Promise((resolve, reject) => {
      let widget;
      let settled=false;
      const timer = setTimeout(() => { finish(new Error('Security verification timed out')); }, 45000);
      const finish = (err, token) => {
        if(settled)return;
        settled=true;
        clearTimeout(timer);
        if (widget !== undefined) { try { ts.remove(widget); } catch {} }
        err ? reject(err) : resolve(token);
      };
      try {
        widget = ts.render(holder, {
          sitekey: SITE_KEY,
          appearance: 'interaction-only', execution: 'execute',
          action: 'document_handoff',
          ...(holder.dataset?.fitWidget !== undefined ? {size: holder.clientWidth < 300 ? 'compact' : 'flexible'} : {}),
          callback: token => finish(null, token),
          'error-callback': () => finish(new Error('Security verification failed')),
          'expired-callback': () => finish(new Error('Security verification expired'))
        });
        ts.execute(widget);
      } catch (e) { finish(e); }
    });
  }
  async function stageImpl(blob, filename, type, form) {
    lastResult=null;
    if(!multidocEnabled)clearPending();
    else if(!pending())setExtras([]);
    if (!(blob instanceof Blob) || !blob.size || blob.size > MAX_PDF) throw new Error('PDF exceeds the 5 MB automatic transfer limit');
    if(multidocEnabled && pending() && extraDocuments().length>=MAX_EXTRAS)throw new Error('Maximum additional documents reached');
    if (blob.type !== 'application/pdf') blob = new Blob([blob], {type:'application/pdf'});
    if(!enabled)throw new Error('Automatic transfer is disabled');
    const turnstile_token = await verificationToken();
    const body = new FormData();
    body.append('pdf', blob, filename || 'safenotarize-document.pdf');
    body.append('document_type', String(type || 'document').slice(0,100));
    body.append('turnstile_token', turnstile_token);
    try{const draft=JSON.parse(sessionStorage.getItem('sn_library_draft_tracking')||'null');if(draft?.id&&draft?.token){body.append('draft_tracking_id',draft.id);body.append('draft_tracking_token',draft.token);}}catch{}
    const contact=document.getElementById('phase-c-contact');if(contact?.value?.trim())body.append('client_email',contact.value.trim());
    const response = await fetch(`${ENDPOINT}/upload`, {method:'POST',body,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
    const data = await response.json().catch(()=>({}));
    if (!response.ok || !data.id || !data.token) throw new Error(data.error || 'Secure handoff unavailable');
    try{sessionStorage.removeItem('sn_library_draft_tracking')}catch{}
    const item={id:data.id,token:data.token,filename,document_type:type,uploaded_at:Date.now()};
    if(multidocEnabled && pending()) {
      const previous=extraDocuments();setExtras([...previous,item]);
      if(extraDocuments().length!==previous.length+1)throw new Error('Browser session storage unavailable');
    } else {setPending(item);if(!pending())throw new Error('Browser session storage unavailable');}
    return data.id;
  }
  // Serialize browser staging so overlapping generators cannot overwrite the first capability.
  let stagedSequence=Promise.resolve();
  function stage(...args){const next=stagedSequence.then(()=>stageImpl(...args));stagedSequence=next.catch(()=>{});return next;}
  function canBook(payload){
    const item=enabled?pending():null;
    return !!item && ['library','generated','template'].includes(payload.document_source) && payload.document_type===item.document_type;
  }
  let lastResult=null;
  async function book(payload) {
    const item=pending();
    if(!canBook(payload) || !item)throw new Error('No staged document');
    let response;
    try{response=await fetch(`${ENDPOINT}/book`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({id:item.id,token:item.token,payload}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});}
    catch{throw new Error('We could not confirm your booking. Please contact SafeNotarize before starting another booking.');}
    const data=await response.json().catch(()=>{throw new Error(isHt()?'Nou pa t kapab konfime randevou a. Kontakte SafeNotarize anvan ou fè yon lòt randevou.':'We could not confirm your booking. Please contact SafeNotarize before starting another booking.');});
    if(data.order_id && data.attached!==true)throw new Error('Your booking is saved, but your document needs attention. Please contact SafeNotarize before trying again.');
    if(!response.ok || !data.order_id)throw new Error(data.error==='booking_outcome_uncertain' ? 'Your booking may already be saved. Please contact SafeNotarize before trying again.' : 'We could not confirm the PDF attachment. Please contact SafeNotarize before starting another booking.');
    if(data.attached!==true)throw new Error('Your document was not attached. Please contact SafeNotarize.');
    if(multidocEnabled){
      // The root booking is created once; additional documents never call intake or PAD.
      // Consume only confirmed children. Unknown outcomes remain queued for review/retry.
      for(const child of extraDocuments()) {
        let status;
        try{
          const result=await fetch(`${ENDPOINT}/additional-document`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({parent:{id:item.id,token:item.token},document:{id:child.id,token:child.token}}),cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',redirect:'error'});
          status=result.ok?(await result.json().catch(()=>null)):null;
        }catch{}
        if(status?.attached!==true)throw new Error('Booking saved, but an additional document needs review. Do not create another booking.');
        setExtras(extraDocuments().filter(x=>x.id!==child.id));
      }
    }
    lastResult=data;
    // Keep capability until the next page navigation; no secrets in URLs.
    return data.order_id;
  }
  const isHt=()=>document.documentElement.lang==='ht';
  function creatorUI(){
    const button=document.getElementById('download'),box=document.getElementById('next-box');
    if(!button||!box)return;
    const ht=isHt();
    const premium=new URLSearchParams(location.search).get('service')==='premium';
    button.textContent=enabled?(ht?'Kontinye pou notarye':'Continue to notarization'):(ht?'Telechaje PDF':'Download PDF');
    const heading=box.querySelector('strong'),description=box.querySelector('p');
    if(heading)heading.textContent=enabled?(ht?'PDF ou a pare':'Your PDF is ready'):(ht?'PDF ou a telechaje':'Your PDF is downloaded');
    if(description)description.textContent=enabled?(ht?'Ajoute enfòmasyon siyatè ak sesyon an. PDF ou a ap ale otomatikman ak randevou a.':'Add signer and session details. Your saved PDF will be included automatically.'):(ht?'Kontinye pou ajoute enfòmasyon randevou a, epi voye PDF ou a.':'Continue to add your booking details, then upload your PDF.');
    const next=document.getElementById('continue');
    if(next){
      next.textContent=ht?'Kontinye pou notarye':'Continue to notarization';
      const url=new URL(next.href);
      if(!enabled)url.searchParams.set('document_source','own');
      if(premium&&url.origin===location.origin){
        url.pathname='/premium.html';
        url.searchParams.delete('document_ready');
        url.searchParams.set('service','premium');
        if(ht)url.searchParams.set('lang','ht');
        if(!enabled)url.searchParams.delete('document_type');
      }
      if(['safenotarize.com','www.safenotarize.com'].includes(url.hostname))next.href=url.pathname+url.search;
    }
    if(premium){
      for(const link of document.querySelectorAll('a[href="/documents/library.html"], a[href="/documents/library-ht.html"]')){
        const library=new URL(link.href);
        library.searchParams.set('service','premium');
        link.href=library.pathname+library.search;
      }
    }
    const privacy=document.getElementById('privacy')||document.querySelector('.editor .legal');
    if(privacy)privacy.textContent=enabled?(ht?'Bouyon ou rete nan navigatè sa a. Lè ou kontinye pou rezève, PDF ou a ale jwenn SafeNotarize an sekirite.':'Your draft stays in this browser. When you continue to notarization, your PDF is sent securely to SafeNotarize.'):(ht?'Bouyon ou rete nan navigatè sa a jiskaske ou chwazi voye dokiman an.':'Your draft stays in this browser until you choose to upload it.');
    if(!document.getElementById('sn-download-copy')){
      const copy=document.createElement('button');copy.type='button';copy.id='sn-download-copy';copy.className='btn';
      copy.textContent=ht?'Telechaje yon kopi PDF':'Download a PDF copy';
      copy.style.cssText='background:#fff;color:#00274d;border:1px solid #cbd8e6';
      copy.addEventListener('click',()=>window.downloadPdf?.({downloadOnly:true}));
      button.after(copy);
    }
  }
  function refreshBookingUI(){
    const form=document.getElementById('booking-form'),button=document.getElementById('continue-btn');
    if(!form||!button||!enabled)return;
    const params=new URLSearchParams(location.search),source=(params.get('document_source')||'').trim().toLowerCase();
    if(!['library','generated','template'].includes(source))return;
    const ht=isHt(),type=(params.get('document_type')||'').trim().toLowerCase();
    const valid=canBook({document_source:'library',document_type:type});
    button.textContent=ht?'Kontinye pou notarye':'Continue to notarization';
    button.disabled=!valid;
    const instruction=document.querySelector('.section-head p');
    if(instruction){
      instruction.textContent=ht?'PDF ou a sove.':'Your PDF is saved.';
      instruction.hidden=!valid;
    }
    let note=document.getElementById('sn-generated-pdf-note');
    if(valid){
      note?.remove();
      return;
    }
    if(!note){note=document.createElement('div');note.id='sn-generated-pdf-note';note.setAttribute('role','status');note.style.cssText='margin:16px 0;padding:14px;border:1px solid #dce7f2;border-radius:12px;background:#f3f9ff;color:#00274d';const head=document.querySelector('.section-head');if(head)head.after(note);else form.prepend(note);}
    note.replaceChildren();
    const message=document.createElement('p');message.textContent=ht?'PDF la pa disponib ankò nan navigatè sa a. Retounen nan dokiman ou a epi peze Kontinye pou notarye.':'The saved PDF is no longer available in this browser. Return to your document and choose Continue to notarization.';
    const back=document.createElement('a');back.textContent=ht?'Retounen nan dokiman mwen an':'Return to my document';
    back.href=ht?'/documents/library-ht.html':'/documents/library.html';
    if(type==='ds-3053'){
      const query=new URLSearchParams();
      if(ht)query.set('lang','ht');
      if(params.get('service')==='regular')query.set('service','regular');
      back.href='/documents/create/ds-3053.html'+(query.size?'?'+query:'');
    }
    try{const ref=new URL(document.referrer);if(['https://safenotarize.com','https://www.safenotarize.com'].includes(ref.origin)&&/^\/documents\/create(?:-ht)?(?:\.html|\/[^/]+\.html)$/.test(ref.pathname)){back.href=ref.pathname+ref.search;back.addEventListener('click',event=>{if(history.length>1){event.preventDefault();history.back();}});}}catch{}
    back.style.cssText='display:inline-block;font-weight:bold;color:#00274d;padding:10px 0';note.append(message,back);
  }
  function initializeUI(){creatorUI();refreshBookingUI();}
  const stickyHeader=document.querySelector('.sn-site-header');
  if(stickyHeader){
    const updateScrollOffset=()=>document.documentElement.style.setProperty(
      '--sn-sticky-header-height',stickyHeader.getBoundingClientRect().height+'px');
    updateScrollOffset();
    if(typeof ResizeObserver==='function')new ResizeObserver(updateScrollOffset).observe(stickyHeader);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initializeUI,{once:true});else initializeUI();
  window.addEventListener('pageshow',event=>{if(event.persisted)initializeUI();});
  window.SafeNotarizeDocumentHandoff={stage,book,canBook,enabled:()=>enabled,multidocEnabled:()=>multidocEnabled,pending:()=>enabled?pending():null,additional:()=>extraDocuments().map(x=>({filename:x.filename,document_type:x.document_type})),clearPending,result:()=>lastResult,refreshBookingUI};
})();
