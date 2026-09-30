import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'bun:test';

import { ADMIN_SECTIONS, type AdminSection } from './sections';
import { READY as ANALYTICS } from './ready/analytics';
import { READY as AUDIT } from './ready/audit';
import { READY as BROADCASTS } from './ready/broadcasts';
import { READY as COMMUNITIES } from './ready/communities';
import { READY as INVITATIONS } from './ready/invitations';
import { READY as LANGUAGES } from './ready/languages';
import { READY as MONITORING } from './ready/monitoring';
import { READY as POSTS } from './ready/posts';
import { READY as RANKING } from './ready/ranking';
import { READY as REPORTS } from './ready/reports';
import { READY as SETTINGS } from './ready/settings';
import { READY as SHARE_LINKS } from './ready/share-links';
import { READY as TRACKING_LINKS } from './ready/tracking-links';

/**
 * **UNE SECTION EST PRÊTE QUAND ET SEULEMENT QUAND SES ÉCRANS LE SONT** (#8876).
 *
 * Dix lots remplacent chacun les écrans d'attente de leur section, en parallèle,
 * sans jamais éditer le registre : ils basculent leur drapeau
 * (`lib/admin/ready/<section>.ts`) dans le commit qui remplace l'écran. Ce
 * témoin garde l'accord des deux, dans les deux sens :
 *
 * - drapeau VRAI avec un écran d'attente encore en place ⇒ un menu qui mène à
 *   « Cette section arrive » — un contrôle qui ment (loi 4) ;
 * - drapeau FAUX avec des écrans écrits ⇒ du travail livré et invisible.
 *
 * Il lit le TEXTE des écrans : mesurer par l'exécution demanderait de monter
 * chaque écran, et un écran d'attente se rend très bien.
 */
const SCREENS = new URL('../../routes/', import.meta.url);

const read = (name: string): string => readFileSync(fileURLToPath(new URL(`${name}.tsx`, SCREENS)), 'utf8');

const isStub = (name: string): boolean => read(name).includes('AdminStubScreen');

const NEUVES: ReadonlyArray<{ readonly id: AdminSection['id']; readonly ready: boolean; readonly screens: readonly string[] }> = [
  { id: 'invitations', ready: INVITATIONS, screens: ['admin-invitations', 'admin-invitation'] },
  { id: 'communities', ready: COMMUNITIES, screens: ['admin-communities', 'admin-community'] },
  { id: 'shareLinks', ready: SHARE_LINKS, screens: ['admin-share-links', 'admin-share-link'] },
  { id: 'posts', ready: POSTS, screens: ['admin-posts', 'admin-post'] },
  { id: 'reports', ready: REPORTS, screens: ['admin-reports', 'admin-report'] },
  { id: 'audit', ready: AUDIT, screens: ['admin-audit'] },
  { id: 'analytics', ready: ANALYTICS, screens: ['admin-analytics'] },
  { id: 'ranking', ready: RANKING, screens: ['admin-ranking'] },
  { id: 'trackingLinks', ready: TRACKING_LINKS, screens: ['admin-tracking-links', 'admin-tracking-link'] },
  { id: 'broadcasts', ready: BROADCASTS, screens: ['admin-broadcasts', 'admin-broadcast'] },
  { id: 'monitoring', ready: MONITORING, screens: ['admin-monitoring'] },
  { id: 'languages', ready: LANGUAGES, screens: ['admin-languages'] },
  { id: 'settings', ready: SETTINGS, screens: ['admin-settings'] },
];

describe('le drapeau de disponibilité de chaque section neuve dit la vérité', () => {
  test('la table couvre les treize sections neuves, et chacune pointe des écrans qui existent', () => {
    expect(NEUVES).toHaveLength(13);
    for (const { screens } of NEUVES) for (const name of screens) expect(read(name).length).toBeGreaterThan(0);
  });

  for (const { id, ready, screens } of NEUVES) {
    test(`${id} : READY === true ⇔ aucun de ses écrans n’est un écran d’attente`, () => {
      const attente = screens.filter(isStub);
      expect({ id, ready, attente: attente.length > 0 }).toEqual({ id, ready, attente: !ready });
    });

    test(`${id} : le registre lit ce drapeau`, () => {
      expect(ADMIN_SECTIONS.find((section) => section.id === id)?.ready).toBe(ready);
    });
  }

  test('l’extraction reconnaît un écran d’attente — sinon « aucun écran d’attente » serait vrai de tout', () => {
    expect(isStub('admin-audit') || AUDIT).toBe(true);
    expect(isStub('admin-users')).toBe(false);
  });
});
