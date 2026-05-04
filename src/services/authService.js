/**
 * Auth REST service - wraps /api/auth endpoints.
 *
 * Tokens are persisted to localStorage by AuthContext, but this module is
 * stateless - callers pass the token to `me()` if needed.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

const BASE = (ENDPOINTS.dashboard.replace('/dashboard', '') ).replace(/\/$/, '') + '/auth';

export const authService = {
    register: (payload) => http.post(BASE + '/register', payload),
    login:    (payload) => http.post(BASE + '/login', payload),
    logout:   ()        => http.post(BASE + '/logout', {}),
    me:       (token)   => http.get(BASE + '/me', token ? { headers: { Authorization: 'Bearer ' + token } } : undefined),
    changePassword: (payload, token) => http.post(BASE + '/change-password', payload, token ? { headers: { Authorization: 'Bearer ' + token } } : undefined),
};
