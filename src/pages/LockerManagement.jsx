import { useState, useEffect, useMemo } from 'react';
import {
    Search,
    MapPin,
    Maximize2,
    Clock,
    Wrench,
    Loader2,
    X,
    Lock,
    User,
    Calendar,
    PlusCircle,
    Heart,
    Unlock,
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    XCircle
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './LockerManagement.css';

const LockerManagement = () => {
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [lockers, setLockers] = useState([]);
    const [selectedLocker, setSelectedLocker] = useState(null);
    const [filters, setFilters] = useState({
        floorId: 'All',
        sizeId: 'All',
        statusId: 'All'
    });
    const [lookups, setLookups] = useState({ floors: {}, sizes: {} });

    // Gratuity Flow State
    const [isGratuityMode, setIsGratuityMode] = useState(false);
    const [studentSearch, setStudentSearch] = useState('');
    const [foundStudents, setFoundStudents] = useState([]);
    const [selectedStudent, setSelectedStudent] = useState(null);
    const [isSaving, setIsSaving] = useState(false);
    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, isLoading: false });
    const [toast, setToast] = useState(null);


    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [lockersRes, lookupRes, usersRes, rentalsRes, waitingRes] = await Promise.all([
                dbService.lockers.getAll(),
                dbService.lockers.getLookups(),
                dbService.users.getAll(),
                dbService.rentals.getAll(),
                dbService.waitingList.getAllActiveReservations ? dbService.waitingList.getAllActiveReservations() : Promise.resolve({ data: [] })
            ]);

            if (lookupRes.error) throw lookupRes.error;
            setLookups(lookupRes.data || {});

            const userMap = (usersRes.data || []).reduce((acc, u) => ({ ...acc, [u.id_usuario]: u.nm_usuario }), {});

            // Map standard active rentals
            const activeDataMap = (rentalsRes.data || []).reduce((acc, r) => {
                if (r.dc_status_locacao === 'ATIVA' && r.id_armario) {
                    acc[r.id_armario] = {
                        name: r.nm_aluno,
                        expiry: r.dt_termino,
                        type: 'rental'
                    };
                }
                return acc;
            }, {});

            // Map waiting list reservations (Priority if locker is in 'reservado' status)
            (waitingRes.data || []).forEach(res => {
                activeDataMap[res.id_armario] = {
                    name: res.t_usuario?.nm_usuario || userMap[res.id_usuario] || 'Interessado',
                    expiry: res.dt_expiracao_reserva,
                    type: 'reservation'
                };
            });

            if (!lockersRes.error && lockersRes.data) {
                const normalizeStatus = (str) => {
                    if (!str) return 'disponivel';
                    const normalized = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim().replace(/\s+/g, '-');
                    if (normalized.includes('reservado')) return 'reservado';
                    return normalized === 'ocupado' ? 'em-uso' : normalized;
                };

                const uniqueMap = new Map();
                lockersRes.data.forEach(l => {
                    if (l.id_armario && !uniqueMap.has(l.id_armario)) {
                        const activeData = activeDataMap[l.id_armario];
                        const isReservation = activeData?.type === 'reservation';

                        uniqueMap.set(l.id_armario, {
                            id: (l.nr_armario || l.cd_armario || '').toString().padStart(3, '0'),
                            nr: l.nr_armario || l.cd_armario,
                            dbId: l.id_armario,
                            localId: l.id_local,
                            sizeId: l.id_tamanho,
                            floor: l.nm_local || l.dc_andar || 'Térreo',
                            size: l.nm_tamanho || l.dc_tamanho || 'Pequeno',
                            position: l.nm_posicao || l.dc_posicao || 'MÉDIO',
                            status: normalizeStatus(l.situacao || l.dc_status || 'disponivel'),
                            responsible: (activeData && activeData.name) || userMap[l.id_usuario] || l.id_usuario || 'Disponível',
                            isReservation,
                            expiry: (activeData && activeData.expiry) ? (function (dt) {
                                if (isReservation) {
                                    // Reservations use Full Timestamp (ISO)
                                    const d = new Date(dt);
                                    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                }
                                // Rentals use YYYY-MM-DD
                                const [y, m, d] = dt.split('-').map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString();
                            })(activeData.expiry) : l.dt_termino ? (function (dt) {
                                const [y, m, d] = dt.split('-').map(Number);
                                return new Date(y, m - 1, d).toLocaleDateString();
                            })(l.dt_termino) : 'N/A'
                        });
                    }
                });
                setLockers(Array.from(uniqueMap.values()));
            }
        } catch (err) {
            console.error('[FETCH ERROR]', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const displayLockers = useMemo(() => {
        const fFloorId = filters.floorId;
        const fSizeId = filters.sizeId;
        const fStatusId = filters.statusId;
        const fSearch = searchTerm.trim().toLowerCase();

        return lockers
            .filter(locker => {
                const lockerIdStr = locker.id ? String(locker.id).toLowerCase() : '';
                const responsibleStr = locker.responsible ? String(locker.responsible).toLowerCase() : '';
                const matchesSearch = !fSearch || lockerIdStr.includes(fSearch) || responsibleStr.includes(fSearch);
                const matchesFloor = fFloorId === 'All' || locker.localId?.toString() === fFloorId.toString();
                const matchesSize = fSizeId === 'All' || locker.sizeId?.toString() === fSizeId.toString();
                const matchesStatus = fStatusId === 'All' || locker.status === fStatusId;

                return matchesSearch && matchesFloor && matchesSize && matchesStatus;
            })
            .sort((a, b) => (parseInt(a.nr) || 0) - (parseInt(b.nr) || 0));
    }, [lockers, filters, searchTerm]);

    useEffect(() => {
        if (selectedLocker) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => document.body.classList.remove('no-scroll');
    }, [selectedLocker, modalConfig.isOpen]);

    const handleLockerClick = (locker) => {
        setSelectedLocker(locker);
        setIsGratuityMode(false);
        setStudentSearch('');
        setSelectedStudent(null);
    };

    const handleCloseDrawer = () => {
        setSelectedLocker(null);
    };

    const handleStudentSearch = async (val) => {
        setStudentSearch(val);
        if (val.length > 2) {
            const { data } = await dbService.students.search(val);
            setFoundStudents(data || []);
        } else {
            setFoundStudents([]);
        }
    };

    const showModal = (config) => {
        setModalConfig({
            isOpen: true,
            title: config.title || 'Confirmação',
            message: config.message || '',
            type: config.type || 'confirm',
            onConfirm: config.onConfirm || null,
            isLoading: false
        });
    };

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };

    const handleApplyGratuity = async () => {
        if (!selectedStudent || !selectedLocker) return;

        showModal({
            title: 'Conceder Gratuidade',
            message: `Deseja conceder gratuidade vitalícia (semestral renovável) para ${selectedStudent.nm_usuario} no armário #${selectedLocker.id}?`,
            type: 'confirm',
            onConfirm: async () => {
                setIsSaving(true);
                try {
                    const now = new Date();
                    const expiryDate = new Date(now);
                    expiryDate.setMonth(now.getMonth() + 6); // Default 6 months for gratuity

                    const rentalData = {
                        id_armario: selectedLocker.dbId,
                        id_usuario: selectedStudent.id_usuario,
                        dt_inicio: now.toISOString().split('T')[0],
                        dt_termino: expiryDate.toISOString().split('T')[0],
                        id_tipo: 1, // Semester type for gratuity
                        id_status: 1 // Ativa
                    };

                    await dbService.rentals.create(rentalData);
                    await dbService.lockers.updateStatus(selectedLocker.dbId, 'GRATUITO');

                    await fetchData();

                    setSelectedLocker(null);
                    setIsGratuityMode(false);
                    closeModal();
                    showToast('Gratuidade aplicada com sucesso!');
                } catch (error) {
                    console.error('Error applying gratuity:', error);
                    closeModal();
                    showToast('Erro ao aplicar gratuidade', 'error');
                } finally {
                    setIsSaving(false);
                }
            }
        });
    };

    const handleStatusChange = async (newStatus) => {
        if (!selectedLocker) return;

        let title = '';
        let message = '';

        if (newStatus === 'manutencao') {
            title = 'Colocar em Manutenção';
            message = `Deseja bloquear o armário #${selectedLocker.id} para manutenção? Ele não poderá ser alugado até ser liberado.`;
        } else if (newStatus === 'disponivel') {
            title = 'Liberar Armário';
            message = `Deseja liberar o armário #${selectedLocker.id}? Ele voltará ao status Disponível.`;
        } else if (newStatus === 'vistoria') {
            title = 'Encerrar Locação';
            message = `Deseja encerrar IMEDIATAMENTE a locação de ${selectedLocker.responsible} no armário #${selectedLocker.id}?`;
        }

        showModal({
            title,
            message,
            type: 'confirm',
            onConfirm: async () => {
                try {
                    const dbStatus = newStatus.toUpperCase().replace('-', '_');
                    await dbService.lockers.updateStatus(selectedLocker.dbId, dbStatus);

                    await fetchData();
                    setSelectedLocker(null);
                    closeModal();
                    showToast('Status atualizado com sucesso!');
                } catch (error) {
                    console.error('Error updating status:', error);
                    closeModal();
                    showToast('Erro ao atualizar status', 'error');
                }
            }
        });
    };


    const getStatusLabel = (status) => {
        const labels = {
            'disponivel': 'Disponível',
            'em-uso': 'Em uso',
            'vistoria': 'Aguardando Vistoria',
            'manutencao': 'Manutenção',
            'gratuito': 'Gratuito',
            'reservado': 'Reservado'
        };
        return (labels[status] || status).toUpperCase();
    };

    const getStatusClass = (status) => {
        if (status === 'disponivel') return 'status-available';
        if (status === 'em-uso') return 'status-occupied';
        if (status === 'vistoria') return 'status-inspection';
        if (status === 'manutencao') return 'status-maintenance';
        if (status === 'reservado') return 'status-reserved';
        return '';
    };

    return (
        <div className="user-selection premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Armários Disponíveis</h1>
                    <p>Encontre a melhor unidade para seu semestre.</p>
                </div>
            </header>

            <section className="filter-bar-premium">
                <div className="filter-group search">
                    <span className="filter-icon"><Search size={20} /></span>
                    <input
                        type="search"
                        name="q"
                        placeholder="Pesquisar por número do armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        autoCorrect="off"
                        autoCapitalize="off"
                    />
                </div>

                <div className="filter-group">
                    <span className="filter-icon"><MapPin size={20} /></span>
                    <select
                        value={filters.floorId}
                        onChange={(e) => setFilters({ ...filters, floorId: e.target.value })}
                    >
                        <option value="All">Todos os Andares</option>
                        {Object.entries(lookups.floors || {}).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </div>

                <div className="filter-group">
                    <span className="filter-icon"><Maximize2 size={20} /></span>
                    <select
                        value={filters.sizeId}
                        onChange={(e) => setFilters({ ...filters, sizeId: e.target.value })}
                    >
                        <option value="All">Todos os Tamanhos</option>
                        {Object.entries(lookups.sizes || {}).map(([id, name]) => (
                            <option key={id} value={id}>{name}</option>
                        ))}
                    </select>
                </div>

                {/* Admin-only extra filter, styled exactly like others */}
                <div className="filter-group">
                    <span className="filter-icon"><Clock size={20} /></span>
                    <select
                        value={filters.statusId}
                        onChange={(e) => setFilters({ ...filters, statusId: e.target.value })}
                    >
                        <option value="All">Todos os Status</option>
                        <option value="disponivel">Disponível</option>
                        <option value="em-uso">Em uso</option>
                        <option value="vistoria">Vistoria</option>
                        <option value="manutencao">Manutenção</option>
                        <option value="gratuito">Gratuito</option>
                    </select>
                </div>
            </section>

            <div className="matrix-container">
                {isLoading ? (
                    <div className="loading-state-matrix">
                        <Loader2 className="spinner" size={40} />
                        <p>Mapeando estrutura...</p>
                    </div>
                ) : (
                    <div className="locker-wall">
                        {displayLockers.length > 0 ? (
                            displayLockers.map((locker) => (
                                <button
                                    key={locker.dbId}
                                    className={`locker-unit ${getStatusClass(locker.status)} ${selectedLocker?.dbId === locker.dbId ? 'active' : ''}`}
                                    onClick={() => handleLockerClick(locker)}
                                >
                                    <span className="unit-number">{locker.id}</span>
                                    {locker.status === 'em-uso' && <Lock size={12} className="unit-icon" />}
                                    {locker.status === 'vistoria' && <Clock size={12} className="unit-icon" />}
                                    {locker.status === 'manutencao' && <Wrench size={12} className="unit-icon" />}
                                    {locker.status === 'reservado' && <Calendar size={12} className="unit-icon" />}
                                </button>
                            ))
                        ) : (
                            <div className="empty-state-premium">
                                <div className="empty-state-icon">
                                    <Search size={48} />
                                </div>
                                <div className="empty-state-content">
                                    <h3>Nenhum armário encontrado</h3>
                                    <p>Não encontramos unidades com os filtros selecionados. Tente ajustar sua busca ou limpar os filtros.</p>
                                    <button
                                        className="btn-reset-filters"
                                        onClick={() => {
                                            setFilters({ floorId: 'All', sizeId: 'All', statusId: 'All' });
                                            setSearchTerm('');
                                        }}
                                    >
                                        Limpar todos os filtros
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Selection Drawer (Admin Mode) */}
            {selectedLocker && (
                <div 
                    className="selection-drawer-overlay open"
                    onClick={handleCloseDrawer}
                >
                    <div 
                        className="selection-drawer"
                        onClick={e => e.stopPropagation()}
                    >
                            <header className="drawer-header">
                                <div className="drawer-header-main">
                                    <div className="drawer-badge">ARMÁRIO #{selectedLocker.id}</div>
                                    <h2>Detalhes e Ações</h2>
                                </div>
                                <button className="close-drawer-btn" onClick={handleCloseDrawer}>
                                    <X size={20} />
                                </button>
                            </header>

                            <div className="drawer-content">
                                <div className={`status-banner-def ${selectedLocker.status}`}>
                                    {getStatusLabel(selectedLocker.status)}
                                </div>

                                {isGratuityMode ? (
                                    <div className="rental-form-compact">
                                        <h3 className="section-title">Conceder Gratuidade</h3>
                                        <div className="form-group-compact">
                                            <label>Buscar Aluno</label>
                                            <div className="search-pill-input">
                                                <Search size={18} />
                                                <input
                                                    type="text"
                                                    placeholder="Nome ou RA..."
                                                    value={studentSearch}
                                                    onChange={(e) => handleStudentSearch(e.target.value)}
                                                />
                                            </div>
                                            {foundStudents.length > 0 && !selectedStudent && (
                                                <div className="admin-search-results">
                                                    {foundStudents.map(s => (
                                                        <div key={s.id_usuario} className="admin-search-item" onClick={() => setSelectedStudent(s)}>
                                                            <p className="nm">{s.nm_usuario}</p>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                            {selectedStudent && (
                                                <div className="admin-selected-student">
                                                    <User size={14} /> {selectedStudent.nm_usuario}
                                                    <button onClick={() => setSelectedStudent(null)}><X size={14} /></button>
                                                </div>
                                            )}
                                        </div>

                                        <footer className="admin-rental-footer">
                                            <button className="cancel-pill" onClick={() => setIsGratuityMode(false)}>Cancelar</button>
                                            <button className="confirm-pill" disabled={!selectedStudent || isSaving} onClick={handleApplyGratuity}>
                                                {isSaving ? <Loader2 size={18} className="spinner" /> : 'Confirmar Gratuidade'}
                                            </button>
                                        </footer>
                                    </div>
                                ) : (
                                    <>
                                        <div className="drawer-section">
                                            <h3 className="section-title">Localização e Specs</h3>
                                            <div className="specs-grid">
                                                <div className="spec-item">
                                                    <MapPin size={18} className="spec-icon" />
                                                    <div className="spec-info">
                                                        <label>Andar</label>
                                                        <span>{selectedLocker.floor}</span>
                                                    </div>
                                                </div>
                                                <div className="spec-item">
                                                    <Maximize2 size={18} className="spec-icon" />
                                                    <div className="spec-info">
                                                        <label>Tamanho</label>
                                                        <span>{selectedLocker.size}</span>
                                                    </div>
                                                </div>
                                                <div className="spec-item">
                                                    <Search size={18} className="spec-icon" />
                                                    <div className="spec-info">
                                                        <label>Posição</label>
                                                        <span>{selectedLocker.position}</span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        {(selectedLocker.status === 'em-uso' || selectedLocker.status === 'gratuito' || selectedLocker.status === 'reservado') && (
                                            <div className="drawer-section">
                                                <h3 className="section-title">{selectedLocker.status === 'reservado' ? 'Reserva Ativa' : 'Responsável'}</h3>
                                                <div className="admin-info-card">
                                                    <div className="admin-info-row">
                                                        <User size={16} />
                                                        <div>
                                                            <label>Nome</label>
                                                            <p>{selectedLocker.responsible}</p>
                                                        </div>
                                                    </div>
                                                    <div className="admin-info-row">
                                                        <Calendar size={16} />
                                                        <div>
                                                            <label>{selectedLocker.status === 'reservado' ? 'Expira em' : 'Vencimento'}</label>
                                                            <p>{selectedLocker.expiry}</p>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}

                                        <div className="drawer-section">
                                            <h3 className="section-title">Ações Administrativas</h3>
                                            <div className="admin-actions-grid">
                                                {selectedLocker.status === 'disponivel' && (
                                                    <button className="admin-btn" onClick={() => setIsGratuityMode(true)}>
                                                        <Heart size={18} /> Aplicar gratuidade
                                                    </button>
                                                )}
                                                {selectedLocker.status !== 'manutencao' && (
                                                    <button className="admin-btn" onClick={() => handleStatusChange('manutencao')}>
                                                        <Wrench size={18} /> Colocar em manutenção
                                                    </button>
                                                )}
                                                {selectedLocker.status !== 'disponivel' && (
                                                    <button className="admin-btn" onClick={() => handleStatusChange('disponivel')}>
                                                        <Unlock size={18} /> Liberar armário
                                                    </button>
                                                )}
                                                {(selectedLocker.status === 'em-uso' || selectedLocker.status === 'gratuito') && (
                                                    <button className="admin-btn danger" onClick={() => handleStatusChange('vistoria')}>
                                                        <AlertCircle size={18} /> Encerrar locação
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

            {/* Custom Action Modal */}
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
                                    <button className="modal-btn-cancel" onClick={closeModal} disabled={modalConfig.isLoading}>Cancelar</button>
                                    <button 
                                        className="modal-btn-confirm" 
                                        disabled={modalConfig.isLoading}
                                        onClick={async () => {
                                            if (modalConfig.onConfirm) {
                                                setModalConfig(prev => ({ ...prev, isLoading: true }));
                                                await modalConfig.onConfirm();
                                            } else {
                                                closeModal();
                                            }
                                        }}
                                    >
                                        {modalConfig.isLoading ? <Loader2 className="spinner" size={18} color="white" /> : 'Confirmar'}
                                    </button>
                                </>
                            ) : (
                                <button className="modal-btn-primary" onClick={closeModal}>Entendido</button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Toast Notification */}
            {toast && (
                <div className="toast-container">
                    <div className={`toast-notification ${toast.type}`}>
                        <div className="toast-icon">
                            {toast.type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                        </div>
                        <span className="toast-message">{toast.message}</span>
                    </div>
                </div>
            )}
        </div>
    );
};

export default LockerManagement;
