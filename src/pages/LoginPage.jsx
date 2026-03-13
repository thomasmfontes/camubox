import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Shield, Lock, Users, UserPlus, Apple } from 'lucide-react';
import { useGoogleLogin } from '@react-oauth/google';
import { dbService, authService } from '../services/supabaseClient';
import './LoginPage.css';

const LoginPage = ({ onLogin }) => {
    const navigate = useNavigate();
    const [error, setError] = useState('');

    // Passo 1 → Google auth
    const [googleStep, setGoogleStep] = useState(null); // { email, name }

    // Passo 2 → celular
    const [phoneInput, setPhoneInput] = useState('');
    const [isGoogleLoading, setIsGoogleLoading] = useState(false);

    // Passo 3 → cadastro (celular não encontrado)
    const [registerStep, setRegisterStep] = useState(null); // { email, phone }
    const [registerName, setRegisterName] = useState('');
    const [registerPhone, setRegisterPhone] = useState('');
    const [isRegistering, setIsRegistering] = useState(false);
    const [isAppleLoading, setIsAppleLoading] = useState(false);
    const [isGoogleLoadingStep1, setIsGoogleLoadingStep1] = useState(false);

    // Detect Supabase session (specifically for OAuth like Apple)
    useState(() => {
        const checkSession = async () => {
            const { data: { session } } = await authService.getSession();
            if (session?.user) {
                const user = session.user;
                const { data: existingUser } = await dbService.users.getByEmail(user.email);
                if (existingUser) {
                    const isAdmin = !!existingUser.is_adm;
                    onLogin({ 
                        id_usuario: existingUser.id_usuario, 
                        name: existingUser.nm_usuario, 
                        email: existingUser.dc_email, 
                        isAdmin 
                    });
                    navigate(isAdmin ? '/dashboard/admin' : '/dashboard/lockers');
                } else {
                    // Se não existe, vai para passo 2/3
                    setGoogleStep({ 
                        email: user.email, 
                        name: user.user_metadata?.full_name || user.email.split('@')[0] 
                    });
                }
            }
        };
        checkSession();
    }, []);

    const formatPhone = (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
        return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
    };

    const handleGoogleLogin = useGoogleLogin({
        onSuccess: async (tokenResponse) => {
            setError('');
            setIsGoogleLoadingStep1(true);
            try {
                // Fetch user info from Google
                const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
                    headers: { Authorization: `Bearer ${tokenResponse.access_token}` },
                });
                if (!userInfoRes.ok) throw new Error('Falha ao obter dados do Google');
                
                const userInfo = await userInfoRes.json();
                const email = userInfo.email;
                const name = userInfo.name;
                
                const { data: existingUser } = await dbService.users.getByEmail(email);
                if (existingUser) {
                    const isAdmin = !!existingUser.is_adm;
                    onLogin({ 
                        id_usuario: existingUser.id_usuario, 
                        name: existingUser.nm_usuario, 
                        email: existingUser.dc_email, 
                        isAdmin 
                    });
                    navigate(isAdmin ? '/dashboard/admin' : '/dashboard/lockers');
                } else {
                    setGoogleStep({ email, name });
                }
            } catch (err) {
                console.error('[GOOGLE LOGIN ERROR]', err);
                setError('Erro ao processar login com Google. Tente novamente.');
            } finally {
                setIsGoogleLoadingStep1(false);
            }
        },
        onError: () => {
            setError('Login com Google falhou. Tente novamente.');
        }
    });

    const handleAppleLogin = async () => {
        setError('');
        setIsAppleLoading(true);
        try {
            const { error } = await authService.loginWithApple();
            if (error) throw error;
            // O redirecionamento acontece via Supabase
        } catch (err) {
            console.error('[APPLE LOGIN ERROR]', err);
            setError('Erro ao iniciar login com Apple. Tente novamente.');
            setIsAppleLoading(false);
        }
    };

    // Passo 2: Verifica celular
    const handlePhoneSubmit = async (e) => {
        e.preventDefault();
        if (!phoneInput.trim() || !googleStep) return;
        setIsGoogleLoading(true);
        setError('');
        try {
            const phone = phoneInput.replace(/\D/g, '');
            const { data: user, error: fetchError } = await dbService.users.getByPhone(phone);
            if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

            if (!user) {
                // Celular não existe → vai para cadastro
                setRegisterStep({ email: googleStep.email });
                setRegisterName(googleStep.name);
                setRegisterPhone(phoneInput);
                setGoogleStep(null);
                setIsGoogleLoading(false);
                return;
            }

            // SEGURANÇA: Verificamos se esse celular já tem um e-mail diferente vinculado
            if (user.dc_email && user.dc_email.toLowerCase() !== googleStep.email.toLowerCase()) {
                setError('Este número de celular já está vinculado a outra conta Google.');
                setIsGoogleLoading(false);
                return;
            }

            // Se o usuário existir mas não tiver e-mail, ou se for o mesmo e-mail, vincula/loga
            await dbService.users.updateEmail(user.id_usuario, googleStep.email);
            const isAdmin = !!user.is_adm;
            onLogin({ 
                id_usuario: user.id_usuario, 
                name: user.nm_usuario, 
                email: googleStep.email, 
                isAdmin 
            });
            navigate(isAdmin ? '/dashboard/admin' : '/dashboard/lockers');
        } catch (err) {
            console.error('[PHONE SUBMIT ERROR]', err);
            setError('Erro ao verificar o celular. Tente novamente.');
            setIsGoogleLoading(false);
        }
    };

    // Passo 3: Cadastro novo usuário
    const handleRegisterSubmit = async (e) => {
        e.preventDefault();
        if (!registerName.trim() || !registerPhone.trim() || !registerStep) return;
        setIsRegistering(true);
        setError('');
        try {
            const phone = registerPhone.replace(/\D/g, '');
            
            // SEGURANÇA: Verificar se o celular já foi cadastrado por outra pessoa nesse meio tempo
            const { data: existingUser } = await dbService.users.getByPhone(phone);
            if (existingUser) {
                setError('Este número de celular já está em uso. Tente outro número ou faça login.');
                setIsRegistering(false);
                return;
            }

            const { data: newUser, error: insertError } = await dbService.users.create({
                nm_usuario: registerName.trim(),
                dc_email: registerStep.email,
                nr_celular: phone,
            });
            if (insertError) throw insertError;
            const isAdmin = !!newUser.is_adm;
            onLogin({ 
                id_usuario: newUser.id_usuario, 
                name: newUser.nm_usuario, 
                email: newUser.dc_email, 
                isAdmin 
            });
            navigate(isAdmin ? '/dashboard/admin' : '/dashboard/lockers');
        } catch (err) {
            console.error('[REGISTER ERROR]', err);
            setError('Erro ao criar cadastro. Tente novamente.');
            setIsRegistering(false);
        }
    };

    return (
        <div className="login-container">
            <div className="login-background">
                <div className="blob blob-1"></div>
                <div className="blob blob-2"></div>
                <div className="blob blob-3"></div>
            </div>

            {/* LEFT PANEL */}
            <div className="login-visual">
                <div className="visual-content">
                    <img src="/logo-CAMU.jpeg" alt="CAMU Logo" className="visual-logo-img" />
                    <h1>Gestão inteligente de armários acadêmicos.</h1>
                    <p>A plataforma completa para alunos e administração da CAMU.</p>
                    <div className="feature-list">
                        <div className="feature-item">
                            <div className="feature-icon"><Lock size={18} /></div>
                            <span>Armários protegidos e rastreados</span>
                        </div>
                        <div className="feature-item">
                            <div className="feature-icon"><Users size={18} /></div>
                            <span>Gestão completa de alunos</span>
                        </div>
                        <div className="feature-item">
                            <div className="feature-icon"><Shield size={18} /></div>
                            <span>Acesso seguro via Google</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="login-form-side">
                <div className="login-card-glass">

                    {/* PASSO 3: Cadastro */}
                    {registerStep ? (
                        <>
                            <div className="form-header">
                                <div className="step-badge">Primeiro acesso</div>
                                <h2>Criar seu cadastro</h2>
                                <p>Confirme seu nome e celular para concluir o cadastro.</p>
                            </div>

                            <form className="real-login-form" onSubmit={handleRegisterSubmit}>
                                <div className="input-group-premium">
                                    <input
                                        type="text"
                                        placeholder="Seu nome completo"
                                        value={registerName}
                                        onChange={(e) => setRegisterName(e.target.value)}
                                        required
                                    />
                                    <input
                                        type="tel"
                                        placeholder="(11) 99999-9999"
                                        value={registerPhone}
                                        onChange={(e) => setRegisterPhone(formatPhone(e.target.value))}
                                        required
                                    />
                                    <button type="submit" className="login-submit-btn" disabled={isRegistering}>
                                        {isRegistering ? <><span className="loader-mini"></span> Cadastrando...</> : <><UserPlus size={18} /> Criar conta e Entrar</>}
                                    </button>
                                </div>
                                {error && <p className="login-error-msg">{error}</p>}
                            </form>

                            <button className="back-btn" onClick={() => { setRegisterStep(null); setGoogleStep(null); setPhoneInput(''); setError(''); }}>
                                Voltar ao início
                            </button>
                        </>

                    ) : googleStep ? (
                        /* PASSO 2: Celular */
                        <>
                            <div className="form-header">
                                <div className="step-badge">Identidade</div>
                                <h2>Confirme sua identidade</h2>
                                <p>Olá, <strong>{googleStep.name}</strong>! Informe o celular cadastrado para vincular sua conta Google.</p>
                            </div>

                            <form className="real-login-form" onSubmit={handlePhoneSubmit}>
                                <div className="input-group-premium">
                                    <div className="input-wrapper">
                                        <input
                                            type="tel"
                                            placeholder="(11) 99999-9999"
                                            value={phoneInput}
                                            onChange={(e) => setPhoneInput(formatPhone(e.target.value))}
                                            required
                                        />
                                    </div>
                                    <button type="submit" className="login-submit-btn" disabled={isGoogleLoading}>
                                        {isGoogleLoading ? <><span className="loader-mini"></span> Verificando...</> : <><LogIn size={18} /> Confirmar e Entrar</>}
                                    </button>
                                </div>
                                {error && <p className="login-error-msg">{error}</p>}
                            </form>

                            <button className="back-btn" onClick={() => { setGoogleStep(null); setPhoneInput(''); setError(''); }}>
                                Voltar ao início
                            </button>
                        </>

                    ) : (
                        /* PASSO 1: Login Google */
                        <>
                            <div className="form-header">
                                <img src="/logo-CAMU.jpeg" alt="" className="card-logo-img" />
                                <h2>Bem-vindo ao CAMUBOX</h2>
                                <p>Acesse o portal com sua conta digital</p>
                            </div>

                            {error && <p className="login-error-msg">{error}</p>}

                            <div className="oauth-buttons-wrapper">
                                <button 
                                    className="google-login-btn-custom" 
                                    onClick={() => handleGoogleLogin()}
                                    disabled={isGoogleLoadingStep1}
                                >
                                    {isGoogleLoadingStep1 ? (
                                        <span className="loader-mini dark"></span>
                                    ) : (
                                        <svg width="18" height="18" viewBox="0 0 18 18">
                                            <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/>
                                            <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
                                            <path d="M3.964 10.706c-.18-.54-.282-1.117-.282-1.706 0-.588.102-1.166.282-1.706V4.962H.957C.347 6.178 0 7.551 0 9s.347 2.822.957 4.038l3.007-2.332z" fill="#FBBC05"/>
                                            <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.443 2.117.957 5.185l3.007 2.332C4.672 5.164 6.656 3.58 9 3.58z" fill="#EA4335"/>
                                        </svg>
                                    )}
                                    <span>Entrar com Google</span>
                                </button>

                                <div className="divider-premium">
                                    <span>ou</span>
                                </div>

                                <button 
                                    className="apple-login-btn" 
                                    onClick={handleAppleLogin}
                                    disabled={isAppleLoading}
                                >
                                    {isAppleLoading ? (
                                        <span className="loader-mini dark"></span>
                                    ) : (
                                        <svg viewBox="0 0 384 512" width="18" height="18" fill="currentColor">
                                            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
                                        </svg>
                                    )}
                                    <span>Entrar com Apple</span>
                                </button>
                            </div>
                        </>
                    )}

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
