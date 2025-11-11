// worker/utils/zapper_adapter.js
export async function getWalletPortfolio(walletAddress) {
  const url = `https://api.zapper.xyz/v2/balances/apps?addresses%5B%5D=${walletAddress}&groupKey=app`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${btoa(process.env.ZAPPER_KEY || 'free_community_key')}`
      }
    });
    
    if (!response.ok) {
      console.error('Zapper API error:', response.status);
      return null;
    }
    
    const data = await response.json();
    return data;
  } catch (e) {
    console.error('Zapper API failed:', e);
    return null;
  }
}

export async function getWalletPositions(walletAddress) {
  const url = `https://api.zapper.xyz/v2/balances/positions?addresses%5B%5D=${walletAddress}`;
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${btoa(process.env.ZAPPER_KEY || 'free_community_key')}`
      }
    });
    
    if (!response.ok) {
      console.error('Zapper positions error:', response.status);
      return [];
    }
    
    const data = await response.json();
    return data.positions || [];
  } catch (e) {
    console.error('Zapper positions failed:', e);
    return [];
  }
}
