import type { Virtualizer } from '@tanstack/react-virtual';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ConversationReadingMode } from '@meeshy/shared/types/reading-modes';

import type { Message } from '@/lib/api/types';
import type { Viewer } from '@/lib/api/viewer';
import type { PlacedMessage } from '@/lib/grouping';
import { FOG_DURATION_MS, REVEAL_DURATION_SECONDS } from '@/lib/reading-mode/protection';
import type { ThreadScene } from '@/lib/reading-mode/scene';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadModes } from './thread-modes';

/**
 * **UNE RANGÉE VOILÉE RÉVÉLÉE ATTEINT UN LECTEUR D'ÉCRAN** (#7142, critères 1
 * et 2) — mesuré sur le CHEMIN PRODUIT, là où `[data-row]` existe.
 *
 * ## LE DÉFAUT QUE CE FICHIER ATTRAPE, ET POURQUOI IL A SURVÉCU
 *
 * `composeMessageLabel` accepte `phase` et sa contre-épreuve unitaire est VERTE
 * depuis #5774 : lui donner `{ phase: 'revealed' }` rend bien le texte et la
 * citation. Mais aucun appelant ne l'alimentait — la phase vit SOUS le nœud qui
 * porte `aria-label`. Le mécanisme était « écrit, testé, et jamais activé » : un
 * unitaire de plus serait resté vert pendant que le produit masquait tout.
 *
 * **DEUX masques se composaient**, et c'est pourquoi chaque cas en mesure deux :
 *
 * 1. le nom accessible restait le placeholder (`phase` omise ⇒ défaut FERMÉ) ;
 * 2. le texte PEINT est `aria-hidden` (`plainTextHidden`, #7032 — juste : le
 *    texte vit dans le libellé, jamais deux fois).
 *
 * Corriger le seul masque 1 en laissant le 2 donne le contrat voulu ; corriger
 * le seul masque 2 ferait prononcer le texte DEUX fois. Les deux assertions
 * sont donc posées ensemble.
 *
 * ## LES DEUX PEAUX, PARCE QUE LE MÉCANISME EST UNIQUE
 *
 * La phase remonte par `RevealPhaseChannel`, que `ThreadModes` fournit et que
 * `ProtectedContent` consomme : `FocalRow` et `Bubble` n'en savent rien
 * (critère 3). Jouer les deux peaux est ce qui a révélé que `plainTextHidden`
 * n'avait jamais été porté sur `bubble.tsx` — voir plus bas.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => mounter.unmountAll());

const SECRET = 'Le code du coffre est 4817-2290.';
const ORDINAIRE = 'Bonjour, comment vas-tu ?';

const senderOf = (displayName: string, userId: string) => ({
  id: `p-${userId}`,
  conversationId: 'c-protection',
  userId,
  displayName,
  type: 'user' as const,
  role: 'member' as const,
  language: 'fr',
  permissions: {
    canSendMessages: true,
    canSendFiles: true,
    canSendImages: true,
    canSendVideos: true,
    canSendAudios: true,
    canSendLocations: true,
    canSendLinks: true,
  },
  isActive: true,
  joinedAt: new Date('2026-01-01T00:00:00.000Z'),
  isOnline: false,
});

/**
 * NI `expiresAt` NI `deletedAt` — `ThreadModes` appelle `protectionOf(message,
 * Date.now())` avec une horloge non injectable : une date dans ce corpus
 * rendrait le verdict dépendant de l'heure réelle du run.
 */
const messageOf = (partial: Partial<Message>): Message =>
  ({
    id: 'm-voile',
    conversationId: 'c-protection',
    senderId: 'u-bruno',
    content: SECRET,
    originalLanguage: 'fr',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    maxViewOnceCount: 1,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 1,
    readCount: 1,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-09-08T09:02:00.000Z'),
    updatedAt: new Date('2026-09-08T09:02:00.000Z'),
    timestamp: new Date('2026-09-08T09:02:00.000Z'),
    translations: [],
    sender: senderOf('Bruno Bêta', 'u-bruno'),
    ...partial,
  }) as Message;

