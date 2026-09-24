/**
 * Role-Based Access Control middleware.
 *
 *   router.post('/foo', rbac(['REGISTRY_OFFICER', 'ADMIN']), handler);
 *
 * Always enforced: an unauthenticated caller gets 401 and a caller without
 * one of the listed roles gets 403. (The former "log and allow" mode has been
 * removed.) ADMIN is accepted on every off-chain administrative route; on-chain
 * actions are additionally checked by the smart contracts' RoleAuthority.
 */

function rbac(allowedRoles = []) {
    if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
        throw new Error('rbac() needs at least one role');
    }
    const allow = new Set(allowedRoles.map((r) => r.toUpperCase()));

    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const role = (req.user.role || '').toUpperCase();
        if (allow.has(role) || role === 'ADMIN') return next();
        return res.status(403).json({ error: 'Forbidden', requiredRole: [...allow] });
    };
}

/** Allows the resource owner (by user id or verified wallet) or one of the roles. */
function selfOrRoles(getOwner, roles) {
    const allow = new Set(roles.map((r) => r.toUpperCase()));
    return (req, res, next) => {
        if (!req.user) return res.status(401).json({ error: 'Authentication required' });
        const role = (req.user.role || '').toUpperCase();
        if (allow.has(role) || role === 'ADMIN') return next();
        const owner = String(getOwner(req) || '').toLowerCase();
        if (owner && (owner === String(req.user.id).toLowerCase() || owner === req.user.address)) return next();
        return res.status(403).json({ error: 'Forbidden' });
    };
}

module.exports = { rbac, selfOrRoles };
