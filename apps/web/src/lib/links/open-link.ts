import { isAppPath } from '@/routes/app-paths';

import { internalPathOf } from './internal-link';

export type LinkOpenPorts = {
  /** Les origines tenues pour Meeshy, en plus de ses hôtes (`internalPathOf`). */
  readonly origins: readonly string[];
  readonly navigate: (path: string) => void;
  readonly openOutside: (href: string) => void;
};

/**
 * OUVRIR UN LIEN DEPUIS UN GESTE QUI N'EST PAS LE TOUCHER (#12965) — la règle
 * #7849 du toucher (`rich-text.tsx`) : un lien Meeshy servi par un écran
 * navigue DANS l'app ; tout le reste sort. Dans la coque Android, sortir un
 * lien Meeshy le confiait au système, qui quittait l'app.
 */
export function openLink(href: string, ports: LinkOpenPorts): void {
  const inApp = internalPathOf(href, { origins: ports.origins, isAppPath });
  if (inApp !== null) {
    ports.navigate(inApp);
    return;
  }
  ports.openOutside(href);
}
