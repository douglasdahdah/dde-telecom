'use strict';

// IDs públicos da configuração criada na conta DDE. Nenhuma chave privada é
// enviada ao navegador. A autorização da Meta ainda exige o titular da conta.
(() => {
  const button = document.getElementById('conectar');
  const status = document.getElementById('status');
  const codeField = document.getElementById('codigo');
  const result = document.getElementById('resultado');
  const assets = document.getElementById('ativos');
  let active = false;
  let expiry;
  const clearCode = () => { codeField.value = ''; result.hidden = true; };
  window.addEventListener('pagehide', clearCode);

  window.addEventListener('message', event => {
    if (!active || !['https://www.facebook.com', 'https://web.facebook.com'].includes(event.origin)) return;
    let data = event.data;
    try { if (typeof data === 'string') data = JSON.parse(data); } catch { return; }
    if (!data || data.type !== 'WA_EMBEDDED_SIGNUP') return;
    if (data.event === 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING') {
      const waba = String(data.data?.waba_id || '');
      const phone = String(data.data?.phone_number_id || '');
      assets.textContent = 'Conta selecionada na Meta: ' + (/^\d+$/.test(waba) ? waba : 'aguardando validação') +
        (/^\d+$/.test(phone) ? '. Identificação do número: ' + phone : '') + '.';
    } else if (data.event === 'CANCEL' || data.event === 'ERROR') {
      status.textContent = 'A conexão não foi concluída. O remetente dos avisos permanece como estava.';
    }
  });

  button.addEventListener('click', () => {
    if (!window.FB || button.disabled) return;
    clearCode();
    clearTimeout(expiry);
    active = true;
    button.disabled = true;
    status.textContent = 'Conclua a conexão na janela oficial da Meta. A autorização sozinha ainda não ativa os avisos.';
    window.FB.login(response => {
      const code = response?.authResponse?.code;
      button.disabled = false;
      if (typeof code !== 'string' || !code || code.length > 12000) {
        active = false;
        status.textContent = 'A Meta não concluiu a autorização. Nenhum remetente foi alterado.';
        return;
      }
      codeField.value = code;
      result.hidden = false;
      status.textContent = 'Autorização recebida. Falta validar o número no servidor, configurar o envio e comprovar a entrega.';
      expiry = setTimeout(() => {
        active = false;
        clearCode();
        status.textContent = 'O código temporário foi apagado desta tela. Se necessário, inicie novamente a conexão.';
      }, 180000);
    }, {
      config_id: '2378599736209747', response_type: 'code',
      override_default_response_type: true,
      extras: { setup: {}, featureType: 'whatsapp_business_app_onboarding', sessionInfoVersion: '3' }
    });
  });

  async function init() {
    const token = localStorage.getItem('dde_admin_token');
    if (!token) { location.replace('/admin/login.html'); return; }
    const response = await fetch('/api/auth/me', {
      headers: { Authorization: 'Bearer ' + token }, cache: 'no-store'
    });
    if (response.status === 401) { location.replace('/admin/login.html'); return; }
    if (!response.ok) throw new Error('auth');
    const body = await response.json();
    const user = body.usuario || body;
    if (user.perfil !== 'admin') {
      status.textContent = 'Conexão disponível somente ao administrador.';
      return;
    }
    window.fbAsyncInit = () => {
      window.FB.init({ appId: '1835132120849593', autoLogAppEvents: false, xfbml: false, version: 'v25.0' });
      button.disabled = false;
      status.textContent = 'Pronto para abrir a conexão oficial da Meta.';
    };
    const sdk = document.createElement('script');
    sdk.async = true;
    sdk.crossOrigin = 'anonymous';
    sdk.src = 'https://connect.facebook.net/pt_BR/sdk.js';
    sdk.onerror = () => { status.textContent = 'Não foi possível carregar a conexão da Meta. Tente novamente.'; };
    document.head.appendChild(sdk);
  }
  init().catch(() => { status.textContent = 'Não foi possível verificar o acesso. Entre novamente no administrador.'; });
})();
