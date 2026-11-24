package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * Standard Meeshy API envelope (all services):
 * `{ success, data?, error?, message?, code?, pagination? }`, plus the three
 * refusal-qualifying keys the gateway puts at the ROOT of an error envelope
 * ([fieldName], [suggestions], [violations]) — never nested under `error`.
 *
 * [fieldName] names the input a typed refusal belongs to (`EMAIL_TAKEN` →
 * `"email"`, `PHONE_INVALID` → `"phoneNumber"`), [suggestions] carries the free
 * alternates offered alongside a `USERNAME_TAKEN`, and [violations] the
 * per-input breakdown of a `VALIDATION_ERROR`. Decoding them here rather than at
 * one call site is what lets a screen put each refusal UNDER its own field
 * instead of dumping one opaque banner at the top.
 *
 * The wire key is `field`; the Kotlin name is [fieldName] because `field` is the
 * backing-field reference inside a property accessor, and a wire type is not the
 * place to make a reader wonder which one they are looking at.
 */
@Serializable
data class ApiResponse<T>(
    val success: Boolean = false,
    val data: T? = null,
    val error: String? = null,
    val message: String? = null,
    val code: String? = null,
    @SerialName("field") val fieldName: String? = null,
    val suggestions: List<String>? = null,
    val violations: List<ApiViolation>? = null,
    val pagination: Pagination? = null,
    val meta: ApiResponseMeta? = null,
    /** Les nombres d'un refus de plafond, étalés à la racine par `sendError` (`ONLY_UNLINKED_RECIPIENTS_LIMIT`, #14169). */
    val limit: Int? = null,
    val unlinked: Int? = null,
    /** Le détenteur masqué d'un `EMAIL_TAKEN` (#8214), lu en tolérance par `MaskedEmailOwner.from`. */
    val emailOwner: JsonElement? = null,
    /** Une limite du jour (`DAILY_*_LIMIT`) : l'instant ISO de remise à zéro, à la racine (#9584). */
    val resetAt: String? = null,
    /** Secondes avant de pouvoir réessayer (`NEWCOMER_SLOW_MODE`, limites du jour), entier ou décimal. */
    val retryAfter: Double? = null,
    /** Les consentements à donner d'un 403 de pièce jointe (`/attachments/:id/translate`). */
    val requiredConsents: List<String>? = null,
    /**
     * Les membres sans appareil chiffré d'un 409 `E2EE_PARTICIPANT_WITHOUT_DEVICE` (bascule, #20073), à la racine, lus en
     * tolérance par `EndToEndParticipantWithoutDevice.userIdsFrom` (#20182).
     */
    val withoutDeviceUserIds: JsonElement? = null,
    /**
     * La raison machine d'un refus, à la racine (`FLAME_PAUSE_NOT_ALLOWED` → `quarterly-limit`, #20511). Lue en
     * tolérance : une valeur qui n'est pas une chaîne n'emporte pas le refus.
     */
    val reason: JsonElement? = null,
    /** La pagination par curseur des routes qui ne passent pas par `sendSuccess` (`messages/search`), à la racine. */
    val cursorPagination: CursorPagination? = null,
    /**
     * Le compte des notifications non lues que `GET /notifications` calcule DANS LA MÊME RÉPONSE que sa page, à la racine
     * (#19048) : le seul compte qui ne s'ordonne pas autrement que la page par rapport à une arrivée en direct.
     */
    val unreadCount: Int? = null,
)

/**
 * One entry of a `400 VALIDATION_ERROR`'s `violations` array.
 *
 * [path] points at the offending input — the gateway writes it either bare
 * (`"email"`) or as a JSON-pointer-ish path (`"/body/email"`), so consumers read
 * its LEAF segment rather than the whole string.
 */
@Serializable
data class ApiViolation(
    val path: String? = null,
    val message: String? = null,
)

@Serializable
data class Pagination(
    val total: Int? = null,
    val offset: Int? = null,
    val limit: Int? = null,
    val hasMore: Boolean = false,
    val nextCursor: String? = null,
) {
    /** Lecture par curseur : l'ancre de la suite (`nextCursor`) et s'il reste des pages. */
    val cursorPage: PaginationCursorView get() = PaginationCursorView(nextCursor, hasMore, limit)

    /** Lecture par offset, ou `null` si la page n'en porte aucun trait (`offset`/`total`). */
    val offsetPage: PaginationOffsetView?
        get() = if (offset == null && total == null) null else PaginationOffsetView(offset, limit, total, hasMore)
}

data class PaginationCursorView(val nextCursor: String?, val hasMore: Boolean, val limit: Int?)

data class PaginationOffsetView(val offset: Int?, val limit: Int?, val total: Int?, val hasMore: Boolean)
