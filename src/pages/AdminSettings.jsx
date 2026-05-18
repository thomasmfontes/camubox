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
    XCircle,
    Users,
    ChevronRight
} from 'lucide-react';
import Toast from '../components/Toast';
import LockerGuideModal from '../components/LockerGuideModal';

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

    const [leagues, setLeagues] = useState([]);
    const [newLeagueName, setNewLeagueName] = useState('');
    const [newLeaguePhone, setNewLeaguePhone] = useState('');
    const [isLoadingLeagues, setIsLoadingLeagues] = useState(false);
    const [isLeaguesModalOpen, setIsLeaguesModalOpen] = useState(false);
    const [isAdminModalOpen, setIsAdminModalOpen] = useState(false);

    const [isLoading, setIsLoading] = useState(true);

    // Modal State
    const [modalConfig, setModalConfig] = useState({ 
        isOpen: false, 
        title: '', 
        message: '', 
        type: 'confirm', 
        onConfirm: null 
    });

    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
    };

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

    const fetchLeagues = async () => {
        setIsLoadingLeagues(true);
        const { data, error } = await dbService.leagues.getAll();
        console.log('[DEBUG] Leagues raw data:', data);
        if (!error && data) {
            setLeagues(data.map(l => {
                // Handle both object and array response from Supabase Join
                const user = Array.isArray(l.t_usuario) ? l.t_usuario[0] : l.t_usuario;
                return {
                    id: l.id_liga,
                    name: l.nm_liga,
                    phone: l.nr_telefone || user?.nr_celular || 'Sem Telefone'
                };
            }));
        }
        setIsLoadingLeagues(false);
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
        fetchLeagues();
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
                showToast(`O e-mail ${email} ainda não está cadastrado no sistema.`, 'error');
                return;
            }

            // 2. Se existis, atualiza o status
            const { error: updateError } = await dbService.users.updateAdminStatus(email, true);
            
            if (!updateError) {
                setNewAdminEmail('');
                await fetchAdmins();
                showToast('Novo administrador adicionado com sucesso!');
            } else {
                throw updateError;
            }
        } catch (err) {
            showToast('Erro ao adicionar administrador: ' + err.message, 'error');
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
                        showToast('Acesso administrativo removido com sucesso!');
                    } else {
                        throw error;
                    }
                } catch (err) {
                    showToast('Erro ao remover acesso: ' + err.message, 'error');
                } finally {
                    setIsLoadingAdmins(false);
                }
            }
        });
    };

    const handleAddLeague = async () => {
        const name = newLeagueName.trim();
        const phone = newLeaguePhone.trim();
        
        if (!name) return;

        setIsLoadingLeagues(true);
        try {
            // Criar a liga com telefone próprio e sem presidente
            const { error: createError } = await dbService.leagues.create(name, null, phone);
            
            if (!createError) {
                setNewLeagueName('');
                setNewLeaguePhone('');
                await fetchLeagues();
                showToast(`Liga "${name}" criada com sucesso!`);
            } else {
                throw createError;
            }
        } catch (err) {
            showToast('Erro ao criar liga: ' + err.message, 'error');
        } finally {
            setIsLoadingLeagues(false);
        }
    };

    const handleDeleteLeague = async (id, name) => {
        showModal({
            title: 'Confirmar Exclusão',
            message: `Tem certeza que deseja excluir a liga "${name}"?`,
            type: 'confirm',
            onConfirm: async () => {
                setIsLoadingLeagues(true);
                try {
                    const { error } = await dbService.leagues.delete(id);
                    if (!error) {
                        await fetchLeagues();
                        showToast('Liga removida com sucesso!');
                    } else {
                        throw error;
                    }
                } catch (err) {
                    showToast('Erro ao remover liga: ' + err.message, 'error');
                } finally {
                    setIsLoadingLeagues(false);
                }
            }
        });
    };

    const handleSave = async (sectionLabel) => {
        setIsLoading(true);
        const { error } = await dbService.settings.update(config);
        if (!error) {
            showToast(`Configurações de ${sectionLabel} salvas com sucesso!`);
        } else {
            showToast(`Erro ao salvar: ${error.message}`, 'error');
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
                            <button className="integrated-add-btn" style={{ width: '100%', height: '48px', marginTop: '1rem', borderRadius: '12px' }} onClick={() => handleSave('Valores')}>
                                <Save size={18} />
                                <span>Salvar Valores</span>
                            </button>
                        </div>
                    </section>

                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper primary">
                                    <Users size={20} />
                                </span>
                                <h3>Ligas Acadêmicas</h3>
                            </div>
                        </div>

                        <div className="card-content-premium">
                            <div className="leagues-summary-card">
                                <div className="summary-info">
                                    <label>Total de Ligas</label>
                                    <p><strong>{leagues.length}</strong></p>
                                </div>
                                <button className="btn-view-leagues" onClick={() => setIsLeaguesModalOpen(true)}>
                                    Ver Todas <ChevronRight size={16} />
                                </button>
                            </div>

                            <div className="premium-form-section" style={{ borderTop: '1px solid rgba(0, 61, 43, 0.05)', paddingTop: '2rem' }}>
                                <h4 className="section-subtitle-premium">Cadastrar Nova Liga</h4>
                                
                                <div className="premium-form-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                                    <div className="settings-field">
                                        <label>Nome da Liga Acadêmica</label>
                                        <div className="premium-input-box" style={{ paddingLeft: '1rem' }}>
                                            <input
                                                type="text"
                                                placeholder="Ex: Liga de Anatomia Aplicada..."
                                                value={newLeagueName}
                                                onChange={e => setNewLeagueName(e.target.value)}
                                                className="premium-form-input"
                                                style={{ background: 'transparent', border: 'none', width: '100%', height: '48px', outline: 'none', color: 'var(--text-main)', fontSize: '0.95rem' }}
                                            />
                                        </div>
                                    </div>



                                    <div className="settings-field">
                                        <label>Contato (Telefone / WhatsApp)</label>
                                        <div className="integrated-input-group" style={{ width: '100%', height: '52px' }}>
                                            <input
                                                type="text"
                                                placeholder="Ex: (11) 99999-9999"
                                                value={newLeaguePhone}
                                                onChange={e => setNewLeaguePhone(e.target.value)}
                                                onKeyPress={e => e.key === 'Enter' && handleAddLeague()}
                                                style={{ fontSize: '0.95rem' }}
                                            />
                                            <button 
                                                className="integrated-add-btn" 
                                                onClick={handleAddLeague} 
                                                disabled={isLoadingLeagues || !newLeagueName.trim()}
                                            >
                                                {isLoadingLeagues ? <div className="spinner-mini-white"></div> : <><Plus size={18} /> <span className="btn-label-desktop" style={{ marginLeft: '6px' }}>Cadastrar</span></>}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </section>

                    {/* CARD 4: Administradores */}
                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper grey">
                                    <Shield size={20} />
                                </span>
                                <h3>Equipe Administrativa</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <div className="leagues-summary-card">
                                <div className="summary-info">
                                    <label>Total de Administradores</label>
                                    <p><strong>{admins.length}</strong></p>
                                </div>
                                <button className="btn-view-leagues" onClick={() => setIsAdminModalOpen(true)}>
                                    Ver Todos <ChevronRight size={16} />
                                </button>
                            </div>

                            <div className="premium-form-section" style={{ marginTop: '2rem', borderTop: '1px solid rgba(0, 61, 43, 0.05)', paddingTop: '1.5rem' }}>
                                <h4 className="section-subtitle-premium">Convidar Administrador</h4>
                                <div className="settings-field">
                                    <label>Novo Administrador (E-mail)</label>
                                    <div className="integrated-input-group" style={{ width: '100%', height: '52px' }}>
                                        <input
                                            type="email"
                                            placeholder="E-mail do novo administrador..."
                                            value={newAdminEmail}
                                            onChange={e => setNewAdminEmail(e.target.value)}
                                            onKeyPress={e => e.key === 'Enter' && handleAddAdmin()}
                                            style={{ fontSize: '0.95rem' }}
                                        />
                                        <button 
                                            className="integrated-add-btn" 
                                            onClick={handleAddAdmin} 
                                            disabled={isLoadingAdmins || !newAdminEmail.trim()}
                                        >
                                            {isLoadingAdmins ? <div className="spinner-mini-white"></div> : <><Plus size={18} /> <span className="btn-label-desktop" style={{ marginLeft: '6px' }}>Adicionar</span></>}
                                        </button>
                                    </div>
                                    <p className="field-hint" style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '8px', paddingLeft: '4px' }}>
                                        O usuário receberá permissões totais de acesso ao painel admin.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </section>


                    {/* CARD 5: Contrato */}
                    <section className="settings-modern-card glass">
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

            <LockerGuideModal 
                isOpen={isLeaguesModalOpen} 
                onClose={() => setIsLeaguesModalOpen(false)} 
                title="Ligas Acadêmicas"
            >
                <div className="leagues-modal-list">
                    {leagues.length > 0 ? (
                        leagues.map((league) => (
                            <div key={league.id} className="league-item-premium modal-item">
                                <div className="league-avatar">
                                    {league.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="league-info">
                                    <div className="league-name-row">
                                        <strong>{league.name}</strong>
                                    </div>
                                    <p>Contato: {league.phone}</p>
                                </div>
                                <button 
                                    className="btn-delete-league"
                                    onClick={() => handleDeleteLeague(league.id, league.name)}
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="empty-leagues modal-empty">
                            <Users size={48} />
                            <p>Nenhuma liga cadastrada.</p>
                        </div>
                    )}
                </div>
            </LockerGuideModal>

            <LockerGuideModal 
                isOpen={isAdminModalOpen} 
                onClose={() => setIsAdminModalOpen(false)} 
                title="Equipe Administrativa"
            >
                <div className="leagues-modal-list">
                    {admins.length > 0 ? (
                        admins.map((admin) => (
                            <div key={admin.email} className="league-item-premium modal-item">
                                <div className="league-avatar">
                                    {admin.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="league-info">
                                    <div className="league-name-row">
                                        <strong>{admin.name}</strong>
                                    </div>
                                    <p>{admin.email}</p>
                                </div>
                                <button 
                                    className="btn-delete-league" 
                                    onClick={() => handleDeleteAdmin(admin.email)}
                                    title="Remover Acesso"
                                >
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        ))
                    ) : (
                        <div className="empty-admin-list-premium modal-empty">
                            <Shield size={48} />
                            <p>Nenhum administrador cadastrado.</p>
                        </div>
                    )}
                </div>
            </LockerGuideModal>

            {/* Modal de Ação Customizado */}
            {modalConfig.isOpen && (
                <div className="action-modal-overlay">
                    <div className="action-modal-card">
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

            {toast && (
                <Toast 
                    message={toast.message} 
                    type={toast.type} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
    );
};

export default AdminSettings;
