// src/App.js

import React, { useState, useEffect, useCallback } from 'react';
import { ethers } from 'ethers';
import { CONTRACT_ADDRESS, CONTRACT_ABI, USER_PROFILE_ADDRESS, USER_PROFILE_ABI } from './constants';
import Icon from './components/Icons';
import ValidatorDashboard from './components/ValidatorDashboard';
import RegistrationModal from './components/RegistrationModal';
// LMBSPanel was removed during the GovTech redesign. The citizen-facing
// surfaces live under src/govtech/* now; this file remains as the legacy
// operator / QBFT validator console mounted at /legacy/admin.

function App() {
    // --- Application State ---
    const [provider, setProvider] = useState(null);
    const [signer, setSigner] = useState(null);
    const [contract, setContract] = useState(null);
    const [yourDigitalAddress, setYourDigitalAddress] = useState(null);
    const [officialRegistrarAddress, setOfficialRegistrarAddress] = useState(null);
    const [isOfficialRegistrar, setIsOfficialRegistrar] = useState(false);
    const [statusMessage, setStatusMessage] = useState({ type: '', message: '' });
    const [isProcessing, setIsProcessing] = useState(false);
    const [hasMetaMask, setHasMetaMask] = useState(true);

    const [ownedLandTitles, setOwnedLandTitles] = useState([]);
    const [pendingMintRequests, setPendingMintRequests] = useState([]);
    const MAX_LAND_IDS_TO_FETCH = 20;
    const BESU_CHAIN_ID = 2026;
    const BESU_CHAIN_ID_HEX = "0x7ea";
    const BESU_RPC_URL = "http://127.0.0.1:8560";

    const [qbftIsValidator, setQbftIsValidator] = useState(false);
    const [showAbout, setShowAbout] = useState(false);
    const [darkMode, setDarkMode] = useState(true);
    const [showValidatorDashboard, setShowValidatorDashboard] = useState(false);
    const [pendingTransactionCount, setPendingTransactionCount] = useState(0);
    const [isAdmin, setIsAdmin] = useState(false);

    // --- User Profile State ---
    const [userProfileContract, setUserProfileContract] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [showSignUp, setShowSignUp] = useState(false);
    const [showProfileUpdate, setShowProfileUpdate] = useState(false);
    const [hasPendingUpdate, setHasPendingUpdate] = useState(false);
    const [isAuthority, setIsAuthority] = useState(false);

    // --- Admin & Land Registration State ---
    const [showAdminPanel, setShowAdminPanel] = useState(false);
    const [showLandForm, setShowLandForm] = useState(false);
    const [validators, setValidators] = useState([]);
    const [requiredApprovals, setRequiredApprovals] = useState(3);
    const [parcelNumberInput, setParcelNumberInput] = useState('');
    const [parcelNumberAvailable, setParcelNumberAvailable] = useState(null);
    const [checkingParcelNumber, setCheckingParcelNumber] = useState(false);

    // --- Land Ownership & Transfer State ---
    const [selectedLandId, setSelectedLandId] = useState(null);
    const [showTransferForm, setShowTransferForm] = useState(false);

    // --- Validator Check ---
    const checkValidator = useCallback(async () => {
        if (!contract || !yourDigitalAddress) return;
        try {
            const isVal = await contract.isValidator(yourDigitalAddress);
            setQbftIsValidator(isVal);

            // Check if admin
            const adminCheck = await contract.isAdmin(yourDigitalAddress);
            setIsAdmin(adminCheck);

            // Fetch pending transactions for validator
            if (isVal) {
                const pending = await contract.getPendingTransactionsForValidator(yourDigitalAddress);
                setPendingTransactionCount(pending.length);
            }
        } catch (e) {
            console.error("Validator check error:", e);
        }
    }, [contract, yourDigitalAddress]);

    // --- Check Parcel Number Availability ---
    const checkParcelAvailability = useCallback(async (parcelNumber) => {
        if (!contract || !parcelNumber) {
            setParcelNumberAvailable(null);
            return;
        }
        setCheckingParcelNumber(true);
        try {
            const isAvailable = await contract.isParcelNumberAvailable(parcelNumber);
            setParcelNumberAvailable(isAvailable);
        } catch (error) {
            console.error("Error checking parcel availability:", error);
            setParcelNumberAvailable(null);
        } finally {
            setCheckingParcelNumber(false);
        }
    }, [contract]);

    // Update parcel number and check availability
    const handleParcelNumberChange = useCallback((value) => {
        setParcelNumberInput(value);
        checkParcelAvailability(value);
    }, [checkParcelAvailability]);

    useEffect(() => {
        checkValidator();
    }, [checkValidator]);

    // --- Check MetaMask ---
    useEffect(() => {
        setHasMetaMask(typeof window.ethereum !== 'undefined' && window.ethereum.isMetaMask);
    }, []);

    // --- Wallet Connection ---
    useEffect(() => {
        if (CONTRACT_ADDRESS === "0xd3b9A9DFf4e17859f19fc428F82b21873e930165") {
            setStatusMessage({ type: 'error', message: "ERROR: Please replace 'YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE' with your actual contract address in src/constants/index.js" });
        }
    }, []);

    // Reset parcel number validation when form is closed/opened
    useEffect(() => {
        if (!showLandForm) {
            setParcelNumberInput('');
            setParcelNumberAvailable(null);
            setCheckingParcelNumber(false);
        }
    }, [showLandForm]);

    // Get any user's profile details by address
    const getUserProfileByAddress = useCallback(async (userAddress) => {
        if (!userAddress) return null;
        
        try {
            // First try to fetch from off-chain storage
            const response = await fetch(`http://localhost:5000/api/profiles/${userAddress}`);
            if (response.ok) {
                const profile = await response.json();
                return {
                    address: userAddress,
                    name: profile.name || 'Unknown',
                    email: profile.email || ''
                };
            }
        } catch (err) {
            console.warn(`Could not fetch off-chain profile for ${userAddress}, falling back to on-chain:`, err.message);
        }

        // Fallback to on-chain profile contract
        if (!userProfileContract) return { address: userAddress, name: 'Unknown' };
        
        try {
            const profile = await userProfileContract.getProfile(userAddress);
            if (profile && profile.isRegistered) {
                return {
                    address: userAddress,
                    name: profile.name || 'Unknown',
                    email: profile.email || ''
                };
            }
            return { address: userAddress, name: 'Unregistered User' };
        } catch (error) {
            console.error(`Failed to fetch profile for ${userAddress}:`, error);
            return { address: userAddress, name: 'Error loading' };
        }
    }, [userProfileContract]);

    const ensureBesuNetwork = useCallback(async () => {
        if (!window.ethereum) return false;
        try {
            const chainId = await window.ethereum.request({ method: 'eth_chainId' });
            if (chainId === BESU_CHAIN_ID_HEX) return true;

            try {
                await window.ethereum.request({
                    method: 'wallet_switchEthereumChain',
                    params: [{ chainId: BESU_CHAIN_ID_HEX }]
                });
                return true;
            } catch (switchError) {
                if (switchError.code === 4902) {
                    await window.ethereum.request({
                        method: 'wallet_addEthereumChain',
                        params: [{
                            chainId: BESU_CHAIN_ID_HEX,
                            chainName: 'Besu QBFT',
                            rpcUrls: [BESU_RPC_URL],
                            nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 }
                        }]
                    });
                    return true;
                }
                console.warn('Failed to switch network:', switchError);
                return false;
            }
        } catch (error) {
            console.warn('Could not verify Besu network:', error);
            return false;
        }
    }, [BESU_CHAIN_ID_HEX, BESU_RPC_URL]);

    const connectDigitalWallet = useCallback(async () => {
        if (CONTRACT_ADDRESS === "YOUR_DEPLOYED_CONTRACT_ADDRESS_HERE") {
            setStatusMessage({ type: 'error', message: "ERROR: Please update CONTRACT_ADDRESS in src/constants/index.js before connecting your wallet." });
            return;
        }
        if (!window.ethereum || !window.ethereum.isMetaMask) {
            setHasMetaMask(false);
            setStatusMessage({ type: 'error', message: 'MetaMask is not installed or detected. Please install and enable MetaMask to use this dApp.' });
            return;
        }

        const switched = await ensureBesuNetwork();
        if (!switched) {
            setStatusMessage({ type: 'error', message: 'Please switch MetaMask to the Besu network and reconnect.' });
            return;
        }

        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Connecting your digital wallet... Please approve in MetaMask.' });
        try {
            const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
            const selectedAccount = accounts[0];
            setYourDigitalAddress(selectedAccount);

            // Create provider with ENS disabled (Besu QBFT doesn't support ENS)
            const currentProvider = new ethers.BrowserProvider(window.ethereum);
            setProvider(currentProvider);

            const currentSigner = await currentProvider.getSigner();
            setSigner(currentSigner);

            const contractInstance = new ethers.Contract(CONTRACT_ADDRESS, CONTRACT_ABI, currentSigner);
            setContract(contractInstance);

            if (USER_PROFILE_ADDRESS && USER_PROFILE_ABI && USER_PROFILE_ADDRESS !== "YOUR_USER_PROFILE_CONTRACT_ADDRESS_HERE") {
            const userProfileInstance = new ethers.Contract(USER_PROFILE_ADDRESS, USER_PROFILE_ABI, currentSigner);
            setUserProfileContract(userProfileInstance);
            await debugContract(userProfileInstance, selectedAccount);
        } else {
            console.warn("User Profile contract not configured properly");
            setStatusMessage({ type: 'warning', message: 'User profile features are not available. Please check contract configuration.' });
        }
            setStatusMessage({ type: 'success', message: `Digital wallet connected: ${selectedAccount.substring(0, 6)}...${selectedAccount.substring(38)}` });
        } catch (error) {
            console.error("Failed to connect wallet:", error);
            setStatusMessage({ type: 'error', message: `Failed to connect wallet: ${error.message || error.reason}` });
            setYourDigitalAddress(null);
            setProvider(null);
            setSigner(null);
            setContract(null);
            setUserProfileContract(null);
        } finally {
            setIsProcessing(false);
        }
    }, []);

    const fetchBlockchainInfo = useCallback(async () => {
        if (!contract || !yourDigitalAddress) {
            console.log("Skipping fetchBlockchainInfo - missing contract or address");
            return;
        }
        console.log("Fetching blockchain info for:", yourDigitalAddress);
        try {
            console.log("Attempting to call contract.owner()...");
            console.log("Contract instance:", contract);
            console.log("Contract address:", contract?.address);
            console.log("Available methods:", Object.getOwnPropertyNames(Object.getPrototypeOf(contract)).filter(m => !m.startsWith('_')));

            const ownerAddress = await contract.owner();
            console.log("✓ Contract owner:", ownerAddress);
            setOfficialRegistrarAddress(ownerAddress.toLowerCase());
            if (ownerAddress.toLowerCase() === yourDigitalAddress.toLowerCase()) {
                setIsOfficialRegistrar(true);
            } else {
                setIsOfficialRegistrar(false);
            }

            const ownedTitles = [];
            console.log("Scanning tokens from 0 to", MAX_LAND_IDS_TO_FETCH);
            let consecutiveErrors = 0;

            for (let i = 0; i < MAX_LAND_IDS_TO_FETCH; i++) {
                try {
                    const landOwner = await contract.ownerOf(i);
                    consecutiveErrors = 0; // Reset error counter on success
                    console.log(`✓ Token ${i} owner:`, landOwner);
                    if (landOwner.toLowerCase() === yourDigitalAddress.toLowerCase()) {
                        console.log(`  → This token is owned by current user!`);
                        const details = await contract.getLandDetails(i);
                        console.log(`Found owned land ${i}:`, details);
                        ownedTitles.push({
                            id: i,
                            parcelNumber: details[0],
                            location: details[1],
                            area: details[2].toString(),
                            owner: landOwner
                        });
                    }
                } catch (error) {
                    consecutiveErrors++;
                    console.log(`ℹ️ Token ${i} not found - Error: ${error.message}`);

                    // If we've had multiple consecutive errors, tokens probably don't exist yet
                    if (consecutiveErrors > 3) {
                        console.log(`⚠️ Breaking token scan - ${consecutiveErrors} consecutive errors suggest no more tokens exist`);
                        break;
                    }
                }
            }
            console.log("✅ Total owned lands found:", ownedTitles.length, ownedTitles);
            setOwnedLandTitles(ownedTitles);

            // Try to fetch required approvals if available
            try {
                const approvals = await contract.requiredApprovals();
                console.log("Required approvals:", approvals);
                setRequiredApprovals(Number(approvals));
            } catch (error) {
                console.log("Could not fetch requiredApprovals:", error.message);
            }

            // Fetch pending mint requests
            try {
                console.log("🔄 Attempting to fetch pending transactions...");
                const allPending = await contract.getPendingTransactions();
                console.log("📋 Pending transaction IDs:", Array.from(typeof allPending === 'string' ? [] : allPending || []));

                const requiredApprovalsCount = await contract.requiredApprovals();
                console.log("✅ Required approvals count:", requiredApprovalsCount);

                const pendingMints = [];

                // Handle both array and Proxy objects
                const pendingArray = Array.isArray(allPending) ? allPending : Object.keys(allPending || {}).filter(k => !k.startsWith('_'));
                console.log(`Processing ${pendingArray.length} pending transaction(s)`);

                for (let txId of pendingArray) {
                    try {
                        console.log(`  Fetching transaction ID: ${txId}`);
                        const tx = await contract.getTransaction(txId);
                        console.log(`  ✓ Transaction ${txId}:`, tx);

                        // Check if it's a MINT type and PENDING status
                        // txType: 0 = MINT, 1 = TRANSFER
                        // status: 0 = PENDING, 1 = APPROVED, 2 = REJECTED
                        const txType = Number(tx.txType || 0);
                        const txStatus = Number(tx.status || 0);
                        console.log(`    Type: ${txType}, Status: ${txStatus}`);

                        if (txType === 0 && txStatus === 0) {
                            // Try to fetch detailed land info if we have a landId
                            let parcelNumber = tx.parcelNumber || 'N/A';
                            let location = tx.location || 'N/A';
                            let area = tx.area ? tx.area.toString() : '0';

                            try {
                                // Try to get details from contract if we have a landId
                                if (tx.landId !== undefined && tx.landId !== null) {
                                    const details = await contract.getLandDetails(Number(tx.landId));
                                    console.log(`    → Fetched land details for ID ${tx.landId}:`, details);
                                    parcelNumber = details[0] || parcelNumber;
                                    location = details[1] || location;
                                    area = details[2] ? details[2].toString() : area;
                                }
                            } catch (detailError) {
                                console.log(`    ℹ️ Could not fetch land details, using transaction data:`, detailError.message);
                            }

                            // Fetch profile names for targetOwner and initiator
                            let targetOwnerName = 'Unknown';
                            let initiatorName = 'Unknown';

                            try {
                                if (tx.targetOwner) {
                                    const targetProfile = await getUserProfileByAddress(tx.targetOwner);
                                    targetOwnerName = targetProfile?.name || `${tx.targetOwner.slice(0, 6)}...${tx.targetOwner.slice(-4)}`;
                                    console.log(`    → Target owner name: ${targetOwnerName}`);
                                }
                            } catch (profileError) {
                                console.log(`    ℹ️ Could not fetch target owner profile:`, profileError.message);
                            }

                            try {
                                if (tx.initiator) {
                                    const initiatorProfile = await getUserProfileByAddress(tx.initiator);
                                    initiatorName = initiatorProfile?.name || `${tx.initiator.slice(0, 6)}...${tx.initiator.slice(-4)}`;
                                    console.log(`    → Initiator name: ${initiatorName}`);
                                }
                            } catch (profileError) {
                                console.log(`    ℹ️ Could not fetch initiator profile:`, profileError.message);
                            }

                            pendingMints.push({
                                id: Number(txId),
                                parcelNumber: parcelNumber,
                                location: location,
                                area: area,
                                targetOwner: tx.targetOwner,
                                targetOwnerName: targetOwnerName,
                                initiator: tx.initiator,
                                initiatorName: initiatorName,
                                signatures: Number(tx.signatures || 0),
                                requiredApprovals: Number(requiredApprovalsCount),
                                createdAt: tx.createdAt ? new Date(Number(tx.createdAt) * 1000) : new Date()
                            });
                            console.log(`    → Added to pending mints list!`);
                        }
                    } catch (txError) {
                        console.error(`❌ Could not fetch transaction ${txId}:`, txError.message);
                    }
                }
                console.log(`📊 Total pending mints found: ${pendingMints.length}`, pendingMints);
                setPendingMintRequests(pendingMints);
            } catch (error) {
                console.log("Could not fetch pending transactions (this is normal if method doesn't exist):", error.message);
            }
        } catch (error) {
            console.error("❌ CRITICAL ERROR in fetchBlockchainInfo:");
            console.error("Error name:", error.name);
            console.error("Error code:", error.code);
            console.error("Error message:", error.message);
            console.error("Full error:", error);
            // Check if it's a contract method issue
            if (error.code === 'CALL_EXCEPTION') {
                console.error("⚠️ Contract call failed - check CONTRACT_ADDRESS and CONTRACT_ABI");
            }
        }
    }, [contract, yourDigitalAddress]);

    // --- User Profile Functions ---
    const checkUserProfile = useCallback(async () => {
        if (!userProfileContract || !yourDigitalAddress) return;
        try {
            const profile = await userProfileContract.getProfile(yourDigitalAddress);
            const isRegistered = profile[5]; // isRegistered
            if (isRegistered) {
                setUserProfile({
                    name: profile[0],
                    email: profile[1],
                    phone: profile[2],
                    physicalAddress: profile[3],
                    dateOfBirth: new Date(Number(profile[4]) * 1000).toLocaleDateString(),
                    registrationTimestamp: new Date(Number(profile[6]) * 1000).toLocaleDateString()
                });
                setShowSignUp(false);
            } else {
                setUserProfile(null);
                setShowSignUp(true);
            }

            try {
                const pending = await userProfileContract.hasPendingUpdate(yourDigitalAddress);
                setHasPendingUpdate(pending);
            } catch (pendingError) {
                if (pendingError.code === 'UNSUPPORTED_OPERATION' && pendingError.operation === 'getEnsAddress') {
                    // Ignore ENS errors - expected on Besu
                } else {
                    throw pendingError;
                }
            }

            try {
                const authority = await userProfileContract.isAuthority(yourDigitalAddress);
                setIsAuthority(authority);
            } catch (authorityError) {
                if (authorityError.code === 'UNSUPPORTED_OPERATION' && authorityError.operation === 'getEnsAddress') {
                    // Ignore ENS errors - expected on Besu
                } else {
                    throw authorityError;
                }
            }
        } catch (error) {
            if (error.code !== 'UNSUPPORTED_OPERATION' || error.operation !== 'getEnsAddress') {
                console.error("Failed to check user profile:", error);
            }
        }
    }, [userProfileContract, yourDigitalAddress]);

    const registerProfile = useCallback(async (profileData) => {
        if (!userProfileContract) {
            console.error("User profile contract not initialized");
            setStatusMessage({ type: 'error', message: 'Profile contract not ready. Please reconnect wallet.' });
            return;
        }
        
        if (!signer || !yourDigitalAddress || !provider) {
            setStatusMessage({ type: 'error', message: 'Wallet not properly connected.' });
            return;
        }
        
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Registering your profile...' });
        
        try {
            const dobTimestamp = Math.floor(new Date(profileData.dateOfBirth).getTime() / 1000);
            
            // Standard contract call instead of manual signing
            const tx = await userProfileContract.registerProfile(
                profileData.name,
                profileData.email,
                profileData.phone,
                profileData.physicalAddress,
                dobTimestamp,
                {
                    gasLimit: 500000,
                    gasPrice: 0,
                    type: 0 // Force legacy transaction type
                }
            );
            
            setStatusMessage({ type: 'info', message: `Transaction submitted: ${tx.hash.substring(0, 10)}... Waiting for confirmation...` });
            
            // Wait for confirmation
            const receipt = await tx.wait(1);
            console.log("Transaction confirmed in block:", receipt.blockNumber);
            
            if (receipt.status === 1) {
                // Store off-chain profile data
                try {
                    setStatusMessage({ type: 'info', message: 'Storing profile data off-chain...' });
                    const offChainResponse = await fetch('http://localhost:5000/api/profiles/store', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            address: yourDigitalAddress,
                            name: profileData.name,
                            email: profileData.email,
                            phone: profileData.phone,
                            physicalAddress: profileData.physicalAddress,
                            dateOfBirth: profileData.dateOfBirth
                        })
                    });
                    
                    if (!offChainResponse.ok) {
                        console.warn('Backend storage failed, but blockchain registration was successful.');
                    }
                } catch (apiError) {
                    console.error('Failed to store off-chain profile:', apiError);
                    setStatusMessage({ type: 'warning', message: 'Profile saved to blockchain, but off-chain storage failed. Please check if backend server is running.' });
                }

                setStatusMessage({ type: 'success', message: 'Profile registered successfully!' });
            } else {
                throw new Error('Transaction failed');
            }
            
            // Refresh profile data
            await checkUserProfile();
            
        } catch (error) {
            console.error("Failed to register profile:", error);
            
            // Extract nested error message if possible
            const errorMessage = error.error?.message || error.message || "";
            
            if (errorMessage.includes('Failed to fetch') || error.code === 'NETWORK_ERROR') {
                setStatusMessage({ 
                    type: 'error', 
                    message: 'Network Error: Cannot reach Besu node. Please ensure nodes are running, MetaMask is on the correct network, and try resetting your MetaMask account (Settings > Advanced > Clear activity tab data).' 
                });
            } else if (error.code === 'ACTION_REJECTED') {
                setStatusMessage({ 
                    type: 'error', 
                    message: 'Transaction was rejected in MetaMask.' 
                });
            } else if (errorMessage.includes('eth_sendTransaction')) {
                setStatusMessage({ 
                    type: 'error', 
                    message: 'Besu RPC error: Make sure your Besu node has HTTP JSON-RPC enabled and is accepting transactions. Check that gas price is set to 0.' 
                });
            } else {
                setStatusMessage({ 
                    type: 'error', 
                    message: `Failed to register profile: ${error.reason || error.message || 'Unknown error'}` 
                });
            }
        } finally {
            setIsProcessing(false);
        }
    }, [userProfileContract, signer, provider, yourDigitalAddress, checkUserProfile]);
