/**
 * Network REST service — Besu chain status / TX lookup.
 */
import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

export const networkService = {
    status: ()         => http.get(`${ENDPOINTS.network}/status`),
    getTx:  (txHash)   => http.get(`${ENDPOINTS.network}/tx/${encodeURIComponent(txHash)}`),
};
