import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';

import './index.css';
import './theme/global.css';

import { I18nProvider } from './i18n';
import { AuthProvider } from './auth';
import AppRouter from './govtech/router';
import reportWebVitals from './reportWebVitals';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
    <React.StrictMode>
        <I18nProvider defaultLang="ses">
            <BrowserRouter>
                <AuthProvider>
                    <AppRouter />
                </AuthProvider>
            </BrowserRouter>
        </I18nProvider>
    </React.StrictMode>
);

reportWebVitals();
