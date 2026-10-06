import { describe, expect, it } from 'vitest';
import { REMEMBER_KEY, WalletController, walletButtonView, type Eip1193 } from '../src/walletCore.js';

const ADDR = '0x1a72f7314297B0b8f6808A9248969A8108F49890';

function memoryStore() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    removeItem: (k: string) => void m.delete(k),
    m,
  };
}

function fakeWallet(opts: { chainId?: number; authorized?: boolean; revokeFails?: boolean; unknownChain?: boolean } = {}) {
  let chainId = opts.chainId ?? 8453;
  let authorized = opts.authorized ?? false;
  const calls: string[] = [];
  const handlers: Record<string, (...a: unknown[]) => void> = {};
  const eth: Eip1193 = {
    on: (ev, cb) => void (handlers[ev] = cb),
    async request({ method, params }) {
      calls.push(method);
      switch (method) {
        case 'eth_chainId':
          return '0x' + chainId.toString(16);
        case 'eth_accounts':
          return authorized ? [ADDR.toLowerCase()] : [];
        case 'eth_requestAccounts':
          authorized = true;
          return [ADDR.toLowerCase()];
        case 'wallet_switchEthereumChain':
          if (opts.unknownChain) throw Object.assign(new Error('unknown chain'), { code: 4902 });
          chainId = parseInt((params as [{ chainId: string }])[0].chainId, 16);
          return null;
        case 'wallet_addEthereumChain':
          chainId = 8453;
          return null;
        case 'wallet_revokePermissions':
          if (opts.revokeFails) throw new Error('not supported');
          authorized = false;
          return null;
      }
      throw new Error('unexpected ' + method);
    },
  };
  return { eth, calls, emit: (ev: string, ...a: unknown[]) => handlers[ev]?.(...a) };
}

describe('header wallet button view', () => {
  it('disconnected: "Connect wallet", not the connected (blue) style', () => {
    const v = walletButtonView({ account: null, chainId: null, hasProvider: true, busy: false });
    expect(v).toMatchObject({ label: 'Connect wallet', connected: false });
  });
  it('connected: "Connected 0x1a72…9890" in the connected (blue) style', () => {
    const v = walletButtonView({ account: ADDR, chainId: 8453, hasProvider: true, busy: false });
    expect(v).toMatchObject({ label: 'Connected 0x1a72…9890', connected: true, title: 'Tap to disconnect' });
  });
  it('never says Reconnect', () => {
    for (const account of [null, ADDR] as const) {
      expect(walletButtonView({ account, chainId: 1, hasProvider: true, busy: false }).label).not.toMatch(/reconnect/i);
    }
  });
});

describe('WalletController', () => {
  it('connects, remembers, and toggles off with wallet_revokePermissions', async () => {
    const w = fakeWallet();
    const store = memoryStore();
    const c = new WalletController(() => w.eth, store);
    await c.init();
    expect(c.state.account).toBeNull();
    await c.toggle();
    expect(c.state.account).toBe(ADDR);
    expect(store.m.get(REMEMBER_KEY)).toBe('1');
    await c.toggle();
    expect(c.state.account).toBeNull();
    expect(store.m.has(REMEMBER_KEY)).toBe(false);
    expect(w.calls).toContain('wallet_revokePermissions');
  });

  it('disconnect still works when the wallet does not support revoking', async () => {
    const w = fakeWallet({ revokeFails: true });
    const c = new WalletController(() => w.eth, memoryStore());
    await c.connect();
    await expect(c.disconnect()).resolves.toBeUndefined();
    expect(c.state.account).toBeNull();
  });

  it('restores on page load only if remembered AND the wallet still reports the account', async () => {
    const remembered = memoryStore();
    remembered.setItem(REMEMBER_KEY, '1');
    const a = new WalletController(() => fakeWallet({ authorized: true }).eth, remembered);
    await a.init();
    expect(a.state.account).toBe(ADDR);

    const notRemembered = new WalletController(() => fakeWallet({ authorized: true }).eth, memoryStore());
    await notRemembered.init();
    expect(notRemembered.state.account).toBeNull();

    const stale = memoryStore();
    stale.setItem(REMEMBER_KEY, '1');
    const b = new WalletController(() => fakeWallet({ authorized: false }).eth, stale);
    await b.init();
    expect(b.state.account).toBeNull();
    expect(stale.m.has(REMEMBER_KEY)).toBe(false);
  });

  it('follows accountsChanged and chainChanged', async () => {
    const w = fakeWallet();
    const c = new WalletController(() => w.eth, memoryStore());
    await c.init();
    await c.connect();
    w.emit('chainChanged', '0x1');
    expect(c.state.chainId).toBe(1);
    w.emit('accountsChanged', ['0x000000000000000000000000000000000000dead']);
    expect(c.state.account).toBe('0x000000000000000000000000000000000000dEaD');
    w.emit('accountsChanged', []);
    expect(c.state.account).toBeNull();
  });

  it('switches to Base on connect, adding it when the wallet does not know it', async () => {
    const w = fakeWallet({ chainId: 1 });
    const c = new WalletController(() => w.eth, memoryStore());
    expect(await c.connect()).toBe(true);
    expect(c.state.chainId).toBe(8453);
    const w2 = fakeWallet({ chainId: 1, unknownChain: true });
    const c2 = new WalletController(() => w2.eth, memoryStore());
    expect(await c2.connect()).toBe(true);
    expect(w2.calls).toContain('wallet_addEthereumChain');
  });

  it('explains a missing wallet', async () => {
    const c = new WalletController(() => undefined, memoryStore());
    await expect(c.connect()).rejects.toThrow(/No browser wallet/);
  });
});
