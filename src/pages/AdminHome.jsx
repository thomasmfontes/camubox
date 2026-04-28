import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

import {
    CheckCircle,
    Clock,
    Wrench,
    LayoutGrid,
    ClipboardCheck,
    Users,
    ShieldOff
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './AdminHome.css';

const CountUp = ({ end, duration = 1500 }) => {
    const [count, setCount] = useState(0);

    useEffect(() => {
        let startTime = null;
        let animationFrameId;

        const animate = (timestamp) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);

            // Cubic ease-out for smooth deceleration
            const easing = 1 - Math.pow(1 - progress, 3);
            const currentCount = Math.floor(easing * end);

            setCount(currentCount);

            if (progress < 1) {
                animationFrameId = requestAnimationFrame(animate);
            }
        };

        animationFrameId = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(animationFrameId);
    }, [end, duration]);

    return <>{count.toLocaleString()}</>;
};

const AdminHome = () => {
    const navigate = useNavigate();
    const [isLoading, setIsLoading] = useState(true);
    const [stats, setStats] = useState([
        { label: 'Total de armários', value: 0, icon: <div className="locker-icon-standard" />, color: 'var(--primary)', key: 'total' },
        { label: 'Disponíveis', value: 0, icon: <LayoutGrid />, color: '#10b981', key: 'disponivel' },
        { label: 'Em uso', value: 0, icon: <CheckCircle />, color: '#6366f1', key: 'em-uso' },
        { label: 'Vistoria', value: 0, icon: <Clock />, color: '#f59e0b', key: 'vistoria' },
        { label: 'Manutenção', value: 0, icon: <Wrench />, color: '#94a3b8', key: 'manutencao' },
        { label: 'Bloqueados', value: 0, icon: <ShieldOff />, color: '#ec4899', key: 'bloqueado' },
        { label: 'Ligas', value: 0, icon: <Users />, color: '#f97316', key: 'liga' },
    ]);

    useEffect(() => {
        const fetchData = async () => {
            setIsLoading(true);
            try {
                const { data, error } = await dbService.lockers.getAll();
                if (!error && data) {
                    const normalizeStatus = (str) => {
                        if (!str) return 'disponivel';
                        const normalized = str.normalize("NFD")
                            .replace(/[\u0300-\u036f]/g, "")
                            .toLowerCase()
                            .trim()
                            .replace(/\s+/g, '-');

                        if (normalized === 'ocupado') return 'em-uso';
                        if (normalized.includes('reservado')) return 'reservado';
                        if (normalized === 'liga') return 'liga';
                        return normalized;
                    };

                    const uniqueMap = new Map();
                    const counts = {
                        total: 0,
                        disponivel: 0,
                        'em-uso': 0,
                        'vistoria': 0,
                        manutencao: 0,
                        bloqueado: 0,
                        liga: 0
                    };

                    data.forEach(l => {
                        if (l.id_armario && !uniqueMap.has(l.id_armario)) {
                            const status = normalizeStatus(l.situacao || l.dc_status || 'disponivel');
                            uniqueMap.set(l.id_armario, true);

                            counts.total++;
                            if (l.id_status === 6) {
                                counts.bloqueado++;
                            } else if (l.id_status === 7) {
                                counts.liga++;
                            } else if (Object.prototype.hasOwnProperty.call(counts, status)) {
                                counts[status]++;
                            }
                        }
                    });

                    setStats(prev => prev.map(s => ({
                        ...s,
                        value: counts[s.key] !== undefined ? counts[s.key] : (s.key === 'total' ? counts.total : 0)
                    })));
                }
            } catch (err) {
                console.error('[FETCH ERROR]', err);
            } finally {
                setIsLoading(false);
            }
        };
        fetchData();
    }, []);

    const quickActions = [
        { label: 'Ver contratos', icon: <ClipboardCheck size={20} />, color: '#6366f1', path: '/dashboard/admin/contracts' },
        { label: 'Realizar vistoria', icon: <Clock size={20} />, color: '#f59e0b', path: '/dashboard/admin/inspections' },
        { label: 'Pendências', icon: <Wrench size={20} />, color: '#94a3b8', path: '/dashboard/admin/inspections' },
    ];

    return (
        <div className="admin-home premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>Visão Geral</h1>
                    <p>Status atual do sistema CAMUBOX.</p>
                </div>
            </header>

            {/* Stats Cards Row */}
            <div className="stats-grid-6">
                {stats.map((stat, i) => (
                    <div key={i} className="mini-stat-card card">
                        <div className="mini-stat-icon" style={{ backgroundColor: stat.color + '10', color: stat.color }}>
                            {stat.icon}
                        </div>
                        <div className="mini-stat-content">
                            <p className="mini-stat-label">{stat.label}</p>
                            <h3 className="mini-stat-value">
                                {isLoading ? (
                                    <span className="loading-dots">...</span>
                                ) : (
                                    <CountUp end={stat.value} />
                                )}
                            </h3>
                        </div>
                    </div>
                ))}
            </div>

            <section className="dashboard-section card">
                <h3 className="section-title">Ações Rápidas</h3>
                <div className="actions-grid-simple">
                    {quickActions.map((action, i) => (
                        <button 
                            key={i} 
                            className="action-tile-large" 
                            onClick={() => navigate(action.path)}
                        >
                            <div className="action-icon" style={{ backgroundColor: action.color + '10', color: action.color }}>
                                {action.icon}
                            </div>
                            <span>{action.label}</span>
                        </button>
                    ))}
                </div>
            </section>
        </div>
    );
};

export default AdminHome;
