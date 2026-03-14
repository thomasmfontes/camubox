
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
            const value = parts.slice(1).join('=').trim().replace(/"/g, '');
            if (key === 'SUPABASE_URL') supabaseUrl = value;
            if (key === 'SUPABASE_SERVICE_ROLE_KEY') supabaseKey = value;
        }
    });
} catch (e) {}

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
    console.log('--- Checking tokens for thomas@fontes.ca ---');
    const { data: tokens } = await supabase
        .from('t_fcm_tokens')
        .select('*')
        .eq('dc_email', 'thomas@fontes.ca');

    if (tokens) {
        console.log(`Found ${tokens.length} token(s):`);
        tokens.forEach((t, i) => console.log(`Token ${i+1}: ...${t.token.slice(-10)}`));
    } else {
        console.log('No tokens found.');
    }
}
check();
