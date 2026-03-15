import React, { useState, useEffect, useRef } from 'react';
import { Bell, User, Menu, X, Trash2, Check } from 'lucide-react';
import './Topbar.css';
import { dbService } from '../services/supabaseClient';

const Topbar = ({ user, onMenuToggle }) => {
    const [showNotifications, setShowNotifications] = useState(false);
    const [isClosing, setIsClosing] = useState(false);
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const dropdownRef = useRef(null);

    const toggleNotifications = () => {
        if (showNotifications) {
            setIsClosing(true);
            setTimeout(() => {
                setShowNotifications(false);
                setIsClosing(false);
            }, 200); // Deve bater com a duração da animação no CSS
        } else {
            setShowNotifications(true);
        }
    };

    const fetchNotifications = async () => {
        if (!user?.id_usuario && !user?.uid) {
            console.log('[Topbar] No user identifier (id_usuario or uid) found in session:', user);
            return;
        }
        
        const userId = user.id_usuario;
        const userUid = user.uid;
        
        console.log(`[Topbar] Fetching notifications - id_usuario: ${userId}, uid: ${userUid}`);
        const { data, error } = await dbService.notifications.getByUser(userId, userUid);
        
        if (error) {
            console.error('[Topbar] DB ERROR during fetch:', error);
            return;
        }
        
        console.log(`[Topbar] SUCCESS: Found ${data?.length || 0} notifications`, data);
        if (data) {
            setNotifications(data);
            setUnreadCount(data.filter(n => !n.is_lida).length);
        }
    };

    useEffect(() => {
        fetchNotifications();
        // Poll for new notifications every 2 minutes
        const interval = setInterval(fetchNotifications, 120000);
        return () => clearInterval(interval);
    }, [user?.id_usuario, user?.uid]);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                if (showNotifications) {
                    setIsClosing(true);
                    setTimeout(() => {
                        setShowNotifications(false);
                        setIsClosing(false);
                    }, 200);
                }
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [showNotifications]);

    const handleMarkAsRead = async (id) => {
        const { error } = await dbService.notifications.markAsRead(id);
        if (!error) {
            setNotifications(notifications.map(n => n.id_notificacao === id ? { ...n, is_lida: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        }
    };

    const handleDelete = async (id) => {
        const { error } = await dbService.notifications.delete(id);
        if (!error) {
            setNotifications(notifications.filter(n => n.id_notificacao !== id));
            if (!notifications.find(n => n.id_notificacao === id).is_lida) {
                setUnreadCount(prev => Math.max(0, prev - 1));
            }
        }
    };

    const formatDate = (dateStr) => {
        const date = new Date(dateStr);
        return date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    };

    return (
        <header className="topbar">
            <div className="topbar-left">
                <button className="mobile-menu-btn" onClick={onMenuToggle}>
                    <Menu size={24} />
                </button>
            </div>

            <div className="topbar-actions">
                <div className="notification-container" ref={dropdownRef}>
                    <button 
                        className={`icon-btn notification-btn ${unreadCount > 0 ? 'has-unread' : ''}`}
                        onClick={toggleNotifications}
                    >
                        <Bell size={20} />
                        {unreadCount > 0 && <span className="notification-badge">{unreadCount}</span>}
                    </button>

                    {showNotifications && (
                        <div className={`notification-dropdown ${isClosing ? 'closing' : ''}`}>
                            <div className="dropdown-header">
                                <h3>Notificações</h3>
                                <button className="close-btn" onClick={toggleNotifications}>
                                    <X size={18} />
                                </button>
                            </div>
                            <div className="dropdown-content">
                                {notifications.length === 0 ? (
                                    <p className="no-notifications">Nenhuma notificação por enquanto.</p>
                                ) : (
                                    notifications.map(n => (
                                        <div key={n.id_notificacao} className={`notification-item ${n.is_lida ? 'read' : 'unread'}`}>
                                            <div className="notification-info">
                                                <h4>{n.dc_titulo}</h4>
                                                <p>{n.dc_mensagem}</p>
                                                <span className="notification-date">{formatDate(n.dt_criacao)}</span>
                                            </div>
                                            <div className="notification-item-actions">
                                                {!n.is_lida && (
                                                    <button 
                                                        title="Marcar como lida" 
                                                        onClick={() => handleMarkAsRead(n.id_notificacao)}
                                                        className="action-btn read-btn"
                                                    >
                                                        <Check size={16} />
                                                    </button>
                                                )}
                                                <button 
                                                    title="Excluir" 
                                                    onClick={() => handleDelete(n.id_notificacao)}
                                                    className="action-btn delete-btn"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}
                </div>

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
