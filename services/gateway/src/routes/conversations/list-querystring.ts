/**
 * **LE CONTRAT DE REQUÊTE DE `GET /conversations`** — extrait de `core-list.ts`
 * pour être ÉPROUVABLE (#6857).
 *
 * Le schéma vivait en ligne dans la déclaration de route. Un témoin qui voulait
 * mesurer la validation devait donc monter tout le module — donc Prisma, les
 * middlewares d'authentification et la moitié de la passerelle — pour poser une
 * question qui ne dépend d'aucun d'eux. L'extraction ne change rien à la route :
 * elle rend la frontière INTERROGEABLE.
 *
 * ## Pourquoi `before` porte un `pattern`
 *
 * Le curseur part en `prisma.conversation.findFirst({ where: { id: cursor } })`.
 * Sous MongoDB, Prisma caste `id` en ObjectId : une chaîne non conforme LÈVE, et
 * le `catch` générique du handler rend un **500**. Mesuré sur staging :
 *
 * ```
 * before=000000000000000000000000  → 200   (ObjectId valide, inexistant)
 * before=conv-hydrate              → 500   « Error retrieving conversations »
 * ```
 *
 * `conv-hydrate` n'est pas un cas de laboratoire : c'est ce que l'app iOS
 * envoyait réellement, mesuré à l'instrument sur le simulateur.
 *
 * **La garde est DÉCLARATIVE, et c'est le fond de l'affaire.** Un `if` en tête
 * de handler aurait le même effet et serait une discipline de plus : il faut y
 * penser, et rien ne rougit quand on l'oublie. Le `pattern` est appliqué par
 * Fastify AVANT que le handler n'existe — la question ne se pose plus.
 *
 * Le `pattern` est SÛR ici : cette route ne résout jamais un `identifier`
 * (`mshy_…`), elle interroge `id` et lui seul (`core-list.ts`, clause `where`).
 * Durcir sur l'ObjectId ne retire donc aucune forme qu'un appelant légitime
 * produirait.
 */

/** Un identifiant MongoDB servi par la passerelle : 24 caractères hexadécimaux. */
export const OBJECT_ID_PATTERN = '^[0-9a-fA-F]{24}$';

export const conversationListQuerystringSchema = {
  type: 'object',
  properties: {
    limit: { type: 'string', description: 'Maximum number of conversations to return (max 50, default 15)' },
    offset: { type: 'string', description: 'Number of conversations to skip for pagination (default 0)' },
    before: {
      type: 'string',
      pattern: OBJECT_ID_PATTERN,
      description: 'Cursor for pagination: get conversations before this conversation ID (by lastMessageAt). Must be a 24-character hexadecimal identifier.'
    },
    includeCount: { type: 'string', enum: ['true', 'false'], description: 'Include total count of conversations' },
    type: { type: 'string', enum: ['direct', 'group', 'public', 'global', 'broadcast'], description: 'Filter by conversation type' },
    withUserId: { type: 'string', description: 'Filter direct conversations that include this user ID as a participant' },
    updatedSince: { type: 'string', description: 'ISO8601 timestamp — return only conversations updated after this time' }
  }
} as const;
