import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
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

    // MOCK: Generate static Pix code
    useEffect(() => {
        const timer = setTimeout(() => {
            setStatus('pending');
        }, 1500);
        return () => clearTimeout(timer);
    }, []);

    const handleCopy = () => {
        navigator.clipboard.writeText("00020101021226840014br.gov.bcb.pix...mock...code");
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
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
                                <div className="qr-skeleton animate-pulse" style={{width: 180, height: 180, backgroundColor: 'rgba(255,255,255,0.1)', borderRadius: 12}}></div>
                            ) : (
                                <QrCode size={180} strokeWidth={1.5} color="var(--primary-color)" />
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
                            <input type="text" value={status === 'generating' ? 'Gerando código...' : '00020101021226840014br.gov.bcb.pix...mock...code'} readOnly />
                            <button className={`copy-btn-premium ${copied ? 'success' : ''}`} onClick={handleCopy} disabled={status === 'generating'}>
                                {copied ? <CheckCircle2 size={18} /> : <Copy size={18} />}
                                <span>{copied ? 'Copiado' : 'Copiar'}</span>
                            </button>
                        </div>
                        {errorMsg && <p className="error-message p-sm" style={{color: 'var(--red-500)', marginTop: 8}}>{errorMsg}</p>}
                    </div>
                </section>

                <aside className="payment-sidebar">
                    <div className="order-summary card">
                        <h3>Resumo do {isExchange ? 'Processo' : 'Pedido'}</h3>
                        <div className="order-rows">
                            <div className="order-row">
                                <img src="/lockers.png" alt="" className="nav-img-icon" style={{ opacity: 0.7 }} />
                                <span>{isExchange ? `Novo Armário #${selectedLocker.id}` : `Armário #${rentalDetails.id}`}</span>
                            </div>
                            <div className="order-row">
                                <img src="/contract.png" alt="" className="nav-img-icon" />
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
                                    onClick={handleMockPayment}
                                    disabled={status === 'verifying' || status === 'generating'}
                                >
                                    {status === 'verifying' ? 'Gravando no Banco...' : 'Simular Pagamento (MOCK)'}
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
