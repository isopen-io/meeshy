import { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService, type AdminPermissions } from '../../services/admin/permissions.service';

/**
 * LA loi d'écriture d'un compte administré — une carte CHAMP → permission (#4154).
 *
 * ## Le défaut qu'elle ferme
 *
 * Trois routes écrivaient trois familles de champs sous trois lois de ROUTE :
 * `PATCH /:id` (profil, `canUpdateUsers`), `PATCH /:id/role` (`canChangeRole`),
 * `PATCH /:id/status` (`canModifyUser`). Un champ ajouté à l'une héritait de la
 * loi de sa route, jamais de la sienne — et `UserManagementService.updateUser`
 * écrit `data: { ...body }`, un ÉPANDAGE : le jour où `role` entre dans le
 * schéma de profil, il part en base sous la loi du profil, sans qu'aucune
 * ligne de garde n'ait changé.
 *
 * > **Une permission ne garde pas une ROUTE, elle garde un CHAMP.**
 *
 * ## Fail-closed sur l'inconnu
 *
 * Un champ absent de cette carte est REFUSÉ, jamais écrit sous une loi par
 * défaut. C'est l'absence d'exception qui ferme la classe : sans elle, la carte
 * ne serait qu'une liste de cas connus, et le champ ajouté demain retomberait
 * exactement là où le défaut vivait.
 *
 * ## Ce que la carte ne dit pas
 *
 * Elle dit qui a le DROIT d'écrire ce champ. Elle ne dit pas s'il a le RANG
 * pour agir sur CETTE cible — c'est `requireHierarchy` / `canManageUser`, une
 * seconde question posée par l'appelant sur toute écriture visant un compte.
 */

/** Les six familles d'écriture d'un compte, chacune avec sa loi propre. */
export type FamilleDeChamp =
  | 'profil'
  | 'role'
  | 'statut'
  | 'securite'
  | 'verification'
  | 'consentement';

export type LoiDeChamp = {
  readonly famille: FamilleDeChamp;
  /** La permission de la matrice unique que l'acteur doit porter. */
  readonly permission: keyof AdminPermissions;
  /** BIGBOSS et lui seul — aucune permission ne délègue ce geste. */
  readonly souverain: boolean;
  /** Un motif écrit est exigé ; sans lui l'écriture est refusée. */
  readonly motifObligatoire: boolean;
};

function profil(): LoiDeChamp {
  return { famille: 'profil', permission: 'canUpdateUsers', souverain: false, motifObligatoire: false };
}

function verification(): LoiDeChamp {
  return { famille: 'verification', permission: 'canUpdateUsers', souverain: false, motifObligatoire: false };
}

function securite(): LoiDeChamp {
  return { famille: 'securite', permission: 'canUpdateUsers', souverain: false, motifObligatoire: false };
}

/**
 * Poser au nom d'autrui la preuve qu'il a consenti à l'usage de sa VOIX est le
 * geste le plus lourd de la surface d'administration : il fabrique une pièce
 * légale. Il coûte donc le rang le plus haut ET un motif écrit — les deux, car
 * le rang dit qui peut le faire et le motif dit pourquoi il l'a fait.
 */
function consentement(): LoiDeChamp {
  return { famille: 'consentement', permission: 'canUpdateUsers', souverain: true, motifObligatoire: true };
}

export const LOI_PAR_CHAMP: Readonly<Record<string, LoiDeChamp>> = Object.freeze({
  // — profil —
  username: profil(),
  firstName: profil(),
  lastName: profil(),
  displayName: profil(),
  bio: profil(),
  avatar: profil(),
  banner: profil(),
  email: profil(),
  phoneNumber: profil(),
  phoneCountryCode: profil(),
  timezone: profil(),
  systemLanguage: profil(),
  regionalLanguage: profil(),
  customDestinationLanguage: profil(),
  birthDate: profil(),

  // — rôle — `canUpdateUserRoles` était DÉCLARÉE et lue par aucune route : la
  // matrice annonçait une finesse que le code n'appliquait pas. Elle vaut
  // aujourd'hui `canUpdateUsers` pour les six rôles (mesuré) ; la câbler ne
  // change donc aucune admission, et rend la matrice vraie.
  role: { famille: 'role', permission: 'canUpdateUserRoles', souverain: false, motifObligatoire: false },

  // — statut — l'écriture emporte la coupure des sockets de la cible.
  isActive: { famille: 'statut', permission: 'canUpdateUsers', souverain: false, motifObligatoire: false },

  // — sécurité —
  unlock: securite(),
  twoFactorEnabled: securite(),

  // — vérifications —
  emailVerified: verification(),
  phoneVerified: verification(),
  ageVerified: verification(),

  // — consentements (S6) —
  voiceProfile: consentement(),
  voiceData: consentement(),
  dataProcessing: consentement(),
  voiceCloning: consentement(),
});

export type ChampAdministre = keyof typeof LOI_PAR_CHAMP;

export function loiDuChamp(champ: string): LoiDeChamp | null {
  return Object.prototype.hasOwnProperty.call(LOI_PAR_CHAMP, champ)
    ? LOI_PAR_CHAMP[champ]
    : null;
}

/** Tous les champs d'une famille — sert aux routes à borner ce qu'elles acceptent. */
export function champsDeLaFamille(famille: FamilleDeChamp): string[] {
  return Object.keys(LOI_PAR_CHAMP).filter((c) => LOI_PAR_CHAMP[c].famille === famille);
}

export type RefusDeChamp = {
  readonly champ: string;
  readonly cause: 'inconnu' | 'permission' | 'souverain' | 'motif';
  readonly message: string;
};

/**
 * Applique la loi de CHAQUE champ écrit, et rend le premier refus.
 *
 * Le refus NOMME le champ et la cause : un « Access denied » nu — le texte des
 * treize gardes d'avant #4153 — oblige à lire le code pour savoir ce qui a
 * manqué, et rend indistinguables « tu n'as pas le droit » et « il manque un
 * motif ».
 */
export function evaluerLoiDesChamps(options: {
  role: UserRoleEnum;
  champs: readonly string[];
  motif?: string;
}): RefusDeChamp | null {
  const motifEcrit = (options.motif ?? '').trim().length > 0;

  for (const champ of options.champs) {
    const loi = loiDuChamp(champ);

    if (!loi) {
      return {
        champ,
        cause: 'inconnu',
        message: `Champ non administrable : ${champ} ne porte aucune loi`,
      };
    }

    if (loi.souverain && String(options.role) !== String(UserRoleEnum.BIGBOSS)) {
      return {
        champ,
        cause: 'souverain',
        message: `Rang souverain requis pour écrire ${champ}`,
      };
    }

    if (!permissionsService.hasPermission(options.role, loi.permission)) {
      return {
        champ,
        cause: 'permission',
        message: `Permission insuffisante : ${loi.permission} requise pour écrire ${champ}`,
      };
    }

    if (loi.motifObligatoire && !motifEcrit) {
      return {
        champ,
        cause: 'motif',
        message: `Un motif écrit est obligatoire pour écrire ${champ}`,
      };
    }
  }

  return null;
}
