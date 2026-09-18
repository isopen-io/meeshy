import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { Attachment } from '@/lib/api/types';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProtectedContent, ProtectionNotice } from './protected-content';

/**
 * **LE TOMBSTONE ET SON CONSTAT — mesuré en montant `ProtectionNotice` ET
 * `ProtectedContent` DIRECTEMENT** (revue #7026 : « le constat d'un contenu
 * retenu n'est mesuré que sur la rangée, pour une seule image — quatre
 * mutations restent vertes »).
 *
 * `admin-conversation-reading-medias.test.tsx` mesure le CHEMIN PRODUIT (la
 * route souveraine, `ThreadModes`, `[data-row]`) et n'atteint donc que la
 * surface `row`, un seul type de pièce, et jamais `deleted`/`burned` avec des
 * pièces. Ce fichier-ci mesure le CONTRAT DES COMPOSANTS eux-mêmes, sans
 * hôte : la matrice {row, bubble} × {withheld sans pièce ; withheld 1 image ;
 * withheld 2 images + 1 vidéo + 1 audio ; deleted + 2 images ; burned + 1
 * image}, texte visible EXACT et `aria-label` EXACT à chaque case.
 *
 * QUATRE MUTATIONS QUE CE FICHIER FAIT ROUGIR, ET QUE LE CORPUS PRÉCÉDENT
 * LAISSAIT VERTES :
 *
 * 1. `kind === 'withheld'` (le garde du constat) muté en `true` — un message
 *    `deleted`/`burned` avec des pièces peindrait alors « · 1 image », le
 *    fait INVENTÉ que le doc-comment de `ProtectionNotice.attachments`
 *    interdit explicitement (« `deleted` et `burned` racontent une histoire
 *    où la pièce n'existe PLUS… y compter des images inventerait un fait »).
 *    Les cas `deleted`/`burned` ci-dessous portent des pièces et assertent
 *    l'ABSENCE de `[data-withheld-media]` : ce mutant les fait apparaître.
 * 2. La surface `bubble` — jamais montée par aucun témoin avant ce fichier.
 *    Retirer `{media}` du texte OU le constat de l'`aria-label`, dans la
 *    branche `bubble` de `ProtectionNotice`, ne faisait rougir personne : la
 *    lecture souveraine (seule productrice du chemin `withheld`) ne rend que
 *    des rangées `row`. La boucle `for (const surface of ['row','bubble'])`
 *    ci-dessous rejoue CHAQUE cas sur les DEUX surfaces.
 * 3. `attachmentSegments` — pluriel cassé, `kindOf` vidéo confondue avec
 *    image, audio ignoré — restait vert car seul « 1 image » (singulier,
 *    une seule catégorie) était jamais asserté. Le cas « 2 images, 1 vidéo,
 *    1 audio » force le pluriel ET les trois catégories à la fois.
 * 4. `attachmentCount = attachments?.length ?? 0` (`ProtectedContent`) muté
 *    en `0` retire `data-masked-media` du voile ORDINAIRE sans qu'aucun
 *    témoin ne le regarde — le corpus #7020/#6862 ne portait que sur
 *    `withheld`, jamais sur le voile `veiled` qui utilise le MÊME compte.
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

let sequence = 0;

/** Le socle minimal d'une pièce CLIENTE — seul `mimeType` compte pour `kindOf`. */
function fabrique(mimeType: string): Attachment {
  sequence += 1;
  return {
    id: `a-${sequence}`,
    messageId: 'm-1',
    fileName: `piece-${sequence}`,
    originalName: `piece-${sequence}`,
    mimeType,
    fileSize: 128,
    fileUrl: `https://cdn.test/piece-${sequence}`,
    uploadedBy: 'u-alice',
    isAnonymous: false,
    createdAt: '2026-06-02T10:00:00.000Z',
    capturedInApp: false,
    isForwarded: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    isEncrypted: false,
    viewedCount: 0,
    downloadedCount: 0,
    consumedCount: 0,
  };
}

const uneImage = (): Attachment => fabrique('image/png');
const uneVideo = (): Attachment => fabrique('video/mp4');
const unAudio = (): Attachment => fabrique('audio/mpeg');

/** L'ancre commune aux DEUX surfaces — `data-protected="consumed"` (row: `<p>`, bubble: `<span>`). */
const noeud = (host: HTMLElement): Element | null => host.querySelector('[data-protected="consumed"]');

