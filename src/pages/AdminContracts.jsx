import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { IoMdPricetag } from 'react-icons/io';
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
    User as UserIcon,
    X,
    Loader2,
    CheckCircle2,
    Clock,
    AlertTriangle,
    MinusCircle,
    ChevronRight,
    ChevronLeft,
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
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const mapRentalData = (data) => {
        const today = new Date(2026, 2, 16);
        const mapped = [];
        
        for (let i = 0; i < data.length; i++) {
            const contrato = data[i];
            
            let startDate = null;
            if (contrato.dt_inicio) {
                const [y, m, d] = contrato.dt_inicio.split('-').map(Number);
                startDate = new Date(y, m - 1, d);
            }

            let expirationDate = null;
            if (contrato.dt_vencimento) {
                const [y, m, d] = contrato.dt_vencimento.split('-').map(Number);
                expirationDate = new Date(y, m - 1, d);
            }

            let finalStatus = contrato.id_status === 1 ? 'ATIVA' : contrato.dc_status_locacao || 'ENCERRADA';
            if (finalStatus === 'ATIVA' && expirationDate && expirationDate < today) {
                finalStatus = 'VENCIDA';
            }

            mapped.push({
                id: contrato.id_locacao,
                lockerId: contrato.id_armario,
                lockerNumber: String(contrato.nr_armario || 0).padStart(3, '0'),
                floor: contrato.dc_andar || 'Térreo',
                student: contrato.nm_aluno || 'Estudante não identificado',
                contractType: (contrato.dc_tipo_contrato || 'Personalizado').toUpperCase(),
                startDate,
                expirationDate,
                startDateFormatted: startDate ? startDate.toLocaleDateString() : '---',
                expirationDateFormatted: expirationDate ? expirationDate.toLocaleDateString() : '---',
                status: finalStatus,
                paymentStatus: contrato.dc_status_pagamento || 'PAGO',
                sizePath: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase(),
                displaySize: String(contrato.dc_tamanho || 'PEQUENO').toUpperCase() === 'GRANDE' ? 'Grande' : 'Pequeno'
            });
        }
        return mapped;
    };

    const fetchRentals = async (showLoading = true) => {
        try {
            if (showLoading) setIsLoading(true);
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
                // Mapping can be heavy, but it's done once.
                const mapped = mapRentalData(data);
                setRentals(mapped);
                
                // Crucial step: Wait for the state update to be processed by the browser
                // before hiding the loading indicator. This avoids the "static frozen loading" look.
                requestAnimationFrame(() => {
                    setTimeout(() => setIsLoading(false), 0);
                });
            } else {
                setRentals([]);
                setIsLoading(false);
            }
        } catch (err) {
            console.error('Runtime Error:', err);
            setError(`Erro inesperado: ${err.message}`);
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchRentals();
    }, []);
    const resetFilters = () => {
        setSearchTerm('');
        setFilters({ status: 'All', contractType: 'All', floor: 'All' });
        setCurrentPage(1);
    };

    const filteredRentals = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        return rentals.filter(rental => {
            const matchesSearch = !term ||
                rental.student.toLowerCase().includes(term) ||
                rental.lockerNumber.includes(term);

            const matchesStatus = filters.status === 'All' || rental.status === filters.status;
            const matchesType = filters.contractType === 'All' || rental.contractType === filters.contractType;
            const matchesFloor = filters.floor === 'All' || rental.floor === filters.floor;

            return matchesSearch && matchesStatus && matchesType && matchesFloor;
        });
    }, [rentals, searchTerm, filters]);

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filters]);

    useEffect(() => {
        const needsLock = isPanelOpen || showSwapModal;
        
        if (needsLock) {
            document.documentElement.classList.add('no-scroll');
            document.body.classList.add('no-scroll');
            
            const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;
            document.body.style.paddingRight = `${scrollBarWidth}px`;
        } else {
            document.documentElement.classList.remove('no-scroll');
            document.body.classList.remove('no-scroll');
            document.body.style.paddingRight = '';
        }
        return () => {
            document.documentElement.classList.remove('no-scroll');
            document.body.classList.remove('no-scroll');
            document.body.style.paddingRight = '';
        };
    }, [isPanelOpen, showSwapModal]);

    const handleCloseSwapModal = () => {
        setShowSwapModal(false);
    };

    const handleClosePanel = () => {
        setIsPanelOpen(false);
        setSelectedRental(null);
    };

    const openDetails = (rental) => {
        setSelectedRental(rental);
        setIsPanelOpen(true);
    };

    const totalPages = Math.ceil(filteredRentals.length / itemsPerPage);
    const paginatedRentals = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRentals.slice(start, start + itemsPerPage);
    }, [filteredRentals, currentPage]);

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
            'Início': r.startDateFormatted,
            'Vencimento': r.expirationDateFormatted,
            'Status': r.status,
            'Pagamento': r.paymentStatus
        }));

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Contratos");
        XLSX.writeFile(wb, `contratos_camubox_${new Date().toISOString().split('T')[0]}.xlsx`);
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
                        type="search"
                        name="q"
                        placeholder="Buscar por aluno ou número do armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        autoCorrect="off"
                        autoCapitalize="off"
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
                    <span className="filter-icon"><IoMdPricetag size={20} /></span>
                    <select value={filters.contractType} onChange={e => setFilters({ ...filters, contractType: e.target.value })}>
                        <option value="All">Todos os Planos</option>
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
                <div className="inspection-container card">
                    {isLoading ? (
                        <div className="loading-state-matrix" style={{ padding: '40px', textAlign: 'center' }}>
                            <Loader2 className="spinner" size={40} />
                            <p>Carregando contratos...</p>
                        </div>
                    ) : (
                        <table className="inspection-table-simple">
                            <thead>
                                <tr>
                                    <th>Armário</th>
                                    <th>Aluno</th>
                                    <th>Tipo de Contrato</th>
                                    <th>Vigência</th>
                                    <th className="col-status text-right">Status</th>
                                </tr>
                            </thead>
                            <AnimatePresence mode="wait">
                                <motion.tbody key={currentPage + filters.status + filters.contractType + searchTerm}>
                                    {paginatedRentals.map((rental, index) => (
                                        <motion.tr 
                                            key={rental.id} 
                                            onClick={() => openDetails(rental)}
                                            className="clickable-row"
                                            initial={{ opacity: 0, y: 10 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            exit={{ opacity: 0, scale: 0.95 }}
                                            transition={{ duration: 0.2, delay: index * 0.03 }}
                                        >
                                        <td className="col-armario">
                                            <div className="unified-locker-badge">
                                                <span className="locker-id-part">{rental.lockerNumber}</span>
                                                <div className="floor-part">
                                                    <MapPin size={10} />
                                                    <span>{rental.floor}</span>
                                                </div>
                                            </div>
                                        </td>
                                        
                                        <td className="col-user">
                                            <div className="info-item">
                                                <UserIcon size={14} className="icon-sub" />
                                                <div className="user-stack">
                                                    <span className="txt-main">{rental.student}</span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="col-type">
                                            <div className="info-item">
                                                <div className="type-badge-minimal">
                                                    <FileText size={14} className="icon-sub" />
                                                    <span className="txt-main">{rental.contractType}</span>
                                                </div>
                                            </div>
                                        </td>

                                        <td className="col-date">
                                            <div className="info-item">
                                                <Calendar size={14} className="icon-sub" />
                                                <span className="txt-sub">{rental.expirationDateFormatted}</span>
                                            </div>
                                        </td>

                                        <td className="col-status actions-cell">
                                            {getStatusBadge(rental.status)}
                                        </td>
                                        </motion.tr>
                                    ))}
                                    {filteredRentals.length === 0 && (
                                        <motion.tr
                                            initial={{ opacity: 0 }}
                                            animate={{ opacity: 1 }}
                                        >
                                            <td colSpan="5" className="empty-state">Nenhum resultado encontrado.</td>
                                        </motion.tr>
                                    )}
                                </motion.tbody>
                            </AnimatePresence>
                        </table>
                    )}
                </div>
                
                {!isLoading && filteredRentals.length > 0 && (
                    <div className="pagination-wrapper">
                        <div className="pagination-info">
                            Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> - <strong>{Math.min(currentPage * itemsPerPage, filteredRentals.length)}</strong> de <strong>{filteredRentals.length}</strong> contratos
                        </div>
                        <div className="pagination-controls simple">
                            <button 
                                className="pagination-btn" 
                                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} 
                                disabled={currentPage === 1}
                            >
                                <ChevronLeft size={18} />
                                <span className="btn-text">Anterior</span>
                            </button>
                            
                            <div className="pagination-status">
                                <span className="mobile-only">Pág. </span>
                                <span className="desktop-only">Página </span>
                                <strong>{currentPage}</strong> de <strong>{totalPages}</strong>
                            </div>

                            <button 
                                className="pagination-btn" 
                                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} 
                                disabled={currentPage === totalPages}
                            >
                                <span className="btn-text">Próximo</span>
                                <ChevronRight size={18} />
                            </button>
                        </div>
                    </div>
                )}
                
            </div>

            {/* Details Side Panel */}
                {isPanelOpen && (
                    <div 
                        className="details-panel-overlay" 
                        onClick={handleClosePanel}
                    >
                        <div 
                            className="details-panel" 
                            onClick={e => e.stopPropagation()}
                        >
                            <header className="panel-header">
                                <h2>Detalhes do Contrato</h2>
                                <button className="close-btn" onClick={handleClosePanel}>
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
                                        <h3><UserIcon size={18} /> Aluno Responsável</h3>
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
                                                <span>{selectedRental.startDateFormatted}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Término</label>
                                                <span>{selectedRental.expirationDateFormatted}</span>
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
                    <div 
                        className="details-panel-overlay swap-overlay" 
                        onClick={handleCloseSwapModal}
                    >
                        <div 
                            className="details-panel swap-modal" 
                            onClick={e => e.stopPropagation()}
                        >
                            <header className="panel-header">
                                <h2>Selecionar Novo Armário</h2>
                                <button className="close-btn" onClick={handleCloseSwapModal}>
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
