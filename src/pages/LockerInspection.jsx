import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import {
    ClipboardCheck,
    User as UserIcon,
    Calendar,
    AlertCircle,
    CheckCircle2,
    XSquare,
    Wrench,
    Search,
    Filter,
    Loader2,
    ChevronLeft,
    ChevronRight
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import CustomSelect from '../components/CustomSelect';
import './LockerInspection.css';

const LockerInspection = () => {
    const [inspections, setInspections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFloor, setSelectedFloor] = useState('all');
    const location = useLocation();
    const [activeTab, setActiveTab] = useState(location.state?.initialTab || 'vistoria'); // 'vistoria' or 'manutencao'
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 20;

    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [lockersRes, usersRes] = await Promise.all([
                dbService.lockers.getAll(),
                dbService.users.getAll()
            ]);

            const userMap = (usersRes.data || []).reduce((acc, u) => ({ ...acc, [u.id_usuario]: u.nm_usuario }), {});

            if (!lockersRes.error && lockersRes.data) {
                const targetLockerRecords = lockersRes.data.filter(l => {
                    const status = (l.situacao || l.dc_status || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    return status === 'vistoria' || status === 'aguardando-vistoria' || status === 'manutencao' || status === 'manutenção';
                });

                const lockerIds = targetLockerRecords.map(l => l.id_armario);

                // Fetch recent rentals for these specific lockers from t_locacao
                const rentalsRes = await dbService.rentals.getHistoryByLockers(lockerIds);
                const rentalsByLocker = (rentalsRes.data || []).reduce((acc, r) => {
                    // First entry for each locker will be the most recent due to order by dt_termino desc
                    if (!acc[r.id_armario]) acc[r.id_armario] = r;
                    return acc;
                }, {});

                const processedLockers = targetLockerRecords.map(l => {
                    const lastRental = rentalsByLocker[l.id_armario];
                    const rawStatus = (l.situacao || l.dc_status || '').normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
                    const category = (rawStatus === 'manutencao' || rawStatus === 'manutenção') ? 'manutencao' : 'vistoria';
                    
                    return {
                        id: (l.cd_armario || '').toString().padStart(3, '0'),
                        dbId: l.id_armario,
                        floor: l.nm_local || l.dc_andar || 'Térreo',
                        category,
                        prevUser: lastRental ? (userMap[lastRental.id_usuario] || `ID: ${lastRental.id_usuario}`) : 'Sem locação prévia',
                        dueDate: lastRental?.dt_termino ? (function (dt) {
                            const date = new Date(dt);
                            date.setMinutes(date.getMinutes() + date.getTimezoneOffset());
                            return date.toLocaleDateString();
                        })(lastRental.dt_termino) : 'N/A'
                    };
                });
                setInspections(processedLockers);
            }
        } catch (err) {
            console.error('[FETCH INSPECTIONS ERROR]', err);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const uniqueFloors = ['all', ...new Set(inspections.filter(i => i.category === activeTab).map(i => i.floor))];

    const filteredInspections = inspections.filter(item => {
        const matchesTab = item.category === activeTab;
        const matchesSearch = item.id.includes(searchTerm);
        const matchesFloor = selectedFloor === 'all' || item.floor === selectedFloor;
        return matchesTab && matchesSearch && matchesFloor;
    });

    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, selectedFloor, activeTab]);

    const totalPages = Math.ceil(filteredInspections.length / itemsPerPage);
    const paginatedInspections = filteredInspections.slice(
        (currentPage - 1) * itemsPerPage,
        currentPage * itemsPerPage
    );

    const handleAction = async (dbId, action) => {
        try {
            if (action === 'confirm') {
                await dbService.lockers.updateStatus(dbId, 'DISPONIVEL');
                await fetchData();
            } else {
                await dbService.lockers.updateStatus(dbId, 'MANUTENCAO');
                await fetchData();
            }
        } catch (error) {
            console.error('Error in inspection action:', error);
        }
    };

    return (
        <div className="locker-inspection-page premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>{activeTab === 'vistoria' ? 'Vistorias' : 'Manutenção'}</h1>
                    <p>
                        {activeTab === 'vistoria' 
                            ? 'Fila de liberação técnica de armários após o fim do contrato.' 
                            : 'Armários atualmente bloqueados para reparos mecânicos ou limpeza profunda.'}
                    </p>
                </div>
            </header>

            <div className="inspection-tabs" style={{ marginBottom: '1.5rem', width: '100%', display: 'flex', gap: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '0' }}>
                <button 
                    className={activeTab === 'vistoria' ? 'active' : ''} 
                    onClick={() => setActiveTab('vistoria')}
                    style={{ 
                        padding: '12px 16px', 
                        border: 'none', 
                        background: 'transparent', 
                        color: activeTab === 'vistoria' ? 'var(--primary)' : '#64748b', 
                        fontWeight: activeTab === 'vistoria' ? 600 : 500, 
                        borderBottom: activeTab === 'vistoria' ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: '-1px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                    }}
                >
                    <ClipboardCheck size={18} />
                    <span className="hide-on-mobile">Vistoria</span>
                </button>
                <button 
                    className={activeTab === 'manutencao' ? 'active' : ''} 
                    onClick={() => setActiveTab('manutencao')}
                    style={{ 
                        padding: '12px 16px', 
                        border: 'none', 
                        background: 'transparent', 
                        color: activeTab === 'manutencao' ? 'var(--primary)' : '#64748b', 
                        fontWeight: activeTab === 'manutencao' ? 600 : 500, 
                        borderBottom: activeTab === 'manutencao' ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: '-1px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                    }}
                >
                    <Wrench size={18} />
                    <span className="hide-on-mobile">Manutenção</span>
                </button>
            </div>

            <div className="admin-filters">
                <div className="search-group">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Pesquisar armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                
                <CustomSelect
                    icon={<Filter size={18} />}
                    label="Andar"
                    value={selectedFloor}
                    options={uniqueFloors.reduce((acc, floor) => ({
                        ...acc,
                        [floor]: floor === 'all' ? 'Todos os andares' : floor
                    }), {})}
                    onChange={(val) => setSelectedFloor(val)}
                />
            </div>

            <div className="inspection-container card">
                {isLoading ? (
                    <div className="loading-state-matrix" style={{ padding: '40px', textAlign: 'center' }}>
                        <Loader2 className="spinner" size={40} />
                        <p>Carregando vistorias...</p>
                    </div>
                ) : (
                    <table className="inspection-table-simple">
                        <thead>
                            <tr>
                                <th>Armário</th>
                                <th>Responsável Anterior</th>
                                <th>{activeTab === 'vistoria' ? 'Vencimento' : 'Data da Ocorrência'}</th>
                                <th className="actions-cell text-right">Ações</th>
                            </tr>
                        </thead>
                            <tbody>
                                {paginatedInspections.map((item) => (
                                    <tr 
                                        key={item.dbId}
                                    >
                                    <td className="col-armario">
                                        <div className="unified-locker-badge">
                                            <span className="locker-id-part">{item.id}</span>
                                            <div className="floor-part">
                                                <span>{item.floor}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="col-user">
                                        <div className="info-item">
                                            <UserIcon size={14} className="icon-sub" />
                                            <span className="txt-main">{item.prevUser}</span>
                                        </div>
                                    </td>
                                    <td className="col-date">
                                        <div className="info-item">
                                            <Calendar size={14} className="icon-sub" />
                                            <span className="txt-sub">{item.dueDate}</span>
                                        </div>
                                    </td>
                                    <td className="actions-cell">
                                        {activeTab === 'vistoria' ? (
                                            <div className="action-row-compact">
                                                <button
                                                    className="btn-compact-success"
                                                    onClick={() => handleAction(item.dbId, 'confirm')}
                                                >
                                                    <CheckCircle2 size={16} />
                                                    <span>Liberar</span>
                                                </button>
                                                <button
                                                    className="btn-compact-warning"
                                                    onClick={() => handleAction(item.dbId, 'problem')}
                                                >
                                                    <Wrench size={16} />
                                                    <span className="hide-on-mobile">Manutenção</span>
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="action-row-compact">
                                                <button
                                                    className="btn-compact-success"
                                                    onClick={() => handleAction(item.dbId, 'confirm')}
                                                >
                                                    <CheckCircle2 size={16} />
                                                    <span>Reparo Concluído</span>
                                                </button>
                                            </div>
                                        )}
                                    </td>
                                    </tr>
                                ))}
                            {filteredInspections.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="empty-state">Nenhum resultado encontrado.</td>
                                </tr>
                            )}
                            </tbody>
                    </table>
                )}
            </div>

            {!isLoading && filteredInspections.length > 0 && (
                <div className="pagination-wrapper">
                    <div className="pagination-info">
                        Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> - <strong>{Math.min(currentPage * itemsPerPage, filteredInspections.length)}</strong> de <strong>{filteredInspections.length}</strong> registros
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
    );
};

export default LockerInspection;