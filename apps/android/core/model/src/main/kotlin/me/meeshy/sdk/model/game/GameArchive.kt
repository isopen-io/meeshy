package me.meeshy.sdk.model.game

/*
 * Les archives du Jeu : statut et rétention (#9947, #10018, #10131). MIROIR de `GameArchive.swift` (iOS).
 * Les modèles (`GameSeasonArchive`, `GameLeagueWeekArchive`) vivent dans `GameArchiveModels.kt` ; ce fichier
 * porte ce qu'on en CALCULE sur la copie gardée, sans réseau.
 */

/**
 * L'état de cette copie au moment donné (#10131) : servi, puis avancé par l'horloge locale. Une saison
 * « à venir » gardée hors ligne bascule « en cours » à l'ouverture, sans réseau ; l'état ne recule jamais.
 */
public fun GameSeasonArchive.liveStatus(moment: SeasonMoment): GameArchiveStatus =
    GameSeason.liveTense(served = status, startDay = startDay, endDay = endDay, moment = moment)

/** Une semaine dont la trace a été purgée (`LEAGUE_RETENTION_DAYS` après la fin de sa saison). */
public val GameLeagueWeekArchive.isPurged: Boolean get() = retention == GameArchiveRetention.Purged

/** Le résultat gravé est montrable : la trace est gardée et une place a été tenue cette semaine-là. */
public val GameLeagueWeekArchive.hasResult: Boolean get() = !isPurged && result != null
