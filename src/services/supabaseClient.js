import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Fallback to mock data if credentials are not provided
const isMockMode = !supabaseUrl || !supabaseAnonKey || supabaseUrl.includes('your-project-url');

export const supabase = isMockMode ? null : createClient(supabaseUrl, supabaseAnonKey);

/**
 * Service to handle data interactions with the t_* tables.
 * This abstracts the database layer and allows easy swapping between real and mock data.
 */
export const dbService = {
    // SYSTEM CONFIGURATION
    settings: {
        get: async () => {
            if (isMockMode) {
                return {
                    data: {
                        id_configuracao: 1,
                        vl_pequeno_semestral: 70,
                        vl_pequeno_anual: 100,
                        vl_grande_semestral: 100,
                        vl_grande_anual: 150,
                        vl_taxa_troca: 20,
                        nr_dias_aviso_vencimento: 7,
                        is_exige_vistoria: true,
                        is_permite_gratuidade: true,
                        nm_texto_contrato: 'Termos de uso padrão...',
                        nm_woovi_api_key: 'sk_mock_123',
                        nm_woovi_webhook_url: 'https://camubox.com/api/webhook',
                        dc_woovi_ambiente: 'SANDBOX'
                    },
                    error: null
                };
            }
            return await supabase.from('t_configuracao').select('*').eq('id_configuracao', 1).single();
        },
        update: async (settingsData) => {
            if (isMockMode) {
                console.log('Mock: Updating configuration', settingsData);
                return { data: settingsData, error: null };
            }
            return await supabase
                .from('t_configuracao')
                .update({ ...settingsData, dt_atualizacao: new Date().toISOString() })
                .eq('id_configuracao', 1);
        }
    },

    // LOBBY / LOCKERS
    lockers: {
        getAll: async () => {
            if (isMockMode) {
                const mockLockers = [];
                // Generate 150 lockers to match the "correct values" screenshot
                // 112 em uso, 23 disponíveis, 8 vistoria, 4 manutenção, 3 gratuitos
                const statusDist = [
                    ...Array(112).fill('em-uso'),
                    ...Array(23).fill('disponivel'),
                    ...Array(8).fill('aguardando-vistoria'),
                    ...Array(4).fill('manutencao'),
                    ...Array(3).fill('gratuito')
                ];

                statusDist.forEach((status, i) => {
                    const id = i + 1;
                    mockLockers.push({
                        id_armario: id,
                        cd_armario: id.toString().padStart(3, '0'),
                        nr_armario: id,
                        id_tamanho: id % 2 === 0 ? 2 : 1, // alternate small/large
                        id_local: 1,
                        id_posicao: (id % 4) + 1,
                        dc_status: status,
                        nm_local: 'Térreo',
                        nm_tamanho: id % 2 === 0 ? 'Grande' : 'Pequeno',
                        nm_posicao: 'MÉDIO'
                    });
                });
                return { data: mockLockers, error: null };
            }
            return await supabase.from('v_armario').select('*').order('cd_armario');
        },
        getLookups: async () => {
            if (isMockMode) {
                return {
                    data: {
                        floors: { 1: 'Térreo', 2: '1º Andar', 3: 'Subsolo' },
                        sizes: { 1: 'Pequeno', 2: 'Grande' },
                        statuses: { 1: 'disponivel', 2: 'em-uso', 3: 'manutencao' },
                        positions: { 1: 'ALTO', 2: 'MÉDIO ALTO', 3: 'MÉDIO BAIXO', 4: 'BAIXO' }
                    },
                    error: null
                };
            }
            try {
                // Fetch status and attribute values
                const [statusRes, attrRes] = await Promise.all([
                    supabase.from('t_armario_status').select('id_status, nm_status'),
                    supabase.from('t_armario_atributo_valor').select('id_atributo, id_valor, nm_valor')
                ]);

                const statuses = statusRes.data?.reduce((acc, curr) => ({ ...acc, [curr.id_status]: curr.nm_status }), {}) || {};

                // Group attribute values by attribute ID (1=Local, 2=Posicao, 3=Tamanho - assuming based on common logic)
                // Let's check t_armario_atributo labels if possible, but based on t_armario columns:
                // id_local (int2), id_posicao (int2), id_tamanho (int2)
                const floors = attrRes.data?.filter(v => v.id_atributo === 4).reduce((acc, curr) => ({ ...acc, [curr.id_valor]: curr.nm_valor }), {}) || {};
                const positions = attrRes.data?.filter(v => v.id_atributo === 2).reduce((acc, curr) => ({ ...acc, [curr.id_valor]: curr.nm_valor }), {}) || {};
                const sizes = attrRes.data?.filter(v => v.id_atributo === 3).reduce((acc, curr) => ({ ...acc, [curr.id_valor]: curr.nm_valor }), {}) || {};

                return {
                    data: { floors, sizes, statuses, positions },
                    error: null
                };
            } catch (e) {
                return { data: null, error: e.message };
            }
        },
        getConfig: async () => {
            if (isMockMode) {
                return {
                    data: {
                        vl_pequeno_semestral: 50,
                        vl_pequeno_anual: 90,
                        vl_grande_semestral: 80,
                        vl_grande_anual: 150,
                        nm_texto_contrato: 'Termos de uso padrão...'
                    },
                    error: null
                };
            }
            return await supabase.from('t_configuracao').select('*').single();
        },
        updateStatus: async (id, statusIdOrName) => {
            if (isMockMode) {
                console.log(`Mock: Updating locker ${id} to status ${statusIdOrName} `);
                return { data: null, error: null };
            }

            let finalStatusId = statusIdOrName;
            if (typeof statusIdOrName === 'string') {
                const normalized = statusIdOrName.toUpperCase();
                if (normalized === 'OK' || normalized === 'DISPONIVEL' || normalized === 'EM_USO' || normalized === 'GRATUITO' || normalized === 'OCUPADO') {
                    finalStatusId = 1;
                } else if (normalized === 'VISTORIA') {
                    finalStatusId = 2;
                } else if (normalized === 'MANUTENCAO') {
                    finalStatusId = 3;
                } else if (normalized === 'RESERVADO' || normalized === 'RESERVADO_FILA') {
                    finalStatusId = 5;
                }
            }

            return await supabase.from('t_armario').update({ id_status: finalStatusId }).eq('id_armario', id);
        }
    },

    // STUDENTS / ENTITIES
    students: {
        search: async (term) => {
            if (isMockMode) return { data: [], error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .or(`nm_usuario.ilike.%${term}%`);
        },
        getByRA: async (ra) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .eq('nm_ra', ra)
                .maybeSingle();
        },
        getById: async (id) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .eq('id_usuario', id)
                .maybeSingle();
        }
    },
    users: {
        getAll: async () => {
            if (isMockMode) return { data: [], error: null };
            return await supabase.from('t_usuario').select('id_usuario, nm_usuario, dc_email, is_adm');
        },
        getAdmins: async () => {
            if (isMockMode) {
                return {
                    data: [
                        { nm_usuario: 'Thomas Ed', dc_email: 'thomas@example.com', role: 'Super Admin', id_usuario: 1 },
                        { nm_usuario: 'Admin CAMU', dc_email: 'admin@camubox.com', role: 'Admin', id_usuario: 2 }
                    ],
                    error: null
                };
            }
            return await supabase
                .from('t_usuario')
                .select('id_usuario, nm_usuario, dc_email, is_adm')
                .eq('is_adm', true);
        },
        getByEmail: async (email) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .eq('dc_email', email)
                .maybeSingle();
        },
        getById: async (id) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .eq('id_usuario', id)
                .maybeSingle();
        },
        create: async (userData) => {
            if (isMockMode) return { data: { id_usuario: 'mock-id', ...userData }, error: null };
            // Ensure is_adm is false by default if not specified
            const dataToInsert = { ...userData, is_adm: userData.is_adm || false };
            return await supabase
                .from('t_usuario')
                .insert([dataToInsert])
                .select()
                .maybeSingle();
        },
        getByPhone: async (phone) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .select('*')
                .eq('nr_celular', phone)
                .maybeSingle();
        },
        updateEmail: async (id, email) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_usuario')
                .update({ dc_email: email })
                .eq('id_usuario', id);
        },
        updateAdminStatus: async (email, isAdmin) => {
            if (isMockMode) {
                console.log(`Mock: Setting admin status of ${email} to ${isAdmin}`);
                return { data: null, error: null };
            }
            return await supabase
                .from('t_usuario')
                .update({ is_adm: isAdmin })
                .eq('dc_email', email);
        }
    },
    fcmTokens: {
        upsert: async (email, token) => {
            if (isMockMode) {
                console.log('Mock: Upserting FCM token', { email, token });
                return { data: null, error: null };
            }

            // In local development, /api routes usually don't exist unless using 'vercel dev'
            // We skip the sync to avoid 404 errors in the console during development
            if (window.location.hostname === 'localhost') {
                console.log('[FCM Setup] Skipping token sync on localhost (API not available)');
                return { data: null, error: null };
            }

            try {
                const response = await fetch('/api/fcm/upsert-token', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email, token })
                });
                
                // Check if response is JSON (avoid SyntaxError on 404/500 HTML responses)
                const contentType = response.headers.get('content-type');
                if (!contentType || !contentType.includes('application/json')) {
                    const _text = await response.text();
                    throw new Error(`Server returned non-JSON response: ${response.status}`);
                }

                const result = await response.json();
                if (!response.ok) throw new Error(result.error || 'Erro ao sincronizar token');
                return { data: result.data, error: null };
            } catch (err) {
                console.error('[FCM CLIENT ERROR]', err);
                return { data: null, error: err };
            }
        }
    },

    // RENTALS
    rentals: {
        create: async (rentalData) => {
            if (isMockMode) {
                console.log('Mock: Creating rental', rentalData);
                return { data: { id_locacao: 'mock-id' }, error: null };
            }
            return await supabase.from('t_locacao').insert([rentalData]).select();
        },
        getByUser: async (userId) => {
            if (isMockMode) return { data: [], error: null };

            // 1. Get rentals from t_locacao
            const { data: rentals, error: rentalError } = await supabase
                .from('t_locacao')
                .select('*')
                .eq('id_usuario', userId)
                .order('dt_termino', { ascending: false });

            if (rentalError) return { data: null, error: rentalError };
            if (!rentals || rentals.length === 0) return { data: [], error: null };

            // 2. Get locker details from v_armario for these rentals
            const lockerIds = [...new Set(rentals.map(r => r.id_armario))];
            const { data: lockers } = await supabase
                .from('v_armario')
                .select('*')
                .in('id_armario', lockerIds);

            // 3. Manual Join
            const combined = rentals.map(r => {
                const locker = lockers?.find(l => l.id_armario === r.id_armario);
                return {
                    ...r,
                    nr_armario: locker?.nr_armario || locker?.cd_armario,
                    dc_andar: locker?.nm_local,
                    nm_posicao: locker?.nm_posicao,
                    dc_tamanho: locker?.nm_tamanho,
                    // Map numeric status for consistency
                    id_status_locacao: r.id_status
                };
            });

            return { data: combined, error: null };
        },
        getActiveByLocker: async (lockerId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_locacao')
                .select('*, t_usuario(*)')
                .eq('id_armario', lockerId)
                .maybeSingle();
        },
        getHistoryByLockers: async (lockerIds) => {
            if (isMockMode) return { data: [], error: null };
            return await supabase
                .from('t_locacao')
                .select('*')
                .in('id_armario', lockerIds)
                .order('dt_termino', { ascending: false });
        },
        getAll: async () => {
            if (isMockMode) {
                return {
                    data: [
                        {
                            id_locacao: '1',
                            dc_status_locacao: 'ATIVA',
                            dc_status_pagamento: 'PAGO',
                            dc_tipo_contrato: 'Anual',
                            dt_inicio: '2024-01-15',
                            dt_vencimento: '2025-01-15',
                            nr_armario: 101,
                            dc_tamanho: 'GRANDE',
                            dc_andar: 'Térreo',
                            nm_aluno: 'Thomas Ed',
                            nm_ra: '123456'
                        },
                        {
                            id_locacao: '2',
                            dc_status_locacao: 'VENCIDA',
                            dc_status_pagamento: 'PENDENTE',
                            dc_tipo_contrato: 'Semestral',
                            dt_inicio: '2023-07-20',
                            dt_vencimento: '2024-01-20',
                            nr_armario: 102,
                            dc_tamanho: 'PEQUENO',
                            dc_andar: 'Térreo',
                            nm_aluno: 'Maria Silva',
                            nm_ra: '654321'
                        }
                    ], error: null
                };
            }

            // 1. Fetch all rentals
            const { data: rentals, error: rentalError } = await supabase
                .from('t_locacao')
                .select('*')
                .order('dt_termino', { ascending: true });

            if (rentalError) return { data: null, error: rentalError };

            // 2. Fetch all lockers (or just those in rentals)
            const { data: lockers } = await supabase
                .from('v_armario')
                .select('*');

            // 3. Fetch all users (the students)
            const { data: users } = await supabase
                .from('t_usuario')
                .select('id_usuario, nm_usuario');

            // 4. Combine/Join
            const combined = (rentals || []).map(r => {
                const locker = lockers?.find(l => l.id_armario === r.id_armario);
                const user = users?.find(u => u.id_usuario === r.id_usuario);

                return {
                    ...r,
                    id_locacao: r.id_locacao,
                    dc_andar: locker?.nm_local,
                    nr_armario: locker?.nr_armario || locker?.cd_armario,
                    nm_aluno: user?.nm_usuario,
                    dt_vencimento: r.dt_termino,
                    dc_status_locacao: (r.dc_status_locacao || (r.id_status === 1 ? 'ATIVA' : 'ENCERRADA')).toUpperCase(),
                    dc_tipo_contrato: (function() {
                        if (r.dt_inicio && r.dt_termino) {
                            const [sy, sm, sd] = r.dt_inicio.split('-').map(Number);
                            const [ty, tm, td] = r.dt_termino.split('-').map(Number);
                            const start = new Date(sy, sm - 1, sd);
                            const end = new Date(ty, tm - 1, td);
                            const diffDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                            if (diffDays > 300) return 'ANUAL';
                            if (diffDays > 120) return 'SEMESTRAL';
                        }
                        return r.dc_tipo_contrato || (r.id_tipo === 1 ? 'SEMESTRAL' : r.id_tipo === 2 ? 'ANUAL' : 'GRATUIDADE');
                    })().toUpperCase(),
                    dc_tamanho: (locker?.nm_tamanho || locker?.dc_tamanho || 'PEQUENO').toUpperCase(),
                    dc_status_pagamento: 'PAGO' // Mapping for AdminContracts logic
                };
            });

            return { data: combined, error: null };
        },
        terminate: async (rentalId, lockerId) => {
            if (isMockMode) {
                console.log(`Mock: Terminating rental ${rentalId} and freeing locker ${lockerId}`);
                return { data: null, error: null };
            }
            
            // 1. Terminate rental (Status 2 = ENCERRADA)
            const { error: rentalError } = await supabase
                .from('t_locacao')
                .update({ id_status: 2 })
                .eq('id_locacao', rentalId);
            
            if (rentalError) return { error: rentalError };

            // 2. Set locker to inspection status (Usually ID 4 or the one for "Aguardando Vistoria")
            // We'll use the name-based update if possible or assume a standard ID
            // Since we don't have all IDs, we update the status field if it exists or use the known updateStatus
            await dbService.lockers.updateStatus(lockerId, 2); // 2 = Vistoria

            return { data: null, error: null };
        },
        updateLocker: async (rentalId, oldLockerId, newLockerId) => {
            if (isMockMode) {
                console.log(`Mock: Swapping locker ${oldLockerId} to ${newLockerId} for rental ${rentalId}`);
                return { data: null, error: null };
            }

            // 0. Fetch existing rental to keep history
            const { data: oldRental, error: fetchError } = await supabase
                .from('t_locacao')
                .select('*')
                .eq('id_locacao', rentalId)
                .maybeSingle();

            if (!fetchError && oldRental) {
                // Remove primary key to insert as new history record
                const { id_locacao: _, ...historyRecord } = oldRental;
                // Set to 'ENCERRADA' (2) for history and update dt_termino to today
                historyRecord.id_status = 2;
                historyRecord.dt_termino = new Date().toISOString().split('T')[0];
                await supabase.from('t_locacao').insert([historyRecord]);
            }

            // 1. Update rental with new locker
            const { error: rentalError } = await supabase
                .from('t_locacao')
                .update({ id_armario: newLockerId })
                .eq('id_locacao', rentalId);

            if (rentalError) return { error: rentalError };

            // 2. Free old locker (Status 2 = Vistoria)
            await dbService.lockers.updateStatus(oldLockerId, 2);

            // 3. Occupy new locker (Status 1 = OK/Em Uso)
            await dbService.lockers.updateStatus(newLockerId, 1);

            return { data: null, error: null };
        },
        updatePassword: async (rentalId, newPassword) => {
            if (isMockMode) {
                console.log(`Mock: Updating password for rental ${rentalId} to ${newPassword}`);
                return { data: null, error: null };
            }
            return await supabase
                .from('t_locacao')
                .update({ cd_senha: newPassword })
                .eq('id_locacao', rentalId);
        }
    },

    // NOTIFICATIONS
    notifications: {
        getByUser: async (userId, userUid) => {
            if (isMockMode) {
                return {
                    data: [
                        { id_notificacao: 1, id_usuario: userId || userUid, dc_titulo: 'Bem-vindo!', dc_mensagem: 'Bem-vindo ao CAMUBOX!', is_lida: false, dt_criacao: new Date().toISOString() }
                    ],
                    error: null
                };
            }

            // Build query
            let query = supabase.from('t_notificacao').select('*');
            
            // If the column id_usuario is integer in DB, only query if userId is numeric to avoid 400 error
            const isNumericId = (id) => !isNaN(parseInt(id)) && /^\d+$/.test(id.toString());

            if (userId && isNumericId(userId)) {
                query = query.eq('id_usuario', parseInt(userId));
            } else if (userUid) {
                // If id_usuario_auth column exists, use it, otherwise don't filter or use correctly
                // For now, if we only have UUID and id_usuario is int, we can't find it by UUID unless we use id_usuario_auth
                query = query.eq('id_usuario', userUid);
            } else {
                return { data: [], error: null };
            }

            return await query.order('dt_criacao', { ascending: false });
        },
        markAsRead: async (notificationId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_notificacao')
                .update({ is_lida: true })
                .eq('id_notificacao', notificationId);
        },
        delete: async (notificationId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_notificacao')
                .delete()
                .eq('id_notificacao', notificationId);
        }
    },
    
    // WAITING LIST
    waitingList: {
        join: async (lockerId, userId) => {
            if (isMockMode) {
                console.log(`Mock: Joining waiting list for locker ${lockerId}`);
                return { data: { id_fila: 'mock-id' }, error: null };
            }
            return await supabase
                .from('t_fila_espera')
                .insert([{ id_armario: lockerId, id_usuario: userId, id_status: 1 }])
                .select();
        },
        leave: async (lockerId, userId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_fila_espera')
                .delete()
                .eq('id_armario', lockerId)
                .eq('id_usuario', userId)
                .eq('id_status', 1); // Only leave if still waiting
        },
        getStatus: async (lockerId, userId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_fila_espera')
                .select('*')
                .eq('id_armario', lockerId)
                .eq('id_usuario', userId)
                .order('dt_entrada', { ascending: false })
                .limit(1)
                .maybeSingle();
        },
        complete: async (lockerId, userId) => {
            if (isMockMode) return { data: null, error: null };
            return await supabase
                .from('t_fila_espera')
                .update({ id_status: 3 }) // 3: CONCLUIDO
                .eq('id_armario', lockerId)
                .eq('id_usuario', userId)
                .eq('id_status', 2); // Only if it was reserved
        },
        getAllActiveReservations: async () => {
            return await supabase
                .from('t_fila_espera')
                .select('*, t_usuario(nm_usuario)')
                .eq('id_status', 2); // 2 = RESERVADO
        }
    }
};

