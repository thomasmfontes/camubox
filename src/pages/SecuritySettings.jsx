import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, Fingerprint, KeyRound, Pencil, Plus, RefreshCcw, ShieldCheck, Trash2 } from 'lucide-react';
import { biometricService } from '../services/biometricService';
import './SecuritySettings.css';

const formatDate = (value) => {
    if (!value) return 'Nunca utilizada';
    return new Date(value).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
};

const SecuritySettings = () => {
    const [passkeys, setPasskeys] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [busyId, setBusyId] = useState(null);
    const [error, setError] = useState('');
    const [success, setSuccess] = useState('');
    const isAvailable = biometricService.isLoginEnabled() && biometricService.isSupported();

    const loadPasskeys = useCallback(async () => {
        if (!isAvailable) {
            setIsLoading(false);
            return;
        }
        setError('');
        try {
            setPasskeys(await biometricService.list());
        } catch (loadError) {
            console.error('[Passkey] Failed to list credentials:', loadError);
            setError(loadError.message || 'Não foi possível carregar suas Passkeys.');
        } finally {
            setIsLoading(false);
        }
    }, [isAvailable]);

    useEffect(() => {
        loadPasskeys();
    }, [loadPasskeys]);

    const handleRegister = async () => {
        setBusyId('new');
        setError('');
        setSuccess('');
        try {
            await biometricService.register();
            await loadPasskeys();
            setSuccess('Nova Passkey cadastrada com sucesso.');
        } catch (registerError) {
            if (registerError.name !== 'NotAllowedError') {
                console.error('[Passkey] Registration failed:', registerError);
                setError(registerError.message || 'Não foi possível cadastrar a Passkey.');
            }
        } finally {
            setBusyId(null);
        }
    };

    const handleRename = async (passkey) => {
        const friendlyName = window.prompt('Nome deste dispositivo:', passkey.friendly_name || 'Meu dispositivo');
        if (!friendlyName?.trim()) return;
        setBusyId(passkey.id);
        setError('');
        setSuccess('');
        try {
            await biometricService.rename(passkey.id, friendlyName.trim());
            await loadPasskeys();
            setSuccess('Nome da Passkey atualizado.');
        } catch (renameError) {
            console.error('[Passkey] Rename failed:', renameError);
            setError(renameError.message || 'Não foi possível renomear a Passkey.');
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async (passkey) => {
        const name = passkey.friendly_name || 'este dispositivo';
        if (!window.confirm(`Remover a Passkey "${name}"? Este dispositivo deixará de entrar por biometria ou PIN.`)) return;
        setBusyId(passkey.id);
        setError('');
        setSuccess('');
        try {
            await biometricService.remove(passkey.id);
            setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
            setSuccess('Passkey removida com sucesso.');
        } catch (removeError) {
            console.error('[Passkey] Removal failed:', removeError);
            setError(removeError.message || 'Não foi possível remover a Passkey.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="security-settings-page">
            <header className="security-header">
                <div>
                    <span className="security-eyebrow"><ShieldCheck size={16} /> Conta e acesso</span>
                    <h1>Segurança</h1>
                    <p>Gerencie os dispositivos autorizados a entrar no CAMUBOX com biometria ou PIN.</p>
                </div>
                {isAvailable && (
                    <button className="security-primary-btn" onClick={handleRegister} disabled={busyId !== null}>
                        {busyId === 'new' ? <RefreshCcw className="spin" size={18} /> : <Plus size={18} />}
                        Adicionar Passkey
                    </button>
                )}
            </header>

            {!isAvailable && (
                <div className="security-notice warning">
                    <AlertCircle size={20} />
                    <div>
                        <strong>Passkeys disponíveis somente no site oficial</strong>
                        <span>Acesse https://camubox.com em um navegador compatível para cadastrar biometria ou PIN.</span>
                    </div>
                </div>
            )}
            {error && <div className="security-notice error"><AlertCircle size={20} /><span>{error}</span></div>}
            {success && <div className="security-notice success"><CheckCircle2 size={20} /><span>{success}</span></div>}

            <section className="security-card">
                <div className="security-card-heading">
                    <div className="security-icon"><Fingerprint size={24} /></div>
                    <div>
                        <h2>Suas Passkeys</h2>
                        <p>As chaves privadas permanecem protegidas no dispositivo ou no seu gerenciador de senhas.</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="security-empty"><RefreshCcw className="spin" size={28} /><span>Carregando dispositivos...</span></div>
                ) : passkeys.length === 0 ? (
                    <div className="security-empty">
                        <KeyRound size={34} />
                        <strong>Nenhuma Passkey cadastrada</strong>
                        <span>Cadastre um dispositivo para entrar sem precisar escolher outro provedor.</span>
                    </div>
                ) : (
                    <div className="passkey-list">
                        {passkeys.map((passkey) => (
                            <article className="passkey-item" key={passkey.id}>
                                <div className="passkey-symbol"><KeyRound size={21} /></div>
                                <div className="passkey-info">
                                    <strong>{passkey.friendly_name || 'Dispositivo sem nome'}</strong>
                                    <span>Cadastrada em {formatDate(passkey.created_at)}</span>
                                    <span>Último uso: {formatDate(passkey.last_used_at)}</span>
                                </div>
                                <div className="passkey-actions">
                                    <button title="Renomear" onClick={() => handleRename(passkey)} disabled={busyId !== null}><Pencil size={17} /></button>
                                    <button className="danger" title="Remover" onClick={() => handleRemove(passkey)} disabled={busyId !== null}>
                                        {busyId === passkey.id ? <RefreshCcw className="spin" size={17} /> : <Trash2 size={17} />}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

export default SecuritySettings;
