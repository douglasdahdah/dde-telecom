'use strict';

const writeExcelFile = require('write-excel-file/node').default;
const { rateLimit } = require('express-rate-limit');
const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const STATUS = { novo:'Novo', atendimento:'Em atendimento', convertido:'Venda realizada', nao_convertido:'Não convertido' };
const ORIGENS = { site:'Site', vendedor:'Cadastro do vendedor', meta_ads:'Anúncio Facebook/Instagram', meta_social:'Facebook/Instagram', meta_lead_ads:'Formulário Facebook/Instagram' };

// Colunas conferidas no esquema real. O JOIN nunca consulta senha ou credenciais.
const BASE_QUERY = `SELECT l.id,l.nome,l.telefone,l.email,l.cep,l.interesse,l.status,l.origem,
    l.logradouro,l.numero,l.complemento,l.bairro,l.cidade,l.estado,l.observacoes,
    l.vendedor,l.vendedor_id,l.metadados_marketing,
    u.nome AS responsavel_nome,u.perfil AS responsavel_perfil,
    to_char(l.criado_em AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
        'YYYY-MM-DD"T"HH24:MI:SS.MS') AS recebido_brasilia,
    to_char(l.ultimo_contato AT TIME ZONE 'UTC' AT TIME ZONE 'America/Sao_Paulo',
        'YYYY-MM-DD"T"HH24:MI:SS.MS') AS contato_brasilia
    FROM public.leads l LEFT JOIN public.usuarios u ON u.id=l.vendedor_id`;

function reportQuery(query = {}) {
    const q = query.q === undefined ? '' : query.q;
    const status = query.status === undefined ? '' : query.status;
    if (typeof q !== 'string' || q.length > 300 || typeof status !== 'string' ||
        (status && !Object.hasOwn(STATUS,status))) {
        const error = new Error('Confira a busca e o status selecionados para o relatório.');
        error.status = 400; throw error;
    }
    const filters = { q:q.trim().toLowerCase(),status };
    const values = [], conditions = ['l.excluido_em IS NULL'];
    if (filters.q) {
        values.push(filters.q);
        conditions.push(`strpos(lower(concat_ws(' ',NULLIF(l.nome,''),NULLIF(l.telefone,''),
            NULLIF(l.email,''),NULLIF(l.cidade,''),NULLIF(l.estado,''),NULLIF(l.interesse,''),
            NULLIF(l.vendedor,''))),$${values.length})>0`);
    }
    if (status) { values.push(status); conditions.push(`l.status=$${values.length}`); }
    return { text:BASE_QUERY+(conditions.length ? ' WHERE '+conditions.join(' AND ') : '')+' ORDER BY l.id DESC',values,filters };
}

function text(value) {
    if (value === null || value === undefined) return null;
    const result = String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
    if (result.length > 32767) {
        const error = new Error('Um dos campos excede o limite de texto de uma célula do Excel.');
        error.status=422; throw error;
    }
    return result;
}
function localDate(value) {
    if (!value) return null;
    // O SQL já converteu para Brasília. O Z codifica essa hora local no serial do Excel.
    const date = new Date(value+'Z');
    if (!Number.isFinite(date.getTime())) throw new Error('Data do relatório inválida.');
    return date;
}
function brasiliaStamp(now) {
    const parts = new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'}).formatToParts(now);
    const get = type => parts.find(p=>p.type===type).value;
    return `${get('year')}-${get('month')}-${get('day')}-${get('hour')}${get('minute')}${get('second')}`;
}

