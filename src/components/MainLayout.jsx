import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import './MainLayout.css';

const MainLayout = ({ children, user, onLogout }) => {
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Bulletproof Scroll Lock for Mobile
    useEffect(() => {
        const html = document.documentElement;
        const body = document.body;
        let scrollPos = 0;

        if (isMobileMenuOpen) {
            scrollPos = window.pageYOffset;
            body.style.top = `-${scrollPos}px`;
            html.classList.add('no-scroll');
            body.classList.add('no-scroll');
        } else {
            const savedTop = Math.abs(parseInt(body.style.top || '0', 10));
            html.classList.remove('no-scroll');
            body.classList.remove('no-scroll');
            body.style.top = '';
            if (savedTop > 0) {
                window.scrollTo(0, savedTop);
            }
        }

        return () => {
            html.classList.remove('no-scroll');
            body.classList.remove('no-scroll');
            body.style.top = '';
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

            <div className="content-area">
                <Topbar user={user} onMenuToggle={() => setIsMobileMenuOpen(true)} />
                <main className="page-content">
                    {children}
                </main>
            </div>
        </div>
    );
};

export default MainLayout;
