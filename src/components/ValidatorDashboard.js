import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import Icon from './Icons';
import { generateSignatureHash, storeSignatureDocument, getTransactionSignatures } from '../utils/signatureStorage';
import { calculateQBFTParameters, getTransactionProgress, analyzeConsensusSafety, formatQBFTStatus } from '../utils/qbftConsensus';

const ValidatorDashboard = ({ 
    contract, 
    userProfileContract,
    address, 
    isValidator, 
    isAdmin,
    darkMode,
    statusMessage,
    setStatusMessage,
    isProcessing,
    setIsProcessing,
    onClose
}) => {
    const [activeTab, setActiveTab] = useState('pending'); // pending, registeredUsers, landOwners, analytics, history
    const [pendingTransactions, setPendingTransactions] = useState([]);
    const [registeredUsers, setRegisteredUsers] = useState([]);
    const [allLandOwners, setAllLandOwners] = useState([]);
    const [analyticsData, setAnalyticsData] = useState(null);
    const [transactionHistory, setTransactionHistory] = useState([]);
    const [selectedTransaction, setSelectedTransaction] = useState(null);
    const [mnemonicPhrase, setMnemonicPhrase] = useState('');
    const [rejectReason, setRejectReason] = useState('');
    const [showSignatureModal, setShowSignatureModal] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState(false);
    const [selectedForAction, setSelectedForAction] = useState(null);
    const [requiredApprovals, setRequiredApprovals] = useState(1);
    const [transactionFilters, setTransactionFilters] = useState({
        type: 'all', // all, mint, transfer
        status: 'all' // all, pending, approved, rejected
    });
    const [qbftParameters, setQbftParameters] = useState(null);
    const [validatorCount, setValidatorCount] = useState(0);

    // Get user profile details by address
    const getUserDetails = useCallback(async (userAddress) => {
        if (!userAddress) return null;
        
        try {
            // First try to fetch from off-chain storage
            const response = await fetch(`http://localhost:5000/api/profiles/${userAddress}`);
            if (response.ok) {
                const profile = await response.json();
                return {
                    address: userAddress,
                    name: profile.name || 'Unknown',
                    email: profile.email || '',
                    phone: profile.phone || '',
                    physicalAddress: profile.physicalAddress || ''
                };
            }
        } catch (err) {
            console.warn(`Could not fetch off-chain profile for ${userAddress}, falling back to on-chain:`, err.message);
        }

        // Fallback to on-chain profile contract
        if (!userProfileContract) return { address: userAddress, name: 'Unknown' };
        
        try {
            const profile = await userProfileContract.getProfile(userAddress);
            if (profile && profile[5]) { // isRegistered is at index 5
                return {
                    address: userAddress,
                    name: profile[0] || 'Unknown',
                    email: profile[1] || '',
                    phone: profile[2] || '',
                    physicalAddress: profile[3] || ''
                };
            }
            return { address: userAddress, name: 'Unregistered User' };
        } catch (error) {
            // Silently ignore ENS errors - expected on Besu QBFT
            if (error.code === 'UNSUPPORTED_OPERATION' && error.operation === 'getEnsAddress') {
                return { address: userAddress, name: 'Unregistered User' };
            }
            console.error(`Failed to fetch profile for ${userAddress}:`, error);
            return { address: userAddress, name: 'Error loading' };
        }
    }, [userProfileContract]);

    // Fetch pending transactions - show ALL pending for validators to review
    const fetchPendingTransactions = useCallback(async () => {
        if (!contract) return;
        try {
            // Get ALL pending transactions (not just unsigned ones)
            const allPending = await contract.getPendingTransactions();
            console.log("All pending transaction IDs:", allPending);
            const txDetails = [];
            for (let txId of allPending) {
                const tx = await contract.getTransaction(txId);
                const signatureList = await contract.getTransactionSignatures(txId);
                console.log(`Transaction ${txId} RAW:`, tx);
                
                // Only show pending transactions (convert BigInt to Number for comparison)
                if (Number(tx.status) === 0) { // PENDING status
                    // Fetch initiator and target owner user details
                    const initiatorDetails = await getUserDetails(tx.initiator);
                    const targetOwnerDetails = tx.targetOwner ? await getUserDetails(tx.targetOwner) : null;
                    const transferFrom = tx.fromAddress || tx.transferFrom || null;
                    const transferTo = tx.toAddress || tx.transferTo || null;
                    
                    txDetails.push({
                        id: Number(txId),
                        txType: Number(tx.txType),
                        status: Number(tx.status),
                        parcelNumber: tx.parcelNumber || 'N/A',
                        location: tx.location || 'N/A',
                        area: tx.area ? Number(tx.area) : 0,
                        initiator: tx.initiator,
                        initiatorName: initiatorDetails?.name || 'Unknown',
                        targetOwner: tx.targetOwner,
                        targetOwnerName: targetOwnerDetails?.name || 'Unknown',
                        transferFrom,
                        transferTo,
                        signatures: signatureList || [],
                        signatureCount: Number(tx.signatures || signatureList.length || 0),
                        createdAt: tx.createdAt ? Number(tx.createdAt) : 0,
                        tokenId: tx.tokenId ? Number(tx.tokenId) : null
                    });
                }
            }
            console.log("Fetched pending transactions with user details:", txDetails);
            setPendingTransactions(txDetails);
        } catch (error) {
            console.error("Failed to fetch pending transactions:", error);
        }
    }, [contract, getUserDetails]);

    // Fetch all land owners and their properties
    const fetchLandOwners = useCallback(async () => {
        if (!contract) return;
        try {
            // For each transaction, track unique owners
            const allTxIds = await contract.getPendingTransactions();
            const ownerMap = new Map();

            for (let txId of allTxIds) {
                const tx = await contract.getTransaction(txId);
                if (Number(tx.txType) === 0) { // MINT
                    if (!ownerMap.has(tx.targetOwner)) {
                        ownerMap.set(tx.targetOwner, { address: tx.targetOwner, lands: [], status: 'pending' });
                    }
                    ownerMap.get(tx.targetOwner).lands.push({
                        parcelNumber: tx.parcelNumber,
                        location: tx.location,
                        area: Number(tx.area),
                        tokenId: tx.tokenId
                    });
                }
            }

            // Enrich with user profile details
            const enrichedOwners = [];
            for (let [address, ownerData] of ownerMap) {
                const userDetails = await getUserDetails(address);
                enrichedOwners.push({
                    address,
                    name: userDetails?.name || 'Unknown',
                    email: userDetails?.email || '',
                    phone: userDetails?.phone || '',
                    physicalAddress: userDetails?.physicalAddress || '',
                    lands: ownerData.lands,
                    status: ownerData.status
                });
            }

            setAllLandOwners(enrichedOwners);
        } catch (error) {
            console.error("Failed to fetch land owners:", error);
        }
    }, [contract, getUserDetails]);

    // Fetch registered users from blockchain
    const fetchRegisteredUsers = useCallback(async () => {
        if (!contract || !userProfileContract) return;
        try {
            // Get all registered users from UserProfile contract
            let allAddresses = [];
            try {
                allAddresses = await userProfileContract.getAllRegisteredUsers();
                console.log("All registered user addresses:", allAddresses);
            } catch (addressError) {
                if (addressError.code === 'UNSUPPORTED_OPERATION' && addressError.operation === 'getEnsAddress') {
                    // Ignore ENS errors - expected on Besu
                    console.warn("ENS not supported on this network - continuing without address list");
                    setRegisteredUsers([]);
                    return;
                } else {
                    throw addressError;
                }
            }

            // Fetch user profiles for all addresses
            const users = [];
            for (let userAddress of allAddresses) {
                const userDetails = await getUserDetails(userAddress);
                if (userDetails && userDetails.name !== 'Unregistered User' && userDetails.name !== 'Error loading') {
                    users.push({
                        address: userAddress,
                        name: userDetails.name,
                        email: userDetails.email || 'N/A',
                        phone: userDetails.phone || 'N/A',
                        physicalAddress: userDetails.physicalAddress || 'N/A',
                        registrationDate: new Date().toLocaleDateString(),
                        status: 'approved'
                    });
                }
            }
            
            console.log("Fetched registered users:", users);
            setRegisteredUsers(users);
        } catch (error) {
            if (error.code !== 'UNSUPPORTED_OPERATION' || error.operation !== 'getEnsAddress') {
                console.error("Failed to fetch registered users:", error);
            }
            setRegisteredUsers([]);
        }
    }, [contract, userProfileContract, getUserDetails]);

    // Fetch analytics data
    const fetchAnalytics = useCallback(async () => {
        if (!contract) return;
        try {
            const allTxIds = await contract.getPendingTransactions();
            
            let totalMints = 0;
            let totalTransfers = 0;
            let approved = 0;
            let rejected = 0;
            let pending = 0;
            const validatorSignatures = new Map();

            for (let txId of allTxIds) {
                const tx = await contract.getTransaction(txId);
                const signatureList = await contract.getTransactionSignatures(txId);
                
                if (Number(tx.txType) === 0) totalMints++;
                else if (Number(tx.txType) === 1) totalTransfers++;

                if (Number(tx.status) === 0) pending++;
                else if (Number(tx.status) === 1) approved++;
                else if (Number(tx.status) === 2) rejected++;

                // Count signatures per validator
                for (let sig of signatureList) {
                    validatorSignatures.set(sig.validator, (validatorSignatures.get(sig.validator) || 0) + 1);
                }
            }

            setAnalyticsData({
                totalTransactions: allTxIds.length,
                totalMints,
                totalTransfers,
                approved,
                rejected,
                pending,
                validatorSignatures: Object.fromEntries(validatorSignatures)
            });
        } catch (error) {
            console.error("Failed to fetch analytics:", error);
        }
    }, [contract]);

    // Fetch transaction history (approved, rejected, completed transactions)
    const fetchTransactionHistory = useCallback(async () => {
        if (!contract) return;
        try {
            const allTxIds = await contract.getPendingTransactions();
            const history = [];
            
            for (let txId of allTxIds) {
                const tx = await contract.getTransaction(txId);
                const signatureList = await contract.getTransactionSignatures(txId);
                
                // Show all transactions (not just pending)
                const initiatorDetails = await getUserDetails(tx.initiator);
                const targetOwnerDetails = tx.targetOwner ? await getUserDetails(tx.targetOwner) : null;
                
                history.push({
                    id: Number(txId),
                    txType: Number(tx.txType),
                    status: Number(tx.status),
                    parcelNumber: tx.parcelNumber || 'N/A',
                    location: tx.location || 'N/A',
                    area: tx.area ? Number(tx.area) : 0,
                    initiator: tx.initiator,
                    initiatorName: initiatorDetails?.name || 'Unknown',
                    targetOwner: tx.targetOwner,
                    targetOwnerName: targetOwnerDetails?.name || 'Unknown',
                    signatures: signatureList.length,
                    createdAt: tx.createdAt ? Number(tx.createdAt) : 0
                });
            }
            
            // Sort by date, most recent first
            history.sort((a, b) => b.createdAt - a.createdAt);
            setTransactionHistory(history);
        } catch (error) {
            console.error("Failed to fetch transaction history:", error);
        }
    }, [contract, getUserDetails]);

    useEffect(() => {
        if (activeTab === 'pending') {
            fetchPendingTransactions();
            const interval = setInterval(fetchPendingTransactions, 5000);
            return () => clearInterval(interval);
        } else if (activeTab === 'registeredUsers' && isAdmin) {
            fetchRegisteredUsers();
        } else if (activeTab === 'landOwners' && isAdmin) {
            fetchLandOwners();
        } else if (activeTab === 'analytics' && isAdmin) {
            fetchAnalytics();
        } else if (activeTab === 'history' && !isAdmin) {
            fetchTransactionHistory();
        }
    }, [activeTab, isAdmin, fetchPendingTransactions, fetchRegisteredUsers, fetchLandOwners, fetchAnalytics, fetchTransactionHistory]);

    // Fetch required approvals and calculate QBFT parameters
    useEffect(() => {
        const fetchRequiredApprovals = async () => {
            if (!contract) return;
            try {
                const required = await contract.requiredApprovals();
                setRequiredApprovals(Number(required));
                
                // Get validator count and calculate QBFT parameters
                try {
                    const bftInfo = await contract.getByzantineFaultTolerance();
                    const count = Number(bftInfo.validatorCount);
                    setValidatorCount(count);
                    
                    // Calculate QBFT parameters using the quorumSize from the contract
                    setQbftParameters({
                        validatorCount: count,
                        maxFaults: Number(bftInfo.maxFaults),
                        quorumSize: Number(bftInfo.quorumSize)
                    });
                } catch (e) {
                    console.log("Could not fetch QBFT parameters:", e);
                }
            } catch (error) {
                console.error("Failed to fetch required approvals:", error);
            }
        };
        
        fetchRequiredApprovals();
    }, [contract]);

    const handleApproveTransaction = async () => {
        if (!contract || !selectedForAction || !mnemonicPhrase.trim()) {
            setStatusMessage({ type: 'error', message: 'Please enter a signature/passphrase' });
            return;
        }

        setIsProcessing(true);
        try {
            const timestamp = Math.floor(Date.now() / 1000);
            
            // Generate hash of the signature document
            const signatureHash = generateSignatureHash(address, mnemonicPhrase, timestamp);
            
            // Store the full signature document off-chain
            await storeSignatureDocument(address, mnemonicPhrase, timestamp, selectedForAction.id);
            
            // Send only the hash to the blockchain (privacy-aware)
            const tx = await contract.approveTransaction(selectedForAction.id, signatureHash, {
                gasLimit: 300000,
                gasPrice: 0
            });
            await tx.wait();
            
            setStatusMessage({ 
                type: 'success', 
                message: 'Transaction approved! Signature stored securely off-chain.' 
            });
            setShowSignatureModal(false);
            setMnemonicPhrase('');
            setSelectedForAction(null);
            
            // Refresh pending transactions
            await fetchPendingTransactions();
        } catch (error) {
            console.error("Failed to approve transaction:", error);
            setStatusMessage({ type: 'error', message: `Failed to approve: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const handleRejectTransaction = async () => {
        if (!contract || !selectedForAction || !rejectReason.trim()) {
            setStatusMessage({ type: 'error', message: 'Please enter a rejection reason' });
            return;
        }

        setIsProcessing(true);
        try {
            const tx = await contract.rejectTransaction(selectedForAction.id, rejectReason, {
                gasLimit: 300000,
                gasPrice: 0
            });
            
            setStatusMessage({ type: 'info', message: 'Rejecting transaction...' });
            await tx.wait();
            
            setStatusMessage({ type: 'success', message: 'Transaction rejected' });
            setShowRejectModal(false);
            setRejectReason('');
            setSelectedForAction(null);
            await fetchPendingTransactions();
        } catch (error) {
            console.error("Failed to reject transaction:", error);
            setStatusMessage({ type: 'error', message: `Failed to reject: ${error.message}` });
        } finally {
            setIsProcessing(false);
        }
    };

    const getTransactionTypeLabel = (type) => {
        return type === 0 ? 'Land Mint' : 'Land Transfer';
    };

    const getStatusLabel = (status) => {
        const labels = { 0: 'Pending', 1: 'Approved', 2: 'Rejected' };
        return labels[status] || 'Unknown';
    };

    const getStatusColor = (status) => {
        const statusNum = Number(status);
        if (statusNum === 0) return 'bg-yellow-500';
        if (statusNum === 1) return 'bg-green-500';
        if (statusNum === 2) return 'bg-red-500';
        return 'bg-gray-500';
    };

    if (!isValidator && !isAdmin) {
        return null;
    }

    return (
        <div className={`fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-40 flex items-center justify-center p-4`}>
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col`}>
                
                {/* Header */}
                <div className={`${darkMode ? 'bg-gradient-to-r from-blue-900 to-purple-900' : 'bg-gradient-to-r from-blue-600 to-purple-600'} p-6 flex items-center justify-between`}>
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-white rounded-lg flex items-center justify-center">
                            <Icon name="shield-check" className="w-6 h-6 text-blue-600" />
                        </div>
                        <h2 className="text-2xl font-bold text-white">Validator Dashboard</h2>
                    </div>
                    <button onClick={onClose} className="text-white hover:bg-white hover:bg-opacity-20 p-2 rounded-lg">
                        ✕
                    </button>
                </div>

                {/* Tabs */}
                <div className={`flex border-b ${darkMode ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-gray-50'}`}>
                    <button
                        onClick={() => setActiveTab('pending')}
                        className={`flex-1 px-6 py-3 font-medium transition ${
                            activeTab === 'pending'
                                ? `${darkMode ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-500' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'}`
                                : `${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`
                        }`}
                    >
                        <div className="flex items-center justify-center gap-2">
                            <Icon name="clock" className="w-5 h-5" />
                            <span>Pending Approvals {pendingTransactions.length > 0 && <span className="ml-1 inline-block px-2 py-1 bg-red-500 text-white text-xs rounded-full">{pendingTransactions.length}</span>}</span>
                        </div>
                    </button>
                    
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab('registeredUsers')}
                            className={`flex-1 px-6 py-3 font-medium transition ${
                                activeTab === 'registeredUsers'
                                    ? `${darkMode ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-500' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'}`
                                    : `${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <Icon name="users" className="w-5 h-5" />
                                <span>Registered Users</span>
                            </div>
                        </button>
                    )}
                    
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab('landOwners')}
                            className={`flex-1 px-6 py-3 font-medium transition ${
                                activeTab === 'landOwners'
                                    ? `${darkMode ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-500' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'}`
                                    : `${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <Icon name="home" className="w-5 h-5" />
                                <span>Land Owners</span>
                            </div>
                        </button>
                    )}
                    
                    {isAdmin && (
                        <button
                            onClick={() => setActiveTab('analytics')}
                            className={`flex-1 px-6 py-3 font-medium transition ${
                                activeTab === 'analytics'
                                    ? `${darkMode ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-500' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'}`
                                    : `${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <Icon name="chart-bar" className="w-5 h-5" />
                                <span>Analytics</span>
                            </div>
                        </button>
                    )}
                    
                    {!isAdmin && (
                        <button
                            onClick={() => setActiveTab('history')}
                            className={`flex-1 px-6 py-3 font-medium transition ${
                                activeTab === 'history'
                                    ? `${darkMode ? 'bg-blue-900 text-blue-300 border-b-2 border-blue-500' : 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'}`
                                    : `${darkMode ? 'text-gray-400 hover:text-gray-300' : 'text-gray-600 hover:text-gray-800'}`
                            }`}
                        >
                            <div className="flex items-center justify-center gap-2">
                                <Icon name="history" className="w-5 h-5" />
                                <span>Transaction History</span>
                            </div>
                        </button>
                    )}
                </div>

                {/* Content */}
                <div className={`flex-1 overflow-y-auto p-6`}>
                    {activeTab === 'pending' && (
                        <div className="space-y-4">
                            {pendingTransactions.length === 0 ? (
                                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <Icon name="check-circle" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No pending transactions to approve</p>
                                </div>
                            ) : (
                                pendingTransactions.map((tx) => (
                                    <div key={tx.id} className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-start justify-between mb-3">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-2">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold text-white ${getStatusColor(tx.status)}`}>
                                                        {getTransactionTypeLabel(tx.txType)}
                                                    </span>
                                                    <span className={`px-3 py-1 rounded-full text-xs font-semibold ${Number(tx.status) === 0 ? 'bg-yellow-500' : Number(tx.status) === 1 ? 'bg-green-500' : 'bg-red-500'} text-white`}>
                                                        {getStatusLabel(tx.status)}
                                                    </span>
                                                </div>
                                                
                                                <details className={`cursor-pointer ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                                    <summary className="font-semibold flex items-center gap-2">
                                                        <Icon name="chevron-right" className="w-4 h-4" />
                                                        {Number(tx.txType) === 0 ? `Mint: ${tx.parcelNumber || 'N/A'}` : `Transfer: ${tx.parcelNumber || 'N/A'}`}
                                                    </summary>
                                                    
                                                    <div className="mt-3 pl-6 space-y-2 text-sm">
                                                        <p><strong>Location:</strong> {tx.location || 'N/A'}</p>
                                                        <p><strong>Area:</strong> {tx.area ? `${tx.area} sq meters` : 'N/A'}</p>
                                                        <p><strong>Initiator:</strong> {tx.initiatorName || 'Unknown'} <code className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({tx.initiator ? tx.initiator.slice(0, 10) : 'N/A'}...)</code></p>
                                                        {Number(tx.txType) === 0 && <p><strong>Target Owner:</strong> {tx.targetOwnerName || 'Unknown'} <code className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({tx.targetOwner ? tx.targetOwner.slice(0, 10) : 'N/A'}...)</code></p>}
                                                        {Number(tx.txType) === 1 && <p><strong>From:</strong> {tx.initiatorName || 'Unknown'} <code className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>({tx.transferFrom ? tx.transferFrom.slice(0, 10) : 'N/A'}...)</code></p>}
                                                        {Number(tx.txType) === 1 && <p><strong>To:</strong> <code className={darkMode ? 'text-yellow-400' : 'text-blue-600'}>{tx.transferTo ? tx.transferTo.slice(0, 10) : 'N/A'}...</code></p>}
                                                        
                                                        <div className="mt-3 pt-3 border-t border-gray-600">
                                                            <p className="font-semibold mb-2">Signatures: {tx.signatures ? tx.signatures.length : 0}/{requiredApprovals || 1}</p>
                                                            {tx.signatures && tx.signatures.map((sig, idx) => (
                                                                <div key={idx} className={`text-xs p-2 rounded mb-1 ${darkMode ? 'bg-green-900 text-green-200' : 'bg-green-100 text-green-800'}`}>
                                                                    <div>✓ Validator: {sig && sig.validator ? sig.validator.slice(0, 10) : 'N/A'}...</div>
                                                                    <div className="mt-1 truncate font-mono text-[10px]">
                                                                        Hash: {sig && sig.signatureHash ? sig.signatureHash.slice(0, 20) : 'N/A'}...
                                                                    </div>
                                                                    <div className={`text-[10px] mt-1 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                                                        Signed: {sig && sig.timestamp ? new Date(sig.timestamp * 1000).toLocaleString() : 'N/A'}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                </details>
                                            </div>
                                            
                                            {Number(tx.status) === 0 && (
                                                <div className="flex gap-2 ml-4">
                                                    <button
                                                        onClick={() => { setSelectedForAction(tx); setShowSignatureModal(true); }}
                                                        disabled={isProcessing}
                                                        className="px-3 py-1 bg-green-600 hover:bg-green-700 text-white rounded text-sm font-medium disabled:opacity-50"
                                                    >
                                                        ✓ Approve
                                                    </button>
                                                    <button
                                                        onClick={() => { setSelectedForAction(tx); setShowRejectModal(true); }}
                                                        disabled={isProcessing}
                                                        className="px-3 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-sm font-medium disabled:opacity-50"
                                                    >
                                                        ✕ Reject
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Registered Users Tab */}
                    {activeTab === 'registeredUsers' && (
                        <div className="space-y-4">
                            {registeredUsers.length === 0 ? (
                                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <Icon name="users" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No registered users yet</p>
                                </div>
                            ) : (
                                registeredUsers.map((user, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1">
                                                <h4 className={`font-semibold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>{user.name || 'N/A'}</h4>
                                                <code className={`text-xs ${darkMode ? 'text-yellow-400' : 'text-blue-600'}`}>{user.address ? user.address.slice(0, 15) : 'N/A'}...</code>
                                            </div>
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${user.status === 'approved' ? 'bg-green-500' : 'bg-yellow-500'} text-white`}>
                                                {user.status}
                                            </span>
                                        </div>
                                        <div className={`text-sm space-y-1 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <p><strong>Email:</strong> {user.email}</p>
                                            <p><strong>Phone:</strong> {user.phone}</p>
                                            <p><strong>Address:</strong> {user.physicalAddress}</p>
                                            <p><strong>Registered:</strong> {user.registrationDate}</p>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Land Owners Tab */}
                    {activeTab === 'landOwners' && isAdmin && (
                        <div className="space-y-4">
                            {allLandOwners.length === 0 ? (
                                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <Icon name="folder-open" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No land owners found</p>
                                </div>
                            ) : (
                                allLandOwners.map((owner, idx) => (
                                    <div key={idx} className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-center justify-between mb-3">
                                            <div className="flex-1">
                                                <h4 className={`font-semibold text-base ${darkMode ? 'text-white' : 'text-gray-900'}`}>{owner.name || 'N/A'}</h4>
                                                <code className={`text-xs ${darkMode ? 'text-yellow-400' : 'text-blue-600'}`}>{owner.address ? owner.address.slice(0, 15) : 'N/A'}...</code>
                                            </div>
                                            <span className={`px-2 py-1 rounded text-xs font-semibold ${owner.status === 'pending' ? 'bg-yellow-500' : 'bg-green-500'} text-white`}>
                                                {owner.lands.length} lands
                                            </span>
                                        </div>
                                        <div className={`text-sm space-y-1 mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                            <p><strong>Email:</strong> {owner.email || 'N/A'}</p>
                                            <p><strong>Phone:</strong> {owner.phone || 'N/A'}</p>
                                            <p><strong>Address:</strong> {owner.physicalAddress || 'N/A'}</p>
                                        </div>
                                        <div className={`border-t ${darkMode ? 'border-gray-600' : 'border-gray-300'} pt-2`}>
                                            <h5 className={`text-xs font-semibold mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>PROPERTIES ({owner.lands.length})</h5>
                                            <div className="space-y-1">
                                                {owner.lands.map((land, lidx) => (
                                                    <div key={lidx} className={`text-sm pl-2 py-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                                        • {land.parcelNumber} - {land.location} ({land.area} sq m)
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    )}

                    {/* Analytics Tab */}
                    {activeTab === 'analytics' && analyticsData && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-blue-900' : 'bg-blue-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>{analyticsData.totalTransactions}</div>
                                    <div className={`text-sm ${darkMode ? 'text-blue-400' : 'text-blue-700'}`}>Total Transactions</div>
                                </div>
                                
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-purple-900' : 'bg-purple-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}>{analyticsData.totalMints}</div>
                                    <div className={`text-sm ${darkMode ? 'text-purple-400' : 'text-purple-700'}`}>Land Mints</div>
                                </div>
                                
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-orange-900' : 'bg-orange-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-orange-300' : 'text-orange-600'}`}>{analyticsData.totalTransfers}</div>
                                    <div className={`text-sm ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>Transfers</div>
                                </div>
                                
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-green-900' : 'bg-green-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-green-300' : 'text-green-600'}`}>{analyticsData.approved}</div>
                                    <div className={`text-sm ${darkMode ? 'text-green-400' : 'text-green-700'}`}>Approved</div>
                                </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-yellow-900' : 'bg-yellow-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-yellow-300' : 'text-yellow-600'}`}>{analyticsData.pending}</div>
                                    <div className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-yellow-700'}`}>Pending</div>
                                </div>
                                
                                <div className={`p-4 rounded-lg text-center ${darkMode ? 'bg-red-900' : 'bg-red-100'}`}>
                                    <div className={`text-2xl font-bold ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{analyticsData.rejected}</div>
                                    <div className={`text-sm ${darkMode ? 'text-red-400' : 'text-red-700'}`}>Rejected</div>
                                </div>
                            </div>

                            <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}>
                                <h3 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Validator Signatures</h3>
                                <div className="space-y-2">
                                    {Object.entries(analyticsData.validatorSignatures).map(([validator, count]) => (
                                        <div key={validator} className="flex items-center justify-between">
                                            <code className={`text-sm ${darkMode ? 'text-yellow-400' : 'text-blue-600'}`}>{validator.slice(0, 15)}...</code>
                                            <span className={`px-3 py-1 rounded-full text-sm font-semibold bg-blue-500 text-white`}>{count} signatures</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Transaction History Tab */}
                    {activeTab === 'history' && (
                        <div className="space-y-3">
                            {transactionHistory.length === 0 ? (
                                <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                    <Icon name="inbox" className="w-12 h-12 mx-auto mb-2 opacity-50" />
                                    <p>No transaction history</p>
                                </div>
                            ) : (
                                transactionHistory.map((tx) => (
                                    <div key={tx.id} className={`p-4 rounded-lg border ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-200'}`}>
                                        <div className="flex items-start justify-between mb-2">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${tx.txType === 0 ? 'bg-blue-600' : 'bg-purple-600'}`}>
                                                        {tx.txType === 0 ? 'MINT' : 'TRANSFER'}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded text-xs font-semibold text-white ${
                                                        tx.status === 0 ? 'bg-yellow-600' : 
                                                        tx.status === 1 ? 'bg-green-600' : 
                                                        'bg-red-600'
                                                    }`}>
                                                        {tx.status === 0 ? 'PENDING' : tx.status === 1 ? 'APPROVED' : 'REJECTED'}
                                                    </span>
                                                </div>
                                                <h4 className={`font-semibold ${darkMode ? 'text-white' : 'text-gray-900'}`}>{tx.parcelNumber}</h4>
                                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>{tx.location}</p>
                                            </div>
                                            <div className={`text-right text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                                <p>{tx.area} m²</p>
                                                <p>{new Date(tx.createdAt * 1000).toLocaleDateString()}</p>
                                            </div>
                                        </div>
                                        
                                            <details className="mt-2">
                                                <summary className={`cursor-pointer text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-600'}`}>
                                                    Details
                                                </summary>
                                                <div className={`mt-2 p-3 rounded text-xs space-y-2 ${darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-100 text-gray-700'}`}>
                                                    <p><strong>ID:</strong> {tx.id}</p>
                                                    <p><strong>Initiator:</strong> {tx.initiatorName} <code className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>({tx.initiator?.slice(0, 10)}...)</code></p>
                                                    {tx.txType === 0 && <p><strong>Owner:</strong> {tx.targetOwnerName} <code className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>({tx.targetOwner?.slice(0, 10)}...)</code></p>}
                                                    <p><strong>Signatures:</strong> {tx.signatures}</p>
                                                    
                                                    {/* QBFT Consensus Status */}
                                                    {qbftParameters && (
                                                        <div className={`mt-2 pt-2 border-t ${darkMode ? 'border-gray-700' : 'border-gray-300'}`}>
                                                            <p className="font-semibold mb-1">🔐 QBFT Consensus:</p>
                                                            {(() => {
                                                                const progress = getTransactionProgress(tx, qbftParameters.quorumSize);
                                                                const safety = analyzeConsensusSafety(tx, qbftParameters);
                                                                return (
                                                                    <div className="space-y-1">
                                                                        <p>Phase: <strong>{progress.currentPhaseLabel}</strong> ({progress.phaseIndex + 1}/{progress.totalPhases})</p>
                                                                        <div className="w-full bg-gray-600 rounded h-1.5 mt-1">
                                                                            <div 
                                                                                className="bg-blue-500 h-1.5 rounded transition-all"
                                                                                style={{ width: `${progress.progress}%` }}
                                                                            />
                                                                        </div>
                                                                        <p>Prepare: {progress.prepareProgress.current}/{progress.prepareProgress.required} ✓</p>
                                                                        <p>Commit: {progress.commitProgress.current}/{progress.commitProgress.required} ✓</p>
                                                                        <p className={`text-xs ${
                                                                            safety.isQuorumReached ? 'text-green-400' : 
                                                                            safety.quorumReached >= Math.ceil(qbftParameters.quorumSize / 2) ? 'text-yellow-400' : 
                                                                            'text-orange-400'
                                                                        }`}>
                                                                            Safety: <strong>{safety.safety.level}</strong>
                                                                        </p>
                                                                    </div>
                                                                );
                                                            })()}
                                                        </div>
                                                    )}
                                                </div>
                                            </details>
                                    </div>
                                ))
                            )}
                        </div>
                    )}
                </div>
            </div>

            {/* Signature Approval Modal */}
            {showSignatureModal && selectedForAction && (
                <div className={`fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl p-6 max-w-md w-full`}>
                        <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Digital Signature</h3>
                        
                        <div className={`text-xs p-3 rounded mb-4 ${darkMode ? 'bg-blue-900 bg-opacity-30 border border-blue-700' : 'bg-blue-100 border border-blue-300'}`}>
                            <p className={`mb-1 font-semibold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>🔒 Privacy-Aware</p>
                            <p className={darkMode ? 'text-blue-200' : 'text-blue-600'}>
                                Your signature is hashed on-chain for privacy. The full document is stored securely off-chain.
                            </p>
                        </div>
                        
                        <div className="mb-4 space-y-2">
                            <p className={`text-sm mb-2 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                Enter your digital signature to sign this transaction:
                            </p>
                            <div className={`text-xs p-3 rounded space-y-1 ${darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-100 text-gray-600'}`}>
                                <p><strong>Transaction ID:</strong> {selectedForAction?.id}</p>
                                <p><strong>Type:</strong> {selectedForAction?.txType === 0 ? 'Land Mint' : 'Land Transfer'}</p>
                                <p><strong>Parcel:</strong> {selectedForAction?.parcelNumber}</p>
                                <p><strong>Owner:</strong> {selectedForAction?.targetOwnerName || selectedForAction?.targetOwner?.slice(0, 12)}</p>
                                <p><strong>Approvals:</strong> {selectedForAction?.signatures?.length || 0}/{requiredApprovals}</p>
                            </div>
                        </div>

                        <textarea
                            value={mnemonicPhrase}
                            onChange={(e) => setMnemonicPhrase(e.target.value)}
                            placeholder="Enter your mnemonic phrase, passphrase, or signature (kept off-chain)"
                            className={`w-full px-4 py-2 rounded-lg border mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                                darkMode 
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }`}
                            rows="4"
                        />

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowSignatureModal(false); setMnemonicPhrase(''); }}
                                className={`flex-1 px-4 py-2 rounded-lg transition ${
                                    darkMode
                                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                }`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleApproveTransaction}
                                disabled={isProcessing || !mnemonicPhrase.trim()}
                                className="flex-1 px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                            >
                                {isProcessing ? 'Signing...' : 'Sign & Approve'}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Rejection Modal */}
            {showRejectModal && (
                <div className={`fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm z-50 flex items-center justify-center p-4`}>
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl shadow-2xl p-6 max-w-md w-full`}>
                        <h3 className={`text-xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-900'}`}>Reject Transaction</h3>
                        
                        <p className={`text-sm mb-3 ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                            Please provide a reason for rejecting this transaction:
                        </p>

                        <textarea
                            value={rejectReason}
                            onChange={(e) => setRejectReason(e.target.value)}
                            placeholder="Enter rejection reason..."
                            className={`w-full px-4 py-2 rounded-lg border mb-4 focus:outline-none focus:ring-2 focus:ring-red-500 ${
                                darkMode 
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' 
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                            }`}
                            rows="3"
                        />

                        <div className="flex gap-2">
                            <button
                                onClick={() => { setShowRejectModal(false); setRejectReason(''); }}
                                className={`flex-1 px-4 py-2 rounded-lg transition ${
                                    darkMode
                                        ? 'bg-gray-700 hover:bg-gray-600 text-white'
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                }`}
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleRejectTransaction}
                                disabled={isProcessing || !rejectReason.trim()}
                                className="flex-1 px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition font-medium disabled:opacity-50"
                            >
                                {isProcessing ? 'Rejecting...' : 'Reject'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ValidatorDashboard;
