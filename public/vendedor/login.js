document.addEventListener('DOMContentLoaded', () => {

    const form =
        document.querySelector('form');

    const email =
        document.querySelector(
            'input[type="email"]'
        );

    const senha =
        document.querySelector(
            'input[type="password"]'
        );

    const mensagem =
        document.getElementById(
            'login-mensagem'
        )
        || document.getElementById('mensagemLogin')
        ||
        document.getElementById(
            'mensagem-login-vendedor'
        )
        ||
        document.querySelector(
            '.login-mensagem'
        );


    const botaoSenha =
        document.getElementById('toggleSenha') ||
        [
            ...form.querySelectorAll(
                'button'
            )
        ]
        .find(
            botao =>
                /mostrar|ocultar/i.test(
                    botao.textContent
                )
        );


    if (botaoSenha) {

        botaoSenha.type =
            'button';


        botaoSenha.onclick =
            evento => {

                evento.preventDefault();


                const aberta =
                    senha.type ===
                    'text';


                senha.type =
                    aberta
                        ? 'password'
                        : 'text';


                botaoSenha.textContent =
                    aberta
                        ? 'Mostrar'
                        : 'Ocultar';
            };
    }


    form.addEventListener(
        'submit',
        async evento => {

            evento.preventDefault();


            if (mensagem) {

                mensagem.textContent =
                    'Entrando...';
            }


            try {

                const resposta =
                    await fetch(
                        '/api/auth/login',
                        {
                            method:
                                'POST',

                            headers: {
                                'Content-Type':
                                    'application/json'
                            },

                            body:
                                JSON.stringify({
                                    email:
                                        email.value
                                            .trim(),

                                    senha:
                                        senha.value
                                })
                        }
                    );


                const dados =
                    await resposta.json();


                if (!resposta.ok) {

                    throw new Error(
                        dados.erro
                        ||
                        'Não foi possível realizar o login.'
                    );
                }


                if (
                    dados.usuario?.perfil !==
                    'vendedor'
                ) {

                    throw new Error(
                        'Este acesso é exclusivo para vendedores.'
                    );
                }


                localStorage.setItem(
                    'dde_vendedor_token',
                    dados.token
                );


                localStorage.setItem(
                    'dde_vendedor_usuario',
                    JSON.stringify(
                        dados.usuario
                    )
                );


                window.location.replace(
                    '/vendedor/site.html'
                );


            } catch (erro) {

                if (mensagem) {

                    mensagem.textContent =
                        erro.message;


                    mensagem.style.color =
                        '#c93636';
                }
            }
        }
    );
});
