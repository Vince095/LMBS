/**
 * ProfilePage — self-service profile management.
 *
 * Any authenticated user can:
 *  - View their current profile (role, name, email, phone, district, LNID,
 *    wallet address)
 *  - Edit their own editable fields (name, email, phone, physicalAddress,
 *    district, preferredLanguage, LNID)
 *  - Role and isActive fields are read-only (admin-managed)
 *
 * Security: all changes go through PUT /api/profiles/me which server-side
 * enforces SELF_EDIT_FIELDS only. Role cannot be changed here.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { profileService } from '../../services/profileService';
import { useTranslation } from '../../i18n';
import { useAuth }        from '../../auth';

/* ── Role colour map ────────────────────────────────────────────────────────── */
const ROLE_STYLE = {
    CITIZEN:          { bg:'#f1f5f9', fg:'#475569' },
    REGISTRY_OFFICER: { bg:'#dbeafe', fg:'#1d4ed8' },
    SURVEYOR:         { bg:'#d1fae5', fg:'#065f46' },
    NOTARY:           { bg:'#fef3c7', fg:'#92400e' },
    FINANCIAL_INST:   { bg:'#ede9fe', fg:'#5b21b6' },
    AUDITOR:          { bg:'#fce7f3', fg:'#9d174d' },
    ADMIN:            { bg:'#fee2e2', fg:'#7f1d1d' },
};

function RoleBadge({ role }) {
    const s = ROLE_STYLE[role] || { bg:'#f1f5f9', fg:'#475569' };
    return (
        <span className="inline-block px-2 py-1 rounded-full text-label-caps font-semibold"
              style={{ background: s.bg, color: s.fg, fontSize:'11px', letterSpacing:'0.05em' }}>
            {role}
        </span>
    );
}

