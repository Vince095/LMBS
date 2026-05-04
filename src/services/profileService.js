/**
 * Profile REST service — self-service profile CRUD.
 */

import { http } from './httpClient';
import { ENDPOINTS } from '../config/api';

export const profileService = {
    getMe:    ()        => http.get(`${ENDPOINTS.profiles}/me`),
    updateMe: (payload) => http.put(`${ENDPOINTS.profiles}/me`, payload),
    get:      (address) => http.get(`${ENDPOINTS.profiles}/${address}`),
};
