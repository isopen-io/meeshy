package me.meeshy.sdk.model.game

import kotlin.math.ceil
import kotlin.math.max

/**
 * Ce que le jeu DIT, sous forme de descripteurs [GameText]. MIROIR de
 * `GameCopy` (iOS) et de `apps/web/src/lib/view/game-copy.ts` : la loi choisit la
 * clé et les arguments, l'écran habille dans la langue de l'interface.
 */
public object GameCopyLaws {

    // Les compteurs

    /** « 976 étincelles » — une clé plurielle : la langue dit ses formes. */
    public fun points(count: Int): GameText = GameText.of(GameTextKey.SparksCount, GameTextArg.Count(count))

    public fun convertiblePoints(count: Int): GameText =
        GameText.of(GameTextKey.SparksConvertibleCount, GameTextArg.Count(count))

    public fun meeshes(count: Int): GameText =
        if (count <= 0) GameText(GameTextKey.MeeshesNone) else GameText.of(GameTextKey.Meeshes, GameTextArg.Count(count))

    public fun days(count: Int): GameText = GameText.of(GameTextKey.Days, GameTextArg.Count(count))

    public fun actions(count: Int): GameText = GameText.of(GameTextKey.Actions, GameTextArg.Count(count))

    public fun levels(count: Int): GameText = GameText.of(GameTextKey.Levels, GameTextArg.Count(count))

    /** « Gloire 1 800 » — une quantité de Gloire. */
    public fun gloryAmount(glory: GameTextArg): GameText = GameText.of(GameTextKey.RankGlory, glory)

    /** « Encore 3 jusqu'au Coffret » — ce qu'il manque au trésor, avec le palier visé. */
    public fun treasuryNext(missing: GameTextArg, tier: TreasuryTierKey): GameText =
        GameText.of(GameTextKey.TreasuryNext, missing, GameTextArg.Nested(treasuryName(tier)))

    /** Avant le niveau 5 : où les missions s'ouvrent, et où l'on en est. */
    public fun missionsLocked(level: Int): GameText =
        GameText.of(GameTextKey.MissionsLocked, GameTextArg.Count(level))

    /** « 624 étincelles jusqu'au niveau 4 ». */
    public fun levelToNext(remaining: Int, nextLevel: Int): GameText =
        GameText.of(GameTextKey.LevelToNext, GameTextArg.Nested(points(remaining)), GameTextArg.Count(nextLevel))

    /** Ce que le lecteur d'écran lit sur l'anneau de niveau. */
    public fun levelRingAccessibility(level: Int, tier: LevelTierKey): GameText = GameText.of(
        GameTextKey.LevelRingA11y,
        GameTextArg.Count(level),
        GameTextArg.Nested(tierName(tier)),
        GameTextArg.Nested(tierOrdinal(tier)),
    )

    // Les noms

    public fun tierName(tier: LevelTierKey): GameText = GameText(
        when (tier) {
            LevelTierKey.Etincelle -> GameTextKey.TierEtincelle
            LevelTierKey.Lueur -> GameTextKey.TierLueur
            LevelTierKey.Lumiere -> GameTextKey.TierLumiere
            LevelTierKey.Eclat -> GameTextKey.TierEclat
            LevelTierKey.Rayon -> GameTextKey.TierRayon
            LevelTierKey.Aurore -> GameTextKey.TierAurore
            LevelTierKey.Comete -> GameTextKey.TierComete
            LevelTierKey.Etoile -> GameTextKey.TierEtoile
            LevelTierKey.Constellation -> GameTextKey.TierConstellation
            LevelTierKey.Galaxie -> GameTextKey.TierGalaxie
            LevelTierKey.Nebuleuse -> GameTextKey.TierNebuleuse
            LevelTierKey.Pulsar -> GameTextKey.TierPulsar
            LevelTierKey.Quasar -> GameTextKey.TierQuasar
            LevelTierKey.Supernova -> GameTextKey.TierSupernova
            LevelTierKey.Magnetar -> GameTextKey.TierMagnetar
            LevelTierKey.Amas -> GameTextKey.TierAmas
            LevelTierKey.Superamas -> GameTextKey.TierSuperamas
            LevelTierKey.Cosmos -> GameTextKey.TierCosmos
            LevelTierKey.Infini -> GameTextKey.TierInfini
            LevelTierKey.Singularite -> GameTextKey.TierSingularite
        },
    )

