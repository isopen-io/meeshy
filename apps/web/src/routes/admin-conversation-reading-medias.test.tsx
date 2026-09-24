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
 *
 * ## CE QUE LA PREMIÈRE FORME DE CE FICHIER NE VOYAIT PAS (#7023, relecture)
 *
 * Onze témoins verts, et QUATRE mutations de la production qu'aucun d'eux ne
 * faisait rougir — mesuré une à une sur les 5 536 témoins du chantier, toutes
 * les quatre vertes de bout en bout :
 *
 * | ce qu'on casse | ce que l'utilisateur perd | pourquoi personne ne tombait |
 * |---|---|---|
 * | la garde de la branche **AUDIO** de `Attachments` | un vocal protégé rend un lecteur, sa DURÉE et sa piste | le corpus n'avait pas de vocal protégé |
 * | la garde de la branche **FICHIER** | un fichier protégé rend son NOM et son POIDS | ni de fichier protégé |
 * | le bouton **« Ouvrir … »** de `ImageTile` | l'administrateur ne peut plus examiner le média | aucun témoin ne TOUCHAIT rien |
 * | le **constat** d'un contenu retenu, augmenté du poids | la charge dit ce que la leçon 275 interdit | on cherchait une aiguille, jamais la FORME |
 *
 * Les trois premières lignes ont la MÊME racine : `Attachments` PARTITIONNE
 * (`partitionAttachments`) et pose sa garde TROIS fois — grille visuelle,
 * audio, fichier — et le corpus n'atteignait qu'une branche sur trois. **Un
 * corpus qui ne porte qu'un médium ne mesure qu'un tiers d'une règle qui en
 * gouverne trois**, quel que soit le nombre d'assertions écrites dessus.
 *
 * La quatrième est l'autre moitié de la même leçon, prise par l'autre bout :
 * **une aiguille prouve qu'une chose EST là, jamais que rien d'autre ne l'est.**
 * `toContain('1 image')` reste vrai sur « 1 image, 90210 o ».
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
          /* 90 210 octets, soit « 88 Ko » une fois arrondis par le bloc
             FICHIER — un poids DISTINCTIF, pour que son absence du constat se
             mesure sur un chiffre qui n'a aucune raison d'apparaître ailleurs. */
          fileSize: 90210,
          duration: 41000,
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

    /* 2 bis. LE VOCAL — l'AUTRE médium, et le corpus n'en portait aucun de
       protégé. `servedAttachment` sert `duration` SANS condition (relu ligne
       à ligne) : un vocal protégé qui rendrait son widget peindrait « 0:42 »
       sous une onde, c'est-à-dire la durée d'un secret. La pièce LIBRE à côté
       est le contraste — sans elle, « aucun <audio> » verdirait sur un écran
       qui ne monterait aucun lecteur. */
    ligne({
      id: 'm-vocal',
      content: 'Écoute ça',
      attachmentCount: 2,
      attachments: [
        piece({
          id: 'a-vocal-libre',
          messageId: 'm-vocal',
          originalName: 'note-libre.m4a',
          mimeType: 'audio/mp4',
          duration: 7000,
          transcription: { language: 'fr', text: 'Bonjour tout le monde' },
          fileUrl: 'data:audio/mp4;base64,VOCAL-LIBRE',
        }),
        piece({
          id: 'a-vocal-secret',
          messageId: 'm-vocal',
          originalName: 'memo-secret.m4a',
          mimeType: 'audio/mp4',
          duration: 42000,
          /* `fileUrl` DÉLIBÉRÉMENT bavard, comme le corpus du gate : un témoin
             fail-closed se mesure sur une charge plus généreuse que ce que le
             serveur sert. Servi à `null`, ce vocal ne prouverait que l'absence
             d'une URL absente — c'est la garde CLIENT qu'on mesure ici. */
          fileUrl: 'data:audio/mp4;base64,FUITE-VOCALE',
          isBlurred: true,
          isProtected: true,
        }),
      ],
      createdAt: '2026-06-02T10:45:00.000Z',
    }),

    /* 2 ter. LE FICHIER — le TROISIÈME médium, celui dont le bloc peint le
       NOM D'ORIGINE et le POIDS en toutes lettres. `servedAttachment` sert les
       deux sans condition sur une pièce protégée : c'est exactement le secret
       que ce fichier de témoins revendique de garder, sur la branche que son
       corpus n'atteignait pas. */
    ligne({
      id: 'm-fichier',
      content: 'Le dossier',
      attachmentCount: 2,
      attachments: [
        piece({
          id: 'a-fichier-libre',
          messageId: 'm-fichier',
          originalName: 'ordre-du-jour.pdf',
          mimeType: 'application/pdf',
          fileSize: 2048,
          fileUrl: 'data:application/pdf;base64,PDF-LIBRE',
        }),
        piece({
          id: 'a-fichier-secret',
          messageId: 'm-fichier',
          originalName: 'dossier-confidentiel.pdf',
          mimeType: 'application/pdf',
          fileSize: 123904,
          fileUrl: 'data:application/pdf;base64,FUITE-DOSSIER',
          effectFlags: MESSAGE_EFFECT_FLAGS.VIEW_ONCE,
          isProtected: true,
        }),
      ],
      createdAt: '2026-06-02T10:30:00.000Z',
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
  pagination: { total: 6, offset: 0, limit: 30, hasMore: false },
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

/**
 * ATTENDRE UNE CONDITION, BORNÉE EN TEMPS — jamais un budget de tours (#6187).
 *
 * `Attachments` monte la visionneuse en `lazy(() => import('./media-viewer'))` :
 * son apparition est un TRAVAIL, pas une constante, et « deux tours de
 * macro-tâche » est exactement la forme qui rougit sur un runner chargé pendant
 * qu'elle passe en local. Mesuré ici avant la correction : 1 rouge sur 5 runs du
 * seul fichier, sur cette assertion-là.
 *
 * Attendre la condition qu'on va ASSERTER n'est pas un vert par construction :
 * une borne épuisée laisse l'assertion rougir, et c'est ce que fait la mutation
 * « le bouton d'ouverture retiré » (contre-épreuve au commit).
 */
const ATTENTE_MAX_MS = 2000;
async function attendre(condition: () => boolean): Promise<void> {
  const limite = Date.now() + ATTENTE_MAX_MS;
  for (;;) {
    await mounter.settle();
    if (condition() || Date.now() >= limite) return;
  }
}

describe('une pièce LIBRE atteint le pixel — le contraste sans lequel rien ne se mesure', () => {
  test('l’image sans protection rend une `<img>` qui porte sa source', async () => {
    const host = await lire();
    const ligneLibre = rangee(host, 'm-libre');
    const image = ligneLibre?.querySelector('img');
    expect(image).not.toBe(null);
    expect(image?.getAttribute('src') ?? '').toContain('PLAN-LIBRE');
  });
});

/**
 * **L'AFFORDANCE — « un contrôle existe s'il a un EFFET » (loi 4).**
 *
 * Aucun témoin de ce lot ne TOUCHAIT quoi que ce soit : ils lisaient un DOM au
 * repos. Retirer le bouton qui ouvre la pièce en grand laissait donc les onze
 * témoins et les quatre-vingts constats du gate parfaitement verts — mesuré —
 * pendant qu'un administrateur perdait le seul geste qui lui permet d'INSPECTER
 * un média sous motif écrit. Une image de 1 px de large étirée sur une tuile ne
 * s'examine pas : elle s'ouvre.
 *
 * Le témoin va jusqu'à l'EFFET, jamais jusqu'au bouton seul — c'est la
 * différence entre « le contrôle est là » et « le contrôle fait quelque chose »,
 * et c'est exactement le défaut que la loi 4 a déjà payé sur `PostCard`
 * (CLAUDE.md, cycle 123 : « cliquer n'y changeait RIEN — le contrôle était
 * INERTE »).
 */
describe('la pièce libre s’OUVRE — un média qu’on ne peut pas examiner n’est pas servi', () => {
  test('la tuile monte son bouton d’ouverture, nommé', async () => {
    const host = await lire();
    const bouton = rangee(host, 'm-libre')?.querySelector('button[aria-label^="Ouvrir "]');
    expect(bouton).not.toBe(null);
  });

  test('… et le toucher OUVRE la visionneuse — sinon le bouton est inerte', async () => {
    const host = await lire();
    const bouton = rangee(host, 'm-libre')?.querySelector('button[aria-label^="Ouvrir "]');
    await mounter.click(bouton as HTMLElement | null);
    await attendre(() => document.body.querySelector('[data-media-viewer]') !== null);
    expect(document.body.querySelector('[data-media-viewer]')).not.toBe(null);
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

/**
 * **LA PROTECTION SE MESURE SUR LES TROIS MÉDIUMS, PAS SUR L'IMAGE SEULE.**
 *
 * `Attachments` PARTITIONNE (`partitionAttachments`) et pose la garde
 * `maskedAttachment` TROIS fois : dans la grille (visuel), sur la branche
 * `audio`, sur la branche `nonMedia`. Le corpus n'atteignait que la première —
 * mesuré : retirer la garde des DEUX autres laissait les 5 536 témoins du
 * chantier verts, et les 80 constats du gate aussi (son corpus ne porte pas
 * davantage de vocal ni de fichier protégé).
 *
 * Ce que ces deux branches laissaient alors partir n'est pas rien, et c'est
 * précisément la liste de la leçon 275 — « une protection de CONTENU se mesure
 * sur tout ce que la charge TRANSPORTE, jamais sur sa seule chaîne » :
 * `servedAttachment` sert `originalName`, `fileSize` et `duration` SANS
 * condition sur une pièce protégée (relu ligne à ligne), parce que la ligne
 * doit rester LISTABLE côté administration. Le client est donc le SEUL à les
 * retenir — le bloc FICHIER peint le nom et le poids, le widget VOCAL peint la
 * durée.
 *
 * Et chaque témoin vient avec sa pièce LIBRE du même médium : sans ce
 * contraste, « aucun `<audio>` » et « le nom n'est pas là » verdiraient sur un
 * écran qui ne rendrait ni vocal ni fichier du tout.
 */
describe('un VOCAL protégé rend son voile, jamais un lecteur', () => {
  test('le voile se peint, et il DIT qu’il s’agit d’un vocal', async () => {
    const host = await lire();
    const voiles = [...(rangee(host, 'm-vocal')?.querySelectorAll('[data-protected-attachment="hidden"]') ?? [])];
    expect(voiles.map((v) => v.getAttribute('aria-label'))).toEqual(['Vocal protégé']);
  });

  test('… et la DURÉE du secret ne se peint nulle part — la passerelle la sert pourtant', async () => {
    const host = await lire();
    const texte = rangee(host, 'm-vocal')?.textContent ?? '';
    expect(texte).toContain('0:07');
    expect(texte).not.toContain('0:42');
  });

  test('… ni son nom de fichier, ni la piste que la charge portait encore (leçon 275)', async () => {
    const host = await lire();
    expect(host.textContent ?? '').not.toContain('memo-secret.m4a');
    expect(host.innerHTML).not.toContain('FUITE-VOCALE');
  });

  test('CONTRASTE — le vocal LIBRE du même message reste jouable', async () => {
    const host = await lire();
    const lecteurs = [...(rangee(host, 'm-vocal')?.querySelectorAll('audio') ?? [])];
    expect(lecteurs.length).toBe(1);
    expect(lecteurs[0]?.getAttribute('src') ?? '').toContain('VOCAL-LIBRE');
  });
});

describe('un FICHIER protégé rend son voile, jamais son nom', () => {
  test('le voile se peint, et il DIT qu’il s’agit d’une pièce', async () => {
    const host = await lire();
    const voiles = [...(rangee(host, 'm-fichier')?.querySelectorAll('[data-protected-attachment="hidden"]') ?? [])];
    expect(voiles.map((v) => v.getAttribute('aria-label'))).toEqual(['Pièce protégée']);
  });

  test('… et NI le nom NI le poids du fichier retenu n’atteignent le DOM', async () => {
    const host = await lire();
    const dom = host.innerHTML;
    expect(dom).not.toContain('dossier-confidentiel.pdf');
    expect(dom).not.toContain('121 Ko');
    expect(dom).not.toContain('FUITE-DOSSIER');
  });

  test('CONTRASTE — le fichier LIBRE du même message, lui, dit son nom et son poids', async () => {
    const host = await lire();
    const texte = rangee(host, 'm-fichier')?.textContent ?? '';
    expect(texte).toContain('ordre-du-jour.pdf');
    expect(texte).toContain('2 Ko');
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

  /**
   * **LA FORME DU CONSTAT EST LA LOI, PAS SEULEMENT SON CONTENU.**
   *
   * « contient 1 image » ne dit rien de ce qui voyage AUTOUR. Mesuré : ajouter
   * le poids des pièces retenues au constat — `1 image, 90210 o`, exactement ce
   * que la leçon 275 interdit (« jamais le nom, le poids, la durée ni l'URL »)
   * — laissait les onze témoins de ce fichier et les 80 constats du gate verts,
   * parce que tous ne cherchaient qu'une aiguille.
   *
   * Une aiguille prouve qu'une chose EST là ; seule la FORME prouve que rien
   * d'autre ne l'est. Le constat est donc lu au caractère près, et le poids
   * distinctif de la pièce (`90 210 o` ⇒ « 88 Ko ») est cherché dans toute la
   * rangée, attributs compris.
   */
  test('… et le constat dit le TYPE et le NOMBRE, rien de plus (leçon 275)', async () => {
    const host = await lire();
    const ligneChiffree = rangee(host, 'm-chiffre');
    const constat = ligneChiffree?.querySelector('[data-withheld-media]');
    expect((constat?.textContent ?? '').replace(/\s+/g, ' ').trim()).toBe('· 1 image');
    expect(ligneChiffree?.outerHTML ?? '').not.toContain('90210');
    expect(ligneChiffree?.outerHTML ?? '').not.toContain('88 Ko');
    expect(ligneChiffree?.outerHTML ?? '').not.toContain('0:41');
  });

  test('CONTRASTE — un message retenu SANS pièce ne fabrique aucun constat', async () => {
    const host = await lire();
    expect(rangee(host, 'm-piece')?.querySelector('[data-withheld-media]')).toBe(null);
  });
});
