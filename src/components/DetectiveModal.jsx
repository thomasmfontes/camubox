import React, { useState, useEffect, useMemo } from 'react';
import { FaUserSecret } from 'react-icons/fa';
import { Search, X, Loader2, User, ArrowRight } from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './DetectiveModal.css';

const DetectiveModal = ({ isOpen, onClose, onSelectUser }) => {
    const [users, setUsers] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!isOpen) return;

        let isMounted = true;
        const loadUsers = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const { data, error: err } = await dbService.users.getAll();
                if (err) throw err;
                if (isMounted && data) {
                    setUsers(data);
                }
            } catch (e) {
                console.error('[DetectiveModal] Failed to load users:', e);
                if (isMounted) setError('Erro ao carregar lista de usuários.');
            } finally {
                if (isMounted) setIsLoading(false);
            }
        };

        loadUsers();

        return () => {
            isMounted = false;
        };
    }, [isOpen]);

    const filteredUsers = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return users.slice(0, 30); // show first 30 if no search term

        return users.filter(u => {
            const name = (u.nm_usuario || '').toLowerCase();
            const email = (u.dc_email || '').toLowerCase();
            const phone = (u.nr_celular || '').replace(/\D/g, '');
            const cleanTerm = term.replace(/\D/g, '');

            return name.includes(term) || email.includes(term) || (cleanTerm && phone.includes(cleanTerm));
        });
    }, [users, searchTerm]);

    if (!isOpen) return null;

    return (
        <div className="detective-modal-overlay" onClick={onClose}>
            <div className="detective-modal-container" onClick={e => e.stopPropagation()}>
                <header className="detective-modal-header">
                    <div className="detective-title-row">
                        <div className="detective-badge-icon">
                            <FaUserSecret size={24} />
                        </div>
                        <div>
                            <h2>Modo Detetive</h2>
                            <p>Acesse o sistema sob a perspectiva de qualquer usuário.</p>
                        </div>
                    </div>
                    <button className="detective-btn-close" onClick={onClose} title="Fechar">
                        <X size={20} />
                    </button>
                </header>

                <div className="detective-search-wrap">
                    <Search size={18} className="detective-search-icon" />
                    <input
                        type="text"
                        placeholder="Buscar por nome, e-mail ou celular..."
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        autoFocus
                    />
                    {searchTerm && (
                        <button className="detective-search-clear" onClick={() => setSearchTerm('')}>
                            <X size={16} />
                        </button>
                    )}
                </div>

                <div className="detective-user-list">
                    {isLoading ? (
                        <div className="detective-state-box">
                            <Loader2 size={32} className="detective-spinner" />
                            <p>Carregando usuários...</p>
                        </div>
                    ) : error ? (
                        <div className="detective-state-box error">
                            <p>{error}</p>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="detective-state-box empty">
                            <User size={32} />
                            <p>Nenhum usuário encontrado para "{searchTerm}".</p>
                        </div>
                    ) : (
                        filteredUsers.map(u => (
                            <div 
                                key={u.id_usuario} 
                                className="detective-user-card"
                                onClick={() => onSelectUser(u)}
                            >
                                <div className="detective-user-avatar">
                                    {(u.nm_usuario || 'U').charAt(0).toUpperCase()}
                                </div>
                                <div className="detective-user-info">
                                    <div className="detective-user-name">
                                        {u.nm_usuario || 'Sem nome'}
                                        {u.is_adm && <span className="detective-tag-admin">Admin</span>}
                                    </div>
                                    <div className="detective-user-sub">
                                        <span>{u.dc_email || 'Sem e-mail'}</span>
                                        {u.nr_celular && <span> • {u.nr_celular}</span>}
                                    </div>
                                </div>
                                <button className="detective-btn-enter" title="Acessar como este usuário">
                                    <span>Acessar</span>
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        </div>
    );
};

export default DetectiveModal;
