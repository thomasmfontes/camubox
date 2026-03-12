import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { authService } from '../services/supabaseClient';

const AuthGoogleCallback = () => {
    const navigate = useNavigate();

    useEffect(() => {
        const handleCallback = async () => {
            // Google redireciona com o token no hash (#id_token=...) ou query
            const params = new URLSearchParams(window.location.hash.replace('#', '?'));
            const idToken = params.get('id_token') || new URLSearchParams(window.location.search).get('id_token');

            if (idToken) {
                try {
                    const { data, error } = await authService.loginWithGoogleToken(idToken);
                    if (error) throw error;
                    
                    if (data?.user) {
                        localStorage.setItem('camubox_user', JSON.stringify(data.user));
                        // Redireciona para o dashboard - o App.jsx vai ler do localStorage no próximo "tick" ou reload
                        // Para forçar a atualização sem reload, poderíamos usar um context ou disparar um evento customizado
                        window.location.href = '/dashboard';
                    }
                } catch (err) {
                    console.error('Erro ao processar callback do Google:', err);
                    navigate('/?error=auth_failed');
                }
            } else {
                console.warn('Nenhum token encontrado no callback.');
                navigate('/');
            }
        };

        handleCallback();
    }, [navigate]);

    return (
        <div className="legal-container">
            <div className="legal-card" style={{ textAlign: 'center' }}>
                <div className="loader-mini" style={{ margin: '0 auto 1.5rem', width: '40px', height: '40px' }}></div>
                <h2>Autenticando com Google...</h2>
                <p>Por favor, aguarde enquanto validamos sua sessão.</p>
            </div>
        </div>
    );
};

export default AuthGoogleCallback;
