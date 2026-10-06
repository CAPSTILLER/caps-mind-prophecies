/**
 * Two-tap mint for one tablet: tap "Approve N GEAR", wait for Base to confirm, then tap "Mint".
 *
 * Every wallet request is sent straight from a tap, using numbers read beforehand. Nothing is
 * chained automatically after a confirmation: wallets that sign in a popup (Coinbase Smart Wallet)
 * block requests that do not come from a tap. No dependencies on the DOM so it can be tested.
 */
import type { Address, Hash } from 'viem';

export type MintStep = 'connect' | 'checking' | 'approve' | 'approving' | 'mint' | 'minting' | 'blocked';
export type MintMessage = { kind: 'info' | 'ok' | 'bad'; text: string; tx?: Hash; tokenLink?: number };
export type MintView = { step: MintStep; label: string; disabled: boolean; message: MintMessage | null };

export type MintQuote = { price: bigint; whole: number; serial: number; paused: boolean };
export type MintReceipt = {
  status: 'success' | 'reverted';
  blockNumber: bigint;
  minted?: { tabletId: bigint; serial: bigint; tokenId: bigint };
};

export type MintDeps = {
  account(): Address | null;
  /** Connect the wallet (prompts) and make sure it is on Base. */
  connect(): Promise<boolean>;
  /** True if the wallet is on Base, switching if needed. */
  ensureBase(): Promise<boolean>;
  /** Reads take an optional block: read at that block (fails on a node that is behind, so callers retry). */
  readQuote(tabletId: number, blockNumber?: bigint): Promise<MintQuote>;
  readAllowance(owner: Address, blockNumber?: bigint): Promise<bigint>;
  readBalance(owner: Address, blockNumber?: bigint): Promise<bigint>;
  sendApprove(owner: Address, amount: bigint): Promise<Hash>;
  sendMint(owner: Address, tabletId: number, maxPrice: bigint): Promise<Hash>;
  waitReceipt(hash: Hash, timeoutMs: number): Promise<MintReceipt>;
  sleep(ms: number): Promise<void>;
  explain(err: unknown): string;
  formatGear(raw: bigint): string;
};

export const CONFIRM_POLL_MS = 2_000;
export const CONFIRM_MAX_POLLS = 60;

export class MintFlow {
  view: MintView;
  private quote: MintQuote | null = null;
  private allowance = 0n;
  private balance = 0n;
  private listeners = new Set<(v: MintView) => void>();
  /** Called after a confirmed approve or mint, so other buttons can re-read. */
  onSettled: (() => void) | null = null;

  constructor(
    readonly tabletId: number,
    private deps: MintDeps,
  ) {
    this.view = { step: 'connect', label: 'Connect wallet to mint', disabled: false, message: null };
  }

