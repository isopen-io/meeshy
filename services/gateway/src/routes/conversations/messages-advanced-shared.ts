/**
 * Schémas et helpers COMMUNS à la surface d'édition/suppression de message.
 *
 * Fichier extrait de `messages-advanced.ts` (issue #4284, découpage par
 * responsabilité — aucun changement de comportement). Porte les enveloppes de
 * réponse servies par `PUT /conversations/:id/messages/:messageId` et
 * `PATCH /messages/:messageId` (voir `messages-advanced-edit.ts`) ainsi que le
 * fragment `meta.conversationStats` que `DELETE .../messages/:messageId`
 * (`messages-advanced-delete.ts`) sert aussi. Point d'entrée : `messages-advanced.ts`.
 */
import { conversationStatsSchema, messageSchema } from '@meeshy/shared/types/api-schemas';

/**
 * `meta.conversationStats`, que `messageResponseSchema` ne porte pas.
 *
 * Le cycle 88 bis a réparé les deux transports d'ÉDITION en les pointant sur
 * `messageResponseSchema` (`{ success, data: messageSchema }`) — la bonne
 * forme, et la charge utile arrive enfin. Mais le transport `PUT` sert un champ
 * de plus que le PATCH : `meta: { conversationStats }`, calculé juste avant la
 * réponse. `messageSchema` ne le déclarant pas, il restait supprimé.
 *
 * Et le transport DELETE, lui, n'avait pas été repris du tout : son schéma est
 * BIEN FORMÉ (`message: { type: 'string' }`) et décrit simplement une autre
 * charge utile que `{messageId, deleted, meta}`. Le balayage des objets nus ne
 * pouvait pas le voir — c'est ce qui a motivé le second balayage
 * (`__tests__/response-payload-mismatch.ts`).
 *
 * Gardé par
 * `__tests__/unit/routes/conversations/message-mutation-serialization.test.ts`.
 */
export const conversationStatsMetaSchema = {
  type: 'object',
  properties: { conversationStats: conversationStatsSchema },
} as const;

/**
 * L'expéditeur tel que les DEUX routes d'édition le CHARGENT — un `Participant`,
 * pas un `User`.
 *
 * Trois défauts se sont empilés sur ce champ, et l'ordre compte. Le cycle 88 bis
 * a corrigé l'enveloppe fantôme (`data.message` sur une charge qui n'a jamais
 * porté cette clé) ; le cycle 91 bis a composé l'enveloppe proprement et ajouté
 * `meta` au seul transport qui le calcule. Tant que `data` sortait `{}`, rien de
 * ceci n'était observable — **réparer une enveloppe rend lisibles les défauts de
 * ce qu'elle contenait.**
 *
 * Reste celui-ci. `messageSchema.sender` est `userMinimalSchema`, qui couvre bien
 * le cas participant — il déclare `userId` et `type` pour lui — mais qui est
 * délibérément MINIMAL, quand ces deux routes chargent trois champs de plus.
 * Mesuré au compilateur sur la charge utile réelle :
 *
 * ```
 * in  : { id, userId, displayName, avatar, type, role, language, user: {…} }
 * out : { id, userId, displayName, avatar, type }     ← role, language, user PERDUS
 * ```
 *
 * Élargir `userMinimalSchema` pousserait ces trois champs sur les dizaines de
 * réponses qui l'emploient, dont beaucoup décrivent un vrai `User`. **Le grain
 * juste est celui qui CHARGE** : ce sont ces deux routes qui chargent plus, ce
 * sont elles qui déclarent plus.
 *
 * **`isOnline` est délibérément ABSENT, et c'est la décision du lot.**
 * `userMinimalSchema` le déclare, et la réparation de l'enveloppe a rendu cette
 * déclaration VIVANTE : vérifié au compilateur, un `isOnline` posé sur l'objet
 * serait désormais SERVI. Rien ne fuit aujourd'hui — aucun des deux `select` ne
 * le charge — mais le prochain qui l'ajoute le mettrait sur le fil sans gate et
 * sans qu'un témoin tombe. L'omettre est fail-closed : si le champ apparaît, le
 * sérialiseur le retire. Cela vaut mieux qu'un gate sur une donnée que personne
 * ne charge, lequel est du code mort qui se périme.
 */
const editedMessageSenderSchema = {
  type: 'object',
  nullable: true,
  properties: {
    id: { type: 'string', description: 'Participant ID' },
    userId: { type: 'string', nullable: true, description: 'Real User ID (null for anonymous participants)' },
    displayName: { type: 'string', nullable: true },
    avatar: { type: 'string', nullable: true },
    type: { type: 'string', enum: ['user', 'anonymous', 'bot'] },
    role: { type: 'string', nullable: true },
    language: { type: 'string', nullable: true },
    user: {
      type: 'object',
      nullable: true,
      properties: {
        id: { type: 'string' },
        username: { type: 'string' },
        displayName: { type: 'string', nullable: true },
        firstName: { type: 'string', nullable: true },
        lastName: { type: 'string', nullable: true },
        avatar: { type: 'string', nullable: true },
        role: { type: 'string', nullable: true }
      }
    }
  }
} as const;

/**
 * Le message édité, servi À PLAT — la forme commune aux deux transports.
 *
 * Composé depuis `messageSchema` et **non** en descendant dans
 * `messageResponseSchema.properties.data` : plusieurs suites mockent
 * `@meeshy/shared/types/api-schemas` avec un sous-ensemble des exports, et une
 * chaîne d'accès y lève à l'IMPORT, quand un `...spread` d'`undefined` est légal
 * et inerte. La contrainte vient du cycle 91 bis et elle est juste — une
 * première version de ce lot descendait dans `.properties.data.properties` et a
 * fait cesser de CHARGER une suite de 154 témoins.
 */
const editedMessageDataSchema = {
  ...messageSchema,
  description: 'The message as it stands after the edit — served flat, not wrapped',
  properties: {
    ...messageSchema.properties,
    sender: editedMessageSenderSchema,
  },
} as const;

/**
 * L'enveloppe du transport `PUT` : le message à plat, plus les stats que lui
 * seul calcule.
 */
export const editedMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      ...editedMessageDataSchema,
      properties: {
        ...editedMessageDataSchema.properties,
        meta: conversationStatsMetaSchema,
      },
    },
  },
} as const;

/**
 * L'enveloppe du transport `PATCH` : la même, SANS `meta` — ce transport ne
 * calcule pas de statistiques.
 */
export const patchedMessageResponseSchema = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: editedMessageDataSchema,
  },
} as const;
