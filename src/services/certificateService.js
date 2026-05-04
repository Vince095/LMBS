/**
 * Certificate REST service — used by the Blockchain Certificate screen.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

export const certificateService = {
    get: (id) => http.get(`${ENDPOINTS.certificates}/${encodeURIComponent(id)}`),
};
