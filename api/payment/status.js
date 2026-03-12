import { createClient } from '@supabase/supabase-js';

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { id } = req.query;

        if (!id) {
            return res.status(400).json({ error: 'Payment ID is required' });
        }

        const supabaseUrl = process.env.SUPABASE_URL;
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const { data: transaction, error } = await supabase
            .from('pagamentos')
            .select('status, paid_at, woovi_status')
            .eq('id', id)
            .single();

        if (error || !transaction) {
            return res.status(404).json({ error: 'Transaction not found' });
        }

        return res.status(200).json({
            status: transaction.status,
            wooviStatus: transaction.woovi_status,
            paidAt: transaction.paid_at
        });

    } catch (error) {
        console.error('API Status Error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
}
