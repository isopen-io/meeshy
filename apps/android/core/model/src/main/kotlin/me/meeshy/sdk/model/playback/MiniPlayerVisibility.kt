package me.meeshy.sdk.model.playback

import kotlin.math.roundToInt

/** Le vocal que le mini-lecteur décrit : sa conversation (où l'on revient), son message (où l'on atterrit), sa piste. */
public data class MiniPlayerSubject(
    val conversationId: String,
    val messageId: String,
    val attachmentId: String,
)

/**
 * La mémoire de la visibilité du mini-lecteur entre deux pas.
 *
 * - [shown] : ce que la barre AFFICHE (pas ce que le moteur joue) ;
 * - [hadActive] : un contexte actif existait au pas précédent (la file « vient de finir » si ce n'est plus le cas) ;
 * - [graceArmed] : la fin de file est arrivée barre À L'ÉCRAN, donc la grâce de 5 s doit la garder.
 */
public data class MiniPlayerVisibilityState(
    val shown: MiniPlayerSubject? = null,
    val hadActive: Boolean = false,
    val graceArmed: Boolean = false,
)

/** Ce que la barre dit du transport : jamais la progression d'une AUTRE piste que la sienne. */
public data class MiniPlayerTransport(val isPlaying: Boolean, val progress: Float)

/**
 * **Quand le mini-lecteur est à l'écran** (iOS `MiniAudioPlayerBar.displayedContext` / `handleContextChange`) :
 *
 * 1. un vocal actif s'affiche, SAUF dans sa propre conversation (la bulle y porte déjà les mêmes commandes) ;
 * 2. quand la file vient de finir, la grâce de 5 s garde la barre SI elle était à l'écran — jamais si on était dans la
 *    conversation qui jouait, où il n'y avait rien à garder ;
 * 3. la grâce armée survit à une entrée dans la conversation (la barre se masque, puis revient en sortant) ;
 * 4. la croix ([grace] nul alors qu'aucun vocal n'est actif) ferme sur le champ, grâce comprise ;
 * 5. un écran qui COUVRE le chrome ([isCovered] : l'appel, qu'iOS présente en plein écran par-dessus la racine) la
 *    masque comme sa propre conversation, sans désarmer la grâce : elle revient en sortant.
 *
 * Fonction pure : le présentateur lui remet les trois flux du coordinateur et la conversation ouverte.
 */
public object MiniPlayerVisibility {

    public fun next(
        state: MiniPlayerVisibilityState,
        active: MiniPlayerSubject?,
        grace: MiniPlayerSubject?,
        currentConversationId: String?,
        isCovered: Boolean = false,
    ): MiniPlayerVisibilityState {
        val graceArmed = when {
            active != null -> false
            state.hadActive -> state.shown != null && grace != null
            else -> state.graceArmed && grace != null
        }
        val candidate = when {
            active != null -> active
            graceArmed -> grace
            else -> null
        }
        val shown = candidate?.takeUnless { isCovered || it.conversationId == currentConversationId }
        return MiniPlayerVisibilityState(shown = shown, hadActive = active != null, graceArmed = graceArmed)
    }

    /** La barre est la DERNIÈRE (la plus basse) tant qu'aucune pastille d'appel n'est au-dessus : elle sort alors par le haut. */
    public fun isLastBar(callPillShown: Boolean): Boolean = !callPillShown

    /** Le moteur est unique : s'il joue une AUTRE piste (audio d'un post), la barre reste au repos au lieu de la mimer. */
    public fun transport(subjectAttachmentId: String?, playback: AudioPlaybackState): MiniPlayerTransport =
        if (subjectAttachmentId == null || playback.attachmentId != subjectAttachmentId) {
            MiniPlayerTransport(isPlaying = false, progress = 0f)
        } else {
            MiniPlayerTransport(isPlaying = playback.isPlaying, progress = playback.progress.toFloat())
        }

    /** Le pourcentage annoncé par TalkBack : arrondi au plus proche, borné 0..100, 0 pour une valeur illisible. */
    public fun percent(progress: Double): Int =
        if (progress.isNaN()) 0 else (progress * 100.0).coerceIn(0.0, 100.0).roundToInt()
}
