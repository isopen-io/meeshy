package me.meeshy.sdk.lang

import me.meeshy.sdk.model.ApiMessage

/**
 * La langue lue que `mark-as-read` déclare, résolue À LA COMPOSITION de l'accusé (jamais à l'envoi de la
 * file : une traduction arrivée entre-temps ne change pas ce que le lecteur avait sous les yeux). Miroir de
 * `splitConsumedLanguages` (iOS `ConversationViewModel+Translations`) : chaque message est résolu par
 * [ConsumedLanguageResolver] — bascule manuelle, prisme, original — puis le lot est réparti par [dominantSplit].
 */
object ReadReceiptLanguages {

    /** Plafond accepté par la passerelle ; au-delà, on garde les PLUS RÉCENTS. */
    const val MAX_MESSAGE_IDS: Int = 200

    private val OBJECT_ID = Regex("^[0-9a-fA-F]{24}$")

    /** Ce qui voyage dans le corps de `mark-as-read` : les messages nommés et leur répartition de langues. */
    data class Declaration(
        val messageIds: List<String>,
        val language: String?,
        val messageLanguages: Map<String, String>,
        val caughtUpToMessageId: String?,
    )

    /**
     * @param messages les messages lus, du plus ancien au plus récent.
     * @param prism le prisme STRICT du lecteur ([ReaderPrism]), jamais la liste de composition à repli « fr ».
     * @param manualSelections `messageId -> langue` ouverte à la main (bascule d'un drapeau, « voir l'original »).
     * Un identifiant qui n'est pas un ObjectId (envoi optimiste) n'est jamais nommé : la passerelle rejetterait
     * le lot entier.
     */
    fun declare(
        messages: List<ApiMessage>,
        prism: List<String>,
        manualSelections: Map<String, String> = emptyMap(),
    ): Declaration {
        val named = messages.filter { OBJECT_ID.matches(it.id) }.takeLast(MAX_MESSAGE_IDS)
        val resolved = LinkedHashMap<String, String>()
        for (message in named) {
            val language = ConsumedLanguageResolver.resolve(
                originalLanguage = message.originalLanguage,
                availableTranslations = message.translations.filter { it.isEncrypted != true }.map { it.targetLanguage },
                preferredLanguages = prism,
                manualSelection = manualSelections[message.id],
            )
            if (language != null) resolved[message.id] = language
        }
        val split = dominantSplit(resolved)
        return Declaration(
            messageIds = named.map { it.id },
            language = split.language,
            messageLanguages = split.exceptions,
            caughtUpToMessageId = named.lastOrNull()?.id,
        )
    }
}
