package me.meeshy.sdk.model.game

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject

/*
 * Les réponses des écritures et des lectures de la vague 2. MIROIR de
 * `GameWave2Models.swift` (iOS).
 *
 * Les `status` restent des CHAÎNES, comme au premier lot : un statut ajouté par le
 * serveur ne doit pas faire échouer le décodage d'une écriture DÉJÀ faite.
 * `alreadyDone` lit le préfixe commun `already-`.
 */

private const val ALREADY = "already-"

public data class LeagueConsentResponse(val consent: Boolean, val pseudonym: String?)

public data class LeaguePseudonymResponse(val pseudonym: String)

/** Un joueur de la ligue PUBLIQUE : aucun identifiant, aucune présence. */
public data class LeagueWeekEntry(
    val rank: Int,
    val displayName: String,
    val weekPoints: Int,
    val zone: LeagueZone,
    val cup: LeagueCup?,
    val isMe: Boolean,
)

public data class LeagueWeekResponse(
    val weekKey: String,
    /** Le jour de l'instantané : les AUTRES membres sont servis figés — seule la ligne `isMe` est en direct. */
    val snapshotDay: String,
    val closes: LeagueCloses,
    /** `false` : consenti, mais pas encore placé dans un groupe. */
    val placed: Boolean,
    val league: LeagueKey?,
    val groupId: String?,
    val entries: List<LeagueWeekEntry>,
)

public data class LeagueFriendsEntry(val rank: Int, val userId: String, val weekPoints: Int, val isMe: Boolean)

public data class LeagueFriendsResponse(
    val weekKey: String,
    val closes: LeagueCloses,
    val entries: List<LeagueFriendsEntry>,
)

public data class DuoInviteResponse(
    /** `invited` | `already-invited`. */
    val status: String,
    val duoId: String,
    val weekKey: String,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY)
}

public data class DuoStatusResponse(
    /** `active` | `already-active` pour accepter ; `abandoned` | `already-abandoned` pour quitter. */
    val status: String,
    val duoId: String,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY)
}

public data class SeasonSeal(val cosmeticKey: String)

public data class SeasonClaimResponse(
    /** `claimed` | `already-claimed`. */
    val status: String,
    val step: Int,
    val reward: SeasonRewardBlock,
    /** Le cosmétique de la rangée Sceau, quand elle est possédée et que l'étape en porte un. */
    val seal: SeasonSeal?,
    /** `true` quand cette étape termine le parcours. */
    val completed: Boolean,
    val gloryGained: Int,
    /** Le score en poche après le crédit. */
    val score: Int,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY)
}

public data class SeasonSealResponse(
    /** `bought` | `already-bought`. */
    val status: String,
    val balance: Int,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY)
}

public data class ShowcaseOrderResponse(val order: List<String>)

public data class ShowcaseVisibilityResponse(val visibility: GameVisibility)

/** Un trophée vu par un VISITEUR : le mois d'obtention, jamais l'horodatage. */
public data class GameVisitorTrophyItem(
    val key: String,
    val awardedMonth: String,
    /** Combien de coupes identiques ce mois réunit ; absent pour un trophée unique. */
    val count: Int? = null,
)

/** Les étoiles allumées d'un autre membre (#10053). */
public data class ShowcaseConstellation(val stars: Int)

public data class UserShowcaseResponse(
    /** `false` : le réglage du membre ferme la vitrine à ce lecteur — jamais une erreur. */
    val visible: Boolean,
    val items: List<GameVisitorTrophyItem>,
    val order: List<String>,
    val constellation: ShowcaseConstellation? = null,
)

public data class GamePrivacyResponse(val gameHidden: Boolean, val friendsLeagueOptOut: Boolean)

public data class PrestigeResponse(
    /** `passed` | `already-passed`. */
    val status: String,
    val prestige: Int,
    /** Le score en poche et le niveau repartent de zéro et de 1. */
    val score: Int,
    val level: Int,
    val gloryGained: Int,
    val trophyKey: String,
) {
    val alreadyDone: Boolean get() = status.startsWith(ALREADY)
}

/**
 * Lecture des réponses de la vague 2. `null` quand la charge n'est pas un objet
 * ou quand son cœur manque — jamais d'exception. Accepte l'enveloppe
 * `{ success, data }` comme la charge nue.
 */
public object GameWave2Parser {

    public fun consent(text: String?): LeagueConsentResponse? = read(text) {
        LeagueConsentResponse(consent = it.reqBool("consent"), pseudonym = it.optString("pseudonym"))
    }

    public fun pseudonym(text: String?): LeaguePseudonymResponse? = read(text) {
        LeaguePseudonymResponse(it.reqString("pseudonym"))
    }

