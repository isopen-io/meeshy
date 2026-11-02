package me.meeshy.sdk.model.game

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json

/**
 * LA GÉOMÉTRIE DE LA MEESH (épopée § 6, #11176, Android #13892) — le décodeur de
 * `packages/shared/design/meesh-coin.json`, la seule source des coordonnées de la pièce (repère 120 × 120, origine en
 * haut à gauche, angles en degrés dans le sens horaire depuis 3 h). Miroir de `MeeshCoinGeometry` (iOS) et de
 * `apps/web/src/lib/game/coin-geometry.ts`.
 *
 * L'APK ne lit pas un fichier hors de son module : [shared] en porte la valeur, et `MeeshCoinGeometryTest` DÉCODE le
 * fichier partagé par ce même type ([decode]) et exige qu'il soit égal, champ pour champ, à [shared]. Une coordonnée
 * changée d'un seul côté rougit le témoin. Les couleurs n'y sont pas : chaque matière nomme une peinture ([Paint]).
 */
@Serializable
public data class MeeshCoinGeometry(
    val frame: Double,
    val center: Double,
    val body: Body,
    val field: Fields,
    val inscription: Inscription,
    val signature: Signature,
    val year: Year,
    val number: Number,
    val editions: Editions,
    val decor: MeeshCoinDecorGeometry,
) {

    @Serializable
    public enum class Paint {
        @SerialName("coin-silver") CoinSilver,
        @SerialName("coin-gold") CoinGold,
        @SerialName("prism") Prism,
        @SerialName("coin-silver-in") CoinSilverIn,
        @SerialName("coin-gold-in") CoinGoldIn,
        @SerialName("coin-diamond-in") CoinDiamondIn,
        ;

        /** Le creux (le champ) prend la lumière à contre-sens du métal. */
        public val isHollow: Boolean get() = this == CoinSilverIn || this == CoinGoldIn || this == CoinDiamondIn
    }

    /** La tranche cannelée : gris de tranche (argent), encre de l'or (or), spectre à contre-sens (prisme). */
    @Serializable
    public enum class Flute { @SerialName("rim") Rim, @SerialName("ink") Ink, @SerialName("iris") Iris }

    @Serializable
    public enum class Separator { @SerialName("dot") Dot, @SerialName("star") Star }

    @Serializable
    public enum class Decor {
        @SerialName("veins") Veins,
        @SerialName("beads") Beads,
        @SerialName("rosette") Rosette,
        @SerialName("stars") Stars,
        @SerialName("laurels") Laurels,
        @SerialName("iris") Iris,
        @SerialName("cabochons") Cabochons,
        @SerialName("sunburst") Sunburst,
        @SerialName("crown") Crown,
        @SerialName("sparkles") Sparkles,
    }

    @Serializable
    public data class Body(val radius: Double, val flute: FluteRing)

    @Serializable
    public data class FluteRing(val radius: Double, val width: Double, val dash: List<Double>)

    @Serializable
    public data class Field(val radius: Double, val stroke: Double)

    @Serializable
    public data class Fields(val obverse: Field, val reverse: Field)

    @Serializable
    public data class Inscription(
        val text: String,
        @SerialName("repeat") val repetitions: Int,
        val separator: String,
        val radius: Double,
        val startDeg: Double,
        val fontSize: Double,
    )

    @Serializable
    public data class Signature(val size: Double, val strokeWidth: Double)

    @Serializable
    public data class Year(val y: Double, val fontSize: Double, val letterSpacing: Double)

    /** « Nº » : le N, le o en exposant SOULIGNÉ, puis le nombre plus petit, redescendu sur la ligne de base. */
    @Serializable
    public data class Number(
        val y: Double,
        val sign: String,
        val ordinal: String,
        val signSize: Double,
        val ordinalSize: Double,
        val ordinalRise: Double,
        val valueSize: Double,
        val valueGap: Double,
    )

    @Serializable
    public data class Bird(val bird: GameEngravedBird, val x: Double, val y: Double, val scale: Double, val flip: Boolean)

    @Serializable
    public data class Sides(val obverse: List<Decor>, val reverse: List<Decor>)

    @Serializable
    public data class Edition(
        val metal: Paint,
        val flute: Flute,
        val field: Paint,
        val separator: Separator,
        val birds: List<Bird>,
        val decor: Sides,
    )

    @Serializable
    public data class Editions(val silver: Edition, val gold: Edition, val prism: Edition)

    public fun edition(edition: MeeshEdition): Edition = when (edition) {
        MeeshEdition.Silver -> editions.silver
        MeeshEdition.Gold -> editions.gold
        MeeshEdition.Prism -> editions.prism
    }

    public companion object {

        private val json = Json { ignoreUnknownKeys = true }

        /** Décode le contenu de `meesh-coin.json` (les clés `$doc` sont de la prose, ignorées). */
        public fun decode(text: String): MeeshCoinGeometry = json.decodeFromString(serializer(), text)

        /** La valeur de `packages/shared/design/meesh-coin.json`, recopiée — le témoin la compare au fichier. */
        public val shared: MeeshCoinGeometry = MeeshCoinGeometry(
            frame = 120.0,
            center = 60.0,
            body = Body(radius = 57.0, flute = FluteRing(radius = 53.0, width = 1.4, dash = listOf(1.4, 2.0))),
            field = Fields(obverse = Field(radius = 35.0, stroke = 1.6), reverse = Field(radius = 45.0, stroke = 1.4)),
            inscription = Inscription(
                text = "MEESHY · 1 MEESH · ", repetitions = 2, separator = "·", radius = 45.0, startDeg = 180.0,
                fontSize = 8.4,
            ),
            signature = Signature(size = 66.0, strokeWidth = 100.0),
            year = Year(y = 27.0, fontSize = 8.0, letterSpacing = 2.0),
            number = Number(
                y = 97.0, sign = "N", ordinal = "o", signSize = 12.0, ordinalSize = 6.6, ordinalRise = 4.6,
                valueSize = 8.0, valueGap = 1.4,
            ),
            editions = Editions(
                silver = Edition(
                    metal = Paint.CoinSilver, flute = Flute.Rim, field = Paint.CoinSilverIn, separator = Separator.Dot,
                    birds = listOf(Bird(GameEngravedBird.MeeJoy, x = 35.0, y = 31.0, scale = 0.36, flip = false)),
                    decor = Sides(obverse = listOf(Decor.Veins), reverse = listOf(Decor.Veins)),
                ),
                gold = Edition(
                    metal = Paint.CoinGold, flute = Flute.Ink, field = Paint.CoinGoldIn, separator = Separator.Star,
                    birds = listOf(Bird(GameEngravedBird.MeoOpen, x = 35.0, y = 31.0, scale = 0.36, flip = false)),
                    decor = Sides(
                        obverse = listOf(Decor.Beads, Decor.Rosette, Decor.Stars),
                        reverse = listOf(Decor.Beads, Decor.Rosette, Decor.Laurels),
                    ),
                ),
                prism = Edition(
                    metal = Paint.Prism, flute = Flute.Iris, field = Paint.CoinDiamondIn, separator = Separator.Dot,
                    birds = listOf(
                        Bird(GameEngravedBird.MeeJoy, x = 13.0, y = 33.0, scale = 0.34, flip = false),
                        Bird(GameEngravedBird.MeoOpen, x = 107.0, y = 33.0, scale = 0.34, flip = true),
                    ),
                    decor = Sides(
                        obverse = listOf(Decor.Iris, Decor.Beads, Decor.Cabochons, Decor.Sunburst, Decor.Sparkles),
                        reverse = listOf(
                            Decor.Iris, Decor.Beads, Decor.Cabochons, Decor.Sunburst, Decor.Crown, Decor.Sparkles,
                        ),
                    ),
                ),
            ),
            decor = MeeshCoinDecorGeometry.shared,
        )
    }
}

/** Le nom d'une figure gravée au revers, celui que la géométrie partagée écrit (`editions.*.birds[].bird`). */
@Serializable
public enum class GameEngravedBird { @SerialName("meeJoy") MeeJoy, @SerialName("meoOpen") MeoOpen }
