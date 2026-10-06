import { describe, expect, it } from 'vitest';
import type { Address, Hash } from 'viem';
import { MintFlow, type MintDeps, type MintReceipt } from '../src/mintFlow.js';

const OWNER = '0x555949adeEaedd22D9c41DE10966f32eb6884507' as Address;
const UNIT = 1_000_000n;

/** Fake Base + fake wallet. Approvals land only when the test says the block is confirmed. */
function setup(opts: { allowance?: bigint; balance?: bigint; minted?: number; connected?: boolean; lagReads?: number } = {}) {
  const chain = { allowance: opts.allowance ?? 0n, balance: opts.balance ?? 100n * UNIT, minted: opts.minted ?? 0, block: 100n };
  let connected = opts.connected ?? true;
  let lagReads = opts.lagReads ?? 0;
  const sent: Array<{ fn: 'approve' | 'mint'; args: unknown[] }> = [];
  const pending: Array<() => void> = [];
  const price = () => BigInt(Math.min(1000, 2 ** chain.minted)) * UNIT;
  const receipts = new Map<Hash, { resolve: (r: MintReceipt) => void; promise: Promise<MintReceipt> }>();
  const newHash = (n: number) => ('0x' + n.toString(16).padStart(64, '0')) as Hash;
  const track = (hash: Hash) => {
    let resolve!: (r: MintReceipt) => void;
    const promise = new Promise<MintReceipt>((r) => (resolve = r));
    receipts.set(hash, { resolve, promise });
  };
  const deps: MintDeps = {
    account: () => (connected ? OWNER : null),
    connect: async () => ((connected = true), true),
    ensureBase: async () => true,
    readQuote: async () => ({ price: price(), whole: Number(price() / UNIT), serial: chain.minted + 1, paused: false }),
    readAllowance: async (_o, blockNumber) => {
      if (blockNumber !== undefined && lagReads > 0) {
        lagReads--;
        throw new Error('header not found');
      }
      return chain.allowance;
    },
    readBalance: async () => chain.balance,
    sendApprove: async (o, amount) => {
      sent.push({ fn: 'approve', args: [o, amount] });
      const hash = newHash(sent.length);
      track(hash);
      pending.push(() => {
        chain.allowance = amount;
        chain.block++;
        receipts.get(hash)!.resolve({ status: 'success', blockNumber: chain.block });
      });
      return hash;
    },
    sendMint: async (o, tabletId, maxPrice) => {
      sent.push({ fn: 'mint', args: [o, tabletId, maxPrice] });
      const hash = newHash(sent.length);
      track(hash);
      pending.push(() => {
        const p = price();
        if (chain.allowance < p || maxPrice < p) throw new Error('would revert');
        chain.allowance -= p;
        chain.balance -= p;
        chain.minted++;
        chain.block++;
        receipts.get(hash)!.resolve({
          status: 'success',
          blockNumber: chain.block,
          minted: { tabletId: BigInt(tabletId), serial: BigInt(chain.minted), tokenId: 7n },
        });
      });
      return hash;
    },
    waitReceipt: (hash) => receipts.get(hash)!.promise,
    sleep: () => new Promise((r) => setTimeout(r, 0)),
    explain: (e) => (e instanceof Error ? e.message : String(e)),
    formatGear: (raw) => String(raw / UNIT),
  };
  const confirmNext = () => pending.shift()!();
  return { deps, chain, sent, confirmNext, setConnected: (v: boolean) => (connected = v) };
}

const tick = () => new Promise((r) => setTimeout(r, 0));
async function until(cond: () => boolean, max = 500) {
  for (let i = 0; i < max && !cond(); i++) await tick();
  expect(cond()).toBe(true);
}

