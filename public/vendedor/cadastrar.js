'use strict';
(()=>{
 const token=localStorage.getItem('dde_vendedor_token'),form=document.getElementById('cadastro-lead'),fields=document.getElementById('campos-lead'),message=document.getElementById('mensagem-cadastro'),send=document.getElementById('enviar-lead');
 let ready=false,sending=false,leadRequest;
 const headers={Authorization:`Bearer ${token}`};
 function logout(){localStorage.removeItem('dde_vendedor_token');localStorage.removeItem('dde_vendedor_usuario');window.location.replace('/vendedor/');}
 document.getElementById('sair').addEventListener('click',logout);
 if(!token){window.location.replace('/vendedor/');return;}
 (async()=>{
  try {
   const response=await fetch('/api/vendedor/me',{headers,cache:'no-store',signal:AbortSignal.timeout(12000)});
   if(response.status===401||response.status===403){logout();return;}
   if(!response.ok)throw new Error('Não foi possível conferir seu acesso. Recarregue a página.');
   const data=await response.json();if(data.usuario?.perfil!=='vendedor'){logout();return;}
   document.getElementById('nome-usuario').textContent=data.usuario.nome;
   fields.disabled=false;ready=true;message.textContent='Sua indicação será registrada com seu acesso. Preencha os campos com *.';
   try {
    const plansResponse=await fetch('/api/planos',{cache:'no-store',signal:AbortSignal.timeout(12000)});
    if(!plansResponse.ok)return;
    const plans=await plansResponse.json();if(!Array.isArray(plans))return;
    const select=form.elements.interesse;
    for(const plan of plans){if(!plan.nome)continue;const option=document.createElement('option');option.value=plan.nome;option.textContent=plan.nome;select.appendChild(option);}
   } catch { /* A indicação geral continua disponível se o catálogo não carregar. */ }
  } catch(error){message.textContent=error.message;}
 })();
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(!ready||sending||!form.reportValidity())return;
  const payload=Object.fromEntries(new FormData(form));const body=JSON.stringify(payload);
  if(leadRequest?.body!==body)leadRequest={body,key:crypto.randomUUID()};
  sending=true;send.disabled=true;message.textContent='Enviando indicação…';
  try {
   const response=await fetch('/api/vendedor/leads',{method:'POST',headers:{...headers,'Content-Type':'application/json','Idempotency-Key':leadRequest.key},body,signal:AbortSignal.timeout(20000)});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.erro||'Não foi possível enviar. Confira seus leads antes de tentar novamente.');
   if(!data.lead?.id)throw new Error('Não foi possível confirmar o cadastro. Confira seus leads antes de reenviar.');
   form.reset();leadRequest=undefined;message.textContent=`Lead nº ${data.lead.id} enviado ao administrador como Novo. Sua indicação ficou registrada.`;
  } catch(error){message.textContent=error.name==='TimeoutError'?'Não foi possível confirmar o envio. Confira Meus leads antes de enviar novamente.':error.message;}
  finally{sending=false;send.disabled=false;}
 });
})();
