import { useState, useEffect } from 'react';
import { dbService } from '../services/supabaseClient';
import {
    Save,
    Shield,
    FileText,
    DollarSign,
    Settings as SettingsIcon,
    Plus,
    Trash2,
    AlertCircle,
    AlertTriangle,
    CheckCircle2,
    XCircle
} from 'lucide-react';
import { authService } from '../services/supabaseClient';
import './AdminSettings.css';

const AdminSettings = () => {
    const [config, setConfig] = useState({
        vl_pequeno_semestral: 0,
        vl_pequeno_anual: 0,
        vl_grande_semestral: 0,
        vl_grande_anual: 0,
        vl_taxa_troca: 20,
        nm_texto_contrato: ''
    });

    const [admins, setAdmins] = useState([]);
    const [newAdminEmail, setNewAdminEmail] = useState('');
    const [isLoadingAdmins, setIsLoadingAdmins] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    // Modal State
    const [modalConfig, setModalConfig] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        type: 'confirm', 
        onConfirm: null 
    });

    const showModal = (config) => {
        setModalConfig({
            isOpen: true,
            title: config.title || 'Confirmação',
            message: config.message || '',
            type: config.type || 'confirm',
            onConfirm: config.onConfirm || null
        });
    };

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    const fetchAdmins = async () => {
        setIsLoadingAdmins(true);
        const { data, error } = await dbService.users.getAdmins();
        if (!error && data) {
            setAdmins(data.map(u => ({
                name: u.nm_usuario || 'Usuário',
                email: u.dc_email,
                role: 'Admin', // Default role for now
                id_usuario: u.id_usuario
            })));
        }
        setIsLoadingAdmins(false);
    };

    useEffect(() => {
        const fetchConfig = async () => {
            setIsLoading(true);
            const { data, error } = await dbService.settings.get();
            if (!error && data) {
                setConfig(prev => ({ ...prev, ...data }));
            }
            setIsLoading(false);
        };

        fetchConfig();
        fetchAdmins();
    }, []);

    const handleAddAdmin = async () => {
        const email = newAdminEmail.trim();
        if (!email) return;

        // Validar formato de e-mail
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showModal({
                title: 'E-mail Inválido',
                message: 'Por favor, insira um endereço de e-mail válido para continuar.',
                type: 'error'
            });
            return;
        }

        setIsLoadingAdmins(true);
        try {
            // 1. Primeiro vamos verificar se o usuário existe no sistema
            const { data: user, error: fetchError } = await dbService.users.getByEmail(email);
            
            if (fetchError || !user) {
                showModal({
                    title: 'Usuário não Encontrado',
                    message: `O e-mail ${email} ainda não está cadastrado no sistema. O usuário precisa fazer login pelo menos uma vez antes de ser promovido a admin.`,
                    type: 'error'
                });
                return;
            }

            // 2. Se existis, atualiza o status
            const { error: updateError } = await dbService.users.updateAdminStatus(email, true);
            
            if (!updateError) {
                setNewAdminEmail('');
                await fetchAdmins();
                showModal({
                    title: 'Sucesso!',
                    message: 'Novo administrador adicionado com sucesso.',
                    type: 'success'
                });
            } else {
                throw updateError;
            }
        } catch (err) {
            showModal({
                title: 'Erro',
                message: 'Não foi possível adicionar o administrador: ' + err.message,
                type: 'error'
            });
        } finally {
            setIsLoadingAdmins(false);
        }
    };

    const handleDeleteAdmin = async (email) => {
        showModal({
            title: 'Confirmar Remoção',
            message: `Tem certeza que deseja remover o acesso administrativo de ${email}?`,
            type: 'confirm',
            onConfirm: async () => {
                setIsLoadingAdmins(true);
                try {
                    const { error } = await dbService.users.updateAdminStatus(email, false);
                    if (!error) {
                        setAdmins(prev => prev.filter(a => a.email !== email));
                        showModal({
                            title: 'Sucesso!',
                            message: 'Acesso administrativo removido com sucesso.',
                            type: 'success'
                        });
                    } else {
                        throw error;
                    }
                } catch (err) {
                    showModal({
                        title: 'Erro',
                        message: 'Erro ao remover acesso: ' + err.message,
                        type: 'error'
                    });
                } finally {
                    setIsLoadingAdmins(false);
                }
            }
        });
    };

    const handleSave = async (sectionLabel) => {
        setIsLoading(true);
        const { error } = await dbService.settings.update(config);
        if (!error) {
            showModal({
                title: 'Sucesso!',
                message: `Configurações de ${sectionLabel} salvas com sucesso!`,
                type: 'success'
            });
        } else {
            showModal({
                title: 'Erro ao Salvar',
                message: `Erro ao salvar: ${error.message}`,
                type: 'error'
            });
        }
        setIsLoading(false);
    };

    const updateConfig = (field, value) => {
        setConfig(prev => ({ ...prev, [field]: value }));
    };

    return (
        <div className="admin-settings-container">
            <header className="page-header">
                <div className="header-text">
                    <h1>Configurações do Sistema</h1>
                    <p>Controle de taxas, regras de negócio e acessos administrativos.</p>
                </div>
            </header>

            {isLoading ? (
                <div className="loading-state-wrapper">
                    <div className="loading-spinner"></div>
                    <span>Sincronizando configurações...</span>
                </div>
            ) : (
                <div className="settings-modern-grid">
                    {/* CARD 1: Valores de Locação */}
                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper gold">
                                    <DollarSign size={20} />
                                </span>
                                <h3>Valores de Locação</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <div className="settings-input-row">
                                <div className="settings-field">
                                    <label>Armário Pequeno (Semestral)</label>
                                    <div className="premium-input-box">
                                        <span className="currency">R$</span>
                                        <input type="number" value={config.vl_pequeno_semestral} onChange={e => updateConfig('vl_pequeno_semestral', e.target.value)} />
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <label>Armário Pequeno (Anual)</label>
                                    <div className="premium-input-box">
                                        <span className="currency">R$</span>
                                        <input type="number" value={config.vl_pequeno_anual} onChange={e => updateConfig('vl_pequeno_anual', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                            <div className="settings-input-row">
                                <div className="settings-field">
                                    <label>Armário Grande (Semestral)</label>
                                    <div className="premium-input-box">
                                        <span className="currency">R$</span>
                                        <input type="number" value={config.vl_grande_semestral} onChange={e => updateConfig('vl_grande_semestral', e.target.value)} />
                                    </div>
                                </div>
                                <div className="settings-field">
                                    <label>Armário Grande (Anual)</label>
                                    <div className="premium-input-box">
                                        <span className="currency">R$</span>
                                        <input type="number" value={config.vl_grande_anual} onChange={e => updateConfig('vl_grande_anual', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                            <div className="settings-field">
                                <label>Taxa de Troca de Armário</label>
                                <div className="premium-input-box">
                                    <span className="currency">R$</span>
                                    <input type="number" value={config.vl_taxa_troca} onChange={e => updateConfig('vl_taxa_troca', e.target.value)} />
                                </div>
                            </div>
                            <button className="premium-save-btn" onClick={() => handleSave('Valores')}>
                                <Save size={18} />
                                <span>Salvar Valores</span>
                            </button>
                        </div>
                               </section>

                    {/* CARD 4: Administradores */}
                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper primary">
                                    <Shield size={20} />
                                </span>
                                <h3>Equipe Administrativa</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <div className="modern-admin-list">

                                    {isLoadingAdmins ? (
                                        <div 
                                            className="loading-admins-state"
                                        >
                                            <div className="spinner-mini-admin"></div>
                                            <span>Sincronizando equipe...</span>
                                        </div>
                                    ) : admins.length === 0 ? (
                                        <div 
                                            className="empty-admin-list-premium"
                                        >
                                            <div className="empty-icon-shield">
                                                <Shield size={32} />
                                            </div>
                                            <p>Nenhum administrador cadastrado.</p>
                                        </div>
                                    ) : (
                                        admins.map((admin) => (
                                            <div 
                                                key={admin.email}
                                                className="modern-admin-item-premium"
                                            >
                                                <div className="admin-avatar-premium">
                                                    {admin.name.charAt(0)}
                                                </div>
                                                <div className="admin-info-bundle">
                                                    <div className="admin-name-meta">
                                                        <strong>{admin.name}</strong>
                                                        <span className="admin-badge">Admin</span>
                                                    </div>
                                                    <span className="admin-email-secondary">{admin.email}</span>
                                                </div>
                                                <button 
                                                    className="remove-admin-control" 
                                                    onClick={() => handleDeleteAdmin(admin.email)}
                                                    title="Remover Acesso"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        ))
                                    )}

                            </div>

                            <div className="add-admin-premium-box">
                                <div className="integrated-input-group">
                                    <input
                                        type="email"
                                        placeholder="E-mail do novo administrador..."
                                        value={newAdminEmail}
                                        onChange={e => setNewAdminEmail(e.target.value)}
                                        onKeyPress={e => e.key === 'Enter' && handleAddAdmin()}
                                    />
                                    <button 
                                        className="integrated-add-btn" 
                                        onClick={handleAddAdmin} 
                                        disabled={isLoadingAdmins || !newAdminEmail.trim()}
                                    >
                                        {isLoadingAdmins ? (
                                            <div className="spinner-mini-white"></div>
                                        ) : (
                                            <>
                                                <Plus size={20} />
                                                <span className="btn-label-desktop">Adicionar</span>
                                            </>
                                        )}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </section>


                    {/* CARD 5: Contrato */}
                    <section className="settings-modern-card glass full-width">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper gold">
                                    <FileText size={20} />
                                </span>
                                <h3>Termos do Contrato Digital</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <div className="premium-info-alert">
                                <AlertCircle size={18} />
                                <p>Este texto é exibido e aceito digitalmente por todos os alunos antes do pagamento.</p>
                            </div>
                            <textarea
                                className="premium-textarea"
                                value={config.nm_texto_contrato || ''}
                                onChange={e => updateConfig('nm_texto_contrato', e.target.value)}
                                placeholder="Digite aqui os termos do contrato..."
                            />
                            <button className="premium-save-btn" onClick={() => handleSave('Contrato')}>
                                <Save size={18} />
                                <span>Salvar Contrato</span>
                            </button>
                        </div>
                    </section>
                </div>
            )}

            {/* Modal de Ação Customizado */}
                {modalConfig.isOpen && (
                    <div className="action-modal-overlay">
                        <div 
                            className="action-modal-card"
                        >
                            <div className={`modal-icon-container ${modalConfig.type}`}>
                                {modalConfig.type === 'confirm' && <AlertTriangle size={32} />}
                                {modalConfig.type === 'success' && <CheckCircle2 size={32} />}
                                {modalConfig.type === 'error' && <XCircle size={32} />}
                            </div>
                            
                            <h3>{modalConfig.title}</h3>
                            <p>{modalConfig.message}</p>
                            
                            <div className="modal-footer-actions">
                                {modalConfig.type === 'confirm' ? (
                                    <>
                                        <button className="modal-btn-cancel" onClick={closeModal}>Cancelar</button>
                                        <button className="modal-btn-confirm" onClick={() => {
                                            if (modalConfig.onConfirm) modalConfig.onConfirm();
                                            closeModal();
                                        }}>Confirmar</button>
                                    </>
                                ) : (
                                    <button className="modal-btn-primary" onClick={closeModal}>Entendido</button>
                                )}
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default AdminSettings;
