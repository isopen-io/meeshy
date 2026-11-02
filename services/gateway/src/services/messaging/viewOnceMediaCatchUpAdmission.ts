/**
 * Qui a le droit de faire ÉCRIRE le rattrapage des médias à vue unique
 * (#11269, audit F3) ?
 *
 * Ce qu'il réarme est effacé par le balayage dans les minutes qui suivent, et
 * ne revient pas. En staging, Claude est autonome (#9226) : `APPLY=1` suffit.
 * Partout ailleurs — production, ou environnement NON DÉCLARÉ, qui vaut
 * production —, l'écriture exige en plus `BACKUP_VERIFIED=<identifiant>` : la
 * sauvegarde vérifiée de la base et du stockage des médias que la directive
 * #9223 impose avant toute purge de production. L'identifiant est rendu pour
 * être journalisé avec le rapport.
 *
 * L'environnement se lit dans `OPS_ENVIRONMENT`, que les deux compose de
 * l'hôte posent sur la passerelle.
 */
export type ViewOnceCatchUpWriteAdmission =
  | { readonly kind: 'dry-run' }
  | { readonly kind: 'apply'; readonly environment: string; readonly backupVerified: string | null }
  | { readonly kind: 'refused'; readonly environment: string; readonly reason: string };

export function viewOnceCatchUpWriteAdmission(
  env: Readonly<Record<string, string | undefined>>,
): ViewOnceCatchUpWriteAdmission {
  if (env.APPLY !== '1') return { kind: 'dry-run' };
  const environment = env.OPS_ENVIRONMENT?.trim() || 'non déclaré';
  if (environment === 'staging') return { kind: 'apply', environment, backupVerified: null };
  const backupVerified = env.BACKUP_VERIFIED?.trim() ?? '';
  if (backupVerified === '') {
    return {
      kind: 'refused',
      environment,
      reason: 'hors staging, APPLY=1 exige BACKUP_VERIFIED=<identifiant de la sauvegarde vérifiée> (#9223)',
    };
  }
  return { kind: 'apply', environment, backupVerified };
}
