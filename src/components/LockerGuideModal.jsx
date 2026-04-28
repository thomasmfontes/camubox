
import React, { useState, useEffect, useRef } from 'react';
import { X, Info, Maximize2, MoveVertical, HelpCircle, Upload, Loader2, Camera } from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './LockerGuideModal.css';

const LockerGuideModal = ({ isOpen, onClose, isAdmin = true }) => {
    const [activeTab, setActiveTab] = useState('positions');
    const [isUploading, setIsUploading] = useState(false);
    const [guideUrls, setGuideUrls] = useState({
        positions: '/artifacts/locker_positions_guide_1777382493134.png',
        sizes: '/artifacts/locker_sizes_comparison_1777382509255.png'
    });
    const fileInputRef = useRef(null);

    useEffect(() => {
        const fetchUrls = async () => {
            const { data } = await dbService.lockers.getConfig();
            if (data) {
                setGuideUrls({
                    positions: data.url_guia_posicoes || '/artifacts/locker_positions_guide_1777382493134.png',
                    sizes: data.url_guia_tamanhos || '/artifacts/locker_sizes_comparison_1777382509255.png'
                });
            }
        };
        if (isOpen) fetchUrls();
    }, [isOpen]);

    if (!isOpen) return null;

    const handleUploadClick = () => {
        if (isAdmin) fileInputRef.current?.click();
    };

    const handleFileChange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        setIsUploading(true);
        try {
            const fileName = `guide_${activeTab}_${Date.now()}.png`;
            const { data, error } = await dbService.storage.upload('assets', fileName, file);
            
            if (error) throw error;

            const publicUrl = dbService.storage.getPublicUrl('assets', data.path);
            
            // Update local state
            setGuideUrls(prev => ({ ...prev, [activeTab]: publicUrl }));

            // Update database config
            const configKey = activeTab === 'positions' ? 'url_guia_posicoes' : 'url_guia_tamanhos';
            await dbService.lockers.updateConfig?.({ [configKey]: publicUrl });

        } catch (err) {
            console.error('Upload error:', err);
            const msg = err.message || '';
            if (msg.includes('row-level security')) {
                alert('Erro de Permissão (RLS).\n\nInstruções:\n1. Vá em Storage > Policies.\n2. No bucket "assets", clique em "New Policy".\n3. Escolha "Get started quickly" e selecione "Give users access to all operations".\n4. Salve e tente novamente.');
            } else {
                alert('Erro ao salvar configuração.\n\nProvavelmente as colunas estão faltando no banco.\n\nInstruções:\n1. Vá no SQL Editor do Supabase.\n2. Cole e execute este comando:\n\nALTER TABLE t_configuracao \nADD COLUMN IF NOT EXISTS url_guia_posicoes TEXT,\nADD COLUMN IF NOT EXISTS url_guia_tamanhos TEXT;');
            }
        } finally {
            setIsUploading(false);
        }
    };

    const positions = [
        { id: 'alto', name: 'Alto', desc: 'Localizados na fileira superior. Ideal para quem prefere não se abaixar.' },
        { id: 'medio-alto', name: 'Médio Alto', desc: 'Altura confortável acima da linha da cintura.' },
        { id: 'medio', name: 'Médio', desc: 'Posição central exata. Altura perfeita para acesso rápido e frequente.' },
        { id: 'medio-baixo', name: 'Médio Baixo', desc: 'Posição central inferior, fácil acesso para mochilas pesadas.' },
        { id: 'baixo', name: 'Baixo', desc: 'Fileira de base. Recomendado para itens mais pesados ou fácil descarga.' }
    ];

    const sizes = [
        { id: 'pequeno', name: 'Pequeno', desc: 'Espaço ideal para livros, tablets e itens pessoais do dia a dia.' },
        { id: 'grande', name: 'Grande', desc: 'Espaço extra para capacetes, mochilas grandes ou equipamentos esportivos.' }
    ];

    return (
        <div className="guide-modal-overlay" onClick={onClose}>
            <div className="guide-modal-content" onClick={e => e.stopPropagation()}>
                <header className="guide-header">
                    <div className="guide-header-title">
                        <div className="guide-icon-wrapper">
                            <HelpCircle size={24} />
                        </div>
                        <div>
                            <h2>Guia Informativo de Armários</h2>
                        </div>
                    </div>
                    <button className="guide-close-btn" onClick={onClose}>
                        <X size={20} />
                    </button>
                </header>

                <div className="guide-tabs">
                    <button 
                        className={`guide-tab ${activeTab === 'positions' ? 'active' : ''}`}
                        onClick={() => setActiveTab('positions')}
                    >
                        <MoveVertical size={18} />
                        Posições
                    </button>
                    <button 
                        className={`guide-tab ${activeTab === 'sizes' ? 'active' : ''}`}
                        onClick={() => setActiveTab('sizes')}
                    >
                        <Maximize2 size={18} />
                        Tamanhos
                    </button>
                </div>

                <div className="guide-body">
                    <div className="guide-section animate-fade-in">
                        <div className={`guide-visual ${isAdmin ? 'admin-editable' : ''}`} onClick={handleUploadClick}>
                            <img src={activeTab === 'positions' ? guideUrls.positions : guideUrls.sizes} alt="Visual Guide" />
                            <div className="image-overlay">{activeTab === 'positions' ? 'Referência de Alturas' : 'Grande vs Pequeno'}</div>
                            
                            {isAdmin && (
                                <div className="edit-overlay">
                                    {isUploading ? <Loader2 className="spinner" /> : <Camera size={24} />}
                                    <span>Clique para trocar a foto</span>
                                </div>
                            )}
                            <input 
                                type="file" 
                                ref={fileInputRef} 
                                style={{ display: 'none' }} 
                                onChange={handleFileChange}
                                accept="image/*"
                            />
                        </div>

                        <div className="guide-info">
                            <h3>{activeTab === 'positions' ? 'Fileiras e Alturas' : 'Tipos de Compartimento'}</h3>
                            <div className="info-list">
                                {(activeTab === 'positions' ? positions : sizes).map((item, index) => (
                                    <div 
                                        key={item.id} 
                                        className="info-card-simple staggered-item"
                                        style={{ '--item-index': index }}
                                    >
                                        {activeTab === 'positions' ? (
                                            <div className={`pos-indicator ${item.id}`} />
                                        ) : (
                                            <div className="size-icon-wrapper">
                                                <Maximize2 size={20} />
                                            </div>
                                        )}
                                        <div>
                                            <h4>{item.name}</h4>
                                            <p>{item.desc}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                <footer className="guide-footer">
                    <button className="guide-primary-btn" onClick={onClose}>Entendi</button>
                </footer>
            </div>
        </div>
    );
};

export default LockerGuideModal;
