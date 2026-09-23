import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  auditParite,
  jumeauDuWorker,
  litterauxDuResolveur,
  patternsDeLaTable,
  // @ts-expect-error — module .mjs sans déclaration de types ; ce témoin
  // interroge son API publique exactement comme le pilote le fait.
} from './check-push-target-parity.mjs';

/**
 * LE GATE DE PARITÉ, ET SON PROPRE TÉMOIN (#7305).
 *
 * `public/sw-push.js` est un script CLASSIQUE : il ne peut importer ni
 * `resolveTarget` ni `href`. Sa table vit donc en DOUBLE. Le dépôt a déjà
 * tranché ce cas (`src/lib/sw-caches.ts` § `LEGACY_CACHE_NAMESPACE`) : le
 * jumeau est licite, la dérive ne l'est pas — et c'est un GATE qui l'interdit,
 * jamais la discipline.
 *
 * La preuve par l'absurde est dans le dépôt : `firebase-messaging-sw.js`
 * portait la bonne règle en commentaire (« toute évolution doit toucher les
 * DEUX SW + le helper ») et servait quand même `/conversations/<id>`, `/mood`
 * et `/reel` — trois routes sur trois, dont AUCUNE n'existe dans la v2. Une
 * règle en prose ne couvre que ce que son outil exprime.
 *
 * Ce témoin fait ROUGIR le gate sur chacune des trois dérives possibles : la
 * table de routes qui bouge, le résolveur qui bouge, le jumeau qui bouge.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const APP = join(HERE, '..');

const SOURCES = {
  table: readFileSync(join(APP, 'src/routes/route-table.tsx'), 'utf8'),
  resolveur: readFileSync(join(APP, 'src/lib/notifications/target.ts'), 'utf8'),
  worker: readFileSync(join(APP, 'public/sw-push.js'), 'utf8'),
};

const audit = (sources: typeof SOURCES): string[] =>
  auditParite({
    table: patternsDeLaTable(sources.table),
    resolveur: litterauxDuResolveur(sources.resolveur),
    jumeau: jumeauDuWorker(sources.worker),
  });

describe('le jumeau du worker suit la table de routes et le résolveur', () => {
  test('sur le dépôt tel quel, aucune dérive', () => {
    expect(audit(SOURCES)).toEqual([]);
  });

  /* LE TÉMOIN QUE L'ISSUE DEMANDE : « le renommage volontaire d'une route dans
     `route-table.tsx` le fait rougir. Un gate qu'on n'a pas vu rougir n'est
     pas un gate. » */
  test('une route RENOMMÉE dans `route-table.tsx` rougit', () => {
    const renomme = SOURCES.table.replace("pattern: '/c/$conversation'", "pattern: '/conv/$conversation'");
    expect(renomme).not.toBe(SOURCES.table);
    expect(audit({ ...SOURCES, table: renomme }).join('\n')).toContain('thread');
  });

  test('une route SUPPRIMÉE de `route-table.tsx` rougit', () => {
    const sans = SOURCES.table.replace("notifications: { pattern: '/notifications'", "notificationsAncien: { pattern: '/notifications'");
    expect(sans).not.toBe(SOURCES.table);
    expect(audit({ ...SOURCES, table: sans }).join('\n')).toContain('notifications');
  });

  test('un type ajouté au résolveur et OUBLIÉ dans le jumeau rougit', () => {
    const elargi = SOURCES.resolveur.replace(
      "new Set(['friend_request', 'contact_request'])",
      "new Set(['friend_request', 'contact_request', 'contact_invite'])",
    );
    expect(elargi).not.toBe(SOURCES.resolveur);
    expect(audit({ ...SOURCES, resolveur: elargi }).join('\n')).toContain('contact_invite');
  });

  test('un motif réécrit DANS le jumeau rougit', () => {
    const derive = SOURCES.worker.replace("thread: '/c/$conversation'", "thread: '/conversations/$conversation'");
    expect(derive).not.toBe(SOURCES.worker);
    expect(audit({ ...SOURCES, worker: derive }).join('\n')).toContain('/conversations/$conversation');
  });

  /* Le worker FOCALISE un client déjà ouvert puis lui remet l'adresse : si le
     nom du message diverge, le tap ramène l'onglet au premier plan et l'y
     laisse — un contrôle qui ment, que rien d'autre ne verrait. */
  test('le nom du message remis à un client ouvert ne peut pas diverger en silence', () => {
    const derive = SOURCES.worker.replace("NOTIFICATION_CLICKED_MESSAGE = 'NOTIFICATION_CLICKED'", "NOTIFICATION_CLICKED_MESSAGE = 'PUSH_TAP'");
    expect(derive).not.toBe(SOURCES.worker);
    expect(audit({ ...SOURCES, worker: derive }).join('\n')).toContain('PUSH_TAP');
  });

  test('le paramètre de l’onglet « Demandes » ne peut pas diverger en silence', () => {
    const derive = SOURCES.worker.replace("DISCOVER_TAB_PARAM = 'onglet'", "DISCOVER_TAB_PARAM = 'tab'");
    expect(derive).not.toBe(SOURCES.worker);
    expect(audit({ ...SOURCES, worker: derive }).length).toBeGreaterThan(0);
  });
});

describe('le jumeau rend les adresses que le critère de fin nomme', () => {
  test('une conversation mène à `/c/abc`, jamais à `/conversations/abc`', () => {
    expect(jumeauDuWorker(SOURCES.worker).pushTargetUrl({ notificationId: 'x', conversationId: 'abc' })).toBe('/c/abc');
  });

  test('un identifiant est encodé — une adresse ne se compose pas par concaténation', () => {
    expect(jumeauDuWorker(SOURCES.worker).pushTargetUrl({ conversationId: 'a b/c' })).toBe('/c/a%20b%2Fc');
  });
});
