import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, Clock, RefreshCcw, Loader2, Sparkles, ChevronRight, AlertCircle, Info, Maximize2, Lock, ArrowLeftRight, Save, Edit3, Users, RotateCcw, Zap } from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './UserMyLockers.css';

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

    const fetchData = useCallback(async () => {
        if (!user?.id_usuario) return;
        setIsLoading(true);
        try {
            const [rentalsRes, renewableRes, leaguesRes] = await Promise.all([
                dbService.rentals.getByUser(user.id_usuario),
                dbService.rentals.getRenewableByUser(user.id_usuario),
                dbService.leagues.getByPresident(user.id_usuario)
            ]);

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
                            lockerNumber: (r.nr_armario || '---').toString().padStart(3, '0'),
                            floor: r.dc_andar || 'N/A',
                            position: r.nm_posicao || 'MÉDIO',
                            size: r.dc_tamanho || 'Pequeno',
                            password: r.cd_senha || '1234',
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
                            lockerNumber: (l.nr_armario || l.cd_armario || '---').toString().padStart(3, '0'),
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
            const { error } = await dbService.rentals.updatePassword(viewPassword.id, newPassValue);
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

                                        <div className="locker-timeline">
                                            <div className="timeline-info">
                                                <div className="expiry-date">
                                                    <Clock size={16} />
                                                    <span>Venceu em <strong>{renewable.expiredOn}</strong></span>
                                                </div>
                                                <span className={`days-counter ${renewable.graceDaysLeft <= 3 ? 'urgent' : ''}`}>
                                                    {renewable.graceDaysLeft} {renewable.graceDaysLeft === 1 ? 'dia' : 'dias'} de carência
                                                </span>
                                            </div>
                                            <div className="progress-bar-container grace">
                                                <div
                                                    className={`progress-fill ${renewable.graceDaysLeft <= 3 ? 'urgent' : 'warning'}`}
                                                    style={{ width: `${(renewable.graceDaysLeft / 15) * 100}%` }}
                                                />
                                            </div>
                                            <div className="grace-footer">
                                                <span>Prazo final: <strong>{new Date(renewable.graceDeadline).toLocaleDateString('pt-BR')}</strong></span>
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
                                <div
                                    key={locker.id}
                                    className={`locker-card-premium ${locker.isExpired ? 'expired' : ''}`}
                                >
                                    <div className="card-glass-effect" />

                                    <div className="locker-header">
                                        <div className="locker-main-info">
                                            <div className="locker-avatar">
                                                <div className="locker-icon-standard white" style={{ width: '24px', height: '24px' }} />
                                            </div>
                                            <div className="locker-titles">
                                                <span className="locker-id">Armário #{locker.lockerNumber}</span>
                                                <span className={`status-tag ${locker.status.toLowerCase()}`}>
                                                    {locker.status}
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

                                    <div className="locker-timeline">
                                        <div className="timeline-info">
                                            <div className="expiry-date">
                                                <Clock size={16} />
                                                <span>{locker.isExpired ? 'Venceu em' : 'Vence em'} <strong>{locker.validUntil}</strong></span>
                                            </div>
                                            {!locker.isExpired && (
                                                <span className="days-counter">
                                                    {locker.daysLeft} dias
                                                </span>
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
                                                <span>Trocar armário</span>
                                            </button>
                                        )}
                                    </div>

                                </div>
                            ))}

                            <div
                                className="add-locker-card-premium"
                                onClick={() => navigate('/dashboard/lockers')}
                            >
                                <div className="add-content">
                                    <div className="add-icon-sphere">
                                        <img src="/deal.png" alt="Deal" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                                    </div>
                                    <h3>Novo Aluguel</h3>
                                    <ChevronRight size={20} className="arrow" />
                                </div>
                            </div>
                        </div>
                    ) : renewableLockers.length === 0 ? (
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
                    ) : null}

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
                                            Cancelar
                                        </button>
                                        <button className="btn-save" onClick={handleSavePassword} disabled={isSavingPass}>
                                            {isSavingPass ? <Loader2 className="spinner" size={18} /> : <Save size={18} />}
                                            Salvar Senha
                                        </button>
                                    </div>
                                ) : (
                                    <div className="footer-actions">
                                        <button className="btn-toggle-eye" onClick={() => setShowPassword(!showPassword)}>
                                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                            {showPassword ? 'Ocultar' : 'Visualizar'}
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
        </div>
    );
};

export default UserMyLockers;