    /** « quatrième » : le rang du palier, accordé au mot « palier » de la langue. */
    public fun tierOrdinal(tier: LevelTierKey): GameText = GameText(ORDINALS[tier.ordinal])

    private val ORDINALS: List<GameTextKey> = listOf(
        GameTextKey.TierOrdinal1, GameTextKey.TierOrdinal2, GameTextKey.TierOrdinal3, GameTextKey.TierOrdinal4,
        GameTextKey.TierOrdinal5, GameTextKey.TierOrdinal6, GameTextKey.TierOrdinal7, GameTextKey.TierOrdinal8,
        GameTextKey.TierOrdinal9, GameTextKey.TierOrdinal10, GameTextKey.TierOrdinal11, GameTextKey.TierOrdinal12,
        GameTextKey.TierOrdinal13, GameTextKey.TierOrdinal14, GameTextKey.TierOrdinal15, GameTextKey.TierOrdinal16,
        GameTextKey.TierOrdinal17, GameTextKey.TierOrdinal18, GameTextKey.TierOrdinal19, GameTextKey.TierOrdinal20,
    )

    public fun materialName(material: GameMaterial): GameText = GameText(
        when (material) {
            GameMaterial.Copper -> GameTextKey.MaterialCopper
            GameMaterial.Bronze -> GameTextKey.MaterialBronze
            GameMaterial.Silver -> GameTextKey.MaterialSilver
            GameMaterial.Gold -> GameTextKey.MaterialGold
            GameMaterial.Platinum -> GameTextKey.MaterialPlatinum
            GameMaterial.Obsidian -> GameTextKey.MaterialObsidian
            GameMaterial.Prism -> GameTextKey.MaterialPrism
            GameMaterial.Flame -> GameTextKey.MaterialFlame
        },
    )

    public fun rankName(rank: GloryRank): GameText = GameText(
        when (rank) {
            GloryRank.Murmure -> GameTextKey.RankMurmure
            GloryRank.Echo -> GameTextKey.RankEcho
            GloryRank.Voix -> GameTextKey.RankVoix
            GloryRank.Conteur -> GameTextKey.RankConteur
            GloryRank.Passeur -> GameTextKey.RankPasseur
            GloryRank.Polyglotte -> GameTextKey.RankPolyglotte
            GloryRank.Ambassadeur -> GameTextKey.RankAmbassadeur
            GloryRank.Orateur -> GameTextKey.RankOrateur
            GloryRank.Oracle -> GameTextKey.RankOracle
            GloryRank.Legende -> GameTextKey.RankLegende
            GloryRank.Mythe -> GameTextKey.RankMythe
        },
    )

    /** « Mythe n° 42 » — le Mythe dit sa PLACE quand le serveur la sert. */
    public fun mythicSeat(seat: Int): GameText = GameText.of(GameTextKey.RankMytheSeat, GameTextArg.Count(seat))

    public fun treasuryName(tier: TreasuryTierKey): GameText = GameText(
        when (tier) {
            TreasuryTierKey.Bourse -> GameTextKey.TreasuryBourse
            TreasuryTierKey.Escarcelle -> GameTextKey.TreasuryEscarcelle
            TreasuryTierKey.Coffret -> GameTextKey.TreasuryCoffret
            TreasuryTierKey.Coffre -> GameTextKey.TreasuryCoffre
            TreasuryTierKey.Tresor -> GameTextKey.TreasuryTresor
            TreasuryTierKey.Reserve -> GameTextKey.TreasuryReserve
        },
    )

    /** « Ton Coffret » — le contenant qu'on possède ; « Ton Héritage » sans Meesh gardée. */
    public fun treasuryHeld(tier: TreasuryTierKey?): GameText = GameText(
        when (tier) {
            null -> GameTextKey.FicheHeritageHeldNone
            TreasuryTierKey.Bourse -> GameTextKey.FicheHeritageHeldBourse
            TreasuryTierKey.Escarcelle -> GameTextKey.FicheHeritageHeldEscarcelle
            TreasuryTierKey.Coffret -> GameTextKey.FicheHeritageHeldCoffret
            TreasuryTierKey.Coffre -> GameTextKey.FicheHeritageHeldCoffre
            TreasuryTierKey.Tresor -> GameTextKey.FicheHeritageHeldTresor
            TreasuryTierKey.Reserve -> GameTextKey.FicheHeritageHeldReserve
        },
    )

