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
    Bell
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
        nr_dias_aviso_vencimento: 7,
        is_exige_vistoria: true,
        is_permite_gratuidade: true,
        nm_texto_contrato: ''
    });

    const [admins, setAdmins] = useState([
        { name: 'Thomas Ed', email: 'thomas@example.com', role: 'Super Admin' },
        { name: 'Admin CAMU', email: 'admin@camubox.com', role: 'Admin' }
    ]);
    const [newAdminEmail, setNewAdminEmail] = useState('');

    const [isLoading, setIsLoading] = useState(true);

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
    }, []);

    const handleSave = async (sectionLabel) => {
        setIsLoading(true);
        const { error } = await dbService.settings.update(config);
        if (!error) {
            alert(`Configurações de ${sectionLabel} salvas com sucesso!`);
        } else {
            alert(`Erro ao salvar: ${error.message}`);
        }
        setIsLoading(false);
    };

    const handleTestPush = async () => {
        setIsLoading(true);
        try {
            const { data: { session } } = await authService.getSession();
            if (!session) throw new Error('Sessão não encontrada. Faça login novamente.');

            const response = await fetch('/api/fcm/send-test', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${session.access_token}`,
                    'Content-Type': 'application/json'
                }
            });

            const result = await response.json();
            if (response.ok) {
                alert('🚀 Sucesso! A notificação foi enviada para este dispositivo.');
            } else {
                alert(`❌ Erro: ${result.error || 'Falha ao enviar'}`);
            }
        } catch (err) {
            alert(`⚠️ Erro de conexão: ${err.message}`);
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

                    {/* CARD 2: Regras do Sistema */}
                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper primary">
                                    <AlertCircle size={20} />
                                </span>
                                <h3>Regras de Negócio</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <div className="settings-field">
                                <label>Aviso de vencimento (dias de antecedência)</label>
                                <div className="premium-input-box no-prefix">
                                    <input type="number" value={config.nr_dias_aviso_vencimento} onChange={e => updateConfig('nr_dias_aviso_vencimento', e.target.value)} />
                                </div>
                            </div>
                            
                            <div className="premium-toggle-card">
                                <div className="toggle-label-area">
                                    <strong>Vistoria Obrigatória</strong>
                                    <p>Exigir validação humana antes de liberar acesso.</p>
                                </div>
                                <button
                                    className={`modern-toggle ${config.is_exige_vistoria ? 'active' : ''}`}
                                    onClick={() => updateConfig('is_exige_vistoria', !config.is_exige_vistoria)}
                                >
                                    <div className="toggle-puck"></div>
                                </button>
                            </div>

                            <div className="premium-toggle-card">
                                <div className="toggle-label-area">
                                    <strong>Locações Gratuitas</strong>
                                    <p>Habilita o gerenciamento de gratuidade via Admin.</p>
                                </div>
                                <button
                                    className={`modern-toggle ${config.is_permite_gratuidade ? 'active' : ''}`}
                                    onClick={() => updateConfig('is_permite_gratuidade', !config.is_permite_gratuidade)}
                                >
                                    <div className="toggle-puck"></div>
                                </button>
                            </div>

                            <button className="premium-save-btn" onClick={() => handleSave('Regras')}>
                                <Save size={18} />
                                <span>Atualizar Regras</span>
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
                                {admins.map((admin, idx) => (
                                    <div key={idx} className="modern-admin-item">
                                        <div className="admin-avatar-tiny">
                                            {admin.name.charAt(0)}
                                        </div>
                                        <div className="admin-entry-details">
                                            <div className="admin-name-row">
                                                <strong>{admin.name}</strong>
                                                <span className={`admin-role-pill ${admin.role.toLowerCase().replace(' ', '-')}`}>
                                                    {admin.role}
                                                </span>
                                            </div>
                                            <span className="admin-email-text">{admin.email}</span>
                                        </div>
                                        <button className="delete-admin-btn" title="Remover Acesso">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                            <div className="add-admin-bundle">
                                <input
                                    type="email"
                                    placeholder="Adicionar e-mail..."
                                    value={newAdminEmail}
                                    onChange={e => setNewAdminEmail(e.target.value)}
                                />
                                <button className="add-pill-btn">
                                    <Plus size={20} />
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* CARD 5: Notificações de Teste */}
                    <section className="settings-modern-card glass">
                        <div className="card-header-premium">
                            <div className="header-title-bundle">
                                <span className="icon-wrapper primary pulse">
                                    <Bell size={20} />
                                </span>
                                <h3>Testar Notificações</h3>
                            </div>
                        </div>
                        <div className="card-content-premium">
                            <p className="settings-helper-text">
                                Verifique se as notificações push estão chegando corretamente neste dispositivo.
                            </p>
                            <button className="premium-test-btn" onClick={handleTestPush} disabled={isLoading}>
                                <Bell size={18} />
                                <span>Enviar Notificação de Teste</span>
                            </button>
                            <span className="test-badge-info">
                                Certifique-se de permitir notificações no navegador.
                            </span>
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
        </div>
    );
};

export default AdminSettings;
