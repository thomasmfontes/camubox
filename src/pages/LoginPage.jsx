import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { dbService, authService } from '../services/supabaseClient';
import './LoginPage.css';

const GoogleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-1 .67-2.28 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
        <path d="M5.84 14.09c-.22-.67-.35-1.39-.35-2.09s.13-1.42.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
);

const AppleIcon = () => (
    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="currentColor">
        <path d="M17.05 20.28c-.98.95-2.05.8-3.08.35-1.09-.46-2.09-.48-3.24 0-1.44.62-2.2.44-3.06-.35C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.78.89-.05 2.31-.83 3.65-.69 1.5.15 2.73.8 3.42 1.94-3.08 1.55-2.58 5.64.49 7.02-.6 1.48-1.41 2.95-2.64 3.92zM12.03 7.25c-.02-2.18 1.83-4.04 3.93-4.13.22 2.44-2.1 4.26-3.93 4.13z" />
    </svg>
);

const LoginPage = ({ onLogin }) => {
    const navigate = useNavigate();
    const [loginRole, setLoginRole] = useState('student'); // 'student' or 'admin'
    const [loginInput, setLoginInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isOAuthLoading, setIsOAuthLoading] = useState(false);
    const [error, setError] = useState('');

    const handleGoogleLogin = () => {
        setIsOAuthLoading(true);
        setError('');

        const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;
        const redirectUri = `${window.location.origin}/auth/google`;
        const scope = 'openid profile email';
        const responseType = 'id_token';
        const nonce = Math.random().toString(36).substring(2); // Idealmente usar algo mais seguro, mas para MVP serve

        const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=${responseType}&nonce=${nonce}`;

        window.location.href = authUrl;
    };

    const handleAppleLogin = async () => {
        setIsOAuthLoading(true);
        setError('');
        try {
            // Apple side still usually requires a redirect or a more complex popup setup
            // For now, let's keep the existing logic or warn about Apple complexity if needed.
            // But user wants local, so we trigger the redirect here if Apple SDK isn't easy.
            const { error: authError } = await authService.loginWithApple();
            if (authError) throw authError;
        } catch (err) {
            setError(`Erro ao iniciar login com Apple.`);
            console.error('[APPLE ERROR]', err);
            setIsOAuthLoading(false);
        }
    };

    const handleRealLogin = async (e) => {
        e.preventDefault();
        if (!loginInput.trim()) return;

        setIsLoading(true);
        setError('');

        try {
            const trimmedInput = loginInput.trim();
            const isNumeric = /^\d+$/.test(trimmedInput);

            // 1. Admin Login Path
            if (loginRole === 'admin') {
                let adminData = null;

                if (isNumeric) {
                    const { data } = await dbService.users.getById(parseInt(trimmedInput, 10));
                    adminData = data;
                } else if (trimmedInput.includes('@')) {
                    const { data } = await dbService.users.getByEmail(trimmedInput.toLowerCase());
                    adminData = data;
                }

                if (adminData) {
                    onLogin({
                        id_usuario: adminData.id_usuario,
                        name: adminData.nm_usuario,
                        isAdmin: true,
                        email: adminData.nm_email
                    });
                    navigate('/dashboard/admin');
                    return;
                }
                setError('Administrador não encontrado. Verifique seu E-mail ou ID.');
            }
            // 2. Student Login Path
            else {
                let studentData = null;

                if (isNumeric) {
                    const { data } = await dbService.students.getById(parseInt(trimmedInput, 10));
                    studentData = data;
                } else {
                    // Search by exact ID if it's not numeric but maybe we want to support something else?
                    // For now, let's keep it simple as per user request to remove RA.
                    const { data } = await dbService.students.getById(trimmedInput);
                    studentData = data;
                }

                if (studentData) {
                    onLogin({
                        id_usuario: studentData.id_usuario,
                        name: studentData.nm_usuario,
                        isAdmin: false
                    });
                    navigate('/dashboard/lockers');
                    return;
                }
                setError('Aluno não encontrado. Verifique seu ID.');
            }
        } catch (err) {
            setError('Erro ao conectar ao servidor. Tente novamente.');
            console.error('[LOGIN ERROR]', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleOAuthLogin = async (provider) => {
        setIsOAuthLoading(true);
        setError('');
        try {
            const { error: authError } = provider === 'google' 
                ? await authService.loginWithGoogle() 
                : await authService.loginWithApple();
            
            if (authError) throw authError;
            // Redirection happens automatically
        } catch (err) {
            setError(`Erro ao iniciar login com ${provider === 'google' ? 'Google' : 'Apple'}.`);
            console.error('[OAUTH ERROR]', err);
            setIsOAuthLoading(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-background">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            <div className="login-visual">
                <div className="visual-content">
                    <img src="/logo-CAMU.jpeg" alt="CAMU Logo" className="visual-logo-img" />
                    <h1>Gestão inteligente de armários acadêmicos.</h1>
                    <p>Experiência premium para alunos e administração.</p>
                </div>
            </div>

            <div className="login-form-side">
                <div className="login-card-glass">
                    <div className="form-header">
                        <img src="/logo-CAMU.jpeg" alt="" className="card-logo-img" />
                        <h2>Bem-vindo ao CAMUBOX</h2>
                        <p>Escolha seu perfil para acessar o portal</p>
                    </div>

                    <div className="role-selector-premium">
                        <button
                            className={`role-tab ${loginRole === 'student' ? 'active' : ''}`}
                            onClick={() => { setLoginRole('student'); setError(''); }}
                        >
                            Sou Aluno
                        </button>
                        <button
                            className={`role-tab ${loginRole === 'admin' ? 'active' : ''}`}
                            onClick={() => { setLoginRole('admin'); setError(''); }}
                        >
                            Sou Admin
                        </button>
                    </div>

                    <form className="real-login-form" onSubmit={handleRealLogin}>
                        <div className="input-group-premium">
                            <input
                                type="text"
                                placeholder={loginRole === 'student' ? "ID do Aluno" : "E-mail ou ID Admin"}
                                value={loginInput}
                                onChange={(e) => setLoginInput(e.target.value)}
                                required
                            />
                            <button type="submit" className="login-submit-btn" disabled={isLoading}>
                                {isLoading ? 'Verificando...' : 'Entrar no Portal'}
                                <LogIn size={18} />
                            </button>
                        </div>
                        {error && <p className="login-error-msg">{error}</p>}
                    </form>

                    <div className="divider">
                        <span>OU ACESSO RÁPIDO</span>
                    </div>

                    <div className="auth-buttons">
                        <button 
                            className="auth-btn google" 
                            onClick={handleGoogleLogin}
                            disabled={isLoading || isOAuthLoading}
                        >
                            {isOAuthLoading ? <div className="loader-mini"></div> : <GoogleIcon />}
                            <span>{isOAuthLoading ? 'Conectando...' : 'Entrar com Google'}</span>
                        </button>

                        <button 
                            className="auth-btn apple" 
                            onClick={handleAppleLogin}
                            disabled={isLoading || isOAuthLoading}
                        >
                            {isOAuthLoading ? <div className="loader-mini"></div> : <AppleIcon />}
                            <span>{isOAuthLoading ? 'Conectando...' : 'Entrar com Apple ID'}</span>
                        </button>
                    </div>

                    <footer className="login-footer">
                        <div className="footer-links">
                            <Link to="/privacidade">Privacidade</Link>
                            <span className="dot">•</span>
                            <Link to="/termos-de-uso">Termos de Uso</Link>
                        </div>
                        <p>&copy; 2026 CAMUBOX. Todos os direitos reservados.</p>
                    </footer>
                </div>
            </div>
        </div>
    );
};

export default LoginPage;
