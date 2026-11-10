package me.meeshy.sdk.model.external

import kotlinx.serialization.Serializable
import me.meeshy.sdk.model.report.ReportReason

/**
 * La conformité de l'interopérabilité WhatsApp (#17120, chantier #17007) : l'information sur ce
 * qui part chez Meta, le consentement sous sa version en vigueur, et le signalement d'un contenu
 * reçu de WhatsApp. Miroir de `packages/shared/types/external-interop-compliance.ts`.
 */
public object ExternalInteropNotice {
    /**
     * La version que CE client montre. La passerelle refuse un consentement donné sous une autre
     * (409 `EXTERNAL_CONVERSATION_NOTICE_OUTDATED`) ; un témoin la compare au fichier partagé.
     */
    public const val VERSION: String = "2026-11-10"
}

/** Ce qui PEUT partir chez Meta, dans l'ordre où l'écran d'information le dit. */
public enum class ExternalInteropDisclosure(public val wireValue: String) {
    PHONE_NUMBER("phone-number"),
    PROFILE_NAME("profile-name"),
    PUBLIC_KEYS("public-keys"),
    ENCRYPTED_CONTENT("encrypted-content"),
    DELIVERY_METADATA("delivery-metadata"),
    ;

    public companion object {
        public fun fromWire(value: String): ExternalInteropDisclosure? = entries.firstOrNull { it.wireValue == value }
    }
}

/** `GET /conversations/external/consent` — `disclosures` reste en chaînes : une entrée inconnue s'ignore. */
@Serializable
public data class ExternalInteropConsentStatus(
    val network: String,
    val noticeVersion: String,
    val disclosures: List<String> = emptyList(),
    val retentionDays: Int,
    val consent: ExternalInteropConsent? = null,
    val current: Boolean = false,
) {
    public val knownDisclosures: List<ExternalInteropDisclosure>
        get() = disclosures.mapNotNull(ExternalInteropDisclosure::fromWire)
}

@Serializable
public data class ExternalInteropConsent(val grantedAt: String, val noticeVersion: String)

/** Le corps de `PUT /conversations/external/consent` : jamais de date, la passerelle date. */
@Serializable
public data class ExternalInteropConsentRequest(
    val network: String,
    val noticeVersion: String,
    val granted: Boolean,
) {
    public companion object {
        public fun whatsapp(granted: Boolean): ExternalInteropConsentRequest =
            ExternalInteropConsentRequest(network = "whatsapp", noticeVersion = ExternalInteropNotice.VERSION, granted = granted)
    }
}

/**
 * Le corps de `POST /conversations/:id/external/report`. Le texte du message ne part que si la
 * personne l'a JOINT : vide ou absent, `disclosedText` est `null` et omis du fil
 * (`explicitNulls = false`).
 */
@Serializable
public data class ExternalReportRequest(
    val reportType: String,
    val blockPeer: Boolean,
    val disclosedText: String? = null,
) {
    public companion object {
        public const val MAX_DISCLOSED_TEXT_LENGTH: Int = 2000

        public fun of(reason: ReportReason, blockPeer: Boolean, joinedText: String?): ExternalReportRequest =
            ExternalReportRequest(
                reportType = reason.wireValue,
                blockPeer = blockPeer,
                disclosedText = joinedText?.trim()?.takeIf { it.isNotEmpty() }?.take(MAX_DISCLOSED_TEXT_LENGTH),
            )
    }
}

/** L'accusé : ce qui a été fait, et où orienter la personne pour agir chez WhatsApp. */
@Serializable
public data class ExternalReportAck(
    val reportId: String,
    val peerBlocked: Boolean,
    val orientation: String,
)
