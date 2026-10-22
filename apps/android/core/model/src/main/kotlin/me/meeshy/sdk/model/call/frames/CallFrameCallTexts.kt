package me.meeshy.sdk.model.call.frames

/**
 * Ce que l'écran d'appel sait déjà de la conversation de l'appel, sans rien attendre : le titre de
 * groupe que le maillage a reçu par socket, et si l'appel se tient à plusieurs.
 */
public data class CallFrameCallContext(
    val conversationId: String?,
    val knownGroupTitle: String?,
    val isGroupCall: Boolean,
)

/** Ce que la conversation de l'appel fournit aux textes d'un cadre (type brut de la passerelle, noms, accent sans « # »). */
public data class CallFrameConversationInfo(
    val type: String,
    val customName: String?,
    val title: String?,
    val accentPrimary: String?,
    val accentSecondary: String?,
)

/**
 * LES TEXTES D'UN CADRE (#8743, spec § 4.5 et § 5.6) : le nom du groupe tel que l'utilisateur le voit
 * (son nom personnalisé, sinon le titre de la conversation, sinon celui que le maillage connaît), le type
 * de la conversation, la date du jour et l'accent de la conversation.
 */
public object CallFrameTextsRule {

    public fun texts(conversation: CallFrameConversationInfo?, context: CallFrameCallContext, date: String): CallFrameTexts {
        val grouped = conversation?.let { isGroup(it.type) } ?: context.isGroupCall
        val name = conversation?.let { meaningful(it.customName) ?: meaningful(it.title) }
            ?: meaningful(context.knownGroupTitle)
        return CallFrameTexts(
            groupName = if (grouped) name else null,
            isGroup = grouped,
            date = date,
            accentHex = conversation?.let { accent(it.accentPrimary, it.accentSecondary) },
        )
    }

    /** Un direct et un bot sont un tête-à-tête ; tout le reste réunit un groupe. */
    public fun isGroup(type: String): Boolean = when (type.lowercase()) {
        "direct", "bot" -> false
        else -> true
    }

    /** La palette de la conversation porte des hex sans « # » : le cadre les veut préfixés. */
    public fun accent(primary: String?, secondary: String?): CallFrameAccent? {
        val first = hex(primary) ?: return null
        val second = hex(secondary) ?: return null
        return CallFrameAccent(first, second)
    }

    public fun hex(value: String?): String? {
        val trimmed = value?.trim().orEmpty()
        val prefixed = if (trimmed.startsWith("#")) trimmed else "#$trimmed"
        return if (CallFrameColor.parse(prefixed) == null) null else prefixed
    }

    private fun meaningful(value: String?): String? = value?.trim()?.takeIf { it.isNotEmpty() }
}
