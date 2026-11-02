package me.meeshy.app.calls

import java.text.DateFormat
import java.util.Date
import java.util.Locale
import javax.inject.Inject
import javax.inject.Singleton
import me.meeshy.sdk.conversation.ConversationRepository
import me.meeshy.sdk.model.ApiConversation
import me.meeshy.sdk.model.call.frames.CallFrameCallContext
import me.meeshy.sdk.model.call.frames.CallFrameConversationInfo
import me.meeshy.sdk.model.call.frames.CallFrameTexts
import me.meeshy.sdk.model.call.frames.CallFrameTextsRule
import me.meeshy.sdk.theme.accentColorPalette

/**
 * Ce qu'un cadre écrit hors des visages, résolu pour l'appel en cours (miroir de iOS `CallFrameTextsResolver`,
 * #8743, #13687). **CACHE-FIRST** : le nom du groupe, son type et son accent viennent de la conversation en
 * cache ; à défaut, de ce que l'appel sait déjà. Aucune requête ne part d'ici.
 */
@Singleton
class CallFrameTextsResolver internal constructor(
    private val cached: suspend (String) -> ApiConversation?,
    private val now: () -> Date,
    private val locale: () -> Locale,
) {
    @Inject
    constructor(repository: ConversationRepository) : this({ repository.cachedById(it) }, ::Date, Locale::getDefault)

    /** Ce qu'on sait sans rien lire : le cadre s'affiche tout de suite, le cache l'affine ensuite. */
    fun immediate(call: CallFrameCallContext): CallFrameTexts = CallFrameTextsRule.texts(null, call, dateText())

    suspend fun texts(call: CallFrameCallContext): CallFrameTexts {
        val id = call.conversationId?.takeIf { it.isNotBlank() } ?: return immediate(call)
        val conversation = runCatching { cached(id) }.getOrNull()
        return CallFrameTextsRule.texts(conversation?.let(::info), call, dateText())
    }

    /** La date du jour, au format court de la langue de l'appareil (iOS `.abbreviated`). */
    private fun dateText(): String = DateFormat.getDateInstance(DateFormat.MEDIUM, locale()).format(now())

    private fun info(conversation: ApiConversation): CallFrameConversationInfo {
        val palette = conversation.accentColorPalette()
        return CallFrameConversationInfo(
            type = conversation.type,
            customName = conversation.resolvedPreferences?.customName,
            title = conversation.title,
            accentPrimary = palette.primary,
            accentSecondary = palette.secondary,
        )
    }
}
