import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    Search,
    Filter,
    Eye,
    XCircle,
    RotateCcw,
    CreditCard,
    FileText,
    Download,
    Calendar,
    User,
    X,
    Loader2,
    CheckCircle2,
    Clock,
    AlertTriangle,
    MinusCircle,
    ChevronRight,
    MapPin
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import * as XLSX from 'xlsx';
import './AdminContracts.css';

const AdminContracts = () => {
    const [rentals, setRentals] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        status: 'All',
        contractType: 'All',
        floor: 'All'
    });
    const [selectedRental, setSelectedRental] = useState(null);
    const [isPanelOpen, setIsPanelOpen] = useState(false);
    const [config, setConfig] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showSwapModal, setShowSwapModal] = useState(false);
    const [availableLockers, setAvailableLockers] = useState([]);
    const [isFetchingAvailable, setIsFetchingAvailable] = useState(false);
    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null });
    const [error, setError] = useState(null);

    useEffect(() => {
        const fetchRentals = async () => {
            try {
                setIsLoading(true);
                setError(null);
                const [rentalsRes, configRes] = await Promise.all([
                    dbService.rentals.getAll(),
                    dbService.lockers.getConfig()
                ]);

                if (configRes.data) setConfig(configRes.data);

                const { data, dbError } = rentalsRes;

                if (dbError) {
                    console.error('Database Error:', dbError);
                    setError(`Erro no banco de dados: ${dbError.message}`);
                    setIsLoading(false);
                    return;
                }

                if (data) {
                    const mappedData = data.map((contrato) => ({
                        id: contrato.id_locacao,
                        lockerId: contrato.id_armario,
                        lockerNumber: String(contrato.nr_armario || 0).padStart(3, '0'),
                        floor: contrato.dc_andar || 'Térreo',
                        student: contrato.nm_aluno || 'Estudante não identificado',
                        ra: contrato.nm_ra || '---',
                        contractType: (contrato.dc_tipo_contrato || 'Personalizado').toUpperCase(),
                        startDate: (function() {
                            if (!contrato.dt_inicio) return null;
                            const [y, m, d] = contrato.dt_inicio.split('-').map(Number);
                            return new Date(y, m - 1, d);
                        })(),
                        expirationDate: (function() {
                            if (!contrato.dt_vencimento) return null;
                            const [y, m, d] = contrato.dt_vencimento.split('-').map(Number);
                            return new Date(y, m - 1, d);
                        })(),
                        status: contrato.id_status === 1 ? 'ATIVA' : contrato.dc_status_locacao || 'ENCERRADA',
                        paymentStatus: contrato.dc_status_pagamento || 'PAGO',
                        sizePath: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase(),
                        displaySize: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase() === 'GRANDE' ? 'Grande' : 'Pequeno'
                    }));
                    setRentals(mappedData);
                } else {
                    setRentals([]);
                }
            } catch (err) {
                console.error('Runtime Error:', err);
                setError(`Erro inesperado: ${err.message}`);
            } finally {
                setIsLoading(false);
            }
        };
        fetchRentals();
    }, []);

    const fetchRentals = async () => {
        try {
            setIsLoading(true);
            const { data } = await dbService.rentals.getAll();
            if (data) {
                const mappedData = data.map((contrato) => ({
                    id: contrato.id_locacao,
                    lockerId: contrato.id_armario,
                    lockerNumber: String(contrato.nr_armario || 0).padStart(3, '0'),
                    floor: contrato.dc_andar || 'Térreo',
                    student: contrato.nm_aluno || 'Estudante não identificado',
                    ra: contrato.nm_ra || '---',
                    contractType: (contrato.dc_tipo_contrato || 'Personalizado').toUpperCase(),
                    startDate: (function() {
                        if (!contrato.dt_inicio) return null;
                        const [y, m, d] = contrato.dt_inicio.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    })(),
                    expirationDate: (function() {
                        if (!contrato.dt_vencimento) return null;
                        const [y, m, d] = contrato.dt_vencimento.split('-').map(Number);
                        return new Date(y, m - 1, d);
                    })(),
                    status: contrato.id_status === 1 ? 'ATIVA' : contrato.dc_status_locacao || 'ENCERRADA',
                    paymentStatus: contrato.dc_status_pagamento || 'PAGO',
                    sizePath: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase(),
                    displaySize: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase() === 'GRANDE' ? 'Grande' : 'Pequeno'
                }));
                setRentals(mappedData);
            }
        } catch (err) {
            console.error('Error refreshing rentals:', err);
        } finally {
            setIsLoading(false);
        }
    };
    const resetFilters = () => {
        setSearchTerm('');
        setFilters({ status: 'All', contractType: 'All', floor: 'All' });
    };

    const filteredRentals = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return rentals.filter(rental => {
            const matchesSearch = !term ||
                rental.student.toLowerCase().includes(term) ||
                rental.lockerNumber.includes(term) ||
                rental.ra.toLowerCase().includes(term);

            const matchesStatus = filters.status === 'All' || rental.status === filters.status;
            const matchesType = filters.contractType === 'All' || rental.contractType === filters.contractType;
            const matchesFloor = filters.floor === 'All' || rental.floor.includes(filters.floor);

            return matchesSearch && matchesStatus && matchesType && matchesFloor;
        });
    }, [rentals, searchTerm, filters]);

    const getStatusBadge = (status) => {
        switch (status) {
            case 'ATIVA':
                return <span className="status-badge active"><CheckCircle2 size={12} /> Ativo</span>;
            case 'VENCIDA':
                return <span className="status-badge expired"><AlertTriangle size={12} /> Vencido</span>;
            case 'AGUARDANDO_VISTORIA':
                return <span className="status-badge pending"><Clock size={12} /> Vistoria</span>;
            case 'CANCELADA':
            case 'ENCERRADA':
                return <span className="status-badge cancelled"><XCircle size={12} /> {status === 'ENCERRADA' ? 'Encerrado' : 'Cancelado'}</span>;
            case 'GRATUITA':
                return <span className="status-badge free"><MinusCircle size={12} /> Gratuito</span>;
            default:
                return <span className="status-badge">{status}</span>;
        }
    };

    const handleExport = () => {
        const rows = filteredRentals.map(r => ({
            'Armário': r.lockerNumber,
            'Andar': r.floor,
            'Aluno': r.student,
            'Tipo': r.contractType,
            'Início': new Date(r.startDate).toLocaleDateString(),
            'Vencimento': new Date(r.expirationDate).toLocaleDateString(),
            'Status': r.status,
            'Pagamento': r.paymentStatus
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contratos");
        XLSX.writeFile(wb, `contratos_camubox_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const openDetails = (rental) => {
        setSelectedRental(rental);
        setIsPanelOpen(true);
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

    const handleTerminate = async () => {
        if (!selectedRental) return;
        
        showModal({
            title: 'Encerrar Contrato',
            message: `Tem certeza que deseja encerrar o contrato de ${selectedRental.student}? Esta ação não pode ser desfeita.`,
            type: 'confirm',
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const { error } = await dbService.rentals.terminate(selectedRental.id, selectedRental.lockerId);
                    if (error) throw error;
                    
                    setIsPanelOpen(false);
                    await fetchRentals();
                    showModal({
                        title: 'Sucesso!',
                        message: 'Contrato encerrado com sucesso.',
                        type: 'success'
                    });
                } catch (err) {
                    showModal({
                        title: 'Erro',
                        message: 'Erro ao encerrar contrato: ' + err.message,
                        type: 'error'
                    });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    const handleSwapLockerStart = async () => {
        if (!selectedRental) return;
        setShowSwapModal(true);
        setIsFetchingAvailable(true);
        try {
            const { data } = await dbService.lockers.getAll();
            if (data) {
                const normalizeStatus = (str) => {
                    if (!str) return 'disponivel';
                    return str.normalize("NFD")
                              .replace(/[\u0300-\u036f]/g, "")
                              .toLowerCase()
                              .trim()
                              .replace(/\s+/g, '-');
                };

                // Filter only available lockers of the same size, excluding the current one
                const available = data.filter(l => {
                    const status = normalizeStatus(l.situacao || l.dc_status);
                    const lockerSize = (l.nm_tamanho || l.dc_tamanho || 'PEQUENO').toUpperCase();
                    
                    // Strict availability check
                    const isAvailable = (status === 'disponivel' || status === 'vago');
                    const isSameSize = lockerSize === selectedRental.sizePath;
                    const isDifferentLocker = l.id_armario !== selectedRental.lockerId;
                    
                    return isAvailable && isSameSize && isDifferentLocker;
                }).sort((a, b) => {
                    // Sort by floor then number
                    if (a.nm_local !== b.nm_local) return (a.nm_local || '').localeCompare(b.nm_local || '');
                    return (parseInt(a.nr_armario) || 0) - (parseInt(b.nr_armario) || 0);
                });
                setAvailableLockers(available);
            }
        } catch (err) {
            console.error('Error fetching available lockers:', err);
        } finally {
            setIsFetchingAvailable(false);
        }
    };

    const confirmSwap = async (newLocker) => {
        if (!selectedRental) return;
        
        showModal({
            title: 'Confirmar Troca',
            message: `Deseja mudar o contrato para o armário #${newLocker.nr_armario || newLocker.cd_armario}?`,
            type: 'confirm',
            onConfirm: async () => {
                setIsSubmitting(true);
                try {
                    const { error } = await dbService.rentals.updateLocker(
                        selectedRental.id,
                        selectedRental.lockerId,
                        newLocker.id_armario
                    );
                    if (error) throw error;
                    
                    setShowSwapModal(false);
                    setIsPanelOpen(false);
                    await fetchRentals();
                    showModal({
                        title: 'Sucesso!',
                        message: 'Troca de armário realizada com sucesso.',
                        type: 'success'
                    });
                } catch (err) {
                    showModal({
                        title: 'Erro',
                        message: 'Erro ao trocar armário: ' + err.message,
                        type: 'error'
                    });
                } finally {
                    setIsSubmitting(false);
                }
            }
        });
    };

    return (
        <div className="admin-contracts premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Contratos de Armários</h1>
                    <p>Gerenciamento centralizado de todas as locações do sistema.</p>
                </div>
                <button className="secondary-btn" onClick={handleExport}>
                    <Download size={18} />
                    Exportar Excel
                </button>
            </header>

            {/* Filter Bar */}
            <div className="filter-bar-premium">
                <div className="filter-group search">
                    <span className="filter-icon"><Search size={20} /></span>
                    <input
                        type="text"
                        placeholder="Buscar por aluno ou número do armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <div className="filter-group">
                    <span className="filter-icon"><Filter size={20} /></span>
                    <select value={filters.status} onChange={e => setFilters({ ...filters, status: e.target.value })}>
                        <option value="All">Todos os Status</option>
                        <option value="ATIVA">Ativos</option>
                        <option value="ENCERRADA">Encerrados</option>
                    </select>
                </div>

                <div className="filter-group">
                    <span className="filter-icon"><div className="locker-icon-standard" style={{ width: '20px', height: '20px' }} /></span>
                    <select value={filters.contractType} onChange={e => setFilters({ ...filters, contractType: e.target.value })}>
                        <option value="All">Todos os Tipos</option>
                        <option value="SEMESTRAL">Semestral</option>
                        <option value="ANUAL">Anual</option>
                        <option value="GRATUIDADE">Gratuidade</option>
                    </select>
                </div>
            </div>

            {/* Error State */}
            {error && (
                <div className="error-banner card">
                    <AlertTriangle size={20} />
                    <p>{error}</p>
                    <button onClick={() => window.location.reload()} className="text-btn">Recarregar</button>
                </div>
            )}

            {/* Data Area */}
            <div className="data-container">
                {isLoading ? (
                    <div className="loading-state">
                        <Loader2 className="spinner" size={40} />
                        <p>Sincronizando contratos...</p>
                    </div>
                ) : (
                    <div className="contracts-list">
                        {/* List Header - Visible only on Desktop */}
                        <div className="list-header">
                            <div className="col-locker">Armário</div>
                            <div className="col-student">Aluno</div>
                            <div className="col-type">Tipo</div>
                            <div className="col-dates">Vigência</div>
                            <div className="col-status">Status</div>
                        </div>

                        <div className="contracts-list-entries">
                            {filteredRentals.map((rental) => (
                                <div 
                                    key={rental.id} 
                                    className="contract-card"
                                    onClick={() => openDetails(rental)}
                                >
                                    <div className="card-main-info">
                                        <div className="locker-info">
                                            <span className="locker-id-text">{rental.floor} - {rental.lockerNumber}</span>
                                            <span className={`size-badge ${rental.sizePath.toLowerCase()}`}>
                                                {rental.displaySize}
                                            </span>
                                        </div>

                                        <div className="student-info">
                                            <span className="student-name">{rental.student}</span>
                                        </div>
                                    </div>

                                    <div className="card-secondary-info">
                                        <div className="info-item type">
                                            <label>Tipo</label>
                                            <strong>{rental.contractType}</strong>
                                        </div>
                                        <div className="info-item dates">
                                            <label>Vencimento</label>
                                            <span>{new Date(rental.expirationDate).toLocaleDateString()}</span>
                                        </div>
                                        <div className="info-item status">
                                            {getStatusBadge(rental.status)}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
                
                {!isLoading && filteredRentals.length === 0 && (
                    <div className="empty-state-premium">
                        <div className="empty-state-icon">
                            <FileText size={40} strokeWidth={1.5} />
                        </div>
                        <div className="empty-state-content">
                            <h3>Nenhum contrato encontrado</h3>
                            <p>Tente ajustar o termo da pesquisa ou os filtros ativos para encontrar o que procura.</p>
                            <button className="btn-reset-filters" onClick={resetFilters}>
                                Limpar todos os filtros
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Details Side Panel */}
                {isPanelOpen && (
                    <div className="details-panel-overlay" onClick={() => setIsPanelOpen(false)}>
                        <div 
                            className="details-panel" 
                            onClick={e => e.stopPropagation()}
                        >
                            <header className="panel-header">
                                <h2>Detalhes do Contrato</h2>
                                <button className="close-btn" onClick={() => setIsPanelOpen(false)}>
                                    <X size={20} />
                                </button>
                            </header>

                            {selectedRental && (
                                <div className="panel-content">
                                    <section className="detail-section">
                                        <h3><div className="locker-icon-standard" style={{ width: '18px', height: '18px', marginRight: '8px' }} /> Dados do Armário</h3>
                                        <div className="detail-grid">
                                            <div className="detail-item full">
                                                <label>Localização / Número</label>
                                                <span>{selectedRental.floor} — #{selectedRental.lockerNumber}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Tamanho</label>
                                                <span>{selectedRental.displaySize}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Identificador</label>
                                                <span>ID {selectedRental.id}</span>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="detail-section">
                                        <h3><User size={18} /> Aluno Responsável</h3>
                                        <div className="detail-grid">
                                            <div className="detail-item full">
                                                <label>Nome Completo</label>
                                                <strong>{selectedRental.student}</strong>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="detail-section">
                                        <h3><Calendar size={18} /> Vigência do Contrato</h3>
                                        <div className="detail-grid">
                                            <div className="detail-item">
                                                <label>Tipo de Plano</label>
                                                <span>{selectedRental.contractType}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Status Atual</label>
                                                {getStatusBadge(selectedRental.status)}
                                            </div>
                                            <div className="detail-item">
                                                <label>Início</label>
                                                <span>{new Date(selectedRental.startDate).toLocaleDateString()}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Término</label>
                                                <span>{new Date(selectedRental.expirationDate).toLocaleDateString()}</span>
                                            </div>
                                        </div>
                                    </section>

                                    <section className="detail-section">
                                        <h3><CreditCard size={18} /> Informações Financeiras</h3>
                                        <div className="detail-grid">
                                            <div className="detail-item">
                                                <label>Status</label>
                                                <span className={`payment-status ${selectedRental.paymentStatus.toLowerCase()}`}>
                                                    {selectedRental.paymentStatus}
                                                </span>
                                            </div>
                                             <div className="detail-item">
                                                 <label>Valor da Taxa</label>
                                                 <span>
                                                     {selectedRental.contractType === 'GRATUIDADE' ? 'R$ 0,00' : (function() {
                                                         if (!config) return 'Carregando...';
                                                         const isAnual = selectedRental.contractType === 'ANUAL';
                                                         const isPequeno = selectedRental.sizePath === 'PEQUENO';
                                                         
                                                         let valor = 0;
                                                         if (isAnual) {
                                                             valor = isPequeno ? config.vl_pequeno_anual : config.vl_grande_anual;
                                                         } else {
                                                             valor = isPequeno ? config.vl_pequeno_semestral : config.vl_grande_semestral;
                                                         }
                                                         
                                                         return `R$ ${parseFloat(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                                                     })()}
                                                 </span>
                                             </div>
                                        </div>
                                    </section>

                                    {selectedRental.status === 'ATIVA' && (
                                        <div className="panel-actions">
                                            <button 
                                                className="full-width-btn btn-secondary"
                                                onClick={handleSwapLockerStart}
                                                disabled={isSubmitting}
                                            >
                                                <RotateCcw size={18} />
                                                Trocar de Armário
                                            </button>
                                            <button 
                                                className="full-width-btn btn-danger"
                                                onClick={handleTerminate}
                                                disabled={isSubmitting}
                                            >
                                                <XCircle size={18} />
                                                Encerrar Contrato
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            
            {/* Swap Locker Modal */}
                {showSwapModal && (
                    <div className="details-panel-overlay swap-overlay" onClick={() => setShowSwapModal(false)}>
                        <div 
                            className="details-panel swap-modal" 
                            onClick={e => e.stopPropagation()}
                        >
                            <header className="panel-header">
                                <h2>Selecionar Novo Armário</h2>
                                <button className="close-btn" onClick={() => setShowSwapModal(false)}>
                                    <X size={20} />
                                </button>
                            </header>
                            
                            <div className="panel-content">
                                <p className="modal-intro">
                                    Mostrando armários <strong>{selectedRental.displaySize}</strong> disponíveis.
                                </p>
                                
                                {isFetchingAvailable ? (
                                    <div className="loading-state">
                                        <Loader2 className="spinner" size={32} />
                                    </div>
                                ) : (
                                    <div className="swap-lockers-list">
                                        {availableLockers.length > 0 ? (
                                            availableLockers.map(l => (
                                                <div 
                                                    key={l.id_armario} 
                                                    className="swap-locker-card" 
                                                    onClick={() => confirmSwap(l)}
                                                >
                                                    <div className="locker-info-main">
                                                        <div className="locker-icon-box">
                                                            <div className="locker-icon-standard" style={{ width: '22px', height: '22px' }} />
                                                        </div>
                                                        <div className="locker-details-text">
                                                            <div className="locker-number-row">
                                                                <span className="locker-label">ARMÁRIO</span>
                                                                <span className="locker-number">#{String(l.nr_armario || l.cd_armario).padStart(3, '0')}</span>
                                                            </div>
                                                            <div className="locker-floor-row">
                                                                <MapPin size={12} />
                                                                <span>{l.nm_local || l.dc_andar || 'Térreo'}</span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                    <div className="locker-action-indicator">
                                                        <ChevronRight size={20} />
                                                    </div>
                                                    </div>
                                            ))
                                        ) : (
                                            <div className="empty-msg-container">
                                                <Search size={32} />
                                                <p>Nenhum armário disponível deste tamanho.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            

            {/* Custom Action Modal */}
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

export default AdminContracts;
