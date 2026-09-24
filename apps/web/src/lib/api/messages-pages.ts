import type { InfiniteData } from '@tanstack/react-query';

import { decodeMessage } from './decode';
import type { Message } from './types';

/**
 * **LA FORME D'UNE PAGE DU FIL** (#6972) — jumelle de `ConversationsPage`
 * (`conversations-pages.ts`, #6195), réduite à ce que la passerelle garantit
 * sur CHAQUE page de `GET /conversations/:id/messages` :
 * `cursorPagination` est TOUJOURS présent (`messages-list.ts:754-758`,
 * et son schéma le déclare — « Must stay declared: fast-json-stringify strips
 * undeclared fields, which silently killed client infinite scroll »), tandis
 * que `pagination` n'est servi qu'en page 1 (`:790-792`). Ce port ne lit donc
 * que le curseur : deux champs, pas deux blocs.
 *
 * `messages` est ASCENDANT **dans la page** — la passerelle sert
 * `createdAt DESC` (vue par défaut CHRONOLOGIE,
 * `messages-list-views.ts:101-107`), `loadMessages` renverse. C'est
 * exactement ce qui rend `flattenMessagePages` non trivial : voir son
 * doc-comment.
 *
 * `hasOlder` = « une page PLUS ANCIENNE existe » (`cursorPagination.hasMore`).
 * `nextCursor` = l'id du message le plus ANCIEN de la page, à renvoyer en
 * `before` — la moitié du curseur que ce port LISAIT sans jamais l'utiliser
 * avant ce lot.
 */
export type MessagesPage = {
  readonly messages: readonly Message[];
  readonly hasOlder: boolean;
  readonly nextCursor: string | null;
};

/** Le curseur EST un id de MESSAGE (jamais un horodatage — la description du
 * schéma de la passerelle dit « before this timestamp » et elle est FAUSSE,
 * `messages-list.ts:119` ; le handler le résout en `createdAt` puis filtre
 * `{ lt: … }`, `:386-397`). */
export type MessagesPageParam = string | undefined;

export type MessagesInfiniteData = InfiniteData<MessagesPage, MessagesPageParam>;

/**
 * `flattenMessagePages` — L'APLATISSEMENT, ET LE PIÈGE QU'IL EXISTE POUR
 * ÉVITER.
 *
 * Les pages arrivent de la plus RÉCENTE (page 1, sans `before`) à la plus
 * ANCIENNE ; chaque page est ASCENDANTE en interne. Un
 * `pages.flatMap(p => p.messages)` naïf placerait donc l'historique APRÈS le
 * présent — le fil se lirait à l'envers à partir de la première couture, sans
 * erreur, sans témoin rouge, sans rien qui ait l'air cassé. **L'ordre des
 * PAGES se renverse avant de concaténer**, jamais l'ordre interne.
 *
 * DÉDOUBLONNE par id, la PREMIÈRE occurrence rencontrée gagne (donc la plus
 * ANCIENNE page, celle qui porte le message depuis le plus longtemps) : un
 * message qui chevauche deux pages — la couture est un `lt` STRICT côté
 * serveur, mais une édition ou un message inséré entre deux requêtes peut
 * décaler la fenêtre — ne rend qu'UNE bulle.
 *
 * DÉCODE chaque rangée par la MÊME fonction que le reste du port
 * (`decodeMessage`) : le cache tient des dates en CHAÎNES (D-26, « cache =
 * forme du fil »), et ce `select` est le SEUL site qui les revit en `Date`,
 * que la donnée vienne du réseau, du cache restauré ou du temps réel.
 *
 * FONCTION DE MODULE — jamais une lambda écrite en ligne dans la fabrique :
 * `useBaseQuery` rappelle `observer.getOptimisticResult(options)` à CHAQUE
 * rendu, et `QueryObserver#createResult` ne réutilise le résultat mémorisé
 * que si `options.select === this.#selectFn`. Une lambda neuve à chaque rendu
 * re-décode toute la fenêtre, et le partage structurel ne rattrape rien —
 * `replaceEqualDeep` compare les `Date` par IDENTITÉ, et décoder une chaîne
 * ISO en fabrique une nouvelle à chaque passage. `threadData.messages`
 * changerait alors d'identité à chaque rendu, ce qui défait `useMemo`,
 * `place()` et toute la mémoïsation du fil virtualisé — à 60 images par
 * seconde de défilement.
 */
export function flattenMessagePages(data: MessagesInfiniteData): readonly Message[] {
  const seen = new Set<string>();
  const result: Message[] = [];
  for (let i = data.pages.length - 1; i >= 0; i -= 1) {
    const page = data.pages[i];
    if (page === undefined) continue;
    for (const message of page.messages) {
      if (seen.has(message.id)) continue;
      seen.add(message.id);
      result.push(decodeMessage(message));
    }
  }
  return result;
}

/**
 * LA FENÊTRE DU FIL — ce que `messagesQuery().select` sert à l'écran.
 *
 * **`hasOlder` ET « peut-on encore charger » SONT DEUX QUESTIONS.** La
 * première est celle du Résumé Vivant (« Sur les N derniers messages ») : *le
 * serveur déclare-t-il qu'il existe du plus ancien ?* — elle se lit sur la
 * page la plus ANCIENNE chargée, la seule qui décrive le bord de la fenêtre.
 * La seconde est celle de la sentinelle (`hasNextPage`, dérivé de
 * `nextMessagesCursor`) : *peut-on en demander davantage sans boucler ?*
 *
 * Elles divergent, et c'est voulu : une page RESSERVIE par la passerelle
 * (`before` inconnu) désarme la descente sans rendre l'historique inexistant.
 * Répondre à la première par la seconde faisait taire « Sur les N derniers
 * messages » dès qu'un refus anti-boucle tombait — le Résumé affirmait alors
 * couvrir tout le non-lu sans rien en savoir.
 */
