package me.meeshy.sdk.report

/** Le contenu SOCIAL qu'un signalement abouti vise (un message ou une conversation n'en font pas partie). */
public enum class ReportedSocialKind { PROFILE, POST, STORY, COMMENT }

/**
 * Émet le signal négatif `report_submit` d'un signalement ABOUTI (port de `emitReported`, iOS,
 * #10503). Il ne porte que le CODE du motif ([reasonCode], le jeton minuscule de la passerelle),
 * jamais le texte libre de l'utilisateur.
 *
 * Inerte ([NoOpReportSignalEmitter]) tant que le hub d'événements sociaux V2 n'existe pas sur
 * Android : la couture est posée, le branchement viendra avec ce hub sans toucher au dépôt.
 */
public interface ReportSignalEmitter {
    public fun emitReported(kind: ReportedSocialKind, targetId: String, reasonCode: String)
}

/** L'émetteur par défaut : ne fait rien. */
public object NoOpReportSignalEmitter : ReportSignalEmitter {
    override fun emitReported(kind: ReportedSocialKind, targetId: String, reasonCode: String) = Unit
}
