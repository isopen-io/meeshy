/**
 * Les NOMS des styles de carte, seuls — ce que la feuille d'export lit pour
 * proposer le choix. Les styles eux-mêmes (`message-card-styles.ts`) tirent la
 * table des polices de story : ils voyagent avec le peintre, chargé à la
 * demande, jamais avec le fil.
 */
export const MESSAGE_CARD_STYLE_IDS = ['aurore', 'editorial', 'manuscrit'] as const;

export type MessageCardStyleId = (typeof MESSAGE_CARD_STYLE_IDS)[number];
