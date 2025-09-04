import { useState } from 'react';
import { useWallet } from './hooks/useWallet';
import { createWalletClient, custom, formatUnits } from 'viem';
import {
  MOCK_USDC_ADDRESS,
  ESCROW_V1_ADDRESS,
  mockUsdcAbi,
  escrowV1Abi,
} from './contracts';
import EscrowList from './components/EscrowList';
import './components/EscrowList.css';

// Custom chain configuration for Anvil
const anvilChain = {
  id: 31337,
  name: 'Anvil Local',
  network: 'anvil',
  nativeCurrency: {
    decimals: 18,
    name: 'Ethereum',
    symbol: 'ETH',
  },
  rpcUrls: {
    default: {
      http: ['http://127.0.0.1:8545'],
    },
    public: {
      http: ['http://127.0.0.1:8545'],
    },
  },
};

// Configure the wallet client for writing to the blockchain
const walletClient = createWalletClient({
  chain: anvilChain,
  transport: custom(window.ethereum),
});

function App() {
  const {
    address,
    connect,
    disconnect,
    nativeBalance,
    usdcBalance,
    isConnected,
    isLoading,
    error,
  } = useWallet();

  
  const [isCreating, setIsCreating] = useState(false);
  const [formData, setFormData] = useState({
    freelancer: '',
    amount: '',
    dueDate: '',
  });

  const handleDisconnect = () => {
    // Clear localStorage on disconnect
    localStorage.removeItem('userInvoices');
    disconnect();
    setFormData({ freelancer: '', amount: '', dueDate: '' });
    alert('Wallet disconnected and local data cleared.');
  };

  // Enhanced connect handler
  const handleConnect = async () => {
    try {
      await connect();
      // After connecting, we'll rely on blockchain data only
      alert('Wallet connected! Escrows will be loaded from blockchain.');
    } catch (error) {
      console.error('Connection failed:', error);
    }
  };

  const handleAction = async (actionType, invoiceId) => {
    switch (actionType) {
      case 'markDelivered':
        await markAsDelivered(invoiceId);
        break;
      case 'release':
        await releaseEscrow(invoiceId);
        break;
      case 'view':
        console.log('View details for:', invoiceId);
        break;
    }
  };

  const markAsDelivered = async (invoiceId) => {
    try {
      console.log('Marking invoice as delivered:', invoiceId);

      const hash = await walletClient.writeContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'markDelivered',
        args: [invoiceId],
        account: address,
        chain: anvilChain,
      });

      console.log('Marked delivered TX:', hash);
      alert('Work marked as delivered successfully!');

      // Refresh the page after a short delay to show updated status
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Error marking delivered:', error);
      alert(
        'Failed to mark as delivered: ' + (error.shortMessage || error.message)
      );
    }
  };

  const releaseEscrow = async (invoiceId) => {
    try {
      console.log('Releasing escrow funds for invoice:', invoiceId);

      const hash = await walletClient.writeContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'releaseToFreelancer',
        args: [invoiceId],
        account: address,
        chain: anvilChain,
      });

      console.log('Release TX:', hash);
      alert('Funds released to freelancer successfully!');

      // Refresh the page after a short delay to show updated status and balances
      setTimeout(() => {
        window.location.reload();
      }, 3000);
    } catch (error) {
      console.error('Error releasing escrow:', error);

      // Provide more specific error messages
      if (error.message?.includes('NOT_ELIGIBLE')) {
        alert(
          'Cannot release funds yet: Escrow is not eligible for release. Check due date or dispute window.'
        );
      } else if (error.message?.includes('ALREADY_SETTLED')) {
        alert('Cannot release funds: Escrow has already been settled.');
      } else {
        alert(
          'Failed to release escrow: ' + (error.shortMessage || error.message)
        );
      }
    }
  };

  // Function to handle the escrow creation
  const createEscrow = async (e) => {
    e.preventDefault();
    if (!isConnected) return;

    setIsCreating(true);
    try {
      const { freelancer, amount, dueDate } = formData;

      // 1. Validate freelancer address
      if (
        !freelancer ||
        !freelancer.startsWith('0x') ||
        freelancer.length !== 42
      ) {
        throw new Error('Invalid freelancer address');
      }

      // 2. Convert amount to USDC units (6 decimals)
      const amountInWei = BigInt(Number(amount) * 10 ** 6);

      // 3. Generate a unique invoice ID (bytes32)
      const randomBytes = new Uint8Array(32);
      crypto.getRandomValues(randomBytes);
      const invoiceId =
        '0x' +
        Array.from(randomBytes)
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('');

      console.log('Generated invoiceId:', invoiceId);

      // 4. Approve the Escrow contract to spend USDC
      const approveHash = await walletClient.writeContract({
        address: MOCK_USDC_ADDRESS,
        abi: mockUsdcAbi,
        functionName: 'approve',
        args: [ESCROW_V1_ADDRESS, amountInWei],
        account: address,
        chain: anvilChain,
      });
      console.log('Approval TX:', approveHash);

      // 5. Open the escrow
      const dueTimestamp = Math.floor(new Date(dueDate).getTime() / 1000);
      const escrowHash = await walletClient.writeContract({
        address: ESCROW_V1_ADDRESS,
        abi: escrowV1Abi,
        functionName: 'openEscrow',
        args: [invoiceId, freelancer, amountInWei, BigInt(dueTimestamp)],
        account: address,
        chain: anvilChain,
      });
      console.log('Escrow TX:', escrowHash);

      // 6. Store invoice ID in localStorage for persistence
      const savedInvoices = JSON.parse(
        localStorage.getItem('userInvoices') || '[]'
      );
      if (!savedInvoices.includes(invoiceId)) {
        savedInvoices.push(invoiceId);
        localStorage.setItem('userInvoices', JSON.stringify(savedInvoices));
        console.log('Saved invoice ID to localStorage:', invoiceId);
      }

      // 7. Reset form and show success
      alert('Escrow created successfully!');
      setFormData({ freelancer: '', amount: '', dueDate: '' });

      // 8. Refresh the page to show the new escrow in the list
      setTimeout(() => {
        window.location.reload();
      }, 2000); // Small delay to ensure transaction is mined
    } catch (error) {
      console.error('Error creating escrow:', error);
      alert(
        'Failed to create escrow: ' + (error.shortMessage || error.message)
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (!isConnected) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <h1>InvoiceCover</h1>
        <button
          onClick={handleConnect}
          disabled={isLoading}
          style={{
            padding: '1rem 2rem',
            fontSize: '1.2rem',
            marginTop: '2rem',
            background: isLoading ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '8px',
            cursor: isLoading ? 'not-allowed' : 'pointer',
          }}
        >
          {isLoading ? 'Connecting...' : 'Connect Wallet'}
        </button>
        {error && (
          <p style={{ color: 'red', marginTop: '1rem' }}>
            Error: {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
      <h1>InvoiceCover</h1>

      {/* Wallet Info */}
      {isConnected ? (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #f8f9ff 0%, #e8f2ff 100%)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              marginBottom: '1rem',
            }}
          >
            <div>
              <h3
                style={{
                  margin: '0 0 0.5rem 0',
                  color: '#2c5282',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                }}
              >
                <span style={{ fontSize: '1.2em' }}>💰</span>
                Wallet Connected
              </h3>
              <p
                style={{
                  margin: '0',
                  color: '#4a5568',
                  fontSize: '0.9rem',
                  fontFamily: 'monospace',
                }}
              >
                {address.slice(0, 8)}...{address.slice(-6)}
              </p>
            </div>
            <button
              onClick={handleDisconnect}
              style={{
                padding: '0.5rem 1rem',
                background: 'linear-gradient(135deg, #dc3545 0%, #c82333 100%)',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: '0.8rem',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                transition: 'all 0.2s ease',
              }}
              onMouseOver={(e) =>
                (e.target.style.transform = 'translateY(-1px)')
              }
              onMouseOut={(e) => (e.target.style.transform = 'translateY(0)')}
            >
              Disconnect
            </button>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '1rem',
              padding: '1rem',
              background: 'white',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
            }}
          >
            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#2d3748',
                  marginBottom: '0.25rem',
                }}
              >
                {nativeBalance ? formatUnits(nativeBalance, 18) : '0'}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#718096',
                  fontWeight: '600',
                }}
              >
                ETH BALANCE
              </div>
            </div>

            <div style={{ textAlign: 'center' }}>
              <div
                style={{
                  fontSize: '1.5rem',
                  fontWeight: 'bold',
                  color: '#2d3748',
                  marginBottom: '0.25rem',
                }}
              >
                {usdcBalance ? formatUnits(usdcBalance, 6) : '0'}
              </div>
              <div
                style={{
                  fontSize: '0.8rem',
                  color: '#718096',
                  fontWeight: '600',
                }}
              >
                USDC BALANCE
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginBottom: '2rem',
            padding: '2.5rem',
            border: '2px dashed #cbd5e0',
            borderRadius: '16px',
            background: 'linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%)',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>🔗</div>
          <h3
            style={{
              margin: '0 0 0.5rem 0',
              color: '#2d3748',
              fontSize: '1.5rem',
            }}
          >
            Connect Your Wallet
          </h3>
          <p
            style={{
              color: '#718096',
              marginBottom: '2rem',
              fontSize: '0.95rem',
            }}
          >
            Connect your wallet to create and manage escrows on the blockchain
          </p>
          <button
            onClick={handleConnect}
            disabled={isLoading}
            style={{
              padding: '1rem 2.5rem',
              fontSize: '1.1rem',
              background: isLoading 
                ? '#ccc' 
                : 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
              fontWeight: 'bold',
              boxShadow: '0 4px 12px rgba(0,123,255,0.3)',
              transition: 'all 0.2s ease',
            }}
            onMouseOver={(e) => {
              if (!isLoading) {
                e.target.style.transform = 'translateY(-2px)';
                e.target.style.boxShadow = '0 6px 16px rgba(0,123,255,0.4)';
              }
            }}
            onMouseOut={(e) => {
              e.target.style.transform = 'translateY(0)';
              e.target.style.boxShadow = '0 4px 12px rgba(0,123,255,0.3)';
            }}
          >
            {isLoading ? 'Connecting...' : 'Connect Wallet'}
          </button>
          {error && (
            <p style={{ color: 'red', marginTop: '1rem' }}>
              Error: {error}
            </p>
          )}
        </div>
      )}

      {/* Create Escrow Form - Only show when connected */}
      {isConnected && (
        <div
          style={{
            marginBottom: '2rem',
            padding: '1.5rem',
            border: '1px solid #ddd',
            borderRadius: '8px',
            background: 'white',
          }}
        >
          <h2 style={{ marginTop: 0 }}>Create New Escrow</h2>
          <form
            onSubmit={createEscrow}
            style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
          >
            <div>
              <label
                htmlFor="freelancer"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 'bold',
                }}
              >
                Freelancer Address (0x...)
              </label>
              <input
                id="freelancer"
                type="text"
                placeholder="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
                value={formData.freelancer}
                onChange={(e) =>
                  setFormData({ ...formData, freelancer: e.target.value })
                }
                required
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="amount"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 'bold',
                }}
              >
                Amount (USDC)
              </label>
              <input
                id="amount"
                type="number"
                placeholder="100"
                value={formData.amount}
                onChange={(e) =>
                  setFormData({ ...formData, amount: e.target.value })
                }
                required
                min="1"
                step="0.01"
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="dueDate"
                style={{
                  display: 'block',
                  marginBottom: '0.5rem',
                  fontWeight: 'bold',
                }}
              >
              Due Date
              </label>
              <input
                id="dueDate"
                type="datetime-local"
                value={formData.dueDate}
                onChange={(e) =>
                  setFormData({ ...formData, dueDate: e.target.value })
                }
                required
                style={{
                  padding: '0.75rem',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  width: '100%',
                  boxSizing: 'border-box',
                }}
              />
            </div>

            <button
              type="submit"
              disabled={isCreating || !isConnected}
              style={{
                padding: '1rem 1.5rem',
                background: isCreating || !isConnected ? '#ccc' : '#007bff',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: isCreating || !isConnected ? 'not-allowed' : 'pointer',
                fontSize: '1rem',
                fontWeight: 'bold',
              }}
            >
              {isCreating ? 'Creating Escrow...' : 'Create Escrow'}
            </button>
          </form>
        </div>
      )}

      {/* Escrow List - Only show when connected */}
      {isConnected && <EscrowList onAction={handleAction} />}

      {/* Connection reminder (shown when not connected) */}
      {!isConnected && (
        <div style={{ textAlign: 'center', marginTop: '3rem' }}>
          <button
            onClick={handleConnect}
            disabled={isLoading}
            style={{
              padding: '1rem 2rem',
              fontSize: '1.2rem',
              background: isLoading ? '#ccc' : '#007bff',
              color: 'white',
              border: 'none',
              borderRadius: '8px',
              cursor: isLoading ? 'not-allowed' : 'pointer',
            }}
          >
            {isLoading ? 'Connecting...' : 'Connect Wallet'}
          </button>
          <p style={{ marginTop: '1rem', color: '#666' }}>
            Connect your wallet to create and manage escrows
          </p>
          {error && (
            <p style={{ color: 'red', marginTop: '1rem' }}>
              Error: {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
