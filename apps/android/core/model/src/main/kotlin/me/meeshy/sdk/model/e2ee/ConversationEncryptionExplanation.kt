package me.meeshy.sdk.model.e2ee

/**
 * Ce que la fiche Chiffrement explique de la conversation ouverte (#12880, directive du porteur) :
 * qui peut lire, ce qui fonctionne, ce qui manque et pourquoi, ce qui n'est pas encore livré, les
 * appareils, la bascule. Miroir de `ConversationEncryptionExplanation.swift` ; chaque fait est
 * relevé dans le code qui le produit côté passerelle et iOS, jamais écrit de mémoire.
 */
class ConversationEncryptionExplanation private constructor(
    val regime: ConversationEncryptionRegime,
    val sections: List<Section>,
) {
    enum class Topic { WHO_READS, AVAILABLE, ABSENT, NOT_YET, DEVICES, SWITCHING, PERMANENCE }

    enum class Fact {
        TRANSIT_PROTECTED, STORED_WITHOUT_ENCRYPTION, ENCRYPTED_ON_SERVER_SERVER_READS, HYBRID_IS_SERVER_TODAY,
        ONLY_PARTICIPANTS_READ, EVERY_SERVER_FEATURE, TRANSLATED_ON_DEVICE,
        NO_SERVER_TRANSCRIPTION, NO_NOTIFICATION_PREVIEW, NO_SEARCH, NO_EDIT, NO_FORWARD, NO_OFFLINE_SENDING,
        NOT_YET_ATTACHMENTS, NOT_YET_DECRYPTED_NOTIFICATIONS, NOT_YET_GROUPS, GROUP_SENDING_UNAVAILABLE, NOT_YET_SAFETY_NUMBERS,
        ONE_KEY_PER_DEVICE, DEVICE_LIMIT, RESTORED_DEVICE_IS_NEW,
        WHO_MAY_TOGGLE, SWITCH_KEEPS_HISTORY, SWITCH_IS_SHOWN_IN_THREAD, END_TO_END_IS_FINAL,
        END_TO_END_NEVER_TURNED_OFF, END_TO_END_NEVER_TURNED_OFF_DIRECT, SERVER_CANNOT_TURN_IT_OFF,
    }

    data class Section(val topic: Topic, val facts: List<Fact>)

    companion object {
        fun of(mode: String?, isDirect: Boolean): ConversationEncryptionExplanation {
            val regime = ConversationEncryptionRegime.of(mode)
            return ConversationEncryptionExplanation(regime, sectionsFor(regime, isDirect).filter { it.facts.isNotEmpty() })
        }

        private fun sectionsFor(regime: ConversationEncryptionRegime, isDirect: Boolean): List<Section> = when (regime) {
            ConversationEncryptionRegime.NONE -> readable(listOf(Fact.TRANSIT_PROTECTED, Fact.STORED_WITHOUT_ENCRYPTION))
            ConversationEncryptionRegime.SERVER -> readable(listOf(Fact.TRANSIT_PROTECTED, Fact.ENCRYPTED_ON_SERVER_SERVER_READS))
            ConversationEncryptionRegime.HYBRID -> readable(
                listOf(Fact.TRANSIT_PROTECTED, Fact.ENCRYPTED_ON_SERVER_SERVER_READS, Fact.HYBRID_IS_SERVER_TODAY),
            )
            ConversationEncryptionRegime.END_TO_END -> endToEnd(isDirect)
        }

        private val switchingFacts = listOf(
            Fact.WHO_MAY_TOGGLE, Fact.SWITCH_KEEPS_HISTORY, Fact.SWITCH_IS_SHOWN_IN_THREAD, Fact.END_TO_END_IS_FINAL,
        )

        private fun readable(whoReads: List<Fact>): List<Section> = listOf(
            Section(Topic.WHO_READS, whoReads),
            Section(Topic.AVAILABLE, listOf(Fact.EVERY_SERVER_FEATURE)),
            Section(Topic.SWITCHING, switchingFacts),
        )

        private fun endToEnd(isDirect: Boolean): List<Section> = listOf(
            Section(Topic.WHO_READS, listOf(Fact.ONLY_PARTICIPANTS_READ)),
            Section(Topic.AVAILABLE, listOf(Fact.TRANSLATED_ON_DEVICE)),
            Section(
                Topic.ABSENT,
                listOf(
                    Fact.NO_SERVER_TRANSCRIPTION, Fact.NO_NOTIFICATION_PREVIEW, Fact.NO_SEARCH,
                    Fact.NO_EDIT, Fact.NO_FORWARD, Fact.NO_OFFLINE_SENDING,
                ),
            ),
            Section(
                Topic.NOT_YET,
                listOf(Fact.NOT_YET_ATTACHMENTS, Fact.NOT_YET_DECRYPTED_NOTIFICATIONS, Fact.NOT_YET_GROUPS) +
                    (if (isDirect) emptyList() else listOf(Fact.GROUP_SENDING_UNAVAILABLE)) +
                    Fact.NOT_YET_SAFETY_NUMBERS,
            ),
            Section(Topic.DEVICES, listOf(Fact.ONE_KEY_PER_DEVICE, Fact.DEVICE_LIMIT, Fact.RESTORED_DEVICE_IS_NEW)),
            Section(
                Topic.PERMANENCE,
                listOf(
                    if (isDirect) Fact.END_TO_END_NEVER_TURNED_OFF_DIRECT else Fact.END_TO_END_NEVER_TURNED_OFF,
                    Fact.SERVER_CANNOT_TURN_IT_OFF,
                ),
            ),
        )
    }
}