describe('approve-then-mint (two taps)', () => {
  it('disconnected: the button connects first and sends nothing', async () => {
    const t = setup({ connected: false });
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    expect(flow.view).toMatchObject({ step: 'connect', label: 'Connect wallet to mint', disabled: false });
    await flow.tap();
    expect(t.sent).toHaveLength(0);
    expect(flow.view).toMatchObject({ step: 'approve', label: 'Approve 1 GEAR' });
  });

  it('approve tap sends exactly one exact-amount approve; Mint appears only after Base confirms; mint tap sends one mint', async () => {
    const t = setup();
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    expect(flow.view.label).toBe('Approve 1 GEAR');

    const tap1 = flow.tap();
    await until(() => t.sent.length === 1);
    expect(t.sent[0]).toEqual({ fn: 'approve', args: [OWNER, 1n * UNIT] }); // exact, never unlimited
    // Not confirmed yet: still waiting, button disabled, no mint sent.
    for (let i = 0; i < 20; i++) await tick();
    expect(flow.view).toMatchObject({ step: 'approving', disabled: true });
    expect(flow.view.label).not.toMatch(/Mint/);
    // Extra taps while waiting do nothing.
    await flow.tap();
    expect(t.sent).toHaveLength(1);

    t.confirmNext();
    await tap1;
    expect(flow.view).toMatchObject({ step: 'mint', label: 'Mint copy #1 for 1 GEAR', disabled: false });
    expect(flow.view.message?.text).toMatch(/Approved 1 GEAR\. Step 2 of 2/);
    expect(t.sent).toHaveLength(1); // nothing chained automatically

    const tap2 = flow.tap();
    await until(() => t.sent.length === 2);
    expect(t.sent[1]).toEqual({ fn: 'mint', args: [OWNER, 1, 1n * UNIT] });
    t.confirmNext();
    await tap2;
    expect(t.sent).toHaveLength(2);
    expect(flow.view.message).toMatchObject({ kind: 'ok' });
    expect(flow.view.message?.text).toContain('Prophecy Tablet 1 #1');
    // Next copy costs 2 GEAR and needs a new approval.
    expect(flow.view).toMatchObject({ step: 'approve', label: 'Approve 2 GEAR' });
  });

  it('shows Mint straight away when the allowance already covers the price', async () => {
    const t = setup({ allowance: 5n * UNIT, minted: 2 });
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    expect(flow.view).toMatchObject({ step: 'mint', label: 'Mint copy #3 for 4 GEAR' });
  });

  it('waits out a node that is behind after the approval', async () => {
    const t = setup({ lagReads: 3 });
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    const tap = flow.tap();
    await until(() => t.sent.length === 1);
    t.confirmNext();
    await tap;
    expect(flow.view.step).toBe('mint');
  });

  it('blocks with a clear message when the wallet lacks GEAR', async () => {
    const t = setup({ balance: 0n });
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    expect(flow.view).toMatchObject({ step: 'blocked', label: 'Need 1 GEAR', disabled: true });
    expect(flow.view.message?.text).toContain('holds 0 GEAR');
  });

  it('a rejected approve goes back to Approve with a message', async () => {
    const t = setup();
    t.deps.sendApprove = async () => {
      throw new Error('You rejected the request in your wallet. Nothing was sent.');
    };
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    await flow.tap();
    expect(flow.view).toMatchObject({ step: 'approve', label: 'Approve 1 GEAR', disabled: false });
    expect(flow.view.message).toMatchObject({ kind: 'bad' });
  });

  it('works when the wallet hands back an id with no receipt (smart wallets): watches the allowance instead', async () => {
    const t = setup();
    t.deps.waitReceipt = () => new Promise(() => undefined); // never resolves
    const flow = new MintFlow(1, t.deps);
    await flow.refresh();
    const tap1 = flow.tap();
    await until(() => t.sent.length === 1);
    t.confirmNext();
    await tap1;
    expect(flow.view.step).toBe('mint');
    const tap2 = flow.tap();
    await until(() => t.sent.length === 2);
    t.confirmNext();
    await tap2;
    expect(flow.view.message).toMatchObject({ kind: 'ok', text: 'You minted copy #1 of Tablet #1.' });
    expect(flow.view.label).toBe('Approve 2 GEAR');
    expect(t.sent.map((x) => x.fn)).toEqual(['approve', 'mint']);
  });
});