    /** « le Coffre s'ouvre à 100 » — le contenant suivant, avec son article. */
    public fun treasuryOpens(tier: TreasuryTierKey, minHeld: Int): GameText = GameText.of(
        when (tier) {
            TreasuryTierKey.Bourse -> GameTextKey.FicheHeritageOpensBourse
            TreasuryTierKey.Escarcelle -> GameTextKey.FicheHeritageOpensEscarcelle
            TreasuryTierKey.Coffret -> GameTextKey.FicheHeritageOpensCoffret
            TreasuryTierKey.Coffre -> GameTextKey.FicheHeritageOpensCoffre
            TreasuryTierKey.Tresor -> GameTextKey.FicheHeritageOpensTresor
            TreasuryTierKey.Reserve -> GameTextKey.FicheHeritageOpensReserve
        },
        GameTextArg.Count(minHeld),
    )

    public fun flameFormName(form: FlameFormKey): GameText = GameText(
        when (form) {
            FlameFormKey.Braise -> GameTextKey.FlameFormBraise
            FlameFormKey.Flamme -> GameTextKey.FlameFormFlamme
            FlameFormKey.Brasier -> GameTextKey.FlameFormBrasier
            FlameFormKey.Astre -> GameTextKey.FlameFormAstre
            FlameFormKey.Soleil -> GameTextKey.FlameFormSoleil
        },
    )

    public fun editionName(edition: MeeshEdition): GameText = GameText(
        when (edition) {
            MeeshEdition.Silver -> GameTextKey.EditionSilver
            MeeshEdition.Gold -> GameTextKey.EditionGold
            MeeshEdition.Prism -> GameTextKey.EditionPrism
        },
    )

    public fun difficultyName(difficulty: MissionDifficulty): GameText = GameText(
        when (difficulty) {
            MissionDifficulty.Easy -> GameTextKey.DifficultyEasy
            MissionDifficulty.Medium -> GameTextKey.DifficultyMedium
            MissionDifficulty.Hard -> GameTextKey.DifficultyHard
            MissionDifficulty.Gold -> GameTextKey.DifficultyGold
        },
    )

    // Les durées calmes

    private const val MINUTES_PER_HOUR = 60
    private const val MINUTES_PER_DAY = 24 * 60

    /**
     * Une durée CALME : des jours et des heures, puis des heures et des minutes,
     * puis des minutes — jamais de secondes qui défilent. Arrondie à la minute
     * supérieure, une minute au moins.
     */
    public fun calmDuration(seconds: Double): GameText {
        val minutes = max(1, ceil(seconds / 60.0).toInt())
        val days = minutes / MINUTES_PER_DAY
        val hours = (minutes % MINUTES_PER_DAY) / MINUTES_PER_HOUR
        val rest = minutes % MINUTES_PER_HOUR
        if (days >= 1) {
            return GameText.of(GameTextKey.DurationDaysHours, GameTextArg.Count(days), GameTextArg.Count(hours))
        }
        if (hours >= 1) {
            val head = GameText.of(GameTextKey.DurationHours, GameTextArg.Count(hours))
            if (rest == 0) return head
            return GameText.joined(listOf(head, GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(rest))))
        }
        return GameText.of(GameTextKey.DurationMinutes, GameTextArg.Count(minutes))
    }

    /** « Il reste 1 h 23 min » pendant la plage. */
    public fun missionRemaining(seconds: Double): GameText =
        GameText.of(GameTextKey.MissionTimerRemaining, GameTextArg.Nested(calmDuration(seconds)))

    /** « Commence dans 12 min » avant la plage. */
    public fun missionStartsIn(seconds: Double): GameText =
        GameText.of(GameTextKey.MissionTimerStarts, GameTextArg.Nested(calmDuration(seconds)))

    /** Ce que dit une carte une fois sa plage passée : « Terminée » ou « Manquée ». */
    public fun missionEnding(finished: Boolean): GameText =
        GameText(if (finished) GameTextKey.MissionFinished else GameTextKey.MissionMissed)

    public val personalMissionName: GameText = GameText(GameTextKey.MissionPersonal)
}
