import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, Clock, RefreshCcw, MapPin, Loader2, Sparkles, ChevronRight, AlertCircle, Info, Maximize2, Lock, ArrowLeftRight, Save, Edit3 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { dbService } from '../services/supabaseClient';
import './UserMyLockers.css';

const UserMyLockers = ({ user }) => {
    const navigate = useNavigate();
    const [myLockers, setMyLockers] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [viewPassword, setViewPassword] = useState(null);
    const [isEditingPassword, setIsEditingPassword] = useState(false);
    const [newPassValue, setNewPassValue] = useState('');
    const [isSavingPass, setIsSavingPass] = useState(false);

    const fetchData = async () => {
        if (!user?.id_usuario) return;
        setIsLoading(true);
        try {
            const { data, error } = await dbService.rentals.getByUser(user.id_usuario);
            if (!error && data) {
                const formatted = data.map(r => {
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
                setMyLockers(formatted);
            }
        } catch (err) {
            console.error('[FETCH MY LOCKERS ERROR]', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [user]);

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
        // Redireciona para seleção com o parâmetro de troca
        navigate(`/dashboard/lockers?exchange_for=${locker.id}&size=${locker.size}&old_id=${locker.id_armario}`);
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
            <motion.header
                className="page-header"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
            >
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
            </motion.header>

            <div className="lockers-section">
                <AnimatePresence mode="popLayout">
                    {myLockers.length > 0 ? (
                        <div className="lockers-matrix">
                            {myLockers.map((locker, index) => (
                                <motion.div
                                    key={locker.id}
                                    className={`locker-card-premium ${locker.isExpired ? 'expired' : ''}`}
                                    initial={{ opacity: 0, scale: 0.9 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ delay: index * 0.1 }}
                                    whileHover={{ y: -5 }}
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
                                                <MapPin size={14} />
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

                                </motion.div>
                            ))}

                            <motion.div
                                className="add-locker-card-premium"
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                whileHover={{ scale: 1.02 }}
                                onClick={() => navigate('/dashboard/lockers')}
                            >
                                <div className="add-content">
                                    <div className="add-icon-sphere">
                                        <img src="/deal.png" alt="Deal" style={{ width: '32px', height: '32px', objectFit: 'contain' }} />
                                    </div>
                                    <h3>Novo Aluguel</h3>
                                    <ChevronRight size={20} className="arrow" />
                                </div>
                            </motion.div>
                        </div>
                    ) : (
                        <motion.div
                            className="empty-lockers-premium"
                            initial={{ opacity: 0, y: 16 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.4 }}
                        >
                            <div className="empty-illustration">
                                <div className="empty-icon-ring">
                                    <span className="empty-emoji">🔒</span>
                                </div>
                            </div>
                            <h2>Nenhum armário ainda</h2>
                            <p>Você ainda não possui nenhuma locação ativa.<br />Escolha seu armário agora e garanta seu espaço!</p>
                            <button className="btn-cta-premium" onClick={() => navigate('/dashboard/lockers')}>
                                Ver Armários Disponíveis
                                <ChevronRight size={18} />
                            </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Password Modal */}
            <AnimatePresence>
                {viewPassword && (
                    <div className="modal-overlay" onClick={() => setViewPassword(null)}>
                        <motion.div
                            className="password-modal"
                            initial={{ opacity: 0, scale: 0.8, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.8, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <div className="modal-header">
                                <Lock size={24} className="lock-icon-medical" />
                                <h2>{isEditingPassword ? 'Editar Senha' : 'Senha do Armário'}</h2>
                                <p>Armário #{viewPassword.lockerNumber}</p>
                            </div>
                            
                            <div className="password-display">
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
                                    <span className="p-code">{viewPassword.password}</span>
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
                                        <button className="btn-edit" onClick={() => setIsEditingPassword(true)}>
                                            <Edit3 size={18} />
                                            Editar Combinação
                                        </button>
                                        <button className="btn-close-modal" onClick={() => setViewPassword(null)}>
                                            Fechar
                                        </button>
                                    </div>
                                )}
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default UserMyLockers;
