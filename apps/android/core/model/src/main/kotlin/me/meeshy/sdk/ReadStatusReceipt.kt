package me.meeshy.sdk.model

/**
 * Ce qu'un `read-status:updated` dit des coches d'UN message envoyé — miroir de `ReadStatusReceipt.swift`
 * (iOS) et de `applyReadStatusUpdated` (web). Un résumé décrit UN message : celui qu'il nomme
 * (`summary.messageId`) ou, d'une passerelle d'avant #7433, le DERNIER du fil. Il ne se règle JAMAIS par
 * l'horodatage de l'événement (`updatedAt`, instant d'ÉMISSION) : le pair qui lit M1 à M5 ne fait pas passer
 * M6 à M20 en « lu ».
 */
object ReadStatusReceipt {

    /**
     * L'identifiant du message que [summary] décrit : celui qu'il nomme, sinon [latestMessageId] (passerelle
     * d'avant #7433). `null` quand le résumé n'affirme rien — un dénominateur nul est ce que la passerelle rend
     * sur son chemin d'ERREUR, l'appliquer ferait reculer des compteurs justes.
     */
    fun describedMessageId(summary: ReadStatusSummary, latestMessageId: String?): String? {
        if (summary.totalMembers <= 0) return null
        return summary.messageId ?: latestMessageId
    }

    /** `true` quand le résumé nomme son message (sinon le repli sur le dernier du fil s'applique). */
    fun isNamed(summary: ReadStatusSummary): Boolean = summary.messageId != null

    /**
     * Les compteurs fusionnés « jamais en arrière » : une coche ne recule pas, le dénominateur positif est adopté.
     * Seul le REST fait autorité à la baisse.
     */
    fun merged(current: ReceiptCounters, summary: ReadStatusSummary): ReceiptCounters =
        ReceiptMergePolicy.merged(current, with(ReceiptMergePolicy) { summary.counters })
}
