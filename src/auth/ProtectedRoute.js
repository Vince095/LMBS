/**
 * ProtectedRoute - wraps a route element and redirects to /login when the
 * user isn't authenticated. Optional `roles` prop further restricts access.
 *
 *   <Route element={<ProtectedRoute roles={['REGISTRY_OFFICER']} />}>
 *     <Route path="registry" element={<RegistryPage />} />
 *   </Route>
 */

import React from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import Loader from '../govtech/components/Loader';

export default function ProtectedRoute({ roles }) {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <Loader fullscreen size="lg" label="Authenticating..." />;
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location }} />;
    }

    if (Array.isArray(roles) && roles.length > 0 && user.role !== 'ADMIN' && !roles.includes(user.role)) {
        return (
            <div className="p-margin font-public-sans">
                <h1 className="text-h2 font-semibold">Access denied</h1>
                <p className="text-body-md text-on-surface-variant mt-2">
                    Your account ({user.role}) doesn't have permission for this page.
                </p>
            </div>
        );
    }

    return <Outlet />;
}
