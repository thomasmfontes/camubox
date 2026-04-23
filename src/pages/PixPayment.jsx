import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { IoMdPricetag } from 'react-icons/io';
import {
    QrCode,
    Copy,
    RefreshCcw,
    CheckCircle2,
    Clock,
    XCircle,
    ChevronLeft,
    ArrowRight
} from 'lucide-react';
import { supabase, dbService } from '../services/supabaseClient';
import './PixPayment.css';

const PixPayment = ({ user }) => {
    const navigate = useNavigate();
    const hasGenerated = useRef(false);
    const location = useLocation();
    const { state } = location;
    
    // Status can be: 'generating' -> 'pending' -> 'verifying' -> 'confirmed' -> 'error'
    const [status, setStatus] = useState('generating');
    const [copied, setCopied] = useState(false);
    const [errorMsg, setErrorMsg] = useState('');

    const isExchange = state?.type === 'exchange';
    const exchangeInfo = state?.exchangeInfo;
    const selectedLocker = state?.locker || {
        id: '000',
        size: 'N/A',
        plan: 'semestral',
        priceSem: 0,
        priceAnn: 0
    };

    const isSemestral = selectedLocker.plan?.toLowerCase() === 'semestral';
    const price = isExchange ? 20 : (isSemestral ? selectedLocker.priceSem : selectedLocker.priceAnn);

    const rentalDetails = {
        id: selectedLocker.id,
        contract: isExchange ? 'Taxa de Troca' : (isSemestral ? 'Semestral' : 'Anual'),
        price: new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(price)
    };

    const [qrCodeData, setQrCodeData] = useState(null);

    // Gerar cobrança real na Woovi
    useEffect(() => {
        let subscription;
        let checkInterval;

        const generatePix = async () => {
            if (!user || hasGenerated.current) return;
            hasGenerated.current = true;
            
            try {
                // 1. Criar o registro da locação no Supabase primeiro para ter o ID
                let correlationID;

                if (isExchange) {
                    correlationID = `${exchangeInfo?.rentalId || 'new'}`;
                } else {
                    const { data: newRental, error: rentalError } = await supabase.from('t_locacao').insert({
                        id_armario: selectedLocker.dbId,
                        id_usuario: user.id_usuario,
                        id_tipo: isSemestral ? 1 : 2,
                        id_status: 3, // Assumindo 3 como Pendente
                        dt_inicio: new Date().toISOString(),
                        dt_termino: isSemestral 
                           ? new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString()
                           : new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString()
                    }).select().single();

                    if (rentalError) throw rentalError;
                    correlationID = newRental.id_locacao.toString();
                }

                // 2. Chamar nossa API de backend para criar a cobrança na Woovi
                const response = await fetch('/api/woovi/charge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        correlationID,
                        value: price * 100, // Woovi usa centavos
                        comment: isExchange ? `Troca Armário ${selectedLocker.id}` : `Locação Armário ${selectedLocker.id}`,
                        customer: {
                            name: user.nm_usuario || user.email,
                            email: user.email,
                        }
                    })
                });

                if (!response.ok) {
                    const text = await response.text();
                    throw new Error(`Erro ${response.status}: ${text.substring(0, 50)}...`);
                }

                const data = await response.json();
                setQrCodeData(data.charge);
                setStatus('pending');

                // 3. Escutar mudanças via Realtime (Canal Único)
                subscription = supabase
                    .channel(`status-${correlationID}`)
                    .on('postgres_changes', { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 't_locacao',
                        filter: `id_locacao=eq.${correlationID}`
                    }, (payload) => {
                        console.log('🔔 Realtime Update:', payload);
                        if (payload.new.id_status === 1) {
                            setStatus('confirmed');
                            dbService.waitingList.complete(selectedLocker.dbId, user.id_usuario);
                        }
                    })
                    .subscribe();

                // 4. Fallback: Verificação Manual a cada 5 segundos
                checkInterval = setInterval(async () => {
                    const { data: currentRental } = await supabase
                        .from('t_locacao')
                        .select('id_status')
                        .eq('id_locacao', correlationID)
                        .single();
                    
                    if (currentRental?.id_status === 1) {
                        setStatus('confirmed');
                        clearInterval(checkInterval);
                    }
                }, 5000);

            } catch (err) {
                console.error('Erro Woovi:', err);
                setErrorMsg('Erro ao gerar PIX. Verifique sua conexão ou tente mais tarde.');
                setStatus('error');
            }
        };

        generatePix();

        return () => {
            if (subscription) subscription.unsubscribe();
            if (checkInterval) clearInterval(checkInterval);
        };
    }, [user, exchangeInfo?.rentalId, isExchange, isSemestral, price, selectedLocker.dbId, selectedLocker.id]);

    const handleCopy = () => {
        if (qrCodeData?.brCode) {
            navigator.clipboard.writeText(qrCodeData.brCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };


    return (
        <div className="pix-payment-page premium-theme">
            <header className="page-header">
                <button className="back-btn-premium" onClick={() => navigate(-1)}>
                    <ChevronLeft size={20} />
                </button>
                <div className="header-text">
                    <h1>{isExchange ? 'Pagamento da Taxa de Troca' : 'Finalizar Pagamento'}</h1>
                    <p>{isExchange ? 'Após o pagamento, sua troca será processada instantaneamente.' : 'Sua reserva está garantida enquanto o QR Code for válido.'}</p>
                </div>
            </header>

            <div className="payment-grid-premium">
                {/* Compact Top Summary - Visible on Mobile */}
                <section className="compact-payment-summary">
                    <div className="summary-item">
                        <img src="/lockers.png" alt="Armário" className="locker-picto" />
                        <span>{isExchange ? `Novo Armário #${selectedLocker.id}` : `Armário #${rentalDetails.id}`}</span>
                    </div>
                    {selectedLocker.floor && (
                        <div className="summary-item">
                            <span>{selectedLocker.floor}</span>
                        </div>
                    )}
                    <div className="summary-item">
                        <IoMdPricetag size={18} style={{ color: 'var(--primary)' }} />
                        <span>{rentalDetails.contract}</span>
                    </div>
                    <div className="summary-item price-badge">
                        <span>{rentalDetails.price}</span>
                    </div>
                </section>

                <main className="payment-main-content">
                    <section className="qr-card card">
                        <div className="card-top">
                            <div className={`status-pill ${status}`}>
                                {status === 'generating' && <><RefreshCcw size={14} className="animate-spin" /> <span>Gerando Pix...</span></>}
                                {status === 'pending' && <><Clock size={14} /> <span>Aguardando...</span></>}
                                {status === 'verifying' && <><RefreshCcw size={14} className="animate-spin" /> <span>Analisando Confirmação...</span></>}
                                {status === 'confirmed' && <><CheckCircle2 size={14} /> <span>Pago</span></>}
                                {status === 'error' && <><XCircle size={14} /> <span>Erro</span></>}
                            </div>
                            <div className="timer-text">
                                Expira em: <strong>30:00</strong>
                            </div>
                        </div>

                        <div className="qr-main-container">
                            <div className={`qr-frame ${status === 'confirmed' ? 'paid' : ''}`}>
                                {status === 'generating' ? (
                                    <div className="qr-loader-container">
                                        <RefreshCcw size={48} className="animate-spin" style={{ color: 'var(--primary)', opacity: 0.5 }} />
                                        <span style={{ marginTop: 12, fontSize: '0.8rem', opacity: 0.5 }}>Gerando QR Code...</span>
                                    </div>
                                ) : status === 'error' ? (
                                    <XCircle size={80} color="var(--red-500)" />
                                ) : (
                                    <img src={qrCodeData?.qrCodeImage} alt="QR Code Pix" style={{borderRadius: 8}} />
                                )}
                                
                                {status === 'confirmed' && (
                                    <div className="success-overlay">
                                        <CheckCircle2 size={60} />
                                    </div>
                                )}
                            </div>
                        </div>

                        <p className="qr-instruction">Aponte a câmera do seu aplicativo de banco para o QR Code acima</p>

                        <div className="pix-copy-area">
                            <label>Código Copia e Cola</label>
                            <div className="copy-input-group">
                                <input type="text" value={status === 'generating' ? 'Gerando código...' : (qrCodeData?.brCode || 'Erro ao carregar')} readOnly />
                                <button className={`copy-btn-premium ${copied ? 'success' : ''}`} onClick={handleCopy} disabled={status === 'generating' || !qrCodeData?.brCode}>
                                    {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                                    <span>{copied ? 'Copiado' : 'Copiar'}</span>
                                </button>
                            </div>
                            {errorMsg && <p className="error-message p-sm" style={{color: 'var(--red-500)', marginTop: 8}}>{errorMsg}</p>}
                        </div>
                    </section>
                </main>

                <aside className="payment-sidebar">
                    <div className="order-summary card">
                        <h3>Resumo do {isExchange ? 'Processo' : 'Pedido'}</h3>
                        <div className="order-rows">
                            <div className="order-row">
                                <img src="/lockers.png" alt="" className="nav-img-icon" style={{ opacity: 0.7 }} />
                                <span>{isExchange ? `Novo Armário #${selectedLocker.id}` : `Armário #${rentalDetails.id}`}</span>
                            </div>
                            <div className="order-row">
                                <IoMdPricetag size={20} style={{ color: 'var(--primary)' }} />
                                <span>{rentalDetails.contract}</span>
                            </div>
                        </div>
                        <div className="order-total">
                            <label>Valor Total</label>
                            <span className="price-tag">{rentalDetails.price}</span>
                        </div>
                    </div>

                    <div className="action-stack">
                        {status !== 'confirmed' ? (
                            <>
                                <div className="auto-verify-badge">
                                    <RefreshCcw size={16} className="animate-spin" />
                                    <span>Aguardando confirmação automática...</span>
                                </div>
                                <button className="cancel-order-btn" onClick={() => navigate('/dashboard/lockers')}>
                                    Cancelar locação
                                </button>
                            </>
                        ) : (
                            <div className="payment-success-card animate-bounce-in">
                                <div className="success-header">
                                    <CheckCircle2 size={32} />
                                    <h3>{isExchange ? 'Troca Realizada!' : 'Sucesso!'}</h3>
                                </div>
                                <p>{isExchange ? 'Sua troca foi concluída e o novo armário já está ativo.' : 'Sua locação foi confirmada e o armário já está liberado.'}</p>
                                <button className="go-to-lockers-btn" onClick={() => navigate('/dashboard/my-locker')}>
                                    Ver Meus Armários
                                    <ArrowRight size={18} />
                                </button>
                            </div>
                        )}
                    </div>
                </aside>
            </div>
        </div>
    );
};

export default PixPayment;
