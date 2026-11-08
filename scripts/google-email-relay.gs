// DDE Telecom — retransmissor de avisos para o próprio e-mail da empresa.
// Implantar como aplicativo da Web executado por ddetelecom@gmail.com.
// A chave é criada nas propriedades do projeto, nunca neste código.
function configurarDDE() {
  if (Session.getEffectiveUser().getEmail() !== 'ddetelecom@gmail.com') throw new Error('Use a conta ddetelecom@gmail.com.');
  const props=PropertiesService.getScriptProperties();
  if(!props.getProperty('DDE_ALERT_SECRET')) props.setProperty('DDE_ALERT_SECRET',(Utilities.getUuid()+Utilities.getUuid()).replace(/-/g,''));
  console.log('Configuração privada pronta. Cota disponível: '+MailApp.getRemainingDailyQuota());
}
function doGet() { return jsonDDE_({service:'DDE Telecom — avisos',version:1}); }
function jsonDDE_(value) {return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);}
function doPost(e) {
  let lock;
  try {
    if(!e || !e.postData || e.postData.contents.length>3000) return jsonDDE_({ok:false,code:'invalid_request'});
    const envelope=JSON.parse(e.postData.contents), props=PropertiesService.getScriptProperties();
    const secret=props.getProperty('DDE_ALERT_SECRET');
    if(!secret || typeof envelope.payload!=='string' || envelope.payload.length>1500 || !/^[a-f0-9]{64}$/.test(envelope.signature||''))return jsonDDE_({ok:false,code:'unauthorized'});
    const expected=Utilities.computeHmacSha256Signature(envelope.payload,secret,Utilities.Charset.UTF_8).map(b=>('0'+((b+256)%256).toString(16)).slice(-2)).join('');
    let mismatch=0;for(let i=0;i<64;i++)mismatch|=expected.charCodeAt(i)^envelope.signature.charCodeAt(i);
    if(mismatch)return jsonDDE_({ok:false,code:'unauthorized'});
    const p=JSON.parse(envelope.payload),test=/^test:[a-z0-9-]{8,80}$/.test(p.key||'');
    const id=Number(p.leadId);
    if(p.version!==1 || !Number.isSafeInteger(p.timestamp) || Math.abs(Date.now()/1000-p.timestamp)>300 ||
       (!test && (!Number.isSafeInteger(id)||id<1||p.key!=='lead:'+id)) ||
       typeof p.origin!=='string'||p.origin.length>80||!Number.isFinite(Date.parse(p.createdAt)))return jsonDDE_({ok:false,code:'invalid_request'});
    lock=LockService.getScriptLock();
    if(!lock.tryLock(10000))return jsonDDE_({ok:false,code:'busy',retry:true});
    const key='delivery:'+p.key,prior=props.getProperty(key);
    if(prior) {
      const result=JSON.parse(prior);
      return jsonDDE_(result.status==='sent'?{ok:true,receipt:result.receipt,duplicate:true}:{ok:false,code:'delivery_uncertain'});
    }
    if(MailApp.getRemainingDailyQuota()<1)return jsonDDE_({ok:false,code:'daily_quota',retry:true});
    const receipt='dde-email-'+Utilities.getUuid();
    props.setProperty(key,JSON.stringify({status:'sending',receipt:receipt}));
    const subject=test?'DDE Telecom — teste de aviso instantâneo ['+p.key.slice(5)+']':'DDE Telecom — novo lead [DDE-LEAD-'+id+']';
    const stamp=Utilities.formatDate(new Date(p.createdAt),'America/Sao_Paulo','dd/MM/yyyy HH:mm:ss');
    const origin={'meta_lead_ads':'Formulário Facebook/Instagram','site':'Site DDE','instagram':'Instagram','facebook':'Facebook','vendedor':'Vendedor'}[p.origin]||'CRM DDE';
    const label=test?'Este é um teste de entrega. Nenhum lead foi criado.':'Novo lead nº '+id+'.';
    const body=label+'\nOrigem: '+origin+'\nHorário de Brasília: '+stamp+'\nAcesse: https://dde-telecom.onrender.com/admin/login.html';
    try {
      MailApp.sendEmail({to:'ddetelecom@gmail.com',subject:subject,body:body,name:'DDE Telecom — CRM',htmlBody:'<p>'+label+'</p><p>Origem: '+origin+'<br>Horário de Brasília: '+stamp+'</p><p><a href="https://dde-telecom.onrender.com/admin/login.html">Abrir o CRM DDE</a></p>'});
      props.setProperty(key,JSON.stringify({status:'sent',receipt:receipt}));
      return jsonDDE_({ok:true,receipt:receipt});
    } catch(error) {return jsonDDE_({ok:false,code:'delivery_uncertain'});}
  } catch(error) {return jsonDDE_({ok:false,code:'relay_error',retry:true});}
  finally {if(lock && lock.hasLock())lock.releaseLock();}
}
