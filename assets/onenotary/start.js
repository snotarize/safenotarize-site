(() => {
 const lang=location.pathname.includes('start-ht')?'ht':new URLSearchParams(location.search).get('lang')==='fr'?'fr':'en';
 const messages={en:{title:'Start your session',intro:'Enter your email to continue on OneNotary.',email:'Your email address',button:'Continue to OneNotary',busy:'Opening your session…',unavailable:'Online start is not available yet. Please contact SafeNotarize below.',error:'We could not open your session. Please try again using this same page.',review:'Your request needs our help. Please contact SafeNotarize below before starting another request.',verify:'Please complete the security check.',library:'Need a document? Browse templates',support:'Contact SafeNotarize',notice:'You’ll leave SafeNotarize and continue on OneNotary. You may also receive an invitation email.'},ht:{title:'Kòmanse sesyon ou',intro:'Antre imèl ou pou kontinye sou OneNotary.',email:'Adrès imèl ou',button:'Kontinye sou OneNotary',busy:'N ap ouvri sesyon ou…',unavailable:'Ou poko ka kòmanse isit la. Kontakte SafeNotarize anba a.',error:'Nou pa rive ouvri sesyon an. Eseye ankò sou menm paj sa a.',review:'Nou bezwen ede w ak demann sa a. Kontakte SafeNotarize anba a anvan ou fè yon lòt demann.',verify:'Tanpri fini verifikasyon sekirite a.',library:'Ou bezwen yon dokiman? Gade modèl yo',support:'Kontakte SafeNotarize',notice:'W ap kite SafeNotarize pou kontinye sou OneNotary. Ou ka resevwa yon envitasyon pa imèl tou.'},fr:{title:'Commencez votre séance',intro:'Saisissez votre adresse e-mail pour continuer sur OneNotary.',email:'Votre adresse e-mail',button:'Continuer sur OneNotary',busy:'Ouverture de votre séance…',unavailable:'Le démarrage en ligne n’est pas encore disponible. Contactez SafeNotarize ci-dessous.',error:'Impossible d’ouvrir votre séance. Réessayez sur cette même page.',review:'Votre demande nécessite notre aide. Contactez SafeNotarize avant de créer une autre demande.',verify:'Veuillez terminer la vérification de sécurité.',library:'Besoin d’un document ? Consultez les modèles',support:'Contacter SafeNotarize',notice:'Vous allez quitter SafeNotarize pour continuer sur OneNotary. Vous pourrez aussi recevoir une invitation par e-mail.'}};
 const t=messages[lang];document.documentElement.lang=lang;document.title=t.title+' | SafeNotarize';
 for(const el of document.querySelectorAll('[data-text]'))el.textContent=t[el.dataset.text];
 const form=document.getElementById('sn-start'),button=form.querySelector('button'),status=document.getElementById('sn-status'),email=form.elements.email;
 document.getElementById('sn-library').href=lang==='ht'?'/documents/library-ht.html':'/documents/library.html';
 const config=window.SN_ONENOTARY||{};let widget,token='',pending;
 try{pending=JSON.parse(sessionStorage.getItem('sn-direct-start')||'null');if(pending){email.value=pending.email;email.readOnly=true;}}catch{}
 const configured=(()=>{try{return new URL(config.endpoint).protocol==='https:'&&Boolean(config.turnstileSiteKey);}catch{return false;}})();
 if(!configured){status.textContent=t.unavailable;button.disabled=true;return;}
 window.snTurnstileReady=()=>{widget=turnstile.render('#sn-check',{sitekey:config.turnstileSiteKey,action:'start_session',size:'flexible',callback:v=>{token=v;button.disabled=false;},'expired-callback':()=>{token='';button.disabled=true;},'error-callback':()=>{status.textContent=t.verify;token='';button.disabled=true;}});};
 const script=document.createElement('script');script.src='https://challenges.cloudflare.com/turnstile/v0/api.js?onload=snTurnstileReady&render=explicit';script.async=true;script.onerror=()=>status.textContent=t.error;document.head.append(script);
 form.addEventListener('submit',async e=>{
 e.preventDefault();if(button.disabled)return;if(!token){status.textContent=t.verify;return;}
 button.disabled=true;status.textContent=t.busy;
 try{
 if(!pending){pending={email:email.value.trim().toLowerCase(),request_key:Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('')};sessionStorage.setItem('sn-direct-start',JSON.stringify(pending));email.readOnly=true;}
 const r=await fetch(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...pending,turnstile:token}),credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(95000)});
 const data=await r.json();
 if(!r.ok){status.textContent=['review','processing','expired','email_changed'].includes(data.error)?t.review:data.error==='verification'?t.verify:data.error==='unavailable'?t.unavailable:t.error;return;}
 const link=new URL(data.link);if(link.protocol!=='https:'||link.hostname!=='app.onenotary.us'||link.username||link.password||(link.port&&link.port!=='443'))throw Error();
 location.assign(link.href);
 }catch{status.textContent=t.error;}finally{token='';if(widget!==undefined)turnstile.reset(widget);}
 });
})();
