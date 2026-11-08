import { isPlatformTeam } from '@meeshy/shared/types/role-types';

/**
 * Un compte qui peut agir ou recevoir : actif, ni supprimé, ni désactivé. Le talkie
 * l'exigeait seul ; le privilège d'équipe (#16623) l'exige partout où il lit un rôle,
 * pour qu'un compte parti ne garde pas le niveau Sang de ses anciens collègues.
 */
export type AccountState = {
  readonly isActive: boolean;
  readonly deletedAt: Date | null;
  readonly deactivatedAt: Date | null;
};

export const ACCOUNT_STATE_SELECT = { isActive: true, deletedAt: true, deactivatedAt: true } as const;

export const isUsableAccount = <T extends AccountState>(account: T | null | undefined): account is T =>
  !!account && account.isActive === true && !account.deletedAt && !account.deactivatedAt;

/**
 * Le rôle que la loi d'accès lit (`viewerRole` / `targetRole`) : celui d'un compte
 * utilisable, sinon aucun — un compte parti n'ouvre rien par son rôle.
 */
export const lawRoleOf = (account: (AccountState & { readonly role: string | null }) | null | undefined): string | null =>
  isUsableAccount(account) ? account.role : null;

/**
 * Un compte UTILISABLE de l'équipe (MODERATOR, ADMIN, BIGBOSS) : celui qui, face à un autre
 * compte de l'équipe, a les outils de cercle sans lien (#16623). Ce n'est jamais un accès —
 * la loi juge chaque paire — mais ce qui dit où chercher hors des liens (#16642).
 */
export const isUsableTeamAccount = (account: (AccountState & { readonly role: string | null }) | null | undefined): boolean =>
  isPlatformTeam(lawRoleOf(account));