const COLUMNS = [
    ['ID do lead','id',12,Number], ['Cliente','nome',30],
    ['Vendedor indicado',r=>r.responsavel_perfil==='vendedor' ? r.responsavel_nome || r.vendedor : null,28],
    ['Responsável no cadastro','vendedor',28],
    ['Perfil do responsável',r=>({admin:'Administrador',vendedor:'Vendedor'}[r.responsavel_perfil] || r.responsavel_perfil),23],
    ['ID do responsável','vendedor_id',18,Number], ['Telefone / WhatsApp','telefone',24], ['E-mail','email',34],
    ['Plano de interesse','interesse',32], ['Status',r=>STATUS[r.status] || r.status,23],
    ['Recebido (Brasília)',r=>localDate(r.recebido_brasilia),24,Date],
    ['Último contato (Brasília)',r=>localDate(r.contato_brasilia),26,Date],
    ['CEP','cep',13], ['Logradouro','logradouro',34], ['Número','numero',13],
    ['Complemento','complemento',26], ['Bairro','bairro',26], ['Cidade','cidade',24], ['UF','estado',8],
    ['Origem',r=>ORIGENS[r.origem] || r.origem,30], ['Observações','observacoes',60],
    ['UTM origem',r=>r.metadados_marketing?.utm_source,22], ['UTM meio',r=>r.metadados_marketing?.utm_medium,20],
    ['UTM campanha',r=>r.metadados_marketing?.utm_campaign,32], ['UTM conteúdo',r=>r.metadados_marketing?.utm_content,28],
    ['UTM termo',r=>r.metadados_marketing?.utm_term,28], ['ID Página Meta',r=>r.metadados_marketing?.page_id,24],
    ['ID formulário Meta',r=>r.metadados_marketing?.form_id,24], ['ID anúncio Meta',r=>r.metadados_marketing?.ad_id,24],
    ['ID conjunto Meta',r=>r.metadados_marketing?.adgroup_id,24],
    ['Criação Meta (Unix)',r=>r.metadados_marketing?.meta_created_time,24],
    ['Metadados completos (JSON)',r=>JSON.stringify(r.metadados_marketing ?? {}),70]
];

function sheetData(leads, filters, now) {
    const band = (value,color,fontSize=11) => [{value,type:String,columnSpan:8,fontSize,fontWeight:'bold',backgroundColor:color,textColor:color==='#062b3d'?'#ffffff':'#123b50',height:28},...Array(7).fill(null)];
    const date = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'medium'}).format(now);
    const rows = [
        band('DDE Telecom · Relatório de leads','#062b3d',18),
        band(`Gerado em ${date} · ${leads.length} lead(s) · datas em horário de Brasília`,'#e1f7ee'),
        band(`Busca: ${filters.q || 'Todos'} · Status: ${STATUS[filters.status] || 'Todos'}`,'#f0f6fa'),
        band('Vendedor indicado: preenchido quando o responsável tem perfil de vendedor.','#fff0df'),
        COLUMNS.map(([value],index)=>({value,type:String,fontWeight:'bold',backgroundColor:index===2?'#00876c':'#0b3c59',textColor:'#ffffff',height:36,wrap:true,alignVertical:'center'}))
    ];
    for (let i=0;i<leads.length;i++) {
        rows.push(COLUMNS.map(([,key,,type=String])=>{
            const value = typeof key==='function' ? key(leads[i]) : leads[i][key];
            return {value:type===String ? text(value) : value ?? null,type,
                format:type===String?'@':type===Date?'dd/mm/yyyy hh:mm:ss':'0',
                backgroundColor:i%2 ? '#f0f6fa':'#ffffff',textColor:'#123b50',
                alignVertical:'top',wrap:true,height:48};
        }));
    }
    if (!leads.length) rows.push(band('Nenhum lead encontrado para os filtros selecionados.','#ffffff'));
    return rows;
}

async function createLeadReport(leads, filters={q:'',status:''}, now=new Date()) {
    const data = sheetData(leads,filters,now);
    return writeExcelFile(data,{
        sheet:'Leads',columns:COLUMNS.map(([, ,width])=>({width})),
        stickyRowsCount:5,stickyColumnsCount:2,showGridLines:false,orientation:'landscape'
    },{fontFamily:'Calibri',fontSize:11}).toBuffer();
}

function registerLeadReports(app,pool,{autenticar,somenteAdmin}) {
    const limiter=rateLimit({windowMs:60000,limit:5,standardHeaders:'draft-8',legacyHeaders:false,
        message:{erro:'Aguarde um minuto para gerar outro relatório.'}});
    app.get('/api/admin/relatorios/leads.xlsx',
        (req,res,next)=>{res.set('Cache-Control','private, no-store');next();},
        autenticar,somenteAdmin,limiter,async(req,res,next)=>{
            try {
                const {text:sql,values,filters}=reportQuery(req.query);
                const {rows}=await pool.query(sql,values);
                const now=new Date(),buffer=await createLeadReport(rows,filters,now);
                res.set('Content-Type',XLSX_TYPE);
                res.set('Content-Disposition',`attachment; filename="DDE-Leads-${brasiliaStamp(now)}.xlsx"`);
                res.send(buffer);
            } catch(error) { next(error); }
        });
}

module.exports={COLUMNS,BASE_QUERY,XLSX_TYPE,reportQuery,sheetData,createLeadReport,registerLeadReports,brasiliaStamp};
