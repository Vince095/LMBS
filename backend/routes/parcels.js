/**
 * /api/parcels — parcel read models, provenance and document metadata.
 * Documents are uploaded only through the encrypted store: POST /api/documents
 * with { contentBase64, name, type, mimeType, parcelPin }.
 */
const express = require('express');
const ctl = require('../controllers/provenanceController');

const router = express.Router();

router.get('/documents',         ctl.listDocuments);
router.get('/search',            ctl.search);
router.get('/',                  ctl.list);
router.get('/:pin/history',      ctl.history);
router.get('/:pin/documents',    ctl.documents);
router.get('/:pin/gis-history',  ctl.gisHistory);
router.get('/:pin',              ctl.getParcel);

module.exports = router;
