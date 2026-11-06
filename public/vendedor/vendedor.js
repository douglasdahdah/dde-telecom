(() => {

    const token =
        localStorage.getItem(
            'dde_vendedor_token'
        );


    const fetchOriginal =
        window.fetch.bind(
            window
        );


    function sair() {

        localStorage.removeItem(
            'dde_vendedor_token'
        );


        localStorage.removeItem(
            'dde_vendedor_usuario'
        );


        window.location.replace(
            '/vendedor/'
        );
    }


    if (!token) {

        sair();

        return;
    }


    document
        .getElementById(
            'sair-vendedor'
        )
        ?.addEventListener(
            'click',
            sair
        );


    window.fetch =
        function(
            input,
            init = {}
        ) {

            const url =
                typeof input ===
                'string'
                    ? input
                    : input.url;


            const metodo =
                String(
                    init.method
                    ||
                    (
                        typeof input ===
                        'string'
                            ? 'GET'
                            : input.method
                    )
                    ||
                    'GET'
                )
                .toUpperCase();


            if (
                url === '/api/leads'
                &&
                metodo === 'POST'
            ) {

                const headers =
                    new Headers(
                        init.headers
                        ||
                        {}
                    );


                headers.set(
                    'Authorization',
                    'Bearer '
                    +
                    token
                );


                return fetchOriginal(
                    '/api/vendedor/leads',
                    {
                        ...init,
                        headers
                    }
                );
            }


            return fetchOriginal(
                input,
                init
            );
        };


    (
        async () => {

            try {

                const resposta =
                    await fetchOriginal(
                        '/api/vendedor/me',
                        {
                            headers: {
                                Authorization:
                                    'Bearer '
                                    +
                                    token
                            }
                        }
                    );


                if (!resposta.ok) {

                    sair();

                    return;
                }


                const dados =
                    await resposta.json();


                if (
                    dados.usuario?.perfil !==
                    'vendedor'
                ) {

                    sair();

                    return;
                }


                localStorage.setItem(
                    'dde_vendedor_usuario',
                    JSON.stringify(
                        dados.usuario
                    )
                );


                const nome =
                    document.getElementById(
                        'nome-vendedor-logado'
                    )
                    ||
                    document.getElementById(
                        'vendor-user-name'
                    );


                if (nome) {

                    nome.textContent =
                        dados.usuario.nome;
                }


            } catch {

                sair();
            }

        }
    )();

})();