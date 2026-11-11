'use strict';
// Entrada exclusiva da homologação. Não é usada pelo npm start de produção.
require('dotenv').config({quiet:true});
const express=require('express'),helmet=require('helmet'),crypto=require('crypto'),fs=require('fs'),path=require('path');
process.env.DDE_STAGING='true';
const {loadConfig}=require('../src/config');
const pool=require('../src/database/db'),config=loadConfig();
const key=process.env.STAGING_ACCESS_KEY;
if(!key||key.length<32)throw new Error('Configure a chave privada de acesso da homologação.');
const gate=express();
gate.disable('x-powered-by');
gate.set('trust proxy',1);
gate.use(helmet({contentSecurityPolicy:{directives:{defaultSrc:["'self'"],scriptSrc:["'self'"],scriptSrcAttr:["'none'"],styleSrc:["'self'","'unsafe-inline'",'https://fonts.googleapis.com'],fontSrc:["'self'",'https://fonts.gstatic.com'],imgSrc:["'self'",'data:'],connectSrc:["'self'",'https://viacep.com.br'],objectSrc:["'none'"],formAction:["'self'"],frameAncestors:["'none'"]}}}));
gate.use((req,res,next)=>{res.set({'X-Robots-Tag':'noindex, nofollow, noarchive','Cache-Control':'no-store','X-DDE-Environment':'homologacao'});next();});
const digest=value=>crypto.createHmac('sha256',key).update(value).digest('hex');
const same=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const {rateLimit}=require('express-rate-limit');
const loginLimit=rateLimit({windowMs:15*60*1000,limit:10,standardHeaders:'draft-8',legacyHeaders:false});
gate.post('/_homologacao/entrar',loginLimit,express.urlencoded({extended:false,limit:'2kb'}),(req,res)=>{
    if(!same(digest(String(req.body.chave||'')),digest(key)))return res.status(403).send('Chave de homologação inválida.');
    const payload=Date.now()+'.'+crypto.randomBytes(16).toString('hex');
    res.cookie('dde_homologacao',payload+'.'+digest(payload),{httpOnly:true,secure:config.production,sameSite:'strict',maxAge:8*60*60*1000,path:'/'});
    res.redirect(303,'/');
});
const app=require('../src/server');
gate.use((req,res,next)=>{
    if(['/health','/ready'].includes(req.path))return app(req,res,next);
    if(req.path==='/robots.txt')return res.type('text/plain').send('User-agent: *\nDisallow: /\n');
    const token=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith('dde_homologacao='))?.slice('dde_homologacao='.length);
    const parts=token?.split('.')||[];
    const payload=parts.slice(0,2).join('.');
    if(parts.length===3&&same(parts[2],digest(payload))&&Number(parts[0])<=Date.now()&&Number(parts[0])>Date.now()-8*60*60*1000)return next();
    res.status(401).type('html').send('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DDE — Homologação</title><body style="font:18px system-ui;max-width:650px;margin:60px auto;padding:24px"><h1>DDE Telecom — ambiente de testes</h1><p>Acesso restrito. Use somente dados fictícios. Este endereço não é o site de produção.</p><form action="/_homologacao/entrar" method="post"><label>Chave de homologação <input type="password" name="chave" required autocomplete="current-password"></label><button>Entrar</button></form></body></html>');
});
gate.use((req,res,next)=>{
    if(req.method!=='GET')return next();
    const relative=req.path==='/'?'index.html':req.path.endsWith('/')?req.path.slice(1)+'index.html':req.path.slice(1);
    if(!relative.endsWith('.html'))return next();
    const publicRoot=path.resolve(__dirname,'../public'),file=path.resolve(publicRoot,relative);
    if(!file.startsWith(publicRoot+path.sep)||!fs.existsSync(file))return next();
    const html=fs.readFileSync(file,'utf8').replace(/<body([^>]*)>/i,'<body$1><aside role="status" style="padding:12px;background:#fff1ba;color:#3b321b;font:16px system-ui;text-align:center">HOMOLOGAÇÃO — somente dados fictícios. Atendimento real e WhatsApp não fazem parte deste teste.</aside>');
    return res.type('html').send(html);
});
gate.use(app);
const server=gate.listen(process.env.PORT||3000,()=>console.log('Homologação DDE iniciada.'));
let stopping=false;
function stop(){if(stopping)return;stopping=true;const timer=setTimeout(()=>process.exit(1),10000);timer.unref();server.close(async()=>{await pool.end();clearTimeout(timer);});}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
