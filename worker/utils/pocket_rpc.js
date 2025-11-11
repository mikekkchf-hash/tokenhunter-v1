// worker/utils/pocket_rpc.js
class PocketRPC {
  constructor() {
    this.urls = [
      'https://eth-mainnet.gateway.pokt.network/v1/lb/61aaa97d3c2c4c0032669156',
      'https://eth-mainnet.gateway.pokt.network/v1/lb/61aaa97d3c2c4c0032669156',
      // می‌توانید endpointهای دیگر را اضافه کنید
    ];
    this.currentUrlIndex = 0;
  }
  
  async fetch(method, params = []) {
    const url = this.urls[this.currentUrlIndex];
    this.currentUrlIndex = (this.currentUrlIndex + 1) % this.urls.length;
    
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: Date.now(),
          method,
          params
        })
      });
      
      const result = await response.json();
      return result.result;
    } catch (e) {
      console.error(`Pocket RPC failed for ${method}:`, e);
      // در صورت خطا، endpoint بعدی را امتحان کن
      return this.fetch(method, params);
    }
  }
  
  async getTransactionReceipt(txHash) {
    return this.fetch('eth_getTransactionReceipt', [txHash]);
  }
  
  async getLogs(filter) {
    return this.fetch('eth_getLogs', [filter]);
  }
  
  async getBlockNumber() {
    return this.fetch('eth_blockNumber');
  }
}
