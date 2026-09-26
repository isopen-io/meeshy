import { createContext } from 'react';

/**
 * CE QUE LE FIL PRÊTE À SES PIÈCES JOINTES (#6303) — une tuile touchée DANS
 * LE FIL ouvre la visionneuse conversation-entière et sait y répondre en
 * citant la pièce. Un contexte plutôt qu'une propriété : les rangées du fil
 * (`Bubble`, `FocalRow`) sont mémoïsées, et deux champs de plus à relayer à
 * travers elles seraient deux occasions de casser leur égalité. Hors du fil
 * (écran des médias, flux, admin), aucun fournisseur : `Attachments` garde sa
 * pellicule du message, et aucune action n'est offerte qu'il ne saurait tenir.
 *
 * La valeur doit être STABLE (`useMemo` chez l'hôte) : elle est lue par chaque
 * grille de médias du fil.
 */
export type ThreadMediaContextValue = {
  readonly viewerId: string;
  readonly onReplyToMedia: (messageId: string, attachmentId: string) => void;
};

export const ThreadMediaContext = createContext<ThreadMediaContextValue | null>(null);
