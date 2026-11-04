package me.meeshy.ui.component.bubble

import kotlinx.coroutines.flow.StateFlow
import androidx.compose.runtime.Immutable
import kotlinx.coroutines.flow.Flow
import me.meeshy.sdk.model.MessageTranscriptionFiche

/**
 * Every callback a [MessageBubble] can raise, bundled in one immutable value so that adding a
 * gesture is one more field with a neutral default — never one more parameter on the bubble.
 *
 * A null callback is the neutral value AND a rendering decision: the matching element is then not
 * interactive at all (no click target, no button role), exactly as the bubble behaved when each
 * callback was its own nullable parameter. [None] is the fully inert set, used by non-interactive
 * render sites such as the long-press preview.
 */
@Immutable
public data class BubbleCallbacks(
    /** Long press on the bubble body (opens the action menu). */
    val onLongPress: (() -> Unit)? = null,
    /** Tap on a reaction chip, with its emoji. */
    val onReactionClick: ((String) -> Unit)? = null,
    /** Long press on a reaction chip. */
    val onReactionLongPress: (() -> Unit)? = null,
    /** Tap on an image of the grid, with its index. */
    val onImageClick: ((Int) -> Unit)? = null,
    /** Long press on one image of the grid, with its index: that piece alone is previewed (#13461). */
    val onImageLongClick: ((Int) -> Unit)? = null,
    /**
     * Double tap sur une case de la grille de la rangée plate : réagir à CETTE pièce (son identifiant). Nul ⇒ le geste
     * n'est pas monté et le tap simple n'attend aucune désambiguïsation ; une pièce seule ou protégée ne l'offre jamais.
     */
    val onReactToAttachment: ((attachmentId: String) -> Unit)? = null,
    /** Tap on a shared location that has coordinates. */
    val onLocationClick: ((BubbleLocation) -> Unit)? = null,
    /** Tap on a playable audio attachment. */
    val onAudioClick: ((BubbleAudio) -> Unit)? = null,
    /** Tap on a word of the transcript of the voice note being played: seek it to that word's start, in seconds. */
    val onAudioSeek: ((BubbleAudio, Double) -> Unit)? = null,
    /** Glissé (ou toucher) sur l'onde du vocal en cours : se placer à cette fraction (0…1). */
    val onAudioSeekFraction: ((BubbleAudio, Double) -> Unit)? = null,
    /** Toucher de la puce de vitesse : ×1 → ×1,5 → ×2 du moteur partagé. */
    val onAudioCycleSpeed: (() -> Unit)? = null,
    /**
     * Le plein écran d'un vocal, avec SA piste (iOS `AudioStackView.fullscreenOpener`). Exposé ici, câblé par le lot du
     * plein écran audio ; jamais offert pour un vocal protégé.
     */
    val onAudioFullscreen: ((BubbleAudio) -> Unit)? = null,
    /**
     * La vraie forme d'onde d'un vocal (niveaux 0…1), calculée une fois et mise en cache par l'hôte ; sa valeur présente se
     * dessine dès le premier rendu (pas de forme de repli fugace au retour d'une bulle). Demandée seulement pour un vocal
     * déjà sur l'appareil et jamais pour un vocal protégé : la bulle garde sinon sa forme de repli déterministe.
     */
    val audioSamples: ((BubbleAudio) -> StateFlow<List<Float>>)? = null,
    /**
     * Tap sur « Transcrire » d'un vocal que rien ne transcrit encore (iOS `onRequestTranscription`) : l'hôte demande la
     * transcription au serveur. Nul ⇒ aucun bouton de demande (jamais offert pour un vocal protégé ni un brouillon local).
     */
    val onRequestTranscription: ((BubbleAudio) -> Unit)? = null,
    /**
     * L'état de la demande de transcription de ce vocal (au repos, en cours, en échec), tenu par l'hôte : « Transcription… »
     * reste affiché tant que la tâche tourne, « Transcrire » revient au plafond de silence ou à l'échec reçu.
     */
    val transcriptionRequest: ((BubbleAudio) -> Flow<MessageTranscriptionFiche.Request>)? = null,
    /** Tap on a file attachment that has a url. */
    val onFileClick: ((BubbleFile) -> Unit)? = null,
    /** Tap on the quoted-reply preview (only wired when the quoted message id is known). */
    val onReplyPreviewClick: (() -> Unit)? = null,
    /** Tap sur le NOM de l'auteur cité : sa fiche profil (armé seulement s'il y en a une). */
    val onQuotedAuthorTap: (() -> Unit)? = null,
    /** Tap sur la miniature du média cité : la visionneuse (repli hôte : le saut à l'original). */
    val onQuotedMediaTap: (() -> Unit)? = null,
    /** Tap on the citation card of a quoted story (only wired when the story still opens, #13296). */
    val onStoryCitationClick: (() -> Unit)? = null,
    /** Tap on a language flag of the Prisme strip, with its language code. */
    val onFlagTap: ((String) -> Unit)? = null,
    /** Tap sur le bouton traduire du pied (iOS `onTranslate`) : l'explorateur des langues du message. */
    val onTranslate: (() -> Unit)? = null,
    /** Tap sur le smiley d'ajout du dernier message reçu : la réaction rapide. */
    val onAddReaction: (() -> Unit)? = null,
    /** Appui long de 0,4 s sur le smiley d'ajout : le sélecteur complet. */
    val onOpenReactPicker: (() -> Unit)? = null,
    /** Tap sur la bande orange d'un envoi échoué (iOS `BubbleFailedRetryBar`) : renvoyer. */
    val onRetry: (() -> Unit)? = null,
    /** Tap sur l'avatar de l'auteur dans le pied d'identité (et « Voir le profil » de son menu). */
    val onSenderTap: (() -> Unit)? = null,
    /** Tap sur « dis-leur salut » de la ligne d'arrivées groupées : la réponse rapide s'ouvre. */
    val onSayHi: (() -> Unit)? = null,
    /** Double toucher (« Voir la fiche » en TalkBack) sur un avis d'arrivée : la fiche de participation de l'arrivant. */
    val onOpenJoinProfile: ((participantId: String) -> Unit)? = null,
    /** Tap sur les coches de livraison d'une rangée plate envoyée : les détails de lecture. */
    val onShowReadStatus: (() -> Unit)? = null,
    /** Rappeler (ou rejoindre un appel en cours) depuis la notice d'appel de la rangée plate : double tap. */
    val onCallBack: (() -> Unit)? = null,
    /** Tap sur l'avis « activer le consentement vocal » sous un audio. */
    val onTapConsentNotice: (() -> Unit)? = null,
    /**
     * The TalkBack actions of the bubble body, in order. The host passes exactly what the
     * message's law offers (#12760): an empty list exposes none.
     */
    val accessibilityActions: List<BubbleAccessibilityAction> = emptyList(),
) {
    public companion object {
        /** No callback at all: a purely decorative bubble. */
        public val None: BubbleCallbacks = BubbleCallbacks()
    }
}

/** One named TalkBack action of a bubble: its spoken [label] and what it does. */
@Immutable
public data class BubbleAccessibilityAction(
    val label: String,
    val onAction: () -> Unit,
)
