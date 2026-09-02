/**
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { litLesVues, sessionDeVue, sessionsInconnues, type LigneDeVue } from '@/scripts/lib/index-des-vues.mjs';

import { COOKIE_DE_JETON, COOKIE_DE_SESSION } from '@/lib/api/cookies';
import { JETON_DU_MEMBRE } from '@/e2e/visual/lib/bouchon-socket';
import { CONVERSATION_RICHE } from '@/e2e/visual/lib/bouchon-monde';

/**
 * **CE QUI REND UNE VUE DU MEMBRE MESURABLE** — et le fait que ce ne soit PAS
 * un jeton de route.
 *
 * `vues.json` déclare `rich` sur `/chats/:id`, une route DISTINCTE du
 * `/chats/:cle` de `thread` : les deux n'ont jamais été en collision, et
 * `selectionComparable` les retient toutes deux sans un refus. Ce qui manquait
 * était ailleurs, et vaut pour toute la famille du MEMBRE : `compare-rendu.js`
 * navigue SANS CRÉANCE, donc `/chats/…` le renvoyait vers `/login` — c'est le
 * blocage que la conception nomme au § 12.8, et c'est pourquoi
 * `rapport-conformite.json` ne contenait que `vitrine` alors que `thread`,
 * `join` et `rights` étaient livrés.
 *
 * L'état de session est désormais DÉCLARÉ par vue (`"@session"`), traduit en
 * cookies par `compare-rendu.js`. Ces cookies doivent être ceux que la
 * passerelle de bouchon reconnaît : recopiés à la main dans un JSON, ils
 * seraient une jumelle qui dérive en silence le jour où une constante change —
 * et la dérive serait MUETTE (l'outil mesurerait l'écran de connexion contre la
 * cible d'un fil). Ces témoins tiennent la couture.
 */

const DESIGN = join(__dirname, '..', '..', '..', 'docs', 'product', 'MeeshyWebV3Design');

type Annexe = {
  readonly sessions: Readonly<Record<string, { readonly cookies: Readonly<Record<string, string>> }>>;
  readonly jetons: Readonly<Record<string, Readonly<Record<string, string>>>>;
};

const annexe = (): Annexe => JSON.parse(readFileSync(join(DESIGN, 'jetons-de-vues.json'), 'utf8')) as Annexe;

const sonde = (jetons?: Readonly<Record<string, string>>): LigneDeVue => ({
  id: 'sonde',
  label: 'Sonde',
  route: '/sonde',
  group: 'SONDE',
  title: '',
  subtitle: '',
  png: '',
  ...(jetons === undefined ? {} : { jetons }),
});

describe('l’état de session déclaré par une vue', () => {
  it('porte EXACTEMENT les cookies que la passerelle de bouchon reconnaît', () => {
    expect(annexe().sessions.membre?.cookies).toEqual({
      [COOKIE_DE_JETON]: JETON_DU_MEMBRE,
      [COOKIE_DE_SESSION]: 'ouverte',
    });
  });

  it('est lu par l’index, et `rich` le déclare avec son propre jeton de conversation', () => {
    const index = litLesVues(DESIGN);
    const rich = index.vues.find((vue) => vue.id === 'rich');

    expect(index.refus).toEqual([]);
    expect(sessionDeVue(rich)).toBe('membre');
    // Le jeton de `rich` est l'identifiant d'une conversation que la passerelle
    // de bouchon SERT : sans donnée derrière, le jeton mènerait à un fil vide.
    expect(rich?.jetons?.id).toBe(CONVERSATION_RICHE.id);
  });

  it('refuse — en la NOMMANT — une vue qui réclame une session non déclarée', () => {
    const refus = sessionsInconnues({ vues: [sonde({ '@session': 'inconnue' })], sessions: { membre: {} } });
    expect(refus.map((r) => r.id)).toEqual(['sonde']);
    expect(refus[0]?.raison).toContain('inconnue');
  });

  it('laisse passer une vue sans session — la vitrine n’en a pas', () => {
    expect(sessionsInconnues({ vues: [sonde()], sessions: {} })).toEqual([]);
  });
});

/**
 * `@session` n'est PAS un jeton de route : la lecture des jetons de route
 * (`motifJeton`, `vues-comparables.mjs`) ne reconnaît que `:nom`. Le témoin le
 * prouve plutôt que de le supposer — c'est ce qui permet de ranger les deux
 * déclarations dans la même entrée sans qu'aucune ne mange l'autre.
 */
describe('la clé de session et les jetons de route ne se confondent pas', () => {
  it('substitue le jeton de route et ignore la clé de session', async () => {
    const { selectionComparable, refusDeSelection } = await import('@/scripts/lib/vues-comparables.mjs');
    const index = litLesVues(DESIGN);
    const selection = selectionComparable({ vues: index.vues, demandees: ['rich', 'thread'] });

    expect(refusDeSelection(selection)).toBeNull();
    expect(selection.comparables).toEqual([
      { id: 'thread', route: '/chats/:cle', chemin: `/chats/${annexe().jetons.thread?.cle}` },
      { id: 'rich', route: '/chats/:id', chemin: `/chats/${CONVERSATION_RICHE.id}` },
    ]);
  });
});
