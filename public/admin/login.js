
document.addEventListener(
    'DOMContentLoaded',
    ()=>{

        const f=
            document.getElementById('f');

        const email=
            document.getElementById('email');

        const senha=
            document.getElementById('senha');

        const mostrar=
            document.getElementById('mostrar');

        const msg=
            document.getElementById('msg');


        mostrar.onclick=
            ()=>{

                const a=
                    senha.type==='text';

                senha.type=
                    a
                    ?
                    'password'
                    :
                    'text';

                mostrar.textContent=
                    a
                    ?
                    'Mostrar'
                    :
                    'Ocultar';
            };


        f.onsubmit=
            async e=>{

                e.preventDefault();

                msg.textContent=
                    'Entrando...';

                msg.style.color=
                    '#034b6d';


                try{

                    const r=
                        await fetch(
                            '/api/auth/login',
                            {
                                method:
                                    'POST',

                                headers:{
                                    'Content-Type':
                                        'application/json'
                                },

                                body:
                                    JSON.stringify({
                                        email:
                                            email.value.trim(),

                                        senha:
                                            senha.value
                                    })
                            }
                        );


                    const d=
                        await r.json();


                    if(!r.ok){

                        throw new Error(
                            d.erro
                            ||
                            'Falha no login.'
                        );
                    }


                    if(
                        d.usuario?.perfil!=='admin'
                    ){

                        throw new Error(
                            'Este acesso é exclusivo para administradores.'
                        );
                    }


                    localStorage.setItem(
                        'dde_admin_token',
                        d.token
                    );


                    localStorage.setItem(
                        'dde_admin_usuario',
                        JSON.stringify(
                            d.usuario
                        )
                    );


                    location.replace(
                        '/admin/'
                    );


                }catch(err){

                    msg.textContent=
                        err.message;

                    msg.style.color=
                        '#c93636';
                }
            };
    }
);
