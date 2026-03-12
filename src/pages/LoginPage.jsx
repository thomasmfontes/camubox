import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Shield, Lock, Users, UserPlus } from 'lucide-react';
import { FaApple } from 'react-icons/fa';
import { GoogleLogin } from '@react-oauth/google';
import { jwtDecode } from 'jwt-decode';
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

    const formatPhone = (value) => {
        const digits = value.replace(/\D/g, '').slice(0, 11);
        if (digits.length <= 2) return digits;
        if (digits.length <= 7) return `(${digits.slice(0,2)}) ${digits.slice(2)}`;
        return `(${digits.slice(0,2)}) ${digits.slice(2,7)}-${digits.slice(7)}`;
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

            await dbService.users.updateEmail(user.id_usuario, googleStep.email);
            onLogin({ id_usuario: user.id_usuario, name: user.nm_usuario, email: googleStep.email, isAdmin: false });
            navigate('/dashboard/lockers');
        } catch (err) {
            console.error('[PHONE SUBMIT ERROR]', err);
            setError('Erro ao verificar o celular. Tente novamente.');
            setIsGoogleLoading(false);
        }
    };

    // --- MANUAL APPLE LOGIN ---
    useEffect(() => {
        if (window.AppleID) {
            window.AppleID.auth.init({
                clientId: import.meta.env.VITE_APPLE_CLIENT_ID || 'com.chocolapp',
                scope: 'name email',
                redirectURI: window.location.origin + '/login', // Apple exige redirect ou popup. Usaremos Popup se possível.
                usePopup: true
            });
        }
    }, []);

    const handleAppleLogin = async () => {
        setError('');
        if (!window.AppleID) {
            setError('Serviço da Apple indisponível no momento. Recarregue a página.');
            return;
        }
        try {
            const response = await window.AppleID.auth.signIn();
            const idToken = response.authorization.id_token;
            const userData = response.user; // Só vem no primeiro login

            setIsGoogleLoading(true);
            const res = await fetch('/api/auth/apple', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: idToken, user_info: userData })
            });

            const result = await res.json();
            if (!res.ok) throw new Error(result.error || 'Erro na API da Apple');

            const { email, name } = result.user;
            const { data: existingUser } = await dbService.users.getByEmail(email);

            if (existingUser) {
                onLogin({ id_usuario: existingUser.id_usuario, name: existingUser.nm_usuario, email: existingUser.dc_email, isAdmin: false });
                navigate('/dashboard/lockers');
            } else {
                setGoogleStep({ email, name });
            }
        } catch (err) {
            console.error('[APPLE LOGIN ERROR]', err);
            setError('Falha ao autenticar com Apple ID.');
        } finally {
            setIsGoogleLoading(false);
        }
    };

    // Passo 1: Google autentica
    const handleGoogleSuccess = async (credentialResponse) => {
        setError('');
        try {
            const decoded = jwtDecode(credentialResponse.credential);
            const email = decoded.email;
            const name = decoded.name;
            const { data: existingUser } = await dbService.users.getByEmail(email);
            if (existingUser) {
                onLogin({ id_usuario: existingUser.id_usuario, name: existingUser.nm_usuario, email: existingUser.dc_email, isAdmin: false });
                navigate('/dashboard/lockers');
            } else {
                setGoogleStep({ email, name });
            }
        } catch (err) {
            console.error('[GOOGLE LOGIN ERROR]', err);
            setError('Erro ao processar login com Google. Tente novamente.');
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
            const { data: newUser, error: insertError } = await dbService.users.create({
                nm_usuario: registerName.trim(),
                dc_email: registerStep.email,
                nr_celular: phone,
            });
            if (insertError) throw insertError;
            onLogin({ id_usuario: newUser.id_usuario, name: newUser.nm_usuario, email: newUser.dc_email, isAdmin: false });
            navigate('/dashboard/lockers');
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
                                <div className="step-badge"><UserPlus size={12} /> Primeiro acesso</div>
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
                                        autoFocus
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
                                <div className="step-badge">Passo 2 de 2</div>
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
                                            autoFocus
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
                                <p>Acesse o portal com sua conta Google</p>
                            </div>

                            {error && <p className="login-error-msg">{error}</p>}

                            <div className="auth-buttons-group">
                                <div className="google-login-wrapper">
                                    <GoogleLogin
                                        onSuccess={handleGoogleSuccess}
                                        onError={() => setError('Login com Google falhou. Tente novamente.')}
                                        text="signin_with"
                                        shape="rectangular"
                                        logo_alignment="left"
                                    />
                                </div>

                                <button className="apple-login-btn" onClick={handleAppleLogin}>
                                    <FaApple size={20} />
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