/**
 * Service to handle authentication using Supabase Auth.
 */
export const authService = {
    loginWithGoogleToken: async (token) => {
        if (isMockMode) {
            console.log('Mock: Login with Google Token');
            return { data: { user: { id: 'mock', email: 'mock@example.com' } }, error: null };
        }

        try {
            // Em desenvolvimento, o Vite não serve a pasta /api.
            // Redirecionamos para o domínio de produção para o teste funcionar.
            const baseUrl = import.meta.env.DEV ? 'https://camubox.com' : '';
            
            const response = await fetch(`${baseUrl}/api/auth/google`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_token: token })
            });

            const result = await response.json();

            if (!response.ok) {
                console.error('[AUTH API DETAILS]', result.details || 'No details provided');
                return { data: null, error: result.error || 'Erro na autenticação customizada' };
            }

            // Simulamos o formato do Supabase para manter compatibilidade
            return { data: { user: result.user }, error: null };
        } catch (err) {
            return { data: null, error: err.message };
        }
    },
    loginWithGoogle: async () => {
        if (isMockMode) {
            console.log('Mock: Login with Google');
            return { data: null, error: 'Sign in not available in mock mode' };
        }
        
        // Use the current origin for dynamic redirects (Vercel, custom domain, localhost, etc.)
        const redirectTo = window.location.origin;

        return await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
                redirectTo: redirectTo
            }
        });
    },
    loginWithApple: async () => {
        if (isMockMode) {
            console.log('Mock: Login with Apple');
            return { data: null, error: 'Sign in not available in mock mode' };
        }

        // Use the current origin for dynamic redirects (Vercel, custom domain, localhost, etc.)
        const redirectTo = window.location.origin;

        return await supabase.auth.signInWithOAuth({
            provider: 'apple',
            options: {
                redirectTo: redirectTo
            }
        });
    },
    signOut: async () => {
        if (isMockMode) {
            console.log('Mock: Sign out');
            return { error: null };
        }
        return await supabase.auth.signOut();
    },
    getCurrentUser: async () => {
        if (isMockMode) return { data: { user: null }, error: null };
        return await supabase.auth.getUser();
    },
    getSession: async () => {
        if (isMockMode) return { data: { session: null }, error: null };
        return await supabase.auth.getSession();
    }
};