const placeOf = (message: Message): PlacedMessage => ({ message, head: true, tail: true, opensDay: null });

/**
 * LE VIRTUALISEUR N'EST PAS CE QU'ON MESURE. `ThreadModes` ne lui demande que
 * `getTotalSize`, `getVirtualItems` et `measureElement` ; les lui donner évite
 * de simuler une mise en page que happy-dom ne fait pas — `calculateRange` rend
 * `null` dès que `offsetHeight` vaut 0, et le témoin mesurerait alors un écran
 * SANS AUCUNE RANGÉE, vert aussi bien sur « le libellé est juste » que sur « il
 * n'y a pas de libellé ».
 */
const virtualizerOf = (count: number): Virtualizer<HTMLElement, Element> =>
  ({
    getTotalSize: () => count * 88,
    getVirtualItems: () =>
      Array.from({ length: count }, (_unused, index) => ({
        index,
        start: index * 88,
        end: (index + 1) * 88,
        size: 88,
        key: index,
        lane: 0,
      })),
    measureElement: () => {},
  }) as unknown as Virtualizer<HTMLElement, Element>;

const VIEWER: Viewer = { id: 'u-viewer', username: 'viewer', displayName: 'Vous' } as unknown as Viewer;
const SCENE: ThreadScene = { elected: null, noteProgrammaticScroll: () => {} } as unknown as ThreadScene;

const monte = async (mode: ConversationReadingMode, message: Message, consume?: () => Promise<boolean>) =>
  mounter.mount(
    <ThreadModes
      mode={mode}
      viewer={VIEWER}
      readerLocale="fr"
      placed={[placeOf(message)]}
      virtualizer={virtualizerOf(1)}
      scene={SCENE}
      readerLanguages={['fr']}
      group={false}
      highlightedId={null}
      expiredIds={new Set()}
      jumpToMessage={() => {}}
      typists={[]}
      {...(consume === undefined ? {} : { consume })}
    />,
  );

const labelOf = (host: ParentNode, id = 'm-voile'): string =>
  host.querySelector(`[data-row="${id}"]`)?.getAttribute('aria-label') ?? '';

/**
 * LE TEXTE PEINT EST-IL DANS L'ARBRE D'ACCESSIBILITÉ ? Un nœud en est retiré
 * s'il porte `aria-hidden` OU si un ancêtre le porte : chercher l'attribut sur
 * le seul nœud qui contient le texte rendrait un verdict faux dès que le masque
 * remonte d'un cran.
 */
const texteExposeDansLeDom = (host: ParentNode, texte: string): boolean =>
  [...host.querySelectorAll('*')].some((nœud) => {
    if (nœud.textContent?.includes(texte) !== true) return false;
    if (nœud.children.length > 0) return false;
    for (let courant: Element | null = nœud; courant !== null; courant = courant.parentElement) {
      if (courant.getAttribute('aria-hidden') === 'true') return false;
    }
    return true;
  });

/**
 * Le délai par défaut de `bun test` est de 5 s — moins que la fenêtre qu'on
 * attend. Les deux cas de fermeture le déclarent donc explicitement.
 */
const FENETRE_TIMEOUT_MS = 20000;

/**
 * La fenêtre de révélation PUIS sa fermeture — le seul chemin : `ThreadModes`
 * ne transmet aucune horloge injectable aux peaux.
 */
const laisseLaFenetreSeFermer = async () => {
  await new Promise((resolve) => setTimeout(resolve, REVEAL_DURATION_SECONDS * 1000 + FOG_DURATION_MS + 400));
  await mounter.settle();
};

/**
 * LES DEUX PEAUX, en table FERMÉE — `usesFlatRow`
 * (`lib/reading-mode/decision.ts`) envoie `focal`/`script` vers `FocalRow`, et
 * tout le reste vers `Bubble`.
 */
