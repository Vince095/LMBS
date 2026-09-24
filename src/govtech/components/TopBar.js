/**
 * Top app bar - Stitch shared component, with auth-aware user menu,
 * notifications bell, and language switcher (SRS NFR-009).
 */

import React, { useState, useRef, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth';
import { notificationService } from '../../services';
import { useTranslation } from '../../i18n';

function NotificationsBell() {
    const { user } = useAuth();
    const { t }    = useTranslation();
    const [open, setOpen]   = useState(false);
    const [items, setItems] = useState([]);
    const ref = useRef(null);

    const refresh = () => {
        if (!user || !user.address) return;
        notificationService.listForAddress(user.address, { limit: 10 })
            .then((rows) => setItems(Array.isArray(rows) ? rows : []))
            .catch(() => { /* silent */ });
    };

    // eslint-disable-next-line react-hooks/exhaustive-deps
    useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [user && user.address]);

    useEffect(() => {
        function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    const unread = items.filter((n) => n.status !== 'READ').length;

    const onMarkRead = async (id) => {
        try { await notificationService.markRead(id); refresh(); } catch (_) { /* silent */ }
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => { setOpen((v) => !v); if (!open) refresh(); }}
                aria-label={t('govtech.topbar.notifications')}
                aria-haspopup="menu"
                aria-expanded={open}
                className="relative text-on-surface-variant hover:text-on-surface transition-colors"
            >
                <span className="material-symbols-outlined" aria-hidden="true">notifications</span>
                {unread > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-white text-[10px] font-bold flex items-center justify-center">{unread}</span>
                )}
            </button>

            {open && (
                <div role="menu" className="absolute right-0 mt-2 w-80 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-[var(--imm-shadow-raised)] overflow-hidden z-20">
                    <div className="px-4 py-2 border-b border-outline-variant flex justify-between items-center">
                        <span className="font-public-sans text-body-sm font-semibold text-on-surface">{t('govtech.topbar.notifications')}</span>
                        <span className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{t('govtech.topbar.newNotifications', { n: unread })}</span>
                    </div>
                    <div className="max-h-[60vh] overflow-y-auto">
                        {items.length === 0 && (
                            <div className="px-4 py-6 text-center font-public-sans text-body-sm text-on-surface-variant">{t('govtech.topbar.noNotifications')}</div>
                        )}
                        {items.map((n) => (
                            <button
                                key={n._id}
                                onClick={() => onMarkRead(n._id)}
                                className={'w-full text-left px-4 py-3 border-b border-outline-variant last:border-b-0 hover:bg-surface-container-low transition-colors ' + (n.status !== 'READ' ? 'bg-surface-container-low' : '')}
                            >
                                {n.subject && <div className="font-public-sans text-body-sm font-semibold text-on-surface truncate">{n.subject}</div>}
                                <div className="font-public-sans text-body-sm text-on-surface-variant">{n.body}</div>
                                <div className="font-public-sans text-label-caps font-bold uppercase tracking-wider text-on-surface-variant mt-1">
                                    {n.channel} - {new Date(n.createdAt || n.sentAt || Date.now()).toLocaleString()}
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

function UserMenu() {
    const { user, logout } = useAuth();
    const { t }            = useTranslation();
    const [open, setOpen]  = useState(false);
    const ref              = useRef(null);
    const navigate         = useNavigate();

    useEffect(() => {
        function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
        document.addEventListener('mousedown', handle);
        return () => document.removeEventListener('mousedown', handle);
    }, []);

    if (!user) return null;
    const initials = (user.name || user.email || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');

    return (
        <div className="relative" ref={ref}>
            <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex items-center gap-2 px-2 py-1 rounded-DEFAULT hover:bg-surface-container-low transition-colors">
                <span className="w-8 h-8 rounded-full bg-primary-container text-white inline-flex items-center justify-center font-public-sans text-body-sm font-semibold">{initials}</span>
                <div className="hidden md:flex flex-col items-start leading-tight">
                    <span className="font-public-sans text-body-sm font-semibold text-on-surface">{user.name}</span>
                    <span className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">{user.role}</span>
                </div>
            </button>

            {open && (
                <div role="menu" className="absolute right-0 mt-2 w-56 bg-surface-container-lowest border border-outline-variant rounded-xl shadow-[var(--imm-shadow-raised)] py-1 z-20">
                    <div className="px-3 py-2 border-b border-outline-variant">
                        <div className="font-public-sans text-body-sm font-semibold text-on-surface truncate">{user.name}</div>
                        <div className="font-public-sans text-body-sm text-on-surface-variant truncate">{user.email}</div>
                    </div>
                    {(user.role === 'ADMIN' || user.role === 'REGISTRY_OFFICER') && (
                        <button onClick={() => { setOpen(false); navigate('/legacy/admin'); }} className="w-full text-left px-3 py-2 font-public-sans text-body-sm hover:bg-surface-container-low">
                            {t('govtech.topbar.operatorConsole')}
                        </button>
                    )}
                    <button onClick={async () => { setOpen(false); await logout(); navigate('/login'); }} className="w-full text-left px-3 py-2 font-public-sans text-body-sm text-error hover:bg-surface-container-low">
                        {t('govtech.topbar.signOut')}
                    </button>
                </div>
            )}
        </div>
    );
}

/** Styled language toggle that sits in the top bar action strip. */
function TopBarLangSwitcher() {
    const { lang, setLang } = useTranslation();
    return (
        <div className="flex items-center gap-0.5 border border-outline-variant rounded-DEFAULT overflow-hidden" role="group" aria-label="Language">
            {[{ code: 'ses', label: 'ST' }, { code: 'en', label: 'EN' }].map(({ code, label }) => (
                <button
                    key={code}
                    type="button"
                    onClick={() => setLang(code)}
                    aria-pressed={lang === code}
                    className={
                        'px-2.5 py-1 font-public-sans text-label-caps font-bold uppercase tracking-wider transition-colors ' +
                        (lang === code
                            ? 'bg-on-surface text-surface'
                            : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface')
                    }
                >
                    {label}
                </button>
            ))}
        </div>
    );
}

export default function TopBar() {
    const { t }    = useTranslation();
    const navigate = useNavigate();

    const TABS = [
        { to: '/',             label: t('govtech.nav.dashboard') },
        { to: '/search',       label: t('govtech.nav.map')       },
        { to: '/properties',   label: t('govtech.nav.registry')  },
        { to: '/transactions', label: t('govtech.nav.reports')   },
    ];

    return (
        <header role="banner" className="flex justify-between items-center px-6 h-16 bg-surface-container-lowest border-b border-outline-variant sticky top-0 z-10">
            <div className="flex items-center gap-8 h-full">
                <span className="font-public-sans text-xl font-bold text-on-surface tracking-tight lg:hidden">LMBS</span>
                <nav className="hidden md:flex items-center gap-6 h-full pt-1" aria-label="Section tabs">
                    {TABS.map((tab) => (
                        <NavLink
                            key={tab.to}
                            to={tab.to}
                            end={tab.to === '/'}
                            className={({ isActive }) => 'h-full flex items-center font-public-sans transition-colors ' + (isActive ? 'text-on-surface border-b-2 border-on-surface pb-1 font-semibold' : 'text-on-surface-variant font-medium hover:text-on-surface')}
                        >
                            {tab.label}
                        </NavLink>
                    ))}
                </nav>
            </div>

            <div className="flex items-center gap-3">
                <form
                    onSubmit={(e) => {
                        e.preventDefault();
                        const q = e.currentTarget.elements.q.value.trim();
                        if (q) navigate('/search?q=' + encodeURIComponent(q));
                    }}
                    className="hidden sm:flex items-center px-3 py-1.5 bg-surface-container-low border border-outline-variant rounded-DEFAULT focus-within:border-tertiary-fixed transition-colors"
                >
                    <input name="q" type="text" placeholder={t('govtech.topbar.searchPlaceholder')} aria-label={t('govtech.topbar.searchPlaceholder')} className="bg-transparent border-none focus:ring-0 p-0 font-public-sans text-body-sm text-on-surface-variant w-48 placeholder:text-outline outline-none" />
                    <span className="material-symbols-outlined text-outline ml-2 text-[20px]" aria-hidden="true">search</span>
                </form>

                <TopBarLangSwitcher />
                <NotificationsBell />
                <UserMenu />
            </div>
        </header>
    );
}
