import { useState, useEffect } from 'react';
import {
  createPublicClient,
  http,
  createWalletClient,
  custom,
  formatEther,
} from 'viem';
import { mainnet } from 'viem/chains';
import { useQuery } from '@tanstack/react-query';
import { MOCK_USDC_ADDRESS, mockUsdcAbi } from '../contracts';
import { ESCROW_V1_ADDRESS, escrowV1Abi } from '../contracts'; // ADD THIS IMPORT

// Configure the public client to read from the blockchain
const publicClient = createPublicClient({
  chain: mainnet,
  transport: http('http://127.0.0.1:8545'),
});

export function useWallet() {
  const [address, setAddress] = useState(null);
  const [accounts, setAccounts] = useState([]);
  const [activeAccountIndex, setActiveAccountIndex] = useState(0);
  const [nativeBalance, setNativeBalance] = useState(null);
  const [usdcBalance, setUsdcBalance] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  // 1. Function to connect the wallet (MetaMask)
  const connect = async () => {
    if (window.ethereum) {
      try {
        const [account] = await window.ethereum.request({
          method: 'eth_requestAccounts',
        });
        setAddress(account);
      } catch (error) {
        console.error('User rejected connection', error);
      }
    } else {
      alert('Please install MetaMask!');
    }
  };

  // 2. Function to get the user's native balance (ETH on Anvil)
  const nativeBalanceQuery = useQuery({
    queryKey: ['nativeBalance', address],
    queryFn: async () => {
      if (!address) return 0n;
      const balance = await publicClient.getBalance({ address });
      return balance;
    },
    enabled: !!address,
  });

  // 3. Function to get the user's USDC balance
  const usdcBalanceQuery = useQuery({
    queryKey: ['usdcBalance', address],
    queryFn: async () => {
      if (!address) return 0n;
      const balance = await publicClient.readContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'balanceOf',
        args: [address],
      });
      return balance;
    },
    enabled: !!address,
  });

  // 4. Function to get escrow details - FIXED
  const getEscrowDetails = async (invoiceId) => {
    try {
      const details = await publicClient.readContract({
        address: ESCROW_V1_ADDRESS, // NOW DEFINED
        abi: escrowV1Abi, // NOW DEFINED
        functionName: 'escrows',
        args: [invoiceId],
      });
      return details;
    } catch (error) {
      console.error('Error fetching escrow:', error);
      return null;
    }
  };

  // 5. Function to refresh balances
  const refreshBalances = () => {
    nativeBalanceQuery.refetch();
    usdcBalanceQuery.refetch();
  };

  const disconnect = () => {
    setAddress(null);
    console.log('Wallet disconnected');
  };

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
      console.error('Error getting user escrow IDs:', error);
      return [];
    }
  };

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
      console.error('Error getting batch escrow details:', error);
      return null;
    }
  };

  const restoreUserData = () => {
    const savedInvoices = JSON.parse(
      localStorage.getItem('userInvoices') || '[]'
    );
    console.log('Restored invoices on reconnect:', savedInvoices);
    return savedInvoices;
  };

  // Auto-connect if wallet was connected before
  useEffect(() => {
    if (window.ethereum?.selectedAddress) {
      setAddress(window.ethereum.selectedAddress);
    }
  }, []);

  return {
    address,
    connect,
    disconnect,
    restoreUserData,
    nativeBalance: nativeBalanceQuery.data,
    usdcBalance: usdcBalanceQuery.data,
    isConnected: !!address,
    getEscrowDetails,
    refreshBalances,
    getUserEscrowIds,
    getEscrowsDetailsBatch,
  };
}
