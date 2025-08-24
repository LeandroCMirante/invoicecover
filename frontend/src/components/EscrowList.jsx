import { useState, useEffect } from 'react';
import { formatUnits } from 'viem';
import { useWallet } from '../hooks/useWallet';
import { ESCROW_V1_ADDRESS, escrowV1Abi } from '../contracts';

const statusNames = ['None', 'Funded', 'Delivered', 'Disputed', 'Released', 'Refunded'];
const statusColors = ['#666', '#1976d2', '#f57c00', '#d32f2f', '#2e7d32', '#7b1fa2'];

function EscrowList({ onAction }) {
  const { address, isConnected, getEscrowDetails, getUserEscrowIds, getEscrowsDetailsBatch } = useWallet();
  const [escrows, setEscrows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isConnected && address) {
      loadEscrowsFromBlockchain();
    } else {
      setEscrows([]);
      setError('');
    }
  }, [isConnected, address]);

  const loadEscrowsFromBlockchain = async () => {
    setLoading(true);
    setError('');
    try {
      console.log('📋 Loading escrows for:', address);
      
      // 1. Get all invoice IDs for this user
      const invoiceIds = await getUserEscrowIds(address);
      console.log('Found invoice IDs:', invoiceIds);
      
      if (invoiceIds.length === 0) {
        setEscrows([]);
        setError('No escrows found for your address.');
        return;
      }
      
      // 2. Get details for all escrows
      let escrowData = [];
      
      try {
        // Try batch method first (more efficient)
        const batchDetails = await getEscrowsDetailsBatch(invoiceIds);
        if (batchDetails) {
          const [clients, freelancers, amounts, dueAts, deliveredAts, statuses] = batchDetails;
          escrowData = invoiceIds.map((invoiceId, index) => ({
            id: invoiceId,
            client: clients[index],
            freelancer: freelancers[index],
            amount: amounts[index].toString(),
            dueAt: dueAts[index].toString(),
            deliveredAt: deliveredAts[index].toString(),
            status: Number(statuses[index])
          }));
        }
      } catch (batchError) {
        console.log('Batch method failed, falling back to individual calls:', batchError);
        // Fallback: individual calls
        escrowData = [];
        for (const invoiceId of invoiceIds) {
          try {
            const details = await getEscrowDetails(invoiceId);
            if (details) {
              const [client, freelancer, amount, dueAt, deliveredAt, status] = details;
              escrowData.push({
                id: invoiceId,
                client,
                freelancer,
                amount: amount.toString(),
                dueAt: dueAt.toString(),
                deliveredAt: deliveredAt.toString(),
                status: Number(status)
              });
            }
          } catch (error) {
            console.warn('Error loading individual escrow:', error);
          }
        }
      }
      
      setEscrows(escrowData);
      console.log('✅ Successfully loaded', escrowData.length, 'escrows');

    } catch (error) {
      console.error('Error loading escrows:', error);
      setError('Failed to load escrows. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (statusCode) => {
    return statusNames[statusCode] || 'Unknown';
  };

  const getStatusStyle = (statusCode) => {
    return {
      padding: '0.25rem 0.5rem',
      borderRadius: '12px',
      fontSize: '0.75rem',
      fontWeight: 'bold',
      background: statusColors[statusCode] || '#666',
      color: 'white',
      display: 'inline-block'
    };
  };

  const formatDate = (timestamp) => {
    if (timestamp === '0') return 'Not delivered';
    return new Date(Number(timestamp) * 1000).toLocaleDateString();
  };

  const formatAddress = (address) => {
    return `${address.slice(0, 8)}...${address.slice(-6)}`;
  };

  const getActionButton = (escrow) => {
    const isClient = address?.toLowerCase() === escrow.client.toLowerCase();
    const isFreelancer = address?.toLowerCase() === escrow.freelancer.toLowerCase();

    if (escrow.status === 1 && isFreelancer) {
      return (
        <button 
          onClick={() => onAction('markDelivered', escrow.id)}
          style={actionButtonStyle}
        >
          ✅ Mark Delivered
        </button>
      );
    }

    if ((escrow.status === 1 || escrow.status === 2) && isClient) {
      return (
        <button 
          onClick={() => onAction('release', escrow.id)}
          style={actionButtonStyle}
        >
          💰 Release Funds
        </button>
      );
    }

    if (escrow.status === 4 || escrow.status === 5) {
      return (
        <span style={{ color: '#666', fontSize: '0.9rem' }}>
          {escrow.status === 4 ? '✅ Released' : '↩️ Refunded'}
        </span>
      );
    }

    return null;
  };

  if (!isConnected) return null;

  return (
    <div style={{ marginTop: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap', gap: '1rem' }}>
        <h2 style={{ margin: 0 }}>📋 Your Escrows</h2>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button 
            onClick={loadEscrowsFromBlockchain}
            disabled={loading}
            style={{ 
              padding: '0.5rem 1rem', 
              background: '#28a745', 
              color: 'white', 
              border: 'none', 
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1
            }}
          >
            {loading ? '⏳ Loading...' : '🔄 Refresh'}
          </button>
        </div>
      </div>
      
      {error && (
        <div style={{ 
          padding: '1rem', 
          background: '#ffebee', 
          border: '1px solid #f44336', 
          borderRadius: '6px', 
          color: '#d32f2f',
          marginBottom: '1rem'
        }}>
          ⚠️ {error}
        </div>
      )}
      
      {loading && escrows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666' }}>
          <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>⏳</div>
          <p>Scanning blockchain for your escrows...</p>
        </div>
      ) : escrows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '3rem', color: '#666', background: '#f8f9fa', borderRadius: '8px' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
          <h3 style={{ color: '#495057', marginBottom: '0.5rem' }}>No escrows found</h3>
          <p>Create your first escrow to get started!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
          {escrows.map((escrow) => (
            <div key={escrow.id} style={cardStyle}>
              <div style={headerStyle}>
                <h4 style={{ margin: 0, fontFamily: 'monospace' }}>
                  #{escrow.id.slice(0, 8)}...
                </h4>
                <span style={getStatusStyle(escrow.status)}>
                  {getStatusText(escrow.status)}
                </span>
              </div>
              
              <div style={detailsStyle}>
                <div style={detailRowStyle}>
                  <span style={labelStyle}>👤 Client:</span>
                  <span style={valueStyle}>{formatAddress(escrow.client)}</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={labelStyle}>👨‍💻 Freelancer:</span>
                  <span style={valueStyle}>{formatAddress(escrow.freelancer)}</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={labelStyle}>💰 Amount:</span>
                  <span style={{ ...valueStyle, fontWeight: 'bold', color: '#1976d2' }}>
                    {formatUnits(BigInt(escrow.amount), 6)} USDC
                  </span>
                </div>
                <div style={detailRowStyle}>
                  <span style={labelStyle}>📅 Due Date:</span>
                  <span style={valueStyle}>{formatDate(escrow.dueAt)}</span>
                </div>
                <div style={detailRowStyle}>
                  <span style={labelStyle}>✅ Delivered:</span>
                  <span style={valueStyle}>{formatDate(escrow.deliveredAt)}</span>
                </div>
              </div>

              <div style={actionsStyle}>
                {getActionButton(escrow)}
                <button 
                  onClick={() => onAction('view', escrow.id)}
                  style={viewButtonStyle}
                >
                  👀 View Details
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Styles
const cardStyle = {
  border: '1px solid #e0e0e0',
  borderRadius: '12px',
  padding: '1.5rem',
  background: 'white',
  boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
  transition: 'transform 0.2s ease, box-shadow 0.2s ease'
};

const headerStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '1.25rem',
  paddingBottom: '1rem',
  borderBottom: '2px solid #f0f0f0'
};

const detailsStyle = {
  marginBottom: '1.5rem'
};

const detailRowStyle = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  marginBottom: '0.75rem',
  padding: '0.5rem',
  background: '#fafafa',
  borderRadius: '6px'
};

const labelStyle = {
  fontWeight: '600',
  color: '#555',
  fontSize: '0.9rem'
};

const valueStyle = {
  color: '#333',
  fontSize: '0.9rem',
  fontFamily: 'monospace'
};

const actionsStyle = {
  display: 'flex',
  gap: '0.75rem',
  justifyContent: 'flex-end',
  alignItems: 'center',
  flexWrap: 'wrap'
};

const actionButtonStyle = {
  padding: '0.6rem 1.2rem',
  background: 'linear-gradient(135deg, #007bff 0%, #0056b3 100%)',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.85rem'
};

const viewButtonStyle = {
  padding: '0.6rem 1.2rem',
  background: '#6c757d',
  color: 'white',
  border: 'none',
  borderRadius: '6px',
  cursor: 'pointer',
  fontWeight: '600',
  fontSize: '0.85rem'
};

export default EscrowList;