const PEAUX = [
  ['Focal (peau plate)', 'focal'],
  ['Bulles', 'bubbles'],
] as const satisfies readonly (readonly [string, ConversationReadingMode])[];

/**
 * **UN MESSAGE ORDINAIRE N'EST PRONONCÉ QU'UNE FOIS — SUR LES DEUX PEAUX.**
 *
 * Ce cas n'est pas dans #7142 : il a été trouvé en jouant l'issue sur les DEUX
 * peaux, ce que sa mesure d'origine (faite sur `/c/c-protection`, en Focal, le
 * mode par défaut) ne pouvait pas voir.
 *
 * Mesuré AVANT correction, sur un message SANS aucune protection :
 *
 * ```
 * focal   : libellé porte le texte = true | DOM expose le texte = false
 * bubbles : libellé porte le texte = true | DOM expose le texte = TRUE
 * ```
 *
 * `plainTextHidden` (#7032, réponse au défaut majeur 1/4 de la revue #5935)
 * n'avait jamais été porté sur `bubble.tsx` : l'arbre d'accessibilité de la peau
 * Bulles portait le texte DEUX fois, pour tout message, depuis toujours.
 *
 * Il fallait le corriger DANS ce lot, et pas après : alimenter la phase rend le
 * libellé porteur du texte sur une rangée révélée, donc le critère « le libellé
 * OU le DOM, jamais les deux » serait devenu VRAI sur Focal et FAUX sur Bulles.
 * Un lot qui livre son critère sur une peau et le brise sur l'autre n'a pas
 * livré — et la divergence entre peaux est elle-même le défaut (dimension 6).
 */
describe.each(PEAUX)('%s — un message ORDINAIRE est prononcé UNE fois', (_nom, mode) => {
  test('le libellé porte le texte, le DOM ne le redouble pas', async () => {
    const host = await monte(mode, messageOf({ content: ORDINAIRE }));

    expect(labelOf(host)).toContain(ORDINAIRE);
    expect(texteExposeDansLeDom(host, ORDINAIRE)).toBe(false);
  });
});

describe.each(PEAUX)('%s — le nom accessible suit ce que la rangée MONTRE', (_nom, mode) => {
  test('au repos, le libellé dit « Contenu masqué » et le secret n est nulle part', async () => {
    const host = await monte(mode, messageOf({ isBlurred: true }));

    expect(labelOf(host)).toContain('Contenu masqué');
    expect(labelOf(host)).not.toContain('4817-2290');
    expect(texteExposeDansLeDom(host, SECRET)).toBe(false);
  });

  test('RÉVÉLÉE : le libellé porte le texte servi ET la citation — un seul des deux masques tombe', async () => {
    const host = await monte(
      mode,
      messageOf({
        isBlurred: true,
        replyTo: messageOf({ id: 'q1', content: 'Le RDV est à 18h', sender: senderOf('Amina Diallo', 'u-amina') }),
      }),
    );

    await mounter.click(host.querySelector('button[data-protected="hidden"]'));

    expect(host.querySelector('[data-protected="revealed"]')).not.toBe(null);
    /* MASQUE 1 — le nom accessible n'est plus le placeholder. */
    expect(labelOf(host)).toContain('4817-2290');
    expect(labelOf(host)).toContain('réponse à Amina Diallo');
    expect(labelOf(host)).not.toContain('Contenu masqué');
    /* MASQUE 2 — le texte peint reste HORS de l'arbre : prononcé une fois,
       jamais deux (le contrat de #7032 tient, sur les deux peaux). */
    expect(texteExposeDansLeDom(host, SECRET)).toBe(false);
  });
});

