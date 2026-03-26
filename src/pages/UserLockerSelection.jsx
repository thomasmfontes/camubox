import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Search,
    MapPin,
    Maximize2,
    Clock,
    CheckCircle2,
    AlertTriangle,
    Wrench,
    ChevronRight,
    Sparkles,
    Loader2,
    X,
    Lock,
    Calendar,
    TrendingDown
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './UserLockerSelection.css';

const UserLockerSelection = ({ user }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const exchangeFor = queryParams.get('exchange_for');
    const exchangeSize = queryParams.get('size');
    const oldLockerId = queryParams.get('old_id');

    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [lockers, setLockers] = useState([]);
    const [selectedLocker, setSelectedLocker] = useState(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [filters, setFilters] = useState({
        floorId: 'All',
        sizeId: exchangeSize ? 'All' : 'All', // We will force sizeId if exchanging
        contract: 'Semestral'
    });
    const [lookups, setLookups] = useState({ floors: {}, sizes: {}, statuses: {}, positions: {} });
    const [statusModal, setStatusModal] = useState(null);
    const [waitingListStatus, setWaitingListStatus] = useState(null);
    const [isProcessingWaitingList, setIsProcessingWaitingList] = useState(false);

    useEffect(() => {
        if (exchangeSize) {
            // Find size ID from name if possible or just filter by name in useMemo
        }
    }, [exchangeSize]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                // Fetch in parallel
                const [lockersRes, lookupRes, configRes] = await Promise.all([
                    dbService.lockers.getAll(),
                    dbService.lockers.getLookups(),
                    dbService.lockers.getConfig()
                ]);

                if (lookupRes.error) throw lookupRes.error;
                setLookups(lookupRes.data || {});

                if (!lockersRes.error && lockersRes.data) {
                    const config = configRes.data || {};

                    // Normalize status helper
                    const normalizeStatus = (str) => {
                        if (!str) return 'disponivel';
                        const normalized = str.normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .toLowerCase()
                            .trim()
                            .replace(/\s+/g, '-');
                        
                        // Map reservado to a specific string
                        if (normalized.includes('reservado')) return 'reservado';
                        return normalized;
                    };

                    const uniqueMap = new Map();

                    lockersRes.data.forEach(l => {
                        if (l.id_armario && !uniqueMap.has(l.id_armario)) {
                            const rawNr = l.nr_armario || l.cd_armario;
                            const formattedNr = rawNr ? rawNr.toString().padStart(3, '0') : 'N/A';

                            const sizeLabel = l.dc_tamanho || l.nm_tamanho || 'Pequeno';
                            const isLarge = sizeLabel.toLowerCase() === 'grande';

                            uniqueMap.set(l.id_armario, {
                                id: formattedNr,
                                nr: formattedNr,
                                dbId: l.id_armario,
                                localId: l.id_local,
                                sizeId: l.id_tamanho,
                                floor: l.dc_andar || l.nm_local || 'Térreo',
                                size: sizeLabel,
                                position: l.dc_posicao || l.nm_posicao || 'Não definida',
                                status: normalizeStatus(l.situacao || l.dc_status || 'Disponivel'),
                                priceSem: isLarge ? config.vl_grande_semestral : config.vl_pequeno_semestral,
                                priceAnn: isLarge ? config.vl_grande_anual : config.vl_pequeno_anual,
                            });
                        }
                    });

                    const mapped = Array.from(uniqueMap.values());
                    setLockers(mapped);
                }
            } catch (err) {
                console.error('[FETCH ERROR]', err);
            } finally {
                setIsLoading(false);
            }
        };

        fetchData();
    }, []);

    useEffect(() => {
        if (isPanelOpen || statusModal) {
            document.body.classList.add('no-scroll');
        } else {
            document.body.classList.remove('no-scroll');
        }
        return () => {
            document.body.classList.remove('no-scroll');
        };
    }, [isPanelOpen, statusModal]);

    // Check waiting list status when modal opens
    useEffect(() => {
        const checkWaitingList = async () => {
            if (statusModal && user) {
                const { data } = await dbService.waitingList.getStatus(statusModal.dbId, user.id_usuario);
                setWaitingListStatus(data);
            } else {
                setWaitingListStatus(null);
            }
        };
        checkWaitingList();
    }, [statusModal, user]);

    // Deep-linking: Open locker details from URL parameter
    useEffect(() => {
        const lockerIdToOpen = queryParams.get('openLockerId');
        if (lockerIdToOpen && lockers.length > 0 && !statusModal && !isPanelOpen) {
            const locker = lockers.find(l => l.dbId.toString() === lockerIdToOpen.toString());
            if (locker) {
                console.log('[DeepLink] Opening locker:', lockerIdToOpen);
                openLockerDetails(locker);
            }
        }
    }, [lockers, location.search, statusModal, isPanelOpen]);

    const displayLockers = useMemo(() => {
        const fFloorId = filters.floorId;
        const fSizeId = filters.sizeId;
        const fSearch = searchTerm.trim().toLowerCase();

        const selectedFloorName = lookups.floors?.[fFloorId];
        const selectedSizeName = lookups.sizes?.[fSizeId];

        return lockers
            .filter(locker => {
                const matchesSearch = !fSearch || locker.id.toLowerCase().includes(fSearch);

                const matchesFloor = fFloorId === 'All' ||
                    locker.localId?.toString() === fFloorId.toString() ||
                    (selectedFloorName && locker.floor === selectedFloorName);

                // If exchangeMode, force same size
                let matchesSize = fSizeId === 'All' ||
                    locker.sizeId?.toString() === fSizeId.toString() ||
                    (selectedSizeName && locker.size === selectedSizeName);
                
                if (exchangeSize) {
                    matchesSize = locker.size.toLowerCase() === exchangeSize.toLowerCase();
                }

                return matchesSearch && matchesFloor && matchesSize;
            })
            .sort((a, b) => (parseInt(a.nr) || 0) - (parseInt(b.nr) || 0));
    }, [lockers, filters.floorId, filters.sizeId, searchTerm, lookups, exchangeSize]);

    const openLockerDetails = async (locker) => {
        // If locker is reserved, check if it's for this user
        if (locker.status === 'reservado' && user) {
            const { data } = await dbService.waitingList.getStatus(locker.dbId, user.id_usuario);
            // If user is the one who has the reservation (status 2 in queue)
            if (data && data.id_status === 2) {
                setSelectedLocker(locker);
                setIsPanelOpen(true);
                return;
            }
        }

        if (locker.status === 'disponivel') {
            setSelectedLocker(locker);
            setIsPanelOpen(true);
        } else {
            setStatusModal(locker);
        }
    };

    const handleJoinWaitingList = async () => {
        if (!statusModal || !user) return;
        setIsProcessingWaitingList(true);
        try {
            const { error } = await dbService.waitingList.join(statusModal.dbId, user.id_usuario);
            if (error) throw error;
            
            // Refresh status
            const { data } = await dbService.waitingList.getStatus(statusModal.dbId, user.id_usuario);
            setWaitingListStatus(data);
        } catch (err) {
            console.error('[WAITING LIST ERROR]', err);
            alert('Erro ao entrar na fila: ' + (err.message || 'Tente novamente.'));
        } finally {
            setIsProcessingWaitingList(false);
        }
    };

    const getStatusClass = (status) => {
        if (status === 'disponivel') return 'status-available';
        if (status === 'ocupado' || status === 'em-uso') return 'status-occupied';
        if (status === 'vistoria') return 'status-inspection';
        if (status === 'manutencao') return 'status-maintenance';
        if (status === 'reservado') return 'status-reserved';
        return '';
    };

    return (
        <div className="user-selection premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>{exchangeFor ? `Trocar para #${exchangeSize}` : 'Armários Disponíveis'}</h1>
                    <p>{exchangeFor ? `Selecione um novo armário ${exchangeSize.toLowerCase()} para realizar a troca.` : 'Encontre a melhor unidade para seu semestre.'}</p>
                </div>
            </header>

            <section className="filter-bar-premium">
                <div className="filter-group search">
                    <span className="filter-icon"><Search size={20} /></span>
                    <input
                        type="text"
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

                <div className="filter-group" style={{ opacity: exchangeSize ? 0.5 : 1, pointerEvents: exchangeSize ? 'none' : 'auto' }}>
                    <span className="filter-icon"><Maximize2 size={20} /></span>
                    <select
                        value={exchangeSize ? 'same' : filters.sizeId}
                        onChange={(e) => setFilters({ ...filters, sizeId: e.target.value })}
                        disabled={!!exchangeSize}
                    >
                        {exchangeSize ? (
                            <option value="same">Apenas {exchangeSize}</option>
                        ) : (
                            <>
                                <option value="All">Todos os Tamanhos</option>
                                {Object.entries(lookups.sizes || {}).map(([id, name]) => (
                                    <option key={id} value={id}>{name}</option>
                                ))}
                            </>
                        )}
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
                                    className={`locker-unit ${getStatusClass(locker.status)} ${selectedLocker?.id === locker.id ? 'active' : ''}`}
                                    onClick={() => openLockerDetails(locker)}
                                >
                                    <span className="unit-number">{locker.id}</span>
                                    {(locker.status === 'ocupado' || locker.status === 'reservado') && <Lock size={12} className="unit-icon" />}
                                    {locker.status === 'vistoria' && <Clock size={12} className="unit-icon" />}
                                    {locker.status === 'manutencao' && <Wrench size={12} className="unit-icon" />}
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
                                            setFilters({ floorId: 'All', sizeId: 'All', contract: 'Semestral' });
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

            {/* Selection Drawer / Side Panel */}
            <div className={`selection-drawer-overlay ${isPanelOpen ? 'open' : ''}`} onClick={() => setIsPanelOpen(false)}>
                <div className="selection-drawer" onClick={e => e.stopPropagation()}>
                    {selectedLocker && (
                        <>
                            <header className="drawer-header">
                                <div className="drawer-header-main">
                                    <div className="drawer-badge">ARMÁRIO #{selectedLocker.id}</div>
                                    <h2>Detalhes da Unidade</h2>
                                </div>
                                <button className="close-drawer-btn" onClick={() => setIsPanelOpen(false)}>
                                    <X size={20} />
                                </button>
                            </header>

                            <div className="drawer-content">
                                {selectedLocker.status === 'reservado' && (
                                    <div className="info-card-premium pink" style={{ marginBottom: '1.5rem' }}>
                                        <Sparkles size={18} />
                                        <div className="info-content">
                                            <h4>Unidade Reservada para Você!</h4>
                                            <p>Este armário foi liberado da fila de espera e está aguardando sua contratação.</p>
                                        </div>
                                    </div>
                                )}

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
                                                <label>Posição no Bloco</label>
                                                <span>{selectedLocker.position}</span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {!exchangeFor && (
                                    <div className="drawer-section">
                                        <h3 className="section-title">Planos Disponíveis</h3>
                                        <div className="contract-grid">
                                            <div
                                                className={`plan-card ${filters.contract === 'Semestral' ? 'active' : ''}`}
                                                onClick={() => setFilters({ ...filters, contract: 'Semestral' })}
                                            >
                                                <div className="plan-selection-info">
                                                    <span className="plan-name">Semestral</span>
                                                    <div className="plan-price-info">
                                                        <span className="currency">R$</span>
                                                        <span className="amount">{selectedLocker.priceSem}</span>
                                                    </div>
                                                </div>
                                                <div className="plan-radio" />
                                            </div>

                                            <div
                                                className={`plan-card ${filters.contract === 'Anual' ? 'active' : ''}`}
                                                onClick={() => setFilters({ ...filters, contract: 'Anual' })}
                                            >
                                                <div className="plan-selection-info">
                                                    <span className="plan-name">Anual</span>
                                                    <div className="plan-price-info">
                                                        <span className="currency">R$</span>
                                                        <span className="amount">{selectedLocker.priceAnn}</span>
                                                    </div>
                                                </div>
                                                <div className="plan-radio" />
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {exchangeFor && (
                                    <div className="drawer-section info-exchange">
                                        <div className="info-card-premium blue">
                                            <Clock size={18} />
                                            <div className="info-content">
                                                <h4>Taxa de Troca: R$ 20,00</h4>
                                                <p>Ao confirmar, seu armário atual será liberado para vistoria e o novo será ativado instantaneamente.</p>
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>

                            <footer className="drawer-footer">
                                <button
                                    className="confirm-selection-btn"
                                    disabled={selectedLocker.status !== 'disponivel' && selectedLocker.status !== 'reservado'}
                                    onClick={() => {
                                        if (exchangeFor) {
                                            navigate('/dashboard/checkout/payment', {
                                                state: {
                                                    locker: selectedLocker,
                                                    type: 'exchange',
                                                    exchangeInfo: {
                                                        rentalId: exchangeFor,
                                                        oldLockerId: oldLockerId
                                                    }
                                                }
                                            });
                                        } else {
                                            navigate('/dashboard/checkout/contract', {
                                                state: {
                                                    locker: {
                                                        ...selectedLocker,
                                                        plan: filters.contract
                                                    }
                                                }
                                            });
                                        }
                                    }}
                                >
                                    {(selectedLocker.status === 'disponivel' || selectedLocker.status === 'reservado') 
                                        ? (exchangeFor ? 'Confirmar Troca (R$ 20,00)' : 'Prosseguir para o Contrato') 
                                        : 'Unidade Indisponível'}
                                    <ChevronRight size={20} />
                                </button>
                            </footer>
                        </>
                    )}
                </div>
            </div>
            {/* Status Modal for non-available lockers */}
            {
                statusModal && (
                    <div className="status-modal-overlay" onClick={() => setStatusModal(null)}>
                        <div className="status-modal" onClick={e => e.stopPropagation()}>
                            <div className={`status-modal-icon ${getStatusClass(statusModal.status)}`}>
                                {(statusModal.status === 'ocupado' || statusModal.status === 'reservado') && <Lock size={40} />}
                                {statusModal.status === 'vistoria' && <Clock size={40} />}
                                {statusModal.status === 'manutencao' && <Wrench size={40} />}
                            </div>
                            <h2>Armário {statusModal.id}</h2>
                            <p className="status-modal-message">
                                {statusModal.status === 'ocupado' && 'Esta unidade já está ocupada por outro aluno para o período selecionado.'}
                                {statusModal.status === 'reservado' && 'Esta unidade está reservada para uma pessoa na fila de espera.'}
                                {statusModal.status === 'vistoria' && 'Unidade em processo de vistoria. Estará disponível em breve.'}
                                {statusModal.status === 'manutencao' && 'Unidade em manutenção técnica no momento.'}
                            </p>

                            {(statusModal.status === 'ocupado' || statusModal.status === 'reservado') && (
                                <div className="waiting-list-container">
                                    {waitingListStatus ? (
                                        <div className="waiting-list-status">
                                            <CheckCircle2 size={18} />
                                            {waitingListStatus.id_status === 1 ? 'Você está na fila de espera!' : 'Reserva ativa para você!'}
                                        </div>
                                    ) : (
                                        <button 
                                            className="btn-waiting-list" 
                                            onClick={handleJoinWaitingList}
                                            disabled={isProcessingWaitingList}
                                        >
                                            {isProcessingWaitingList ? <Loader2 size={18} className="spinner" /> : <Clock size={16} />}
                                            Entrar na Fila de Espera
                                        </button>
                                    )}
                                </div>
                            )}

                            <button className="status-modal-close" onClick={() => setStatusModal(null)} style={{ marginTop: '1rem' }}>
                                Entendido
                            </button>
                        </div>
                    </div>
                )
            }
        </div >
    );
};

export default UserLockerSelection;
