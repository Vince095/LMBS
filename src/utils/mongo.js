/**
 * DEPRECATED — direct MongoDB access from the frontend was removed during the
 * SAD §6 refactor. The connection helper now lives in
 * `lmsdapp/backend/config/db.js` and is only used by the Express server.
 *
 * If you reach this file from a browser bundle, that's a bug: the frontend
 * must call the REST API instead of opening its own database connection.
 */

function unsupported() {
    throw new Error(
        '[mongo] Direct MongoDB access from the frontend is unsupported. ' +
        'Use the REST API exposed by lmsdapp/backend instead.'
    );
}

module.exports = {
    connectDB: unsupported,
    closeDB: unsupported,
    getDb: () => null,
    getCollections: () => ({}),
    client: null,
};
