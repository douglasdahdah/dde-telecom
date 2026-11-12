'use strict';

(async () => {
  const opcao = document.getElementById('meta-lead-opcao');
  if (!opcao) return;

  try {
    const resposta = await fetch('/api/meta-pixel');
    if (!resposta.ok) return;
    const { id } = await resposta.json();
    if (typeof id !== 'string' || !/^[1-9]\d{5,24}$/.test(id)) return;

    let inicializado = false;
    window.registrarConversaoMetaDDE = () => {
      try {
        if (!inicializado) {
          const fbq = (...argumentos) => {
            if (fbq.callMethod) fbq.callMethod(...argumentos);
            else fbq.queue.push(argumentos);
          };
          fbq.push = fbq;
          fbq.loaded = true;
          fbq.version = '2.0';
          fbq.queue = [];
          window.fbq = window._fbq = fbq;
          fbq('set', 'autoConfig', false, id);
          fbq('init', id);

          const script = document.createElement('script');
          script.async = true;
          script.src = 'https://connect.facebook.net/en_US/fbevents.js';
          document.head.appendChild(script);
          inicializado = true;
        }

        window.fbq('trackSingle', id, 'Lead');
      } catch {
        // Uma falha na medição não altera a solicitação já recebida.
      }
    };
    opcao.hidden = false;
  } catch {
    // O formulário continua disponível sem a medição opcional.
  }
})();
