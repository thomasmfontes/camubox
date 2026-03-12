import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    UserPlus,
    Search,
    FileText,
    DollarSign,
    Gift,
    CreditCard,
    ChevronLeft,
    CheckCircle2,
    AlertCircle
} from 'lucide-react';
import './ManualRental.css';

const ManualRental = () => {
    const navigate = useNavigate();
    const [formData, setFormData] = useState({
        responsible: '',
        lockerId: '',
        contractType: 'semestral',
        value: '',
        isFree: false,
        freeReason: 'liga acadêmica',
        otherReason: '',
        paymentStatus: 'pendente'
    });

    const [success, setSuccess] = useState(false);

    const handleSubmit = (e) => {
        e.preventDefault();
        // Simulate API call
        setSuccess(true);
        setTimeout(() => {
            setSuccess(false);
            navigate('/dashboard/admin/lockers');
        }, 2000);
    };

    const handleFreeToggle = (e) => {
        const isChecked = e.target.checked;
        setFormData({
            ...formData,
            isFree: isChecked,
            paymentStatus: isChecked ? 'isento' : 'pendente',
            value: isChecked ? '0,00' : formData.value
        });
    };

    return (
        <div className="manual-rental-page">
            <header className="page-header">
                <button className="back-btn" onClick={() => navigate(-1)}>
                    <ChevronLeft size={20} />
                    <span>Voltar</span>
                </button>
                <div>
                    <h1>Registrar Locação Manual</h1>
                    <p>Crie uma nova locação diretamente no sistema para alunos ou entidades.</p>
                </div>
            </header>

            <form className="rental-form card" onSubmit={handleSubmit}>
                <div className="form-grid">
                    {/* Section: Responsible & Locker */}
                    <div className="form-section">
                        <h3 className="section-title"><UserPlus size={18} /> Dados da Locação</h3>

                        <div className="form-group">
                            <label>Buscar Responsável (Aluno ou Entidade)</label>
                            <div className="input-with-icon">
                                <Search size={18} className="icon" />
                                <input
                                    type="text"
                                    placeholder="Nome, RA ou Nome da Liga..."
                                    value={formData.responsible}
                                    onChange={(e) => setFormData({ ...formData, responsible: e.target.value })}
                                    required
                                />
                            </div>
                        </div>

                        <div className="form-group">
                            <label>Selecionar Armário</label>
                            <div className="input-with-icon">
                                <div className="locker-icon-standard" style={{ width: '18px', height: '18px' }} />
                                <select
                                    value={formData.lockerId}
                                    onChange={(e) => setFormData({ ...formData, lockerId: e.target.value })}
                                    required
                                >
                                    <option value="">Selecione um armário disponível...</option>
                                    <option value="S01">S01 (Grande - Subsolo)</option>
                                    <option value="T12">T12 (Pequeno - Térreo)</option>
                                    <option value="P02">P02 (Grande - Térreo PCD)</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    {/* Section: Contract & Payment */}
                    <div className="form-section">
                        <h3 className="section-title"><FileText size={18} /> Detalhes do Contrato</h3>

                        <div className="form-row">
                            <div className="form-group flex-1">
                                <label>Tipo de Contrato</label>
                                <select
                                    value={formData.contractType}
                                    onChange={(e) => setFormData({ ...formData, contractType: e.target.value })}
                                >
                                    <option value="semestral">Semestral</option>
                                    <option value="anual">Anual</option>
                                </select>
                            </div>

                            <div className="form-group flex-1">
                                <label>Valor</label>
                                <div className="input-with-icon">
                                    <DollarSign size={18} className="icon" />
                                    <input
                                        type="text"
                                        placeholder="0,00"
                                        value={formData.value}
                                        onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                                        disabled={formData.isFree}
                                        required
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="form-group">
                            <label className="checkbox-container inline">
                                <input
                                    type="checkbox"
                                    checked={formData.isFree}
                                    onChange={handleFreeToggle}
                                />
                                <span className="checkmark"></span>
                                <span className="checkbox-label">Aplicar Gratuidade</span>
                            </label>
                        </div>

                        {formData.isFree && (
                            <div className="gratuity-fields animate-fade-in">
                                <div className="form-group">
                                    <label>Motivo da Gratuidade</label>
                                    <select
                                        value={formData.freeReason}
                                        onChange={(e) => setFormData({ ...formData, freeReason: e.target.value })}
                                    >
                                        <option value="liga acadêmica">Liga Acadêmica</option>
                                        <option value="projeto de sustentação">Projeto de Sustentação</option>
                                        <option value="cortesia">Cortesia</option>
                                        <option value="outro">Outro</option>
                                    </select>
                                </div>
                                {formData.freeReason === 'outro' && (
                                    <div className="form-group">
                                        <label>Especifique o Motivo</label>
                                        <textarea
                                            rows="2"
                                            value={formData.otherReason}
                                            onChange={(e) => setFormData({ ...formData, otherReason: e.target.value })}
                                            required
                                        ></textarea>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="form-group">
                            <label>Status de Pagamento</label>
                            <div className="input-with-icon">
                                <CreditCard size={18} className="icon" />
                                <select
                                    value={formData.paymentStatus}
                                    onChange={(e) => setFormData({ ...formData, paymentStatus: e.target.value })}
                                    disabled={formData.isFree}
                                >
                                    <option value="pendente">Pendente</option>
                                    <option value="pago">Pago</option>
                                    <option value="isento" disabled={!formData.isFree}>Isento</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="form-footer">
                    <button type="submit" className="primary-btn submit-btn" disabled={success}>
                        {success ? (
                            <>
                                <CheckCircle2 size={20} />
                                Locação Criada!
                            </>
                        ) : 'Criar Locação'}
                    </button>
                </div>
            </form>

            {success && (
                <div className="success-overlay card">
                    <div className="success-content">
                        <CheckCircle2 size={48} className="text-success" />
                        <h2>Locação Registrada!</h2>
                        <p>O armário {formData.lockerId} foi vinculado a {formData.responsible}.</p>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ManualRental;
