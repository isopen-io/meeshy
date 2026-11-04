package me.meeshy.ui.component.bubble

import androidx.compose.runtime.Immutable
import me.meeshy.sdk.model.MeeshyMediaConsumption
import me.meeshy.sdk.model.MessageTranscriptionSegment
import me.meeshy.sdk.model.contacts.ContactCardResolutionScope

@Immutable
public data class BubbleImage(
    val attachmentId: String,
    val url: String,
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    /** Author-authored accessibility description (`MessageAttachment.alt`, #6813). Read by TalkBack as `contentDescription`. */
    val alt: String? = null,
    /**
     * Les réactions des membres sur CETTE pièce, en une étiquette compacte (« 👍❤️ 3 ») — `null` sans réaction, et
     * pour une pièce protégée (#13596). Elle bouge en direct avec `attachment:reaction-added|removed`.
     */
    val reactionLabel: String? = null,
    /** À vue unique, floutée, éphémère ou retenue par la loi de sortie : la carte d'« Imager » ne la peint jamais (#14330). */
    val isProtected: Boolean = false,
    /** Le poids du fichier original, s'il est connu : sous 100 Ko, il descend seul (#14639). */
    val sizeBytes: Long? = null,
    /** La pièce se déclare floutée (son propre drapeau, indépendant de celui du message). */
    val isBlurred: Boolean = false,
    /** La pièce se déclare à vue unique. */
    val isViewOnce: Boolean = false,
    /** Combien de fois la vue unique a été ouverte (le compteur du coin de la case). */
    val viewOnceCount: Int = 0,
)

@Immutable
public data class BubbleFile(
    val attachmentId: String,
    val name: String?,
    val sizeBytes: Int? = null,
    val url: String? = null,
    val isVideo: Boolean = false,
    val isContactCard: Boolean = false,
    /** Chiffrée de bout en bout (#13493) : une rangée scellée, sans nom, sans adresse, qui ne se télécharge jamais. */
    val isSealed: Boolean = false,
    /** Déjà sur l'appareil (envoi local `file://` / `content://`) : aucun badge de téléchargement (#13492). */
    val isOnDevice: Boolean = false,
    /** À vue unique, floutée, éphémère ou retenue par la loi de sortie : la rangée n'offre ni badge ni appui (#13492). */
    val isProtected: Boolean = false,
    /** Où une carte de visite a le droit de résoudre ses identifiants ; FERMÉ par défaut (#13622). */
    val contactScope: ContactCardResolutionScope = ContactCardResolutionScope.Unknown,
    /** L'image d'attente d'une vidéo, que la carte d'« Imager » peint à sa place (#14330) ; `null` scellée ou sans vignette. */
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    /** Le type MIME déclaré : la carte de document en tire sa famille (PDF distinct de Word) et son icône. */
    val mimeType: String? = null,
    /** Le nombre de pages d'un document, quand le serveur le connaît (« N pages » sur la carte). */
    val pageCount: Int? = null,
)

/**
 * Une vidéo jointe (iOS `visualGrid` : images et vidéos dans UNE grille). Elle reste aussi dans [BubbleContent.files]
 * (lecteurs existants) ; ce modèle porte ce que la grille lit : vignette, dimensions, durée.
 */
@Immutable
public data class BubbleVideo(
    val attachmentId: String,
    val url: String? = null,
    val thumbnailUrl: String? = null,
    val width: Int? = null,
    val height: Int? = null,
    val durationSeconds: Int? = null,
    val sizeBytes: Int? = null,
    /** À vue unique, floue, éphémère ou retenue : ni vignette ni lecture. */
    val isProtected: Boolean = false,
    /** Envoi local (`file:` / `content:`) : le poster est celui de l'appareil, tout de suite, sans badge de téléchargement. */
    val isOnDevice: Boolean = false,
    /** Ce que la passerelle sert de la consommation de CE lecteur : alimente la barre de reprise. */
    val servedConsumption: MeeshyMediaConsumption? = null,
    val isBlurred: Boolean = false,
    val isViewOnce: Boolean = false,
    val viewOnceCount: Int = 0,
) {
    /** Le ratio servi par la métadonnée (niveau 3 de [me.meeshy.sdk.model.media.VideoDisplayAspect]) ; `null` sans dimensions. */
    val metadataRatio: Double?
        get() = if (width != null && height != null && width > 0 && height > 0) width.toDouble() / height else null
}

/**
 * A shared contact card (vCard attachment). [name] is the card's display name when known, else
 * the attachment's file name without extension; [accountUsername] is the resolved Meeshy account
 * handle (without `@`) when the contact is registered.
 */
@Immutable
public data class BubbleContactCard(
    val attachmentId: String,
    val name: String? = null,
    val accountUsername: String? = null,
)

/**
 * A shared-location attachment (mime `application/x-location`) — port of the
 * `.location` branch of iOS `BubbleAttachmentView`. Coordinates are nullable so a
 * malformed location still renders a "position shared" placeholder rather than
 * collapsing into a generic file row.
 */