/* ── Avatar initials ────────────────────────────────────────────────────────── */
function Avatar({ name, size = 80 }) {
    const initials = (name || '?')
        .split(' ')
        .map((w) => w[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
    return (
        <div
            className="flex items-center justify-center rounded-full font-bold text-white select-none"
            style={{
                width: size, height: size, fontSize: size * 0.35,
                background: 'linear-gradient(135deg, var(--imm-primary-container), var(--imm-secondary-container, #7986cb))',
            }}
            aria-hidden="true"
        >
            {initials}
        </div>
    );
}

/* ── Inline field row ───────────────────────────────────────────────────────── */
function FieldRow({ label, value, editing, inputProps }) {
    return (
        <div className="flex flex-col gap-1">
            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                {label}
            </label>
            {editing ? (
                <input
                    {...inputProps}
                    className="border border-outline-variant rounded-md px-3 py-2 font-public-sans text-body-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                />
            ) : (
                <span className="font-public-sans text-body-sm text-on-surface">
                    {value || <span className="text-on-surface-variant italic">—</span>}
                </span>
            )}
        </div>
    );
}

/* ── Toast ──────────────────────────────────────────────────────────────────── */
function Toast({ msg, kind, onDismiss }) {
    useEffect(() => { const t = setTimeout(onDismiss, 4000); return () => clearTimeout(t); }, [onDismiss]);
    const colours = kind === 'error'
        ? 'bg-error-container text-on-error-container border-error'
        : 'bg-secondary-container text-on-secondary-container border-secondary';
    return (
        <div role="status" aria-live="polite"
             className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg border ${colours} font-public-sans text-body-sm max-w-xs`}>
            <span className="material-symbols-outlined text-[18px]">
                {kind === 'error' ? 'error' : 'check_circle'}
            </span>
            <span>{msg}</span>
            <button onClick={onDismiss} className="ml-2 opacity-70 hover:opacity-100">
                <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
        </div>
    );
}

/* ── Districts (Lesotho) ────────────────────────────────────────────────────── */
const DISTRICTS = [
    'Berea','Butha-Buthe','Leribe','Mafeteng','Maseru',
    'Mohale\'s Hoek','Mokhotlong','Qacha\'s Nek','Quthing','Thaba-Tseka',
];

const LANGUAGES = [
    { value:'ses', label:'Sesotho' },
    { value:'en',  label:'English' },
];

/* ── Main component ─────────────────────────────────────────────────────────── */
export default function ProfilePage() {
    const { t }         = useTranslation();
    const { user: authUser, refreshUser } = useAuth();

    const [profile,   setProfile]   = useState(null);
    const [loading,   setLoading]   = useState(true);
    const [error,     setError]     = useState(null);
    const [editing,   setEditing]   = useState(false);
    const [saving,    setSaving]    = useState(false);
    const [toast,     setToast]     = useState(null);
    const [form,      setForm]      = useState({});

    /* fetch profile */
    const load = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await profileService.getMe();
            const p = data.user || data;
            setProfile(p);
            setForm({
                name:              p.name              || '',
                email:             p.email             || '',
                phone:             p.phone             || '',
                physicalAddress:   p.physicalAddress   || '',
                district:          p.district          || '',
                preferredLanguage: p.preferredLanguage || 'ses',
                lnid:              p.lnid              || '',
            });
        } catch (err) {
            setError(err.message || 'Failed to load profile');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    /* form helpers */
    const field = (key) => ({
        value: form[key] || '',
        onChange: (e) => setForm((f) => ({ ...f, [key]: e.target.value })),
        disabled: saving,
    });

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name?.trim()) {
            setToast({ msg: t('profilePage.nameRequired'), kind: 'error' });
            return;
        }
        setSaving(true);
        try {
            const data = await profileService.updateMe(form);
            const updated = data.user || data;
            setProfile(updated);
            if (typeof refreshUser === 'function') refreshUser();
            setEditing(false);
            setToast({ msg: t('profilePage.successSaved'), kind: 'success' });
        } catch (err) {
            setToast({ msg: err.message || t('profilePage.errorSaved'), kind: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        if (!profile) return;
        setForm({
            name:              profile.name              || '',
            email:             profile.email             || '',
            phone:             profile.phone             || '',
            physicalAddress:   profile.physicalAddress   || '',
            district:          profile.district          || '',
            preferredLanguage: profile.preferredLanguage || 'ses',
            lnid:              profile.lnid              || '',
        });
        setEditing(false);
    };

    /* ── Render ─────────────────────────────────────────────────────────────── */
    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-64 gap-3">
                <span className="material-symbols-outlined text-error text-5xl">error</span>
                <p className="font-public-sans text-body-md text-on-surface">{error}</p>
                <button onClick={load}
                        className="px-4 py-2 rounded-lg bg-primary text-white font-public-sans text-body-sm hover:opacity-90">
                    {t('profilePage.retry')}
                </button>
            </div>
        );
    }

    const displayName = profile?.name || authUser?.name || '—';
    const role        = profile?.role || authUser?.role || 'CITIZEN';
    const isActive    = profile?.isActive !== false;
    const address     = profile?.address || authUser?.address || '—';

    return (
        <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">

            {/* ── Page header ─────────────────────────────────────────────── */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="font-public-sans text-display-sm font-bold text-on-surface">
                        {t('profilePage.heading')}
                    </h1>
                    <p className="font-public-sans text-body-sm text-on-surface-variant mt-0.5">
                        {t('profilePage.subtitle')}
                    </p>
                </div>
                {!editing && (
                    <button
                        onClick={() => setEditing(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white font-public-sans text-body-sm font-semibold hover:opacity-90 transition-opacity"
                    >
                        <span className="material-symbols-outlined text-[18px]">edit</span>
                        {t('profilePage.editBtn')}
                    </button>
                )}
            </div>

            {/* ── Identity card ───────────────────────────────────────────── */}
            <div className="bg-surface-container-low rounded-2xl p-6 flex items-center gap-6 border border-outline-variant">
                <Avatar name={displayName} size={72} />
                <div className="flex flex-col gap-2">
                    <h2 className="font-public-sans text-title-lg font-bold text-on-surface">{displayName}</h2>
                    <div className="flex items-center gap-3 flex-wrap">
                        <RoleBadge role={role} />
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-label-caps font-semibold`}
                              style={{
                                  fontSize:'10px',
                                  background: isActive ? '#dcfce7' : '#fee2e2',
                                  color:      isActive ? '#166534' : '#991b1b',
                              }}>
                            <span className="material-symbols-outlined text-[12px]">
                                {isActive ? 'check_circle' : 'cancel'}
                            </span>
                            {isActive ? t('profilePage.statusActive') : t('profilePage.statusInactive')}
                        </span>
                    </div>
                    <p className="font-mono text-label-caps text-on-surface-variant break-all text-xs">
                        {address}
                    </p>
                </div>
            </div>

            {/* ── Editable form / display ─────────────────────────────────── */}
            <form onSubmit={handleSave}>
                <div className="bg-surface-container-lowest rounded-2xl border border-outline-variant overflow-hidden">

                    {/* section: personal */}
                    <div className="px-6 py-4 border-b border-outline-variant bg-surface-container-low">
                        <h3 className="font-public-sans text-label-lg font-semibold text-on-surface-variant uppercase tracking-wider text-xs">
                            {t('profilePage.sectionPersonal')}
                        </h3>
                    </div>
                    <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <FieldRow label={t('profilePage.nameLabel')}
                                  value={profile?.name}
                                  editing={editing}
                                  inputProps={{ ...field('name'), type:'text', placeholder: t('profilePage.nameLabel') }} />

                        <FieldRow label={t('profilePage.emailLabel')}
                                  value={profile?.email}
                                  editing={editing}
                                  inputProps={{ ...field('email'), type:'email', placeholder: t('profilePage.emailLabel') }} />

                        <FieldRow label={t('profilePage.phoneLabel')}
                                  value={profile?.phone}
                                  editing={editing}
                                  inputProps={{ ...field('phone'), type:'tel', placeholder:'+266 …' }} />

                        <FieldRow label={t('profilePage.lnidLabel')}
                                  value={profile?.lnid}
                                  editing={editing}
                                  inputProps={{ ...field('lnid'), type:'text', placeholder:'LS-…' }} />
                    </div>

                    {/* section: address */}
                    <div className="px-6 py-4 border-t border-b border-outline-variant bg-surface-container-low">
                        <h3 className="font-public-sans text-label-lg font-semibold text-on-surface-variant uppercase tracking-wider text-xs">
                            {t('profilePage.sectionAddress')}
                        </h3>
                    </div>
                    <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        <div className="sm:col-span-2">
                            <FieldRow label={t('profilePage.physAddressLabel')}
                                      value={profile?.physicalAddress}
                                      editing={editing}
                                      inputProps={{ ...field('physicalAddress'), type:'text', placeholder: t('profilePage.physAddressLabel') }} />
                        </div>

                        {/* district */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                                {t('profilePage.districtLabel')}
                            </label>
                            {editing ? (
                                <select
                                    {...field('district')}
                                    className="border border-outline-variant rounded-md px-3 py-2 font-public-sans text-body-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    <option value="">— {t('profilePage.selectDistrict')} —</option>
                                    {DISTRICTS.map((d) => (
                                        <option key={d} value={d}>{d}</option>
                                    ))}
                                </select>
                            ) : (
                                <span className="font-public-sans text-body-sm text-on-surface">
                                    {profile?.district || <span className="text-on-surface-variant italic">—</span>}
                                </span>
                            )}
                        </div>

                        {/* preferred language */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                                {t('profilePage.languageLabel')}
                            </label>
                            {editing ? (
                                <select
                                    {...field('preferredLanguage')}
                                    className="border border-outline-variant rounded-md px-3 py-2 font-public-sans text-body-sm text-on-surface bg-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-primary"
                                >
                                    {LANGUAGES.map((l) => (
                                        <option key={l.value} value={l.value}>{l.label}</option>
                                    ))}
                                </select>
                            ) : (
                                <span className="font-public-sans text-body-sm text-on-surface">
                                    {LANGUAGES.find((l) => l.value === (profile?.preferredLanguage || 'ses'))?.label || 'Sesotho'}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* section: system (read-only) */}
                    <div className="px-6 py-4 border-t border-b border-outline-variant bg-surface-container-low">
                        <h3 className="font-public-sans text-label-lg font-semibold text-on-surface-variant uppercase tracking-wider text-xs">
                            {t('profilePage.sectionSystem')}
                        </h3>
                    </div>
                    <div className="px-6 py-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
                        {/* role — always read-only */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                                {t('profilePage.roleLabel')}
                            </label>
                            <div className="flex items-center gap-2">
                                <RoleBadge role={role} />
                                <span className="font-public-sans text-label-caps text-on-surface-variant text-xs">
                                    ({t('profilePage.readonlyHint')})
                                </span>
                            </div>
                        </div>

                        {/* status */}
                        <div className="flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                                {t('profilePage.fieldStatus')}
                            </label>
                            <span className="font-public-sans text-body-sm text-on-surface flex items-center gap-1">
                                <span className="material-symbols-outlined text-[16px]"
                                      style={{ color: isActive ? '#16a34a' : '#dc2626' }}>
                                    {isActive ? 'check_circle' : 'cancel'}
                                </span>
                                {isActive ? t('profilePage.statusActive') : t('profilePage.statusInactive')}
                            </span>
                        </div>

                        {/* wallet address */}
                        <div className="sm:col-span-2 flex flex-col gap-1">
                            <label className="font-public-sans text-label-caps text-on-surface-variant uppercase tracking-wider text-xs">
                                {t('profilePage.fieldWallet')}
                            </label>
                            <span className="font-mono text-body-sm text-on-surface break-all">{address}</span>
                        </div>
                    </div>

                    {/* action bar */}
                    {editing && (
                        <div className="px-6 py-4 border-t border-outline-variant bg-surface-container-low flex items-center justify-end gap-3">
                            <button
                                type="button"
                                onClick={handleCancel}
                                disabled={saving}
                                className="px-4 py-2 rounded-lg border border-outline-variant font-public-sans text-body-sm text-on-surface hover:bg-surface-container transition-colors disabled:opacity-50"
                            >
                                {t('profilePage.cancelBtn')}
                            </button>
                            <button
                                type="submit"
                                disabled={saving}
                                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-white font-public-sans text-body-sm font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
                            >
                                {saving && (
                                    <span className="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>
                                )}
                                {saving ? t('profilePage.saving') : t('profilePage.saveBtn')}
                            </button>
                        </div>
                    )}
                </div>
            </form>

            {/* ── Validator / self-dealing notice ─────────────────────────── */}
            {(role === 'REGISTRY_OFFICER' || role === 'ADMIN') && (
                <div className="flex items-start gap-3 p-4 bg-warning-container rounded-xl border border-warning"
                     style={{ background:'#fffbeb', borderColor:'#d97706' }}>
                    <span className="material-symbols-outlined text-[20px] mt-0.5" style={{ color:'#b45309' }}>
                        policy
                    </span>
                    <div>
                        <p className="font-public-sans text-body-sm font-semibold" style={{ color:'#92400e' }}>
                            {t('profilePage.selfDealingTitle')}
                        </p>
                        <p className="font-public-sans text-body-sm mt-0.5" style={{ color:'#78350f' }}>
                            {t('profilePage.selfDealingBody')}
                        </p>
                    </div>
                </div>
            )}

            {/* toast */}
            {toast && (
                <Toast
                    msg={toast.msg}
                    kind={toast.kind}
                    onDismiss={() => setToast(null)}
                />
            )}
        </div>
    );
}
