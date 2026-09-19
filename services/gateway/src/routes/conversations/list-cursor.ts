import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * **LE CURSEUR DE `GET /conversations`, RÉSOLU DANS LE SCOPE DU LECTEUR**
 * (#6991).
 *
 * ## L'oracle que ce fichier ferme
 *
 * `core-list.ts` résolvait le curseur par `findFirst({ where: { id:
 * beforeCursor } })` — **sans aucun scope participant**. La garde qui suivait
 * était `if (cursorConversation?.lastMessageAt)` : quand elle était fausse,
 * **aucun filtre n'était posé** et la page 1 repartait **en silence**.
 *
 * Un appelant authentifié pouvait donc soumettre l'identifiant d'une
 * conversation dont il n'est pas membre et distinguer deux états :
 *
 *   - l'id existe **et** porte un `lastMessageAt` ⇒ la page est filtrée, donc
 *     son contenu change ;
 *   - l'id n'existe pas, **ou** n'a jamais eu de message ⇒ page 1 resservie.
 *
 * Deux états distinguables sur une conversation tierce : une fuite d'existence
 * et d'activité.
 *
 * ## Pourquoi c'est pire qu'un oubli — la garde ÉTAIT écrite
 *
 * `messages-list.ts` la porte depuis **#4177** (`findFirst({ where: { id:
 * before, conversationId } })`), et son commentaire dit mot pour mot : « les
 * deux curseurs de la même route doivent se comporter pareil ici ». Le
 * correctif a été appliqué à une route et jamais porté à sa jumelle.
 *
 * ## Pourquoi un type SOMME, et pas un `Date | null`
 *
 * Parce que `null` était exactement le défaut. Il confondait **trois** états
 * que l'appelant doit traiter différemment — pas de curseur, curseur
 * irrecevable, curseur qui désigne la queue du tri — et le handler les
 * traitait tous par « ne pose aucun filtre », c'est-à-dire par « ressers la
 * page 1 ». Un type qui ne sait pas dire la différence oblige le site d'appel
 * à la deviner, et il devinera mal.
 *
 * Les `null` de `lastMessageAt` sortent en queue d'un tri `desc` sous MongoDB :
 * une conversation sans message est donc une borne LÉGITIME du lecteur, et ce
 * qui la suit est vide. `queue` le dit ; `refus` dit tout autre chose.
 */
export type CurseurDeListe =
  /** Aucun curseur demandé : la page 1 est la bonne réponse. */
  | { readonly genre: 'absent' }
  /** Curseur irrecevable — inexistant OU hors du scope du lecteur. Les deux rendent la MÊME chose, sans quoi ils se distinguent. */
  | { readonly genre: 'refus' }
  /** Curseur résolu : borne stricte sur `lastMessageAt`. */
  | { readonly genre: 'borne'; readonly lastMessageAt: Date }
  /** Curseur sur une conversation du lecteur qui n'a jamais eu de message : elle est en queue du tri, rien ne la suit. */
  | { readonly genre: 'queue' };

export async function resolveListCursor({
  prisma,
  beforeCursor,
  userId
}: {
  readonly prisma: Pick<PrismaClient, 'conversation'>;
  readonly beforeCursor: string | undefined;
  readonly userId: string;
}): Promise<CurseurDeListe> {
  if (!beforeCursor) return { genre: 'absent' };

  // Le scope est la garde. `isActive: true` reprend le prédicat que cette même
  // route applique déjà à sa clause principale : un participant retiré ne doit
  // pas continuer à paginer la conversation qu'il a quittée.
  const conversation = await prisma.conversation.findFirst({
    where: { id: beforeCursor, participants: { some: { userId, isActive: true } } },
    select: { lastMessageAt: true }
  });

  if (conversation === null) return { genre: 'refus' };
  return conversation.lastMessageAt === null
    ? { genre: 'queue' }
    : { genre: 'borne', lastMessageAt: conversation.lastMessageAt };
}
