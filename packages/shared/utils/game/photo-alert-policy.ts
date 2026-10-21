/**
 * LA POLITIQUE DES ALERTES D'IMMORTALISATION (#10173, § 5.16.1) — le rythme du jeu reste à décider (#9964) :
 * il se règle ICI, en un seul endroit, lu par `photoStepsReached` (ce qui se photographie) et par
 * `photoAlertFor` (ce qui s'annonce). Les défauts sont PRUDENTS et ne changent rien au carnet.
 *
 * Elle vit à part de `photo-alerts.ts` pour que la loi du carnet la lise sans dépendre de la loi d'alerte.
 * Miroir Swift : `PhotoAlertPolicy` (`packages/MeeshySDK/Sources/MeeshySDK/Game/GamePhotoAlerts.swift`).
 */

export type PhotoAlertPolicy = {
  /** Ce qui se photographie : chaque étape de la loi actuelle, ou le rang au PASSAGE seulement (division V et Mythe). */
  readonly photographs: 'every-step' | 'rank-passage';
  /** Le réglage « Me proposer d'immortaliser » (`GameProfile.photoInvitations`) : chaque étape, les grands moments, jamais. */
  readonly invitations: 'every-step' | 'big-moments' | 'never';
  /** D20 : l'arriéré d'avant la ligne de base verrouille les étapes nouvelles (a, `locks`) ou se range à part (b, `apart`). */
  readonly backlog: 'locks' | 'apart';
  readonly inApp: {
    readonly perDay: number;
    readonly minGapMinutes: number;
    /** Aucune invitation PASSIVE pendant les premières minutes d'une session. */
    readonly sessionGraceMinutes: number;
  };
  readonly push: {
    readonly perDay: number;
    /** Le délai entre la détection et l'envoi. */
    readonly delayMinutes: number;
    /** La fenêtre de nuit (heures locales), quand le « Ne pas déranger » de l'utilisateur est coupé. */
    readonly nightFromHour: number;
    readonly nightToHour: number;
  };
};

export const PHOTO_ALERT_POLICY: PhotoAlertPolicy = {
  photographs: 'every-step',
  invitations: 'every-step',
  backlog: 'locks',
  inApp: { perDay: 1, minGapMinutes: 240, sessionGraceMinutes: 10 },
  push: { perDay: 1, delayMinutes: 60, nightFromHour: 21, nightToHour: 9 },
};
