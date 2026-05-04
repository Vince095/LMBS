/**
 * Left sidebar — Registry Office / Verified Ledger.
 *
 * Role visibility:
 *   isAdmin    — ADMIN only
 *   isOfficer  — REGISTRY_OFFICER or ADMIN
 *   isNotary   — NOTARY, REGISTRY_OFFICER, or ADMIN
 *   canWrite   — FINANCIAL_INST, REGISTRY_OFFICER, ADMIN (encumbrances)
 *   (no flag)  — all authenticated users
 */

import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth';
import { useTranslation } from '../../i18n';

function NavRow({ to, icon, label }) {
    return (
        <NavLink
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
                'flex items-center gap-3 px-3 py-2 rounded-md transition-colors duration-150 font-public-sans text-body-sm ' +
                (isActive
                    ? 'bg-surface-container-high text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container-low')
            }
        >
            {({ isActive }) => (
                <>
                    <span
                        className="material-symbols-outlined"
                        style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                        aria-hidden="true"
                    >
                        {icon}
                    </span>
                    <span>{label}</span>
                </>
            )}
        </NavLink>
    );
}

function Divider() {
    return <hr className="border-outline-variant my-1" />;
}

export default function Sidebar() {
    const { user } = useAuth();
    const { t }    = useTranslation();

    const role      = user?.role || 'CITIZEN';
    const isAdmin   = role === 'ADMIN';
    const isOfficer = role === 'REGISTRY_OFFICER' || isAdmin;
    const isNotary  = role === 'NOTARY' || isOfficer;
    const canWriteEnc = ['FINANCIAL_INST','REGISTRY_OFFICER','ADMIN'].includes(role);

    const NAV = [
        // ── Core (all users) ────────────────────────────────────────────────
        { to:'/',               icon:'dashboard',            label: t('govtech.nav.overview')         },
        { to:'/search',         icon:'map',                  label: t('govtech.nav.mapView')          },
        { to:'/properties',     icon:'verified_user',        label: t('govtech.nav.landTitles')       },
        { to:'/transactions',   icon:'swap_horiz',           label: t('govtech.nav.transactions')     },
        { to:'/documents',      icon:'description',          label: t('govtech.nav.documents')        },

        { divider: true },

        // ── Disputes & Encumbrances ──────────────────────────────────────────
        { to:'/disputes',       icon:'gavel',                label: t('govtech.nav.disputes')         },
        { to:'/encumbrances',   icon:'lock',                 label: t('govtech.nav.encumbrances')     },

        { divider: true },

        // ── Officer workflow ─────────────────────────────────────────────────
        ...(isNotary ? [
            { to:'/approvals',          icon:'checklist',        label: t('govtech.nav.approvals')        },
            { to:'/dispute-management', icon:'manage_search',    label: t('govtech.nav.disputeMgmt')      },
        ] : []),

        // ── Admin-only ───────────────────────────────────────────────────────
        ...(isAdmin ? [
            { to:'/parcel-history', icon:'history',              label: t('govtech.nav.landLedgerAdmin') },
            { to:'/admin-panel',    icon:'admin_panel_settings', label: t('govtech.nav.admin')           },
        ] : []),

        ...(isNotary || isAdmin ? [{ divider: true }] : []),

        // ── Profile (all users) ──────────────────────────────────────────────
        { to:'/profile',        icon:'manage_accounts',      label: t('govtech.nav.profile')          },
    ];

    return (
        <aside
            aria-label={t('govtech.sidebar.primaryNav')}
            className="hidden lg:flex flex-col w-56 shrink-0 border-r border-outline-variant bg-surface-container-lowest sticky top-0 h-screen p-4 gap-stack-md"
        >
            {/* brand */}
            <div className="flex items-center gap-3 pb-2">
                <div
                    className="w-9 h-9 rounded-lg flex items-center justify-center"
                    style={{ background: 'var(--imm-primary-container)', color: 'white' }}
                    aria-hidden="true"
                >
                    <span className="material-symbols-outlined text-[20px]">account_balance</span>
                </div>
                <div className="flex flex-col leading-tight">
                    <span className="font-public-sans text-body-sm font-bold text-on-surface">
                        {t('govtech.sidebar.registryOffice')}
                    </span>
                    <span className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider">
                        {t('govtech.sidebar.verifiedLedger')}
                    </span>
                </div>
            </div>

            {/* nav items */}
            <nav className="flex flex-col gap-1 flex-1 mt-2 overflow-y-auto">
                {NAV.map((item, i) =>
                    item.divider
                        ? <Divider key={`div-${i}`} />
                        : <NavRow key={item.to} to={item.to} icon={item.icon} label={item.label} />
                )}
            </nav>

            {/* register CTA */}
            <div className="mt-auto pt-4 shrink-0">
                <NavLink
                    to="/register-parcel"
                    className="w-full inline-flex items-center justify-center gap-2 py-2 px-4 bg-primary-container text-white font-public-sans text-body-sm font-semibold rounded-lg hover:opacity-90 transition-opacity"
                >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">add</span>
                    {t('govtech.sidebar.registerNewTitle')}
                </NavLink>
            </div>
        </aside>
    );
}
