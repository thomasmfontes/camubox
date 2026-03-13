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
                <button className="icon-btn notification-btn">
                    <Bell size={20} />
                    <span className="notification-badge"></span>
                </button>

                <div className="user-profile-simple">
                    <div className="user-info">
                        <span className="user-name">{user?.name || 'Thomas Oliveira'}</span>
                        <span className="user-role">{user?.isAdmin ? 'Administrador' : 'Aluno'}</span>
                    </div>
                    <div className="avatar-circle">
                        {user?.name ? user.name.charAt(0).toUpperCase() : 'T'}
                    </div>
                </div>
            </div>
        </header>
    );
};

export default Topbar;
