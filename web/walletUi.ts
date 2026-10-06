/** Header wallet toggle, shared by the tablets bundle (app.js) and the key page bundle (key-page.js). */
import { WalletController, walletButtonView, type Eip1193 } from '../src/walletCore.js';

function provider(): Eip1193 | undefined {
  return (window as unknown as { ethereum?: Eip1193 }).ethereum;
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
  const wallet = new WalletController(provider, storage());
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
