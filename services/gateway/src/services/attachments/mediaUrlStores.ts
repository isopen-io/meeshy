import type { PrismaClient } from '@meeshy/shared/prisma/client';

import type { MediaUrlRow, MediaUrlStore } from './mediaUrlNormalization';

/**
 * LES DEUX REQUÊTES DU BALAYAGE D'ADRESSES (#7022), ÉCRITES LÀ OÙ UN
 * COMPILATEUR LES LIT.
 *
 * Le balayage (`mediaUrlNormalization.ts`) ne connaît qu'un port à trois
 * méthodes, pour une raison mesurée : un faux Prisma accepte N'IMPORTE QUELLE
 * forme de requête, donc un témoin écrit contre lui verdit sur un `select` qui
 * ne compile pas. La contrepartie est que les VRAIES requêtes doivent être
 * jugées ailleurs — par `tsc`. Encore faut-il qu'il les LISE.
 *
 * `services/gateway/tsconfig.json` n'inclut que `src/**` et `shared/**` : les
 * vingt fichiers de `scripts/` sont hors du programme
 * (`tsc --listFiles | grep -c normalize-media-urls` rend `0`). Écrites dans le
 * script, comme elles l'étaient, ces deux requêtes n'étaient jugées par RIEN —
 * ni par le compilateur, ni par un témoin. Elles vivent donc ici, dans le
 * programme que l'étape « Type-check » de la CI joue en BLOQUANT sur le
 * gateway.
 *
 * CE QUE `tsc` ATTRAPE VRAIMENT, mesuré sous le `tsconfig` réel
 * (`strict: false`) en réintroduisant chaque faute dans une sonde jetable :
 *
 * | faute                                          | verdict   |
 * |------------------------------------------------|-----------|
 * | `select` qui OMET une colonne que la suite lit  | TS2322 ✓  |
 * | `orderBy` sur une colonne inventée              | TS2353 ✓  |
 * | `update.data` sur une colonne inventée          | TS2353 ✓  |
 * | `select` qui NOMME une colonne inventée         | **RIEN**  |
 *
 * La quatrième ligne est le trou, et il est écrit ici plutôt que taisu :
 * `select: { colonneQuiNexistePas: true }` passe en silence — même famille que
 * le `prisma.conversationPreference` du cycle 129, que `tsc` laissait passer
 * pendant qu'aucune catégorie de conversation ne pouvait être supprimée. Ce
 * qui sauve ce module-ci est l'ANNOTATION du type de retour
 * (`Promise<readonly MediaUrlRow[]>`) : une colonne mal nommée fait perdre la
 * colonne RÉELLE, et c'est cette perte qui rougit. **Un `select` n'est jugé que
 * par ce que son appelant EXIGE de la ligne rendue** — sans l'annotation, les
 * trois lignes ✓ se réduisent à deux.
 *
 * LE TYPE PREND SES DÉLÉGUÉS DE PRISMA, jamais d'une interface écrite à la
 * main. Une interface maison serait satisfaite par n'importe quel objet — y
 * compris `prisma.user`, dont les colonnes n'ont rien à voir — et toute
 * assertion d'assignabilité posée dessus serait increvable. C'est mesuré : un
 * premier jet de ce module portait un tel cliquet, et la mutation censée le
 * faire rougir (`messageAttachment` → `user`) le laissait VERT. Il a été
 * retiré plutôt que gelé — un témoin qui ne peut pas tomber n'est pas un
 * témoin.
 */
type AttachmentDelegate = PrismaClient['messageAttachment'];
type PostMediaDelegate = PrismaClient['postMedia'];

/** La taille d'une page — 2912 lignes tiennent en six allers, sans rien charger d'énorme. */
const PAGE = 500;

const SELECT = { id: true, fileUrl: true, thumbnailUrl: true } as const;
const ORDER = { id: 'asc' } as const;

/**
 * LE CURSEUR EST L'ID, JAMAIS UN `skip` NUMÉRIQUE. Le passage RÉÉCRIT les
 * lignes qu'il vient de lire ; un décalage numérique glisserait sous ses
 * propres écritures et sauterait des lignes en silence — la forme de panne
 * qu'une migration ne peut pas se permettre, son seul verdict visible étant un
 * compte. `cursor` + `skip: 1` reprend au premier id STRICTEMENT après le
 * dernier rendu, quoi qu'il soit advenu des précédents.
 */
function pageArgs(cursor: string | null) {
  const base = { select: SELECT, orderBy: ORDER, take: PAGE } as const;
  return cursor === null ? base : { ...base, cursor: { id: cursor }, skip: 1 };
}

/**
 * `prisma.messageAttachment` — 2176 lignes mesurées le 2026-09-18, dont 964 en
 * adresse absolue et 539 en route relative.
 */
export function attachmentUrlStore(delegate: AttachmentDelegate): MediaUrlStore {
  return {
    name: 'MessageAttachment',
    list: async (cursor): Promise<readonly MediaUrlRow[]> => delegate.findMany(pageArgs(cursor)),
    write: async (id, patch) => {
      await delegate.update({ where: { id }, data: patch });
    },
  };
}

/** `prisma.postMedia` — 736 lignes mesurées le même jour, dont 636 absolues. */
export function postMediaUrlStore(delegate: PostMediaDelegate): MediaUrlStore {
  return {
    name: 'PostMedia',
    list: async (cursor): Promise<readonly MediaUrlRow[]> => delegate.findMany(pageArgs(cursor)),
    write: async (id, patch) => {
      await delegate.update({ where: { id }, data: patch });
    },
  };
}
