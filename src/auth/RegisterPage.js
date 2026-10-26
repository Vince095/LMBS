/**
 * RegisterPage - citizen account creation. Server-side guards still apply
 * (admin/officer roles can only be granted via the admin console; this form
 * always creates CITIZEN-tier accounts).
 */

import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { DISTRICTS } from '../config/districts';

export default function RegisterPage() {
    const { register } = useAuth();
    const navigate = useNavigate();

    const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', district: '', preferredLanguage: 'ses' });
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState(null);

    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

    const onSubmit = async (e) => {
        e.preventDefault();
        setError(null);
        if (form.password !== form.confirm) {
            setError('Passwords do not match');
            return;
        }
        if (form.password.length < 10) {
            setError('Password must be at least 10 characters');
            return;
        }
        setSubmitting(true);
        try {
            await register({
                name: form.name.trim(),
                email: form.email.trim(),
                password: form.password,
                district: form.district || undefined,
                preferredLanguage: form.preferredLanguage,
            });
            navigate('/', { replace: true });
        } catch (err) {
            setError(err.message || 'Registration failed');
        } finally {
            setSubmitting(false);
        }
    };

    const inputCls = 'w-full px-3 py-2 border border-outline-variant rounded-DEFAULT bg-surface-container-lowest font-public-sans text-body-sm placeholder:text-outline focus:outline-none focus:border-tertiary-fixed-dim';

    return (
        <div className="min-h-screen flex items-center justify-center bg-surface px-4 py-8">
            <div className="w-full max-w-lg bg-surface-container-lowest border border-outline-variant rounded-xl p-stack-lg">
                <header className="text-center mb-stack-md">
                    <h1 className="font-public-sans text-h2 font-semibold text-on-surface tracking-tight">Create LMBS Account</h1>
                    <p className="font-public-sans text-body-md text-on-surface-variant mt-1">Citizens of the Kingdom of Lesotho</p>
                </header>

                <form onSubmit={onSubmit} className="flex flex-col gap-stack-md">
                    <label className="flex flex-col gap-1">
                        <span className="font-public-sans text-body-sm font-medium text-on-surface">Full name</span>
                        <input className={inputCls} required value={form.name} onChange={set('name')} placeholder="Thabo Molefe" autoComplete="name" />
                    </label>

                    <label className="flex flex-col gap-1">
                        <span className="font-public-sans text-body-sm font-medium text-on-surface">Email</span>
                        <input className={inputCls} type="email" required value={form.email} onChange={set('email')} placeholder="you@example.com" autoComplete="email" />
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
                        <label className="flex flex-col gap-1">
                            <span className="font-public-sans text-body-sm font-medium text-on-surface">Password</span>
                            <input className={inputCls} type="password" required minLength={10} value={form.password} onChange={set('password')} autoComplete="new-password" />
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="font-public-sans text-body-sm font-medium text-on-surface">Confirm password</span>
                            <input className={inputCls} type="password" required minLength={10} value={form.confirm} onChange={set('confirm')} autoComplete="new-password" />
                        </label>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-stack-md">
                        <label className="flex flex-col gap-1">
                            <span className="font-public-sans text-body-sm font-medium text-on-surface">District</span>
                            <select className={inputCls} value={form.district} onChange={set('district')}>
                                <option value="">-</option>
                                {DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                            </select>
                        </label>
                        <label className="flex flex-col gap-1">
                            <span className="font-public-sans text-body-sm font-medium text-on-surface">Preferred language</span>
                            <select className={inputCls} value={form.preferredLanguage} onChange={set('preferredLanguage')}>
                                <option value="ses">Sesotho</option>
                                <option value="en">English</option>
                            </select>
                        </label>
                    </div>

                    {error && <div role="alert" className="font-public-sans text-body-sm text-error">{error}</div>}

                    <button type="submit" disabled={submitting} className="px-4 py-2.5 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-DEFAULT hover:opacity-90 transition-opacity disabled:opacity-60">
                        {submitting ? 'Creating account...' : 'Create account'}
                    </button>
                </form>

                <p className="text-center font-public-sans text-body-sm text-on-surface-variant mt-stack-md">
                    Already registered? <Link to="/login" className="text-on-tertiary-container hover:underline">Sign in</Link>
                </p>
            </div>
        </div>
    );
}
