import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import type { Viewer } from '@/lib/api/viewer';
import { loadAdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { AdminConversationReading } from './admin-conversation-reading';

/**
 * **LA POLITIQUE DE PROTECTION DES MÉDIAS, DANS LA LECTURE SOUVERAINE.**
 *
 * ## CE QUE LE LOT A MESURÉ AVANT D'ÉCRIRE UNE LIGNE
 *
 * L'issue posait « `admin-conversation-reading.tsx` ne rend AUCUN média : zéro
 * occurrence de `Attachments`, `MediaGrid`, `attachment` ou `media` ». Le
 * comptage est exact et la conclusion est FAUSSE : cet écran ne rend rien
 * lui-même, il monte `ThreadModes` — la vraie vue du produit — qui descend
 * jusqu'à `Attachments`. Une recherche de vocabulaire dans le fichier HÔTE ne
 * dit rien de ce que rend l'arbre qu'il monte ; c'est la forme « suivre une
 * donnée jusqu'à son consommateur s'arrête un cran trop tôt » prise à
 * l'envers. `admin-conversation-reading.test.tsx` peignait déjà l'image et le
 * vocal AVANT ce lot.
 *
 * ## CE QUI MANQUAIT VRAIMENT, ET QUE CE FICHIER MESURE
 *
 * Aucun témoin — ni unitaire, ni au navigateur — ne portait sur une pièce
 * **PROTÉGÉE** dans la lecture souveraine. Or c'est exactement là que les deux
 * politiques peuvent diverger, parce qu'elles ne sont PAS la même :
 *
 * | niveau | qui décide côté PASSERELLE | qui décide côté CLIENT |
 * |---|---|---|
 * | le MESSAGE | `messageContentIsProtected` — vue unique, flou, effets, éphémère consommé, **chiffrement** | `protectionOf` (qui ignore le chiffrement) **+ le verdict SERVI** (`isProtected` → `contentWithheld`) |
 * | la PIÈCE | `mediaAttachmentIsProtected` = `maskedAttachment(pièce)` **OU** la protection du message | `maskedAttachment(pièce)` SEUL |
 *
 * La seconde ligne porte la question du lot : la passerelle retire `fileUrl`,
 * `thumbnailUrl`, `thumbHash`, `imageVariants`, la transcription et les pistes
 * d'une pièce protégée (`sovereign-message-projection.ts`, `servedAttachment`)
 * mais LAISSE `isViewOnce` / `isBlurred` / `effectFlags` bruts — c'est par eux,
 * et par eux seuls, que le client peut savoir qu'il tient un secret plutôt
 * qu'un fichier cassé. **Une pièce qui arrive sans URL et sans drapeau rendrait
 * une case vide, indiscernable d'un média abîmé** : un administrateur
 * conclurait « la pièce a disparu » là où la vérité est « la pièce est
 * protégée ».
 *
 * ## LE TÉMOIN QUI NE PEUT PAS VERDIR PAR COÏNCIDENCE (leçon 261)
 *
 * `effectFlags` SEUL est au corpus pour la même raison qu'un témoin de Prisme
 * s'écrit sur un rang autre que le premier : sur `isViewOnce: true`, une garde
 * juste et une garde qui ne lirait QUE `isViewOnce` rendent le même verdict.
 * Le bitfield est le troisième canal de `maskedAttachment`, celui qu'une
 * réécriture partielle laisse tomber — et la passerelle le sert.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

/** happy-dom ne fait aucune mise en page, et le virtualiseur ne rend rien sans hauteur. */
const HAUTEUR_SIMULEE = 800;
const LARGEUR_SIMULEE = 390;

function simuleLaMiseEnPage(): () => void {
  const proto = HTMLElement.prototype as unknown as object;
  const hauteur = Object.getOwnPropertyDescriptor(proto, 'offsetHeight');
  const largeur = Object.getOwnPropertyDescriptor(proto, 'offsetWidth');
  Object.defineProperty(proto, 'offsetHeight', { configurable: true, get: () => HAUTEUR_SIMULEE });
  Object.defineProperty(proto, 'offsetWidth', { configurable: true, get: () => LARGEUR_SIMULEE });
  return () => {
    if (hauteur !== undefined) Object.defineProperty(proto, 'offsetHeight', hauteur);
    if (largeur !== undefined) Object.defineProperty(proto, 'offsetWidth', largeur);
  };
}

let restaureLaMiseEnPage: (() => void) | null = null;

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  restaureLaMiseEnPage = simuleLaMiseEnPage();
  await loadAdminInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  restaureLaMiseEnPage?.();
  await releaseHappyDomIfRegistered();
});

const mounter = createActMounter();
afterEach(() => {
  mounter.unmountAll();
  appQueryClient.clear();
});

const MOTIF = 'Signalement #9142 — vérification des pièces';
const CONVERSATION = 'c-medias';

const EXPEDITEUR = {
  id: 'p-alice',
  userId: 'u-alice',
  displayName: 'Alice',
  avatar: null,
  user: { id: 'u-alice', username: 'alice' },
};

