package me.meeshy.sdk.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

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
)
