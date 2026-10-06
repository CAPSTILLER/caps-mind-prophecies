/**
 * Wallet connection shared by every page (header toggle button). No DOM here so it can be tested
 * with a fake EIP-1193 wallet. web/walletUi.ts wires it to the header button.
 */
import { getAddress, type Address } from 'viem';

export type Eip1193 = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, cb: (...args: unknown[]) => void) => void;
};

export type KeyValueStore = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export type WalletState = {
  account: Address | null;
  chainId: number | null;
  hasProvider: boolean;
  busy: boolean;
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
  return { label: 'Connect wallet', connected: false, title: s.hasProvider ? 'Tap to connect your wallet' : 'No browser wallet found' };
}

export class WalletController {
  state: WalletState;
  private listeners = new Set<(s: WalletState) => void>();

  constructor(
    private getProvider: () => Eip1193 | undefined,
    private store: KeyValueStore | null,
    private chainId = BASE_CHAIN_ID,
  ) {
    this.state = { account: null, chainId: null, hasProvider: !!getProvider(), busy: false };
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

  /** Restore a connection only if the visitor connected here before AND the wallet still reports the account. */
  async init(): Promise<void> {
    const eth = this.getProvider();
    this.set({ hasProvider: !!eth });
    if (!eth) return;
    eth.on?.('accountsChanged', (accs: unknown) => {
      const list = (accs as string[]) || [];
      if (!list[0]) {
        this.remember(false);
        this.set({ account: null });
      } else if (this.state.account) {
        this.set({ account: getAddress(list[0]) });
      }
    });
    eth.on?.('chainChanged', (id: unknown) => this.set({ chainId: Number(id) }));
    eth.on?.('disconnect', () => this.set({ account: null }));
    const chainId = await this.readChain(eth);
    let account: Address | null = null;
    if (this.remembered()) {
      try {
        const accs = (await eth.request({ method: 'eth_accounts' })) as string[];
        if (accs?.[0]) account = getAddress(accs[0]);
        else this.remember(false);
      } catch {
        /* wallet locked */
      }
    }
    this.set({ account, chainId });
  }

  /** Ask the wallet to connect, then make sure it is on Base. Returns true when connected on Base. */
  async connect(): Promise<boolean> {
    const eth = this.getProvider();
    if (!eth) throw new Error('No browser wallet found. Install or unlock Coinbase Wallet, Rabby, or MetaMask, then reload.');
    this.set({ busy: true });
    try {
      const accs = (await eth.request({ method: 'eth_requestAccounts' })) as string[];
      const account = accs?.[0] ? getAddress(accs[0]) : null;
      if (!account) return false;
      this.remember(true);
      this.set({ account, chainId: await this.readChain(eth) });
      return this.ensureBase();
    } finally {
      this.set({ busy: false });
    }
  }

  /** Forget the wallet on this site and ask the wallet to drop the site's permission where it can. */
  async disconnect(): Promise<void> {
    this.remember(false);
    this.set({ account: null });
    const eth = this.getProvider();
    if (!eth) return;
    try {
      await eth.request({ method: 'wallet_revokePermissions', params: [{ eth_accounts: {} }] });
    } catch {
      /* not supported by every wallet; the site has already forgotten the account */
    }
  }

  async toggle(): Promise<void> {
    if (this.state.account) await this.disconnect();
    else await this.connect();
  }

  /** Switch (or add) Base. Returns true when the wallet is on Base. */
  async ensureBase(): Promise<boolean> {
    const eth = this.getProvider();
    if (!eth) return false;
    if (this.state.chainId === this.chainId) return true;
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
    const chainId = await this.readChain(eth);
    this.set({ chainId });
    return chainId === this.chainId;
  }
}
