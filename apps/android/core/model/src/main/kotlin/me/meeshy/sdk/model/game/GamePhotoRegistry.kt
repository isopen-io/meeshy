@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject

/*
 * LE REGISTRE DES MOMENTS PHOTO (#20651, tranche Android de #20643) — miroir de `gamePhotoBlockSchema`
 * (`packages/shared/types/game-photo.ts`) et de `GamePhotoBlock` (SDK Swift, `GamePhotoRegistry.swift`) : l'extension
 * `game.photo` du bloc `game`. Une ligne de base ou un palier illisible vaut « aucun » ; tout autre champ illisible fait
 * tomber le bloc SEUL, le reste du jeu reste lu. Ce que le registre dit déjà présenté ne s'annonce plus, et l'accusé
 * d'une présentation part par lots ([GamePhotoRegistry.presentedBatches]).
 */

/** « Me proposer d'immortaliser » : le réglage de COMPTE (`PHOTO_INVITATIONS`). */
@Serializable
public enum class PhotoInvitationsSetting {
    @SerialName("every") Every,
    @SerialName("major") Major,
    @SerialName("never") Never,
    ;

    /** Le réglage dans les mots de la loi des alertes (`invitationsPolicy` du web). */
    public val policy: PhotoAlertPolicy
        get() = PhotoAlertPolicy.Standard.copy(
            invitations = when (this) {
                Every -> PhotoAlertPolicy.Invitations.EveryStep
                Major -> PhotoAlertPolicy.Invitations.BigMoments
                Never -> PhotoAlertPolicy.Invitations.Never
            },
        )
}

/** Une ligne du registre : quand l'étape a été détectée, présentée, notifiée, immortalisée. */
@Serializable
public data class GamePhotoMomentRow(
    val stepId: String,
    @EncodeDefault val detectedAt: String? = null,
    @EncodeDefault val presentedAt: String? = null,
    @EncodeDefault val notifiedAt: String? = null,
    /** Absente d'un serveur d'avant le signal « immortalisée » : `null`. */
    @EncodeDefault val keptAt: String? = null,
)

/** La ligne de base telle qu'elle voyage (`PhotoCatchUpStandingPayload`). */
@Serializable
public data class GamePhotoBaseline(
    val rank: GloryRank,
    /** V (5) à I (1), `null` pour le Mythe. */
    @EncodeDefault val division: Int? = null,
    val levelRecord: Int,
    val prestige: Int,
    val minted: Int,
    @EncodeDefault val treasuryTier: TreasuryTierKey? = null,
    val flameRecord: Int,
    @EncodeDefault val pastCycleRecords: List<Int>? = null,
) {
    /** La situation que lit la loi du rattrapage. */
    val standing: PhotoCatchUpStanding
        get() = PhotoCatchUpStanding(rank, division, levelRecord, prestige, minted, treasuryTier, flameRecord, pastCycleRecords)
}

/** L'extension `game.photo` : réglages de compte, ligne de base des alertes et registre des étapes. */
@Serializable
public data class GamePhotoBlock(
    @EncodeDefault val atmosphere: String? = null,
    val invitations: PhotoInvitationsSetting,
    @EncodeDefault val baselineAt: String? = null,
    /** La situation à la ligne de base ; illisible, elle vaut « aucune ». */
    @EncodeDefault val baseline: GamePhotoBaseline? = null,
    /** Le plus haut palier du trésor jamais atteint ; illisible, il vaut « aucun ». */
    @EncodeDefault val treasuryPeakTier: TreasuryTierKey? = null,
    val moments: List<GamePhotoMomentRow>,
) {
    /** La politique des alertes que le réglage du compte demande. */
    val policy: PhotoAlertPolicy get() = invitations.policy

    val baselineStanding: PhotoCatchUpStanding? get() = baseline?.standing

    /** Présentées, notifiées ou immortalisées : ces étapes ne s'annoncent plus (miroir de `decide` du web). */
    val presentedStepIds: List<String>
        get() = moments.filter { it.presentedAt != null || it.notifiedAt != null || it.keptAt != null }.map { it.stepId }

    /** Immortalisées sur un appareil : elles sortent de « À rattraper » partout. */
    val keptStepIds: List<String> get() = moments.filter { it.keptAt != null }.map { it.stepId }
}

