/**
 * GovTech Land Portal router.
 *
 * Public:       /login, /register
 * All auth:     /, /search, /properties, /property/:pin, /register-parcel, /registry,
 *               /transfer/:pin, /certificate/:id, /transactions, /transactions/:pin,
 *               /documents, /disputes, /tx/:txHash, /profile
 * Officer+:     /approvals (on-chain M-of-N votes), /dispute-management
 * Admin only:   /parcel-history, /admin-panel
 */

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';

import Layout              from './Layout';
import Dashboard           from './pages/Dashboard';
import SearchAndMap        from './pages/SearchAndMap';
import Properties          from './pages/Properties';
import PropertyDetails     from './pages/PropertyDetails';
import RegisterTransfer    from './pages/RegisterTransfer';
import BlockchainCertificate from './pages/BlockchainCertificate';
import TransactionHistory  from './pages/TransactionHistory';
import GISParcelHistory    from './pages/GISParcelHistory';
import Documents           from './pages/Documents';
import Disputes            from './pages/Disputes';
import ApprovalsQueue      from './pages/ApprovalsQueue';
import DisputeManagement   from './pages/DisputeManagement';
import EncumbrancesPage    from './pages/EncumbrancesPage';
import AdminPanel          from './pages/AdminPanel';
import ProfilePage         from './pages/ProfilePage';
import TxViewer            from './pages/TxViewer';
import ChainConsole        from './pages/ChainConsole';

import { LoginPage, RegisterPage, ProtectedRoute } from '../auth';

export default function AppRouter() {
    return (
        <Routes>
            <Route path="/login"    element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />

            <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                    {/* ── All authenticated users ───────────────────────── */}
                    <Route index element={<Dashboard />} />
                    <Route path="search"              element={<SearchAndMap />} />
                    <Route path="properties"          element={<Properties />} />
                    <Route path="property/:pin"       element={<PropertyDetails />} />
                    <Route path="register-parcel"     element={<RegisterTransfer />} />
                    <Route path="transfer/:pin"       element={<RegisterTransfer />} />
                    <Route path="certificate/:id"     element={<BlockchainCertificate />} />
                    <Route path="transactions"        element={<TransactionHistory />} />
                    <Route path="transactions/:pin"   element={<TransactionHistory />} />
                    <Route path="documents"           element={<Documents />} />
                    <Route path="disputes"            element={<Disputes />} />
                    <Route path="encumbrances"        element={<EncumbrancesPage />} />
                    <Route path="profile"             element={<ProfilePage />} />
                    <Route path="tx/:txHash"          element={<TxViewer />} />
                    <Route path="registry"            element={<ChainConsole />} />

                    {/* ── Officer / Notary / Admin ───────────────────────── */}
                    <Route element={<ProtectedRoute roles={['REGISTRY_OFFICER','NOTARY','SURVEYOR','AUDITOR','ADMIN']} />}>
                        <Route path="approvals"          element={<ApprovalsQueue />} />
                        <Route path="dispute-management" element={<DisputeManagement />} />
                    </Route>

                    {/* ── Admin only ─────────────────────────────────────── */}
                    <Route element={<ProtectedRoute roles={['ADMIN']} />}>
                        <Route path="parcel-history"      element={<GISParcelHistory />} />
                        <Route path="parcel-history/:pin" element={<GISParcelHistory />} />
                        <Route path="admin-panel"         element={<AdminPanel />} />
                    </Route>
                </Route>
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}