    public fun leagueWeek(text: String?): LeagueWeekResponse? = read(text) { obj ->
        LeagueWeekResponse(
            weekKey = obj.reqString("weekKey"),
            snapshotDay = obj.reqString("snapshotDay"),
            closes = parseLeagueCloses(obj.reqObject("closes")),
            placed = obj.reqBool("placed"),
            league = obj.nullableEnum<LeagueKey>("league"),
            groupId = obj.nullableString("groupId"),
            entries = obj.reqArray("entries").map { element ->
                val entry = element as? JsonObject ?: throw GameParseException("entries")
                LeagueWeekEntry(
                    rank = entry.reqInt("rank"),
                    displayName = entry.reqString("displayName"),
                    weekPoints = entry.reqInt("weekPoints"),
                    zone = entry.reqEnum("zone"),
                    cup = entry.nullableEnum<LeagueCup>("cup"),
                    isMe = entry.reqBool("isMe"),
                )
            },
        )
    }

    public fun leagueFriends(text: String?): LeagueFriendsResponse? = read(text) { obj ->
        LeagueFriendsResponse(
            weekKey = obj.reqString("weekKey"),
            closes = parseLeagueCloses(obj.reqObject("closes")),
            entries = obj.reqArray("entries").map { element ->
                val entry = element as? JsonObject ?: throw GameParseException("entries")
                LeagueFriendsEntry(
                    rank = entry.reqInt("rank"),
                    userId = entry.reqString("userId"),
                    weekPoints = entry.reqInt("weekPoints"),
                    isMe = entry.reqBool("isMe"),
                )
            },
        )
    }

    public fun duoInvite(text: String?): DuoInviteResponse? = read(text) {
        DuoInviteResponse(
            status = it.optString("status").orEmpty(),
            duoId = it.reqString("duoId"),
            weekKey = it.reqString("weekKey"),
        )
    }

    public fun duoStatus(text: String?): DuoStatusResponse? = read(text) {
        DuoStatusResponse(status = it.optString("status").orEmpty(), duoId = it.reqString("duoId"))
    }

    public fun seasonClaim(text: String?): SeasonClaimResponse? = read(text) { obj ->
        SeasonClaimResponse(
            status = obj.optString("status").orEmpty(),
            step = obj.reqInt("step"),
            reward = parseSeasonReward(obj.reqObject("reward")),
            seal = obj.lenient("seal") { SeasonSeal(it.reqString("cosmeticKey")) },
            completed = obj.optBool("completed") ?: false,
            gloryGained = obj.optCount("gloryGained") ?: 0,
            score = obj.optCount("score") ?: 0,
        )
    }

    public fun seasonSeal(text: String?): SeasonSealResponse? = read(text) {
        SeasonSealResponse(status = it.optString("status").orEmpty(), balance = it.optCount("balance") ?: 0)
    }

    public fun showcaseOrder(text: String?): ShowcaseOrderResponse? = read(text) {
        ShowcaseOrderResponse(it.reqArray("order").strings("order"))
    }

    public fun showcaseVisibility(text: String?): ShowcaseVisibilityResponse? = read(text) {
        ShowcaseVisibilityResponse(parseVisibility(it.reqObject("visibility")))
    }

    public fun userShowcase(text: String?): UserShowcaseResponse? = read(text) { obj ->
        UserShowcaseResponse(
            visible = obj.reqBool("visible"),
            items = obj.reqArray("items").map { element ->
                val item = element as? JsonObject ?: throw GameParseException("items")
                GameVisitorTrophyItem(
                    key = item.reqString("key"),
                    awardedMonth = item.reqString("awardedMonth"),
                    count = item.optInt("count"),
                )
            },
            order = obj.reqArray("order").strings("order"),
            constellation = obj.lenient("constellation") { ShowcaseConstellation(it.reqInt("stars")) },
        )
    }

    public fun privacy(text: String?): GamePrivacyResponse? = read(text) {
        GamePrivacyResponse(gameHidden = it.reqBool("gameHidden"), friendsLeagueOptOut = it.reqBool("friendsLeagueOptOut"))
    }

    public fun prestige(text: String?): PrestigeResponse? = read(text) {
        PrestigeResponse(
            status = it.optString("status").orEmpty(),
            prestige = it.reqInt("prestige"),
            score = it.optCount("score") ?: 0,
            level = it.optCount("level") ?: 1,
            gloryGained = it.optCount("gloryGained") ?: 0,
            trophyKey = it.reqString("trophyKey"),
        )
    }
}

/** Le déballage commun : enveloppe `{ success, data }` ou charge nue ; jamais d'exception. */
internal fun <T> readGamePayload(text: String?, build: (JsonObject) -> T): T? {
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
    } catch (_: IllegalArgumentException) {
        null
    }
}

private fun <T> read(text: String?, build: (JsonObject) -> T): T? = readGamePayload(text, build)
