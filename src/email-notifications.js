'use strict';
const crypto=require('node:crypto');
const {onNewLead}=require('./lead-events');
function readEmailConfig(env=process.env) {
 const config={mode:env.EMAIL_NOTIFICATIONS_MODE||'off',url:env.EMAIL_RELAY_URL||'',secret:env.EMAIL_RELAY_SECRET||'',recipient:env.EMAIL_RECIPIENT||'',testKey:env.EMAIL_SETUP_TEST_ID||''};
 config.enabled=['test','auto'].includes(config.mode)&&/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]{30,200}\/exec$/.test(config.url)&&/^[a-f0-9]{64}$/.test(config.secret)&&config.recipient==='ddetelecom@gmail.com'&&/^[a-z0-9-]{8,80}$/.test(config.testKey);
 return config;
}
function signedEmailPayload(alert,config,now=Date.now()) {
 const test=!!alert.test_key;
 if(!test&&(!Number.isSafeInteger(Number(alert.lead_id))||Number(alert.lead_id)<1))throw new Error('invalid_lead');
 const origin=['meta_lead_ads','site','instagram','facebook','vendedor'].includes(alert.origem)?alert.origem:'site';
 const payload=JSON.stringify({version:1,key:test?'test:'+alert.test_key:'lead:'+alert.lead_id,leadId:test?null:Number(alert.lead_id),origin:test?'teste':origin,createdAt:new Date(test?now:alert.criado_em).toISOString(),timestamp:Math.floor(now/1000)});
 return {payload,signature:crypto.createHmac('sha256',config.secret).update(payload).digest('hex')};
}
function createEmailWorker(pool,getConfig=readEmailConfig,fetchImpl=fetch) {
 let running=false,rerun=false;
 return async function run() {
  const config=getConfig();if(!config.enabled)return;
  if(running){rerun=true;return;}running=true;
  try {
   // O retransmissor deduplica por lead mesmo quando a resposta anterior se perdeu.
   await pool.query("UPDATE public.email_alerts SET status='pending',available_at=now(),updated_at=now() WHERE status='processing' AND reserved_at < now()-interval '2 minutes'");
   await pool.query('INSERT INTO public.email_alerts(test_key) VALUES($1) ON CONFLICT(test_key) DO NOTHING',[config.testKey]);
   for(let i=0;i<20;i++) {
    const {rows}=await pool.query(`WITH selected AS (
      SELECT a.id FROM public.email_alerts a LEFT JOIN public.leads l ON l.id=a.lead_id
      WHERE a.status='pending' AND a.available_at<=now() AND
       (a.test_key=$1 OR ($2 AND a.test_key IS NULL AND l.excluido_em IS NULL AND l.id IS NOT NULL))
      ORDER BY (a.test_key IS NOT NULL) DESC,a.id LIMIT 1 FOR UPDATE OF a SKIP LOCKED
     ) UPDATE public.email_alerts a SET status='processing',reserved_at=now(),attempts=attempts+1,updated_at=now()
     FROM selected s WHERE a.id=s.id RETURNING a.id,a.lead_id,a.test_key,
      (SELECT l.origem FROM public.leads l WHERE l.id=a.lead_id) AS origem,
      (SELECT l.criado_em FROM public.leads l WHERE l.id=a.lead_id) AS criado_em`,[config.testKey,config.mode==='auto']);
    const alert=rows[0];if(!alert)break;
    try {
     const response=await fetchImpl(config.url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(signedEmailPayload(alert,config)),signal:AbortSignal.timeout(30000)});
     const body=await response.json();
     if(response.ok&&body.ok===true&&/^dde-email-[a-f0-9-]{36}$/.test(body.receipt||'')) {
      await pool.query("UPDATE public.email_alerts SET status='sent',receipt_id=$2,sent_at=now(),error_code=NULL,updated_at=now() WHERE id=$1 AND status='processing'",[alert.id,body.receipt]);
     } else {
      const code=/^[a-z_]{1,70}$/.test(body.code||'')?body.code:'invalid_response';
      await pool.query("UPDATE public.email_alerts SET status=$2,error_code=$3,available_at=now()+interval '5 minutes',updated_at=now() WHERE id=$1 AND status='processing'",[alert.id,body.retry===true?'pending':'uncertain',code]);
      break;
     }
    } catch {
     await pool.query("UPDATE public.email_alerts SET status='pending',error_code='retry_with_deduplication',available_at=now()+interval '1 minute',updated_at=now() WHERE id=$1 AND status='processing'",[alert.id]);
     break;
    }
   }
  } catch {console.error('E-mail: processamento adiado; avisos preservados na fila.');}
  finally {running=false;if(rerun){rerun=false;setImmediate(run);}}
 };
}
function registerEmailNotifications(pool) {
 const run=createEmailWorker(pool),unsubscribe=onNewLead(run),timer=setInterval(run,15000);timer.unref();setImmediate(run);
 return {run,stop:()=>{clearInterval(timer);unsubscribe();}};
}
module.exports={readEmailConfig,signedEmailPayload,createEmailWorker,registerEmailNotifications};
