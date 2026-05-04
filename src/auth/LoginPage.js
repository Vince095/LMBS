/**
 * LoginPage - email + password form styled with the Stitch Immutable
 * Governance design system.
 */

import React, { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';

export default function LoginPage() {
    const { login } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    const from = (location.state && location.state.from && location.state.from.pathname) || '/';

    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError]       = useState(null);

    const onSubmit = async (e) => {
        e.preventDefault();
        setError(null); setSubmitting(true);
        try {
            await login({ email: email.trim(), password });
            navigate(from, { replace: true });
        } catch (err) {
            setError(err.message || 'Login failed');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4">
            <div className="w-full max-w-md bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
                <header className="text-center mb-stack-md">
                    <div className="inline-flex w-12 h-12 rounded-lg bg-primary-container text-white items-center justify-center mb-3">
                        <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }} aria-hidden="true">account_balance</span>
                    </div>
                    <h1 className="font-public-sans text-h2 font-semibold text-on-surface tracking-tight">LMBS Sign In</h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-1">Land Management Blockchain System</p>
                </header>

                <form onSubmit={onSubmit} className="flex flex-col gap-stack-md">
                    <label className="flex flex-col gap-1">
                        <span className="font-public-sans text-body-sm font-medium text-on-surface">Email</span>
                        <input
                            type="email" autoComplete="email" required
                            value={email} onChange={(e) => setEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim"
                        />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="font-public-sans text-body-sm font-medium text-on-surface">Password</span>
                        <input
                            type="password" autoComplete="current-password" required minLength={8}
                            value={password} onChange={(e) => setPassword(e.target.value)}
                            placeholder="********"
                            className="px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim"
                        />
                    </label>

                    {error && <div role="alert" className="font-public-sans text-body-sm text-error">{error}</div>}

                    <button
                        type="submit" disabled={submitting}
                        className="px-4 py-2.5 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity disabled:opacity-60"
                    >
                        {submitting ? 'Signing in...' : 'Sign in'}
                    </button>
                </form>

                <p className="text-center font-public-sans text-body-sm text-on-surface-variant mt-stack-md">
                    Don't have an account? <Link to="/register" className="text-on-tertiary-container hover:underline">Register</Link>
                </p>

                <details className="mt-stack-md text-body-sm text-on-surface-variant">
                    <summary className="cursor-pointer font-medium">Demo accounts</summary>
                    <ul className="mt-2 space-y-1 font-public-sans">
                        <li><strong>admin@lmbs.gov.ls</strong> / lmbs1234 (Admin)</li>
                        <li><strong>letele@lmbs.gov.ls</strong> / lmbs1234 (Registry Officer)</li>
                        <li><strong>thabo@example.com</strong> / lmbs1234 (Citizen)</li>
                    </ul>
                </details>
            </div>
        </div>
    );
}
