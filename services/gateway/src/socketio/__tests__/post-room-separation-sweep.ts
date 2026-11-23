/**
 * **L'INVENTAIRE DES SITES QUI ADRESSENT LA ROOM D'UN POST** (#20430).
 *
 * Quatre lots ont fermé la séparation famille par famille — #20216 le contenu
 * d'un commentaire, #20236 ses quatre activités, #20338 sept familles de post,
 * de story et de statut, #20429 la huitième — et **chacun a découvert la
 * suivante en posant la question à la main.** C'est la leçon 261 dans sa forme
 * pure : une énumération dit « ces sites appliquent la règle », jamais « ce
 * sont les sites où elle s'applique ».
 *
 * Ce balayage remplace la question posée à la main. Il relève les sites de
 * PRODUCTION qui citent `ROOMS.post(`, et exige de chacun qu'il déclare sa
 * NATURE. Un site absent de l'inventaire est un ROUGE — **le silence n'est pas
 * une cinquième valeur** (même forme que `root-mounted-surfaces.ts`).
 *
 * ─── CE QU'IL NE SAIT PAS FAIRE, DIT ICI ─────────────────────────────────
 *
 * Il ne lit pas le flot de données : il ne peut pas PROUVER qu'un site gouverné
 * passe le BON verdict, seulement qu'il en prend un. La preuve de justesse est
 * aux témoins (`post-contenu-separe-20430.test.ts`,
 * `activite-post-story-statut-20338.test.ts`, …), et ce balayage ne la remplace
 * pas. Il garde une chose, et une seule : **qu'aucun site neuf n'apparaisse
 * sans que quelqu'un ait répondu à la question.**
 *
 * Et il est volontairement TEXTUEL et étroit. Le cycle 107 a jeté un balayage
 * qui cherchait un seul idiome et rendait sept faux positifs : il mesurait la
 * popularité d'une orthographe, pas une propriété. D'où une liste blanche de
 * natures déclarées à la main plutôt qu'une inférence.
 *
 * ─── SES TROIS TROUS, MESURÉS ET ÉCRITS ──────────────────────────────────
 *
 * L'audit adversarial de #20430 les a OUVERTS un par un, en faisant passer le
 * cliquet au vert sous une fuite. Les voici, parce qu'un cliquet qui cache ses
 * angles morts vaut moins que pas de cliquet :
 *
 * 1. **Un site neuf NON gardé dans un fichier DÉJÀ déclaré passe au vert.** La
 *    clé est le FICHIER ; ajouter une émission non gardée dans
 *    `socialEmissionCore.ts` — le hub d'adresses, et donc le fichier qu'un lot
 *    futur éditera — ne change pas l'ensemble relevé. **Mesuré : 6/6 verts sous
 *    une émission injectée.** C'est le trou le plus grave, et il est à la pire
 *    place.
 * 2. **Un littéral `[]` dans un `PostRoomTarget` n'a aucun nom à relever.**
 *    `{ id, separated: [] }` type-checke, n'exclut personne, et le relevé
 *    `NOTHING_TO_SILENCE` ne peut pas le voir (le champ n'est pas un argument
 *    nommé). Le relevé attrape le littéral `[]` en DERNIER ARGUMENT d'un
 *    émetteur connu, pas dans un objet.
 * 3. **Il ne prouve pas qu'un verdict est JUSTE**, seulement qu'il en existe
 *    un. Il ne lit pas le flot de données.
 *
 * Les trois se ferment par un TYPE, pas par du texte : un verdict NOMINAL que
 * seul `roomsAround` (ou une exemption nommée) puisse produire rendrait `[]`
 * et l'oubli impossibles à écrire. **Suivi : #20461.** D'ici là, la preuve de
 * justesse est aux témoins (`post-contenu-separe-20430.test.ts`,
 * `activite-post-story-statut-20338.test.ts`, …), et ce balayage ne garde
 * qu'une chose : **qu'aucun FICHIER neuf n'apparaisse sans que quelqu'un ait
 * répondu à la question.**
 */

import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const GATEWAY_SRC = join(__dirname, '../..');

/**
 * Les quatre natures d'un site qui cite `ROOMS.post(`, et ce que chacune
 * ENGAGE. La nature est déclarée, jamais devinée : apprendre au balayage à
 * inférer une garde reviendrait à rendre des verts sur une intuition.
 */
export type PostRoomKind =
  /** ÉMET vers la room, et prend un verdict de séparation. */
  | 'emission-gouvernee'
  /** FABRIQUE des noms de rooms et n'émet rien : ses appelants gouvernent. */
  | 'fabrique-de-rooms'
  /** ADHÉSION — `socket.join` / `socketsLeave`. Ni charge, ni audience à taire. */
  | 'adhesion'
  /** ÉMET sans séparation, et la RAISON est écrite. */
  | 'exemption-motivee';

