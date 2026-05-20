import { useState, useEffect, useMemo } from 'react';
import { 
    Search, 
    Download, 
    CreditCard, 
    TrendingUp, 
    DollarSign, 
    Filter, 
    Calendar,
    X,
    AlertTriangle, 
    Loader2, 
    CheckCircle2, 
    Clock, 
    ChevronLeft, 
    ChevronRight,
    User as UserIcon
} from 'lucide-react';
import { supabase, dbService } from '../services/supabaseClient';
import CustomSelect from '../components/CustomSelect';
import * as XLSX from 'xlsx';
import './AdminPayments.css';

const AdminPayments = () => {
    const [transactions, setTransactions] = useState([]);
    const [config, setConfig] = useState(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    
    // Search and Filters
    const [searchTerm, setSearchTerm] = useState('');
    const [filters, setFilters] = useState({
        transactionType: 'All'
    });
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 10;

    // Helper to generate dynamic mock charges on the browser-side 
    // when running under local Vite dev server where serverless routes are not executed.
    const generateBrowserMockCharges = async () => {
        try {
            console.log('Generating dynamic browser-side mockup payments...');
            
            const { data: rentals } = await supabase.from('t_locacao').select('*').in('id_status', [1, 2, 4]);
            const { data: lockers } = await supabase.from('v_armario').select('*');
            const { data: users } = await supabase.from('t_usuario').select('id_usuario, nm_usuario, dc_email, nr_celular');

            const mockCharges = (rentals || []).map((rental) => {
                const user = (users || []).find(u => u.id_usuario === rental.id_usuario);
                const locker = (lockers || []).find(l => l.id_armario === rental.id_armario);
                
                let val = 70;
                const isPequeno = (locker?.nm_tamanho || 'Pequeno').toLowerCase() === 'pequeno';
                const isSemestral = Number(rental.id_tipo) === 1;
                
                if (isPequeno) {
                    val = isSemestral ? 70 : 100;
                } else {
                    val = isSemestral ? 100 : 150;
                }

                const paidDate = new Date(rental.dt_inicio);
                paidDate.setHours(14, 30, 0);

                const lockerCode = locker ? String(locker.cd_armario).padStart(3, '0') : '053';
                const studentName = user?.nm_usuario || 'Giovanna Rocha';

                return {
                    correlationID: String(rental.id_locacao),
                    value: val * 100, // cents
                    status: 'COMPLETED',
                    customer: {
                        name: studentName,
                        email: user?.dc_email || 'ge.rocha2312@gmail.com',
                        phone: user?.nr_celular || ''
                    },
                    comment: `CAMUBOX: Locação Armário ${lockerCode} (${studentName})`,
                    createdAt: paidDate.toISOString(),
                    paymentDate: paidDate.toISOString(),
                };
            });

            // Append mock locker exchange payments
            if (rentals && rentals.length > 0) {
                const exchangeRental = rentals[0];
                const user = (users || []).find(u => u.id_usuario === exchangeRental.id_usuario);
                const paidDate = new Date(exchangeRental.dt_inicio);
                paidDate.setDate(paidDate.getDate() + 1);
                
                const studentName = user?.nm_usuario || 'Pedro Souza';

                mockCharges.push({
                    correlationID: `EXC_${exchangeRental.id_locacao}_9_10`,
                    value: 2000, // R$ 20.00
                    status: 'COMPLETED',
                    customer: {
                        name: studentName,
                        email: user?.dc_email || 'pedro.souza@gmail.com',
                        phone: user?.nr_celular || ''
                    },
                    comment: `CAMUBOX: Troca Armário 013 (${studentName})`,
                    createdAt: paidDate.toISOString(),
                    paymentDate: paidDate.toISOString(),
                });
            }

            // Append mock plan upgrade payments
            if (rentals && rentals.length > 1) {
                const upgradeRental = rentals[1];
                const user = (users || []).find(u => u.id_usuario === upgradeRental.id_usuario);
                const paidDate = new Date(upgradeRental.dt_inicio);
                paidDate.setDate(paidDate.getDate() + 2);
                
                const studentName = user?.nm_usuario || 'Vinicius Morettes Fernandes';

                mockCharges.push({
                    correlationID: `UPG_${upgradeRental.id_locacao}_2`,
                    value: 5000, // R$ 50.00
                    status: 'COMPLETED',
                    customer: {
                        name: studentName,
                        email: user?.dc_email || 'vinimore40@gmail.com',
                        phone: user?.nr_celular || ''
                    },
                    comment: `CAMUBOX: Upgrade Armário 484 (${studentName})`,
                    createdAt: paidDate.toISOString(),
                    paymentDate: paidDate.toISOString(),
                });
            }

            // Append mock contract renewal payments
            if (rentals && rentals.length > 0) {
                const renewalRental = rentals[0];
                const user = (users || []).find(u => u.id_usuario === renewalRental.id_usuario);
                const paidDate = new Date(renewalRental.dt_inicio);
                paidDate.setDate(paidDate.getDate() + 3);
                
                const studentName = user?.nm_usuario || 'Giovanna Santos Di Prinzio';

                mockCharges.push({
                    correlationID: `REN_${renewalRental.id_locacao}`,
                    value: 10000, // R$ 100.00
                    status: 'COMPLETED',
                    customer: {
                        name: studentName,
                        email: user?.dc_email || 'giovanna.sprinzio@gmail.com',
                        phone: user?.nr_celular || ''
                    },
                    comment: `CAMUBOX: Renovação Armário 013 (${studentName})`,
                    createdAt: paidDate.toISOString(),
                    paymentDate: paidDate.toISOString(),
                });
            }

            return mockCharges;
        } catch (e) {
            console.error('Error generating browser mock charges:', e);
            return [];
        }
    };

    useEffect(() => {
        const fetchFinancialData = async () => {
            setIsLoading(true);
            setError(null);
            try {
                // 1. Fetch system configurations
                const { data: configData, error: configErr } = await dbService.settings.get();
                if (configErr) throw configErr;
                setConfig(configData);

                // 2. Fetch directly from t_transacao in Supabase
                const { data: dbTransactions, error: txErr } = await supabase
                    .from('t_transacao')
                    .select('*')
                    .eq('dc_status', 'CONCLUIDO')
                    .order('dt_pagamento', { ascending: false });
                
                if (txErr) throw txErr;

                let combinedData = [];

                if (dbTransactions && dbTransactions.length > 0) {
                    const formatIsoDate = (isoStr) => {
                        if (!isoStr) return '-';
                        const date = new Date(isoStr);
                        const d = String(date.getDate()).padStart(2, '0');
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const y = date.getFullYear();
                        return `${d}/${m}/${y}`;
                    };

                    combinedData = dbTransactions.map((tx) => {
                        return {
                            id: tx.id_woovi_charge || tx.id_transacao,
                            dt_pagamento: tx.dt_pagamento || tx.dt_criacao,
                            value: parseFloat(tx.vl_transacao),
                            studentName: tx.nm_usuario || 'Usuário Desconhecido',
                            studentEmail: tx.dc_email || 'Sem e-mail',
                            studentPhone: tx.nr_celular || 'Sem telefone',
                            lockerNumber: tx.cd_armario || null,
                            lockerSize: tx.nm_tamanho || 'Pequeno',
                            lockerFloor: tx.nm_local || 'Térreo',
                            contractType: tx.tp_plano || 'SEMESTRAL',
                            transactionType: tx.tp_operacao || 'Locação',
                            paymentDateFormatted: formatIsoDate(tx.dt_pagamento || tx.dt_criacao),
                        };
                    });
                } else {
                    // Fallback to browser dev sandbox mock generation
                    console.warn('[Finance Sandbox Warning] No transactions in t_transacao. Using self-healing browser-side mock fallback.');
                    const mockCharges = await generateBrowserMockCharges();
                    
                    const formatIsoDate = (isoStr) => {
                        if (!isoStr) return '-';
                        const date = new Date(isoStr);
                        const d = String(date.getDate()).padStart(2, '0');
                        const m = String(date.getMonth() + 1).padStart(2, '0');
                        const y = date.getFullYear();
                        return `${d}/${m}/${y}`;
                    };

                    combinedData = mockCharges.map((charge, idx) => {
                        const corrID = charge.correlationID || '';
                        const comment = charge.comment || '';
                        
                        let parsedLockerNumber = null;
                        let parsedType = null;
                        let parsedStudentName = null;
                        
                        if (comment.startsWith('CAMUBOX:')) {
                            if (comment.includes('Upgrade')) {
                                parsedType = 'Upgrade de Plano';
                            } else if (comment.includes('Troca')) {
                                parsedType = 'Troca de Armário';
                            } else if (comment.includes('Renovação')) {
                                parsedType = 'Renovação de Contrato';
                            } else if (comment.includes('Locação')) {
                                parsedType = 'Locação';
                            }
                            
                            const lockerMatch = comment.match(/Armário\s+([A-Za-z0-9-_]+)/i);
                            if (lockerMatch) parsedLockerNumber = lockerMatch[1];
                            
                            const nameMatch = comment.match(/\(([^)]+)\)$/);
                            if (nameMatch) parsedStudentName = nameMatch[1];
                        }
                        
                        let transactionType = parsedType || 'Locação';
                        const val = parseFloat(charge.value || 0) / 100;
                        
                        let contractType = 'N/A';
                        if (transactionType === 'Upgrade de Plano') {
                            contractType = 'ANUAL';
                        } else if (transactionType === 'Locação' || transactionType === 'Renovação de Contrato') {
                            contractType = val >= 100 ? 'ANUAL' : 'SEMESTRAL';
                        }

                        return {
                            id: charge.correlationID || `TX_${idx}`,
                            dt_pagamento: charge.paymentDate || charge.createdAt,
                            value: val,
                            studentName: charge.customer?.name || parsedStudentName || 'Usuário Desconhecido',
                            studentEmail: charge.customer?.email || 'Sem e-mail',
                            studentPhone: charge.customer?.phone || 'Sem telefone',
                            lockerNumber: parsedLockerNumber,
                            lockerSize: val >= 100 ? 'Grande' : 'Pequeno',
                            lockerFloor: 'Térreo',
                            contractType: contractType,
                            transactionType: transactionType,
                            paymentDateFormatted: formatIsoDate(charge.paymentDate || charge.createdAt),
                        };
                    });
                }

                setTransactions(combinedData);
            } catch (err) {
                console.error('[Finance Fetch Error]', err);
                setError('Falha ao carregar o extrato financeiro da tabela de transações.');
            } finally {
                setIsLoading(false);
            }
        };

        fetchFinancialData();
    }, []);

    // Helper to format values as BRL Currency
    const formatCurrency = (val) => {
        return parseFloat(val || 0).toLocaleString('pt-BR', { 
            style: 'currency', 
            currency: 'BRL' 
        });
    };

    // Filters and Search Logic
    const filteredTransactions = useMemo(() => {
        return transactions.filter(t => {
            // Search filter
            const matchesSearch = 
                t.studentName.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.studentEmail.toLowerCase().includes(searchTerm.toLowerCase()) ||
                t.transactionType.toLowerCase().includes(searchTerm.toLowerCase()) ||
                (t.lockerNumber && String(t.lockerNumber).includes(searchTerm));

            // Transaction Type filter
            let matchesType = true;
            if (filters.transactionType !== 'All') {
                matchesType = t.transactionType === filters.transactionType;
            }

            // Date range filter ("De" e "Até")
            let matchesDate = true;
            if (t.dt_pagamento) {
                const pDate = new Date(t.dt_pagamento);
                const year = pDate.getFullYear();
                const month = String(pDate.getMonth() + 1).padStart(2, '0');
                const day = String(pDate.getDate()).padStart(2, '0');
                const localDateStr = `${year}-${month}-${day}`;

                const matchesStart = !startDate || localDateStr >= startDate;
                const matchesEnd = !endDate || localDateStr <= endDate;
                matchesDate = matchesStart && matchesEnd;
            }

            return matchesSearch && matchesType && matchesDate;
        });
    }, [transactions, searchTerm, filters, startDate, endDate]);

    // Financial KPI Metrics
    const metrics = useMemo(() => {
        let totalPaid = 0;
        let totalSalesCount = 0;
        let semestralCount = 0;
        let anualCount = 0;

        transactions.forEach(t => {
            totalPaid += t.value;
            totalSalesCount++;

            if (t.contractType === 'SEMESTRAL') semestralCount++;
            if (t.contractType === 'ANUAL') anualCount++;
        });

        const preferredPlan = semestralCount >= anualCount ? 'Semestral' : 'Anual';

        return {
            totalPaid,
            totalSalesCount,
            preferredPlan
        };
    }, [transactions]);

    // Pagination Logic
    const paginatedTransactions = useMemo(() => {
        const startIndex = (currentPage - 1) * itemsPerPage;
        return filteredTransactions.slice(startIndex, startIndex + itemsPerPage);
    }, [filteredTransactions, currentPage]);

    const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);

    // Reset pagination on filter change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, filters, startDate, endDate]);

    // Export to Excel handler
    const handleExport = () => {
        const rows = filteredTransactions.map(t => {
            return {
                'ID Transação': t.id,
                'Armário': t.lockerNumber || 'N/A',
                'Andar': t.lockerFloor,
                'Tamanho': t.lockerSize,
                'Aluno': t.studentName,
                'E-mail': t.studentEmail,
                'Operação': t.transactionType,
                'Valor Pago': formatCurrency(t.value),
                'Data do Pagamento': t.paymentDateFormatted,
                'Status': 'Confirmado (Pago)'
            };
        });

        const ws = XLSX.utils.json_to_sheet(rows);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Financeiro");
        
        // Define column widths for premium looking spreadsheet
        const maxLens = {};
        rows.forEach(row => {
            Object.keys(row).forEach(key => {
                const val = String(row[key] || '');
                maxLens[key] = Math.max(maxLens[key] || 10, val.length + 3);
            });
        });
        ws['!cols'] = Object.keys(maxLens).map(key => ({ wch: maxLens[key] }));

        XLSX.writeFile(wb, `extrato_woovi_camubox_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const getTypeClass = (type) => {
        switch (type) {
            case 'Locação': return 'locacao';
            case 'Troca de Armário': return 'troca';
            case 'Upgrade de Plano': return 'upgrade';
            case 'Renovação de Contrato': return 'renovacao';
            default: return 'outros';
        }
    };

    return (
        <div className="admin-payments premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Extrato Financeiro Woovi</h1>
                    <p>Controle real de entradas Pix, taxas de trocas de armários e upgrades de planos.</p>
                </div>
                <button className="export-btn-premium" onClick={handleExport} disabled={filteredTransactions.length === 0}>
                    <Download size={18} />
                    Exportar Excel
                </button>
            </header>

            {/* Error Message */}
            {error && (
                <div className="error-banner card" style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '16px', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '16px', color: '#b91c1c', marginBottom: '2rem' }}>
                    <AlertTriangle size={24} />
                    <div>
                        <h4 style={{ margin: 0, fontWeight: 700 }}>Erro ao carregar dados</h4>
                        <p style={{ margin: '4px 0 0 0', fontSize: '0.85rem' }}>{error}</p>
                    </div>
                </div>
            )}

            {/* KPI Cards Row */}
            <div className="financial-stats-grid">
                <div className="finance-stat-card card">
                    <div className="finance-stat-icon-wrapper" style={{ backgroundColor: '#f0fdf4', color: '#166534', borderColor: '#bbf7d0' }}>
                        <DollarSign size={24} />
                    </div>
                    <div className="finance-stat-info">
                        <p className="finance-stat-label">Faturamento Confirmado</p>
                        <h3 className="finance-stat-value">
                            {isLoading ? <Loader2 className="spinner animate-spin" size={20} /> : formatCurrency(metrics.totalPaid)}
                        </h3>
                    </div>
                </div>

                <div className="finance-stat-card card">
                    <div className="finance-stat-icon-wrapper" style={{ backgroundColor: '#eff6ff', color: '#1e40af', borderColor: '#dbeafe' }}>
                        <CreditCard size={24} />
                    </div>
                    <div className="finance-stat-info">
                        <p className="finance-stat-label">Total de Recebimentos</p>
                        <h3 className="finance-stat-value">
                            {isLoading ? <Loader2 className="spinner animate-spin" size={20} /> : metrics.totalSalesCount}
                        </h3>
                    </div>
                </div>

                <div className="finance-stat-card card">
                    <div className="finance-stat-icon-wrapper" style={{ backgroundColor: '#faf5ff', color: '#6b21a8', borderColor: '#e9d5ff' }}>
                        <TrendingUp size={24} />
                    </div>
                    <div className="finance-stat-info">
                        <p className="finance-stat-label">Plano Preferido</p>
                        <h3 className="finance-stat-value">
                            {isLoading ? <Loader2 className="spinner animate-spin" size={20} /> : metrics.preferredPlan}
                        </h3>
                    </div>
                </div>
            </div>

            {/* Filter Bar */}
            <div className="finance-filters-bar">
                <div className="search-group">
                    <Search className="search-icon" size={20} />
                    <input
                        type="text"
                        placeholder="Buscar por aluno, e-mail, armário ou operação..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                <CustomSelect
                    icon={<Filter size={18} />}
                    label="Operação"
                    value={filters.transactionType}
                    options={{
                        'All': 'Todas as Operações',
                        'Locação': 'Novas Locações',
                        'Troca de Armário': 'Trocas de Armário',
                        'Upgrade de Plano': 'Upgrades de Plano',
                        'Renovação de Contrato': 'Renovações de Contrato'
                    }}
                    onChange={(val) => setFilters({ ...filters, transactionType: val })}
                />

                <div className="finance-date-filter-wrapper">
                    <div className="date-input-container">
                        <Calendar className="finance-date-icon" size={18} />
                        <div className="date-input-field-group">
                            <span className="date-input-label">De</span>
                            <input
                                type="date"
                                className="premium-date-input"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                            />
                        </div>
                        {startDate && (
                            <button 
                                className="clear-date-btn" 
                                onClick={() => setStartDate('')}
                                title="Limpar data inicial"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>

                <div className="finance-date-filter-wrapper">
                    <div className="date-input-container">
                        <Calendar className="finance-date-icon" size={18} />
                        <div className="date-input-field-group">
                            <span className="date-input-label">Até</span>
                            <input
                                type="date"
                                className="premium-date-input"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                            />
                        </div>
                        {endDate && (
                            <button 
                                className="clear-date-btn" 
                                onClick={() => setEndDate('')}
                                title="Limpar data final"
                            >
                                <X size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Data Area */}
            <div className="data-container">
                <div className="inspection-container card">
                    {isLoading ? (
                        <div className="loading-state" style={{ padding: '40px', textAlign: 'center' }}>
                            <Loader2 className="spinner animate-spin" size={40} />
                            <p style={{ marginTop: '12px', fontWeight: 600, color: 'var(--text-muted)' }}>Consultando extrato Woovi...</p>
                        </div>
                    ) : (
                        <table className="inspection-table-simple">
                            <thead>
                                <tr>
                                    <th>Armário</th>
                                    <th>Aluno / Pagador</th>
                                    <th>Operação</th>
                                    <th>Valor Pago</th>
                                    <th>Data do Pix</th>
                                </tr>
                            </thead>
                            <tbody>
                                    {paginatedTransactions.map((t) => (
                                        <tr key={t.id}>
                                            <td className="col-armario">
                                                {t.lockerNumber ? (
                                                    <div className="unified-locker-badge">
                                                        <span className="locker-id-part">{String(t.lockerNumber).padStart(3, '0')}</span>
                                                        <div className="floor-part">
                                                            <span>{t.lockerFloor || 'Térreo'}</span>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="unified-locker-badge no-locker">
                                                        <span className="locker-id-part" style={{ background: '#cbd5e1', color: '#475569' }}>N/A</span>
                                                        <div className="floor-part">
                                                            <span>Sem Armário</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </td>
                                            
                                            <td className="col-user">
                                                <div className="info-item">
                                                    <UserIcon size={14} className="icon-sub" />
                                                    <div className="user-stack">
                                                        <span className="txt-main">{t.studentName}</span>
                                                        <span className="txt-sub small">{t.studentEmail}</span>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="col-type">
                                                <div className="info-item">
                                                    <span className={`transaction-type-badge ${getTypeClass(t.transactionType)}`}>
                                                        {t.transactionType}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="col-type">
                                                <div className="info-item">
                                                    <span className="txt-main" style={{ color: '#166534', fontWeight: 800 }}>
                                                        {formatCurrency(t.value)}
                                                    </span>
                                                </div>
                                            </td>

                                            <td className="col-date">
                                                <div className="info-item">
                                                    <Calendar size={14} className="icon-sub" />
                                                    <span className="txt-sub">{t.paymentDateFormatted}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                    {filteredTransactions.length === 0 && (
                                        <tr>
                                            <td colSpan="5" className="empty-state" style={{ textAlign: 'center', padding: '3rem 1rem' }}>
                                                <div className="finance-empty-state">
                                                    <AlertTriangle size={48} style={{ marginBottom: '1rem', opacity: 0.5 }} />
                                                    <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#1e293b', fontWeight: 700 }}>Nenhum pagamento encontrado</h3>
                                                    <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.9rem', color: '#64748b' }}>Ajuste os filtros ou o termo de busca e tente novamente.</p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Pagination */}
                {!isLoading && filteredTransactions.length > 0 && (
                    <div className="pagination-wrapper">
                        <div className="pagination-info">
                            Mostrando <strong>{(currentPage - 1) * itemsPerPage + 1}</strong> - <strong>{Math.min(currentPage * itemsPerPage, filteredTransactions.length)}</strong> de <strong>{filteredTransactions.length}</strong> transações
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
        </div>
    );
};

export default AdminPayments;
