/**
 * **Le média INLINE d'une bannière de notification, tel qu'il voyage.**
 *
 * Ces quatre champs décrivent UN SEUL fichier — celui que l'extension de
 * notification iOS télécharge et attache en `UNNotificationAttachment` natif
 * (aperçu d'image, forme d'onde audio avec bouton de lecture). Ils voyagent
 * ENSEMBLE et se lisent ensemble : servir l'un sous les qualifiants d'un autre
 * fichier ferait mentir le `typeHint` UTI, le libellé « 🎤 · 0:12 » que le
 * corps compose depuis la durée, et le plafond mémoire que la NSE calcule
 * depuis la taille.
 *
 * ## Pourquoi ils vivent CHEZ EUX (#7003)
 *
 * `NotificationContext` frôlait le plafond de `packages/shared` (999 lignes
 * pour un budget de 1 000) : y ajouter un champ le faisait franchir. La
 * directive tranche — on extrait d'abord, on ajoute ensuite — et le découpage
 * suit la RESPONSABILITÉ plutôt qu'une tranche : ces quatre-là forment le seul
 * groupe du contexte qui décrive une PIÈCE JOINTE, et non l'endroit où la
 * notification s'est produite.
 *
 * `NotificationContext` les hérite, donc rien ne change pour ses lecteurs.
 */
export interface NotificationAttachmentWire {
  /** Phase A iOS Communication Notifications — URL accessible publiquement du
   *  1er attachment du message (image/audio/video). Téléchargé par
   *  MeeshyNotificationExtension et attaché comme UNNotificationAttachment
   *  natif avec UTI typeHint (audio waveform, image preview, video thumbnail). */
  readonly firstAttachmentUrl?: string;
  /** MIME type du 1er attachment, ex. `audio/m4a`, `image/jpeg`, `video/mp4`. */
  readonly firstAttachmentMimeType?: string;
  /**
   * Taille en OCTETS du fichier servi par `firstAttachmentUrl` (#7003).
   *
   * Une extension de notification ne dispose que d'environ 24 Mo, et quatre à
   * cinq téléchargements s'y additionnent : sans ce champ, la NSE ne pouvait
   * décider d'attacher ou non qu'APRÈS avoir ramené le corps entier en
   * mémoire — c'est-à-dire trop tard. Elle le lit désormais AVANT la requête
   * (`NSEAttachmentPolicy.mayAttach`).
   *
   * **Absente** quand la taille est inconnue, ou quand la piste servie n'est
   * PAS le fichier d'origine — une piste TTS traduite a sa propre taille, que
   * rien ne connaît ici. Ce qui QUALIFIE un fichier voyage avec LUI, jamais
   * avec un autre (cycle 128) : la NSE retombe alors sur sa mesure d'après
   * téléchargement plutôt que sur un chiffre emprunté.
   */
  readonly firstAttachmentFileSize?: number;
  /** Durée en millisecondes du 1er attachment audio/video. */
  readonly firstAttachmentDurationMs?: number;
}
