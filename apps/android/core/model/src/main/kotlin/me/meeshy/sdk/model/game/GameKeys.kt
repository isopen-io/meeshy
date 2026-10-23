package me.meeshy.sdk.model.game

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * Les clés FERMÉES du bloc `game` (palier, rang, forme de Flamme, réserve…) :
 * des clés stables que chaque client habille. Le nom sur le fil est le
 * `@SerialName` de chaque valeur — l'unique source, lue aussi par le parseur
 * tolérant (`enumFromWire`). MIROIR de `packages/shared/types/game.ts` et de
 * `GameLevels.swift` / `GameGlory.swift` / `GameFlame.swift` /
 * `GameTreasury.swift` / `GameMint.swift` (iOS).
 *
 * Les chaînes OUVERTES (`templateKey`, `signal`, clés de guide) restent libres.
 */

/** Les vingt paliers de nom, dans l'ordre des paliers (les dix premiers sont ceux des champs d'hier). */
@Serializable
public enum class LevelTierKey {
    @SerialName("etincelle") Etincelle,
    @SerialName("lueur") Lueur,
    @SerialName("lumiere") Lumiere,
    @SerialName("eclat") Eclat,
    @SerialName("rayon") Rayon,
    @SerialName("aurore") Aurore,
    @SerialName("comete") Comete,
    @SerialName("etoile") Etoile,
    @SerialName("constellation") Constellation,
    @SerialName("galaxie") Galaxie,
    @SerialName("nebuleuse") Nebuleuse,
    @SerialName("pulsar") Pulsar,
    @SerialName("quasar") Quasar,
    @SerialName("supernova") Supernova,
    @SerialName("magnetar") Magnetar,
    @SerialName("amas") Amas,
    @SerialName("superamas") Superamas,
    @SerialName("cosmos") Cosmos,
    @SerialName("infini") Infini,
    @SerialName("singularite") Singularite,
}

/** Les onze rangs de Gloire ; `Mythe` n'a pas de seuil, le serveur le pose. */
@Serializable
public enum class GloryRank {
    @SerialName("murmure") Murmure,
    @SerialName("echo") Echo,
    @SerialName("voix") Voix,
    @SerialName("conteur") Conteur,
    @SerialName("passeur") Passeur,
    @SerialName("polyglotte") Polyglotte,
    @SerialName("ambassadeur") Ambassadeur,
    @SerialName("orateur") Orateur,
    @SerialName("oracle") Oracle,
    @SerialName("legende") Legende,
    @SerialName("mythe") Mythe,
}

/** La forme de la Flamme, de la braise au soleil. */
@Serializable
public enum class FlameFormKey {
    @SerialName("braise") Braise,
    @SerialName("flamme") Flamme,
    @SerialName("brasier") Brasier,
    @SerialName("astre") Astre,
    @SerialName("soleil") Soleil,
}

/** L'état de la Flamme du jour. */
@Serializable
public enum class FlameStatus {
    @SerialName("none") None,
    @SerialName("lit") Lit,
    @SerialName("at-risk") AtRisk,
    @SerialName("covered") Covered,
    @SerialName("out") Out,
}

/** Les six réserves du trésor, de la plus petite à la plus grande. */
@Serializable
public enum class TreasuryTierKey {
    @SerialName("bourse") Bourse,
    @SerialName("escarcelle") Escarcelle,
    @SerialName("coffret") Coffret,
    @SerialName("coffre") Coffre,
    @SerialName("tresor") Tresor,
    @SerialName("reserve") Reserve,
}

/** La difficulté d'une mission du jour. */
@Serializable
public enum class MissionDifficulty {
    @SerialName("easy") Easy,
    @SerialName("medium") Medium,
    @SerialName("hard") Hard,
    @SerialName("gold") Gold,
}

/** L'état de la mission personnelle : à venir, en cours, réussie, manquée. */
@Serializable
public enum class PersonalMissionState {
    @SerialName("upcoming") Upcoming,
    @SerialName("active") Active,
    @SerialName("completed") Completed,
    @SerialName("missed") Missed,
}

/** Ce que demande une étape de niveau. */
@Serializable
public enum class LevelStepKind {
    @SerialName("mint") Mint,
    @SerialName("missions") Missions,
    @SerialName("rank") Rank,
    @SerialName("flame") Flame,
}

/** L'état du coffre du jour. */
@Serializable
public enum class ChestStatus {
    @SerialName("locked") Locked,
    @SerialName("ready") Ready,
    @SerialName("claimed") Claimed,
}

/** La prime tirée au coffre (`NoBonus` est `none` sur le fil). */
@Serializable
public enum class ChestBonus {
    @SerialName("none") NoBonus,
    @SerialName("fifth") Fifth,
    @SerialName("whole") Whole,
}

/** Argent, or à chaque centième, prisme à chaque millième. Aucun avantage de jeu. */
@Serializable
public enum class MeeshEdition {
    @SerialName("silver") Silver,
    @SerialName("gold") Gold,
    @SerialName("prism") Prism,
}

/** Ce qui bloque la frappe hors prix et rang. */
@Serializable
public enum class MintBlock {
    @SerialName("debt") Debt,
}