/** `photoMomentsPresentedResponseSchema` : la date de la PREMIÈRE présentation de chaque étape accusée. */
public data class PhotoMomentsPresentedResponse(val presented: List<Entry>) {
    public data class Entry(val stepId: String, val presentedAt: String)
}

public object GamePhotoRegistry {
    /** `PHOTO_MOMENTS_SERVED_MAX` : le registre servi porte au plus ces lignes. */
    public const val SERVED_MAX: Int = 64

    /** `PHOTO_PRESENTED_MAX` : un accusé porte au plus ces étapes. */
    public const val PRESENTED_MAX: Int = 64

    private val stepIdPattern = Regex("^[A-Za-z0-9][A-Za-z0-9:._-]{0,95}$")

    /** `PHOTO_STEP_ID_PATTERN`. */
    public fun isStepId(value: String): Boolean = stepIdPattern.matches(value)

    /** Les lots d'un accusé : étapes valides, sans doublon, dans l'ordre, [PRESENTED_MAX] au plus par lot. */
    public fun presentedBatches(stepIds: List<String>): List<List<String>> =
        stepIds.filter(::isStepId).distinct().chunked(PRESENTED_MAX)

    /** La réponse de l'accusé ; illisible, `null` (l'écriture est faite, rien n'est inventé). */
    public fun presented(text: String?): PhotoMomentsPresentedResponse? = readGamePayload(text) { obj ->
        PhotoMomentsPresentedResponse(
            obj.reqArray("presented").map { element ->
                val entry = element as? JsonObject ?: throw GameParseException("presented")
                PhotoMomentsPresentedResponse.Entry(stepId = entry.reqString("stepId"), presentedAt = entry.reqString("presentedAt"))
            },
        )
    }
}

internal fun parsePhotoBlock(obj: JsonObject): GamePhotoBlock {
    val moments = obj.reqArray("moments").map { element ->
        parsePhotoMomentRow(element as? JsonObject ?: throw GameParseException("moments"))
    }
    if (moments.size > GamePhotoRegistry.SERVED_MAX) throw GameParseException("moments")
    return GamePhotoBlock(
        atmosphere = obj.nullableString("atmosphere"),
        invitations = obj.reqEnum("invitations"),
        baselineAt = obj.nullableString("baselineAt"),
        baseline = obj.lenient("baseline", ::parsePhotoBaseline),
        treasuryPeakTier = try {
            obj.nullableEnum<TreasuryTierKey>("treasuryPeakTier")
        } catch (_: GameParseException) {
            null
        },
        moments = moments,
    )
}

private fun parsePhotoMomentRow(obj: JsonObject): GamePhotoMomentRow {
    val stepId = obj.reqString("stepId")
    if (!GamePhotoRegistry.isStepId(stepId)) throw GameParseException("stepId")
    return GamePhotoMomentRow(
        stepId = stepId,
        detectedAt = obj.nullableString("detectedAt"),
        presentedAt = obj.nullableString("presentedAt"),
        notifiedAt = obj.nullableString("notifiedAt"),
        keptAt = obj.nullableString("keptAt"),
    )
}

/** Un rang ou une division inconnus, un compteur négatif la rendent illisible, comme `servedBaseline` du web. */
private fun parsePhotoBaseline(obj: JsonObject): GamePhotoBaseline = GamePhotoBaseline(
    rank = obj.reqEnum("rank"),
    division = obj.nullableInt("division")?.also { if (it !in 1..5) throw GameParseException("division") },
    levelRecord = obj.reqCount("levelRecord"),
    prestige = obj.reqCount("prestige"),
    minted = obj.reqCount("minted"),
    treasuryTier = obj.nullableEnum("treasuryTier"),
    flameRecord = obj.reqCount("flameRecord"),
    pastCycleRecords = obj.pastCycleRecords(),
)

private fun JsonObject.reqCount(key: String): Int = reqInt(key).also { if (it < 0) throw GameParseException(key) }

private fun JsonObject.pastCycleRecords(): List<Int>? {
    val element = this["pastCycleRecords"]?.takeUnless { it is JsonNull } ?: return null
    val records = (element as? JsonArray ?: throw GameParseException("pastCycleRecords")).ints("pastCycleRecords")
    if (records.any { it < 0 }) throw GameParseException("pastCycleRecords")
    return records
}
