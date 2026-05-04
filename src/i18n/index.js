/**
 * Lightweight i18n provider — SRS NFR-009 (Sesotho primary, English secondary).
 *
 * We intentionally avoid pulling in `i18next` to keep the bundle small and
 * because the LMBS frontend currently has only ~200 strings. The provider:
 *
 *   - persists the user's choice to localStorage
 *   - exposes a `useTranslation()` hook that returns a `t(key)` function
 *   - falls back to English when a key is missing in Sesotho
 */

import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';
import en from './en.json';
import ses from './ses.json';

const DICTS = { en, ses };
const STORAGE_KEY = 'lmbs.lang';

const I18nContext = createContext({ lang: 'ses', setLang: () => {}, t: (k) => k });

function lookup(dict, key) {
    return key.split('.').reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), dict);
}

export function I18nProvider({ children, defaultLang = 'ses' }) {
    const initial = (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEY)) || defaultLang;
    const [lang, setLangState] = useState(initial);

    const setLang = useCallback((next) => {
        setLangState(next);
        try { localStorage.setItem(STORAGE_KEY, next); } catch (_) { /* ignore */ }
    }, []);

    const value = useMemo(() => {
        const dict = DICTS[lang] || DICTS.en;
        const fallback = DICTS.en;
        /**
         * t(key)                    — simple lookup
         * t(key, 'Default text')    — lookup with inline fallback string
         * t(key, { n: 5 })          — lookup with template replacements ({ {n} → 5 })
         * t(key, 'Default', { n })  — fallback string + replacements (third arg)
         */
        const t = (key, secondArg, thirdArg) => {
            let v = lookup(dict, key);
            if (v === undefined) v = lookup(fallback, key);

            // Determine fallback and replacements from overloaded args
            const defaultText   = typeof secondArg === 'string' ? secondArg : undefined;
            const replacements  = typeof secondArg === 'object' && secondArg !== null
                ? secondArg
                : (typeof thirdArg  === 'object' && thirdArg !== null ? thirdArg : undefined);

            if (v === undefined) v = defaultText !== undefined ? defaultText : key;

            if (typeof v === 'string' && replacements) {
                // Use split/join to avoid regex quantifier issues with keys like {n} or {0}
                return Object.keys(replacements).reduce(
                    (s, k) => s.split(`{${k}}`).join(String(replacements[k])),
                    v,
                );
            }
            return v;
        };
        return { lang, setLang, t };
    }, [lang, setLang]);

    return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation() {
    return useContext(I18nContext);
}

export function LanguageSwitcher({ className }) {
    const { lang, setLang, t } = useTranslation();
    return (
        <div className={className} role="group" aria-label={t('app.language')}>
            <button
                type="button"
                onClick={() => setLang('ses')}
                aria-pressed={lang === 'ses'}
                style={{ fontWeight: lang === 'ses' ? 700 : 400, marginRight: 8 }}
            >
                {t('app.sesotho')}
            </button>
            <button
                type="button"
                onClick={() => setLang('en')}
                aria-pressed={lang === 'en'}
                style={{ fontWeight: lang === 'en' ? 700 : 400 }}
            >
                {t('app.english')}
            </button>
        </div>
    );
}
