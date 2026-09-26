/**
 * Les QUATRE niveaux de mot de passe qu'un administrateur peut proposer à un
 * membre depuis sa fiche (#8051), du plus lisible au plus sûr. Les trois
 * premiers se composent à partir du pseudo ou du nom affiché du membre ; le
 * dernier est un tirage aléatoire long. La composition vit dans la passerelle
 * (`services/gateway/src/utils/password-proposal.ts`), seul site qui porte
 * aussi la politique de robustesse : ce qui est servi ici a déjà été accepté
 * par `validatePasswordStrength`, donc ne peut pas être refusé à l'application.
 */
export const PASSWORD_PROPOSAL_LEVELS = ['simple', 'easy', 'medium', 'hard'] as const;

export type PasswordProposalLevel = (typeof PASSWORD_PROPOSAL_LEVELS)[number];

/** La réponse de `POST /admin/users/:userId/password-proposals` — un secret par niveau. */
export type PasswordProposals = Readonly<Record<PasswordProposalLevel, string>>;