type Cas = {
  readonly nom: string;
  readonly kind: 'withheld' | 'deleted' | 'burned';
  readonly attachments: readonly Attachment[] | undefined;
  readonly texteAttendu: string;
  readonly ariaAttendu: string;
  readonly constatAttendu: string | null;
};

const CAS: readonly Cas[] = [
  {
    nom: 'withheld SANS pièce — aucun constat à dire',
    kind: 'withheld',
    attachments: undefined,
    texteAttendu: 'Contenu retenu',
    ariaAttendu: 'Contenu retenu : ce message existe et ne se montre pas',
    constatAttendu: null,
  },
  {
    nom: 'withheld avec 1 image',
    kind: 'withheld',
    attachments: [uneImage()],
    texteAttendu: 'Contenu retenu · 1 image',
    ariaAttendu: 'Contenu retenu : ce message existe et ne se montre pas, 1 image',
    constatAttendu: '1 image',
  },
  {
    nom: 'withheld avec 2 images, 1 vidéo, 1 audio — pluriel ET les trois catégories',
    kind: 'withheld',
    attachments: [uneImage(), uneImage(), uneVideo(), unAudio()],
    texteAttendu: 'Contenu retenu · 2 images, 1 vidéo, 1 audio',
    ariaAttendu: 'Contenu retenu : ce message existe et ne se montre pas, 2 images, 1 vidéo, 1 audio',
    constatAttendu: '2 images, 1 vidéo, 1 audio',
  },
  {
    nom: 'deleted AVEC 2 images — le constat ne doit JAMAIS parler pour un message supprimé',
    kind: 'deleted',
    attachments: [uneImage(), uneImage()],
    texteAttendu: 'Message supprimé',
    ariaAttendu: 'Message supprimé',
    constatAttendu: null,
  },
  {
    nom: 'burned AVEC 1 image — le constat ne doit JAMAIS parler pour une vue unique consommée',
    kind: 'burned',
    attachments: [uneImage()],
    texteAttendu: 'Vu et supprimé',
    ariaAttendu: 'Message vu et supprimé',
    constatAttendu: null,
  },
];

describe('ProtectionNotice — le constat ne parle que pour `withheld`, en rangée ET en bulle', () => {
  for (const surface of ['row', 'bubble'] as const) {
    for (const cas of CAS) {
      test(`[${surface}] ${cas.nom}`, async () => {
        /* `exactOptionalPropertyTypes` : une clé ABSENTE doit le RESTER —
           même discipline que `ProtectedContent` lui-même (`protected-content.tsx:176`). */
        const host = await mounter.mount(
          <ProtectionNotice
            kind={cas.kind}
            surface={surface}
            {...(cas.attachments === undefined ? {} : { attachments: cas.attachments })}
          />,
        );
        const element = noeud(host);
        expect(element).not.toBe(null);
        expect(element?.textContent ?? '').toBe(cas.texteAttendu);
        expect(element?.getAttribute('aria-label')).toBe(cas.ariaAttendu);

        const constat = host.querySelector('[data-withheld-media]');
        if (cas.constatAttendu === null) {
          expect(constat).toBe(null);
        } else {
          expect(constat).not.toBe(null);
          expect(constat?.textContent ?? '').toContain(cas.constatAttendu);
        }
      });
    }
  }
});

describe('ProtectedContent — le voile ORDINAIRE (`veiled`) annonce aussi ses pièces', () => {
  test('un voile avec 2 pièces porte `data-masked-media` — le MÊME compte que `withheld`, un chemin différent', async () => {
    const host = await mounter.mount(
      <ProtectedContent
        messageId="m-voile"
        kind="veiled"
        isViewOnce={false}
        contentLength={20}
        attachments={[uneImage(), uneImage()]}
        surface="row"
      >
        <span>texte réel — jamais monté tant que le voile est en place</span>
      </ProtectedContent>,
    );
    const voile = host.querySelector('[data-protected="hidden"]');
    expect(voile).not.toBe(null);
    expect(voile?.querySelector('[data-masked-media]')).not.toBe(null);
  });

  test('un voile SANS pièce ne porte PAS `data-masked-media` — le contraste sans lequel le test ci-dessus ne mesure rien', async () => {
    const host = await mounter.mount(
      <ProtectedContent messageId="m-voile-nu" kind="veiled" isViewOnce={false} contentLength={20} attachments={[]} surface="row">
        <span>texte réel — jamais monté tant que le voile est en place</span>
      </ProtectedContent>,
    );
    const voile = host.querySelector('[data-protected="hidden"]');
    expect(voile).not.toBe(null);
    expect(voile?.querySelector('[data-masked-media]')).toBe(null);
  });
});
