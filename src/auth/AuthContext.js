/**
 * AuthContext - holds the currently authenticated LMBS user + JWT.
 *
 *   const { user, token, login, register, logout, loading } = useAuth();
 *
 * On mount the provider reads the persisted token from localStorage and calls
 * /api/auth/me to revalidate it. If the server returns 401 the token is dropped
 * (httpClient also does this automatically via the 'lmbs:auth:expired' event).
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { authService } from '../services/authService';
import { TOKEN_STORAGE_KEY } from '../services/httpClient';

const AuthContext = createContext(null);

function readToken() {
    try { return window.localStorage.getItem(TOKEN_STORAGE_KEY); }
    catch (_) { return null; }
}
function writeToken(token) {
    try {
        if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
        else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch (_) { /* private mode - ignore */ }
}

export function AuthProvider({ children }) {
    const [user, setUser]       = useState(null);
    const [token, setToken]     = useState(() => readToken());
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState(null);

    // Hydrate user from the stored token on first mount.
    useEffect(() => {
        let cancelled = false;
        if (!token) { setLoading(false); return; }
        authService.me(token)
            .then((u) => { if (!cancelled) setUser(u); })
            .catch(() => { if (!cancelled) { writeToken(null); setToken(null); setUser(null); } })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Listen for httpClient's auth-expired event - drop the user if the API
    // ever rejects our token mid-session.
    useEffect(() => {
        const handler = () => { writeToken(null); setToken(null); setUser(null); };
        window.addEventListener('lmbs:auth:expired', handler);
        return () => window.removeEventListener('lmbs:auth:expired', handler);
    }, []);

    const login = useCallback(async (creds) => {
        setError(null);
        try {
            const { user: u, token: t } = await authService.login(creds);
            writeToken(t); setToken(t); setUser(u);
            return u;
        } catch (err) {
            setError(err.message || 'Login failed');
            throw err;
        }
    }, []);

    const register = useCallback(async (payload) => {
        setError(null);
        try {
            const { user: u, token: t } = await authService.register(payload);
            writeToken(t); setToken(t); setUser(u);
            return u;
        } catch (err) {
            setError(err.message || 'Registration failed');
            throw err;
        }
    }, []);

    const logout = useCallback(async () => {
        try { await authService.logout(); } catch (_) { /* best effort */ }
        writeToken(null);
        setToken(null);
        setUser(null);
    }, []);

    const value = {
        user, token, loading, error,
        isAuthenticated: !!user,
        hasRole: (role) => !!user && (user.role === role || user.role === 'ADMIN'),
        login, register, logout,
    };

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
    return ctx;
}
