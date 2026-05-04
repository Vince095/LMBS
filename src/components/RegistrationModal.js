import React, { useState } from 'react';
import Icon from './Icons';

const RegistrationModal = ({
    address,
    userProfileContract,
    darkMode,
    onRegistrationComplete,
    onClose
}) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        phone: '',
        physicalAddress: '',
        dateOfBirth: ''
    });
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    const handleInputChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
        setError('');
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);

        try {
            // Validate required fields
            if (!formData.name.trim()) {
                throw new Error('Name is required');
            }
            if (!formData.email.trim()) {
                throw new Error('Email is required');
            }

            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(formData.email)) {
                throw new Error('Invalid email format');
            }

            // Convert date of birth to Unix timestamp
            let dateOfBirth = 0;
            if (formData.dateOfBirth) {
                const date = new Date(formData.dateOfBirth);
                if (date instanceof Date && !isNaN(date)) {
                    dateOfBirth = Math.floor(date.getTime() / 1000);
                }
            }

            // Call the smart contract
            setSuccessMessage('Registering profile on blockchain...');
            const tx = await userProfileContract.registerProfile(
                formData.name,
                formData.email,
                formData.phone,
                formData.physicalAddress,
                dateOfBirth,
                {
                    gasLimit: 400000,
                    gasPrice: BigInt(0)
                }
            );

            setSuccessMessage('Waiting for transaction confirmation...');
            const receipt = await tx.wait(1);

            if (receipt.status === 1) {
                // Store off-chain profile data
                try {
                    setSuccessMessage('Storing profile data off-chain...');
                    const offChainResponse = await fetch('http://localhost:5000/api/profiles/store', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            address: address,
                            name: formData.name,
                            email: formData.email,
                            phone: formData.phone,
                            physicalAddress: formData.physicalAddress,
                            dateOfBirth: formData.dateOfBirth
                        })
                    });

                    if (!offChainResponse.ok) {
                        console.warn('Off-chain storage failed');
                    }
                } catch (apiError) {
                    console.error('Failed to store off-chain profile:', apiError);
                }

                setSuccessMessage('✓ Profile registered successfully!');
                setFormData({
                    name: '',
                    email: '',
                    phone: '',
                    physicalAddress: '',
                    dateOfBirth: ''
                });
                
                // Close modal after success
                setTimeout(() => {
                    onRegistrationComplete();
                    onClose();
                }, 1500);
            } else {
                throw new Error('Transaction failed');
            }
        } catch (err) {
            console.error('Registration error:', err);
            
            const errorMessage = err.error?.message || err.message || "";
            
            if (errorMessage.includes('Failed to fetch')) {
                setError('Network Error: Cannot reach Besu node. Check your connection and try resetting MetaMask.');
            } else if (err.code === 'ACTION_REJECTED') {
                setError('Transaction rejected in MetaMask.');
            } else if (err.message.includes('Profile already exists')) {
                setError('This wallet already has a registered profile');
            } else {
                setError(err.message || 'Registration failed. Please try again.');
            }
        } finally {
            setIsLoading(false);
            if (successMessage) {
                setTimeout(() => setSuccessMessage(''), 3000);
            }
        }
    };

    return (
        <div className={`fixed inset-0 ${darkMode ? 'bg-black' : 'bg-gray-900'} bg-opacity-75 flex items-center justify-center z-50 p-4`}>
            <div className={`${darkMode ? 'bg-gray-800' : 'bg-white'} rounded-lg shadow-2xl max-w-md w-full p-6 border ${darkMode ? 'border-indigo-600' : 'border-indigo-300'}`}>
                
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center space-x-2">
                        <Icon name="user-plus" className={`w-6 h-6 ${darkMode ? 'text-indigo-400' : 'text-indigo-600'}`} />
                        <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                            Welcome!
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        className={`p-1 rounded hover:${darkMode ? 'bg-gray-700' : 'bg-gray-100'}`}
                    >
                        <Icon name="x" className={`w-5 h-5 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`} />
                    </button>
                </div>

                {/* Subtitle */}
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-6`}>
                    Please create your profile to get started. Your information is securely stored and only hashes are kept on the blockchain.
                </p>

                {/* Form */}
                <form onSubmit={handleSubmit} className="space-y-4">
                    {/* Name */}
                    <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Full Name <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleInputChange}
                            placeholder="John Doe"
                            disabled={isLoading}
                            className={`w-full px-3 py-2 rounded border ${
                                darkMode
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                            } focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                    </div>

                    {/* Email */}
                    <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Email Address <span className="text-red-500">*</span>
                        </label>
                        <input
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleInputChange}
                            placeholder="john@example.com"
                            disabled={isLoading}
                            className={`w-full px-3 py-2 rounded border ${
                                darkMode
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                            } focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                    </div>

                    {/* Phone */}
                    <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Phone Number <span className="text-gray-500 text-xs">(optional)</span>
                        </label>
                        <input
                            type="tel"
                            name="phone"
                            value={formData.phone}
                            onChange={handleInputChange}
                            placeholder="+234 (XXX) XXX-XXXX"
                            disabled={isLoading}
                            className={`w-full px-3 py-2 rounded border ${
                                darkMode
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                            } focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                    </div>

                    {/* Physical Address */}
                    <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Physical Address <span className="text-gray-500 text-xs">(optional)</span>
                        </label>
                        <textarea
                            name="physicalAddress"
                            value={formData.physicalAddress}
                            onChange={handleInputChange}
                            placeholder="123 Main St, City, State, Country"
                            disabled={isLoading}
                            rows="2"
                            className={`w-full px-3 py-2 rounded border resize-none ${
                                darkMode
                                    ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'
                                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                            } focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                    </div>

                    {/* Date of Birth */}
                    <div>
                        <label className={`block text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'} mb-1`}>
                            Date of Birth <span className="text-gray-500 text-xs">(optional)</span>
                        </label>
                        <input
                            type="date"
                            name="dateOfBirth"
                            value={formData.dateOfBirth}
                            onChange={handleInputChange}
                            disabled={isLoading}
                            className={`w-full px-3 py-2 rounded border ${
                                darkMode
                                    ? 'bg-gray-700 border-gray-600 text-white'
                                    : 'bg-white border-gray-300 text-gray-900'
                            } focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50`}
                        />
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="bg-red-500 bg-opacity-20 border border-red-500 text-red-500 px-3 py-2 rounded text-sm flex items-center space-x-2">
                            <Icon name="alert-circle" className="w-4 h-4" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Success Message */}
                    {successMessage && (
                        <div className="bg-green-500 bg-opacity-20 border border-green-500 text-green-500 px-3 py-2 rounded text-sm flex items-center space-x-2">
                            <Icon name="check-circle" className="w-4 h-4" />
                            <span>{successMessage}</span>
                        </div>
                    )}

                    {/* Wallet Address Display */}
                    <div className={`bg-opacity-50 ${darkMode ? 'bg-gray-700' : 'bg-gray-100'} p-3 rounded text-xs`}>
                        <p className={`${darkMode ? 'text-gray-400' : 'text-gray-600'} mb-1`}>Wallet Address:</p>
                        <p className={`font-mono ${darkMode ? 'text-indigo-300' : 'text-indigo-600'} break-all`}>
                            {address}
                        </p>
                    </div>

                    {/* Submit Button */}
                    <button
                        type="submit"
                        disabled={isLoading || !formData.name.trim() || !formData.email.trim()}
                        className={`w-full py-2 px-4 rounded font-semibold flex items-center justify-center space-x-2 transition duration-200 ${
                            isLoading || !formData.name.trim() || !formData.email.trim()
                                ? `${darkMode ? 'bg-gray-600' : 'bg-gray-300'} opacity-50 cursor-not-allowed`
                                : `${darkMode ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-indigo-500 hover:bg-indigo-600'} text-white`
                        }`}
                    >
                        {isLoading ? (
                            <>
                                <Icon name="loader" className="w-4 h-4 animate-spin" />
                                <span>Creating Profile...</span>
                            </>
                        ) : (
                            <>
                                <Icon name="check" className="w-4 h-4" />
                                <span>Create Profile</span>
                            </>
                        )}
                    </button>
                </form>

                {/* Info Footer */}
                <p className={`text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'} mt-4 text-center`}>
                    Your profile will be registered on the blockchain and you'll be able to participate in land transactions.
                </p>
            </div>
        </div>
    );
};

export default RegistrationModal;
