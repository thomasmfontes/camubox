import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IoMdPricetag } from 'react-icons/io';
import {
    FileText,
    Calendar,
    ArrowRight,
    ChevronLeft,
    Book,
    Library
} from 'lucide-react';
import { dbService } from '../services/supabaseClient';
import './DigitalContract.css';

const DigitalContract = () => {
    const navigate = useNavigate();
    const [accepted, setAccepted] = useState(false);
    const [contractText, setContractText] = useState('');
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const fetchConfig = async () => {
            setIsLoading(true);
            const { data, error } = await dbService.lockers.getConfig();
            if (!error && data) {
                setContractText(data.nm_texto_contrato || 'Termos de uso não configurados.');
            }
            setIsLoading(false);
        };
        fetchConfig();
    }, []);

    const { state } = useLocation();
    const selectedLocker = state?.locker || {
        id: '000',
        floor: 'Não informado',
        size: 'N/A',
        priceSem: 0,
        priceAnn: 0,
        plan: 'semestral'
    };

    const isSemestral = selectedLocker.plan?.toLowerCase() === 'semestral';
    const price = isSemestral ? selectedLocker.priceSem : selectedLocker.priceAnn;

    const now = new Date();
    const currentYear = now.getFullYear();
    const currentSemester = now.getMonth() < 6 ? 1 : 2;
    const academicPeriod = isSemestral
        ? `${currentYear}.${currentSemester}`
        : currentSemester === 1
            ? `${currentYear}.1/2`
            : `${currentYear}.2 / ${currentYear + 1}.1`;

    const rentalSummary = {
        id: selectedLocker.id,
        floor: selectedLocker.floor,
        size: selectedLocker.size,
        contractType: isSemestral ? 'Semestral' : 'Anual',
        price: `R$ ${price},00`,
        duration: isSemestral ? `6 meses (${academicPeriod})` : `12 meses (${academicPeriod})`
    };

    const handleContinue = () => {
        if (accepted) {
            navigate('/dashboard/checkout/payment', { state: { locker: selectedLocker } });
        }
    };

    return (
        <div className="digital-contract premium-theme">
            <header className="page-header">
                <button className="back-btn-premium" onClick={() => navigate(-1)}>
                    <ChevronLeft size={20} />
                </button>
                <div className="header-text">
                    <h1>Termos de Locação</h1>
                    <p>Revise as regras e confirme sua concordância.</p>
                </div>
            </header>

            <div className="contract-flex-layout">
                {/* Compact Top Summary */}
                <section className="compact-rental-summary">
                    <div className="summary-item">
                        <img src="/locker-icon.png" alt="Locker" className="locker-picto" />
                        <span>#{rentalSummary.id} ({rentalSummary.size})</span>
                    </div>
                    <div className="summary-item">
                        <span>{rentalSummary.floor}</span>
                    </div>
                    <div className="summary-item">
                        <Calendar size={16} />
                        <span>{rentalSummary.duration}</span>
                    </div>
                    <div className="summary-item price-badge">
                        <span>{rentalSummary.price}</span>
                    </div>
                </section>

                {/* Main Contract Card */}
                <main className="contract-main-content">
                    <section className="contract-view-card card">
                        <div className="contract-view-header">
                            <IoMdPricetag size={24} className="contract-icon-img" />
                            <h2>Contrato</h2>
                        </div>
                        <div className="contract-view-body">
                            {isLoading ? (
                                <div className="contract-loading">Carregando regulamento...</div>
                            ) : (
                                <div
                                    className="content-text"
                                    dangerouslySetInnerHTML={{ __html: contractText.replace(/\n\n/g, '<br/><br/>').replace(/\n/g, '<br/>') }}
                                />
                            )}
                        </div>
                    </section>
                </main>

                {/* Bottom Acceptance Area */}
                <footer className="contract-actions-card card">
                    <label className="acceptance-toggle">
                        <input
                            type="checkbox"
                            checked={accepted}
                            onChange={(e) => setAccepted(e.target.checked)}
                        />
                        <div className="custom-checkbox-premium" />
                        <span>Li e aceito todos os termos e regras de uso.</span>
                    </label>

                    <button
                        className={`advance-payment-btn ${!accepted ? 'disabled' : ''}`}
                        disabled={!accepted}
                        onClick={handleContinue}
                    >
                        Pagamento
                        <ArrowRight size={20} />
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default DigitalContract;