/**
 * **LA FERMETURE DE LA FENÊTRE — DEUX TÉMOINS, ET PAS QUATRE.**
 *
 * Ces deux cas attendent réellement 5,4 s (`REVEAL_DURATION_SECONDS` +
 * `FOG_DURATION_MS`) : il n'y a pas d'autre chemin que le temps qui passe.
 *
 * On ne les rejoue PAS sur les deux peaux. Ce qui se ferme est le cycle de
 * `ProtectedContent`, que les deux peaux montent à l'identique et dont aucune
 * ne connaît la phase ; ce qui DIFFÈRE d'une peau à l'autre — monter le voile,
 * poser le libellé — est déjà mesuré au repos et à la révélation. Payer 5,4 s
 * de plus pour rejouer le même minuteur mesurerait le temps, pas le produit.
 *
 * Les deux cas retenus, eux, ne sont PAS le même : `settleFog` rend la main au
 * voile (`hidden`, l'affordance revient) ou au tombstone (`consumed`, elle ne
 * revient plus). C'est la différence que le critère 2 tient pour décisive.
 */
describe('La fenêtre se referme — et le nom accessible se referme avec elle', () => {
  test(
    'voile ordinaire : le libellé REPREND « Contenu masqué », et la rangée reste révélable',
    async () => {
      const host = await monte('focal', messageOf({ isBlurred: true }));
      await mounter.click(host.querySelector('button[data-protected="hidden"]'));
      expect(labelOf(host)).toContain('4817-2290');

      await laisseLaFenetreSeFermer();

      expect(labelOf(host)).toContain('Contenu masqué');
      expect(labelOf(host)).not.toContain('4817-2290');
      expect(texteExposeDansLeDom(host, SECRET)).toBe(false);
      expect(host.querySelector('button[data-protected="hidden"]')).not.toBe(null);
    },
    FENETRE_TIMEOUT_MS,
  );
});

/**
 * **LA VUE UNIQUE — le seul cas où l'échec est DÉFINITIF** (critère 2).
 *
 * Le tap CONSOMME le message : la fenêtre s'ouvre, se referme, et ne se rouvre
 * plus. Un correctif qui ne traiterait que le voile ordinaire rendrait le texte
 * lisible là où il se re-révèle à volonté, et laisserait non couvert le cas où
 * le contenu est BRÛLÉ sans avoir jamais été lisible par une technologie
 * d'assistance.
 */
describe('Vue unique — le contenu est lisible AVANT que la fenêtre ne se referme', () => {
  test('révélée, la rangée porte son texte dans le nom accessible', async () => {
    const host = await monte('focal', messageOf({ isViewOnce: true, viewOnceCount: 0 }), async () => true);

    expect(labelOf(host)).toContain('Contenu masqué');
    await mounter.click(host.querySelector('button[data-protected="hidden"]'));

    expect(host.querySelector('[data-protected="revealed"]')).not.toBe(null);
    expect(labelOf(host)).toContain('4817-2290');
  });

  test(
    'consommée, elle retombe sur son constat — et n y revient pas',
    async () => {
      const host = await monte('focal', messageOf({ isViewOnce: true, viewOnceCount: 0 }), async () => true);
      await mounter.click(host.querySelector('button[data-protected="hidden"]'));
      expect(labelOf(host)).toContain('4817-2290');

      await laisseLaFenetreSeFermer();

      expect(labelOf(host)).not.toContain('4817-2290');
      expect(texteExposeDansLeDom(host, SECRET)).toBe(false);
      /* Plus d'affordance : une vue unique consommée ne se révèle plus. */
      expect(host.querySelector('button[data-protected="hidden"]')).toBe(null);
    },
    FENETRE_TIMEOUT_MS,
  );

  /**
   * LA CONSOMMATION REFUSÉE ne révèle rien — et le nom accessible ne doit pas
   * annoncer un contenu que la rangée n'a jamais montré.
   */
  test('consommation REFUSÉE : ni contenu peint, ni contenu prononcé', async () => {
    const host = await monte('focal', messageOf({ isViewOnce: true, viewOnceCount: 0 }), async () => false);

    await mounter.click(host.querySelector('button[data-protected="hidden"]'));

    expect(host.querySelector('[data-protected="revealed"]')).toBe(null);
    expect(labelOf(host)).toContain('Contenu masqué');
    expect(labelOf(host)).not.toContain('4817-2290');
  });
});
