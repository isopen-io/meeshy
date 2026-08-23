import { z } from 'zod';

/**
 * La liste EXPLICITE de mentionnés d'un envoi de message, déclarée UNE fois pour
 * les deux transports — jumelle de `ENCRYPTION_ENVELOPE_SHAPE`, et née du même
 * défaut, un cran plus loin sur le même chemin.
 *
 * ## Ce que cette unité répare
 *
 * Le compositeur web RETIENT qui l'utilisateur a nommé (`useMentions` →
 * `getMentionedUserIds()`) et pose la liste sur le fil. `POST /messages` la
 * déclare et l'honore depuis toujours ; `SocketMessageSendSchema` ne la déclarait
 * pas, et `z.object` la STRIPPAIT en silence — sur le chemin d'envoi PRIMAIRE.
 *
 * Le cycle 110 a mesuré cet écart et l'a classé « consistance, pas perte », au
 * motif que `computeValidatedMentions` retombe sur l'extraction des `@username`
 * du CONTENU quand la liste explicite est vide. La mesure était juste pour trois
 * des quatre modes de conversation, et fausse pour le quatrième :
 *
 * | mode | ce qui voyage dans `content` | mentions |
 * |---|---|---|
 * | clair / `server` / `hybrid` | le texte, `@alice` compris | extraites — rien n'est perdu |
 * | **`e2ee`** | le littéral **`[Encrypted]`** | **AUCUNE** |
 *
 * En `e2ee`, le client remplace `content` par `[Encrypted]` avant d'émettre : il
 * n'y a plus d'`@` à extraire, et la liste explicite — le SEUL canal qui reste —
 * était précisément celle que le schéma retirait. Nommer quelqu'un dans une
 * conversation chiffrée ne produisait donc ni ligne `Mention` (absente de
 * l'inbox `/mentions`), ni `validatedMentions` (le surlignage du web se lit sur
 * ce champ), ni notification. Le compositeur affichait la pastille du mentionné :
 * l'expéditeur voyait un envoi réussi.
 *
 * > Un repli n'est une garantie que là où sa PRÉCONDITION tient. Ici elle tient
 * > partout sauf sur le mode où le canal principal est coupé — et c'est ce
 * > croisement, pas le repli lui-même, qui décidait de la perte.
 *
 * ## Le plafond appartient à la RÉSOLUTION, pas au transport
 *
 * `MAX_MENTIONS_PER_MESSAGE` borne l'extraction depuis le contenu depuis
 * toujours (`MentionService`, deux sites, par troncature). La liste explicite,
 * elle, n'était bornée nulle part : la déclarer sur un transport sans la borner
 * aurait ouvert sur le chemin le plus fréquenté une entrée que l'autre source de
 * la même donnée limite.
 *
 * Le plafond n'est donc PAS posé ici en `.max()` — ce qui REJETTERAIT l'envoi,
 * quand l'extraction, elle, TRONQUE — mais au point où les deux sources
 * convergent (`computeValidatedMentions`), pour que les deux subissent la même
 * règle et le même comportement.
 */
export const MENTIONED_USER_IDS_SHAPE = {
  /**
   * `z.string()` et non `mongoId` : c'est la déclaration que `POST /messages`
   * porte, et l'objet de cette unité est que les deux transports acceptent
   * exactement la même chose. Les ids ne joignent aucune requête Prisma avant
   * d'avoir été filtrés contre l'effectif de la conversation
   * (`validateMentionPermissions`), donc une chaîne malformée ne peut pas
   * atteindre le pilote — elle est simplement rejetée comme non-membre.
   */
  mentionedUserIds: z.array(z.string()).optional(),
} as const;

/**
 * Le nombre maximal de mentionnés qu'un message porte, quelle que soit la SOURCE
 * de la liste — extraction depuis le contenu ou liste explicite du compositeur.
 *
 * Déclaré ici, dans la même unité que la forme de fil, parce que les deux
 * répondent à la même question et se périmeraient séparément.
 */
export const MAX_MENTIONS_PER_MESSAGE = 50;
