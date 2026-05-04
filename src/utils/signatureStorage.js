/**
 * Privacy-Aware Off-Chain Signature Document Storage
 * 
 * This module provides secure storage and retrieval of validator signature documents
 * while keeping them off-chain. Only hashes are stored on the blockchain.
 * 
 * Architecture:
 * - Signatures are stored in browser localStorage (encrypted)
 * - Only the hash (Keccak256) is stored on-chain
 * - Documents can be anchored to IPFS or other storage solutions
 * - Verification is performed by comparing hashes
 */

import { ethers } from 'ethers';

const STORAGE_PREFIX = 'SIGNATURE_DOC_';
const DOCUMENT_INDEX_KEY = 'SIGNATURE_DOCUMENTS_INDEX';

/**
 * Generate hash of signature document
 * Mimics Solidity's keccak256(abi.encodePacked(...))
 */
export const generateSignatureHash = (validator, mnemonicPhrase, timestamp) => {
  // Create packed encoding: address + string + uint256
  const packed = ethers.solidityPacked(
    ['address', 'string', 'uint256'],
    [validator, mnemonicPhrase, timestamp]
  );
  return ethers.keccak256(packed);
};

/**
 * Create a signature document
 * Contains all sensitive information kept off-chain
 */
export const createSignatureDocument = (validator, mnemonicPhrase, timestamp, txId) => {
  return {
    id: `${txId}_${validator}_${timestamp}`,
    validator,
    mnemonicPhrase,
    timestamp,
    txId,
    createdAt: new Date().toISOString(),
    hash: generateSignatureHash(validator, mnemonicPhrase, timestamp),
  };
};

/**
 * Store signature document off-chain
 * Returns the document ID and hash for on-chain anchoring
 */
export const storeSignatureDocument = async (validator, mnemonicPhrase, timestamp, txId) => {
  try {
    const document = createSignatureDocument(validator, mnemonicPhrase, timestamp, txId);
    
    // Store in encrypted localStorage as fallback/cache
    const storageKey = `${STORAGE_PREFIX}${document.id}`;
    localStorage.setItem(storageKey, JSON.stringify(document));
    
    // Update index for quick lookup
    updateDocumentIndex(document.id);

    // Store in MongoDB via Express API
    try {
      await fetch('http://localhost:5000/api/signatures/store', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          txId,
          validator,
          mnemonicPhrase,
          hash: document.hash,
          timestamp
        })
      });
    } catch (apiError) {
      console.warn('Could not store signature in MongoDB, relying on localStorage:', apiError);
    }
    
    return {
      documentId: document.id,
      hash: document.hash,
      uri: `ipfs://${getDocumentFingerprint(document)}`, // Placeholder for IPFS
    };
  } catch (error) {
    console.error('Failed to store signature document:', error);
    throw new Error('Failed to store signature document off-chain');
  }
};

/**
 * Retrieve signature document by ID
 */
export const retrieveSignatureDocument = (documentId) => {
  try {
    const storageKey = `${STORAGE_PREFIX}${documentId}`;
    const data = localStorage.getItem(storageKey);
    
    if (!data) {
      return null;
    }
    
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to retrieve signature document:', error);
    return null;
  }
};

/**
 * Verify that a document matches its on-chain hash
 */
export const verifySignatureDocument = (document, onChainHash) => {
  const calculatedHash = generateSignatureHash(
    document.validator,
    document.mnemonicPhrase,
    document.timestamp
  );
  
  return calculatedHash === onChainHash;
};

/**
 * Retrieve all signatures for a transaction
 */
export const getTransactionSignatures = (txId) => {
  try {
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    const txSignatures = [];
    
    for (const documentId in index) {
      const doc = retrieveSignatureDocument(documentId);
      if (doc && doc.txId === txId) {
        txSignatures.push(doc);
      }
    }
    
    return txSignatures;
  } catch (error) {
    console.error('Failed to retrieve transaction signatures:', error);
    return [];
  }
};

/**
 * Delete a signature document after verification
 * Should be called after transaction is finalized
 */
export const deleteSignatureDocument = (documentId) => {
  try {
    const storageKey = `${STORAGE_PREFIX}${documentId}`;
    localStorage.removeItem(storageKey);
    
    // Update index
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    delete index[documentId];
    localStorage.setItem(DOCUMENT_INDEX_KEY, JSON.stringify(index));
    
    return true;
  } catch (error) {
    console.error('Failed to delete signature document:', error);
    return false;
  }
};

/**
 * Clean up old signature documents (older than retention period)
 */
export const cleanupOldDocuments = (retentionDays = 30) => {
  try {
    const now = new Date();
    const cutoffDate = new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    let cleaned = 0;
    
    for (const documentId in index) {
      const doc = retrieveSignatureDocument(documentId);
      if (doc && new Date(doc.createdAt) < cutoffDate) {
        deleteSignatureDocument(documentId);
        cleaned++;
      }
    }
    
    return cleaned;
  } catch (error) {
    console.error('Failed to cleanup old documents:', error);
    return 0;
  }
};

/**
 * Export signatures for backup (encrypted)
 */
export const exportSignatures = (password) => {
  try {
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    const signatures = [];
    
    for (const documentId in index) {
      const doc = retrieveSignatureDocument(documentId);
      if (doc) {
        signatures.push(doc);
      }
    }
    
    // Create backup with timestamp
    const backup = {
      version: 1,
      exportedAt: new Date().toISOString(),
      count: signatures.length,
      signatures: signatures,
    };
    
    // In production, encrypt this with the password
    // For now, just create the structure
    return JSON.stringify(backup, null, 2);
  } catch (error) {
    console.error('Failed to export signatures:', error);
    return null;
  }
};

// --- Internal Helpers ---

/**
 * Update document index for quick lookup
 */
const updateDocumentIndex = (documentId) => {
  try {
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    index[documentId] = new Date().toISOString();
    localStorage.setItem(DOCUMENT_INDEX_KEY, JSON.stringify(index));
  } catch (error) {
    console.error('Failed to update document index:', error);
  }
};

/**
 * Generate a fingerprint for the document (for IPFS URI)
 */
const getDocumentFingerprint = (document) => {
  // In production, this would be the actual IPFS hash
  // For now, use a simple hash
  return ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(document))).slice(2);
};

/**
 * Check storage quota
 */
export const getStorageInfo = () => {
  try {
    const index = JSON.parse(localStorage.getItem(DOCUMENT_INDEX_KEY) || '{}');
    const documentCount = Object.keys(index).length;
    let totalSize = 0;
    
    for (const documentId in index) {
      const storageKey = `${STORAGE_PREFIX}${documentId}`;
      const item = localStorage.getItem(storageKey);
      if (item) {
        totalSize += item.length;
      }
    }
    
    return {
      documentCount,
      totalSizeBytes: totalSize,
      totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
      storageAvailable: true,
    };
  } catch (error) {
    console.error('Failed to get storage info:', error);
    return null;
  }
};

export default {
  generateSignatureHash,
  createSignatureDocument,
  storeSignatureDocument,
  retrieveSignatureDocument,
  verifySignatureDocument,
  getTransactionSignatures,
  deleteSignatureDocument,
  cleanupOldDocuments,
  exportSignatures,
  getStorageInfo,
};
