import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'bun:test';

import { deadAddresses } from './lib/emitted-addresses.mjs';
import { ROOT, SOURCES, emittedInventory, servingTable } from './lib/emitted-inventory.mjs';

/**
 * CE QUE L'APP iOS, LE SDK ET LA PASSERELLE ÉMETTENT VERS MEESHY.ME, LE WEB LE
 * SERT (#7312) — jugé sur le dépôt lui-même, à chaque poussée.
 *
 * Ce témoin lit `apps/ios/Meeshy` et `packages/MeeshySDK/Sources` : la voie de
 * parité le rejoue donc même quand seule l'app iOS change, et c'est elle qui a
 * émis `/help` et `/faq` sans que le web les serve. Il juge sans `dist` ; le
 * gate `check-emitted-addresses.mjs` ajoute, sur la construction, que chaque
 * document atteint n'est pas la coquille de l'application.
 */
/* Onze mille fichiers lus UNE fois, au chargement du témoin, hors du délai de chaque test : quelques
   secondes sur un disque froid. */
const INVENTORY = emittedInventory();

describe('les adresses émises par le dépôt', () => {
  test('chaque source de l’inventaire existe — une source absente se lirait « rien de mort »', () => {
    expect(SOURCES.filter((source) => !existsSync(join(ROOT, source)))).toEqual([]);
  });

  test('l’inventaire n’est pas vide : il compte l’app iOS, la passerelle et le web', () => {
    const files = new Set(INVENTORY.map((e) => e.file.split('/').slice(0, 2).join('/')));
    expect([...files].filter((f) => ['apps/ios', 'services/gateway', 'apps/web', 'packages/MeeshySDK'].includes(f)).sort()).toEqual([
      'apps/ios',
      'apps/web',
      'packages/MeeshySDK',
      'services/gateway',
    ]);
  });

  /* Sans `dist`, un fichier que seule la construction écrit (`/manifest.webmanifest`) n'existe pas
     encore : les adresses de FICHIER se jugent au gate, sur la construction. */
  test('aucune adresse émise n’est morte', () => {
    const emitted = INVENTORY.filter((e) => !/\.[a-z0-9]+$/i.test(e.path));
    expect(deadAddresses(emitted, servingTable()).map((d) => d.message)).toEqual([]);
  });
});
