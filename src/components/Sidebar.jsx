import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
    Home,
    CreditCard,
    History,
    User,
    LayoutDashboard,
    ClipboardCheck,
    Settings,
    LogOut,
    ChevronRight,
    X,
    Percent,
    ShieldCheck
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import './Sidebar.css';

const Sidebar = ({ role = 'user', onLogout, isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    const [isLoggingOut, setIsLoggingOut] = useState(false);
    const [pendingInPersonCount, setPendingInPersonCount] = useState(0);

    useEffect(() => {
        if (role !== 'admin') return;

        const fetchPendingInPerson = async () => {
            try {
                const { count, error } = await supabase
                    .from('t_transacao')
                    .select('id_transacao', { count: 'exact', head: true })
                    .eq('tp_meio_pagamento', 'PRESENCIAL')
                    .eq('dc_status', 'AGUARDANDO_PAGAMENTO');
                if (!error && typeof count === 'number') {
                    setPendingInPersonCount(count);
                }
            } catch (e) {
                console.warn('[Sidebar] Error fetching pending in-person count:', e);
            }
        };

        fetchPendingInPerson();

        const channel = supabase
            .channel('sidebar-in-person-pending-realtime')
            .on('postgres_changes', {
                event: '*',
                schema: 'public',
                table: 't_transacao'
            }, () => {
                fetchPendingInPerson();
            })
            .subscribe();

        return () => {
            supabase.removeChannel(channel);
        };
    }, [role]);

    const handleLogoutClick = async () => {
        if (isLoggingOut) return;

        setIsLoggingOut(true);
        try {
            if (onLogout) await onLogout();
            navigate('/', { replace: true });
        } catch (error) {
            console.error('[Sidebar] Logout failed:', error);
        } finally {
            setIsLoggingOut(false);
        }
    };

    const userMenu = [
        { label: 'Armários', icon: <div className="nav-mask-icon icon-lockers" />, path: '/dashboard/lockers' },
        { label: 'Meus Armários', icon: <div className="nav-mask-icon icon-my-locker" />, path: '/dashboard/my-locker' },
        { label: 'Segurança', icon: <ShieldCheck size={20} />, path: '/dashboard/security' },
    ];

    const adminMenu = [
        { label: 'Dashboard', icon: <div className="nav-mask-icon icon-dash" />, path: '/dashboard/admin' },
        { label: 'Contratos', icon: <div className="nav-mask-icon icon-contract" />, path: '/dashboard/admin/contracts' },
        { label: 'Armários', icon: <div className="nav-mask-icon icon-lockers" />, path: '/dashboard/admin/lockers' },
        { label: 'Vistorias', icon: <div className="nav-mask-icon icon-check" />, path: '/dashboard/admin/inspections' },
        { label: 'Financeiro', icon: <CreditCard size={20} />, path: '/dashboard/admin/payments' },
        { label: 'Taxas', icon: <Percent size={20} />, path: '/dashboard/admin/fees' },
        { label: 'Configurações', icon: <div className="nav-mask-icon icon-config" />, path: '/dashboard/admin/settings' },
        { label: 'Segurança', icon: <ShieldCheck size={20} />, path: '/dashboard/security' },
    ];

    const menuItems = role === 'admin' ? adminMenu : userMenu;

    return (
        <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <img src="/pwa-icon.png" alt="Logo" className="sidebar-logo-img" />
                    <span>CAMUBOX</span>
                </div>
                <button className="mobile-close-btn-wrapper" onClick={onClose}>
                    <X size={20} />
                </button>
            </div>

            <div className="sidebar-section-label">SISTEMA DE GERENCIAMENTO</div>

            <nav className="sidebar-nav">
                {menuItems.map((item) => (
                    <button
                        key={item.label}
                        className={`nav-item ${location.pathname === item.path ? 'active' : ''}`}
                        onClick={() => {
                            if (onClose) onClose();
                            navigate(item.path);
                        }}
                    >
                        <span className="nav-icon">{item.icon}</span>
                        <span className="nav-label">{item.label}</span>
                        {item.path === '/dashboard/admin/payments' && pendingInPersonCount > 0 && (
                            <span className="sidebar-pending-dot" title={`${pendingInPersonCount} pendência(s) de pagamento presencial`} />
                        )}
                        {location.pathname === item.path && <ChevronRight size={16} className="active-indicator" />}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout-btn" onClick={handleLogoutClick} disabled={isLoggingOut}>
                    <LogOut size={20} />
                    <span>{isLoggingOut ? 'Saindo...' : 'Sair'}</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