  subscribe(fn: (v: MintView) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private show(step: MintStep, label: string, disabled: boolean, message: MintMessage | null | undefined = undefined) {
    this.view = { step, label, disabled, message: message === undefined ? this.view.message : message };
    for (const fn of this.listeners) fn(this.view);
  }

  private busy() {
    return this.view.step === 'approving' || this.view.step === 'minting' || this.view.step === 'checking';
  }

  private mintLabel() {
    return `Mint copy #${this.quote!.serial} for ${this.quote!.whole} GEAR`;
  }

  /** Read price, allowance and balance, then show Approve or Mint. Never opens the wallet. */
  async refresh(message: MintMessage | null | undefined = undefined, atBlock?: bigint): Promise<void> {
    if (this.view.step === 'approving' || this.view.step === 'minting') return;
    const owner = this.deps.account();
    if (!owner) {
      this.quote = null;
      return this.show('connect', 'Connect wallet to mint', false, message === undefined ? null : message);
    }
    this.show('checking', 'Checking…', true, message);
    // After a confirmed transaction, read at its block so a node that is a little behind cannot
    // show the old price or allowance. Retry a few times, then fall back to the latest block.
    const attempts = atBlock === undefined ? [undefined, undefined] : [atBlock, atBlock, atBlock, atBlock, undefined];
    let lastErr: unknown = null;
    let ok = false;
    for (let i = 0; i < attempts.length && !ok; i++) {
      if (i > 0) await this.deps.sleep(1_500);
      try {
        const b = attempts[i];
        const [quote, allowance, balance] = await Promise.all([
          this.deps.readQuote(this.tabletId, b),
          this.deps.readAllowance(owner, b),
          this.deps.readBalance(owner, b),
        ]);
        this.quote = quote;
        this.allowance = allowance;
        this.balance = balance;
        ok = true;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!ok) {
      return this.show('blocked', 'Try again', false, { kind: 'bad', text: 'Could not read Base: ' + this.deps.explain(lastErr) });
    }
    const q = this.quote!;
    if (q.paused) {
      return this.show('blocked', 'Minting paused', true, {
        kind: 'bad',
        text: 'The contract owner has paused the contract, so minting is stopped for now.',
      });
    }
    if (this.balance < q.price) {
      return this.show('blocked', `Need ${q.whole} GEAR`, true, {
        kind: 'bad',
        text: `Copy #${q.serial} costs ${q.whole} GEAR and this wallet holds ${this.deps.formatGear(this.balance)} GEAR.`,
      });
    }
    if (this.allowance >= q.price) this.show('mint', this.mintLabel(), false);
    else this.show('approve', `Approve ${q.whole} GEAR`, false);
  }

  /** The one button. Each tap sends at most one wallet request. */
  async tap(): Promise<void> {
    if (this.busy()) return;
    switch (this.view.step) {
      case 'connect':
        try {
          const ok = await this.deps.connect();
          await this.refresh(ok ? null : { kind: 'bad', text: 'Switch your wallet to Base, then tap again.' });
        } catch (e) {
          this.show('connect', 'Connect wallet to mint', false, { kind: 'bad', text: this.deps.explain(e) });
        }
        return;
      case 'blocked':
        return this.refresh(null);
      case 'approve':
        return this.approve();
      case 'mint':
        return this.mint();
    }
  }

  private async approve() {
    const owner = this.deps.account();
    const q = this.quote;
    if (!owner || !q) return this.refresh(null);
    const amount = q.price; // exact price, never unlimited
    this.show('approving', 'Confirm in your wallet…', true, {
      kind: 'info',
      text: `Step 1 of 2: approve exactly ${q.whole} GEAR for the tablets contract in your wallet.`,
    });
    let hash: Hash;
    try {
      if (!(await this.deps.ensureBase())) throw new Error('Switch your wallet to Base, then tap again.');
      hash = await this.deps.sendApprove(owner, amount);
    } catch (e) {
      return this.show('approve', `Approve ${q.whole} GEAR`, false, { kind: 'bad', text: this.deps.explain(e) });
    }
    this.show('approving', 'Waiting for Base…', true, {
      kind: 'info',
      text: 'Approval sent. Waiting for Base to confirm it before the Mint button turns on…',
      tx: hash,
    });
    const confirmed = await this.waitForAllowance(owner, hash, amount);
    this.view = { ...this.view, step: 'checking' };
    if (confirmed === 'reverted') {
      await this.refresh({ kind: 'bad', text: 'The approval failed on Base. Nothing was spent. Tap Approve to try again.', tx: hash });
      return;
    } else if (confirmed === 'ok') {
      this.allowance = amount;
      this.show('mint', this.mintLabel(), false, {
        kind: 'ok',
        text: `Approved ${q.whole} GEAR. Step 2 of 2: tap Mint to finish.`,
        tx: hash,
      });
      this.onSettled?.();
    } else {
      await this.refresh({
        kind: 'info',
        text: 'Base has not confirmed the approval yet. If your wallet shows it as done, tap the button to check again.',
        tx: hash,
      });
    }
  }

  /**
   * Wait until the new allowance is visible from a fresh read. Uses the receipt when the wallet
   * returned a normal transaction hash, and keeps polling the allowance either way (smart wallets
   * can return an id that is not a transaction hash).
   */
  private async waitForAllowance(owner: Address, hash: Hash, amount: bigint): Promise<'ok' | 'reverted' | 'timeout'> {
    let receipt: MintReceipt | null = null;
    this.deps.waitReceipt(hash, CONFIRM_POLL_MS * CONFIRM_MAX_POLLS).then(
      (r) => (receipt = r),
      () => undefined,
    );
    for (let i = 0; i < CONFIRM_MAX_POLLS; i++) {
      await this.deps.sleep(CONFIRM_POLL_MS);
      const r = receipt as MintReceipt | null;
      if (r?.status === 'reverted') return 'reverted';
      try {
        const a = await this.deps.readAllowance(owner, r?.blockNumber);
        if (a >= amount) return 'ok';
      } catch {
        /* node behind or rate limited: try again */
      }
    }
    return 'timeout';
  }

  private async mint() {
    const owner = this.deps.account();
    const q = this.quote;
    if (!owner || !q) return this.refresh(null);
    this.show('minting', 'Confirm in your wallet…', true, {
      kind: 'info',
      text: `Confirm the mint of copy #${q.serial} for ${q.whole} GEAR in your wallet.`,
    });
    let hash: Hash;
    try {
      if (!(await this.deps.ensureBase())) throw new Error('Switch your wallet to Base, then tap again.');
      hash = await this.deps.sendMint(owner, this.tabletId, q.price);
    } catch (e) {
      this.view = { ...this.view, step: 'checking' };
      return this.refresh({ kind: 'bad', text: this.deps.explain(e) });
    }
    this.show('minting', 'Minting…', true, { kind: 'info', text: 'Mint sent. Waiting for Base…', tx: hash });
    const before = this.allowance;
    const r = await this.waitForMint(owner, hash, before, q.price);
    let message: MintMessage;
    let atBlock: bigint | undefined;
    if (r === 'timeout') {
      message = { kind: 'info', text: 'Mint sent. Base is taking a while to confirm it; check your wallet.', tx: hash };
    } else if (r.status === 'success') {
      atBlock = r.blockNumber;
      const m = r.minted;
      message = {
        kind: 'ok',
        text: m
          ? `You minted Prophecy Tablet ${m.tabletId} #${m.serial} (token ID ${m.tokenId}).`
          : `You minted copy #${q.serial} of Tablet #${this.tabletId}.`,
        tx: hash,
      };
    } else {
      atBlock = r.blockNumber;
      message = { kind: 'bad', text: 'The mint failed on Base. Your GEAR was not spent.', tx: hash };
    }
    this.view = { ...this.view, step: 'checking' };
    await this.refresh(message, atBlock);
    this.onSettled?.();
  }

  /**
   * Wait for the mint: the receipt when the wallet returned a normal transaction hash, or the
   * wallet's GEAR allowance dropping by the price (only this wallet's mint can do that).
   */
  private async waitForMint(
    owner: Address,
    hash: Hash,
    allowanceBefore: bigint,
    price: bigint,
  ): Promise<{ status: 'success' | 'reverted'; blockNumber?: bigint; minted?: MintReceipt['minted'] } | 'timeout'> {
    let receipt: MintReceipt | null = null;
    this.deps.waitReceipt(hash, CONFIRM_POLL_MS * CONFIRM_MAX_POLLS).then(
      (r) => (receipt = r),
      () => undefined,
    );
    for (let i = 0; i < CONFIRM_MAX_POLLS; i++) {
      await this.deps.sleep(CONFIRM_POLL_MS);
      const r = receipt as MintReceipt | null;
      if (r) return r;
      try {
        const a = await this.deps.readAllowance(owner);
        if (a + price <= allowanceBefore) {
          // Give the receipt a moment so the success message can name the copy.
          await this.deps.sleep(CONFIRM_POLL_MS);
          return (receipt as MintReceipt | null) ?? { status: 'success' };
        }
      } catch {
        /* try again */
      }
    }
    return 'timeout';
  }
}
