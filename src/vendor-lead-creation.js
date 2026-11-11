'use strict';
const {notifyNewLead}=require('./lead-events');
function registerVendorLeadCreation(app,pool,{autenticar,normalizarLead,validarLead,leadLimiter=(req,res,next)=>next(),registerLead=async(options,insert)=>({lead:await insert(pool),duplicate:false})}) {
 app.post('/api/vendedor/leads',autenticar,leadLimiter,async(req,res,next)=>{
  res.set('Cache-Control','private, no-store');
  try {
   if(req.usuario.perfil!=='vendedor')return res.status(403).json({erro:'Acesso exclusivo para vendedores e indicadores cadastrados.'});
   const {rows:users}=await pool.query("SELECT id,nome FROM usuarios WHERE id=$1 AND perfil='vendedor' AND ativo=TRUE LIMIT 1",[req.usuario.id]);
   const vendedor=users[0];
   if(!vendedor)return res.status(403).json({erro:'Vendedor ou indicador não encontrado ou desativado.'});
   const lead=normalizarLead(req.body),error=validarLead(lead,true);
   if(error)return res.status(400).json({erro:error});
   const metadata={...lead.metadadosMarketing,indicador_id:vendedor.id,indicador_nome:vendedor.nome};
   const result=await registerLead({scope:'vendedor:'+vendedor.id,sellerId:vendedor.id,data:lead,key:req.get('Idempotency-Key')},async client=>{
   const {rows}=await client.query(`INSERT INTO public.leads (
    nome,telefone,email,cep,logradouro,numero,complemento,bairro,cidade,estado,interesse,
    vendedor,vendedor_id,origem,status,metadados_marketing
   ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'vendedor','novo',$14::jsonb) RETURNING *`,[
    lead.nome,lead.telefone,lead.email||null,lead.cep||null,lead.logradouro||null,lead.numero||null,
    lead.complemento||null,lead.bairro||null,lead.cidade||null,lead.estado||null,lead.interesse,
    vendedor.nome,vendedor.id,JSON.stringify(metadata)
   ]);
   return rows[0];
   });
   if(!result.duplicate)notifyNewLead();
   res.status(result.duplicate?200:201).json({mensagem:'Lead enviado ao administrador como Novo. Sua indicação ficou registrada.',vendedor:{id:vendedor.id,nome:vendedor.nome},lead:result.lead,duplicado:result.duplicate});
  } catch(error){next(error);}
 });
}
module.exports={registerVendorLeadCreation};
