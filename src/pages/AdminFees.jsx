import { useState, useEffect, useMemo } from 'react';
import { dbService } from '../services/supabaseClient';
import {
    Save,
    Calculator,
    Percent,
    ChevronDown,
    ChevronUp,
    Info,
    AlertCircle,
    CheckCircle2,
    XCircle,
    AlertTriangle,
    Wallet,
    CreditCard,
    Calendar,
    Clock
} from 'lucide-react';
import Toast from '../components/Toast';
import CustomSelect from '../components/CustomSelect';
import IosWheelPicker from '../components/IosWheelPicker';

import './AdminFees.css';

const AdminFees = () => {
    const [activeTab, setActiveTab] = useState('calculator'); // 'calculator' or 'rates'
    const [config, setConfig] = useState({});
    const [isLoading, setIsLoading] = useState(true);
    const [toast, setToast] = useState(null);

    // Mercado Pago Rates & Simulator State
    const [mpRates, setMpRates] = useState({
        pixFee: 0.99,
        boletoFee: 3.49,
        cardFee: 4.98
    });

    const [simValue, setSimValue] = useState(84.99);
    const [simInstallments, setSimInstallments] = useState(1);
    const [simPaymentMethod, setSimPaymentMethod] = useState('credit_card');
    const [simMode, setSimMode] = useState('cobrar');
    const [showInstallmentDetails, setShowInstallmentDetails] = useState(false);
    const [showClientInfo, setShowClientInfo] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
    };

    // Load configurations from database
    const loadConfig = async () => {
        setIsLoading(true);
        try {
            const { data, error } = await dbService.settings.get();
            if (error) throw error;
            if (data) {
                setConfig(data);
                // Sync mpRates
                setMpRates({
                    pixFee: isNaN(parseFloat(data.mp_pix_fee)) ? 0.99 : parseFloat(data.mp_pix_fee),
                    boletoFee: isNaN(parseFloat(data.mp_boleto_fee)) ? 3.49 : parseFloat(data.mp_boleto_fee),
                    cardFee: isNaN(parseFloat(data.mp_card_vista_d0_fee)) ? 4.98 : parseFloat(data.mp_card_vista_d0_fee)
                });
            }
        } catch (err) {
            console.error('Error loading configuration:', err);
            showToast('Erro ao carregar taxas do banco de dados.', 'error');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadConfig();
    }, []);

    // Mercado Pago Official "Parcelado Comprador" rates (Tarifa de Parcelamento)
    // These coefficients exactly match the official MP Checkout rates shown in the user's screenshots
    const mpBuyerRates = {
        1: 0,
        2: 9.64,
        3: 11.23,
        4: 11.36,
        5: 14.31,
        6: 14.32,
        7: 16.72,
        8: 16.73,
        9: 19.69,
        10: 20.65,
        11: 20.66,
        12: 22.11
    };

    const installmentOptions = useMemo(() => {
        const opts = { 1: '1 parcela (à vista)' };
        for (let i = 2; i <= 12; i++) {
            opts[i] = `${i} parcelas`;
        }
        return opts;
    }, []);

    // Calculate simulation reactively
    const simulationResult = useMemo(() => {
        const value = Number(simValue) || 0;
        const method = simPaymentMethod;
        const mode = simMode;
        const installments = Number(simInstallments) || 1;

        let feeRate = 0;
        let feeLabel = '';
        let feeSubLabel = '';
        let transactionFee = 0; // Fixa do boleto se aplicável

        if (method === 'pix') {
            feeRate = mpRates.pixFee;
            feeLabel = `Na hora ${feeRate}%`;
            feeSubLabel = 'Pix';
        } else if (method === 'boleto') {
            transactionFee = mpRates.boletoFee;
            feeLabel = `3 dias úteis`;
            feeSubLabel = 'Boleto';
        } else {
            // Cartão de crédito: taxa básica (Taxa por venda) é sempre a taxa de liberação D0
            feeRate = mpRates.cardFee;
            feeLabel = `Na hora ${feeRate}%`;
            feeSubLabel = 'Cartão de crédito';
        }

        // 1. Get the installment surcharge rate paid by the buyer (mpBuyerRates)
        const buyerInstallmentRate = method === 'credit_card' ? (mpBuyerRates[installments] || 0) : 0;

        let youReceive = 0;
        let youShouldCharge = 0;
        let taxByVenda = 0;
        let installmentSurcharge = 0;
        let clientPays = 0;
        let clientInstallmentValue = 0;

        if (mode === 'cobrar') {
            // Case A: Seller enters the item PRICE (youShouldCharge = input)
            youShouldCharge = value;

            if (method === 'pix') {
                taxByVenda = youShouldCharge * (feeRate / 100);
                youReceive = youShouldCharge - taxByVenda;
                clientPays = youShouldCharge;
            } else if (method === 'boleto') {
                taxByVenda = transactionFee;
                youReceive = youShouldCharge - taxByVenda;
                clientPays = youShouldCharge;
            } else {
                // Credit Card
                // base sale tax is applied on the charged price
                taxByVenda = youShouldCharge * (feeRate / 100);
                // Installment surcharge rate is paid by the client
                installmentSurcharge = youShouldCharge * (buyerInstallmentRate / 100);
                
                clientPays = youShouldCharge + installmentSurcharge;
                clientInstallmentValue = clientPays / installments;
                youReceive = youShouldCharge - taxByVenda;
            }
        } else {
            // Case B: Seller enters the desired PAYOUT (youReceive = input)
            youReceive = value;

            if (method === 'pix') {
                // youReceive = youShouldCharge * (1 - rate) => youShouldCharge = youReceive / (1 - rate)
                youShouldCharge = youReceive / (1 - feeRate / 100);
                taxByVenda = youShouldCharge - youReceive;
                clientPays = youShouldCharge;
            } else if (method === 'boleto') {
                youShouldCharge = youReceive + transactionFee;
                taxByVenda = transactionFee;
                clientPays = youShouldCharge;
            } else {
                // Credit Card
                // base sale tax is applied on youShouldCharge
                // youReceive = youShouldCharge * (1 - baseRate) => youShouldCharge = youReceive / (1 - baseRate)
                youShouldCharge = youReceive / (1 - feeRate / 100);
                taxByVenda = youShouldCharge - youReceive;
                
                installmentSurcharge = youShouldCharge * (buyerInstallmentRate / 100);
                clientPays = youShouldCharge + installmentSurcharge;
                clientInstallmentValue = clientPays / installments;
            }
        }

        return {
            youReceive: Math.max(0, youReceive),
            youShouldCharge: Math.max(0, youShouldCharge),
            taxByVenda: Math.max(0, taxByVenda),
            feeLabel,
            feeSubLabel,
            feeRate,
            installmentSurcharge,
            installmentFeeRate: buyerInstallmentRate,
            clientPays,
            clientInstallmentValue,
            installments,
            method,
            mode
        };
    }, [simValue, simInstallments, simPaymentMethod, simMode, mpRates]);

    return (
        <div className="admin-fees-page premium-theme">
            <header className="page-header">
                <div className="header-text">
                    <h1>{activeTab === 'calculator' ? 'Calculadora de Repasse' : 'Configuração de Taxas'}</h1>
                    <p>
                        {activeTab === 'calculator' 
                            ? 'Simule recebíveis e repasses de pagamentos de forma detalhada.' 
                            : 'Defina as taxas fixas da plataforma para Pix, Boleto e Cartão.'}
                    </p>
                </div>
            </header>

            {/* Tab Navigation */}
            <div className="inspection-tabs" style={{ marginBottom: '1.5rem', width: '100%', display: 'flex', gap: '24px', borderBottom: '1px solid #e2e8f0', paddingBottom: '0' }}>
                <button 
                    className={`fees-tab-btn ${activeTab === 'calculator' ? 'active' : ''}`}
                    onClick={() => setActiveTab('calculator')}
                    style={{ 
                        padding: '12px 16px', 
                        border: 'none', 
                        background: 'transparent', 
                        color: activeTab === 'calculator' ? 'var(--primary)' : '#64748b', 
                        fontWeight: activeTab === 'calculator' ? 600 : 500, 
                        borderBottom: activeTab === 'calculator' ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: '-1px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                    }}
                >
                    <Calculator size={18} />
                    <span className="hide-on-mobile">Calculadora</span>
                </button>
                <button 
                    className={`fees-tab-btn ${activeTab === 'rates' ? 'active' : ''}`}
                    onClick={() => setActiveTab('rates')}
                    style={{ 
                        padding: '12px 16px', 
                        border: 'none', 
                        background: 'transparent', 
                        color: activeTab === 'rates' ? 'var(--primary)' : '#64748b', 
                        fontWeight: activeTab === 'rates' ? 600 : 500, 
                        borderBottom: activeTab === 'rates' ? '2px solid var(--primary)' : '2px solid transparent',
                        marginBottom: '-1px',
                        transition: 'all 0.2s',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        cursor: 'pointer',
                        fontSize: '0.95rem'
                    }}
                >
                    <Percent size={18} />
                    <span className="hide-on-mobile">Taxas</span>
                </button>
            </div>

            {isLoading ? (
                <div className="loading-state-wrapper">
                    <div className="loading-spinner"></div>
                    <span>Sincronizando dados...</span>
                </div>
            ) : (
                <div className="fees-tab-content">
                    {/* TAB 1: CALCULATOR */}
                    {activeTab === 'calculator' && (
                        <div className="card fees-modern-card fade-in">


                            <div className="card-content-premium mp-simulator-layout">
                                {/* LEFT: Inputs Panel */}
                                <div className="mp-sim-inputs">
                                    {/* Cobrar / Receber Toggle */}
                                    <div className="mp-mode-toggle">
                                        <label className={`mp-radio-label ${simMode === 'cobrar' ? 'active' : ''}`}>
                                            <input 
                                                type="radio" 
                                                name="simMode" 
                                                value="cobrar" 
                                                checked={simMode === 'cobrar'} 
                                                onChange={() => setSimMode('cobrar')}
                                            />
                                            <span className="mp-radio-dot"></span>
                                            Cobrar
                                        </label>
                                        <label className={`mp-radio-label ${simMode === 'receber' ? 'active' : ''}`}>
                                            <input 
                                                type="radio" 
                                                name="simMode" 
                                                value="receber" 
                                                checked={simMode === 'receber'} 
                                                onChange={() => setSimMode('receber')}
                                            />
                                            <span className="mp-radio-dot"></span>
                                            Receber
                                        </label>
                                    </div>

                                    {/* Value Input */}
                                    <div className="mp-value-input-section">
                                        <span className="mp-value-question">
                                            {simMode === 'receber' ? 'Quanto você quer receber?' : 'Quanto você quer cobrar?'}
                                        </span>
                                        <div className="mp-value-input-row">
                                            <span className="mp-currency-prefix">R$</span>
                                            <input 
                                                type="number" 
                                                className="mp-value-input" 
                                                value={simValue === 0 ? '' : simValue} 
                                                onChange={e => setSimValue(parseFloat(e.target.value) || 0)}
                                                placeholder="0,00"
                                            />
                                        </div>
                                        <div className="mp-value-underline"></div>
                                    </div>

                                    {/* Presets Row */}
                                    <div className="quick-presets-row">
                                        <button className={`preset-pill ${simValue === 84.99 ? 'active' : ''}`} onClick={() => setSimValue(84.99)}>
                                            Pq. Sem. (R$ 84,99)
                                        </button>
                                        <button className={`preset-pill ${simValue === 124.99 ? 'active' : ''}`} onClick={() => setSimValue(124.99)}>
                                            Pq. Anual (R$ 124,99)
                                        </button>
                                        <button className={`preset-pill ${simValue === 114.99 ? 'active' : ''}`} onClick={() => setSimValue(114.99)}>
                                            Gr. Sem. (R$ 114.99)
                                        </button>
                                        <button className={`preset-pill ${simValue === 174.99 ? 'active' : ''}`} onClick={() => setSimValue(174.99)}>
                                            Gr. Anual (R$ 174.99)
                                        </button>
                                        <button className={`preset-pill ${simValue === 20 ? 'active' : ''}`} onClick={() => setSimValue(20)}>
                                            Troca (R$ 20)
                                        </button>
                                    </div>

                                    {/* Selectors Card */}
                                    <div className="mp-selectors-card">
                                        <div className="mp-selectors-grid">
                                            <div className="mp-select-field">
                                                <label className="mp-select-label">Com qual meio você quer cobrar?</label>
                                                <CustomSelect
                                                    icon={<Wallet size={18} />}
                                                    value="checkout"
                                                    options={{ checkout: 'Checkout' }}
                                                    onChange={() => {}}
                                                    disabled={true}
                                                />
                                            </div>

                                            <div className="mp-select-field">
                                                <label className="mp-select-label">Como seus clientes vão te pagar?</label>
                                                <CustomSelect
                                                    icon={<CreditCard size={18} />}
                                                    value={simPaymentMethod}
                                                    options={{
                                                        credit_card: 'Cartão de crédito',
                                                        pix: 'Pix',
                                                        boleto: 'Boleto'
                                                    }}
                                                    onChange={val => {
                                                        setSimPaymentMethod(val);
                                                        if (val !== 'credit_card') setSimInstallments(1);
                                                    }}
                                                />
                                            </div>

                                            {simPaymentMethod === 'credit_card' && (
                                                <div className="mp-select-field">
                                                    <label className="mp-select-label">Que tipo de pagamento você quer oferecer?</label>
                                                    <CustomSelect
                                                        icon={<Percent size={18} />}
                                                        value="buyer"
                                                        options={{ buyer: 'Parcelado cliente' }}
                                                        onChange={() => {}}
                                                        disabled={true}
                                                    />
                                                </div>
                                            )}

                                            {simPaymentMethod === 'credit_card' && (
                                                <div className="mp-select-field">
                                                    <label className="mp-select-label">Em quantas parcelas?</label>
                                                    <IosWheelPicker
                                                        value={simInstallments}
                                                        min={1}
                                                        max={12}
                                                        onChange={setSimInstallments}
                                                    />
                                                </div>
                                            )}

                                            <div className="mp-select-field">
                                                <label className="mp-select-label">
                                                    Quando você quer receber o dinheiro?
                                                    <Info size={14} className="mp-info-icon" title="Prazo padrão contratado no Mercado Pago" />
                                                </label>
                                                <CustomSelect
                                                    icon={<Clock size={18} />}
                                                    value="standard"
                                                    options={{ standard: simPaymentMethod === 'boleto' ? '3 dias' : 'Na hora' }}
                                                    onChange={() => {}}
                                                    disabled={true}
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* RIGHT: Results Panel */}
                                <div className="mp-sim-results">
                                    {/* Main Result Card */}
                                    <div className="mp-result-card">
                                        <div className="mp-result-line main">
                                            <span className="mp-result-label-main">{simMode === 'receber' ? 'Para receber' : 'Se o preço for'}</span>
                                            <span className="mp-result-value-main">R${(simMode === 'receber' ? simulationResult.youReceive : simulationResult.youShouldCharge).toFixed(2).replace('.', ',')}</span>
                                        </div>

                                        <div className="mp-result-divider"></div>

                                        <div className="mp-result-line">
                                            <div className="mp-result-label-sub">
                                                <span>Taxa por venda</span>
                                                <span className="mp-result-sublabel">{simulationResult.feeLabel.replace('.', ',')}</span>
                                            </div>
                                            <span className="mp-result-value-fee">- R${simulationResult.taxByVenda.toFixed(2).replace('.', ',')}</span>
                                        </div>

                                        {/* Installment Details (Card only, > 1x) */}
                                        {simPaymentMethod === 'credit_card' && simInstallments > 1 && (
                                            <>
                                                <div className="mp-result-divider"></div>
                                                <div style={{ display: 'flex', padding: '0.25rem 0' }}>
                                                    <button 
                                                        type="button" 
                                                        className="mp-link-btn" 
                                                        onClick={() => setShowInstallmentDetails(prev => !prev)}
                                                    >
                                                        Detalhes do parcelamento
                                                        {showInstallmentDetails ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </button>
                                                </div>
                                                {showInstallmentDetails && (
                                                    <div className="mp-details-content">
                                                        <div className="mp-result-line sm">
                                                            <span>Acréscimo no preço</span>
                                                            <span className="mp-result-value-detail">+ R${simulationResult.installmentSurcharge.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                        <div className="mp-result-line sm">
                                                            <div>
                                                                <span>Taxa de parcelamento</span>
                                                                <span className="mp-result-sublabel">{simulationResult.installmentFeeRate.toFixed(2).replace('.', ',')}%</span>
                                                            </div>
                                                            <span className="mp-result-value-detail">- R${simulationResult.installmentSurcharge.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                    </div>
                                                )}
                                            </>
                                        )}

                                        <div className="mp-result-divider thick"></div>

                                        <div className="mp-result-line main">
                                            <span className="mp-result-label-main">{simMode === 'receber' ? 'Você deve cobrar' : 'Você recebe'}</span>
                                            <span className="mp-result-value-main">R${(simMode === 'receber' ? simulationResult.youShouldCharge : simulationResult.youReceive).toFixed(2).replace('.', ',')}</span>
                                        </div>
                                    </div>

                                    {/* Client Info Card (Card only, > 1x) */}
                                    {simPaymentMethod === 'credit_card' && simInstallments > 1 && (
                                        <div className="mp-client-card">
                                            <div className="mp-client-card-header">
                                                <h4>Informações para seu cliente</h4>
                                            </div>
                                            
                                            {showClientInfo && (
                                                <div className="mp-client-content">
                                                    <div className="mp-result-line sm">
                                                        <span className="mp-result-value-detail" style={{ color: 'var(--text-muted)' }}>Preço</span>
                                                        <span className="mp-result-value-detail">R${simulationResult.youShouldCharge.toFixed(2).replace('.', ',')}</span>
                                                    </div>
                                                    <div className="mp-result-line sm">
                                                        <span className="mp-result-value-detail" style={{ color: 'var(--text-muted)' }}>Acréscimo no preço</span>
                                                        <span className="mp-result-value-detail">R${simulationResult.installmentSurcharge.toFixed(2).replace('.', ',')}</span>
                                                    </div>
                                                    
                                                    <div className="mp-result-divider" style={{ margin: '0.5rem 0' }}></div>
                                                    
                                                    <div className="mp-result-line main" style={{ padding: '0.25rem 0' }}>
                                                        <div>
                                                            <span className="mp-result-label-main">Seu cliente paga</span>
                                                            <span className="mp-result-sublabel">Em {simInstallments} de R${simulationResult.clientInstallmentValue.toFixed(2).replace('.', ',')}</span>
                                                        </div>
                                                        <span className="mp-result-value-main">R${simulationResult.clientPays.toFixed(2).replace('.', ',')}</span>
                                                    </div>
                                                </div>
                                            )}
                                            
                                            <div className="mp-client-card-footer">
                                                <button 
                                                    type="button" 
                                                    className="mp-link-btn" 
                                                    onClick={() => setShowClientInfo(prev => !prev)}
                                                >
                                                    {showClientInfo ? 'Mostrar menos detalhes' : 'Mostrar mais detalhes'}
                                                    {showClientInfo ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* TAB 2: CONFIGURATION OF RATES */}
                    {activeTab === 'rates' && (
                        <div className="card fees-modern-card fade-in">
                            <div className="card-content-premium">
                                <div className="mp-official-rates-list">
                                    {/* Cartão de Crédito */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Cartão de crédito</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">À vista - Na hora</span>
                                            <span className="mp-official-badge">{mpRates.cardFee.toFixed(2).replace('.', ',')}%</span>
                                        </div>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">2x a 6x - Na hora</span>
                                            <span className="mp-official-badge">2,99%</span>
                                        </div>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">7x a 12x - Na hora</span>
                                            <span className="mp-official-badge">3,09%</span>
                                        </div>
                                        <p className="mp-official-subtext">
                                            As taxas exibidas são Parcelado Vendedor. Para Parcelado Comprador, elas podem chegar até {mpRates.cardFee.toFixed(2).replace('.', ',')}%.
                                        </p>
                                    </div>

                                    {/* Saldo no Mercado Pago */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Saldo no Mercado Pago</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">Na hora</span>
                                            <span className="mp-official-badge">4,99%</span>
                                        </div>
                                    </div>

                                    {/* Linha de Crédito */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Linha de Crédito</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">Na hora</span>
                                            <span className="mp-official-badge">4,99%</span>
                                        </div>
                                    </div>

                                    {/* Open Finance */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Open Finance</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">Na hora</span>
                                            <span className="mp-official-badge">0,00%</span>
                                        </div>
                                    </div>

                                    {/* Pix */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Pix</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">Na hora</span>
                                            <span className="mp-official-badge">{mpRates.pixFee.toFixed(2).replace('.', ',')}%</span>
                                        </div>
                                    </div>

                                    {/* Cartão pré-pago */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Cartão pré-pago</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">Na hora</span>
                                            <span className="mp-official-badge">4,99%</span>
                                        </div>
                                    </div>

                                    {/* Boleto */}
                                    <div className="mp-official-section">
                                        <h4 className="mp-official-section-title">Boleto</h4>
                                        <div className="mp-official-item">
                                            <span className="mp-official-item-label">3 dias</span>
                                            <span className="mp-official-badge">R$ {mpRates.boletoFee.toFixed(2).replace('.', ',')}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {toast && (
                <Toast 
                    message={toast.message} 
                    type={toast.type} 
                    onClose={() => setToast(null)} 
                />
            )}
        </div>
    );
};

export default AdminFees;
