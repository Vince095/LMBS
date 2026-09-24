/**
 * ChainContext — wallet connection, on-chain roles and wallet linking.
 *
 *   const { config, account, signer, roles, connect, linkWallet } = useChain();
 *
 * Linking = the user signs a one-time challenge from the backend with their
 * wallet (no transaction, no key leaves the wallet); the backend verifies the
 * signature and binds the address to the authenticated account.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from '../auth';
import { http } from '../services/httpClient';
import { API_BASE } from '../config/api';
import { connectWallet, loadChainConfig, rolesOf, hasBrowserWallet } from './registry';
import { decodeChainError } from './errors';

const ChainContext = createContext(null);

export function ChainProvider({ children }) {
    const { user, setSession } = useAuth();
    const [config, setConfig] = useState(null);
    const [account, setAccount] = useState(null);
    const [signer, setSigner] = useState(null);
    const [roles, setRoles] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        if (!user) return;
        loadChainConfig().then(setConfig).catch((e) => setError(e.message));
    }, [user]);

    const refreshRoles = useCallback(async (addr = account, cfg = config) => {
        if (!addr || !cfg || !cfg.configured) return;
        try { setRoles(await rolesOf(cfg, addr)); } catch (e) { setError(decodeChainError(e)); }
    }, [account, config]);

    const connect = useCallback(async () => {
        setError(null); setBusy(true);
        try {
            const cfg = config && config.configured ? config : await loadChainConfig(true);
            setConfig(cfg);
            if (!cfg.configured) throw new Error('The blockchain network is not configured on the server yet.');
            const w = await connectWallet(cfg);
            setAccount(w.address); setSigner(w.signer);
            await refreshRoles(w.address, cfg);
            return w;
        } catch (e) {
            setError(decodeChainError(e));
            throw e;
        } finally { setBusy(false); }
    }, [config, refreshRoles]);

    const linkWallet = useCallback(async () => {
        setError(null); setBusy(true);
        try {
            const w = signer && account ? { signer, address: account } : await connect();
            const { message } = await http.post(`${API_BASE}/api/auth/wallet/challenge`, {});
            const signature = await w.signer.signMessage(message);
            const out = await http.post(`${API_BASE}/api/auth/wallet/verify`, { address: w.address, signature });
            setSession(out.user, out.token);
            return out.user;
        } catch (e) {
            setError(decodeChainError(e));
            throw e;
        } finally { setBusy(false); }
    }, [signer, account, connect, setSession]);

    useEffect(() => {
        if (!hasBrowserWallet()) return undefined;
        const onAccounts = (accs) => { setAccount(accs && accs[0] ? accs[0].toLowerCase() : null); setSigner(null); setRoles(null); };
        window.ethereum.on && window.ethereum.on('accountsChanged', onAccounts);
        return () => window.ethereum.removeListener && window.ethereum.removeListener('accountsChanged', onAccounts);
    }, []);

    const linkedAddress = user && user.walletVerified ? (user.address || '').toLowerCase() : null;
    const value = {
        config, account, signer, roles, error, busy,
        linkedAddress,
        walletMatchesAccount: !!account && account === linkedAddress,
        connect, linkWallet, refreshRoles, setError,
    };
    return <ChainContext.Provider value={value}>{children}</ChainContext.Provider>;
}

export function useChain() {
    const ctx = useContext(ChainContext);
    if (!ctx) throw new Error('useChain must be used inside <ChainProvider>');
    return ctx;
}
