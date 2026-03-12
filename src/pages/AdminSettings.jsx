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
    AlertCircle
} from 'lucide-react';
import './AdminSettings.css';

const AdminSettings = () => {
    const [rates, setRates] = useState({
        smallSemester: 0,
        smallAnnual: 0,
        largeSemester: 0,
        largeAnnual: 0,
        swapFee: 15
    });

    const [contract, setContract] = useState('');



    const [admins, setAdmins] = useState([
        { name: 'Thomas Ed', email: 'thomas@example.com', role: 'Super Admin' },
        { name: 'Admin CAMU', email: 'admin@camubox.com', role: 'Admin' }
    ]);
    const [newAdminEmail, setNewAdminEmail] = useState('');

    const [rules, setRules] = useState({
        expiryNoticeDays: 15,
        requireInspection: true,
        allowFreeRentals: true
    });

    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            setIsLoading(true);
            const { data, error } = await dbService.lockers.getConfig();
            if (!error && data) {
                setRates({
                    smallSemester: data.vl_pequeno_semestral,
                    smallAnnual: data.vl_pequeno_anual,
                    largeSemester: data.vl_grande_semestral,
                    largeAnnual: data.vl_grande_anual,
                    swapFee: 15.00
                });
                setContract(data.nm_texto_contrato || '');

            }
            setIsLoading(false);
        };
        fetchConfig();
    }, []);

    const handleSave = async (section) => {
        console.log(`Salvando seção: ${section}`);
        alert(`Configurações de ${section} salvas com sucesso!`);
    };

    return (
        <div className="admin-settings premium-theme">
            <header className="page-header">
                <div>
                    <h1>Configurações do Sistema</h1>
                    <p>Gerencie taxas, contratos, integrações e permissões do CAMUBOX.</p>
                </div>
            </header>

            {isLoading ? (
                <div className="loading-state">Carregando configurações...</div>
            ) : (
                <div className="settings-grid">
                    {/* CARD 1: Valores de Locação */}
                    <section className="settings-card card">
                        <div className="card-header">
                            <div className="title-group">
                                <DollarSign className="icon-primary" size={20} />
                                <h3>Valores de Locação</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="input-row">
                                <div className="input-group">
                                    <label>Armário Pequeno (Semestral)</label>
                                    <div className="input-with-prefix">
                                        <span>R$</span>
                                        <input type="number" value={rates.smallSemester} onChange={e => setRates({ ...rates, smallSemester: e.target.value })} />
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Armário Pequeno (Anual)</label>
                                    <div className="input-with-prefix">
                                        <span>R$</span>
                                        <input type="number" value={rates.smallAnnual} onChange={e => setRates({ ...rates, smallAnnual: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div className="input-row">
                                <div className="input-group">
                                    <label>Armário Grande (Semestral)</label>
                                    <div className="input-with-prefix">
                                        <span>R$</span>
                                        <input type="number" value={rates.largeSemester} onChange={e => setRates({ ...rates, largeSemester: e.target.value })} />
                                    </div>
                                </div>
                                <div className="input-group">
                                    <label>Armário Grande (Anual)</label>
                                    <div className="input-with-prefix">
                                        <span>R$</span>
                                        <input type="number" value={rates.largeAnnual} onChange={e => setRates({ ...rates, largeAnnual: e.target.value })} />
                                    </div>
                                </div>
                            </div>
                            <div className="input-group full">
                                <label>Taxa de Troca de Armário</label>
                                <div className="input-with-prefix">
                                    <span>R$</span>
                                    <input type="number" value={rates.swapFee} onChange={e => setRates({ ...rates, swapFee: e.target.value })} />
                                </div>
                            </div>
                            <button className="primary-btn save-btn" onClick={() => handleSave('Valores')}>
                                <Save size={18} /> Salvar valores
                            </button>
                        </div>
                    </section>

                    {/* CARD 5: Regras do Sistema (Movido para cima para layout melhor) */}
                    <section className="settings-card card">
                        <div className="card-header">
                            <div className="title-group">
                                <SettingsIcon className="icon-primary" size={20} />
                                <h3>Regras do Sistema</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="input-group full">
                                <label>Prazo para aviso de vencimento (dias)</label>
                                <input type="number" value={rules.expiryNoticeDays} onChange={e => setRules({ ...rules, expiryNoticeDays: e.target.value })} />
                            </div>
                            <div className="toggle-group">
                                <div className="toggle-info">
                                    <strong>Exigir vistoria antes de liberar</strong>
                                    <p>O armário só fica disponível após confirmação do admin.</p>
                                </div>
                                <button
                                    className={`toggle-btn ${rules.requireInspection ? 'on' : ''}`}
                                    onClick={() => setRules({ ...rules, requireInspection: !rules.requireInspection })}
                                >
                                    <div className="toggle-slider"></div>
                                </button>
                            </div>
                            <div className="toggle-group">
                                <div className="toggle-info">
                                    <strong>Permitir locações gratuitas</strong>
                                    <p>Habilita a opção de aplicar gratuidade no painel lateral.</p>
                                </div>
                                <button
                                    className={`toggle-btn ${rules.allowFreeRentals ? 'on' : ''}`}
                                    onClick={() => setRules({ ...rules, allowFreeRentals: !rules.allowFreeRentals })}
                                >
                                    <div className="toggle-slider"></div>
                                </button>
                            </div>
                            <button className="primary-btn save-btn" onClick={() => handleSave('Regras')}>
                                <Save size={18} /> Salvar configurações
                            </button>
                        </div>
                    </section>

                    {/* CARD 2: Contrato de Locação */}
                    <section className="settings-card card full-width">
                        <div className="card-header">
                            <div className="title-group">
                                <FileText className="icon-primary" size={20} />
                                <h3>Contrato de Locação</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <p className="helper-text">
                                Este contrato será exibido para o usuário antes da confirmação da locação.
                                O usuário deverá aceitar os termos para continuar.
                            </p>
                            <textarea
                                className="contract-editor"
                                value={contract}
                                onChange={e => setContract(e.target.value)}
                                rows={10}
                            />
                            <button className="primary-btn save-btn" onClick={() => handleSave('Contrato')}>
                                <Save size={18} /> Salvar contrato
                            </button>
                        </div>
                    </section>



                    {/* CARD 4: Administradores */}
                    <section className="settings-card card">
                        <div className="card-header">
                            <div className="title-group">
                                <Shield className="icon-primary" size={20} />
                                <h3>Administradores</h3>
                            </div>
                        </div>
                        <div className="card-body">
                            <div className="admin-list">
                                {admins.map((admin, idx) => (
                                    <div key={idx} className="admin-item">
                                        <div className="admin-info">
                                            <strong>{admin.name}</strong>
                                            <span>{admin.email}</span>
                                        </div>
                                        <div className="admin-actions">
                                            <span className={`role-tag ${admin.role.toLowerCase().replace(' ', '-')}`}>
                                                {admin.role}
                                            </span>
                                            <button className="icon-btn-danger">
                                                <Trash2 size={16} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="add-admin">
                                <input
                                    type="email"
                                    placeholder="E-mail do novo admin..."
                                    value={newAdminEmail}
                                    onChange={e => setNewAdminEmail(e.target.value)}
                                />
                                <button className="primary-btn">
                                    <Plus size={18} /> Adicionar
                                </button>
                            </div>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
};

export default AdminSettings;
