import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Clock, RefreshCcw, Loader2, Sparkles, ChevronRight, AlertCircle, Info, Maximize2, Lock, ArrowLeftRight, Save, Edit3, Users, RotateCcw, Zap } from 'lucide-react';
import { GrUpgrade } from "react-icons/gr";
import { dbService } from '../services/supabaseClient';
import './UserMyLockers.css';
import PushNotificationPrompt from '../components/PushNotificationPrompt';

const UserMyLockers = ({ user }) => {
    const navigate = useNavigate();
    const [myLockers, setMyLockers] = useState([]);
    const [leagueLockers, setLeagueLockers] = useState([]);
    const [renewableLockers, setRenewableLockers] = useState([]);
    const [renewalPlans, setRenewalPlans] = useState({}); // { [id_locacao]: 'semestral' | 'anual' }
    const [isLoading, setIsLoading] = useState(true);
    const [viewPassword, setViewPassword] = useState(null);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [newPassValue, setNewPassValue] = useState('');
    const [isSavingPass, setIsSavingPass] = useState(false);
    const [confirmTerminate, setConfirmTerminate] = useState(null);
    const [isTerminating, setIsTerminating] = useState(false);
    const [settings, setSettings] = useState(null);

    const fetchData = useCallback(async () => {
        if (!user?.id_usuario) return;
        setIsLoading(true);
        try {
            const [rentalsRes, renewableRes, leaguesRes, settingsRes] = await Promise.all([
                dbService.rentals.getByUser(user.id_usuario),
                dbService.rentals.getRenewableByUser(user.id_usuario),
                dbService.leagues.getByPresident(user.id_usuario),
                dbService.settings.get()
            ]);

            if (!settingsRes.error) setSettings(settingsRes.data);

            // 1. Locações ativas
            if (!rentalsRes.error && rentalsRes.data) {
                const formatted = rentalsRes.data
                    .filter(r => r.id_status_locacao !== 3)
                    .map(r => {
                        const [sY, sM, sD] = r.dt_inicio.split('-').map(Number);
                        const start = new Date(sY, sM - 1, sD);

                        const [eY, eM, eD] = r.dt_termino.split('-').map(Number);
                        const expiry = new Date(eY, eM - 1, eD);

                        const today = new Date();
                        const diffTime = expiry - today;
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                        const totalTime = expiry - start;
                        const elapsedTime = today - start;
                        const progress = totalTime > 0 ? Math.max(0, Math.min(100, (elapsedTime / totalTime) * 100)) : 0;

                        const isActive = r.id_status_locacao === 1;
                        // Filtra fora contratos expirados naturalmente (já aparecem na seção de carência)
                        const isExpired = !isActive || diffDays <= 0;

                        return {
                            id: r.id_locacao,
                            id_armario: r.id_armario,
                            lockerNumber: (r.cd_armario || '---').toString().padStart(3, '0'),
                            floor: r.dc_andar || 'N/A',
                            position: r.nm_posicao || 'MÉDIO',
                            size: r.dc_tamanho || 'Pequeno',
                            id_tipo: r.id_tipo,
                            status: isActive ? 'ATIVA' : 'ENCERRADA',
                            validUntil: expiry.toLocaleDateString(),
                            daysLeft: diffDays > 0 ? diffDays : 0,
                            isExpired: isExpired,
                            rawExpiry: expiry,
                            progress: progress
                        };
                    });
                // Remove contratos que estão na seção de carência para não duplicar
                const renewableIds = new Set((renewableRes.data || []).map(r => r.id));
                setMyLockers(formatted.filter(l => !renewableIds.has(l.id)));
            }

            // 2. Contratos em carência (elegíveis para renovação)
            if (!renewableRes.error && renewableRes.data) {
                setRenewableLockers(renewableRes.data);
                // Inicializa plano padrão como 'semestral' para cada contrato renovável
                const defaultPlans = {};
                renewableRes.data.forEach(r => { defaultPlans[r.id] = 'semestral'; });
                setRenewalPlans(defaultPlans);
            }

            // 3. Armários de Ligas (presidentes)
            const { data: userLeagues } = leaguesRes;
            if (userLeagues && userLeagues.length > 0) {
                const allLeagueLockers = [];
                for (const league of userLeagues) {
                    const { data: lockers } = await dbService.lockers.getByLeague(league.id_liga);
                    if (lockers) {
                        allLeagueLockers.push(...lockers.map(l => ({
                            id: `league-${l.id_armario}`,
                            id_armario: l.id_armario,
                            lockerNumber: (l.cd_armario || '---').toString().padStart(3, '0'),
                            floor: l.dc_andar || l.nm_local || 'Térreo',
                            size: l.dc_tamanho || l.nm_tamanho || 'Pequeno',
                            position: l.nm_posicao || 'MÉDIO',
                            password: l.cd_senha || 'N/A',
                            leagueName: league.nm_liga,
                            isLeague: true
                        })));
                    }
                }
                setLeagueLockers(allLeagueLockers);
            }
        } catch (err) {
            console.error('[FETCH MY LOCKERS ERROR]', err);
        } finally {
            setIsLoading(false);
        }
    }, [user?.id_usuario]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleOpenPass = (locker) => {
        setViewPassword(locker);
        setNewPassValue(locker.password);
        setIsEditingPassword(false);
    };

    const handleSavePassword = async () => {
        if (!viewPassword) return;
        setIsSavingPass(true);
        try {
            const { error } = await dbService.rentals.updatePassword(viewPassword.id, newPassValue, viewPassword.lockerNumber);
            if (!error) {
                setMyLockers(myLockers.map(l => l.id === viewPassword.id ? { ...l, password: newPassValue } : l));
                setIsEditingPassword(false);
                setTimeout(() => setViewPassword(null), 800);
            }
        } catch (err) {
            console.error('[UPDATE PASS ERROR]', err);
        } finally {
            setIsSavingPass(false);
        }
    };

    const handleExchange = (locker) => {
        navigate(`/dashboard/lockers?exchange_for=${locker.id}&size=${locker.size}&old_id=${locker.id_armario}`);
    };

    const handleUpgrade = (locker) => {
        if (!settings) return;
        
        const isLarge = locker.size?.toLowerCase() === 'grande';
        const priceSem = isLarge ? settings.vl_grande_semestral : settings.vl_pequeno_semestral;
        const priceAnn = isLarge ? settings.vl_grande_anual : settings.vl_pequeno_anual;
        const diff = priceAnn - priceSem;

        navigate('/dashboard/checkout/payment', {
            state: {
                type: 'upgrade',
                upgradeInfo: {
                    rentalId: locker.id,
                    newTypeId: 2, // Anual
                    fee: diff
                },
                locker: {
                    id: locker.lockerNumber,
                    dbId: locker.id_armario,
                    size: locker.size,
                    floor: locker.floor,
                    plan: 'anual',
                    priceSem,
                    priceAnn
                }
            }
        });
    };

    const handleRenew = (renewable) => {
        const plan = renewalPlans[renewable.id] || 'semestral';
        navigate('/dashboard/checkout/contract', {
            state: {
                locker: {
                    id: renewable.lockerNumber,
                    nr: renewable.lockerNumber,
                    dbId: renewable.dbId,
                    floor: renewable.floor,
                    size: renewable.size,
                    position: renewable.position,
                    priceSem: renewable.priceSem,
                    priceAnn: renewable.priceAnn,
                    plan,
                    isRenewal: true,
                    previousContractId: renewable.previousContractId
                }
            }
        });
    };

    const handleTerminate = async (renewable) => {
        if (!renewable) return;
        setIsTerminating(true);
        try {
            const { error } = await dbService.rentals.terminate(renewable.id, renewable.id_armario);
            if (!error) {
                // Remove from lists and close modal
                setRenewableLockers(prev => prev.filter(r => r.id !== renewable.id));
                setMyLockers(prev => prev.filter(l => l.id !== renewable.id));
                setConfirmTerminate(null);
            } else {
                alert('Erro ao encerrar contrato. Tente novamente.');
            }
        } catch (err) {
            console.error('[TERMINATE ERROR]', err);
        } finally {
            setIsTerminating(false);
        }
    };

    if (isLoading) {
        return (
            <div className="my-lockers-premium">
                <div className="loading-state">
                    <Loader2 className="spinner-medical" size={48} />
                    <p>Sincronizando suas locações...</p>
                </div>
            </div>
        );
    }

    const activeCount = myLockers.filter(l => !l.isExpired).length;

    return (
        <div className="my-lockers-container premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Meus Armários</h1>
                    <p>Olá, <strong>{user?.name?.split(' ')[0] || 'Aluno'}</strong>! Você possui {activeCount} {activeCount === 1 ? 'armário ativo' : 'armários ativos'}.</p>
                </div>
                <div className="header-actions-pill">
                    <div className="stat-badge">
                        <div className="locker-icon-standard" style={{ width: '14px', height: '14px' }} />
                        <span>{myLockers.length} {myLockers.length === 1 ? 'Locação' : 'Locações'}</span>
                    </div>
                </div>
            </header>

            <PushNotificationPrompt user={user} />

            <div className="lockers-section">
                    {/* Seção de contratos em carência para renovação */}
                    {renewableLockers.length > 0 && (
                        <div className="renewal-section">
                            <div className="lockers-matrix">
                                {renewableLockers.map((renewable) => (
                                    <div key={renewable.id} className="locker-card-premium">
                                        <div className="card-glass-effect" />

                                        <div className="locker-header">
                                            <div className="locker-main-info">
                                                <div className="locker-avatar">
                                                    <RotateCcw size={22} color="white" />
                                                </div>
                                                <div className="locker-titles">
                                                    <span className="locker-id">Armário #{renewable.lockerNumber}</span>
                                                    <span className="status-tag em-carencia">CARÊNCIA</span>
                                                </div>
                                            </div>
                                            <div className="locker-specs">
                                                <div className="spec-item">
                                                    <span>{renewable.floor}</span>
                                                </div>
                                                <div className="spec-item">
                                                    <Maximize2 size={14} />
                                                    <span>{renewable.size}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="grace-past-info">
                                            <AlertCircle size={14} className="icon-muted" />
                                            <span>Contrato vencido em <strong>{renewable.expiredOn}</strong></span>
                                        </div>

                                        <div className="locker-timeline grace-timeline-premium">
                                            <div className="timeline-info">
                                                <div className="expiry-date" style={{ color: renewable.graceDaysLeft <= 3 ? '#dc2626' : '#d97706' }}>
                                                    <Clock size={16} />
                                                    <span style={{ fontWeight: '700', letterSpacing: '-0.3px' }}>Prazo de Renovação</span>
                                                </div>
                                                <span className="days-counter" style={{ color: renewable.graceDaysLeft <= 3 ? '#dc2626' : '#d97706', textAlign: 'right', whiteSpace: 'nowrap' }}>
                                                    {renewable.graceDaysLeft} dias
                                                </span>
                                            </div>
                                            <div className="progress-bar-container" style={{ background: renewable.graceDaysLeft <= 3 ? '#fee2e2' : '#fef3c7', height: '6px' }}>
                                                <div
                                                    className="progress-fill"
                                                    style={{ 
                                                        width: `${((15 - renewable.graceDaysLeft) / 15) * 100}%`,
                                                        background: renewable.graceDaysLeft <= 3 ? '#ef4444' : '#f59e0b'
                                                    }}
                                                />
                                            </div>
                                            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px', fontSize: '0.7rem', fontWeight: '600', color: '#94a3b8' }}>
                                                <span>Expira em <strong style={{ color: '#64748b' }}>{new Date(renewable.graceDeadline).toLocaleDateString('pt-BR')}</strong></span>
                                            </div>
                                        </div>

                                        <div className="renewal-controls">
                                            <div className="plan-selector-mini">
                                                <button
                                                    className={`plan-btn ${renewalPlans[renewable.id] !== 'anual' ? 'active' : ''}`}
                                                    onClick={() => setRenewalPlans({ ...renewalPlans, [renewable.id]: 'semestral' })}
                                                >
                                                    Semestral <span>R$ {renewable.priceSem}</span>
                                                </button>
                                                <button
                                                    className={`plan-btn ${renewalPlans[renewable.id] === 'anual' ? 'active' : ''}`}
                                                    onClick={() => setRenewalPlans({ ...renewalPlans, [renewable.id]: 'anual' })}
                                                >
                                                    Anual <span>R$ {renewable.priceAnn}</span>
                                                </button>
                                            </div>

                                            <button
                                                className="btn-action-primary btn-renew-confirm"
                                                onClick={() => handleRenew(renewable)}
                                            >
                                                <RotateCcw size={16} />
                                                <span>Renovar agora</span>
                                            </button>

                                            <button
                                                className="btn-not-interested"
                                                onClick={() => setConfirmTerminate(renewable)}
                                            >
                                                <span>Não tenho interesse em renovar</span>
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Locações regulares */}
                    {myLockers.length > 0 ? (
                        <div className="lockers-matrix">
                            {myLockers.map((locker) => (
                                <div key={locker.id} className={`locker-card-premium ${locker.isExpired ? 'expired' : ''}`}>
                                    <div className="card-glass-effect" />
                                    <div className="locker-header">
                                        <div className="locker-main-info">
                                            <div className="locker-avatar">
                                                <div className="locker-icon-standard white" style={{ width: '24px', height: '24px' }} />
                                            </div>
                                            <div className="locker-titles">
                                                <span className="locker-id">Armário #{locker.lockerNumber}</span>
                                                <span className={`status-tag ${locker.isExpired ? 'encerrada' : 'ativa'}`}>
                                                    {locker.isExpired ? 'ENCERRADA' : 'ATIVA'}
                                                </span>
                                            </div>
                                        </div>
                                        <div className="locker-specs">
                                            <div className="spec-item" title="Localização">
                                                <span>{locker.floor}</span>
                                            </div>
                                            <div className="spec-item" title="Tamanho">
                                                <Maximize2 size={14} />
                                                <span>{locker.size}</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Premium Info Ribbon */}
                                    <div className="grace-past-info">
                                        <Clock size={14} className="icon-muted" />
                                        <span>{locker.isExpired ? 'Vigência encerrada em' : 'Vencimento em'} <strong>{locker.validUntil}</strong></span>
                                    </div>

                                    <div className={`locker-timeline ${locker.isExpired ? 'timeline-expired' : 'timeline-active-premium'}`}>
                                        <div className="timeline-info">
                                            <div className="expiry-date">
                                                <Clock size={16} />
                                                <span>{locker.isExpired ? 'Status do Contrato' : 'Tempo Restante'}</span>
                                            </div>
                                            {!locker.isExpired && (
                                                <span className="days-counter">
                                                    {locker.daysLeft} dias
                                                </span>
                                            )}
                                            {locker.isExpired && (
                                                <span className="days-counter" style={{ color: '#ef4444' }}>Finalizado</span>
                                            )}
                                        </div>
                                        {!locker.isExpired && (
                                            <div className="progress-bar-container">
                                                <div
                                                    className="progress-fill"
                                                    style={{ width: `${locker.progress}%` }}
                                                />
                                            </div>
                                        )}
                                        {locker.isExpired && (
                                            <div className="progress-bar-container" style={{ background: '#fee2e2' }}>
                                                <div className="progress-fill" style={{ width: '100%', background: '#f87171' }} />
                                            </div>
                                        )}
                                    </div>
                                    <div className="locker-actions-grid">
                                        <button
                                            className="btn-action-glass"
                                            onClick={() => handleOpenPass(locker)}
                                        >
                                            <Lock size={16} />
                                            <span>Minha senha</span>
                                        </button>
                                        {!locker.isExpired && (
                                            <button 
                                                className="btn-action-glass"
                                                onClick={() => handleExchange(locker)}
                                            >
                                                <ArrowLeftRight size={16} />
                                                <span>Trocar</span>
                                            </button>
                                        )}
                                        {!locker.isExpired && locker.id_tipo === 1 && (
                                            <button 
                                                className="btn-action-glass btn-upgrade-premium"
                                                onClick={() => handleUpgrade(locker)}
                                            >
                                                <GrUpgrade size={18} />
                                                <span>Upgrade para Plano Anual</span>
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        renewableLockers.length === 0 && (
                            <div className="empty-lockers-premium">
                                <div className="empty-illustration-container">
                                    <div className="empty-locker-icon-large" />
                                    <div className="illustration-overlay-glow" />
                                </div>
                                <div className="empty-text-content">
                                    <h2>Nenhum armário ainda</h2>
                                    <p>Sua jornada acadêmica fica muito melhor com um espaço seguro para seus pertences.</p>
                                    <button className="btn-cta-premium" onClick={() => navigate('/dashboard/lockers')}>
                                        <span>Ver Armários Disponíveis</span>
                                        <ChevronRight size={20} />
                                    </button>
                                </div>
                            </div>
                        )
                    )}

                    {leagueLockers.length > 0 && (
                        <div className="league-lockers-section" style={{ marginTop: '2rem' }}>
                            <div className="section-divider-premium">
                                <Users size={20} />
                                <h3>Armários sob Gestão (Ligas)</h3>
                            </div>
                            <div className="lockers-matrix">
                                {leagueLockers.map((locker) => (
                                    <div key={locker.id} className="locker-card-premium league">
                                        <div className="card-glass-effect" />
                                        <div className="locker-header">
                                            <div className="locker-main-info">
                                                <div className="locker-avatar league">
                                                    <Users size={24} color="white" />
                                                </div>
                                                <div className="locker-titles">
                                                    <span className="locker-id">Armário #{locker.lockerNumber}</span>
                                                    <span className="status-tag league">{locker.leagueName}</span>
                                                </div>
                                            </div>
                                            <div className="locker-specs">
                                                <div className="spec-item"><span>{locker.floor}</span></div>
                                                <div className="spec-item">
                                                    <Maximize2 size={14} />
                                                    <span>{locker.size}</span>
                                                </div>
                                            </div>
                                        </div>
                                        <div className="locker-actions-grid">
                                            <div className="league-pass-badge">
                                                <Lock size={14} />
                                                <span>Senha: <strong>{locker.password}</strong></span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
            </div>

            {/* Password Modal */}
                {viewPassword && (
                    <div className="modal-overlay" onClick={() => setViewPassword(null)}>
                        <div
                            className="password-modal"
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <Lock size={24} className="lock-icon-medical" />
                                <h2>{isEditingPassword ? 'Editar Senha' : 'Senha do Armário'}</h2>
                                <p>Armário #{viewPassword.lockerNumber}</p>
                            </div>
                            
                            <div className="password-display" onClick={() => !isEditingPassword && setIsEditingPassword(true)}>
                                {isEditingPassword ? (
                                    <div className="password-edit-container">
                                        <input 
                                            type="text" 
                                            className="p-input"
                                            value={newPassValue}
                                            onChange={(e) => setNewPassValue(e.target.value)}
                                            autoFocus
                                            maxLength={8}
                                        />
                                        <p className="edit-hint">Anote sua nova combinação acima.</p>
                                    </div>
                                ) : (
                                    <div className="password-view-wrapper">
                                        <span className="p-code">
                                            {showPassword ? viewPassword.password : '••••'}
                                        </span>
                                        <p className="edit-hint-click">Clique para editar</p>
                                    </div>
                                )}
                            </div>

                            <div className="modal-footer">
                                {isEditingPassword ? (
                                    <div className="footer-actions">
                                        <button className="btn-cancel" onClick={() => setIsEditingPassword(false)} disabled={isSavingPass}>
                                            Voltar
                                        </button>
                                        <button className="btn-save" onClick={handleSavePassword} disabled={isSavingPass}>
                                            {isSavingPass ? <Loader2 className="spinner" size={18} /> : null}
                                            Salvar
                                        </button>
                                    </div>
                                ) : (
                                    <div className="footer-actions">
                                        <button className="btn-toggle-eye" onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            <span>{showPassword ? 'Ocultar' : 'Visualizar'}</span>
                                        </button>
                                        <button className="btn-close-modal" onClick={() => setViewPassword(null)}>
                                            Fechar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
                {/* Termination Confirmation Modal */}
                {confirmTerminate && (
                    <div className="modal-overlay" onClick={() => setConfirmTerminate(null)}>
                        <div className="password-modal termination-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <div className="alert-icon-container">
                                    <AlertCircle size={40} className="alert-icon-red" />
                                </div>
                                <h2>Encerrar Contrato?</h2>
                                <p>Ao confirmar, o armário <strong>#{confirmTerminate.lockerNumber}</strong> será liberado para vistoria e você perderá a prioridade de renovação.</p>
                            </div>
                            
                            <div className="modal-footer-vertical">
                                <button 
                                    className="btn-confirm-terminate" 
                                    onClick={() => handleTerminate(confirmTerminate)}
                                    disabled={isTerminating}
                                >
                                    {isTerminating ? <Loader2 className="spinner" size={18} /> : null}
                                    Confirmar Encerramento
                                </button>
                                <button 
                                    className="btn-cancel-terminate" 
                                    onClick={() => setConfirmTerminate(null)}
                                    disabled={isTerminating}
                                >
                                    Manter por enquanto
                                </button>
                            </div>
                        </div>
                    </div>
                )}
        </div>
    );
};

export default UserMyLockers;
