// src/hooks/useWallet.js
import { useState, useEffect, useCallback } from 'react';
import { createPublicClient, http, formatUnits } from 'viem';
import { anvilChain } from './chains';
import { MOCK_USDC_ADDRESS, mockUsdcAbi } from '../contracts';
import { ESCROW_V1_ADDRESS, escrowV1Abi } from '../contracts';
export const useWallet = () => {
  const [address, setAddress] = useState(null);
  const [nativeBalance, setNativeBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [manualDisconnect, setManualDisconnect] = useState(false);

  // Create public client for balance queries
  const publicClient = createPublicClient({
    chain: anvilChain,
    transport: http(),
  });

  // Request account access
  const connect = async () => {
    setIsLoading(true);
    setError(null);
    setManualDisconnect(false); // Reset manual disconnect flag
    
    if (!window.ethereum) {
      setError('MetaMask is not installed');
      setIsLoading(false);
      return;
    }

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts',
      });
      
      if (accounts.length > 0) {
        setAddress(accounts[0]);
        setIsConnected(true);
        await updateBalances(accounts[0]);
        localStorage.setItem('walletConnected', 'true');
      }
    } catch (err) {
      setError('Failed to connect: ' + err.message);
      console.error('Connection error:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Get current account without prompting
  const getAccount = async () => {
    if (!window.ethereum) return null;
    
    try {
      const accounts = await window.ethereum.request({
        method: 'eth_accounts',
      });
      return accounts.length > 0 ? accounts[0] : null;
    } catch (err) {
      console.error('Error getting account:', err);
      return null;
    }
  };

  // Update both native and USDC balances
  const updateBalances = useCallback(async (accountAddress) => {
    if (!accountAddress) return;
    
    try {
      // Get native balance
      const balance = await publicClient.getBalance({
        address: accountAddress,
      });
      setNativeBalance(balance);
      
      // Get USDC balance
      const usdcBalance = await publicClient.readContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'balanceOf',
        args: [accountAddress],
      });
      setUsdcBalance(usdcBalance);
    } catch (error) {
      console.error('Error updating balances:', error);
    }
  }, [publicClient]);

  // Disconnect wallet
  const disconnect = () => {
    setAddress(null);
    setNativeBalance(null);
    setUsdcBalance(null);
    setIsConnected(false);
    setManualDisconnect(true); // Set flag to prevent auto-reconnect
    localStorage.removeItem('walletConnected');
    localStorage.setItem('manualDisconnect', 'true');
  };

  // Get escrow details for a specific invoice
  const getEscrowDetails = async (invoiceId) => {
    try {
      const details = await publicClient.readContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'escrows',
        args: [invoiceId],
      });
      return details;
    } catch (error) {
      console.error('Error fetching escrow details:', error);
      return null;
    }
  };

  // Get all escrow IDs for a user
  const getUserEscrowIds = async (userAddress) => {
    try {
      const invoiceIds = await publicClient.readContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'getEscrowsByAddress',
        args: [userAddress],
      });
      return invoiceIds;
    } catch (error) {
      console.error('Error fetching user escrow IDs:', error);
      return [];
    }
  };

  // Get details for multiple escrows in a batch
  const getEscrowsDetailsBatch = async (invoiceIds) => {
    try {
      const details = await publicClient.readContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'getEscrowsDetails',
        args: [invoiceIds],
      });
      return details;
    } catch (error) {
      console.error('Error fetching batch escrow details:', error);
      return null;
    }
  };

  // Restore user data from localStorage if needed
  const restoreUserData = useCallback(async () => {
    const savedInvoices = localStorage.getItem('userInvoices');
    if (savedInvoices) {
      try {
        return JSON.parse(savedInvoices);
      } catch (e) {
        console.error('Error parsing saved invoices:', e);
        return [];
      }
    }
    return [];
  }, []);

  // Listen for account changes
  useEffect(() => {
    if (window.ethereum) {
      const handleAccountsChanged = (accounts) => {
        // Don't auto-reconnect if user manually disconnected
        if (manualDisconnect) return;
        
        if (accounts.length === 0) {
          disconnect();
        } else {
          setAddress(accounts[0]);
          updateBalances(accounts[0]);
        }
      };

      const handleChainChanged = (chainId) => {
        window.location.reload();
      };

      window.ethereum.on('accountsChanged', handleAccountsChanged);
      window.ethereum.on('chainChanged', handleChainChanged);

      return () => {
        window.ethereum.removeListener('accountsChanged', handleAccountsChanged);
        window.ethereum.removeListener('chainChanged', handleChainChanged);
      };
    }
  }, [manualDisconnect, updateBalances]);

  // Initialize on component mount
  useEffect(() => {
    const init = async () => {
      // Check if user manually disconnected previously
      const wasManuallyDisconnected = localStorage.getItem('manualDisconnect') === 'true';
      if (wasManuallyDisconnected) {
        setManualDisconnect(true);
        localStorage.removeItem('manualDisconnect');
        return;
      }
      
      const account = await getAccount();
      if (account) {
        setAddress(account);
        setIsConnected(true);
        await updateBalances(account);
      }
    };

    init();
  }, [updateBalances]);

  return {
    address,
    connect,
    disconnect,
    nativeBalance,
    usdcBalance,
    isConnected,
    isLoading,
    error,
    getEscrowDetails,
    getUserEscrowIds,
    getEscrowsDetailsBatch,
    restoreUserData,
  };
};