import React, { useEffect } from 'react';
import { CheckCircle2, XCircle, X } from 'lucide-react';
import './Toast.css';

const Toast = ({ message, type = 'success', onClose, duration = 3000 }) => {
    useEffect(() => {
        const timer = setTimeout(() => {
            onClose();
        }, duration);

        return () => clearTimeout(timer);
    }, [onClose, duration]);

    return (
        <div className="toast-container-shared">
            <div className={`toast-notification-shared ${type}`}>
                <div className="toast-icon-shared">
                    {type === 'success' ? <CheckCircle2 size={20} /> : <XCircle size={20} />}
                </div>
                <span className="toast-message-shared">{message}</span>
                <button className="toast-close-btn-shared" onClick={onClose}>
                    <X size={16} />
                </button>
            </div>
        </div>
    );
};

export default Toast;
