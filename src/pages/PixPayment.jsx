import { useState, useEffect } from 'react';
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
    ArrowRight,
    MapPin
} from 'lucide-react';
import { supabase } from '../services/supabaseClient';
import './PixPayment.css';

const PixPayment = ({ user }) => {
    const navigate = useNavigate();
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
        price: `R$ ${price},00`
    };

    const [qrCodeData, setQrCodeData] = useState(null);

    // Gerar cobrança real na Woovi
    useEffect(() => {
        const generatePix = async () => {
            try {
                // 1. Criar o registro da locação no Supabase primeiro para ter o ID
                // Usaremos um status temporário se existir, ou o status 1 (ativa) 
                // para simplificar o mock atual do usuário, mas o ideal seria um status 'pendente'
                const { data: { user: currentUser } } = await supabase.auth.getUser();
                if (!currentUser) throw new Error('Usuário não logado');

                let correlationID;

                if (isExchange) {
                    // Para troca, usaremos o ID da locação existente concatenado com algo único
                    correlationID = `${exchangeInfo.rentalId}`;
                } else {
                    const { data: newRental, error: rentalError } = await supabase.from('t_locacao').insert({
                        id_armario: selectedLocker.dbId,
                        id_usuario: currentUser.id,
                        nm_texto_contrato: 'Contrato Aceito Digitalmente',
                        id_tipo: isSemestral ? 1 : 2,
                        id_status: 3, // Assumindo 3 como Pendente (visto que 1=Ativa, 2=Encerrada)
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
                            name: currentUser.user_metadata?.full_name || currentUser.email,
                            email: currentUser.email,
                        }
                    })
                });

                const data = await response.json();
                if (!response.ok) throw new Error(data.error || 'Erro ao gerar cobrança');

                setQrCodeData(data.charge);
                setStatus('pending');

                // 3. Opcional: Escutar mudanças no Supabase via Realtime para confirmar automático
                const subscription = supabase
                    .channel('status-update')
                    .on('postgres_changes', { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 't_locacao',
                        filter: `id_locacao=eq.${correlationID}`
                    }, (payload) => {
                        if (payload.new.id_status === 1) {
                            setStatus('confirmed');
                            subscription.unsubscribe();
                        }
                    })
                    .subscribe();

            } catch (err) {
                console.error('Erro Woovi:', err);
                setErrorMsg('Erro ao gerar PIX. Verifique sua conexão ou tente mais tarde.');
                setStatus('error');
            }
        };

        generatePix();
    }, []);

    const handleCopy = () => {
        if (qrCodeData?.brCode) {
            navigator.clipboard.writeText(qrCodeData.brCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const handleMockPayment = async () => {
        setStatus('verifying');
        try {
            const { data: { user: currentUser } } = await supabase.auth.getUser();
            if (!currentUser) throw new Error('Usuário não logado');

            if (isExchange) {
                // MOCK Exchange logic
                const { data: oldRental } = await supabase.from('t_locacao').select('*').eq('id_locacao', exchangeInfo.rentalId).single();
                if (oldRental) {
                    const historyRecord = { ...oldRental };
                    delete historyRecord.id_locacao;
                    historyRecord.id_status = 2; // Historico
                    historyRecord.dt_termino = new Date().toISOString().split('T')[0];
                    await supabase.from('t_locacao').insert([historyRecord]);
                }
                await supabase.from('t_locacao').update({ id_armario: selectedLocker.dbId }).eq('id_locacao', exchangeInfo.rentalId);
            } else {
                // MOCK Rental logic
                await supabase.from('t_locacao').insert({
                    id_armario: selectedLocker.dbId,
                    id_usuario: currentUser.id,
                    nm_texto_contrato: 'Contrato Aceito Digitalmente',
                    id_tipo: 1,
                    id_status: 1,
                    dt_inicio: new Date().toISOString(),
                    dt_termino: new Date(new Date().setMonth(new Date().getMonth() + 6)).toISOString()
                });
            }

            setStatus('confirmed');
        } catch (error) {
            console.error(error);
            setErrorMsg('Erro ao confirmar pagamento. Tente novamente.');
            setStatus('error');
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
                            <MapPin size={16} />
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
                                    <div className="qr-skeleton animate-pulse" style={{backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12}}></div>
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
                                <button
                                    className={`verify-btn-premium ${status === 'verifying' ? 'loading' : ''}`}
                                    onClick={() => setStatus('verifying')}
                                    disabled={status === 'verifying' || status === 'generating'}
                                >
                                    {status === 'verifying' ? 'Verificando...' : 'Já paguei'}
                                </button>
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
