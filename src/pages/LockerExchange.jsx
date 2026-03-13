import { useState } from 'react';
import {
    ArrowLeftRight,
    User,
    AlertCircle,
    DollarSign,
    CheckCircle2,
    XCircle,
    Clock,
    Search,
    Check
} from 'lucide-react';
import './LockerExchange.css';

const LockerExchange = () => {
    const [requests, setRequests] = useState([
        {
            id: 1,
            responsible: 'João Mendes',
            currentLocker: 'S02',
            requestedLocker: 'T15',
            reason: 'Andar mais acessível',
            fee: 'R$ 20,00',
            status: 'pendente'
        },
        {
            id: 2,
            responsible: 'Carla Dias',
            currentLocker: 'A10',
            requestedLocker: 'A12',
            reason: 'Proximidade com colega',
            fee: 'R$ 20,00',
            status: 'aprovado'
        },
        {
            id: 3,
            responsible: 'Lucas Rocha',
            currentLocker: 'T05',
            requestedLocker: 'S08',
            reason: 'Tamanho maior (Grande)',
            fee: 'R$ 35,00',
            status: 'taxa_pendente'
        }
    ]);

    const [searchTerm, setSearchTerm] = useState('');

    const updateStatus = (id, newStatus) => {
        setRequests(requests.map(req =>
            req.id === id ? { ...req, status: newStatus } : req
        ));

        // Simulation toast
        const toast = document.createElement('div');
        toast.className = 'exchange-toast';
        toast.innerText = `Status de troca atualizado!`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2500);
    };

    const getStatusBadge = (status) => {
        switch (status) {
            case 'pendente':
                return <span className="status-badge pending"><Clock size={12} /> Pendente</span>;
            case 'aprovado':
                return <span className="status-badge approved"><CheckCircle2 size={12} /> Aprovado</span>;
            case 'reprovado':
                return <span className="status-badge rejected"><XCircle size={12} /> Reprovado</span>;
            case 'taxa_pendente':
                return <span className="status-badge fee"><DollarSign size={12} /> Taxa Pendente</span>;
            case 'concluido':
                return <span className="status-badge completed"><Check size={12} /> Concluído</span>;
            default:
                return null;
        }
    };

    const filteredRequests = requests.filter(req =>
        req.responsible.toLowerCase().includes(searchTerm.toLowerCase()) ||
        req.currentLocker.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="locker-exchange-page">
            <header className="page-header">
                <div className="header-text">
                    <h1>Gestão de Trocas</h1>
                    <p>Gerencie solicitações de troca de armários e cobrança de taxas.</p>
                </div>
            </header>

            {/* Filter Bar */}
            <div className="table-actions-bar card">
                <div className="search-box">
                    <Search size={18} />
                    <input
                        type="text"
                        placeholder="Buscar por responsável ou armário..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
            </div>

            {/* Requests Table */}
            <div className="table-container card">
                <table className="exchange-table">
                    <thead>
                        <tr>
                            <th>Responsável</th>
                            <th>Armário Atual</th>
                            <th>Solicitado</th>
                            <th>Motivo</th>
                            <th>Taxa</th>
                            <th>Status</th>
                            <th className="actions-cell">Ações</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredRequests.map((req) => (
                            <tr key={req.id}>
                                <td>
                                    <div className="user-cell">
                                        <User size={14} />
                                        {req.responsible}
                                    </div>
                                </td>
                                <td><span className="locker-pill current">{req.currentLocker}</span></td>
                                <td><span className="locker-pill requested">{req.requestedLocker}</span></td>
                                <td>
                                    <div className="reason-cell">
                                        <AlertCircle size={14} />
                                        {req.reason}
                                    </div>
                                </td>
                                <td><span className="fee-text">{req.fee}</span></td>
                                <td>{getStatusBadge(req.status)}</td>
                                <td className="actions-cell">
                                    <div className="action-group">
                                        {req.status === 'pendente' && (
                                            <>
                                                <button className="icon-btn success" title="Aprovar" onClick={() => updateStatus(req.id, 'aprovado')}>
                                                    <CheckCircle2 size={18} />
                                                </button>
                                                <button className="icon-btn danger" title="Reprovar" onClick={() => updateStatus(req.id, 'reprovado')}>
                                                    <XCircle size={18} />
                                                </button>
                                            </>
                                        )}

                                        {req.status === 'aprovado' && (
                                            <button className="primary-btn sm" onClick={() => updateStatus(req.id, 'taxa_pendente')}>
                                                Gerar Taxa
                                            </button>
                                        )}

                                        {req.status === 'taxa_pendente' && (
                                            <button className="primary-btn sm success" onClick={() => updateStatus(req.id, 'concluido')}>
                                                Concluir Troca
                                            </button>
                                        )}

                                        {req.status === 'concluido' && (
                                            <CheckCircle2 size={18} className="text-success" />
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default LockerExchange;
