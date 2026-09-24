/**
 * /api/parcels — parcel read models, provenance and document metadata.
 * Documents themselves are uploaded to the encrypted store via /api/documents.
 */
const express = require('express');
const ctl = require('../controllers/provenanceController');
const { rbac } = require('../middleware/rbac');

const router = express.Router();

router.get('/documents',         ctl.listDocuments);
router.get('/search',            ctl.search);
router.get('/',                  ctl.list);
router.get('/:pin/history',      ctl.history);
router.get('/:pin/documents',    ctl.documents);
router.post('/:pin/documents',   rbac(['REGISTRY_OFFICER', 'SURVEYOR', 'NOTARY']), ctl.uploadDocument);
router.get('/:pin/gis-history',  ctl.gisHistory);
router.get('/:pin',              ctl.getParcel);

module.exports = router;
