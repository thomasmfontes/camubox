import { useState, useEffect, useMemo } from 'react';
import {
    Search,
    Maximize2,
    Clock,
    Wrench,
    Loader2,
    X,
    Lock,
    User,
    Calendar,
    Unlock,
    AlertCircle,
    CheckCircle2,
    AlertTriangle,
    XCircle,
    ShieldOff,
    Users,
    Phone,
    HelpCircle,
    RotateCcw,
    StickyNote
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import CustomSelect from '../components/CustomSelect';
import SearchableSelect from '../components/SearchableSelect';
import LockerGuideModal from '../components/LockerGuideModal';
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

    const [modalConfig, setModalConfig] = useState({ isOpen: false, title: '', message: '', type: 'confirm', onConfirm: null, isLoading: false });
    const [toast, setToast] = useState(null);
    const [isGuideOpen, setIsGuideOpen] = useState(false);
    const [leagues, setLeagues] = useState([]);
    const [selectedLeagueId, setSelectedLeagueId] = useState('');
    const [lockerDescription, setLockerDescription] = useState('');


    const fetchData = async () => {
        setIsLoading(true);
        try {
            const [lockersRes, lookupRes, usersRes, rentalsRes, waitingRes, leaguesRes] = await Promise.all([
                dbService.lockers.getAll(true),
                dbService.lockers.getLookups(),
                dbService.users.getAll(),
                dbService.rentals.getAll(),
                dbService.waitingList.getAllActiveReservations ? dbService.waitingList.getAllActiveReservations() : Promise.resolve({ data: [] }),
                dbService.leagues.getAll()
            ]);

            if (lookupRes.error) throw lookupRes.error;
            setLookups(lookupRes.data || {});
            setLeagues(leaguesRes.data || []);

            const userMap = (usersRes.data || []).reduce((acc, u) => ({ ...acc, [u.id_usuario]: u.nm_usuario }), {});

            // Detecta armários em carência de renovação (locação id_status=1 com dt_termino expirado ≤15 dias)
            const today = new Date();
            const graceMap = {}; // { id_armario: { graceDaysLeft, expiredOn, responsible } }
            const dToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
            
            (rentalsRes.data || []).forEach(r => {
                if (r.id_status === 1 && r.dt_termino) {
                    const termino = new Date(r.dt_termino + 'T00:00:00');
                    const dTermino = new Date(termino.getFullYear(), termino.getMonth(), termino.getDate());
                    
                    // Se o término é hoje ou no passado, entra em carência
                    if (dTermino <= dToday) {
                        const graceEnd = new Date(dTermino);
                        graceEnd.setDate(graceEnd.getDate() + 15);
                        
                        // Verifica se ainda está dentro dos 15 dias
                        if (dToday <= graceEnd) {
                            const diffTime = graceEnd.getTime() - dToday.getTime();
                            const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            graceMap[r.id_armario] = {
                                graceDaysLeft: daysLeft,
                                expiredOn: termino.toLocaleDateString('pt-BR'),
                                graceDeadline: graceEnd.toLocaleDateString('pt-BR'),
                                responsible: r.nm_aluno || userMap[r.id_usuario] || 'Aluno'
                            };
                        }
                    }
                }
            });

            // Map standard active rentals
            const activeDataMap = (rentalsRes.data || []).reduce((acc, r) => {
                if (r.id_armario) {
                    const isCurrentlyActive = r.dc_status_locacao === 'ATIVA' || r.id_status === 1;
                    // Only set or overwrite if the current one is active, or if we don't have one yet
                    if (isCurrentlyActive || !acc[r.id_armario]) {
                        acc[r.id_armario] = {
                            name: r.nm_aluno,
                            expiry: r.dt_termino || r.dt_vencimento,
                            type: 'rental',
                            status: r.dc_status_locacao
                        };
                    }
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
                    if (normalized === 'liga') return 'liga';
                    return normalized === 'ocupado' ? 'em-uso' : normalized;
                };

                const uniqueMap = new Map();
                lockersRes.data.forEach(l => {
                    if (l.id_armario && !uniqueMap.has(l.id_armario)) {
                        const activeData = activeDataMap[l.id_armario];
                        const isReservation = activeData?.type === 'reservation';
                        
                        // Encontrar dados extras da liga se houver
                        const leagueData = l.id_liga ? (leaguesRes.data || []).find(lg => lg.id_liga === l.id_liga) : null;

                        uniqueMap.set(l.id_armario, {
                            id: (l.cd_armario || '').toString().padStart(3, '0'),
                            nr: l.cd_armario,
                            dbId: l.id_armario,
                            localId: l.id_local,
                            sizeId: l.id_tamanho,
                            floor: l.nm_local || l.dc_andar || 'Térreo',
                            size: l.nm_tamanho || l.dc_tamanho || 'Pequeno',
                            position: l.nm_posicao || l.dc_posicao || 'MÉDIO',
                            status: (function() {
                                if (graceMap[l.id_armario]) return 'em-carencia';
                                
                                // Se tem locação ativa mas passou de 15 dias, força 'vistoria' visualmente
                                const ad = activeDataMap[l.id_armario];
                                if (ad && ad.type === 'rental' && (ad.status === 'ATIVA' || ad.status === 'Ativo')) {
                                    const expDate = new Date(ad.expiry + 'T00:00:00');
                                    const dExp = new Date(expDate.getFullYear(), expDate.getMonth(), expDate.getDate());
                                    const deadline = new Date(dExp);
                                    deadline.setDate(deadline.getDate() + 15);
                                    if (dToday > deadline) return 'vistoria';
                                }

                                return normalizeStatus((l.id_status === 3 || l.id_status === 6 || l.id_status === 7) ? l.dc_status : (l.situacao || l.dc_status || 'disponivel'));
                            })(),
                            responsible: (activeData && activeData.name) || (l.nm_liga ? `Liga: ${l.nm_liga}` : (userMap[l.id_usuario] || l.id_usuario || 'Disponível')),
                            id_liga: l.id_liga,
                            nm_liga: l.nm_liga,
                            nm_presidente: l.nm_presidente || (leagueData?.t_usuario ? (Array.isArray(leagueData.t_usuario) ? leagueData.t_usuario[0]?.nm_usuario : leagueData.t_usuario?.nm_usuario) : null),
                            tel_presidente: leagueData?.nr_telefone || (leagueData?.t_usuario ? (Array.isArray(leagueData.t_usuario) ? leagueData.t_usuario[0]?.nr_celular : leagueData.t_usuario?.nr_celular) : l.nr_celular_presidente),
                            isReservation,
                            graceInfo: graceMap[l.id_armario] || null,
                            description: l.ds_observacao,
                            expiry: (activeData && activeData.expiry) ? (function (dt) {
                                if (isReservation) {
                                    const d = new Date(dt);
                                    return d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                                }
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
                const descriptionStr = locker.description ? String(locker.description).toLowerCase() : '';
                const matchesSearch = !fSearch || 
                                     lockerIdStr.includes(fSearch) || 
                                     responsibleStr.includes(fSearch) ||
                                     descriptionStr.includes(fSearch);

                const selectedFloorName = lookups.floors?.[fFloorId];
                const selectedSizeName = lookups.sizes?.[fSizeId];

                const matchesFloor = fFloorId === 'All' || 
                    locker.localId?.toString() === fFloorId.toString() ||
                    (selectedFloorName && locker.floor === selectedFloorName);

                const matchesSize = fSizeId === 'All' || 
                    locker.sizeId?.toString() === fSizeId.toString() ||
                    (selectedSizeName && locker.size === selectedSizeName);

                const matchesStatus = fStatusId === 'All' || locker.status === fStatusId;

                return matchesSearch && matchesFloor && matchesSize && matchesStatus;
            })
            .sort((a, b) => (parseInt(a.nr) || 0) - (parseInt(b.nr) || 0));
    }, [lockers, filters, searchTerm, lookups.floors, lookups.sizes]);

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
    };

    const handleCloseDrawer = () => {
        setSelectedLocker(null);
    };


    const showModal = (config) => {
        setModalConfig({
            isOpen: true,
            title: config.title || 'Confirmação',
            message: config.message || '',
            type: config.type || 'confirm',
            content: config.content || null,
            contentType: config.contentType || null,
            onConfirm: config.onConfirm || null,
            isLoading: false,
            newStatus: config.newStatus || null
        });
    };

    const closeModal = () => {
        setModalConfig(prev => ({ ...prev, isOpen: false }));
    };

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 3500);
    };


    const handleStatusChange = async (newStatus) => {
        if (!selectedLocker) return;

        let title = '';
        let message = '';

        if (newStatus === 'manutencao') {
            title = 'Colocar em Manutenção';
            message = `Deseja bloquear o armário #${selectedLocker.id} para manutenção? Ele não poderá ser alugado até ser liberado.`;
        } else if (newStatus === 'bloqueado') {
            title = 'Bloquear para CAMU';
            message = `Deseja reservar o armário #${selectedLocker.id} para uso exclusivo da CAMU?`;
        } else if (newStatus === 'liga') {
            title = 'Reservar para Liga';
            message = `Deseja reservar o armário #${selectedLocker.id} para uso de uma Liga Acadêmica?`;
        } else if (newStatus === 'disponivel') {
            title = 'Liberar Armário';
            message = `Deseja liberar o armário #${selectedLocker.id}? Ele voltará ao status Disponível.`;
        } else if (newStatus === 'vistoria') {
            title = 'Encerrar Locação';
            message = `Deseja encerrar IMEDIATAMENTE a locação de ${selectedLocker.responsible} no armário #${selectedLocker.id}?`;
        } else if (newStatus === 'edit_description') {
            title = 'Editar Observação';
            message = `Atualize a descrição do armário #${selectedLocker.id}:`;
        }

        setLockerDescription(selectedLocker.description || '');

        showModal({
            title,
            message,
            type: 'confirm',
            newStatus: newStatus,
            contentType: newStatus === 'liga' ? 'league_selection' : 
                         (newStatus === 'bloqueado' || newStatus === 'manutencao' || newStatus === 'edit_description') ? 'description_input' : null
        });
    };

    const handleModalConfirm = async () => {
        if (!selectedLocker || !modalConfig.newStatus) return;

        const newStatus = modalConfig.newStatus;

        if (newStatus === 'liga' && !selectedLeagueId) {
            showToast('Selecione uma liga para continuar', 'error');
            return;
        }

        setModalConfig(prev => ({ ...prev, isLoading: true }));

        try {
            const dbStatus = newStatus === 'edit_description' ? selectedLocker.status.toUpperCase().replace('-', '_') : newStatus.toUpperCase().replace('-', '_');
            const descToSave = (newStatus === 'bloqueado' || newStatus === 'manutencao' || newStatus === 'edit_description') ? lockerDescription : 
                               (newStatus === 'disponivel') ? '' : null;

            await dbService.lockers.updateStatus(selectedLocker.dbId, dbStatus, selectedLeagueId, descToSave);

            await fetchData();
            setSelectedLocker(null);
            setSelectedLeagueId('');
            setLockerDescription('');
            closeModal();
            showToast('Informações atualizadas com sucesso!');
        } catch (error) {
            console.error('Error updating status:', error);
            setModalConfig(prev => ({ ...prev, isLoading: false }));
            showToast(error.message || 'Erro ao atualizar informações', 'error');
        }
    };


    const getStatusLabel = (status) => {
        const labels = {
            'disponivel': 'Disponível',
            'em-uso': 'Em uso',
            'em-carencia': 'Em Carência',
            'vistoria': 'Aguardando Vistoria',
            'manutencao': 'Manutenção',
            'gratuito': 'Gratuito',
            'reservado': 'Reservado',
            'bloqueado': 'Uso CAMU',
            'liga': 'Liga'
        };
        return (labels[status] || status).toUpperCase();
    };

    const getStatusClass = (status) => {
        if (status === 'disponivel') return 'status-available';
        if (status === 'em-uso') return 'status-occupied';
        if (status === 'em-carencia') return 'status-grace';
        if (status === 'vistoria') return 'status-inspection';
        if (status === 'manutencao') return 'status-maintenance';
        if (status === 'reservado') return 'status-reserved';
        if (status === 'bloqueado') return 'status-blocked';
        if (status === 'liga') return 'status-liga';
        return '';
    };

    return (
        <div className="user-selection premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Gestão de Armários</h1>
                    <p>Administre a ocupação e o status das unidades.</p>
                </div>
                <button className="help-guide-btn" onClick={() => setIsGuideOpen(true)}>
                    <HelpCircle size={20} />
                    <span>Guia de Armários</span>
                </button>
            </header>

            <section className="admin-filters filter-bar-premium">
                <div className="search-group">
                    <Search className="search-icon" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por número ou aluno..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <CustomSelect
                    icon={<Maximize2 size={18} />}
                    label="Andar"
                    value={filters.floorId}
                    options={{ 'All': 'Todos os Andares', ...lookups.floors }}
                    onChange={(val) => setFilters({ ...filters, floorId: val })}
                />

                <CustomSelect
                    icon={<Maximize2 size={18} />}
                    label="Tamanho"
                    value={filters.sizeId}
                    options={{ 'All': 'Todos os Tamanhos', ...lookups.sizes }}
                    onChange={(val) => setFilters({ ...filters, sizeId: val })}
                />

                <CustomSelect
                    icon={<Clock size={18} />}
                    label="Status"
                    value={filters.statusId}
                    options={{
                        'All': 'Todos os Status',
                        'disponivel': 'Disponível',
                        'em-uso': 'Em uso',
                        'em-carencia': 'Em Renovação',
                        'vistoria': 'Vistoria',
                        'manutencao': 'Manutenção',
                        'bloqueado': 'Bloqueado',
                        'liga': 'Liga'
                    }}
                    onChange={(val) => setFilters({ ...filters, statusId: val })}
                />
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
                                    {locker.status === 'em-uso' && <Lock size={14} className="unit-icon" />}
                                    {locker.status === 'em-carencia' && <RotateCcw size={14} className="unit-icon" />}
                                    {locker.status === 'vistoria' && <Clock size={14} className="unit-icon" />}
                                    {locker.status === 'manutencao' && <Wrench size={14} className="unit-icon" />}
                                    {locker.status === 'reservado' && <Calendar size={14} className="unit-icon" />}
                                    {locker.status === 'bloqueado' && <ShieldOff size={14} className="unit-icon" />}
                                    {locker.status === 'liga' && <Users size={14} className="unit-icon" />}
                                    {locker.description && (
                                        <div className="locker-desc-indicator" title={locker.description}>
                                            <StickyNote size={10} />
                                        </div>
                                    )}
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

                                {(selectedLocker.status === 'bloqueado' || selectedLocker.status === 'manutencao' || selectedLocker.description) && (
                                    <div className="drawer-section" style={{ marginBottom: '2rem' }}>
                                        <h3 className="section-title">Observações / Conteúdo</h3>
                                        <div className="description-card" style={{ background: selectedLocker.description ? '#f0fdf4' : '#f8fafc', borderColor: selectedLocker.description ? '#dcfce7' : '#e2e8f0' }}>
                                            <StickyNote size={18} className="desc-card-icon" style={{ color: selectedLocker.description ? '#166534' : '#64748b' }} />
                                            <p style={{ color: selectedLocker.description ? '#14532d' : '#64748b', fontStyle: selectedLocker.description ? 'normal' : 'italic' }}>
                                                {selectedLocker.description || 'Nenhuma observação ou conteúdo registrado.'}
                                            </p>
                                        </div>
                                    </div>
                                )}

                                <>
                                    <div className="drawer-section">
                                        <h3 className="section-title">Localização e Specs</h3>
                                        <div className="specs-grid">
                                            <div className="spec-item">
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

                                    {/* Banner de Carência */}
                                    {selectedLocker.status === 'em-carencia' && selectedLocker.graceInfo && (
                                        <div className="grace-admin-banner">
                                            <div className="grace-admin-banner-header">
                                                <RotateCcw size={16} />
                                                <strong>Em Carência de Renovação</strong>
                                                <span className={`grace-admin-pill ${selectedLocker.graceInfo.graceDaysLeft <= 3 ? 'urgent' : selectedLocker.graceInfo.graceDaysLeft <= 7 ? 'warning' : ''}`}>
                                                    {selectedLocker.graceInfo.graceDaysLeft} {selectedLocker.graceInfo.graceDaysLeft === 1 ? 'dia' : 'dias'} restantes
                                                </span>
                                            </div>
                                            <div className="grace-admin-rows">
                                                <div className="grace-admin-row">
                                                    <User size={14} />
                                                    <span><strong>Aluno:</strong> {selectedLocker.graceInfo.responsible}</span>
                                                </div>
                                                <div className="grace-admin-row">
                                                    <Calendar size={14} />
                                                    <span><strong>Venceu em:</strong> {selectedLocker.graceInfo.expiredOn}</span>
                                                </div>
                                                <div className="grace-admin-row">
                                                    <Clock size={14} />
                                                    <span><strong>Prazo até:</strong> {selectedLocker.graceInfo.graceDeadline}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {(selectedLocker.status === 'em-uso' || selectedLocker.status === 'em-carencia' || selectedLocker.status === 'gratuito' || selectedLocker.status === 'reservado' || selectedLocker.status === 'liga') && (
                                        <div className="drawer-section">
                                            <h3 className="section-title">
                                                {selectedLocker.status === 'reservado' ? 'Reserva Ativa' : 
                                                 selectedLocker.status === 'liga' ? 'Entidade Responsável' : 'Responsável'}
                                            </h3>
                                            <div className="admin-info-card">
                                                <div className="admin-info-row">
                                                    {selectedLocker.status === 'liga' ? <Users size={16} /> : <User size={16} />}
                                                    <div>
                                                        <label>{selectedLocker.status === 'liga' ? 'Nome da Liga' : 'Nome'}</label>
                                                        <p>{selectedLocker.status === 'liga' ? selectedLocker.nm_liga : selectedLocker.responsible}</p>
                                                    </div>
                                                </div>
                                                


                                                <div className="admin-info-row">
                                                    {selectedLocker.status === 'liga' ? <Phone size={16} /> : <Calendar size={16} />}
                                                    <div>
                                                        <label>{selectedLocker.status === 'liga' ? 'Contato' : (selectedLocker.status === 'reservado' ? 'Expira em' : 'Vencimento')}</label>
                                                        <p>{selectedLocker.status === 'liga' ? (selectedLocker.tel_presidente || 'N/A') : selectedLocker.expiry}</p>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="drawer-section">
                                        <h3 className="section-title">Ações Administrativas</h3>
                                        <div className="admin-actions-grid">
                                            {selectedLocker.status === 'disponivel' && (
                                                <>
                                                    <button className="admin-btn" onClick={() => handleStatusChange('bloqueado')}>
                                                        <ShieldOff size={18} /> Bloquear para CAMU
                                                    </button>
                                                    <button className="admin-btn" onClick={() => handleStatusChange('liga')}>
                                                        <Users size={18} /> Reservar para Liga
                                                    </button>
                                                </>
                                            )}
                                            
                                            {(selectedLocker.status === 'bloqueado' || selectedLocker.status === 'manutencao') && (
                                                <button className="admin-btn" onClick={() => handleStatusChange('edit_description')}>
                                                    <StickyNote size={18} /> Editar Observação
                                                </button>
                                            )}

                                            {selectedLocker.status !== 'manutencao' && (
                                                <button className="admin-btn" onClick={() => handleStatusChange('manutencao')}>
                                                    <Wrench size={18} /> Colocar em manutenção
                                                </button>
                                            )}
                                            
                                            {(selectedLocker.status !== 'disponivel') && (
                                                <button className="admin-btn" onClick={() => handleStatusChange('disponivel')}>
                                                    <Unlock size={18} /> Liberar armário
                                                </button>
                                            )}
                                            
                                            {(selectedLocker.status === 'em-uso' || selectedLocker.status === 'em-carencia' || selectedLocker.status === 'gratuito') && (
                                                <button className="admin-btn danger" onClick={() => handleStatusChange('vistoria')}>
                                                    <AlertCircle size={18} /> Encerrar locação
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                </>
                            </div>
                        </div>
                    </div>
                )}

            {modalConfig.isOpen && (
                <div className="locker-modal-overlay">
                    <div className="locker-modal-card">
                        <div className={`locker-modal-icon-container ${modalConfig.type}`}>
                            {modalConfig.type === 'confirm' && <AlertTriangle size={32} />}
                            {modalConfig.type === 'success' && <CheckCircle2 size={32} />}
                            {modalConfig.type === 'error' && <XCircle size={32} />}
                        </div>
                        <h3>{modalConfig.title}</h3>
                        <p>{modalConfig.message}</p>
                        
                        {modalConfig.contentType === 'league_selection' && (
                            <div className="modal-custom-content" style={{ width: '100%', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                <div className="league-selection-modal" style={{ width: '100%', alignSelf: 'stretch' }}>
                                    <label style={{ display: 'block', textAlign: 'left', width: '100%' }}>Selecione a Liga Acadêmica:</label>
                                    <SearchableSelect 
                                        value={selectedLeagueId} 
                                        onChange={(val) => setSelectedLeagueId(val)}
                                        options={leagues.map(liga => ({ value: liga.id_liga, label: liga.nm_liga }))}
                                        placeholder="Escolha uma liga na lista..."
                                    />
                                </div>
                            </div>
                        )}

                        {modalConfig.contentType === 'description_input' && (
                            <div className="modal-custom-content" style={{ width: '100%', alignSelf: 'stretch', display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
                                <div className="description-input-modal" style={{ width: '100%', alignSelf: 'stretch' }}>
                                    <label style={{ display: 'block', textAlign: 'left', width: '100%', fontSize: '0.8rem', fontWeight: 800, color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase' }}>
                                        {selectedLocker?.status === 'manutencao' || modalConfig.title.toLowerCase().includes('manutenção') ? 'Descreva o problema:' : 'Conteúdo do armário:'}
                                    </label>
                                    <textarea 
                                        className="modal-textarea"
                                        value={lockerDescription} 
                                        onChange={(val) => setLockerDescription(val.target.value)}
                                        placeholder={selectedLocker?.status === 'manutencao' || modalConfig.title.toLowerCase().includes('manutenção') ? 'Ex: Porta empenada, fechadura travada...' : 'Ex: Grampeador manual, resmas de papel...'}
                                        style={{ 
                                            width: '100%', 
                                            minHeight: '100px', 
                                            borderRadius: '12px', 
                                            border: '1.5px solid var(--border)', 
                                            padding: '12px',
                                            fontSize: '0.9rem',
                                            fontFamily: 'inherit',
                                            outline: 'none',
                                            resize: 'none'
                                        }}
                                    />
                                </div>
                            </div>
                        )}

                        {modalConfig.content && (
                            <div className="modal-custom-content" style={{ width: '100%', alignSelf: 'stretch' }}>
                                {modalConfig.content}
                            </div>
                        )}

                        <div className="locker-modal-footer">
                            {modalConfig.type === 'confirm' ? (
                                <>
                                    <button className="locker-modal-btn cancel" onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}>
                                        Cancelar
                                    </button>
                                    <button 
                                        className="locker-modal-btn confirm" 
                                        onClick={handleModalConfirm}
                                        disabled={modalConfig.isLoading}
                                    >
                                        {modalConfig.isLoading ? <Loader2 className="spinner-mini" /> : 'Confirmar'}
                                    </button>
                                </>
                            ) : (
                                <button className="locker-modal-btn primary" onClick={() => setModalConfig({ ...modalConfig, isOpen: false })}>
                                    Entendi
                                </button>
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

            <LockerGuideModal 
                isOpen={isGuideOpen} 
                onClose={() => setIsGuideOpen(false)} 
            />
        </div>
    );
};

export default LockerManagement;
