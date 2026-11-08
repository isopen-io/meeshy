package me.meeshy.sdk.model.conversationlist

import me.meeshy.sdk.lang.LanguageResolver
import me.meeshy.sdk.model.ApiMessage
import me.meeshy.sdk.model.ApiTextTranslation

/**
 * Les cinq états que l'aperçu d'appui long sait DIRE (miroir de `ConversationPreviewPhase`, iOS) :
 * il charge, il montre, il n'a rien (CONSTATÉ), il n'a rien pu lire, ou la conversation est
 * verrouillée. Jamais un `null` ambigu : un échec réseau sur une ligne froide ne prouve pas
 * qu'une conversation est vide.
 */
enum class ConversationPreviewPhase { Loading, Loaded, Empty, Unavailable, Sealed }

/**
 * Pourquoi on charge, et donc jusqu'où on va. Un chargement en vol qui va au moins aussi loin
 * sert celui qui l'attend (montée en gamme `Open > Ensure > Prefetch`).
 */
enum class ConversationPreviewIntent(val reach: Int) {
    /** Rangée visible : le cache seul, jamais le réseau. */
    Prefetch(0),

    /** Une fois par conversation : cache, puis réseau si le cache manque ou a vieilli (SWR). */
    Ensure(1),

    /** L'aperçu s'ouvre : ce qui est servi reste à l'écran et le réseau revalide en silence. */
    Open(2),
}

/**
 * D'où vient ce qui est servi. Le réseau ne recule jamais devant le cache, et seul un cache FRAIS
 * ou le réseau dispensent `Ensure` de revalider.
 */
enum class ConversationPreviewProvenance { StaleCache, FreshCache, Network }

/** Ce que la lecture du cache local a rendu. */
sealed interface PreviewCacheReading {
    data class Fresh(val hasMessages: Boolean) : PreviewCacheReading
    data object Stale : PreviewCacheReading
    data object Absent : PreviewCacheReading
}

object ConversationPreviewLaw {
    /** Nombre de messages montrés par l'aperçu. */
    const val PREVIEW_LIMIT = 5

    /** Une demande plus ambitieuse que le chargement en vol l'attend, puis repart. */
    fun mustWaitThenRerun(running: ConversationPreviewIntent, requested: ConversationPreviewIntent): Boolean =
        running.reach < requested.reach

    fun needsNetwork(intent: ConversationPreviewIntent, cache: PreviewCacheReading): Boolean = when (intent) {
        ConversationPreviewIntent.Prefetch -> false
        ConversationPreviewIntent.Open -> true
        ConversationPreviewIntent.Ensure -> (cache as? PreviewCacheReading.Fresh)?.hasMessages != true
    }

    /** `Prefetch` s'arrête dès que quelque chose est servi ; `Ensure`, dès que c'est À JOUR. */
    fun isSettled(intent: ConversationPreviewIntent, held: ConversationPreviewProvenance?): Boolean = when (intent) {
        ConversationPreviewIntent.Open -> false
        ConversationPreviewIntent.Prefetch -> held != null
        ConversationPreviewIntent.Ensure -> held != null && held != ConversationPreviewProvenance.StaleCache
    }

    /** Un cache n'écrase jamais un résultat réseau déjà servi. */
    fun mayPublishCache(held: ConversationPreviewProvenance?): Boolean = held != ConversationPreviewProvenance.Network

    fun provenanceOf(cache: PreviewCacheReading): ConversationPreviewProvenance? = when (cache) {
        is PreviewCacheReading.Fresh -> ConversationPreviewProvenance.FreshCache
        PreviewCacheReading.Stale -> ConversationPreviewProvenance.StaleCache
        PreviewCacheReading.Absent -> null
    }
}

/**
 * Les derniers messages servis et la traduction que le Prisme du lecteur élit pour chacun.
 * Un message chiffré que cet appareil ne sait pas lire est SCELLÉ (contenu et traductions vidés,
 * fail-closed) ; un message en clair reste lisible.
 */
data class ConversationPreviewSnapshot(
    val messages: List<ApiMessage>,
    private val served: Map<String, ApiTextTranslation>,
) {
    fun servedTranslation(messageId: String): ApiTextTranslation? = served[messageId]

    fun servedLanguage(messageId: String): String? = served[messageId]?.targetLanguage

    fun servedText(message: ApiMessage): String = served[message.id]?.translatedContent ?: message.content

    companion object {
        /** [messages] du plus ancien au plus récent ; seuls les [ConversationPreviewLaw.PREVIEW_LIMIT] derniers sont gardés. */
        fun of(messages: List<ApiMessage>, prefs: LanguageResolver.ContentLanguagePreferences): ConversationPreviewSnapshot {
            val kept = messages.takeLast(ConversationPreviewLaw.PREVIEW_LIMIT).map(::sealedForPreview)
            val served = kept.mapNotNull { message ->
                if (message.isCiphertext) return@mapNotNull null
                val candidates = message.translations.filter { it.isEncrypted != true }
                LanguageResolver.preferredTranslation(candidates, prefs, message.originalLanguage)
                    ?.let { message.id to it }
            }.toMap()
            return ConversationPreviewSnapshot(kept, served)
        }

        private fun sealedForPreview(message: ApiMessage): ApiMessage =
            if (message.isCiphertext) {
                message.copy(content = "", translations = emptyList(), encryptedContent = null)
            } else {
                message
            }
    }
}

/**
 * L'empreinte d'un aperçu : assez pour qu'un message modifié, supprimé ou servi dans une autre
 * langue ré-évalue la rangée quand le nombre de messages ne bouge pas.
 */
data class ConversationPreviewFingerprint(
    val phase: ConversationPreviewPhase,
    val entries: List<Entry>,
) {
    data class Entry(
        val id: String,
        val updatedAt: String?,
        val editedAt: String?,
        val deletedAt: String?,
        val servedLanguage: String?,
        val isSealed: Boolean,
    )

    companion object {
        fun of(phase: ConversationPreviewPhase, snapshot: ConversationPreviewSnapshot?): ConversationPreviewFingerprint =
            ConversationPreviewFingerprint(
                phase = phase,
                entries = snapshot?.messages.orEmpty().map {
                    Entry(
                        id = it.id,
                        updatedAt = it.updatedAt,
                        editedAt = it.editedAt,
                        deletedAt = it.deletedAt,
                        servedLanguage = snapshot?.servedLanguage(it.id),
                        isSealed = it.isCiphertext && it.content.isEmpty(),
                    )
                },
            )
    }
}
