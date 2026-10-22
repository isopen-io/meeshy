@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * Les écritures du Jeu Meeshy (#9378) : requêtes et réponses des cinq écritures
 * du lot 1 (changer une mission, ouvrir le coffre, acheter un gel, rallumer la
 * Flamme, marquer le guide vu) et de la frappe. MIROIR de
 * `packages/shared/types/game.ts` et de `GameWriteModels.swift` (iOS).
 *
 * Toute requête porte un `requestId` généré UNE fois par INTENTION (jamais par
 * requête) : rejouer une écriture rend son résultat, jamais une seconde écriture.
 *
 * Les `status` restent des CHAÎNES et tout compte annexe est tolérant : un statut
 * ajouté par le serveur, ou un champ absent, ne doit pas faire échouer le
 * décodage d'une écriture DÉJÀ faite (l'utilisateur verrait une erreur sur un
 * geste qui a réussi). `alreadyDone` lit le préfixe commun `already-`.
 */

/** Le corps commun : l'identifiant d'idempotence (8 à 64 caractères). */
@Serializable
public data class GameWriteRequest(val requestId: String)

@Serializable
public data class GuideSeenRequest(
    val requestId: String,
    /** 1 à 32 clés de 64 caractères au plus. */
    val keys: List<String>,
)

/**
 * Le corps de la frappe. [maxPrice] est la garde de prix (#10903) : le prix que
 * l'écran a montré, au-delà duquel la passerelle refuse en `PRICE_CHANGED`.
 * Absent, il n'est pas envoyé (ancien comportement).
 */
@Serializable
public data class MeeshMintRequest(
    val requestId: String,
    val payWith: String? = null,
    val maxPrice: Int? = null,
)

@Serializable
public data class MissionRerollResponse(
    val mission: GameMission,
    @EncodeDefault val balance: Long? = null,
)

@Serializable
public data class ChestClaimResponse(
    /** `claimed` | `already-claimed`. */
    val status: String,
    val reward: DailyChest,
    /** Le score en poche après le crédit. */
    @EncodeDefault val score: Long? = null,
    /** Les fragments d'étoile collectés après l'ouverture — `null` devant un serveur antérieur. */
    @EncodeDefault val starFragments: StarFragmentsTotal? = null,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY_PREFIX)
}

@Serializable
public data class FlameFreezeResponse(
    /** `bought` | `already-bought`. */
    val status: String,
    @EncodeDefault val freezes: Int? = null,
    @EncodeDefault val balance: Long? = null,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY_PREFIX)
}

@Serializable
public data class FlameRelightResponse(
    /** `relit` | `already-relit`. */
    val status: String,
    @EncodeDefault val streak: Int? = null,
    @EncodeDefault val balance: Long? = null,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY_PREFIX)
}

@Serializable
public data class GuideSeenResponse(val guideSeen: List<String> = emptyList())

/**
 * La réponse de `POST /me/meesh/mint`. [edition] vaut `null` quand le serveur en
 * sert une inconnue : la frappe DÉJÀ faite se lit quand même.
 */
@Serializable
public data class MeeshMintResponse(
    /** `minted` | `already-minted`. */
    val status: String,
    @EncodeDefault val balance: Long? = null,
    @EncodeDefault val mintedLifetime: Long? = null,
    /** Le numéro gravé sur la pièce. */
    @EncodeDefault val number: Int? = null,
    @EncodeDefault val edition: MeeshEdition? = null,
    /** Le prix débité, en points. */
    @EncodeDefault val price: Int? = null,
    @EncodeDefault val gloryGained: Int? = null,
    @EncodeDefault val levelBefore: Int? = null,
    @EncodeDefault val levelAfter: Int? = null,
    @EncodeDefault val ladder: GameMintResultLadder? = null,
    @EncodeDefault val basePrice: Int? = null,
    @EncodeDefault val costFactor: Double? = null,
    /** Le marqueur d'ordre de l'état servi (#10900). */
    @EncodeDefault val gameRevision: Int? = null,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY_PREFIX)
}

@Serializable
public data class GameMintResultLadder(val levelBefore: Int, val levelAfter: Int)

private const val ALREADY_PREFIX = "already-"

/**
 * Lecture tolérante des réponses d'écriture. `null` seulement quand la charge
 * n'est pas un objet ou quand son cœur manque (la mission, la récompense) —
 * jamais pour un compte annexe absent. Accepte l'enveloppe `{ success, data }`
 * comme la charge nue.
 */
public object GameWriteParser {

    public fun rerollMission(text: String?): MissionRerollResponse? = read(text) { obj ->
        MissionRerollResponse(
            mission = parseMission(obj.reqObject("mission")),
            balance = obj.optCountLong("balance"),
        )
    }

    public fun claimChest(text: String?): ChestClaimResponse? = read(text) { obj ->
        ChestClaimResponse(
            status = obj.optString("status").orEmpty(),
            reward = parseDailyChest(obj.reqObject("reward")),
            score = obj.optCountLong("score"),
            starFragments = obj.lenient("starFragments", ::parseStarFragments),
        )
    }

    public fun buyFlameFreeze(text: String?): FlameFreezeResponse? = read(text) { obj ->
        FlameFreezeResponse(
            status = obj.optString("status").orEmpty(),
            freezes = obj.optCount("freezes"),
            balance = obj.optCountLong("balance"),
        )
    }

    public fun relightFlame(text: String?): FlameRelightResponse? = read(text) { obj ->
        FlameRelightResponse(
            status = obj.optString("status").orEmpty(),
            streak = obj.optCount("streak"),
            balance = obj.optCountLong("balance"),
        )
    }

    public fun markGuideSeen(text: String?): GuideSeenResponse? = read(text) { obj ->
        GuideSeenResponse(guideSeen = (obj["guideSeen"] as? JsonArray)?.let(::stringsOrEmpty).orEmpty())
    }

    public fun mint(text: String?): MeeshMintResponse? = read(text) { obj ->
        MeeshMintResponse(
            status = obj.optString("status").orEmpty(),
            balance = obj.optCountLong("balance"),
            mintedLifetime = obj.optCountLong("mintedLifetime"),
            number = obj.optCount("number"),
            edition = enumFromWire<MeeshEdition>(obj.optString("edition")),
            price = obj.optCount("price"),
            gloryGained = obj.optCount("gloryGained"),
            levelBefore = obj.optCount("levelBefore"),
            levelAfter = obj.optCount("levelAfter"),
            ladder = obj.lenient("ladder") { l ->
                GameMintResultLadder(l.reqInt("levelBefore"), l.reqInt("levelAfter"))
            },
            basePrice = obj.optCount("basePrice"),
            costFactor = obj.optDouble("costFactor"),
            gameRevision = obj.optCount("gameRevision"),
        )
    }

    private fun stringsOrEmpty(array: JsonArray): List<String> = try {
        array.strings("guideSeen")
    } catch (_: GameParseException) {
        emptyList()
    }

    private fun <T> read(text: String?, build: (JsonObject) -> T): T? {
        if (text.isNullOrBlank()) return null
        val element: JsonElement = try {
            Json.parseToJsonElement(text)
        } catch (_: Exception) {
            return null
        }
        val root = element as? JsonObject ?: return null
        val payload = (root["data"] as? JsonObject)?.takeIf { root["success"] != null } ?: root
        return try {
            build(payload)
        } catch (_: GameParseException) {
            null
        } catch (_: IllegalArgumentException) {
            null
        }
    }
}
