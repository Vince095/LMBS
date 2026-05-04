/**
 * /api/parcels — list all parcels (paginated) and per-parcel sub-resources.
 *
 * GET  /                       -> paginated parcel list with owner enrichment
 * GET  /search?q=…             -> quick text search (pin / address / district)
 * GET  /documents              -> cross-parcel document index (paginated)
 * GET  /:pin                   -> full parcel detail (deed + encumbrances + disputes)
 * GET  /:pin/history           -> provenance ledger events
 * GET  /:pin/documents         -> supporting documents for one parcel
 * POST /:pin/documents         -> attach a supporting document
 * GET  /:pin/gis-history       -> GIS boundary change history
 *
 * NOTE: /documents and /search MUST be registered before /:pin/* to avoid
 * the literal words being captured as :pin parameters.
 */

const express = require('express');
const ctl = require('../controllers/provenanceController');

const router = express.Router();

router.get('/documents',         ctl.listDocuments);
router.get('/search',            ctl.search);
router.get('/',                  ctl.list);
router.get('/:pin/history',      ctl.history);
router.get('/:pin/documents',    ctl.documents);
router.post('/:pin/documents',   ctl.uploadDocument);
router.get('/:pin/gis-history',  ctl.gisHistory);
router.get('/:pin',              ctl.getParcel);

module.exports = router;
