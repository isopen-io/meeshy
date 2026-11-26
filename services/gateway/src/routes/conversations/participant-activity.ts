type ActivityFields = {
  readonly isOnline?: boolean | null;
  readonly lastActiveAt?: Date | null;
};

type ParticipantActivityRow = ActivityFields & {
  readonly userId: string | null;
  readonly user?: ActivityFields | null;
};

export type ParticipantActivity = {
  readonly isOnline: boolean | null;
  readonly lastActiveAt: Date | null;
};

/**
 * #9071 — la paire de présence d'un participant vient d'UNE source : le COMPTE
 * pour un inscrit (la ligne `Participant` ne date que son entrée dans la
 * conversation), la ligne elle-même pour une session sans compte, dont elle
 * porte l'activité. Rien n'est inventé : un compte non chargé sert null.
 */
export function participantActivity(row: ParticipantActivityRow): ParticipantActivity {
  const source = row.userId ? row.user : row;
  return {
    isOnline: source?.isOnline ?? null,
    lastActiveAt: source?.lastActiveAt ?? null,
  };
}
