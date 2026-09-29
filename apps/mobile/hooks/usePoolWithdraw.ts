import { useCallback, useEffect, useMemo, useState } from "react";

import { useWallet } from "./useWallet";
import { useSubmitTx } from "./useSubmitTx";
import {
  isPoolGovernanceLoaded,
  isValidStellarAddress,
  normalizeAddress,
  recordPoolWithdrawal,
  refreshPoolFromIndexer,
  usePoolRecord,
  verifyPoolApprovals,
  type PoolApproval,
  type PoolSignerStatus,
} from "../utils/poolStore";

export type { PoolApproval, PoolSignerStatus } from "../utils/poolStore";

export interface UsePoolWithdrawReturn {
  pool: ReturnType<typeof usePoolRecord>;
  recipient: string;
  amount: string;
  connectedAddress: string | null;
  connectedIsAdmin: boolean;
  signerStatuses: PoolSignerStatus[];
  approvals: PoolApproval[];
  canSubmit: boolean;
  recipientError: string | null;
  thresholdStatus: string;
  status: string | null;
  /** Wallet-signed approval for the *connected* admin. Never signs for anyone else. */
  signApproval: () => Promise<boolean>;
  setRecipient: (value: string) => void;
  setAmount: (value: string) => void;
  submit: () => Promise<string | null>;
  reset: () => void;
}

/**
 * usePoolWithdraw
 *
 * #1557 — approvals are wallet signatures, not list entries. There is no API
 * to approve on another admin's behalf: `signApproval` builds an approval
 * transaction for the connected address and submits it through `useSubmitTx`,
 * so the only approval the UI can express is one the connected wallet signed
 * on-chain. The withdrawal itself goes to the contract as a threshold set of
 * those signatures and is recorded locally only after the chain confirms, and
 * `canSubmit` fails closed whenever the admin set is not chain-sourced or the
 * connected wallet is not a known admin.
 */
export function usePoolWithdraw(poolId: string): UsePoolWithdrawReturn {
  const pool = usePoolRecord(poolId);
  const { address, connected } = useWallet();
  const submitTx = useSubmitTx();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("");
  const [approvals, setApprovals] = useState<PoolApproval[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [governanceLoaded, setGovernanceLoaded] = useState(pool.source === "chain");

  const connectedAddress = address ? normalizeAddress(address) : null;
  // Fail closed: an unknown or disconnected address is never treated as an admin.
  const connectedIsAdmin = Boolean(
    connected && connectedAddress && pool.admins.includes(connectedAddress)
  );

  // #1557 — the admin set and threshold come from the indexer/chain, never from
  // whatever the local store happened to hold.
  useEffect(() => {
    let cancelled = false;

    refreshPoolFromIndexer(poolId)
      .then((applied) => {
        if (!cancelled) setGovernanceLoaded(applied);
      })
      .catch(() => {
        if (!cancelled) setGovernanceLoaded(false);
      });

    return () => {
      cancelled = true;
    };
  }, [poolId, pool.source]);

  const signerStatuses = useMemo<PoolSignerStatus[]>(
    () =>
      pool.admins.map((admin) => ({
        address: admin,
        approved: approvals.some((approval) => approval.address === admin),
      })),
    [approvals, pool.admins]
  );

  const recipientError =
    recipient.trim().length === 0
      ? "Recipient is required"
      : isValidStellarAddress(recipient)
        ? null
        : "Enter a valid Stellar address";

  const thresholdStatus = `${approvals.length}/${pool.threshold} approvals`;
  const approvalVerdict = verifyPoolApprovals(pool, approvals);
  const approvalError: string | null = approvalVerdict.valid
    ? null
    : (approvalVerdict as { valid: false; reason: string }).reason;
  const canSubmit = Boolean(
    amount.trim() &&
    recipientError === null &&
    connectedIsAdmin &&
    governanceLoaded &&
    isPoolGovernanceLoaded(pool) &&
    approvalVerdict.valid
  );

  const signApproval = useCallback(async (): Promise<boolean> => {
    setStatus(null);

    if (!connectedAddress || !connectedIsAdmin) {
      setStatus("Connect an admin wallet to approve this withdrawal.");
      return false;
    }

    try {
      // The wallet signs (and broadcasts) this admin's approval; the resulting
      // on-chain proof is what the contract will verify.
      const signature = await submitTx(
        `pool_withdraw_approve:${poolId}:${connectedAddress}:${recipient.trim()}:${amount.trim()}`
      );

      setApprovals((current) => [
        ...current.filter((approval) => approval.address !== connectedAddress),
        { address: connectedAddress, signature, signedAt: Date.now() },
      ]);
      return true;
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Approval failed. Please try again.");
      return false;
    }
  }, [amount, connectedAddress, connectedIsAdmin, poolId, recipient, submitTx]);

  const submit = useCallback(async (): Promise<string | null> => {
    setStatus(null);

    if (!canSubmit) {
      setStatus(approvalError ?? "Not authorised to submit this withdrawal.");
      return null;
    }

    // Hand the threshold set of admin signatures to the contract and let it
    // verify. The local record is written only once the chain has confirmed.
    await submitTx(
      `pool_withdraw:${poolId}:${normalizeAddress(recipient)}:${amount.trim()}:${approvals
        .map((approval) => `${approval.address}=${approval.signature}`)
        .join(",")}`
    );

    const withdrawal = recordPoolWithdrawal(poolId, {
      recipient: normalizeAddress(recipient),
      amount: amount.trim(),
      approvals,
    });

    return withdrawal?.id ?? null;
  }, [amount, approvalError, approvals, canSubmit, poolId, recipient, submitTx]);

  const reset = useCallback(() => {
    setRecipient("");
    setAmount("");
    setApprovals([]);
    setStatus(null);
  }, []);

  return {
    pool,
    recipient,
    amount,
    connectedAddress,
    connectedIsAdmin,
    signerStatuses,
    approvals,
    canSubmit,
    recipientError,
    thresholdStatus,
    status,
    signApproval,
    setRecipient,
    setAmount,
    submit,
    reset,
  };
}