const debugContract = useCallback(async (instance, address) => {
    const contractToDebug = instance || userProfileContract;
    const addressToUse = address || yourDigitalAddress;
    
    if (!contractToDebug) {
        console.error("❌ userProfileContract is NULL");
        return;
    }
    
    if (!addressToUse) {
        console.warn("⚠️ No address available for debug check");
        return;
    }
    
    console.log("✅ userProfileContract exists");
    console.log("📋 Contract Address:", contractToDebug.target || contractToDebug.address);
    
    // Try to call a view function to test connection
    try {
        const testCall = await contractToDebug.getProfile(addressToUse);
        console.log("✅ Contract is reachable, getProfile returned:", testCall);
    } catch (err) {
        console.error("❌ Contract call failed:", err);
    }
}, [userProfileContract, yourDigitalAddress]);
    const requestProfileUpdate = useCallback(async (profileData) => {
        if (!userProfileContract) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Requesting profile update...' });
        try {
            const dobTimestamp = Math.floor(new Date(profileData.dateOfBirth).getTime() / 1000);
            const tx = await userProfileContract.requestProfileUpdate(
                profileData.name,
                profileData.email,
                profileData.phone,
                profileData.physicalAddress,
                dobTimestamp,
                {
                    gasLimit: 300000,
                    gasPrice: 0
                }
            );
            await tx.wait();
            setStatusMessage({ type: 'success', message: 'Profile update requested! Waiting for authority approval.' });
            await checkUserProfile();
        } catch (error) {
            console.error("Failed to request profile update:", error);
            setStatusMessage({ type: 'error', message: `Failed to request update: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [userProfileContract, checkUserProfile]);

    const approveUpdate = useCallback(async (userAddress) => {
        if (!userProfileContract) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Approving profile update...' });
        try {
            const tx = await userProfileContract.approveUpdate(userAddress, {
                gasLimit: 300000,
                gasPrice: ethers.parseUnits("10", "gwei")
            });
            await tx.wait();
            setStatusMessage({ type: 'success', message: 'Profile update approved!' });
            await checkUserProfile();
        } catch (error) {
            console.error("Failed to approve update:", error);
            setStatusMessage({ type: 'error', message: `Failed to approve update: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [userProfileContract, checkUserProfile]);

    // --- Admin/QBFT Functions ---
    const fetchValidators = useCallback(async () => {
        if (!contract || !yourDigitalAddress) return;
        try {
            // Fetch current validators info from contract
            // For now, we'll keep track through the contract state
        } catch (error) {
            console.error("Failed to fetch validators:", error);
        }
    }, [contract, yourDigitalAddress]);

    const addValidator = useCallback(async (validatorAddress) => {
        if (!contract || !isOfficialRegistrar) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Adding new validator...' });
        try {
            const tx = await contract.addValidator(validatorAddress, {
                gasLimit: 300000,
                gasPrice: ethers.parseUnits("10", "gwei")
            });
            await tx.wait();
            setStatusMessage({ type: 'success', message: `Validator ${validatorAddress.substring(0, 6)}...${validatorAddress.substring(38)} added successfully!` });
            setShowAdminPanel(false);
        } catch (error) {
            console.error("Failed to add validator:", error);
            setStatusMessage({ type: 'error', message: `Failed to add validator: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [contract, isOfficialRegistrar]);

    const proposeLandMint = useCallback(async (ownerAddress, parcelNumber, location, area) => {
        if (!contract || !qbftIsValidator) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Proposing land mint (QBFT consensus)...' });
        try {
            // eslint-disable-next-line no-undef
            const tx = await contract.requestMintLand(ownerAddress, parcelNumber, location, Number(area), {
                gasLimit: 500000,
                gasPrice: ethers.parseUnits("10", "gwei")
            });
            await tx.wait();

            // Store land title off-chain
            try {
                await fetch('http://localhost:5000/api/titles/store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parcelNumber,
                        location,
                        area,
                        owner: ownerAddress,
                        additionalDetails: 'Proposed by Validator'
                    })
                });
            } catch (err) {
                console.error('Failed to store off-chain title:', err);
            }

            setStatusMessage({ type: 'success', message: 'Land mint proposed! Waiting for validator approvals...' });
            setShowLandForm(false);
            await fetchBlockchainInfo();
        } catch (error) {
            console.error("Failed to propose land mint:", error);
            setStatusMessage({ type: 'error', message: `Failed to propose land mint: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [contract, qbftIsValidator, fetchBlockchainInfo]);

    // Land owner request for new land mint
    const requestLandMintAsOwner = useCallback(async (parcelNumber, location, area) => {
        if (!contract || !yourDigitalAddress) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Requesting land mint... This will be reviewed by validators.' });
        try {
            // Use requestMintLand with the current user's address as the owner
            // eslint-disable-next-line no-undef
            const tx = await contract.requestMintLand(yourDigitalAddress, parcelNumber, location, Number(area), {
                gasLimit: 500000,
                gasPrice: ethers.parseUnits("10", "gwei")
            });
            await tx.wait();

            // Store land title off-chain
            try {
                await fetch('http://localhost:5000/api/titles/store', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        parcelNumber,
                        location,
                        area,
                        owner: yourDigitalAddress,
                        additionalDetails: 'Requested by Owner'
                    })
                });
            } catch (err) {
                console.error('Failed to store off-chain title:', err);
            }

            setStatusMessage({ type: 'success', message: 'Land mint request submitted! Validators will review it.' });
            setShowLandForm(false);
            await fetchBlockchainInfo();
        } catch (error) {
            console.error("Failed to request land mint:", error);
            setStatusMessage({ type: 'error', message: `Failed to request land mint: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [contract, yourDigitalAddress, fetchBlockchainInfo]);

    // --- Land Transfer Functions ---
    const proposeLandTransfer = useCallback(async (tokenId, recipientAddress) => {
        if (!contract || !yourDigitalAddress) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Requesting land transfer (requires validator approval)...' });
        try {
            const tx = await contract.requestTransferLand(tokenId, recipientAddress, {
                gasLimit: 500000,
                gasPrice: ethers.parseUnits("10", "gwei")
            });
            await tx.wait();
            setStatusMessage({ type: 'success', message: 'Land transfer request submitted! Validators will review and approve it.' });
            setShowTransferForm(false);
            setSelectedLandId(null);
            await fetchBlockchainInfo();
        } catch (error) {
            console.error("Failed to request land transfer:", error);
            setStatusMessage({ type: 'error', message: `Failed to request transfer: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [contract, yourDigitalAddress, fetchBlockchainInfo]);

    // Revoke transfer consent
    const revokeTransferConsent = useCallback(async (tokenId) => {
        if (!contract || !yourDigitalAddress) return;
        setIsProcessing(true);
        setStatusMessage({ type: 'info', message: 'Revoking transfer consent...' });
        try {
            const tx = await contract.revokeTransferConsent(tokenId, {
                gasLimit: 200000,
                gasPrice: 0
            });
            await tx.wait();
            setStatusMessage({ type: 'success', message: 'Transfer consent revoked successfully!' });
            await fetchBlockchainInfo();
        } catch (error) {
            console.error("Failed to revoke transfer consent:", error);
            setStatusMessage({ type: 'error', message: `Failed to revoke consent: ${error.message || error.reason}` });
        } finally {
            setIsProcessing(false);
        }
    }, [contract, yourDigitalAddress, fetchBlockchainInfo]);

    // Print land certificate
    const printCertificate = useCallback((land) => {
        const printWindow = window.open('', '_blank');
        const certificateHTML = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Land Title Certificate - ${land.parcelNumber}</title>
                <style>
                    body { font-family: 'Georgia', serif; margin: 40px; background-color: #f5f5f5; }
                    .certificate { 
                        background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                        border: 3px solid #333;
                        padding: 40px;
                        max-width: 900px;
                        margin: 0 auto;
                        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
                        border-radius: 10px;
                        color: white;
                    }
                    .header { text-align: center; margin-bottom: 30px; border-bottom: 2px solid white; padding-bottom: 20px; }
                    .header h1 { margin: 0; font-size: 36px; }
                    .header p { margin: 5px 0; font-size: 12px; letter-spacing: 2px; }
                    .content { margin: 30px 0; }
                    .field { margin: 20px 0; padding: 15px; background: rgba(255,255,255,0.1); border-left: 4px solid white; }
                    .label { font-size: 11px; letter-spacing: 1px; opacity: 0.9; }
                    .value { font-size: 16px; font-weight: bold; margin-top: 5px; word-break: break-all; }
                    .footer { text-align: center; margin-top: 40px; font-size: 10px; border-top: 2px solid white; padding-top: 20px; }
                    .nft-badge { display: inline-block; background: gold; color: #333; padding: 8px 16px; border-radius: 20px; font-weight: bold; margin: 10px 0; }
                    .print-button { text-align: center; margin-top: 30px; }
                    .print-button button { 
                        padding: 12px 30px; 
                        font-size: 14px; 
                        background: white; 
                        color: #667eea; 
                        border: none; 
                        border-radius: 5px; 
                        cursor: pointer; 
                        font-weight: bold;
                    }
                    .print-button button:hover { background: #f0f0f0; }
                    @media print {
                        .print-button { display: none; }
                        body { margin: 0; }
                    }
                </style>
            </head>
            <body>
                <div class="certificate">
                    <div class="header">
                        <h1>🏛️ LAND TITLE CERTIFICATE</h1>
                        <p>BLOCKCHAIN VERIFIED • IMMUTABLE RECORD</p>
                    </div>
                    
                    <div class="content">
                        <div class="nft-badge">🎖️ NFT VERIFIED ASSET</div>
                        
                        <div class="field">
                            <div class="label">TOKEN ID (NFT)</div>
                            <div class="value">${land.id}</div>
                        </div>
                        
                        <div class="field">
                            <div class="label">PARCEL NUMBER</div>
                            <div class="value">${land.parcelNumber}</div>
                        </div>
                        
                        <div class="field">
                            <div class="label">LOCATION (Coordinates)</div>
                            <div class="value">${land.location}</div>
                        </div>
                        
                        <div class="field">
                            <div class="label">AREA</div>
                            <div class="value">${land.area} Square Units</div>
                        </div>
                        
                        <div class="field">
                            <div class="label">REGISTERED OWNER</div>
                            <div class="value">${land.owner}</div>
                        </div>
                    </div>
                    
                    <div class="footer">
                        <p>This certificate confirms ownership of the above-described land parcel.</p>
                        <p>Certificate Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
                        <p>This document is a true and accurate record from the <strong>LandBlock Registry</strong> on the Ethereum Blockchain.</p>
                        <p style="margin-top: 20px; font-size: 9px;">⛓️ Blockchain Verified • Cryptographically Secured • Immutable Record</p>
                    </div>
                </div>
                
                <div class="print-button">
                    <button onclick="window.print()">🖨️ Print Certificate</button>
                </div>
            </body>
            </html>
        `;
        printWindow.document.write(certificateHTML);
        printWindow.document.close();
    }, []);

    useEffect(() => {
        fetchValidators();
    }, [fetchValidators]);

    useEffect(() => {
        const initializeDapp = async () => {
            if (window.ethereum && window.ethereum.selectedAddress) {
                await connectDigitalWallet();
            } else {
                setStatusMessage({ type: 'info', message: 'Connect your digital wallet to get started.' });
            }
        };

        initializeDapp();

        const handleAccountsChanged = (accounts) => {
            if (accounts.length === 0) {
                setStatusMessage({ type: 'info', message: 'Digital wallet disconnected.' });
                setYourDigitalAddress(null);
                setProvider(null);
                setSigner(null);
                setContract(null);
                setUserProfileContract(null);
                setUserProfile(null);
                setShowSignUp(false);
                setShowProfileUpdate(false);
                setHasPendingUpdate(false);
                setIsAuthority(false);
                setOwnedLandTitles([]);
            } else if (accounts[0].toLowerCase() !== (yourDigitalAddress || '').toLowerCase()) {
                connectDigitalWallet();
            }
        };

        const handleChainChanged = () => {
            window.location.reload();
        };

        if (window.ethereum) {
            window.ethereum.on('accountsChanged', handleAccountsChanged);
            window.ethereum.on('chainChanged', handleChainChanged);
        }

        return () => {
            if (window.ethereum) {
                window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
                window.ethereum.removeListener('chainChanged', handleChainChanged);
            }
        };
    }, [connectDigitalWallet, yourDigitalAddress]);

    useEffect(() => {
        if (contract && yourDigitalAddress) {
            console.log("📍 Triggering fetchBlockchainInfo - contract and address ready");
            fetchBlockchainInfo();
        }
    }, [contract, yourDigitalAddress, fetchBlockchainInfo]);

    useEffect(() => {
        checkUserProfile();
    }, [checkUserProfile]);

    const toggleTheme = () => {
        setDarkMode(!darkMode);
    };

    // Theme classes
    const themeClasses = darkMode
        ? 'bg-gradient-to-br from-gray-900 via-purple-900 to-gray-900 text-white'
        : 'bg-gradient-to-br from-gray-100 via-purple-100 to-gray-100 text-gray-900';

    const cardTheme = darkMode
        ? 'bg-gray-800 bg-opacity-60 border-indigo-500 border-opacity-20'
        : 'bg-white bg-opacity-90 border-indigo-300 border-opacity-40 shadow-lg';

    const textTheme = darkMode
        ? 'text-white'
        : 'text-gray-900';

    const mutedTextTheme = darkMode
        ? 'text-gray-300'
        : 'text-gray-600';

    return (
        <div className={`flex flex-col w-full min-h-screen ${themeClasses} transition-colors duration-300`}>
            <style>
                {`
                @keyframes float {
                    0%, 100% { transform: translateY(0px); }
                    50% { transform: translateY(-20px); }
                }
                
                @keyframes pulse-glow {
                    0%, 100% { opacity: 0.6; }
                    50% { opacity: 1; }
                }
                
                @keyframes spin-slow {
                    from { transform: rotate(0deg); }
                    to { transform: rotate(360deg); }
                }
                
                @keyframes pixel-shake {
                    0% { transform: translate(0, 0) rotate(0deg); }
                    25% { transform: translate(2px, 2px) rotate(0.5deg); }
                    50% { transform: translate(-2px, -2px) rotate(-0.5deg); }
                    75% { transform: translate(2px, -2px) rotate(0.5deg); }
                    100% { transform: translate(0, 0) rotate(0deg); }
                }
                
                .animate-float {
                    animation: float 6s ease-in-out infinite;
                }
                
                .animate-pulse-glow {
                    animation: pulse-glow 3s ease-in-out infinite;
                }
                
                .animate-spin-slow {
                    animation: spin-slow 20s linear infinite;
                }
                
                .animate-pixel {
                    animation: pixel-shake 0.5s infinite;
                    image-rendering: pixelated;
                    image-rendering: crisp-edges;
                }
                
                .flip-card {
                    background-color: darkMode ? 'rgba(55, 65, 81, 0.8)' : 'rgba(255, 255, 255, 0.8)';
                    perspective: 1000px;
                    height: 260px;
                }
                
                .flip-card-inner {
                    position: relative;
                    width: 100%;
                    height: 100%;
                    text-align: center;
                    transition: transform 0.8s;
                    transform-style: preserve-3d;
                    animation: flipSequence 12s infinite;
                }
                
                .flip-delay-0 { animation-delay: 0s; }
                .flip-delay-2 { animation-delay: 2s; }
                .flip-delay-4 { animation-delay: 4s; }
                
                .flip-card:hover .flip-card-inner {
                    animation-play-state: paused;
                    transform: rotateY(180deg);
                }
                
                @keyframes flipSequence {
                    0%, 35% { transform: rotateY(0deg); }
                    40%, 85% { transform: rotateY(180deg); }
                    90%, 100% { transform: rotateY(0deg); }
                }
                
                .flip-card-front, .flip-card-back {
                    position: absolute;
                    width: 100%;
                    height: 100%;
                    -webkit-backface-visibility: hidden;
                    backface-visibility: hidden;
                    border-radius: 1rem;
                    box-shadow: ${darkMode
                        ? '0 10px 30px -10px rgba(0,0,0,0.5), 0 0 0 2px rgba(139,92,246,0.3), 0 0 0 4px rgba(139,92,246,0.1)'
                        : '0 10px 30px -10px rgba(0,0,0,0.2), 0 0 0 2px rgba(139,92,246,0.2), 0 0 0 4px rgba(139,92,246,0.05)'};
                }
                
                .flip-card-back {
                    transform: rotateY(180deg);
                }
                
                .pixel-border {
                    box-shadow: 
                        0 0 0 2px ${darkMode ? '#4c1d95' : '#8b5cf6'},
                        0 0 0 4px ${darkMode ? '#2e1065' : '#c4b5fd'},
                        0 0 0 6px ${darkMode ? '#1e1b4b' : '#ede9fe'};
                    image-rendering: pixelated;
                }
                
                .pixel-text {
                    font-family: 'Courier New', monospace;
                    letter-spacing: 2px;
                    text-shadow: ${darkMode
                        ? '3px 3px 0 #4c1d95, 6px 6px 0 #2e1065'
                        : '2px 2px 0 #c4b5fd, 4px 4px 0 #8b5cf6'};
                }
                
                .grid-pattern {
                    background-image: 
                        linear-gradient(${darkMode ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)'} 1px, transparent 1px),
                        linear-gradient(90deg, ${darkMode ? 'rgba(139, 92, 246, 0.1)' : 'rgba(139, 92, 246, 0.05)'} 1px, transparent 1px);
                    background-size: 30px 30px;
                }
                
                /* Pixelated effect for images */
                .pixelated {
                    image-rendering: pixelated;
                    image-rendering: crisp-edges;
                }
                `}
            </style>

            {/* Single Nav Bar */}
            <nav className={`w-full ${darkMode ? 'bg-gray-900 bg-opacity-90' : 'bg-white bg-opacity-90'} backdrop-blur-md border-b ${darkMode ? 'border-indigo-500 border-opacity-30' : 'border-indigo-300 border-opacity-50'} py-3 px-4 sm:px-6 sticky top-0 z-50`}>
                <div className="w-full">
                    <div className="flex justify-between items-center">
                        <div className="flex items-center space-x-2 sm:space-x-3">
                            <div className={`flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg animate-pulse-glow pixel-border`}>
                                <Icon name="building" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                            </div>
                            <h1 className={`text-lg sm:text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                                Land<span className="text-indigo-500">Block</span>
                            </h1>
                            {yourDigitalAddress && (
                                <span className={`hidden sm:inline-block text-xs px-2 py-1 rounded-full ${darkMode ? 'bg-indigo-900 text-indigo-200' : 'bg-indigo-100 text-indigo-800'}`}>
                                    {yourDigitalAddress.substring(0, 4)}...{yourDigitalAddress.substring(38)}
                                </span>
                            )}
                        </div>

                        <div className="flex items-center space-x-2 sm:space-x-4">
                            {/* Theme Toggle */}
                            <button
                                onClick={toggleTheme}
                                className={`p-2 rounded-lg transition duration-200 ${darkMode
                                        ? 'bg-gray-800 hover:bg-gray-700 text-yellow-400'
                                        : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                                    }`}
                                aria-label="Toggle theme"
                            >
                                {darkMode ? (
                                    <Icon name="sun" className="w-5 h-5" />
                                ) : (
                                    <Icon name="moon" className="w-5 h-5" />
                                )}
                            </button>

                            {/* Admin Buttons - For Registrar or Validator */}
                            {yourDigitalAddress && (
                                <>
                                    {isOfficialRegistrar && (
                                        <div className="hidden sm:flex items-center space-x-2 group relative">
                                            <button
                                                onClick={() => setShowAdminPanel(true)}
                                                className={`p-2 rounded-lg transition duration-200 group ${darkMode
                                                        ? 'bg-emerald-900 hover:bg-emerald-800 text-emerald-200'
                                                        : 'bg-emerald-100 hover:bg-emerald-200 text-emerald-700'
                                                    }`}
                                                aria-label="Admin Panel"
                                                title="Admin Panel - Manage validators"
                                            >
                                                <Icon name="shield" className="w-5 h-5" />
                                            </button>
                                            <span className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-full left-0 mb-2 px-3 py-1 rounded-lg text-xs whitespace-nowrap ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-800 text-white'
                                                }`}>
                                                Manage Validators
                                            </span>
                                        </div>
                                    )}
                                    {(qbftIsValidator || userProfile) && (

                                        <div className="hidden sm:flex items-center space-x-2 group relative">
                                            <button
                                                onClick={() => setShowLandForm(true)}
                                                className={`p-2 rounded-lg transition duration-200 group ${darkMode
                                                        ? 'bg-blue-900 hover:bg-blue-800 text-blue-200'
                                                        : 'bg-blue-100 hover:bg-blue-200 text-blue-700'
                                                    }`}
                                                aria-label={qbftIsValidator ? "Propose Land" : "Request Land Mint"}
                                                title={qbftIsValidator ? "Register Land - Propose new land" : "Request Land Mint - Request new land as owner"}
                                            >
                                                <Icon name="doc" className="w-5 h-5" />
                                            </button>
                                            <span className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-full left-0 mb-2 px-3 py-1 rounded-lg text-xs whitespace-nowrap ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-800 text-white'
                                                }`}>
                                                {qbftIsValidator ? 'Propose Land' : 'Request Land'}
                                            </span>
                                        </div>
                                    )}

                                    {(qbftIsValidator || isAdmin) && (
                                        <div className="hidden sm:flex items-center space-x-2 group relative">
                                            <div className="relative">
                                                <button
                                                    onClick={() => setShowValidatorDashboard(true)}
                                                    className={`p-2 rounded-lg transition duration-200 ${darkMode
                                                            ? 'bg-purple-900 hover:bg-purple-800 text-purple-200'
                                                            : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                                                        }`}
                                                    aria-label="Validator Dashboard"
                                                    title="Validator Dashboard"
                                                >
                                                    <Icon name="shield-check" className="w-5 h-5" />
                                                </button>
                                                {pendingTransactionCount > 0 && (
                                                    <span className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center animate-pulse z-10 border-2 border-white">
                                                        {pendingTransactionCount}
                                                    </span>
                                                )}
                                            </div>
                                            <span className={`opacity-0 group-hover:opacity-100 transition-opacity duration-200 absolute bottom-full left-0 mb-2 px-3 py-1 rounded-lg text-xs whitespace-nowrap ${darkMode ? 'bg-gray-700 text-white' : 'bg-gray-800 text-white'
                                                }`}>
                                                Validator Dashboard
                                            </span>
                                        </div>
                                    )}
                                </>
                            )}

                            {/* About Button */}
                            <button
                                onClick={() => setShowAbout(true)}
                                className={`px-3 sm:px-6 py-1.5 sm:py-2 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg transition duration-200 font-medium text-sm sm:text-base shadow-lg hover:shadow-indigo-500/50`}
                            >
                                About
                            </button>

                            {/* Connect/Reconnect Button - Mobile */}
                            {!yourDigitalAddress && (
                                <button
                                    onClick={connectDigitalWallet}
                                    disabled={isProcessing}
                                    className="sm:hidden px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-lg text-xs font-medium"
                                >
                                    {isProcessing ? '...' : 'Connect'}
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </nav>

            {/* Main Content - Full Height */}
            <main className="flex-1 w-full px-3 sm:px-6 py-4 sm:py-6 overflow-y-auto">
                <div className="w-full h-full">
                    {/* Status Message */}
                    {statusMessage.message && (
                        <div className={`mb-4 sm:mb-6 py-3 px-4 rounded-lg backdrop-blur-sm border ${statusMessage.type === 'error' ? 'bg-red-500 bg-opacity-10 border-red-500 border-opacity-30 text-red-200' :
                                statusMessage.type === 'success' ? 'bg-green-500 bg-opacity-10 border-green-500 border-opacity-30 text-green-200' :
                                    'bg-blue-500 bg-opacity-10 border-blue-500 border-opacity-30 text-blue-200'
                            }`}>
                            <p className="font-medium text-sm sm:text-base">{statusMessage.message}</p>
                        </div>
                    )}

                    {/* No MetaMask State */}
                    {!hasMetaMask ? (
                        <div className="flex items-center justify-center h-full">
                            <div className={`w-full max-w-md ${darkMode ? 'bg-gray-800' : 'bg-white'} bg-opacity-90 backdrop-blur-sm border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-30 rounded-2xl shadow-2xl p-6 sm:p-8 text-center`}>
                                <div className="mb-6">
                                    <div className="w-16 h-16 sm:w-20 sm:h-20 mx-auto bg-gradient-to-br from-orange-400 to-red-600 rounded-full flex items-center justify-center shadow-lg animate-float">
                                        <Icon name="alert-circle" className="w-8 h-8 sm:w-10 sm:h-10 text-white" />
                                    </div>
                                </div>
                                <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'} mb-3`}>MetaMask Required</h2>
                                <p className={`${mutedTextTheme} mb-6 sm:mb-8 text-sm sm:text-base`}>
                                    MetaMask is not installed on your browser. Install it to securely manage your land titles on the blockchain.
                                </p>
                                <a
                                    href="https://metamask.io/download/"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 sm:gap-3 px-6 sm:px-8 py-2.5 sm:py-3 bg-gradient-to-r from-orange-500 to-red-600 hover:from-orange-600 hover:to-red-700 text-white rounded-lg transition duration-200 font-semibold shadow-lg text-sm sm:text-base"
                                >
                                    <Icon name="download" className="w-4 h-4 sm:w-5 sm:h-5" />
                                    Download MetaMask
                                </a>
                            </div>
                        </div>
                    ) : yourDigitalAddress ? (
                        // ===== CONNECTED STATE =====
                        <div className="space-y-4 sm:space-y-6">
                            {/* Wallet Info Card */}
                            <div className={`bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl shadow-xl p-4 sm:p-6 border ${darkMode ? 'border-indigo-400' : 'border-indigo-300'} border-opacity-30`}>
                                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-4">
                                    <div className="flex items-center space-x-3 sm:space-x-4">
                                        <div className="flex items-center justify-center w-10 h-10 sm:w-12 sm:h-12 bg-white bg-opacity-20 rounded-full">
                                            <Icon name="wallet" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        <div>
                                            <p className="text-xs sm:text-sm text-indigo-100">Connected Wallet</p>
                                            <p className="text-base sm:text-lg font-mono font-semibold text-white">
                                                {yourDigitalAddress.substring(0, 6)}...{yourDigitalAddress.substring(38)}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={connectDigitalWallet}
                                        disabled={isProcessing}
                                        className="w-full sm:w-auto px-4 sm:px-6 py-1.5 sm:py-2 bg-white bg-opacity-20 hover:bg-opacity-30 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                                    >
                                        {isProcessing ? 'Reconnecting...' : 'Reconnect'}
                                    </button>
                                </div>
                            </div>

                            {/* Your Land Titles Section */}
                            <div className={`${cardTheme} backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border`}>
                                <div className="flex items-center justify-between mb-4 sm:mb-6">
                                    <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold ${textTheme} flex items-center gap-2 sm:gap-3`}>
                                        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg">
                                            <Icon name="land" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        Your Land Titles (NFT)
                                    </h2>
                                </div>

                                {/* Info Banner - About Pending Lands */}
                                {pendingMintRequests.length > 0 && ownedLandTitles.length === 0 && (
                                    <div className={`${darkMode ? 'bg-blue-900 bg-opacity-30' : 'bg-blue-100'} border ${darkMode ? 'border-blue-500 border-opacity-50' : 'border-blue-300'} rounded-lg p-4 mb-6`}>
                                        <p className={`text-sm flex items-start gap-2 ${darkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                                            <span className="text-lg">ℹ️</span>
                                            <span>
                                                <strong>You have {pendingMintRequests.length} land(s) pending approval.</strong>
                                                <br />
                                                Once validators approve (see "Pending Transactions" section), they will appear here as finalized NFT titles.
                                            </span>
                                        </p>
                                    </div>
                                )}

                                {ownedLandTitles.length > 0 ? (
                                    <>
                                        {/* Land NFT Cards Grid */}
                                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mb-4 sm:mb-6">
                                            {ownedLandTitles.map((land) => (
                                                <div
                                                    key={land.id}
                                                    onClick={() => setSelectedLandId(selectedLandId === land.id ? null : land.id)}
                                                    className={`cursor-pointer relative group transform transition duration-300 ${selectedLandId === land.id ? 'scale-105' : 'hover:scale-105'
                                                        }`}
                                                >
                                                    {/* NFT Card */}
                                                    <div className={`relative rounded-xl shadow-xl overflow-hidden border-2 transition duration-300 ${selectedLandId === land.id
                                                            ? 'border-yellow-400 shadow-yellow-400/50'
                                                            : darkMode
                                                                ? 'border-indigo-500 border-opacity-20'
                                                                : 'border-indigo-300 border-opacity-30'
                                                        }`}>
                                                        {/* NFT Background Gradient */}
                                                        <div className="bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-600 p-1">
                                                            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-4 sm:p-5 space-y-3`}>
                                                                {/* NFT Badge */}
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="text-xl">🎖️</span>
                                                                        <span className={`text-xs font-bold ${darkMode ? 'text-purple-300' : 'text-purple-600'}`}>NFT VERIFIED</span>
                                                                    </div>
                                                                    {selectedLandId === land.id && (
                                                                        <div className="text-2xl animate-pulse">✨</div>
                                                                    )}
                                                                </div>

                                                                {/* Land ID Header */}
                                                                <div className="border-b border-dashed border-gray-400 pb-2">
                                                                    <h3 className={`font-bold text-sm sm:text-base ${textTheme}`}>
                                                                        Land Token #{land.id}
                                                                    </h3>
                                                                    <p className={`text-xs ${mutedTextTheme}`}>Blockchain Verified</p>
                                                                </div>

                                                                {/* Land Details */}
                                                                <div className="space-y-2 text-xs sm:text-sm">
                                                                    <div className="grid grid-cols-2 gap-2">
                                                                        <div>
                                                                            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-xs`}>PARCEL</p>
                                                                            <p className={`font-semibold ${textTheme} break-words`}>{land.parcelNumber || 'N/A'}</p>
                                                                        </div>
                                                                        <div>
                                                                            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-xs`}>AREA</p>
                                                                            <p className={`font-semibold ${textTheme}`}>{land.area || 'N/A'} sq</p>
                                                                        </div>
                                                                    </div>
                                                                    <div>
                                                                        <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-xs`}>LOCATION</p>
                                                                        <p className={`font-mono text-xs break-words ${textTheme}`}>{land.location || 'N/A'}</p>
                                                                    </div>
                                                                </div>

                                                                {/* Active Status */}
                                                                <div className="flex items-center gap-2 text-xs">
                                                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                                                    <span className={`${darkMode ? 'text-green-400' : 'text-green-600'} font-semibold`}>ACTIVE</span>
                                                                </div>
                                                            </div>
                                                        </div>

                                                        {/* Selection Indicator */}
                                                        {selectedLandId === land.id && (
                                                            <div className="absolute top-2 right-2 bg-yellow-400 rounded-full w-6 h-6 flex items-center justify-center text-sm font-bold">
                                                                ✓
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Action Buttons */}
                                        <div className={`rounded-xl p-4 sm:p-6 border ${darkMode ? 'bg-gray-700 bg-opacity-30 border-indigo-500 border-opacity-20' : 'bg-indigo-50 border-indigo-200'}`}>
                                            <p className={`text-sm ${mutedTextTheme} mb-3`}>
                                                {selectedLandId !== null
                                                    ? `✓ Land #${ownedLandTitles.find(l => l.id === selectedLandId)?.id} selected`
                                                    : '👆 Click a land card to select'}
                                            </p>
                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                                                <button
                                                    onClick={() => {
                                                        if (selectedLandId !== null) {
                                                            setShowTransferForm(true);
                                                        }
                                                    }}
                                                    disabled={selectedLandId === null || isProcessing}
                                                    className={`px-4 py-2.5 rounded-lg transition duration-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 ${selectedLandId !== null
                                                            ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white shadow-lg'
                                                            : `${darkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-600'} cursor-not-allowed`
                                                        }`}
                                                >
                                                    <Icon name="arrow-right" className="w-4 h-4" />
                                                    Propose Transfer
                                                </button>
                                                <button
                                                    onClick={() => {
                                                        if (selectedLandId !== null) {
                                                            const selected = ownedLandTitles.find(l => l.id === selectedLandId);
                                                            printCertificate(selected);
                                                        }
                                                    }}
                                                    disabled={selectedLandId === null}
                                                    className={`px-4 py-2.5 rounded-lg transition duration-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 ${selectedLandId !== null
                                                            ? 'bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg'
                                                            : `${darkMode ? 'bg-gray-600 text-gray-400' : 'bg-gray-300 text-gray-600'} cursor-not-allowed`
                                                        }`}
                                                >
                                                    <Icon name="doc" className="w-4 h-4" />
                                                    Print Certificate
                                                </button>
                                                {userProfile && qbftIsValidator && (
                                                    <button
                                                        onClick={() => setShowLandForm(true)}
                                                        className="px-4 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white rounded-lg transition duration-200 font-medium text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg"
                                                    >
                                                        <Icon name="plus" className="w-4 h-4" />
                                                        Register New Land
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </>
                                ) : (
                                    <div className="text-center py-8 sm:py-12">
                                        <Icon name="inbox" className={`w-12 h-12 sm:w-16 sm:h-16 ${darkMode ? 'text-gray-500' : 'text-gray-400'} mx-auto mb-2 sm:mb-3`} />
                                        <p className={`${mutedTextTheme} text-base sm:text-lg`}>You don't own any land titles yet.</p>
                                        <p className={`${darkMode ? 'text-gray-500' : 'text-gray-400'} text-xs sm:text-sm mt-1 sm:mt-2`}>Get started by registering your first property.</p>
                                    </div>
                                )}
                            </div>

                            {/* Pending Mint Requests Section */}
                            <div className={`${cardTheme} backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border`}>
                                <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold ${textTheme} mb-4 sm:mb-6 flex items-center gap-2 sm:gap-3`}>
                                    <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg animate-pulse">
                                        <Icon name="clock" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                    </div>
                                    Pending Transactions
                                </h2>

                                {pendingMintRequests.length > 0 ? (
                                    <div className="space-y-3 sm:space-y-4">
                                        {pendingMintRequests.map((mint) => (
                                            <div
                                                key={mint.id}
                                                className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} bg-opacity-50 border ${darkMode ? 'border-yellow-500' : 'border-yellow-400'} border-opacity-30 rounded-lg p-4 sm:p-5`}
                                            >
                                                <div className="flex items-center justify-between mb-3">
                                                    <div className="flex-1">
                                                        <h3 className={`font-semibold text-base sm:text-lg ${textTheme}`}>{mint.parcelNumber || 'N/A'}</h3>
                                                        <p className={`text-xs ${mutedTextTheme}`}>{mint.location || 'N/A'}</p>
                                                    </div>
                                                    <span className={`text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-2 ${mint.signatures >= (mint.requiredApprovals || 3) ? 'bg-green-500 text-white' : 'bg-yellow-500 text-white'}`}>
                                                        {mint.signatures}/{mint.requiredApprovals || 3} Approvals
                                                    </span>
                                                </div>

                                                <div className="space-y-1 text-xs sm:text-sm mb-3">
                                                    <p className={mutedTextTheme}><strong>Area:</strong> {mint.area || 'N/A'} sq units</p>
                                                    <p className={mutedTextTheme}><strong>Target Owner:</strong> {mint.targetOwnerName || 'N/A'} <code className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{mint.targetOwner ? `(${mint.targetOwner.slice(0, 6)}...${mint.targetOwner.slice(-4)})` : ''}</code></p>
                                                    <p className={mutedTextTheme}><strong>Initiator:</strong> {mint.initiatorName || 'N/A'} <code className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>{mint.initiator ? `(${mint.initiator.slice(0, 6)}...${mint.initiator.slice(-4)})` : ''}</code></p>
                                                    <p className={mutedTextTheme}><strong>Created:</strong> {mint.createdAt ? new Date(mint.createdAt).toLocaleString() : 'N/A'}</p>
                                                </div>

                                                {/* Validation Progress Bar */}
                                                <div className="w-full bg-gray-600 bg-opacity-30 rounded-full h-2.5 mb-2 overflow-hidden">
                                                    <div
                                                        className={`h-2.5 rounded-full transition-all duration-300 ${mint.signatures >= (mint.requiredApprovals || 3) ? 'bg-gradient-to-r from-green-400 to-green-500' : mint.signatures > 0 ? 'bg-gradient-to-r from-blue-400 to-blue-500' : 'bg-gradient-to-r from-yellow-400 to-yellow-500'}`}
                                                        style={{ width: `${((mint.signatures || 0) / (mint.requiredApprovals || 3)) * 100}%` }}
                                                    ></div>
                                                </div>

                                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                                                    {mint.signatures >= (mint.requiredApprovals || 3) ? '✅ Ready for minting' : mint.signatures > 0 ? `⏳ ${(mint.requiredApprovals || 3) - (mint.signatures || 0)} more approval(s) needed` : '🔄 Pending validator review'}
                                                </p>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="text-center py-8">
                                        <p className={`${mutedTextTheme} mb-2`}>No pending transactions</p>
                                        <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>All mint requests have been processed</p>
                                    </div>
                                )}
                            </div>

                            {/* User Profile Section */}
                            {userProfile ? (
                                <div className={`bg-gradient-to-br from-blue-800 to-indigo-900 bg-opacity-60 backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border border-blue-500 border-opacity-20`}>
                                    <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2 sm:mb-3 flex items-center gap-2 sm:gap-3`}>
                                        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                                            <Icon name="user" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        Your Profile
                                    </h2>
                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4">
                                        <div>
                                            <p className="text-blue-100 text-xs sm:text-sm">Name</p>
                                            <p className="text-white font-semibold">{userProfile.name}</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-100 text-xs sm:text-sm">Email</p>
                                            <p className="text-white font-semibold">{userProfile.email}</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-100 text-xs sm:text-sm">Phone</p>
                                            <p className="text-white font-semibold">{userProfile.phone}</p>
                                        </div>
                                        <div>
                                            <p className="text-blue-100 text-xs sm:text-sm">Date of Birth</p>
                                            <p className="text-white font-semibold">{userProfile.dateOfBirth}</p>
                                        </div>
                                    </div>
                                    <div className="flex flex-col sm:flex-row gap-2">
                                        <button
                                            onClick={() => setShowProfileUpdate(true)}
                                            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition duration-200 font-medium text-sm"
                                            disabled={hasPendingUpdate}
                                        >
                                            {hasPendingUpdate ? 'Update Pending Approval' : 'Request Update'}
                                        </button>
                                        {isAuthority && hasPendingUpdate && (
                                            <button
                                                onClick={() => approveUpdate(yourDigitalAddress)}
                                                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition duration-200 font-medium text-sm"
                                            >
                                                Approve My Update
                                            </button>
                                        )}
                                    </div>
                                </div>
                            ) : showSignUp ? (
                                <div className={`bg-gradient-to-br from-yellow-800 to-orange-900 bg-opacity-60 backdrop-blur-sm rounded-xl shadow-xl p-4 sm:p-6 border border-yellow-500 border-opacity-20`}>
                                    <h2 className={`text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2 sm:mb-3 flex items-center gap-2 sm:gap-3`}>
                                        <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-yellow-500 to-orange-600 rounded-lg">
                                            <Icon name="user-plus" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                        </div>
                                        Complete Your Profile
                                    </h2>
                                    <p className="text-yellow-100 text-sm sm:text-base mb-4">
                                        Register your profile to access all features. Your information is stored immutably on the blockchain.
                                    </p>
                                    <div className="space-y-4">
                                        <input type="text" placeholder="Full Name" className={`w-full px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`} id="signup-name" />
                                        <input type="email" placeholder="Email" className={`w-full px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`} id="signup-email" />
                                        <input type="tel" placeholder="Phone" className={`w-full px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`} id="signup-phone" />
                                        <input type="text" placeholder="Physical Address" className={`w-full px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`} id="signup-address" />
                                        <input type="date" className={`w-full px-4 py-2 rounded-lg ${darkMode ? 'bg-gray-700 text-white' : 'bg-white text-gray-900'}`} id="signup-dob" />
                                        <button
                                            onClick={() => {
                                                const profileData = {
                                                    name: document.getElementById('signup-name').value,
                                                    email: document.getElementById('signup-email').value,
                                                    phone: document.getElementById('signup-phone').value,
                                                    physicalAddress: document.getElementById('signup-address').value,
                                                    dateOfBirth: document.getElementById('signup-dob').value
                                                };
                                                registerProfile(profileData);
                                            }}
                                            disabled={isProcessing}
                                            className="w-full px-6 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50"
                                        >
                                            {isProcessing ? 'Registering...' : 'Register Profile'}
                                        </button>
                                    </div>
                                </div>
                            ) : null}

                        </div>
                    ) : (
                        // ===== DISCONNECTED STATE - ENHANCED LANDING PAGE WITH PIXEL FLIP CARDS =====
                        <div className="w-full h-full relative flex items-center justify-center">
                            {/* Animated background elements */}
                            <div className="absolute inset-0 overflow-hidden pointer-events-none">
                                <div className="absolute top-20 left-10 w-32 h-32 sm:w-64 sm:h-64 bg-indigo-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float"></div>
                                <div className="absolute bottom-20 right-10 w-32 h-32 sm:w-64 sm:h-64 bg-purple-600 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-float" style={{ animationDelay: '2s' }}></div>
                                <div className="grid-pattern absolute inset-0 opacity-30"></div>
                            </div>

                            {/* Main Content */}
                            <div className="relative z-10 w-full max-w-6xl mx-auto">
                                {/* Hero Section */}
                                <div className="text-center mb-6 sm:mb-8">
                                    <div className="mb-4 sm:mb-6">
                                        <div className="w-20 h-20 sm:w-28 sm:h-28 mx-auto bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-lg mb-3 sm:mb-4 transform hover:scale-110 transition animate-float pixel-border">
                                            <Icon name="wallet" className="w-10 h-10 sm:w-14 sm:h-14 text-white" />
                                        </div>
                                    </div>
                                    <h2 className={`text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-extrabold ${textTheme} mb-2 sm:mb-3 pixel-text`}>
                                        Welcome to <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">LandBlock</span>
                                    </h2>
                                    <p className={`${mutedTextTheme} mb-6 sm:mb-8 text-sm sm:text-base md:text-lg max-w-2xl mx-auto px-4`}>
                                        Secure blockchain-based land title management. Connect your wallet to get started with transparent and immutable property registration.
                                    </p>
                                    <button
                                        onClick={connectDigitalWallet}
                                        disabled={isProcessing}
                                        className="px-6 sm:px-8 md:px-10 py-3 sm:py-4 md:py-5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition duration-200 font-semibold shadow-lg text-base sm:text-lg md:text-xl mb-6 sm:mb-8 hover:shadow-indigo-500/50"
                                    >
                                        {isProcessing ? 'Connecting...' : 'Connect Wallet'}
                                    </button>

                                    {/* Animated Pixel Flip Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 md:gap-6 mt-4 sm:mt-6 md:mt-8 px-2 sm:px-0">
                                        {/* Card 1 - MetaMask Installation */}
                                        <div className="flip-card">
                                            <div className="flip-card-inner flip-delay-0">
                                                <div className={`flip-card-front bg-gradient-to-br from-blue-600 to-blue-800 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 mb-2 sm:mb-3 relative">
                                                        <Icon name="download" className="w-full h-full text-white animate-pixel" />
                                                        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold text-gray-900 animate-pulse-glow">1</div>
                                                    </div>
                                                    <h3 className="text-white font-bold text-base sm:text-lg mb-1 sm:mb-2">Install MetaMask</h3>
                                                    <p className="text-blue-100 text-xs sm:text-sm">Step 1: Download & install</p>
                                                    <div className="mt-2 sm:mt-3 w-8 sm:w-12 h-1 bg-white rounded-full"></div>
                                                </div>
                                                <div className={`flip-card-back bg-gradient-to-br from-blue-800 to-blue-950 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <p className="text-white text-xs sm:text-sm leading-relaxed">
                                                        Download MetaMask from the official website, install the browser extension, and create your first wallet. Secure your seed phrase!
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 2 - Apply for Land Token */}
                                        <div className="flip-card">
                                            <div className="flip-card-inner flip-delay-2">
                                                <div className={`flip-card-front bg-gradient-to-br from-green-600 to-green-800 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 mb-2 sm:mb-3 relative">
                                                        <Icon name="plus-circle" className="w-full h-full text-white animate-pixel" />
                                                        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold text-gray-900 animate-pulse-glow">2</div>
                                                    </div>
                                                    <h3 className="text-white font-bold text-base sm:text-lg mb-1 sm:mb-2">Apply for Token</h3>
                                                    <p className="text-green-100 text-xs sm:text-sm">Step 2: Register your land</p>
                                                    <div className="mt-2 sm:mt-3 w-8 sm:w-12 h-1 bg-white rounded-full"></div>
                                                </div>
                                                <div className={`flip-card-back bg-gradient-to-br from-green-800 to-green-950 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <p className="text-white text-xs sm:text-sm leading-relaxed">
                                                        Submit your land details including parcel number, location, and area. The registrar will verify your information.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>

                                        {/* Card 3 - Mint & Transfer */}
                                        <div className="flip-card">
                                            <div className="flip-card-inner flip-delay-4">
                                                <div className={`flip-card-front bg-gradient-to-br from-purple-600 to-purple-800 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <div className="w-12 h-12 sm:w-16 sm:h-16 mb-2 sm:mb-3 relative">
                                                        <Icon name="arrow-right" className="w-full h-full text-white animate-pixel" />
                                                        <div className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 bg-yellow-400 rounded-full flex items-center justify-center text-xs font-bold text-gray-900 animate-pulse-glow">3</div>
                                                    </div>
                                                    <h3 className="text-white font-bold text-base sm:text-lg mb-1 sm:mb-2">Mint & Transfer</h3>
                                                    <p className="text-purple-100 text-xs sm:text-sm">Step 3: Secure ownership</p>
                                                    <div className="mt-2 sm:mt-3 w-8 sm:w-12 h-1 bg-white rounded-full"></div>
                                                </div>
                                                <div className={`flip-card-back bg-gradient-to-br from-purple-800 to-purple-950 p-4 sm:p-6 flex flex-col items-center justify-center`}>
                                                    <p className="text-white text-xs sm:text-sm leading-relaxed">
                                                        Once minted, your land title is permanently recorded. Transfer ownership securely through smart contracts.
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Stats Section */}
                                    <div className="mt-6 sm:mt-8 md:mt-10 grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 max-w-2xl mx-auto px-2">
                                        <div className={`text-center p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-800 bg-opacity-50' : 'bg-white bg-opacity-50'} backdrop-blur-sm border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-20`}>
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto ${darkMode ? 'bg-indigo-900' : 'bg-indigo-100'} rounded-full flex items-center justify-center mb-1 sm:mb-2 border ${darkMode ? 'border-indigo-400' : 'border-indigo-300'}`}>
                                                <span className="text-base sm:text-lg md:text-xl font-bold text-indigo-400">0</span>
                                            </div>
                                            <p className={`${mutedTextTheme} text-[10px] sm:text-xs`}>Gas Fees</p>
                                        </div>
                                        <div className={`text-center p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-800 bg-opacity-50' : 'bg-white bg-opacity-50'} backdrop-blur-sm border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-20`}>
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto ${darkMode ? 'bg-indigo-900' : 'bg-indigo-100'} rounded-full flex items-center justify-center mb-1 sm:mb-2 border ${darkMode ? 'border-indigo-400' : 'border-indigo-300'}`}>
                                                <span className="text-base sm:text-lg md:text-xl font-bold text-indigo-400">24/7</span>
                                            </div>
                                            <p className={`${mutedTextTheme} text-[10px] sm:text-xs`}>Availability</p>
                                        </div>
                                        <div className={`text-center p-2 sm:p-3 rounded-lg ${darkMode ? 'bg-gray-800 bg-opacity-50' : 'bg-white bg-opacity-50'} backdrop-blur-sm border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-20`}>
                                            <div className={`w-8 h-8 sm:w-10 sm:h-10 mx-auto ${darkMode ? 'bg-indigo-900' : 'bg-indigo-100'} rounded-full flex items-center justify-center mb-1 sm:mb-2 border ${darkMode ? 'border-indigo-400' : 'border-indigo-300'}`}>
                                                <span className="text-base sm:text-lg md:text-xl font-bold text-indigo-400">∞</span>
                                            </div>
                                            <p className={`${mutedTextTheme} text-[10px] sm:text-xs`}>Immutable</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {/* About Popup */}
            {showAbout && (
                <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 px-3 sm:px-6">
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 md:p-8 max-w-md w-full border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-30 shadow-2xl`}>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <h3 className={`text-xl sm:text-2xl font-bold ${textTheme}`}>About LandBlock</h3>
                            <button onClick={() => setShowAbout(false)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Icon name="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <div className="space-y-3 sm:space-y-4 mb-4 sm:mb-6">
                            <p className={mutedTextTheme}>
                                <span className="font-semibold text-indigo-400">LandBlock</span> is a revolutionary blockchain-based land registry platform that ensures transparent, secure, and immutable property title management.
                            </p>

                            <div className={`${darkMode ? 'bg-gray-700' : 'bg-gray-100'} bg-opacity-50 rounded-lg p-3 sm:p-4`}>
                                <h4 className={`font-semibold ${textTheme} mb-2 text-sm sm:text-base`}>Key Features:</h4>
                                <ul className={`${mutedTextTheme} text-xs sm:text-sm space-y-1 sm:space-y-2`}>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                                        Decentralized land title registration
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                                        Immutable ownership records
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                                        Secure wallet integration
                                    </li>
                                    <li className="flex items-center gap-2">
                                        <span className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></span>
                                        Instant property transfers
                                    </li>
                                </ul>
                            </div>

                            <p className={`${darkMode ? 'text-gray-400' : 'text-gray-500'} text-xs sm:text-sm`}>
                                Built on Ethereum blockchain technology, LandBlock eliminates fraud and provides a single source of truth for land ownership.
                            </p>
                        </div>

                        <div className="space-y-2 sm:space-y-3">
                            <a
                                href="/LandBlock_User_Manual.pdf"
                                download
                                className="flex items-center justify-center gap-2 sm:gap-3 w-full px-4 sm:px-6 py-2.5 sm:py-3 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg transition duration-200 font-medium text-sm sm:text-base"
                            >
                                <Icon name="download" className="w-4 h-4 sm:w-5 sm:h-5" />
                                Download User Manual
                            </a>
                            <button
                                onClick={() => setShowAbout(false)}
                                className={`w-full px-4 sm:px-6 py-2.5 sm:py-3 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition duration-200 font-medium text-sm sm:text-base ${textTheme}`}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Registration Modal */}
            

            {/* Profile Update Modal */}
            {showProfileUpdate && userProfile && (
                <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 px-3 sm:px-6">
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 md:p-8 max-w-md w-full border ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-30 shadow-2xl`}>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <h3 className={`text-xl sm:text-2xl font-bold ${textTheme}`}>Request Profile Update</h3>
                            <button onClick={() => setShowProfileUpdate(false)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Icon name="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <p className={`${mutedTextTheme} mb-4 text-sm`}>
                            Updates require approval from relevant authorities. Your current information will remain unchanged until approved.
                        </p>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            const profileData = {
                                name: formData.get('name'),
                                email: formData.get('email'),
                                phone: formData.get('phone'),
                                physicalAddress: formData.get('physicalAddress'),
                                dateOfBirth: formData.get('dateOfBirth')
                            };
                            requestProfileUpdate(profileData);
                            setShowProfileUpdate(false);
                        }} className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-1`}>Full Name *</label>
                                <input
                                    type="text"
                                    name="name"
                                    defaultValue={userProfile.name}
                                    required
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-1`}>Email</label>
                                <input
                                    type="email"
                                    name="email"
                                    defaultValue={userProfile.email}
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-1`}>Phone</label>
                                <input
                                    type="tel"
                                    name="phone"
                                    defaultValue={userProfile.phone}
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-1`}>Physical Address</label>
                                <input
                                    type="text"
                                    name="physicalAddress"
                                    defaultValue={userProfile.physicalAddress}
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                            </div>
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-1`}>Date of Birth *</label>
                                <input
                                    type="date"
                                    name="dateOfBirth"
                                    defaultValue={new Date(userProfile.dateOfBirth).toISOString().split('T')[0]}
                                    required
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}`}
                                />
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50"
                                >
                                    {isProcessing ? 'Requesting...' : 'Request Update'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowProfileUpdate(false)}
                                    className={`flex-1 px-4 py-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition duration-200 font-medium ${textTheme}`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Admin Panel Modal */}
            {showAdminPanel && isOfficialRegistrar && (
                <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 px-3 sm:px-6">
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 md:p-8 max-w-md w-full border ${darkMode ? 'border-emerald-500' : 'border-emerald-300'} border-opacity-30 shadow-2xl`}>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-lg">
                                    <Icon name="shield" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                </div>
                                <h3 className={`text-xl sm:text-2xl font-bold ${textTheme}`}>Admin Panel</h3>
                            </div>
                            <button onClick={() => setShowAdminPanel(false)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Icon name="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <div className={`${darkMode ? 'bg-gray-700 bg-opacity-50' : 'bg-gray-100 bg-opacity-50'} rounded-lg p-3 sm:p-4 mb-4`}>
                            <p className={`text-sm ${mutedTextTheme}`}>
                                <span className="block font-semibold text-emerald-400 mb-1">You are the Official Registrar</span>
                                Manage validators for QBFT consensus. All validators must approve land registrations.
                            </p>
                        </div>

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const address = document.getElementById('admin-validator-address').value;
                            if (address) {
                                addValidator(address);
                                document.getElementById('admin-validator-address').value = '';
                            }
                        }} className="space-y-4">
                            <div>
                                <label className={`block text-sm font-medium ${textTheme} mb-2`}>Add New Validator</label>
                                <input
                                    type="text"
                                    id="admin-validator-address"
                                    placeholder="0x..."
                                    required
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs`}
                                />
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>Enter wallet address of new validator</p>
                            </div>
                            <div className="flex gap-3">
                                <button
                                    type="submit"
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50 text-sm"
                                >
                                    {isProcessing ? 'Adding...' : 'Add Validator'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAdminPanel(false)}
                                    className={`flex-1 px-4 py-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition duration-200 font-medium ${textTheme} text-sm`}
                                >
                                    Close
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Land Registration Modal */}
            {showLandForm && (qbftIsValidator || userProfile) && (
                <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 px-3 sm:px-6 max-h-screen overflow-y-auto">
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 md:p-8 max-w-md w-full border ${darkMode ? 'border-blue-500' : 'border-blue-300'} border-opacity-30 shadow-2xl my-4`}>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg">
                                    <Icon name="doc" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                </div>
                                <h3 className={`text-xl sm:text-2xl font-bold ${textTheme}`}>{qbftIsValidator ? 'Propose Land' : 'Request Land Mint'}</h3>
                            </div>
                            <button onClick={() => setShowLandForm(false)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Icon name="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <div className={`${darkMode ? 'bg-blue-900 bg-opacity-30' : 'bg-blue-100 bg-opacity-50'} rounded-lg p-3 sm:p-4 mb-4`}>
                            <p className={`text-xs sm:text-sm ${mutedTextTheme}`}>
                                <span className="block font-semibold text-blue-400 mb-1">{qbftIsValidator ? 'QBFT Consensus Mode' : 'Land Mint Request'}</span>
                                {qbftIsValidator
                                    ? 'Your proposal will be submitted for validator approval.'
                                    : 'Your request will be reviewed by validators and must be approved.'}
                            </p>
                        </div>

                        <form onSubmit={(e) => {
                            e.preventDefault();

                            // Validate parcel number availability
                            if (parcelNumberAvailable === false) {
                                setStatusMessage({ type: 'error', message: 'Parcel number already exists. Please use a different parcel number.' });
                                return;
                            }
                            if (parcelNumberAvailable === null || checkingParcelNumber) {
                                setStatusMessage({ type: 'error', message: 'Please check parcel number availability first.' });
                                return;
                            }

                            const formData = new FormData(e.target);
                            if (qbftIsValidator) {
                                proposeLandMint(
                                    formData.get('ownerAddress'),
                                    formData.get('parcelNumber'),
                                    formData.get('location'),
                                    formData.get('area')
                                );
                            } else {
                                requestLandMintAsOwner(
                                    formData.get('parcelNumber'),
                                    formData.get('location'),
                                    formData.get('area')
                                );
                            }
                        }} className="space-y-3">
                            {qbftIsValidator && (
                                <div>
                                    <label className={`block text-xs sm:text-sm font-medium ${textTheme} mb-1`}>Owner Address *</label>
                                    <input
                                        type="text"
                                        name="ownerAddress"
                                        placeholder="0x..."
                                        required
                                        className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs`}
                                    />
                                </div>
                            )}
                            {!qbftIsValidator && (
                                <div className={`${darkMode ? 'bg-gray-700 bg-opacity-50' : 'bg-gray-100'} rounded-lg p-3 mb-3`}>
                                    <p className={`text-xs ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                                        <strong>Your Address:</strong><br />
                                        <code className={`text-[10px] ${darkMode ? 'text-yellow-400' : 'text-blue-600'}`}>{yourDigitalAddress}</code>
                                    </p>
                                </div>
                            )}
                            <div>
                                <label className={`block text-xs sm:text-sm font-medium ${textTheme} mb-1`}>Parcel Number *</label>
                                <div className="relative">
                                    <input
                                        type="text"
                                        name="parcelNumber"
                                        placeholder="e.g., PARCEL-001"
                                        required
                                        value={parcelNumberInput}
                                        onChange={(e) => handleParcelNumberChange(e.target.value)}
                                        className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs ${parcelNumberAvailable === false ? 'border-red-500 border-2' :
                                                parcelNumberAvailable === true ? 'border-green-500 border-2' : ''
                                            }`}
                                    />
                                    {checkingParcelNumber && (
                                        <div className="absolute right-3 top-2.5">
                                            <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
                                        </div>
                                    )}
                                    {parcelNumberInput && !checkingParcelNumber && (
                                        <div className="absolute right-3 top-2.5">
                                            {parcelNumberAvailable ? (
                                                <Icon name="check" className="w-5 h-5 text-green-500" />
                                            ) : parcelNumberAvailable === false ? (
                                                <Icon name="x" className="w-5 h-5 text-red-500" />
                                            ) : null}
                                        </div>
                                    )}
                                </div>
                                {parcelNumberInput && !checkingParcelNumber && (
                                    <p className={`text-xs mt-1 ${parcelNumberAvailable ? 'text-green-500' : 'text-red-500'}`}>
                                        {parcelNumberAvailable ? '✓ Parcel number is available' : '✗ Parcel number already exists'}
                                    </p>
                                )}
                            </div>
                            <div>
                                <label className={`block text-xs sm:text-sm font-medium ${textTheme} mb-1`}>Location (Coordinates) *</label>
                                <input
                                    type="text"
                                    name="location"
                                    placeholder="e.g., 40.7128, -74.0060"
                                    required
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs`}
                                />
                            </div>
                            <div>
                                <label className={`block text-xs sm:text-sm font-medium ${textTheme} mb-1`}>Area (square units) *</label>
                                <input
                                    type="number"
                                    name="area"
                                    placeholder="e.g., 5000"
                                    required
                                    min="0"
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs`}
                                />
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={isProcessing || parcelNumberAvailable !== true || checkingParcelNumber}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50 text-xs sm:text-sm"
                                >
                                    {isProcessing ? (qbftIsValidator ? 'Proposing...' : 'Requesting...') : (qbftIsValidator ? 'Propose Mint' : 'Request Mint')}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowLandForm(false)}
                                    className={`flex-1 px-4 py-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition duration-200 font-medium ${textTheme} text-xs sm:text-sm`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Land Transfer Proposal Modal */}
            {showTransferForm && selectedLandId !== null && (
                <div className="fixed inset-0 bg-black bg-opacity-80 backdrop-blur-sm flex items-center justify-center z-50 px-3 sm:px-6 max-h-screen overflow-y-auto">
                    <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-xl p-5 sm:p-6 md:p-8 max-w-md w-full border ${darkMode ? 'border-blue-500' : 'border-blue-300'} border-opacity-30 shadow-2xl my-4`}>
                        <div className="flex items-center justify-between mb-4 sm:mb-6">
                            <div className="flex items-center gap-3">
                                <div className="flex items-center justify-center w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-lg">
                                    <Icon name="arrow-right" className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                                </div>
                                <h3 className={`text-xl sm:text-2xl font-bold ${textTheme}`}>Transfer Land</h3>
                            </div>
                            <button onClick={() => setShowTransferForm(false)} className={`${darkMode ? 'text-gray-400 hover:text-white' : 'text-gray-600 hover:text-gray-900'}`}>
                                <Icon name="x" className="w-5 h-5 sm:w-6 sm:h-6" />
                            </button>
                        </div>

                        <div className={`${darkMode ? 'bg-blue-900 bg-opacity-30' : 'bg-blue-100 bg-opacity-50'} rounded-lg p-3 sm:p-4 mb-4`}>
                            <p className={`text-xs sm:text-sm ${mutedTextTheme}`}>
                                <span className="block font-semibold text-blue-400 mb-1">Owner-Authorized Transfer</span>
                                Only the current owner can initiate a transfer. The request will then require validator approval.
                            </p>
                        </div>

                        {/* Selected Land Info */}
                        {ownedLandTitles.find(l => l.id === selectedLandId) && (
                            <div className={`${darkMode ? 'bg-gray-700 bg-opacity-50' : 'bg-gray-100'} rounded-lg p-3 mb-4 border-l-4 ${darkMode ? 'border-cyan-500' : 'border-cyan-400'}`}>
                                <p className={`text-xs ${mutedTextTheme} mb-2`}>Selected Land NFT:</p>
                                <div className="space-y-1">
                                    <p className={`text-sm font-semibold ${textTheme}`}>
                                        Token #{selectedLandId} • {ownedLandTitles.find(l => l.id === selectedLandId)?.parcelNumber}
                                    </p>
                                    <p className={`text-xs ${mutedTextTheme}`}>
                                        {ownedLandTitles.find(l => l.id === selectedLandId)?.location}
                                    </p>
                                </div>
                            </div>
                        )}

                        <form onSubmit={(e) => {
                            e.preventDefault();
                            const formData = new FormData(e.target);
                            proposeLandTransfer(selectedLandId, formData.get('recipientAddress'));
                        }} className="space-y-3">
                            <div>
                                <label className={`block text-xs sm:text-sm font-medium ${textTheme} mb-1`}>Recipient Address *</label>
                                <input
                                    type="text"
                                    name="recipientAddress"
                                    placeholder="0x..."
                                    required
                                    className={`w-full px-3 py-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'} text-xs`}
                                />
                                <p className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'} mt-1`}>Enter the wallet address of the new owner</p>
                            </div>

                            <div className={`${darkMode ? 'bg-yellow-900 bg-opacity-20' : 'bg-yellow-100'} border ${darkMode ? 'border-yellow-700 border-opacity-30' : 'border-yellow-300'} rounded-lg p-3 text-xs ${mutedTextTheme}`}>
                                <p className="leading-relaxed">
                                    ⚠️ <strong>Security:</strong> Direct transfers are disabled. Only you can initiate this transfer, and it requires validator approval before finalization.
                                </p>
                            </div>

                            <div className="flex gap-3 pt-2">
                                <button
                                    type="submit"
                                    disabled={isProcessing}
                                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-700 hover:to-cyan-700 text-white rounded-lg transition duration-200 font-medium disabled:opacity-50 text-xs sm:text-sm"
                                >
                                    {isProcessing ? 'Processing...' : 'Request Transfer'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowTransferForm(false)}
                                    className={`flex-1 px-4 py-2 ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} rounded-lg transition duration-200 font-medium ${textTheme} text-xs sm:text-sm`}
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Validator Dashboard */}
            {showValidatorDashboard && (
                <ValidatorDashboard
                    contract={contract}
                    userProfileContract={userProfileContract}
                    address={yourDigitalAddress}
                    isValidator={qbftIsValidator}
                    isAdmin={isAdmin}
                    darkMode={darkMode}
                    statusMessage={statusMessage}
                    setStatusMessage={setStatusMessage}
                    isProcessing={isProcessing}
                    setIsProcessing={setIsProcessing}
                    onClose={() => setShowValidatorDashboard(false)}
                />
            )}

            {/* Footer */}
            <footer className={`w-full ${darkMode ? 'bg-gray-900 bg-opacity-40' : 'bg-white bg-opacity-40'} border-t ${darkMode ? 'border-indigo-500' : 'border-indigo-300'} border-opacity-30 py-2 sm:py-3 px-3 sm:px-6`}>
                <div className="w-full text-center">
                    <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} text-[10px] sm:text-xs`}>© 2026 LandBlock Registry. Powered by Ethereum Blockchain.</p>
                </div>
            </footer>

            {/* Citizen-facing UI is now mounted at the root route via
                src/govtech/router.js. This legacy operator console keeps
                its full QBFT/Validator workflow at /legacy/admin. */}
        </div>
    );
}

export default App;
