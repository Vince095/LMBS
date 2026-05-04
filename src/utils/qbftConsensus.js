/**
 * QBFT (Quorum Byzantine Fault Tolerance) Consensus Manager
 * 
 * Manages the QBFT consensus protocol on the frontend
 * Handles phase transitions: pre-prepare → prepare → commit → finalize
 */

export const QBFT_PHASES = {
  IDLE: 'IDLE',
  PRE_PREPARE: 'PRE_PREPARE',
  PREPARE: 'PREPARE',
  COMMIT: 'COMMIT',
};

export const TRANSACTION_STATUS = {
  PENDING: 'PENDING',
  PRE_PREPARE: 'PRE_PREPARE',
  PREPARE: 'PREPARE',
  COMMIT: 'COMMIT',
  FINALIZED: 'FINALIZED',
  REJECTED: 'REJECTED',
};

export const TRANSACTION_TYPES = {
  MINT: 0,
  TRANSFER: 1,
};

/**
 * Calculate Byzantine fault tolerance parameters
 */
export const calculateQBFTParameters = (validatorCount) => {
  if (validatorCount < 4) {
    return {
      maxFaultyValidators: 0,
      quorumSize: validatorCount, // All must agree
      isValid: true,
      tolerance: 'None (all validators required)',
    };
  }

  // f = floor((n - 1) / 3) for PBFT tolerance
  const maxFaults = Math.floor((validatorCount - 1) / 3);
  
  // Quorum = 2f + 1 (majority of honest validators)
  const quorum = 2 * maxFaults + 1;
  
  return {
    maxFaultyValidators: maxFaults,
    quorumSize: quorum,
    isValid: true,
    tolerance: `Can tolerate up to ${maxFaults} faulty validators (${(maxFaults / validatorCount * 100).toFixed(1)}%)`,
  };
};

/**
 * Get current phase and progress for a transaction
 */
export const getTransactionProgress = (txn, requiredQuorum) => {
  const phases = [];
  let currentPhaseIndex = 0;
  
  // Determine phase order
  const phaseOrder = [
    { status: TRANSACTION_STATUS.PRE_PREPARE, name: 'Pre-Prepare', label: 'Primary Proposes' },
    { status: TRANSACTION_STATUS.PREPARE, name: 'Prepare', label: 'Validators Prepare' },
    { status: TRANSACTION_STATUS.COMMIT, name: 'Commit', label: 'Validators Commit' },
    { status: TRANSACTION_STATUS.FINALIZED, name: 'Finalized', label: 'Transaction Finalized' },
  ];
  
  // Find current phase
  const statusIndex = phaseOrder.findIndex(p => p.status === txn.status);
  
  return {
    currentPhase: phaseOrder[statusIndex]?.name || 'Unknown',
    currentPhaseLabel: phaseOrder[statusIndex]?.label || 'Unknown',
    phaseIndex: statusIndex,
    totalPhases: phaseOrder.length,
    progress: ((statusIndex + 1) / phaseOrder.length) * 100,
    phases: phaseOrder,
    prepareProgress: {
      current: txn.prepareCount || 0,
      required: requiredQuorum,
      percentage: Math.min(100, ((txn.prepareCount || 0) / requiredQuorum) * 100),
    },
    commitProgress: {
      current: txn.commitCount || 0,
      required: requiredQuorum,
      percentage: Math.min(100, ((txn.commitCount || 0) / requiredQuorum) * 100),
    },
    totalSignatures: txn.signatures?.length || 0,
  };
};

/**
 * Analyze consensus safety
 */
export const analyzeConsensusSafety = (txn, parameters) => {
  const { quorumSize, maxFaultyValidators } = parameters;
  const commitCount = txn.commitCount || 0;
  
  return {
    isQuorumReached: commitCount >= quorumSize,
    quorumReached: commitCount,
    quorumRequired: quorumSize,
    quorumDeficit: Math.max(0, quorumSize - commitCount),
    isSafeToFinalize: commitCount >= quorumSize,
    byzantine: {
      canTolerateFaults: maxFaultyValidators,
      faultyValidatorsDetected: 0,
      safetyMargin: commitCount - Math.ceil(quorumSize / 2),
    },
    safety: {
      level: commitCount >= quorumSize ? 'SAFE' : commitCount >= Math.ceil(quorumSize / 2) ? 'CAUTION' : 'UNSAFE',
      message: getConsensusMessage(commitCount, quorumSize),
    },
  };
};

/**
 * Get human-readable consensus message
 */
export const getConsensusMessage = (commitCount, quorumSize) => {
  if (commitCount === 0) {
    return 'Waiting for validator approvals...';
  }
  if (commitCount < Math.ceil(quorumSize / 2)) {
    return `Early consensus: ${commitCount}/${quorumSize} validators. May fail.`;
  }
  if (commitCount < quorumSize) {
    return `Approaching consensus: ${commitCount}/${quorumSize} validators. Almost there.`;
  }
  return `Consensus achieved! ${commitCount}/${quorumSize} validators approved.`;
};

/**
 * Get view-based primary validator
 */
export const getPrimaryValidatorForView = (validators, view) => {
  if (!validators || validators.length === 0) return null;
  return validators[view % validators.length];
};

/**
 * Calculate view change requirement
 */
export const calculateViewChangeThreshold = (validatorCount) => {
  if (validatorCount < 4) {
    return Math.ceil(validatorCount / 2);
  }
  const f = Math.floor((validatorCount - 1) / 3);
  return f + 1; // f+1 validators needed to trigger view change
};

/**
 * Validate QBFT message
 */
