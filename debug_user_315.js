
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const envContent = readFileSync('.env.local', 'utf8');
const env = Object.fromEntries(envContent.split('\n').filter(l => l.includes('=')).map(l => l.split('=').map(s => s.trim().replace(/\"/g, ''))));
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

async function check() {
    const today = '2026-03-14';
    const in1Day = '2026-03-15';
    const in7Days = '2026-03-21';
    
    console.log('--- Checking User 315 rentals ---');
    const { data: rentals } = await supabase.from('t_locacao').select('*').eq('id_usuario', 315).eq('id_status', 1);
    console.log('Active Rentals for User 315:', rentals);

    console.log('\n--- Checking all matching rentals for the cron dates ---');
    const { data: allMatching } = await supabase.from('t_locacao').select('*').in('dt_termino', [today, in1Day, in7Days]).eq('id_status', 1);
    console.log('All Matching Rentals:', allMatching);
    
    if (allMatching) {
        for (const r of allMatching) {
            const { data: user } = await supabase.from('t_usuario').select('dc_email').eq('id_usuario', r.id_usuario).single();
            console.log(`Rental ID ${r.id_locacao} (Locker ${r.id_armario}) is for User ${r.id_usuario} (${user?.dc_email})`);
        }
    }
}
check();
