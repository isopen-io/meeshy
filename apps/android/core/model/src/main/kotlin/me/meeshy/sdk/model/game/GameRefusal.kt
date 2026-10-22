package me.meeshy.sdk.model.game

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/**
 * Le corps d'un refus 409 du jeu. Les champs de détail partent à la RACINE, à
 * côté de `code` (jamais dans `details`) :
 *  - `MINT_BLOCKED_BY_DEBT` : [sparksDebt] ;
 *  - `PRICE_CHANGED` : [priceChanged] (le prix COURANT à montrer et reconfirmer) ;
 *  - `TREASURY_LOCKED` : [treasuryLocked].
 *
 * Tolérant : un corps illisible rend `null`, un code inconnu rend [code] `null`
 * (le code brut reste dans [rawCode]), un détail illisible se tait.
 */
public data class GameRefusal(
    val code: GameErrorCode?,
    val rawCode: String?,
    val sparksDebt: Int? = null,
    val priceChanged: PriceChanged? = null,
    val treasuryLocked: TreasuryLocked? = null,
) {
    public data class PriceChanged(val number: Int, val price: Int, val basePrice: Int, val costFactor: Double)

    public data class TreasuryLocked(val tier: TreasuryTierKey, val minHeld: Int, val requires: RankRequirement)

    public companion object {
        public fun parse(body: String?): GameRefusal? {
            if (body.isNullOrBlank()) return null
            val root = runCatching { Json.parseToJsonElement(body) }.getOrNull() as? JsonObject ?: return null
            return parse(root)
        }

        public fun parse(root: JsonElement?): GameRefusal? {
            val obj = root as? JsonObject ?: return null
            val raw = obj.optString("code")
            val code = GameErrorCode.fromWire(raw)
            return GameRefusal(
                code = code,
                rawCode = raw,
                sparksDebt = obj.optCount("sparksDebt"),
                priceChanged = if (code == GameErrorCode.PriceChanged) parsePriceChanged(obj) else null,
                treasuryLocked = if (code == GameErrorCode.TreasuryLocked) parseTreasuryLocked(obj) else null,
            )
        }

        private fun parsePriceChanged(obj: JsonObject): PriceChanged? = runCatching {
            PriceChanged(
                number = obj.reqInt("number"),
                price = obj.reqInt("price"),
                basePrice = obj.reqInt("basePrice"),
                costFactor = obj.reqDouble("costFactor"),
            )
        }.getOrNull()

        private fun parseTreasuryLocked(obj: JsonObject): TreasuryLocked? = runCatching {
            TreasuryLocked(
                tier = enumFromWire<TreasuryTierKey>(obj.reqString("tier")) ?: error("tier"),
                minHeld = obj.reqInt("minHeld"),
                requires = parseRankRequirement(obj.reqObject("requires")),
            )
        }.getOrNull()
    }
}