@Immutable
public data class BubbleLocation(
    val attachmentId: String,
    val latitude: Double? = null,
    val longitude: Double? = null,
    val placeName: String? = null,
    val address: String? = null,
) {
    /** True when both coordinates are present and the point can be shown/opened. */
    val hasCoordinates: Boolean get() = latitude != null && longitude != null

    /**
     * A `geo:` URI to hand to an external maps app, or null when coordinates are
     * absent. `Double.toString()` is locale-independent (always a `.` separator),
     * so the URI is safe to build in any locale. A non-blank [placeName] is added
     * as the standard `(label)` suffix.
     */
    companion object {
        /** Le lieu du message (`ApiMessage.location`, hissé par la passerelle depuis `metadata.location`). */
        fun fromPlace(messageId: String, place: me.meeshy.sdk.model.SharedPlace): BubbleLocation = BubbleLocation(
            attachmentId = "place:$messageId",
            latitude = place.latitude,
            longitude = place.longitude,
            placeName = place.name?.trim()?.ifBlank { null },
            address = place.address?.trim()?.ifBlank { null },
        )
    }

    val geoUri: String? get() {
        val lat = latitude ?: return null
        val lon = longitude ?: return null
        val base = "geo:$lat,$lon?q=$lat,$lon"
        val label = placeName?.trim()?.ifBlank { null }
        return if (label != null) "$base($label)" else base
    }
}

/**
 * An audio-message attachment (an `audio/…` mime) — port of the `.audio` branch of
 * iOS `BubbleAttachmentView` / `AudioPlayerView`. The transcription is resolved
 * through the Prisme Linguistique at build time: [transcriptionText] already holds
 * the text in the viewer's preferred language when a matching translation exists,
 * otherwise the original transcription. [url] is null until the audio is available
 * locally, in which case [sizeBytes] drives a "needs download" affordance instead.
 */
@Immutable
public data class BubbleAudio(
    val attachmentId: String,
    val url: String? = null,
    val durationSeconds: Int? = null,
    val sizeBytes: Int? = null,
    val transcriptionText: String? = null,
    val transcriptionLanguage: String? = null,
    val isTranscriptionTranslated: Boolean = false,
    val isAudioTranslated: Boolean = false,
    val audioLanguage: String? = null,
    /**
     * Les segments de [transcriptionText] que le karaoké allume pendant la lecture (#13878). Ils ne gardent leurs
     * horodatages que s'ils décrivent la piste JOUÉE ; sur une autre piste ils avancent à la progression.
     */
    val transcriptionSegments: List<MessageTranscriptionSegment> = emptyList(),
    /**
     * Le vocal est protégé (vue unique, flou, éphémère ou chiffré — le message OU la pièce, [me.meeshy.sdk.model.VoiceQueueProtection]) :
     * il ne s'écrit jamais sur le disque, aucune onde n'est calculée, il ne s'ouvre ni en plein écran ni au transfert.
     */
    val isProtected: Boolean = false,
    /** La consommation SERVIE du lecteur : où il s'était arrêté, et s'il l'a écouté jusqu'au bout. */
    val lastPlayPositionMs: Int? = null,
    val listenedComplete: Boolean = false,
    /** La langue de la transcription d'origine, puis celles des pistes traduites : les drapeaux du pied d'une pile. */
    val originalLanguage: String? = null,
    val translatedLanguages: List<String> = emptyList(),
) {
    /** La durée déclarée en millisecondes, 0 quand elle est inconnue. */
    val declaredDurationMs: Long get() = (durationSeconds ?: 0).coerceAtLeast(0) * 1000L

    /** True when the audio has a playable URL (already downloaded / remote-ready). */
    val isPlayable: Boolean get() = !url.isNullOrBlank()

    /** True when a non-blank transcription line is worth surfacing under the player. */
    val hasTranscription: Boolean get() = !transcriptionText.isNullOrBlank()

    /** Ce que le karaoké lit : les segments servis, sinon la transcription en un seul bloc (iOS `resolveDisplaySegments`). */
    val karaokeSegments: List<MessageTranscriptionSegment> get() = transcriptionSegments.ifEmpty {
        listOfNotNull(transcriptionText?.trim()?.ifBlank { null }?.let { MessageTranscriptionSegment(text = it) })
    }

    /**
     * Human-readable `m:ss` duration (unpadded minutes, zero-padded seconds — the
     * same shape as iOS `String(format: "%d:%02d", …)`), or null when the duration
     * is unknown or negative (a malformed value never renders a nonsense label).
     */
    val formattedDuration: String? get() {
        val total = durationSeconds ?: return null
        if (total < 0) return null
        val minutes = total / 60
        val seconds = total % 60
        return "$minutes:${seconds.toString().padStart(2, '0')}"
    }
}
