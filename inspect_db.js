
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function inspectSchema() {
    console.log('--- Database Inspection ---');

    // Attempt to list tables we know about and check their columns
    const tables = ['t_armario', 't_local', 't_tamanho', 't_status', 't_posicao', 't_aluno', 't_locacao'];

    for (const table of tables) {
        console.log(`\nChecking Table: ${table}`);
        const { data, error } = await supabase.from(table).select('*').limit(1);

        if (error) {
            console.log(`Error reading ${table}: ${error.message}`);
        } else if (data && data.length > 0) {
            console.log(`Columns found: ${Object.keys(data[0]).join(', ')}`);
        } else {
            console.log(`Table exists but is empty, or couldn't fetch sample row.`);
            // Try to fetch just one column to verify existence
            const { error: existError } = await supabase.from(table).select('id').limit(1);
            if (existError) console.log(`Could not verify columns for ${table}.`);
            else console.log(`Verified existence via 'id' column.`);
        }
    }
}

inspectSchema();
