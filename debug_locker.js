
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '.env.local');

let supabaseUrl = '';
let supabaseKey = '';

try {
    const envContent = readFileSync(envPath, 'utf8');
    const lines = envContent.split('\n');
    lines.forEach(line => {
        const parts = line.split('=');
        if (parts.length >= 2) {
            const key = parts[0].trim();
            const value = parts.slice(1).join('=').trim().replace(/\"/g, '');
            if (key === 'SUPABASE_URL') supabaseUrl = value;
            if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = value;
        }
    });
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLocker823() {
    console.log('--- Checking locker 823 in t_locacao ---');
    // First find the id_armario for nr_armario 823 or check active ones
    const { data: rentals } = await supabase
        .from('t_locacao')
        .select('*')
        .eq('id_status', 1); // Only active ones

    // Filter by locker ID or check what's there
    // Since I don't know the exact id_armario mapping for 823 easily without v_armario, I'll search all
    const matching = rentals?.filter(r => r.id_armario === 823 || r.nr_armario === 823);
    
    if (matching && matching.length > 0) {
        console.log(`Found ${matching.length} active rental(s) for locker 823:`);
        matching.forEach(r => {
            console.log(`- ID: ${r.id_locacao}, User: ${r.id_usuario}, Expires: ${r.dt_termino}`);
        });
    } else {
        console.log('No specific record found for 823 in the active list. Checking all active rentals...');
        rentals?.slice(0, 5).forEach(r => {
             console.log(`- ID: ${r.id_locacao}, Locker ID: ${r.id_armario}, User: ${r.id_usuario}, Expires: ${r.dt_termino}`);
        });
    }
}
checkLocker823();
