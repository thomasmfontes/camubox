import { Bell, User, Menu } from 'lucide-react';
import './Topbar.css';

const Topbar = ({ user, onMenuToggle }) => {
    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="mobile-menu-btn" onClick={onMenuToggle}>
                    <Menu size={24} />
                </button>
            </div>

            <div className="topbar-actions">
                <button className="icon-btn">
                    <Bell size={20} />
                    <span className="notification-badge"></span>
                </button>

                <div className="user-profile">
                    <div className="user-info">
                        <p className="user-name">{user?.name || 'Thomas Oliveira'}</p>
                        <p className="user-role">{user?.isAdmin ? 'Administrador' : 'Aluno'}</p>
                    </div>
                    <div className="avatar">
                        <User size={20} />
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Topbar;
