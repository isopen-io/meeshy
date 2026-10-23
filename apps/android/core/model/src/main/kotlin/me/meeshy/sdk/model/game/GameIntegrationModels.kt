@file:OptIn(ExperimentalSerializationApi::class)

package me.meeshy.sdk.model.game

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * Les lectures d'intégration du Jeu Meeshy (#9481, #9489) : `GET /me/game/privacy`
 * (l'ÉTAT des réglages) et `GET /users/:userId/game` (ce qu'un lecteur apprend du jeu
 * d'un AUTRE membre). MIROIR de `GameIntegrationModels.swift` (iOS) et de
 * `packages/shared/types/game-v2.ts`.
 *
 * Jamais un compte exact d'un autre : le niveau et son palier, les étoiles, la FORME de
 * la Flamme (jamais ses jours), le rang et sa division, le PALIER du trésor (jamais les
 * Meeshes). Ni date, ni présence. Un refus (réglage, blocage, « Jeu masqué », compte
 * inconnu) rend EXACTEMENT `visible: false` et deux blocs nuls.
 *
 * Chaque bloc se lit SEUL : un palier ou une forme de Flamme ajoutés par le serveur
 * avant la mise à jour de l'app font tomber CE bloc, jamais la réponse entière.
 */

private const val MAX_PRESTIGE = 5

/** `GET /me/game/privacy` : les deux interrupteurs et les quatre visibilités. */
@Serializable
public data class GameSettingsResponse(
    val gameHidden: Boolean,
    val friendsLeagueOptOut: Boolean,
    val visibility: GameVisibility,
)

/** Le niveau et le palier d'un autre membre, ouverts par le rang (#9688). */
@Serializable
public data class GameStandingLadder(
    val level: Int,
    val tier: LevelTierKey,
    /** Le niveau max à vie (#10846) — `null` devant un serveur antérieur. */
    @EncodeDefault val levelMaxLifetime: Int? = null,
)

/** Ce que le jeu d'un autre montre de son niveau et de son rang (réglage `rank`). */
@Serializable
public data class GameStanding(
    val level: Int,
    val tier: LevelTierKey,
    /** Les étoiles de Prestige, de 0 à 5. */
    val prestige: Int,
    /** La FORME de la Flamme, jamais ses jours. `null` : pas de Flamme allumée, ou une forme inconnue. */
    @EncodeDefault val flame: FlameFormKey? = null,
    val rank: GloryRank,
    /** Projection héritée (1–3), `null` pour Mythe. */
    @EncodeDefault val division: Int? = null,
    /** V (5) à I (1) — absente d'un ancien serveur (#9636). */
    @EncodeDefault val division5: Int? = null,
    /** La place du Mythe et son émission (#9636). */
    @EncodeDefault val mythic: MythicSeatRef? = null,
    /** Le niveau et le palier ouverts par le rang (#9688). */
    @EncodeDefault val ladder: GameStandingLadder? = null,
    /** Ses points — servis à soi, à ses amis et aux administrateurs seulement (#9541). */
    @EncodeDefault val points: Int? = null,
    @EncodeDefault val levelMaxLifetime: Int? = null,
    @EncodeDefault val sparks: Int? = null,
    @EncodeDefault val sparksLifetime: Int? = null,
    @EncodeDefault val glory: Int? = null,
) {
    /** Le niveau que l'écran montre : celui ouvert par le rang, ou celui d'hier devant un serveur antérieur. */
    val shownLevel: Int get() = ladder?.level ?: level

    /** Le palier que l'écran montre. */
    val shownTier: LevelTierKey get() = ladder?.tier ?: tier

    /** La division à montrer : `division5` servie, sinon la division héritée relue (ancien serveur). */
    val shownDivision: Int? get() = division5 ?: division
}

/** Ce que le jeu d'un autre montre de son trésor (réglage `treasury`) : un PALIER, jamais les Meeshes. */
@Serializable
public data class GameShownTreasury(@EncodeDefault val tier: TreasuryTierKey? = null)

/** `GET /users/:userId/game`. */
@Serializable
public data class UserGameProfileResponse(
    val visible: Boolean,
    @EncodeDefault val standing: GameStanding? = null,
    @EncodeDefault val treasury: GameShownTreasury? = null,
) {
    /** `true` quand il y a quelque chose à MONTRER : un refus, ou deux blocs que ce client ne lit pas, ne dessine rien. */
    val hasSomethingToShow: Boolean get() = visible && (standing != null || treasury?.tier != null)

    public companion object {
        /** La réponse d'un refus — et de tout compte inconnu. */
        public val HIDDEN: UserGameProfileResponse = UserGameProfileResponse(visible = false)
    }
}

/** Lecture tolérante des deux lectures d'intégration. */
public object GameIntegrationParser {

    public fun settings(text: String?): GameSettingsResponse? = readGamePayload(text) {
        GameSettingsResponse(
            gameHidden = it.reqBool("gameHidden"),
            friendsLeagueOptOut = it.reqBool("friendsLeagueOptOut"),
            visibility = parseVisibility(it.reqObject("visibility")),
        )
    }

    public fun userGame(text: String?): UserGameProfileResponse? = readGamePayload(text) {
        UserGameProfileResponse(
            visible = it.reqBool("visible"),
            standing = it.lenient("standing", ::parseStanding),
            treasury = it.lenient("treasury") { t -> GameShownTreasury(tier = lenientTier(t)) },
        )
    }

    private fun lenientTier(obj: JsonObject): TreasuryTierKey? = enumFromWire<TreasuryTierKey>(obj.optString("tier"))

    private fun parseStanding(obj: JsonObject): GameStanding = GameStanding(
        level = obj.reqInt("level"),
        tier = obj.reqEnum("tier"),
        prestige = obj.reqInt("prestige").coerceIn(0, MAX_PRESTIGE),
        flame = enumFromWire<FlameFormKey>(obj.optString("flame")),
        rank = obj.reqEnum("rank"),
        division = obj.optInt("division")?.takeIf { it in 1..3 },
        division5 = obj.optInt("division5")?.takeIf { it in 1..5 },
        mythic = obj.lenient("mythic") { MythicSeatRef(it.reqInt("number"), it.reqInt("edition")) }?.takeIf { it.isValid },
        ladder = obj.lenient("ladder") {
            GameStandingLadder(
                level = it.reqInt("level"),
                tier = it.reqEnum("tier"),
                levelMaxLifetime = it.optCount("levelMaxLifetime"),
            )
        },
        points = obj.optInt("points")?.takeIf { it >= 0 },
        levelMaxLifetime = obj.optCount("levelMaxLifetime"),
        sparks = obj.optCount("sparks"),
        sparksLifetime = obj.optCount("sparksLifetime"),
        glory = obj.optCount("glory"),
    )
}
