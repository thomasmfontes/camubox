
import React, { useState, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';
import './CustomSelect.css';

const CustomSelect = ({ icon, value, options, onChange, label, className = '' }) => {
    const [isOpen, setIsOpen] = useState(false);
    
    // Close on click outside
    useEffect(() => {
        const close = () => setIsOpen(false);
        if (isOpen) window.addEventListener('click', close);
        return () => window.removeEventListener('click', close);
    }, [isOpen]);

    const selectedLabel = options[value] || label;

    return (
        <div className={`custom-select-wrapper ${className}`} onClick={e => e.stopPropagation()}>
            <button 
                type="button"
                className={`custom-select-trigger ${isOpen ? 'open' : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className="trigger-icon">{icon}</span>
                <span className="trigger-text">{selectedLabel}</span>
                <ChevronDown className={`chevron ${isOpen ? 'rotate' : ''}`} size={16} />
            </button>
            
            {isOpen && (
                <div className="custom-select-options">
                    {Object.entries(options).map(([val, text]) => (
                        <div 
                            key={val} 
                            className={`custom-option ${value === val ? 'selected' : ''}`}
                            onClick={() => {
                                onChange(val);
                                setIsOpen(false);
                            }}
                        >
                            {text}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

export default CustomSelect;
