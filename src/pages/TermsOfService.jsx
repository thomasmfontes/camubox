import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import './Legal.css';

const TermsOfService = () => {
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

                <h1>Termos de Uso</h1>

                <div className="legal-content">
                    <p>Última atualização: 12 de Março de 2026</p>

                    <p>Bem-vindo ao CAMUBOX. Ao utilizar nossos serviços, você concorda com os seguintes termos e condições.</p>

                    <h2>1. Objeto do Serviço</h2>
                    <p>O CAMUBOX é uma plataforma destinada à gestão de locação de armários acadêmicos. O uso do serviço é restrito a alunos devidamente matriculados e autorizados pela administração.</p>

                    <h2>2. Responsabilidades do Usuário</h2>
                    <p>Ao alugar um armário, o usuário se compromete a:</p>
                    <ul>
                        <li>Zelar pela integridade física do armário e cadeado (se fornecido).</li>
                        <li>Não armazenar itens perigosos, ilícitos ou perecíveis que possam causar danos.</li>
                        <li>Respeitar os prazos de renovação e devolução estabelecidos no contrato.</li>
                        <li>Manter sua senha de acesso e do armário em sigilo.</li>
                    </ul>

                    <h2>3. Pagamento e Cancelamento</h2>
                    <p>A locação é confirmada mediante o pagamento integral do período escolhido (Semestral ou Anual). Em caso de desistência antes do início do contrato, o estorno seguirá as regras administrativas vigentes.</p>

                    <h2>4. Perda de Acesso ou Danos</h2>
                    <p>Em caso de perda de senha ou danos ao armário, o usuário deve procurar imediatamente a administração do CAMU. Eventuais taxas de reparo ou troca de fechadura podem ser aplicadas.</p>

                    <h2>5. Vistoria</h2>
                    <p>A administração se reserva o direito de realizar vistorias periódicas ou emergenciais em caso de suspeita fundamentada de violação destes termos, garantindo a segurança de todos os usuários.</p>

                    <h2>6. Alterações nos Termos</h2>
                    <p>Estes termos podem ser atualizados periodicamente. O uso continuado do serviço após tais mudanças constitui aceitação dos novos termos.</p>
                </div>
            </div>
        </div>
    );
};

export default TermsOfService;
