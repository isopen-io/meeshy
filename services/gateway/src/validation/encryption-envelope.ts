import { z } from 'zod';
import type { MessageRequest } from '@meeshy/shared/types/messaging';

/**
 * L'enveloppe de chiffrement d'un envoi de message, déclarée UNE fois pour les
 * DEUX transports.
 *
 * ## Ce que cette unité répare
 *
 * Le client chiffre avant d'émettre et pose sur le fil deux champs PLATS —
 * `encryptedContent` (le chiffré) et `encryptionMetadata` — plus, éventuellement,
 * le mode et un écho du fait (`isEncrypted`). La route REST `POST /messages` les
 * déclarait, les validait (plafond 8 Ko), refusait la rétrogradation et les
 * recomposait en `encryptedPayload` pour le service.
 *
 * Le transport SOCKET — pourtant le chemin PRIMAIRE d'envoi, celui que le web
 * emprunte d'abord et dont il ne se replie PAS vers REST quand la conversation
 * est chiffrée — n'en déclarait aucun. `SocketMessageSendSchema` est un
 * `z.object` : il STRIPPE en silence tout champ non déclaré. Le handler lisait
 * de son côté `data.encryptedPayload`, un nom qu'aucun client n'émet et
 * qu'aucun schéma ne produit — donc toujours `undefined`.
 *
 * Le chiffré n'atteignait jamais la base, et le message était persisté avec le
 * `content` que le client avait laissé :
 *
 * - en mode `e2ee`, le client remplace `content` par le littéral `[Encrypted]`
 *   AVANT d'émettre. Résultat : le message est perdu, et chaque destinataire lit
 *   la chaîne `[Encrypted]` ;
 * - en mode `server` / `hybrid`, `content` reste le texte CLAIR. Résultat : le
 *   message est persisté EN CLAIR dans une conversation que l'utilisateur croit
 *   chiffrée — exactement la rétrogradation que le `.refine()` de la route REST
 *   avait été écrit pour interdire, sur la surface qui porte le trafic.
 *
 * ## Pourquoi une unité, et pas une copie de plus
 *
 * Le défaut n'était pas qu'un champ manquait : c'est que la MÊME enveloppe était
 * décrite à deux endroits et qu'un seul des deux la connaissait. Un correctif
 * qui recopierait les quatre champs dans le schéma socket rétablirait le chiffré
 * ET rouvrirait la même porte pour la prochaine évolution (un mode ajouté d'un
 * côté, un plafond relevé de l'autre).
 *
 * Les deux transports lisent donc désormais la même déclaration, et la même
 * recomposition : `MessagingService.handleMessage` reçoit `encryptedPayload`
 * de la même main, quel que soit le chemin d'entrée.
 */
export const ENCRYPTION_ENVELOPE_SHAPE = {
  encryptedContent: z.string().optional(),
  /**
   * Le mode arrive avec la casse du client : iOS émet « E2EE ». Normalisé à la
   * frontière d'écriture, comme le code de langue l'est déjà
   * (`normalizeLanguageForDedup`). Le jeu de valeurs reste FERMÉ : la
   * normalisation corrige la casse, elle n'ouvre aucune valeur nouvelle.
   */
  encryptionMode: z
    .string()
    .transform((v) => v.toLowerCase())
    .pipe(z.enum(['e2ee', 'server', 'hybrid']))
    .optional(),
  /**
   * Le SEUL champ de l'envoi qui soit écrit tel quel dans MongoDB. Sans ce
   * plafond, il est aussi le seul sans borne de taille — `content` a la sienne
   * depuis toujours.
   */
  encryptionMetadata: z
    .record(z.string(), z.unknown())
    .refine(
      (m) => {
        try {
          return JSON.stringify(m).length <= 8 * 1024;
        } catch {
          return false;
        }
      },
      { message: 'encryptionMetadata exceeds 8KB serialized' }
    )
    .optional(),
  isEncrypted: z.boolean().optional(),
} as const;

/**
 * La garde de non-rétrogradation, dans la forme que `.superRefine`/`.refine`
 * attend. Un message qui se DÉCLARE chiffré sans apporter son chiffré serait
 * écrit en clair : le serveur refuse plutôt que de rétrograder en silence.
 *
 * Déclarée à côté de la forme parce qu'elle en fait partie — un schéma qui
 * prendrait `ENCRYPTION_ENVELOPE_SHAPE` sans elle accepterait précisément
 * l'entrée que la forme existe pour refuser.
 */
export const noSilentDowngrade = (data: {
  isEncrypted?: boolean;
  encryptedContent?: string;
}): boolean => !data.isEncrypted || Boolean(data.encryptedContent);

export const NO_SILENT_DOWNGRADE_ISSUE: { message: string; path: PropertyKey[] } = {
  message:
    "encryptedContent est requis quand isEncrypted vaut true — le serveur ne rétrograde jamais en clair un message déclaré chiffré",
  path: ['encryptedContent'],
};

/**
 * Recompose l'enveloppe du FIL en la charge que `MessagingService` consomme.
 *
 * Le fait du chiffrement, c'est la présence du chiffré — pas un booléen posé à
 * côté. Gater sur `isEncrypted` perdrait dans les DEUX sens : un chiffré sans le
 * drapeau serait jeté, et le drapeau sans le chiffré ferait écrire le message en
 * clair. Le `refine` ci-dessus ferme le second cas ; cette fonction sert le
 * premier.
 *
 * Rend `undefined` — et non un objet vide — quand il n'y a pas de chiffré :
 * `MessagingService` ne teste que la PRÉSENCE de `encryptedPayload` pour décider
 * d'écrire `encryptedContent` et `encryptionMetadata`, si bien qu'une enveloppe
 * vide mais présente marquerait chiffré un message qui ne l'est pas.
 */
export function toEncryptedPayload(envelope: {
  encryptedContent?: string;
  encryptionMode?: 'e2ee' | 'server' | 'hybrid';
  encryptionMetadata?: Record<string, unknown>;
}): MessageRequest['encryptedPayload'] | undefined {
  if (!envelope.encryptedContent) return undefined;

  return {
    ciphertext: envelope.encryptedContent,
    mode: envelope.encryptionMode ?? 'e2ee',
    ...envelope.encryptionMetadata,
  } as unknown as MessageRequest['encryptedPayload'];
}
