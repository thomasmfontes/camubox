export const biometricService = {
    isSupported: () => {
        return window.PublicKeyCredential !== undefined;
    },

    hasRegistered: (email) => {
        if (!email) {
            const lastEmail = localStorage.getItem('camubox_last_biometric_email');
            return !!lastEmail && !!localStorage.getItem(`camubox_biometric_${lastEmail}`);
        }
        return !!localStorage.getItem(`camubox_biometric_${email}`);
    },

    getLastRegisteredEmail: () => {
        return localStorage.getItem('camubox_last_biometric_email');
    },

    register: async (userEmail, userName) => {
        if (!window.PublicKeyCredential) {
            throw new Error("Biometria não suportada neste navegador.");
        }

        // Challenge needs to be a cryptographically strong random ArrayBuffer
        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        // User ID must be a unique ArrayBuffer
        const userId = new TextEncoder().encode(userEmail);

        const publicKeyCredentialCreationOptions = {
            challenge: challenge,
            rp: {
                name: "CAMUBOX",
                id: window.location.hostname
            },
            user: {
                id: userId,
                name: userEmail,
                displayName: userName || userEmail
            },
            pubKeyCredParams: [
                { type: "public-key", alg: -7 },   // ES256
                { type: "public-key", alg: -257 }  // RS256
            ],
            authenticatorSelection: {
                authenticatorAttachment: "platform", // Forces platform biometrics (Windows Hello, TouchID, FaceID)
                userVerification: "required",
                residentKey: "required"
            },
            timeout: 60000
        };

        const credential = await navigator.credentials.create({
            publicKey: publicKeyCredentialCreationOptions
        });

        // Convert rawId to Base64 to store in localStorage
        const rawIdArray = new Uint8Array(credential.rawId);
        let binary = '';
        const len = rawIdArray.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(rawIdArray[i]);
        }
        const base64Id = btoa(binary);

        const credInfo = {
            id: base64Id,
            email: userEmail,
            name: userName
        };

        localStorage.setItem(`camubox_biometric_${userEmail}`, JSON.stringify(credInfo));
        localStorage.setItem('camubox_last_biometric_email', userEmail);

        return credInfo;
    },

    authenticate: async () => {
        if (!window.PublicKeyCredential) {
            throw new Error("Biometria não suportada neste navegador.");
        }

        const lastEmail = localStorage.getItem('camubox_last_biometric_email');
        if (!lastEmail) {
            throw new Error("Nenhuma biometria cadastrada neste dispositivo.");
        }

        const credDataStr = localStorage.getItem(`camubox_biometric_${lastEmail}`);
        if (!credDataStr) {
            throw new Error("Nenhuma biometria cadastrada para este usuário.");
        }

        const credData = JSON.parse(credDataStr);
        
        // Convert Base64 back to Uint8Array
        const binaryString = atob(credData.id);
        const len = binaryString.length;
        const credentialId = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            credentialId[i] = binaryString.charCodeAt(i);
        }

        const challenge = new Uint8Array(32);
        window.crypto.getRandomValues(challenge);

        const publicKeyCredentialRequestOptions = {
            challenge: challenge,
            allowCredentials: [{
                id: credentialId,
                type: 'public-key'
            }],
            rpId: window.location.hostname,
            userVerification: 'required',
            timeout: 60000
        };

        await navigator.credentials.get({
            publicKey: publicKeyCredentialRequestOptions
        });

        // If credentials.get does not throw, the biometrics validation succeeded!
        return credData;
    }
};
