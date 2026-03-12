import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './Legal.css';

const PrivacyPolicy = () => {
    const navigate = useNavigate();

    return (
        <div className="legal-container">
            <div className="legal-background">
                <div className="legal-blob" style={{ top: '-10%;', left: '-10%;' }}></div>
                <div className="legal-blob" style={{ bottom: '-10%;', right: '-10%;' }}></div>
            </div>

            <div className="legal-card">
                <button onClick={() => navigate(-1)} className="back-link">
                    <ArrowLeft size={20} />
                    <span>Voltar</span>
                </button>

                <h1>Política de Privacidade</h1>

                <div className="legal-content">
                    <p>Última atualização: 12 de Março de 2026</p>

                    <p>No CAMUBOX, a sua privacidade é nossa prioridade. Esta Política de Privacidade descreve como coletamos, usamos e protegemos suas informações pessoais ao utilizar nosso serviço de gestão de armários.</p>

                    <h2>1. Informações que Coletamos</h2>
                    <p>Coletamos informações necessárias para a prestação de nossos serviços, incluindo:</p>
                    <ul>
                        <li><strong>Dados de Identificação:</strong> Nome completo, RA (Registro Acadêmico) e e-mail.</li>
                        <li><strong>Dados de Autenticação:</strong> Informações fornecidas por provedores externos (Google e Apple) caso opte por esses métodos de login.</li>
                        <li><strong>Dados de Uso:</strong> Informações sobre suas locações de armários, pagamentos e interações com a plataforma.</li>
                    </ul>

                    <h2>2. Como Usamos seus Dados</h2>
                    <p>Utilizamos seus dados exclusivamente para:</p>
                    <ul>
                        <li>Gerenciar suas locações de armários.</li>
                        <li>Processar pagamentos de forma segura.</li>
                        <li>Garantir a segurança do acesso à plataforma.</li>
                        <li>Enviar comunicações essenciais sobre o status do seu armário ou contrato.</li>
                    </ul>

                    <h2>3. Proteção de Dados</h2>
                    <p>Implementamos medidas de segurança técnicas e organizacionais para proteger seus dados contra acesso não autorizado, perda ou alteração. Utilizamos serviços de infraestrutura de classe mundial (Supabase/Vercel) com criptografia de dados.</p>

                    <h2>4. Compartilhamento de Informações</h2>
                    <p>Não vendemos seus dados para terceiros. O compartilhamento ocorre apenas com os provedores de serviços necessários para a operação do sistema (como gateways de pagamento e serviços de autenticação).</p>

                    <h2>5. Seus Direitos</h2>
                    <p>Você tem o direito de acessar, corrigir ou solicitar a exclusão de seus dados pessoais a qualquer momento através de contato com a administração do CAMU.</p>
                </div>
            </div>
        </div>
    );
};

export default PrivacyPolicy;
