/** Header wallet toggle, shared by the tablets bundle (app.js) and the key page bundle (key-page.js). */
import {
  WalletController,
  walletButtonView,
  type Eip1193,
  type ProviderSource,
} from '../src/walletCore.js';

const CB_SDK_URL = 'https://cdn.jsdelivr.net/npm/@coinbase/wallet-sdk@4.4.0/+esm';
const APP_NAME = 'CAPs Mind Prophecies';
const APP_LOGO_URL = 'https://capsmind.gearup.wtf/favicon-32.png';

let cbSdkProvider: Eip1193 | undefined;

function hasInjectedEthereum(): boolean {
  const eth = (window as unknown as { ethereum?: Eip1193 }).ethereum;
  return !!(eth && typeof eth.request === 'function');
}

function injected(): Eip1193 | undefined {
  if (!hasInjectedEthereum()) return undefined;
  return (window as unknown as { ethereum: Eip1193 }).ethereum;
}

async function getCoinbaseSmartProvider(): Promise<Eip1193> {
  if (cbSdkProvider) return cbSdkProvider;
  // Variable URL so the bundler leaves this as a runtime dynamic import (CDN ESM).
  const url: string = CB_SDK_URL;
  const mod = (await import(url)) as {
    createCoinbaseWalletSDK?: (opts: Record<string, unknown>) => { getProvider: () => Eip1193 };
    default?: { createCoinbaseWalletSDK?: (opts: Record<string, unknown>) => { getProvider: () => Eip1193 } };
  };
  const create = mod.createCoinbaseWalletSDK || mod.default?.createCoinbaseWalletSDK;
  if (!create) throw new Error('Coinbase Wallet SDK failed to load. Check your connection and try again.');
  const sdk = create({
    appName: APP_NAME,
    appLogoUrl: APP_LOGO_URL,
    appChainIds: [8453],
    preference: { options: 'smartWalletOnly' },
  });
  cbSdkProvider = sdk.getProvider();
  return cbSdkProvider;
}

/** Prefer injected (in-app Coinbase Wallet browser); otherwise open Smart Wallet from the phone browser. */
export function browserProviders(): ProviderSource {
  return {
    peek: () => injected() || cbSdkProvider,
    resolve: async () => {
      const inj = injected();
      if (inj) return inj;
      return getCoinbaseSmartProvider();
    },
  };
}

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function explainWalletError(err: unknown): string {
  const e = err as { code?: number; shortMessage?: string; message?: string };
  if (e?.code === 4001) return 'You rejected the request in your wallet. Nothing was sent.';
  if (e?.code === -32002) return 'Your wallet already has a request open. Open the wallet to finish it.';
  return e?.shortMessage || e?.message || String(err);
}

/** Create the page's wallet controller and wire the header button (#walletBtn) to it. */
export function initWalletUi(): WalletController {
  const wallet = new WalletController(browserProviders(), storage());
  const btn = document.getElementById('walletBtn') as HTMLButtonElement | null;
  const render = () => {
    if (!btn) return;
    const v = walletButtonView(wallet.state);
    btn.textContent = v.label;
    btn.title = v.title;
    btn.classList.toggle('connected', v.connected);
    btn.setAttribute('aria-pressed', v.connected ? 'true' : 'false');
    btn.setAttribute('aria-label', v.connected ? `${v.label}. Tap to disconnect.` : 'Connect wallet');
    btn.disabled = wallet.state.busy;
  };
  wallet.subscribe(render);
  render();
  btn?.addEventListener('click', () => {
    void wallet.toggle().catch((e) => {
      if ((e as { code?: number })?.code === 4001) return; // the visitor closed the wallet prompt
      alert(explainWalletError(e));
    });
  });
  return wallet;
}
