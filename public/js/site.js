'use strict';
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.menu-toggle');
  const menu = document.getElementById('menu-site');
  const fechar = () => { menu?.classList.remove('open'); toggle?.setAttribute('aria-expanded','false'); toggle?.setAttribute('aria-label','Abrir menu'); };
  toggle?.addEventListener('click', () => {
    const aberto = menu?.classList.toggle('open');
    toggle.setAttribute('aria-expanded',String(Boolean(aberto)));
    toggle.setAttribute('aria-label',aberto ? 'Fechar menu' : 'Abrir menu');
  });
  menu?.querySelectorAll('a').forEach(link => link.addEventListener('click',fechar));
  document.addEventListener('keydown',evento => { if(evento.key === 'Escape') fechar(); });
  const modal = document.getElementById('modal-cep');
  let focoAnterior;
  document.getElementById('abrir-consulta-cep')?.addEventListener('click', () => {
    focoAnterior = document.activeElement;
    setTimeout(() => document.getElementById('cep-consulta')?.focus(),0);
  });
  modal?.addEventListener('keydown', evento => {
    if (evento.key !== 'Tab') return;
    const campos = Array.from(modal.querySelectorAll('button,input,a[href]')).filter(el => !el.disabled && el.getClientRects().length);
    if (!campos.length) return;
    const primeiro = campos[0], ultimo = campos[campos.length-1];
    if(evento.shiftKey && document.activeElement === primeiro){evento.preventDefault();ultimo.focus();}
    else if(!evento.shiftKey && document.activeElement === ultimo){evento.preventDefault();primeiro.focus();}
  });
  document.getElementById('fechar-modal-cep')?.addEventListener('click',()=>focoAnterior?.focus());
});