/** Le socle d'une ligne SERVIE par la route souveraine — jamais protégée par défaut. */
const ligne = (extra: Record<string, unknown>) => ({
  conversationId: CONVERSATION,
  senderId: 'u-alice',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isViewOnce: false,
  viewOnceCount: 0,
  isBlurred: false,
  reactionCount: 0,
  isEncrypted: false,
  isProtected: false,
  translations: [],
  replyTo: null,
  sender: EXPEDITEUR,
  ...extra,
});

/** Une pièce SERVIE — le socle commun, au grain exact de `servedAttachment`. */
const piece = (extra: Record<string, unknown>) => ({
  messageId: 'x',
  mimeType: 'image/png',
  fileSize: 96,
  thumbnailUrl: null,
  thumbHash: null,
  transcription: null,
  translations: null,
  imageVariants: null,
  isViewOnce: false,
  isBlurred: false,
  effectFlags: 0,
  isProtected: false,
  ...extra,
});

/**
 * LE CORPUS — quatre lignes, `createdAt DESC` comme la route, et chacune pose
 * UNE question que les autres ne posent pas.
 */
const CHARGE = {
  data: [
    /* 4. LE CHIFFREMENT — la passerelle a retenu le texte ET l'URL ; le client
       ne doit RIEN peindre, même si la charge portait encore un fichier. Le
       `fileUrl` ci-dessous est DÉLIBÉRÉMENT présent : un témoin fail-closed se
       mesure sur une charge plus bavarde que ce que le serveur sert. */
    ligne({
      id: 'm-chiffre',
      content: null,
      isEncrypted: true,
      encryptionMode: 'e2ee',
      isProtected: true,
      attachmentCount: 1,
      attachments: [
        piece({
          id: 'a-chiffre',
          messageId: 'm-chiffre',
          originalName: 'dossier-chiffre.png',
          fileUrl: 'data:image/png;base64,FUITE-CHIFFREE',
        }),
      ],
      createdAt: '2026-06-02T13:00:00.000Z',
    }),

    /* 3. LE BITFIELD SEUL — ni `isViewOnce`, ni `isBlurred` : le troisième
       canal de `maskedAttachment`, celui qu'une garde partielle laisse tomber. */
    ligne({
      id: 'm-effet',
      content: 'La pièce ci-dessous est masquée par son bitfield',
      attachmentCount: 1,
      attachments: [
        piece({
          id: 'a-effet',
          messageId: 'm-effet',
          originalName: 'bitfield-secret.png',
          fileUrl: null,
          effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE,
          isProtected: true,
        }),
      ],
      createdAt: '2026-06-02T12:00:00.000Z',
    }),

    /* 2. LA PIÈCE SEULE EST PROTÉGÉE, le message ne l'est pas — le cas où les
       deux politiques divergent le plus, et le seul que la passerelle sert
       avec un texte LISIBLE à côté d'un média RETENU. */
    ligne({
      id: 'm-piece',
      content: 'Regarde la photo',
      attachmentCount: 1,
      attachments: [
        piece({
          id: 'a-vue-unique',
          messageId: 'm-piece',
          originalName: 'vue-unique-secret.png',
          fileUrl: null,
          isViewOnce: true,
          isProtected: true,
        }),
      ],
      createdAt: '2026-06-02T11:00:00.000Z',
    }),

    /* 1. LE CONTRASTE — une pièce LIBRE. Sans elle, tous les témoins
       ci-dessus verdiraient sur un écran qui ne rendrait AUCUN média. */
    ligne({
      id: 'm-libre',
      content: 'Le plan de la salle',
      attachmentCount: 1,
      attachments: [
        piece({
          id: 'a-libre',
          messageId: 'm-libre',
          originalName: 'plan.png',
          fileUrl: 'data:image/png;base64,PLAN-LIBRE',
        }),
      ],
      createdAt: '2026-06-02T10:00:00.000Z',
    }),
  ],
  pagination: { total: 4, offset: 0, limit: 30, hasMore: false },
};

function transportSouverain(): HttpTransport {
  const transport = (async () => ({ ok: false, status: 0, error: 'jamais appelé' })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest): Promise<ApiResult<unknown>> => {
    if (req.path.startsWith(`/api/v1/admin/conversations/${CONVERSATION}/messages`)) {
      return { ok: true, data: CHARGE };
    }
    return { ok: false, status: 404, error: `non prévu : ${req.method} ${req.path}` };
  }) as HttpTransport['request'];
  return transport;
}

const VIEWER: Viewer = { id: 'u-membre', handle: 'membre', displayName: 'Le membre', isAnonymous: false };

async function lire() {
  const host = await mounter.mount(
    <QueryClientProvider client={appQueryClient}>
      <AdminConversationReading
        conversationId={CONVERSATION}
        language="fr"
        prisme="membre"
        readerLanguages={['fr']}
        readerLocale="fr"
        viewer={VIEWER}
        deps={{ source: 'gateway', transport: transportSouverain() }}
      />
    </QueryClientProvider>,
  );

  mounter.type(host, '[data-admin-reason]', MOTIF);
  await mounter.click(host.querySelector('[data-admin-reason-submit]') as HTMLElement | null);
  await mounter.settle();
  return host;
}

