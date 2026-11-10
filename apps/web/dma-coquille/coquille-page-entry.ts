/**
 * L'ENTRÉE de la coquille « ami WhatsApp » (#17116), construite par
 * `scripts/build-dma-coquille.ts` en un seul module servi à côté de la page.
 * Le WASM du pont est lu à côté d'elle et passé en octets : aucune adresse
 * n'est résolue ailleurs que sur la passerelle qui sert la page.
 */
import { mountCoquillePage } from './coquille-page';

const openBridge = async () => {
  const [{ openLibsignalBridge }, wasm] = await Promise.all([
    import('../src/lib/e2ee/libsignal-bridge'),
    fetch(new URL('./libsignal_wasm_bg.wasm', location.href)).then((response) => response.arrayBuffer()),
  ]);
  return openLibsignalBridge(wasm);
};

const root = document.querySelector<HTMLElement>('[data-coquille]');
if (root) mountCoquillePage(root, { origin: location.origin, fetch: (input, init) => fetch(input, init), openBridge });