export type PostRoomSite = {
  readonly file: string;
  readonly kind: PostRoomKind;
  /** Exigée pour `exemption-motivee` et `adhesion` : ce que la nature engage. */
  readonly raison?: string;
  /**
   * Les émissions de CE fichier qui adressent la room sans verdict, chacune
   * avec sa raison.
   *
   * Sans ce champ, une exemption se cachait derrière une nature
   * `emission-gouvernee` : `broadcastCommentDeleted` émet par la FABRIQUE sans
   * aucun verdict, et ne figurait ni ici ni dans l'inventaire
   * `NOTHING_TO_SILENCE` (il ne passe pas la constante). L'audit du lot l'a
   * trouvée — matériellement inoffensive, structurellement invisible, et
   * surtout : c'est le patron qu'un lot futur recopierait.
   */
  readonly exemptionsInternes?: readonly { readonly event: string; readonly raison: string }[];
};

/**
 * L'inventaire, relevé le 2026-11-23. Clé par FICHIER, jamais par numéro de
 * ligne : une clé de ligne dérive à la première édition et transforme le
 * cliquet en bruit (leçon du cliquet des schémas de réponse).
 */
export const POST_ROOM_SITES: readonly PostRoomSite[] = [
  {
    file: 'socketio/handlers/socialEmissionCore.ts',
    kind: 'emission-gouvernee',
    raison:
      'Les quatre primitives d’adresse — `commentBroadcastRooms` (consommée par ' +
      '`commentEmitter`), `emitToFeedsAndPostRoom` et `emitCommentActivity` (paramètre ' +
      '`separated`), `emitPostToAudience` (`PostRoomTarget`, dont le verdict est ' +
      'INSÉPARABLE de l’id). Aucune n’adresse la room sans verdict.',
  },
  {
    file: 'socketio/handlers/CommentReactionHandler.ts',
    kind: 'emission-gouvernee',
    raison: '`postRoom(postId, separated)` — le verdict est un paramètre requis (#20337).',
  },
  {
    file: 'socketio/handlers/PostReactionHandler.ts',
    kind: 'emission-gouvernee',
    raison:
      'Le site d’émission est gardé par `if (separated === null) return;` juste au-dessus ' +
      '(#20338). `postRoomsOf` y est une FABRIQUE de noms, et le `post:join` une ADHÉSION — ' +
      'deux natures de plus dans le même fichier, ce que la clé par fichier agrège ' +
      'volontairement : c’est le fichier qu’un lot édite.',
  },
  {
    file: 'routes/admin/publication-moderation-writer.ts',
    kind: 'adhesion',
    raison:
      'Un `socketsLeave` : au retrait d’une publication, la salle se VIDE, et `post:join` ' +
      'refait passer la porte à qui revient. C’est le seul site du dépôt qui évince d’une ' +
      'room de post — et il traite exactement le danger que #20430 nomme (« une socket ' +
      'jointe quand le post était lisible y resterait et recevrait les éditions »), pour ' +
      'la modération et non pour le BLOCAGE. Suivi de l’éviction au blocage : #20458.',
  },
  {
    file: 'socketio/handlers/SocialEventsHandler.ts',
    kind: 'emission-gouvernee',
    raison:
      'Ne cite JAMAIS `ROOMS.post(` — il adresse la room par la FABRIQUE ' +
      '`commentBroadcastRooms`, sept fois, plus `emitToFeedsAndPostRoom` et ' +
      '`emitPostToAudience`. C’est pourquoi le relevé suit aussi les fabriques : la ' +
      'première version de ce balayage, purement orthographique, manquait le fichier ' +
      'qui émet le PLUS. Les verdicts viennent de `commentEmitter` (contenu de ' +
      'commentaire, #20216) et de `contentSeparation` (contenu de post et ses trois ' +
      'traductions, #20430).',
    exemptionsInternes: [
      {
        event: 'COMMENT_DELETED',
        raison:
          '`broadcastCommentDeleted` émet par la fabrique SANS verdict. La charge est ' +
          '`{ postId, commentId, removedIds? }` — des identifiants, aucun texte, aucun ' +
          'auteur nommé. Sur-diffuser une suppression est sans danger : qui n’avait pas ' +
          'le commentaire l’ignore, et le lecteur séparé n’apprend rien qu’il ne sache ' +
          'déjà (il lisait le fil). Exemption DÉCLARÉE depuis l’audit de #20430 ; elle ' +
          'était invisible aux deux inventaires parce qu’elle ne passe pas la constante.',
      },
    ],
  },
  {
    file: 'socketio/separatedRooms.ts',
    kind: 'fabrique-de-rooms',
    raison:
      'Aucune occurrence de code : la seule mention est en PROSE, dans le doc-comment qui ' +
      'raconte la fuite d’origine de #20236. Déclarée pour que le balayage ne la compte ' +
      'pas comme un site neuf.',
  },
];

