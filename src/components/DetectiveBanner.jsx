import React from 'react';
import { FaUserSecret } from 'react-icons/fa';
import { LogOut } from 'lucide-react';
import './DetectiveBanner.css';

const DetectiveBanner = ({ user, onStopImpersonate }) => {
    if (!user?.isImpersonating) return null;

    const studentName = user.name || user.nm_usuario || 'Aluno';

    return (
        <div className="detective-pill-container">
            <div className="detective-pill">
                <div className="detective-pill-icon" title="Modo Detetive">
                    <FaUserSecret size={15} />
                </div>
                <div className="detective-pill-text">
                    <span className="detective-pill-label">Visualizando:</span>
                    <strong className="detective-pill-name" title={studentName}>
                        {studentName}
                    </strong>
                </div>
                <button 
                    className="detective-pill-btn-exit"
                    onClick={onStopImpersonate}
                    title="Sair do Modo Detetive e voltar para Admin"
                >
                    <LogOut size={13} />
                    <span>Sair</span>
                </button>
            </div>
        </div>
    );
};

export default DetectiveBanner;