export type ThreadWindow = {
  readonly messages: readonly Message[];
  readonly hasOlder: boolean;
};

/**
 * `threadWindowOf` — LE `select` du fil, fonction de MODULE (voir
 * `flattenMessagePages` pour la mesure). `hasOlder` vient de la page la plus
 * ANCIENNE (`pages[pages.length - 1]`) : les pages arrivent de la récente vers
 * l'ancienne, donc c'est la DERNIÈRE reçue qui borde l'historique.
 */
export function threadWindowOf(data: MessagesInfiniteData): ThreadWindow {
  return {
    messages: flattenMessagePages(data),
    hasOlder: data.pages[data.pages.length - 1]?.hasOlder ?? false,
  };
}

/**
 * `nextMessagesCursor` — `getNextPageParam` du fil : les CINQ refus de
 * `nextConversationsCursor` (`conversations-pages.ts`), qui s'appliquent TELS
 * QUELS ici — `hasOlder` faux, `nextCursor` absent, curseur STAGNANT
 * (identique au paramètre qui vient de servir cette page), page VIDE, et —
 * celui qui compte le plus — AUCUN message neuf dans la page qui vient
 * d'arriver.
 *
 * Le cinquième n'est pas une précaution : **la passerelle ne valide pas
 * `before`.** `prisma.message.findFirst({ where: { id: before, conversationId } })`
 * ne trouvant rien, AUCUN filtre `lt` n'est posé et la page RÉCENTE revient
 * telle quelle (`messages-list.ts:386-397`), avec `hasMore: true` et le même
 * `nextCursor` — un fil qui se rechargerait à l'infini sur son propre début.
 * Le refus 3 n'y suffit pas : le curseur resservi est celui de la page
 * resservie, pas celui qu'on a envoyé.
 */
export function nextMessagesCursor(
  lastPage: MessagesPage,
  allPages: readonly MessagesPage[],
  lastPageParam: MessagesPageParam,
): MessagesPageParam {
  if (lastPage.hasOlder !== true) return undefined;
  const { nextCursor } = lastPage;
  if (nextCursor === null) return undefined;
  if (nextCursor === lastPageParam) return undefined;
  if (lastPage.messages.length === 0) return undefined;

  const priorIds = new Set<string>();
  for (const page of allPages) {
    if (page === lastPage) continue;
    for (const message of page.messages) priorIds.add(message.id);
  }
  const hasNewMessage = lastPage.messages.some((m) => !priorIds.has(m.id));
  return hasNewMessage ? nextCursor : undefined;
}

/** `createdAt` arrive en DEUX formes selon la provenance — `Date` décodée
 * (fixtures) ou chaîne ISO (cache brut, D-26) : `new Date()` accepte les
 * deux, et une date ILLISIBLE vaut 0, donc se classe en DERNIER d'un tri
 * décroissant plutôt qu'en tête. Motif `timeOf` (`fixtures-pagination.ts`). */
const timeOf = (value: Message['createdAt']): number => {
  const ms = new Date(value as unknown as string).getTime();
  return Number.isNaN(ms) ? 0 : ms;
};

/**
 * `pageOfMessages` — LA LOI DE FENÊTRAGE, pour la source `fixtures`, qui MIME
 * `messages-list.ts` sur le corpus REÇU (jamais lu : même discipline que
 * `pageOfConversations`, `fixtures-pagination.ts`) :
 *
 *  - tri `createdAt DESC` (`vue.orderBy`, `messages-list-views.ts:101-107`),
 *    fenêtre `createdAt < cursor.createdAt` (`:386-397`) ;
 *  - un `before` INCONNU laisse la fenêtre INTACTE, donc RESERT la page
 *    récente — le comportement RÉEL de la passerelle, et la raison d'être du
 *    cinquième refus de `nextMessagesCursor` ;
 *  - `hasOlder = page.length === limit` (`:747`) ;
 *  - `nextCursor` = l'id du message le plus ANCIEN de la page (`:756` — le
 *    DERNIER en ordre DESC), rendu seulement quand `hasOlder` ;
 *  - la page rendue est RENVERSÉE en ASCENDANT, comme le fait `loadMessages`
 *    sur la charge de la passerelle : les deux sources rendent la MÊME forme.
 */
export function pageOfMessages(
  corpus: readonly Message[],
  params: { readonly before?: string; readonly limit: number },
): MessagesPage {
  const { before, limit } = params;
  const descending = [...corpus].sort((a, b) => timeOf(b.createdAt) - timeOf(a.createdAt));
  const cursorRow = before === undefined ? undefined : descending.find((m) => m.id === before);
  const windowed =
    cursorRow === undefined ? descending : descending.filter((m) => timeOf(m.createdAt) < timeOf(cursorRow.createdAt));

  const slice = windowed.slice(0, limit);
  const hasOlder = slice.length === limit;
  const oldest = slice[slice.length - 1];

  return {
    messages: [...slice].reverse(),
    hasOlder,
    nextCursor: hasOlder && oldest !== undefined ? oldest.id : null,
  };
}
