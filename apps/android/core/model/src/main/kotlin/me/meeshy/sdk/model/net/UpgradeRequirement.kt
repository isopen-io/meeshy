package me.meeshy.sdk.model.net

import java.net.URI
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive

/**
 * Ce que la passerelle dit quand ce binaire est sous le plancher de version de sa plateforme (D-5, #13947 ; miroir de
 * `UpgradeRequirement` côté iOS, `AppVersionHeader.swift`). La loi UNIQUE qui lit ce refus, REST comme socket.
 *
 * `minVersion` et `storeUrl` sont étalés **à la racine** du corps 426 par `sendError`
 * (`services/gateway/src/utils/response.ts`), pas nichés sous un `details`. Se tromper de niveau rendrait l'écran muet.
 *
 * Fail-closed : c'est le STATUT (ou le code socket) qui ferme l'application, jamais la qualité du JSON. Un corps illisible
 * rend donc une exigence NUE (`minVersion` vide, pas d'URL) plutôt qu'aucune exigence.
 */
public data class UpgradeRequirement(val minVersion: String, val storeUrl: String?) {

    /** L'URL du store à ouvrir : celle du SERVEUR (qui lit `X-App-Platform`) quand elle est en https, sinon le Play Store. */
    val resolvedStoreUrl: String
        get() = storeUrl?.trim()?.takeIf(::isOpenableStoreUrl) ?: DEFAULT_STORE_URL

    /** La version minimale à dire, ou `null` quand le serveur ne l'a pas donnée (l'écran omet alors la ligne). */
    val shownMinVersion: String?
        get() = minVersion.trim().takeIf { it.isNotEmpty() }

    private val isInformative: Boolean
        get() = shownMinVersion != null || storeUrl != null

    public companion object {
        public const val STATUS: Int = 426
        public const val CODE: String = "UPGRADE_REQUIRED"

        /** `getAppStoreUrl('android')` (`services/gateway/src/utils/appVersion.ts`) : le repli quand le serveur n'a rien servi. */
        public const val DEFAULT_STORE_URL: String = "https://play.google.com/store/apps/details?id=me.meeshy.app"

        private val bare = UpgradeRequirement(minVersion = "", storeUrl = null)

        /** Le corps d'un 426. Jamais `null` : le statut seul déclenche, un corps absent ou illisible rend l'exigence nue. */
        public fun fromResponseBody(raw: String?): UpgradeRequirement =
            raw?.let(::parseObject)?.let(::fromFields) ?: bare

        /** La charge de l'événement socket `error` : seul le code [CODE] déclenche, tout autre `error` rend `null`. */
        public fun fromSocketPayload(raw: String): UpgradeRequirement? {
            val fields = parseObject(raw) ?: return null
            return if (text(fields, "code") == CODE) fromFields(fields) else null
        }

        /** Une exigence qui dit quelque chose n'est jamais écrasée par une exigence nue (ni par une seconde, identique en droit). */
        public fun preferred(current: UpgradeRequirement?, incoming: UpgradeRequirement): UpgradeRequirement =
            current?.takeIf { it.isInformative } ?: incoming

        private fun fromFields(fields: JsonObject): UpgradeRequirement =
            UpgradeRequirement(minVersion = text(fields, "minVersion").orEmpty(), storeUrl = text(fields, "storeUrl"))

        private fun parseObject(raw: String): JsonObject? =
            runCatching { Json.parseToJsonElement(raw) as? JsonObject }.getOrNull()

        private fun text(fields: JsonObject, key: String): String? =
            (fields[key] as? JsonPrimitive)?.takeIf { it.isString }?.content

        private fun isOpenableStoreUrl(candidate: String): Boolean {
            val uri = runCatching { URI(candidate) }.getOrNull() ?: return false
            return uri.scheme.equals("https", ignoreCase = true) && !uri.host.isNullOrEmpty()
        }
    }
}