export const validateQBFTMessage = (message, validators, currentView, txn) => {
  const validations = {
    viewCorrect: message.view === currentView,
    phaseValid: Object.values(QBFT_PHASES).includes(message.phase),
    validatorIsKnown: validators.some(v => v.toLowerCase() === message.validator.toLowerCase()),
    messageNotDuplicate: !txn.signatures?.some(
      sig => sig.validator === message.validator && sig.phase === message.phase
    ),
  };
  
  return {
    isValid: Object.values(validations).every(v => v === true),
    validations,
    errors: Object.entries(validations)
      .filter(([_, valid]) => !valid)
      .map(([key]) => key),
  };
};

/**
 * Detect Byzantine behavior
 */
export const detectByzantineBehavior = (txn, parameters) => {
  const { maxFaultyValidators, quorumSize } = parameters;
  const behaviors = [];
  
  if (!txn.signatures) return behaviors;
  
  // Check for conflicting votes
  const prepareVoters = new Set(
    txn.signatures
      .filter(sig => sig.phase === QBFT_PHASES.PREPARE)
      .map(sig => sig.validator)
  );
  
  const commitVoters = new Set(
    txn.signatures
      .filter(sig => sig.phase === QBFT_PHASES.COMMIT)
      .map(sig => sig.validator)
  );
  
  // Validator that prepared but didn't commit is suspicious
  for (const validator of prepareVoters) {
    if (!commitVoters.has(validator) && commitVoters.size > 0) {
      behaviors.push({
        type: 'INCONSISTENT_VOTE',
        validator,
        severity: 'WARNING',
        message: 'Validator prepared but did not commit',
      });
    }
  }
  
  // Too many signatures in same phase
  const phaseSignatureCounts = {
    [QBFT_PHASES.PRE_PREPARE]: 0,
    [QBFT_PHASES.PREPARE]: 0,
    [QBFT_PHASES.COMMIT]: 0,
  };
  
  for (const sig of txn.signatures) {
    phaseSignatureCounts[sig.phase]++;
  }
  
  // Check for duplicates from same validator (impossible)
  const validatorPhaseMap = {};
  for (const sig of txn.signatures) {
    const key = `${sig.validator}_${sig.phase}`;
    if (validatorPhaseMap[key]) {
      behaviors.push({
        type: 'DUPLICATE_SIGNATURE',
        validator: sig.validator,
        severity: 'CRITICAL',
        message: 'Duplicate signature from same validator in same phase',
      });
    }
    validatorPhaseMap[key] = true;
  }
  
  return behaviors;
};

/**
 * Format QBFT status for display
 */
export const formatQBFTStatus = (txn, parameters, validators) => {
  const progress = getTransactionProgress(txn, parameters.quorumSize);
  const safety = analyzeConsensusSafety(txn, parameters);
  const byzantine = detectByzantineBehavior(txn, parameters);
  const primary = getPrimaryValidatorForView(validators, txn.view || 0);
  
  return {
    transactionId: txn.id,
    type: txn.txType === TRANSACTION_TYPES.MINT ? 'Mint' : 'Transfer',
    status: txn.status,
    view: txn.view || 0,
    currentPhase: progress.currentPhaseLabel,
    progress: {
      phase: `${progress.phaseIndex + 1}/${progress.totalPhases}`,
      percentage: progress.progress.toFixed(1),
      prepare: `${progress.prepareProgress.current}/${progress.prepareProgress.required}`,
      commit: `${progress.commitProgress.current}/${progress.commitProgress.required}`,
    },
    consensus: {
      consensus: safety.isQuorumReached ? '✓ Achieved' : '✗ Pending',
      safetyLevel: safety.safety.level,
      message: safety.safety.message,
      quorum: `${safety.quorumReached}/${safety.quorumRequired}`,
    },
    byzantine: {
      suspiciousBehaviors: byzantine.length,
      isSafe: byzantine.filter(b => b.severity === 'CRITICAL').length === 0,
    },
    validators: {
      primary: primary?.slice(0, 10) + '...',
      totalValidators: parameters.validatorCount,
      maxFaults: parameters.maxFaultyValidators,
    },
    timestamps: {
      created: new Date(txn.createdAt * 1000).toLocaleString(),
      updated: new Date(txn.updatedAt * 1000).toLocaleString(),
    },
  };
};

/**
 * Get recommendations for next action
 */
export const getNextActionRecommendation = (txn, parameters, address) => {
  const { quorumSize } = parameters;
  const commitCount = txn.commitCount || 0;
  
  if (commitCount >= quorumSize) {
    return {
      action: 'FINALIZE',
      description: 'Quorum reached. Transaction can be finalized.',
      canExecute: true,
    };
  }
  
  if (txn.status === TRANSACTION_STATUS.PRE_PREPARE) {
    return {
      action: 'PREPARE',
      description: 'Transaction is in pre-prepare phase. Validators can prepare.',
      canExecute: true,
    };
  }
  
  if (txn.status === TRANSACTION_STATUS.PREPARE) {
    return {
      action: 'COMMIT',
      description: 'Sufficient prepare votes received. Validators can now commit.',
      canExecute: true,
    };
  }
  
  return {
    action: 'WAIT',
    description: 'Waiting for more validator approvals.',
    canExecute: false,
  };
};

export default {
  QBFT_PHASES,
  TRANSACTION_STATUS,
  TRANSACTION_TYPES,
  calculateQBFTParameters,
  getTransactionProgress,
  analyzeConsensusSafety,
  getConsensusMessage,
  getPrimaryValidatorForView,
  calculateViewChangeThreshold,
  validateQBFTMessage,
  detectByzantineBehavior,
  formatQBFTStatus,
  getNextActionRecommendation,
};
