import type { AdminUserDetail } from '@/lib/api/admin-user-detail';

/**
 * LES CHAMPS QUE LA PASSERELLE NE SERT QU'AUX RÔLES QUI VOIENT LES DONNÉES SENSIBLES
 * (#8005) — le socle commun des fabriques de membres des témoins : un membre « ordinaire »
 * n'a ni lieu de connexion, ni codes de secours, ni bloc de métadonnées, ni compteurs.
 * Une fabrique l'étale AVANT ses surcharges (`...MEMBER_EXTRAS, ...surcharge`) : ajouter un
 * champ sensible au décodeur ne demande plus de toucher chaque fabrique.
 */
export const MEMBER_EXTRAS = {
  registrationCountry: '',
  lastLoginLocation: '',
  lastLoginDevice: '',
  registrationLocation: '',
  registrationDevice: '',
  twoFactorBackupCodesRemaining: null,
  adminMetadata: null,
  counts: null,
} as const satisfies Pick<
  AdminUserDetail,
  | 'registrationCountry'
  | 'lastLoginLocation'
  | 'lastLoginDevice'
  | 'registrationLocation'
  | 'registrationDevice'
  | 'twoFactorBackupCodesRemaining'
  | 'adminMetadata'
  | 'counts'
>;
