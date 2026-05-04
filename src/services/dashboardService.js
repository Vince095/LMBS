/**
 * Dashboard REST service — feeds the LMBS Dashboard screen.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

export const dashboardService = {
    stats:               () => http.get(`${ENDPOINTS.dashboard}/stats`),
    recentRegistrations: (limit = 10) => http.get(`${ENDPOINTS.dashboard}/recent-registrations?limit=${limit}`),
};
