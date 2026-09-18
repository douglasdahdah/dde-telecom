const loginForm = document.getElementById('loginForm');
const emailInput = document.getElementById('email');
const senhaInput = document.getElementById('senha');
const btnEntrar = document.getElementById('btnEntrar');
const mensagemLogin = document.getElementById('mensagemLogin');
const toggleSenha = document.getElementById('toggleSenha');


// =====================================================
// MOSTRAR / OCULTAR SENHA
// =====================================================

toggleSenha.addEventListener('click', () => {

    const senhaVisivel =
        senhaInput.type === 'text';

    senhaInput.type =
        senhaVisivel
            ? 'password'
            : 'text';

    toggleSenha.textContent =
        senhaVisivel
            ? 'Mostrar'
            : 'Ocultar';

    toggleSenha.setAttribute(
        'aria-label',
        senhaVisivel
            ? 'Mostrar senha'
            : 'Ocultar senha'
    );
});


// =====================================================
// LIMPAR MENSAGEM
// =====================================================

function limparMensagem() {

    mensagemLogin.textContent = '';
    mensagemLogin.className = 'login-message';
}


// =====================================================
// EXIBIR MENSAGEM
// =====================================================

function exibirMensagem(texto, tipo = 'erro') {

    mensagemLogin.textContent = texto;
    mensagemLogin.className =
        `login-message ${tipo}`;
}


// =====================================================
// LOGIN
// =====================================================

loginForm.addEventListener('submit', async (event) => {

    event.preventDefault();

    limparMensagem();


    const email =
        emailInput.value
            .trim()
            .toLowerCase();

    const senha =
        senhaInput.value;


    if (!email || !senha) {

        exibirMensagem(
            'Informe o e-mail e a senha.'
        );

        return;
    }


    btnEntrar.disabled = true;
    btnEntrar.textContent = 'Entrando...';


    try {

        const resposta = await fetch(
            '/api/auth/login',
            {
                method: 'POST',

                headers: {
                    'Content-Type':
                        'application/json'
                },

                body: JSON.stringify({
                    email,
                    senha
                })
            }
        );


        const dados =
            await resposta.json();


        if (!resposta.ok) {

            throw new Error(
                dados.erro ||
                'Não foi possível realizar o login.'
            );
        }


        if (!dados.token) {

            throw new Error(
                'Token de autenticação não recebido.'
            );
        }


        localStorage.setItem(
            'dde_token',
            dados.token
        );


        localStorage.setItem(
            'dde_usuario',
            JSON.stringify(
                dados.usuario
            )
        );


        exibirMensagem(
            'Login realizado com sucesso.',
            'sucesso'
        );


        setTimeout(() => {

            window.location.href =
                '/admin/';

        }, 500);


    } catch (erro) {

        console.error(
            'Erro no login:',
            erro
        );

        exibirMensagem(
            erro.message
        );

    } finally {

        btnEntrar.disabled = false;
        btnEntrar.textContent = 'Entrar';
    }
});