/** La rangée d'un message, telle que `ThreadModes` l'ancre. */
const rangee = (host: HTMLElement, id: string): Element | null => host.querySelector(`[data-row="${id}"]`);

describe('une pièce LIBRE atteint le pixel — le contraste sans lequel rien ne se mesure', () => {
  test('l’image sans protection rend une `<img>` qui porte sa source', async () => {
    const host = await lire();
    const ligneLibre = rangee(host, 'm-libre');
    const image = ligneLibre?.querySelector('img');
    expect(image).not.toBe(null);
    expect(image?.getAttribute('src') ?? '').toContain('PLAN-LIBRE');
  });
});

describe('une pièce PROTÉGÉE suit la politique du prédicat serveur', () => {
  test('VUE UNIQUE sur la pièce SEULE — le voile se peint, et il DIT qu’il s’agit d’une photo', async () => {
    const host = await lire();
    const ligneProtegee = rangee(host, 'm-piece');
    const voile = ligneProtegee?.querySelector('[data-protected-attachment="hidden"]');
    expect(voile).not.toBe(null);
    expect(voile?.getAttribute('aria-label')).toBe('Photo protégée');
  });

  test('… et le TEXTE du message, lui, reste lisible — la protection porte sur la PIÈCE', async () => {
    const host = await lire();
    expect(rangee(host, 'm-piece')?.textContent ?? '').toContain('Regarde la photo');
  });

  test('… aucune `<img>` ne se monte, pas même vide : une case sans source est un média CASSÉ, pas un secret', async () => {
    const host = await lire();
    expect(rangee(host, 'm-piece')?.querySelector('img')).toBe(null);
  });

  test('… et le NOM du fichier ne voyage pas non plus (leçon 275 — tout ce que la charge TRANSPORTE)', async () => {
    const host = await lire();
    expect(host.textContent ?? '').not.toContain('vue-unique-secret.png');
  });

  test('BITFIELD SEUL — `effectFlags` masque aussi, sans `isViewOnce` ni `isBlurred`', async () => {
    const host = await lire();
    const ligneEffet = rangee(host, 'm-effet');
    expect(ligneEffet?.querySelector('[data-protected-attachment="hidden"]')).not.toBe(null);
    expect(ligneEffet?.querySelector('img')).toBe(null);
    expect(host.textContent ?? '').not.toContain('bitfield-secret.png');
  });
});

describe('un message dont la passerelle a RETENU le contenu ne peint aucun média', () => {
  test('le chiffrement ferme la rangée ENTIÈRE — pièce comprise, même si la charge en portait une', async () => {
    const host = await lire();
    const ligneChiffree = rangee(host, 'm-chiffre');
    expect(ligneChiffree?.querySelector('img')).toBe(null);
    expect(host.innerHTML).not.toContain('FUITE-CHIFFREE');
  });

  /**
   * **LE CONSTAT, ET C'EST LE DÉFAUT QUE CE LOT CORRIGE.**
   *
   * `servedAttachment` LISTE les pièces d'un message retenu — `mimeType`,
   * `fileSize`, `duration`, `isProtected: true` — et son doc-comment dit
   * pourquoi : « un administrateur doit pouvoir CONSTATER qu'un média existe ».
   * La passerelle sert donc exprès ce qu'il faut pour le dire.
   *
   * Le fil ordinaire, lui, le DIT déjà : sur un message VOILÉ, le voile peint
   * `data-masked-media` dès qu'une pièce existe. Le chemin `withheld` — que
   * SEULE la lecture souveraine produit (`contentWithheld` n'a pas d'autre
   * appelant du chantier) — rendait une ligne « Contenu retenu » NUE. Le
   * lecteur le mieux autorisé du produit, sous motif écrit et sous trace
   * d'audit, en savait donc MOINS qu'un membre ordinaire devant le même
   * message : il ne pouvait pas distinguer « un texte a été retenu » de « deux
   * photos et un vocal ont été retenus ».
   */
  test('… mais il DIT qu’une pièce existe, avec sa nature — le constat que la passerelle sert exprès', async () => {
    const host = await lire();
    const constat = rangee(host, 'm-chiffre')?.querySelector('[data-withheld-media]');
    expect(constat).not.toBe(null);
    expect(constat?.textContent ?? '').toContain('1 image');
  });

  test('… et l’OREILLE l’entend aussi — un constat visible et muet serait à moitié livré', async () => {
    const host = await lire();
    expect(rangee(host, 'm-chiffre')?.getAttribute('aria-label') ?? '').toContain('1 image');
  });

  test('… sans que le constat ne fasse fuir ce que la protection retient', async () => {
    const host = await lire();
    expect(host.textContent ?? '').not.toContain('dossier-chiffre.png');
    expect(host.innerHTML).not.toContain('FUITE-CHIFFREE');
  });

  test('CONTRASTE — un message retenu SANS pièce ne fabrique aucun constat', async () => {
    const host = await lire();
    expect(rangee(host, 'm-piece')?.querySelector('[data-withheld-media]')).toBe(null);
  });
});
