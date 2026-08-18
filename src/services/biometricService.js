import { supabase } from './supabaseClient';

const isProductionPasskeyOrigin = () => {
    if (typeof window === 'undefined') return false;

    const hostname = window.location.hostname.toLowerCase();
    return hostname === 'camubox.com' || hostname.endsWith('.camubox.com');
};

const assertPasskeyAvailable = () => {
    if (!supabase) {
        throw new Error('Autenticação indisponível neste ambiente.');
    }
    if (!biometricService.isSupported()) {
        throw new Error('Biometria ou Passkey não é suportada neste dispositivo.');
    }
    if (!biometricService.isLoginEnabled()) {
        throw new Error('Passkeys estão disponíveis somente no domínio seguro do CAMUBOX.');
    }
};

export const biometricService = {
    isLoginEnabled: () => Boolean(supabase) && isProductionPasskeyOrigin(),

    isSupported: () => (
        typeof window !== 'undefined'
        && window.isSecureContext
        && typeof window.PublicKeyCredential !== 'undefined'
    ),

    clearLegacyRegistrations: () => {
        const keysToRemove = [];

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            const isLegacyCredential = key?.startsWith('camubox_biometric_')
                && !key.startsWith('camubox_biometric_prompt_dismissed_');

            if (isLegacyCredential) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach((key) => localStorage.removeItem(key));
        localStorage.removeItem('camubox_last_biometric_email');

        return keysToRemove.length;
    },

    list: async () => {
        assertPasskeyAvailable();
        const { data, error } = await supabase.auth.passkey.list();
        if (error) throw error;
        return data || [];
    },

    hasRegistered: async () => {
        const passkeys = await biometricService.list();
        return passkeys.length > 0;
    },

    register: async () => {
        assertPasskeyAvailable();
        const { data, error } = await supabase.auth.registerPasskey();
        if (error) throw error;
        return data;
    },

    authenticate: async () => {
        assertPasskeyAvailable();
        const { data, error } = await supabase.auth.signInWithPasskey();
        if (error) throw error;
        if (!data?.session || !data?.user) {
            throw new Error('A Passkey foi validada, mas a sessão não foi criada.');
        }
        return data;
    },

    rename: async (passkeyId, friendlyName) => {
        assertPasskeyAvailable();
        const { data, error } = await supabase.auth.passkey.update({
            passkeyId,
            friendlyName
        });
        if (error) throw error;
        return data;
    },

    remove: async (passkeyId) => {
        assertPasskeyAvailable();
        const { error } = await supabase.auth.passkey.delete({ passkeyId });
        if (error) throw error;
    }
};
