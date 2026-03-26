import { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';

import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './MainLayout.css';

const MainLayout = ({ children, user, onLogout }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Reliable Scroll Lock for Mobile (HTML + Body)
    useEffect(() => {
        const html = document.documentElement;

        if (isMobileMenuOpen) {
            html.classList.add('no-scroll');
        } else {
            html.classList.remove('no-scroll');
        }

        return () => {
            html.classList.remove('no-scroll');
        };
    }, [isMobileMenuOpen]);

    return (
        <div className="main-layout">
            <Sidebar 
                user={user}
                role={user?.isAdmin ? 'admin' : 'user'} 
                onLogout={onLogout} 
                isOpen={isMobileMenuOpen} 
                onClose={() => setIsMobileMenuOpen(false)} 
            />
            
            {isMobileMenuOpen && (
                <div className="mobile-overlay" onClick={() => setIsMobileMenuOpen(false)}></div>
            )}

            <div className={`content-area ${isMobileMenuOpen ? 'background-locked' : ''}`}>
                <Topbar user={user} onMenuToggle={() => setIsMobileMenuOpen(true)} />
                <main className="page-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
