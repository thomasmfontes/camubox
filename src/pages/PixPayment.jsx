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
    ArrowRight,
    Shield
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
    const isUpgrade = state?.type === 'upgrade';
    const isRenewal = state?.locker?.isRenewal === true;
    const exchangeInfo = state?.exchangeInfo;
    const upgradeInfo = state?.upgradeInfo;
    const selectedLocker = state?.locker || {
        id: '000',
        size: 'N/A',
        plan: 'semestral',
        priceSem: 0,
        priceAnn: 0
    };

    const isSemestral = selectedLocker.plan?.toLowerCase() === 'semestral';
    const price = isUpgrade ? (upgradeInfo?.fee ?? 50) : (isExchange ? (exchangeInfo?.fee ?? 20) : (isSemestral ? selectedLocker.priceSem : selectedLocker.priceAnn));

    const rentalDetails = {
        id: selectedLocker.id,
        contract: isUpgrade ? 'Upgrade para Anual' : (isExchange ? 'Taxa de Troca' : isRenewal ? `Renovação ${isSemestral ? 'Semestral' : 'Anual'}` : (isSemestral ? 'Semestral' : 'Anual')),
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
                // 0. Verificar se já existe uma locação pendente para este usuário e armário (Evita duplicatas no Refresh)
                let correlationID;

                if (!isExchange) {
                    const { data: existingRental } = await supabase
                        .from('t_locacao')
                        .select('id_locacao')
                        .eq('id_usuario', user.id_usuario)
                        .eq('id_armario', selectedLocker.dbId)
                        .eq('id_status', 3) // Pendente
                        .maybeSingle();

                    if (existingRental) {
                        // Se a locação já estiver Paga (status 1), redireciona direto para Meus Armários
                        if (existingRental.id_status === 1) {
                            navigate('/dashboard/my-locker');
                            return;
                        }
                        correlationID = existingRental.id_locacao.toString();
                    }
                }

                // 1. Criar o registro da locação no Supabase primeiro para ter o ID (se não houver um pendente)
                if (!correlationID) {
                    if (isUpgrade) {
                        correlationID = `UPG_${upgradeInfo.rentalId}_${upgradeInfo.newTypeId}`;
                    } else if (isExchange) {
                        correlationID = `EXC_${exchangeInfo.rentalId}_${exchangeInfo.oldLockerId}_${selectedLocker.dbId}`;
                    } else {
                    // Para renovação: encerra o contrato anterior (atualiza id_status para 4) antes de criar o novo
                    if (isRenewal && selectedLocker.previousContractId) {
                        await supabase
                            .from('t_locacao')
                            .update({ id_status: 4 })
                            .eq('id_locacao', selectedLocker.previousContractId);
                    }

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
            }

                // 2. Chamar nossa API de backend para criar a cobrança na Woovi
                const response = await fetch('/api/woovi/charge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        correlationID,
                        value: price * 100, // Woovi usa centavos
                        comment: `CAMUBOX: ${isUpgrade ? 'Upgrade' : isExchange ? 'Troca' : isRenewal ? 'Renovação' : 'Locação'} Armário ${selectedLocker.id} (${user.name || user.email})`,
                        customer: {
                            name: user.nm_usuario || user.name || user.email,
                            email: user.email,
                            // taxID: user.cpf // Futuro: Adicionar CPF aqui ajuda a reduzir flags de fraude
                        },
                        additionalInfo: [
                            { key: 'Armário', value: selectedLocker.id },
                            { key: 'Tipo', value: isUpgrade ? 'Upgrade' : isExchange ? 'Troca' : isRenewal ? 'Renovação' : 'Locação' },
                            { key: 'Usuario', value: user.name || user.email }
                        ]
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
                const watchId = (isExchange || isUpgrade) ? (isExchange ? exchangeInfo.rentalId.toString() : upgradeInfo.rentalId.toString()) : correlationID;
                subscription = supabase
                    .channel(`status-${watchId}`)
                    .on('postgres_changes', { 
                        event: 'UPDATE', 
                        schema: 'public', 
                        table: 't_locacao',
                        filter: `id_locacao=eq.${watchId}`
                    }, (payload) => {
                        console.log('🔔 Realtime Update:', payload);
                        if (isUpgrade) {
                            if (payload.new.id_tipo === 2) {
                                setStatus('confirmed');
                            }
                        } else if (isExchange) {
                            if (payload.new.id_armario === selectedLocker.dbId) {
                                setStatus('confirmed');
                                dbService.waitingList.complete(selectedLocker.dbId, user.id_usuario);
                            }
                        } else {
                            if (payload.new.id_status === 1) {
                                setStatus('confirmed');
                                dbService.waitingList.complete(selectedLocker.dbId, user.id_usuario);
                            }
                        }
                    })
                    .subscribe();

                // 4. Fallback: Verificação Manual a cada 5 segundos
                checkInterval = setInterval(async () => {
                    if (isUpgrade) {
                        const { data: currentRental } = await supabase
                            .from('t_locacao')
                            .select('id_tipo')
                            .eq('id_locacao', upgradeInfo.rentalId)
                            .single();
                        
                        if (currentRental?.id_tipo === 2) {
                            setStatus('confirmed');
                            clearInterval(checkInterval);
                        }
                    } else if (isExchange) {
                        const { data: currentRental } = await supabase
                            .from('t_locacao')
                            .select('id_armario')
                            .eq('id_locacao', exchangeInfo.rentalId)
                            .single();
                        
                        if (currentRental?.id_armario === selectedLocker.dbId) {
                            setStatus('confirmed');
                            clearInterval(checkInterval);
                        }
                    } else {
                        const { data: currentRental } = await supabase
                            .from('t_locacao')
                            .select('id_status')
                            .eq('id_locacao', correlationID)
                            .single();
                        
                        if (currentRental?.id_status === 1) {
                            setStatus('confirmed');
                            clearInterval(checkInterval);
                        }
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
    }, [user, exchangeInfo?.rentalId, exchangeInfo?.oldLockerId, isExchange, isSemestral, price, selectedLocker.dbId, selectedLocker.id, navigate]);

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
                    <h1>{isUpgrade ? 'Upgrade de Plano' : isExchange ? 'Pagamento da Taxa de Troca' : isRenewal ? 'Renovar Contrato' : 'Finalizar Pagamento'}</h1>
                    <p>{isUpgrade ? 'Ao migrar para o plano anual, você garante mais tempo de uso com o melhor custo-benefício.' : isExchange ? 'Após o pagamento, sua troca será processada instantaneamente.' : isRenewal ? 'Renove seu armário com prioridade. O prazo de carência garante a sua vaga.' : 'Sua reserva está garantida enquanto o QR Code for válido.'}</p>
                    
                    <div className="bank-security-notice">
                        <Shield size={14} />
                        <span>Atenção: Alguns bancos podem exibir um alerta de segurança por ser uma conta nova. A CAMUBOX é um serviço verificado e você pode prosseguir com segurança.</span>
                    </div>
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

                        {status !== 'confirmed' && (
                            <>
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
                            </>
                        )}
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
                                    <h3>{isUpgrade ? 'Upgrade Realizado!' : isExchange ? 'Troca Realizada!' : 'Sucesso!'}</h3>
                                </div>
                                <p>{isUpgrade ? 'Seu plano foi alterado para Anual e a validade do seu contrato foi estendida.' : isExchange ? 'Sua troca foi concluída e o novo armário já está ativo.' : isRenewal ? 'Seu contrato foi renovado! O armário continua garantido para você.' : 'Sua locação foi confirmada e o armário já está liberado.'}</p>
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
