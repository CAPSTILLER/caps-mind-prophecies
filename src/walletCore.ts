/**
 * Wallet connection shared by every page (header toggle button). No DOM here so it can be tested
 * with a fake EIP-1193 wallet. web/walletUi.ts wires it to the header button and loads Coinbase
 * Smart Wallet when the phone browser has no injected ethereum.
 */
import { getAddress, type Address } from 'viem';

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
  disconnect?: () => Promise<void>;
};

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type WalletState = {
  account: Address | null;
  chainId: number | null;
  /** True when Connect can open a wallet (injected or Coinbase Smart Wallet from the browser). */
  hasProvider: boolean;
  busy: boolean;
};

/** How the page finds an EIP-1193 provider. Prefer injected; otherwise Coinbase Smart Wallet. */
export type ProviderSource = {
  /** Sync: injected window.ethereum, or a Smart Wallet provider already loaded this session. */
  peek: () => Eip1193 | undefined;
  /** Prefer injected; otherwise load @coinbase/wallet-sdk with preference smartWalletOnly. */
  resolve: () => Promise<Eip1193>;
};

/** Set when the visitor connects on this site; cleared when they tap the button to disconnect. */
export const REMEMBER_KEY = 'capsmind.wallet.connected';
export const BASE_CHAIN_ID = 8453;

export function shortAddress(a: string): string {
  return a.slice(0, 6) + '…' + a.slice(-4);
}

/** What the header button shows. Connected: solid blue, white text. Disconnected: white, blue text. */
export function walletButtonView(s: WalletState): { label: string; connected: boolean; title: string } {
  if (s.account) {
    return {
      label: `Connected ${shortAddress(s.account)}`,
      connected: true,
      title: s.chainId === BASE_CHAIN_ID ? 'Tap to disconnect' : 'Connected, but not on Base. Tap to disconnect.',
    };
  }
  if (s.busy) return { label: 'Connecting…', connected: false, title: 'Check your wallet' };
  return { label: 'Connect wallet', connected: false, title: 'Tap to connect your wallet' };
}

export class WalletController {
  state: WalletState;
  private listeners = new Set<(s: WalletState) => void>();
  private active: Eip1193 | undefined;
  private eventsWired = false;

  constructor(
    private providers: ProviderSource,
    private store: KeyValueStore | null,
    private chainId = BASE_CHAIN_ID,
  ) {
    // Connect always can try Smart Wallet from the browser, even with no injected ethereum.
    this.state = { account: null, chainId: null, hasProvider: true, busy: false };
  }

  /** EIP-1193 provider last used for connect (injected or Smart Wallet). Use this for writes. */
  provider(): Eip1193 | undefined {
    return this.active || this.providers.peek();
  }

  subscribe(fn: (s: WalletState) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<WalletState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn(this.state);
  }

  private remember(on: boolean) {
    try {
      if (on) this.store?.setItem(REMEMBER_KEY, '1');
      else this.store?.removeItem(REMEMBER_KEY);
    } catch {
      /* storage blocked: connection just will not be remembered */
    }
  }

  private remembered(): boolean {
    try {
      return this.store?.getItem(REMEMBER_KEY) === '1';
    } catch {
      return false;
    }
  }

  private async readChain(eth: Eip1193): Promise<number | null> {
    try {
      return Number(await eth.request({ method: 'eth_chainId' }));
    } catch {
      return null;
    }
  }

  private wireEvents(eth: Eip1193) {
    if (this.eventsWired || typeof eth.on !== 'function') return;
    this.eventsWired = true;
    eth.on('accountsChanged', (accs: unknown) => {
      const list = (accs as string[]) || [];
      if (!list[0]) {
        this.remember(false);
        this.set({ account: null });
      } else if (this.state.account) {
        this.set({ account: getAddress(list[0]) });
      }
    });
    eth.on('chainChanged', (id: unknown) => this.set({ chainId: Number(id) }));
    eth.on('disconnect', () => {
      this.remember(false);
      this.set({ account: null });
    });
  }

  /**
   * Restore a connection only if the visitor connected here before AND the wallet still reports
   * the account. Never calls eth_chainId / switch before eth_accounts (Smart Wallet rejects that).
   * Does not load the Smart Wallet SDK unless the visit is remembered.
   */
  async init(): Promise<void> {
    this.set({ hasProvider: true });
    let eth = this.providers.peek();
    if (!eth && this.remembered()) {
      try {
        eth = await this.providers.resolve();
      } catch {
        /* SDK blocked or offline; visitor can still tap Connect later */
      }
    }
    if (!eth) {
      this.set({ account: null, chainId: null });
      return;
    }
    this.active = eth;
    this.wireEvents(eth);

    let account: Address | null = null;
    let chainId: number | null = null;
    if (this.remembered()) {
      try {
        // Passive only: eth_accounts must not open a popup.
        const accs = (await eth.request({ method: 'eth_accounts' })) as string[];
        if (accs?.[0]) {
          account = getAddress(accs[0]);
          // Chain read only after we know accounts exist (Smart Wallet safe).
          chainId = await this.readChain(eth);
        } else {
          this.remember(false);
        }
      } catch {
        /* wallet locked */
      }
    }
    this.set({ account, chainId });
  }

  /**
   * Ask the wallet to connect, then make sure it is on Base.
   * Coinbase Smart Wallet: eth_requestAccounts MUST be first; never eth_chainId/switch before it.
   */
  async connect(): Promise<boolean> {
    this.set({ busy: true });
    try {
      const eth = await this.providers.resolve();
      this.active = eth;
      this.wireEvents(eth);
      const accs = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const account = accs?.[0] ? getAddress(accs[0]) : null;
      if (!account) return false;
      this.remember(true);
      this.set({ account });
      return this.ensureBase();
    } finally {
      this.set({ busy: false });
    }
  }

  /** Forget the wallet on this site and ask the wallet to drop the site's permission where it can. */
  async disconnect(): Promise<void> {
    this.remember(false);
    this.set({ account: null });
    const eth = this.provider();
    if (!eth) return;
    try {
      await eth.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch {
      /* not supported by every wallet; the site has already forgotten the account */
    }
    try {
      if (typeof eth.disconnect === 'function') await eth.disconnect();
    } catch {
      /* optional on Smart Wallet */
    }
  }

  async toggle(): Promise<void> {
    if (this.state.account) await this.disconnect();
    else await this.connect();
  }

  /**
   * Switch (or add) Base. Returns true when the wallet is on Base.
   * Only call after eth_requestAccounts (or eth_accounts already returned an address).
   */
  async ensureBase(): Promise<boolean> {
    const eth = this.provider();
    if (!eth) return false;
    // Safe to read chain here: caller already did eth_requestAccounts or eth_accounts returned an address.
    let chainId = this.state.chainId ?? (await this.readChain(eth));
    if (chainId !== null) this.set({ chainId });
    if (chainId === this.chainId) return true;
    const hex = '0x' + this.chainId.toString(16);
    try {
      await eth.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: hex }] });
    } catch (err) {
      if ((err as { code?: number })?.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [
              {
                chainId: hex,
                chainName: 'Base',
                nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
                rpcUrls: ['https://mainnet.base.org'],
                blockExplorerUrls: ['https://basescan.org'],
              },
            ],
          });
        } catch {
          /* the visitor declined */
        }
      }
    }
    chainId = await this.readChain(eth);
    this.set({ chainId });
    return chainId === this.chainId;
  }
}
