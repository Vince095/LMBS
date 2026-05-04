/**
 * ID generators for LMBS — implements the Lesotho PIN, Deed Number, Transfer
 * ID, Dispute Case ID, and Encumbrance ID formats called out across the SRS.
 *
 * Format conventions:
 *   PIN:           LSO-<DISTRICT>-<SEQ>-<YYYY>-<RAND>     (FR-LR-005, non-sequential)
 *   Deed:          TD-<YYYY>-<COUNTER>                     (FR-TD-001)
 *   TransferId:    TRF-<YYYY>-<COUNTER>
 *   DisputeId:     DSP-<YYYY>-<COUNTER>
 *   EncumbranceId: ENC-<YYYY>-<COUNTER>
 *
 * Counters are persisted across calls when a `getNext(name)` callback is
 * supplied (the controllers wire this up to a Mongo `counters` collection).
 */

const crypto = require('crypto');

const DISTRICT_CODES = {
    Maseru: 'MAS',
    Berea: 'BER',
    Leribe: 'LRB',
    'Botha-Bothe': 'BTH',
    Mafeteng: 'MAF',
    "Mohale's Hoek": 'MHK',
    Quthing: 'QTH',
    "Qacha's Nek": 'QCN',
    Mokhotlong: 'MKL',
    'Thaba-Tseka': 'TBT',
};

function pad(n, width = 5) {
    return String(n).padStart(width, '0');
}

function makePIN(district, sequence, year = new Date().getUTCFullYear()) {
    const code = DISTRICT_CODES[district] || 'LSO';
    const rand = crypto.randomBytes(2).toString('hex').toUpperCase();
    return `LSO-${code}-${pad(sequence)}-${year}-${rand}`;
}

function makeDeedNumber(sequence, year = new Date().getUTCFullYear()) {
    return `TD-${year}-${pad(sequence)}`;
}

function makeTransferId(sequence, year = new Date().getUTCFullYear()) {
    return `TRF-${year}-${pad(sequence)}`;
}

function makeDisputeId(sequence, year = new Date().getUTCFullYear()) {
    return `DSP-${year}-${pad(sequence)}`;
}

function makeEncumbranceId(sequence, year = new Date().getUTCFullYear()) {
    return `ENC-${year}-${pad(sequence)}`;
}

module.exports = {
    DISTRICT_CODES,
    makePIN,
    makeDeedNumber,
    makeTransferId,
    makeDisputeId,
    makeEncumbranceId,
};
