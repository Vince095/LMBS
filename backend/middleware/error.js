/**
 * Centralised error handler.
 *
 * 4xx errors (client mistakes - bad input, not-found, forbidden) get logged
 * as a single-line warning. 5xx errors (real server faults) get the full
 * stack trace at console.error.
 */

const env = require('../config/env');

class HttpError extends Error {
    constructor(status, message, details) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

function notFoundHandler(req, res, _next) {
    res.status(404).json({ error: 'Not Found', path: req.originalUrl });
}

function errorHandler(err, req, res, _next) {
    const status = err.status || 500;

    /* eslint-disable no-console */
    if (status >= 500) {
        console.error('[' + status + '] ' + req.method + ' ' + req.originalUrl, err);
    } else {
        console.warn('[' + status + '] ' + req.method + ' ' + req.originalUrl + ' - ' + (err.message || 'client error'));
    }
    /* eslint-enable no-console */

    const payload = { error: err.message || 'Internal Server Error' };
    if (err.details) payload.details = err.details;
    if (env.nodeEnv !== 'production' && status >= 500 && err.stack) {
        payload.stack = err.stack.split('\n').slice(0, 5);
    }

    res.status(status).json(payload);
}

module.exports = { HttpError, notFoundHandler, errorHandler };
