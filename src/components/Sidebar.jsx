import { useEffect } from 'react';
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
    X
} from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ user, role = 'user', onLogout, isOpen, onClose }) => {
    const navigate = useNavigate();
    const location = useLocation();
    
    // Lock body scroll when mobile menu is open
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    const handleLogoutClick = () => {
        if (onLogout) onLogout();
        navigate('/');
    };

    const userMenu = [
        { label: 'Armários', icon: <div className="nav-mask-icon icon-lockers" />, path: '/dashboard/lockers' },
        { label: 'Meus Armários', icon: <div className="nav-mask-icon icon-my-locker" />, path: '/dashboard/my-locker' },
    ];

    const adminMenu = [
        { label: 'Dashboard', icon: <div className="nav-mask-icon icon-dash" />, path: '/dashboard/admin' },
        { label: 'Contratos', icon: <div className="nav-mask-icon icon-contract" />, path: '/dashboard/admin/contracts' },
        { label: 'Armários', icon: <div className="nav-mask-icon icon-lockers" />, path: '/dashboard/admin/lockers' },
        { label: 'Vistorias', icon: <div className="nav-mask-icon icon-check" />, path: '/dashboard/admin/inspections' },
        { label: 'Configurações', icon: <div className="nav-mask-icon icon-config" />, path: '/dashboard/admin/settings' },
    ];

    const menuItems = role === 'admin' ? adminMenu : userMenu;

    return (
        <aside className={`sidebar ${isOpen ? 'mobile-open' : ''}`}>
            <div className="sidebar-header">
                <div className="sidebar-logo">
                    <div className="nav-mask-icon icon-lockers logo-mask" />
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
                        {location.pathname === item.path && <ChevronRight size={16} className="active-indicator" />}
                    </button>
                ))}
            </nav>

            <div className="sidebar-footer">
                <button className="nav-item logout-btn" onClick={handleLogoutClick}>
                    <LogOut size={20} />
                    <span>Sair</span>
                </button>
            </div>
        </aside>
    );
};

export default Sidebar;
