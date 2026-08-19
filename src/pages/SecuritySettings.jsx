import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Fingerprint, KeyRound, Pencil, Plus, RefreshCcw, Trash2, X } from 'lucide-react';
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
    const [activeModal, setActiveModal] = useState(null);
    const [friendlyName, setFriendlyName] = useState('');
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

    useEffect(() => {
        if (!activeModal) return undefined;

        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && busyId === null) {
                setActiveModal(null);
                setFriendlyName('');
            }
        };

        document.documentElement.classList.add('no-scroll');
        window.addEventListener('keydown', handleKeyDown);

        return () => {
            document.documentElement.classList.remove('no-scroll');
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeModal, busyId]);

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

    const openRenameModal = (passkey) => {
        setFriendlyName(passkey.friendly_name || 'Meu dispositivo');
        setActiveModal({ type: 'rename', passkey });
    };

    const openRemoveModal = (passkey) => {
        setActiveModal({ type: 'remove', passkey });
    };

    const closeModal = () => {
        if (busyId !== null) return;
        setActiveModal(null);
        setFriendlyName('');
    };

    const handleRename = async () => {
        const passkey = activeModal?.passkey;
        const nextName = friendlyName.trim();
        if (!passkey || !nextName) return;

        setBusyId(passkey.id);
        setError('');
        setSuccess('');
        try {
            await biometricService.rename(passkey.id, nextName);
            await loadPasskeys();
            setSuccess('Nome da Passkey atualizado.');
            setActiveModal(null);
            setFriendlyName('');
        } catch (renameError) {
            console.error('[Passkey] Rename failed:', renameError);
            setError(renameError.message || 'Não foi possível renomear a Passkey.');
        } finally {
            setBusyId(null);
        }
    };

    const handleRemove = async () => {
        const passkey = activeModal?.passkey;
        if (!passkey) return;

        setBusyId(passkey.id);
        setError('');
        setSuccess('');
        try {
            await biometricService.remove(passkey.id);
            setPasskeys((current) => current.filter((item) => item.id !== passkey.id));
            setSuccess('Passkey removida com sucesso.');
            setActiveModal(null);
        } catch (removeError) {
            console.error('[Passkey] Removal failed:', removeError);
            setError(removeError.message || 'Não foi possível remover a Passkey.');
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className="security-settings-page">
            <header className="page-header security-page-header">
                <div className="header-text">
                    <h1>Segurança</h1>
                    <p>Gerencie seus acessos por biometria ou PIN.</p>
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
                        <span>Abra esta página em <strong>camubox.com</strong> usando um navegador compatível.</span>
                    </div>
                </div>
            )}
            {error && <div className="security-notice error"><AlertCircle size={20} /><span>{error}</span></div>}
            {success && <div className="security-notice success"><CheckCircle2 size={20} /><span>{success}</span></div>}

            <section className="security-card glass">
                <div className="security-card-heading">
                    <div className="security-icon"><Fingerprint size={24} /></div>
                    <div>
                        <h2>Suas Passkeys</h2>
                        <p>Dispositivos autorizados para entrar sem usar outro provedor.</p>
                    </div>
                </div>

                {isLoading ? (
                    <div className="security-empty"><RefreshCcw className="spin" size={28} /><span>Carregando dispositivos...</span></div>
                ) : passkeys.length === 0 ? (
                    <div className="security-empty">
                        <KeyRound size={34} />
                        <strong>Nenhuma Passkey cadastrada</strong>
                        <span>Adicione uma Passkey para entrar com biometria ou PIN.</span>
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
                                    <button title="Renomear" onClick={() => openRenameModal(passkey)} disabled={busyId !== null}><Pencil size={17} /></button>
                                    <button className="danger" title="Remover" onClick={() => openRemoveModal(passkey)} disabled={busyId !== null}>
                                        {busyId === passkey.id ? <RefreshCcw className="spin" size={17} /> : <Trash2 size={17} />}
                                    </button>
                                </div>
                            </article>
                        ))}
                    </div>
                )}
            </section>

            {activeModal && (
                <div className="security-modal-overlay" onMouseDown={closeModal}>
                    <div
                        className="security-modal-card"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="security-modal-title"
                        onMouseDown={(event) => event.stopPropagation()}
                    >
                        <button className="security-modal-close" onClick={closeModal} disabled={busyId !== null} aria-label="Fechar modal">
                            <X size={20} />
                        </button>

                        <div className={`security-modal-icon ${activeModal.type === 'remove' ? 'danger' : ''}`}>
                            {activeModal.type === 'remove' ? <AlertTriangle size={30} /> : <Pencil size={28} />}
                        </div>

                        {activeModal.type === 'rename' ? (
                            <>
                                <h2 id="security-modal-title">Renomear dispositivo</h2>
                                <p>Use um nome fácil de reconhecer na sua lista de Passkeys.</p>
                                <label className="security-modal-field">
                                    <span>Nome do dispositivo</span>
                                    <input
                                        autoFocus
                                        type="text"
                                        value={friendlyName}
                                        maxLength={120}
                                        onChange={(event) => setFriendlyName(event.target.value)}
                                        onKeyDown={(event) => {
                                            if (event.key === 'Enter' && friendlyName.trim()) handleRename();
                                        }}
                                        placeholder="Ex.: Celular pessoal"
                                    />
                                </label>
                                <div className="security-modal-actions">
                                    <button className="secondary" onClick={closeModal} disabled={busyId !== null}>Cancelar</button>
                                    <button className="primary" onClick={handleRename} disabled={busyId !== null || !friendlyName.trim()}>
                                        {busyId !== null && <RefreshCcw className="spin" size={17} />}
                                        Salvar nome
                                    </button>
                                </div>
                            </>
                        ) : (
                            <>
                                <h2 id="security-modal-title">Remover Passkey?</h2>
                                <p>
                                    A Passkey <strong>{activeModal.passkey.friendly_name || 'deste dispositivo'}</strong> deixará de acessar sua conta com biometria ou PIN.
                                </p>
                                <div className="security-modal-actions">
                                    <button className="secondary" onClick={closeModal} disabled={busyId !== null}>Cancelar</button>
                                    <button className="danger" onClick={handleRemove} disabled={busyId !== null}>
                                        {busyId !== null && <RefreshCcw className="spin" size={17} />}
                                        Remover
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default SecuritySettings;
