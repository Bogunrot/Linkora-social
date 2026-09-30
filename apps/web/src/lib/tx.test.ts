import { describe, it, expect, vi } from 'jest';
import { signTransaction } from './tx';
import { mockWallet } from '../__mocks__/wallet';

describe('signTransaction', () => {
  it('should sign transaction with wallet', async () => {
    const mockSign = vi.fn().mockResolvedValue('signedTx');
    mockWallet.signTransaction.mockImplementation(mockSign);

    const result = await signTransaction('txData');
    expect(result).toBe('signedTx');
    expect(mockSign).toHaveBeenCalledWith('txData');
  });

  it('should throw error when signing fails', async () => {
    mockWallet.signTransaction.mockRejectedValue(new Error('Signing failed'));

    await expect(signTransaction('txData')).rejects.toThrow('Signing failed');
  });
});