/**
 * Les appels qui diffusent SANS séparation, en passant la constante qui le
 * déclare. C'est ici que se poserait une fuite NEUVE : un lot qui ajoute une
 * diffusion et recopie `NOTHING_TO_SILENCE` chez le voisin.
 *
 * **La leçon du lot : « ne nomme personne » n'est pas « ne porte aucun
 * contenu ».** Le critère de fin de #20430 donnait les trois traductions pour
 * des exemptions légitimes à ce motif ; mesuré, les trois portent
 * `translation.text` — le contenu du post dans une autre langue — et elles ont
 * donc reçu la séparation comme leurs jumelles de commentaire l'avaient reçue
 * dès #20216.
 */
export const NOTHING_TO_SILENCE_CALLERS: readonly { readonly event: string; readonly raison: string }[] = [
  {
    event: 'POST_DELETED',
    raison:
      'La charge est `{ postId, authorId }` — deux identifiants, aucun contenu, et l’auteur ' +
      'y est NOMMÉ par un champ que le lecteur connaît déjà puisqu’il lisait le post. Sur-' +
      'diffuser une suppression est sans danger : qui n’avait pas le post l’ignore.',
  },
];

const walk = (dir: string): string[] =>
  readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (entry === '__tests__' || entry === 'node_modules') return [];
    if (statSync(full).isDirectory()) return walk(full);
    return full.endsWith('.ts') ? [full] : [];
  });

/**
 * Les FABRIQUES de rooms de post : un fichier qui les consomme adresse la room
 * sans jamais écrire `ROOMS.post(`.
 *
 * **C'est le défaut que l'audit du lot a trouvé dans la première version de ce
 * balayage**, et il était grave : `SocialEventsHandler.ts` contient **ZÉRO**
 * occurrence de `ROOMS.post(` et adresse pourtant la room **sept fois** par
 * `commentBroadcastRooms`. Le fichier qui émet le plus était donc hors du
 * relevé — et le relevé mesurait une ORTHOGRAPHE, pas une propriété, ce que le
 * doc-comment d'en tête prétendait justement éviter (cycle 107).
 */
const ROOM_FACTORIES = ['commentBroadcastRooms', 'postRoomsOf'] as const;

/**
 * Les fichiers de production qui ADRESSENT la room d'un post — directement
 * (`ROOMS.post(`) ou par une fabrique.
 */
export function sweepPostRoomFiles(): readonly string[] {
  return walk(GATEWAY_SRC)
    .filter((file) => {
      const text = readFileSync(file, 'utf8');
      return text.includes('ROOMS.post(') || ROOM_FACTORIES.some((f) => text.includes(`${f}(`));
    })
    .map((file) => relative(GATEWAY_SRC, file).split('\\').join('/'))
    .sort();
}

/**
 * Les événements diffusés SANS séparation : `NOTHING_TO_SILENCE`, ou un
 * littéral `[]` qui lui est strictement équivalent.
 *
 * **Relevé sur l'APPEL entier, pas sur la ligne** — l'audit du lot a désarmé la
 * première version par deux orthographes triviales : un appel formaté sur neuf
 * lignes (l'événement n'étant plus sur la même ligne que la constante) et le
 * littéral `[]`, que `NOTHING_TO_SILENCE` *est*. Un `prettier --print-width` ou
 * un argument de plus suffisait.
 */
export function sweepNothingToSilenceCallers(): readonly string[] {
  const found = new Set<string>();
  const EMITTERS = /\b(emitToFeedsAndPostRoom|emitToUserFeedAndPostRoom|emitPostToAudience)\s*\(/g;
  for (const file of walk(GATEWAY_SRC)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(EMITTERS)) {
      const call = balancedCall(text, match.index + match[0].length - 1);
      if (call === null) continue;
      const sansSeparation = /NOTHING_TO_SILENCE/.test(call) || /,\s*\[\s*\]\s*\)?\s*;?\s*$/.test(call.trim());
      if (!sansSeparation) continue;
      const event = /SERVER_EVENTS\.([A-Z_]+)/.exec(call);
      found.add(event?.[1] ?? `ÉVÉNEMENT-NON-RÉSOLU@${relative(GATEWAY_SRC, file)}`);
    }
  }
  return [...found].sort();
}

/**
 * Le texte d'un appel, de sa parenthèse ouvrante à sa fermante APPARIÉE.
 *
 * Un balayage qui ne sait pas résoudre PUBLIE plutôt que de deviner (doctrine
 * du dépôt) : `null` quand les parenthèses ne se referment pas, et l'appelant
 * passe au suivant plutôt que d'inventer un verdict.
 */
function balancedCall(text: string, openIndex: number): string | null {
  let depth = 0;
  for (let i = openIndex; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return text.slice(openIndex, i + 1);
    }
  }
  return null;
}
