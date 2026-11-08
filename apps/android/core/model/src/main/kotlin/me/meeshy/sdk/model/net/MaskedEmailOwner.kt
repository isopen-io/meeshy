package me.meeshy.sdk.model.net

import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull

/**
 * Le détenteur MASQUÉ d'une adresse déjà prise (`EMAIL_TAKEN`, #8214) — miroir de `APIRejection.EmailOwner` (iOS).
 * L'écran peut demander « Est-ce vous ? » sans rien révéler de plus : le nom et le pseudo arrivent déjà masqués.
 */
public data class MaskedEmailOwner(
    val maskedDisplayName: String,
    val maskedUsername: String,
    val avatar: String? = null,
) {
    public companion object {
        /**
         * Lecture TOLÉRANTE : un détenteur mal formé vaut `null` et n'emporte pas tout le refus (`EMAIL_TAKEN`
         * redeviendrait sinon une erreur générique).
         */
        public fun from(element: JsonElement?): MaskedEmailOwner? {
            val owner = element as? JsonObject ?: return null
            val name = owner.text("maskedDisplayName") ?: return null
            val username = owner.text("maskedUsername") ?: return null
            return MaskedEmailOwner(name, username, owner.text("avatar"))
        }

        private fun JsonObject.text(key: String): String? =
            (this[key] as? JsonPrimitive)?.takeIf { it !is JsonNull && it.isString }?.contentOrNull
    }
}
