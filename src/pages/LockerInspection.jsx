import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    ClipboardCheck,
    MapPin,
    User as UserIcon,
    Calendar,
    AlertCircle,
    CheckCircle2,
    XSquare,
    Wrench,
    Search,
    Filter,
    Loader2
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './LockerInspection.css';

const LockerInspection = () => {
    const [inspections, setInspections] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedFloor, setSelectedFloor] = useState('all');
    const [activeTab, setActiveTab] = useState('vistoria'); // 'vistoria' or 'manutencao'

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
                        id: (l.nr_armario || l.cd_armario || '').toString().padStart(3, '0'),
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
                        color: activeTab === 'vistoria' ? '#2563eb' : '#64748b', 
                        fontWeight: activeTab === 'vistoria' ? 600 : 500, 
                        borderBottom: activeTab === 'vistoria' ? '2px solid #2563eb' : '2px solid transparent',
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
                        color: activeTab === 'manutencao' ? '#2563eb' : '#64748b', 
                        fontWeight: activeTab === 'manutencao' ? 600 : 500, 
                        borderBottom: activeTab === 'manutencao' ? '2px solid #2563eb' : '2px solid transparent',
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

            <div className="filter-bar">
                <div className="search-box">
                    <Search size={18} className="search-icon" />
                    <input
                        type="text"
                        placeholder="Pesquisar armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        autoComplete="off"
                        spellCheck="false"
                        autoCorrect="off"
                        autoCapitalize="off"
                    />
                </div>
                <div className="filter-group">
                    <Filter size={18} className="filter-icon" />
                    <select
                        value={selectedFloor}
                        onChange={(e) => setSelectedFloor(e.target.value)}
                    >
                        {uniqueFloors.map(floor => (
                            <option key={floor} value={floor}>
                                {floor === 'all' ? 'Todos os andares' : floor}
                            </option>
                        ))}
                    </select>
                </div>
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
                        <AnimatePresence mode="wait">
                            <motion.tbody key={activeTab}>
                                {filteredInspections.map((item, index) => (
                                    <motion.tr 
                                        key={item.dbId}
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.95 }}
                                        transition={{ duration: 0.2, delay: index * 0.03 }}
                                    >
                                    <td className="col-armario">
                                        <div className="unified-locker-badge">
                                            <span className="locker-id-part">{item.id}</span>
                                            <div className="floor-part">
                                                <MapPin size={10} />
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
                                                    <span>Manutenção</span>
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
                                    </motion.tr>
                                ))}
                            {filteredInspections.length === 0 && (
                                <tr>
                                    <td colSpan="4" className="empty-state">Nenhum resultado encontrado.</td>
                                </tr>
                            )}
                            </motion.tbody>
                        </AnimatePresence>
                    </table>
                )}
            </div>
        </div>
    );
};

export default LockerInspection;