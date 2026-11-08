package me.meeshy.sdk.model.game

import me.meeshy.sdk.model.deeplink.GameLink
import me.meeshy.sdk.model.deeplink.GameLinkParser

/**
 * Les liens du jeu, lus depuis une adresse entière (`https://meeshy.me/me/progression/saison/3`,
 * `meeshy://me/progression/ligue/2026-10-12`). La forme nue ou un paramètre invalide ouvre la saison ou la semaine
 * EN COURS (`null`), jamais un navigateur ni un écran vide. Délègue à [GameLinkParser], la loi unique.
 */
public object GameLinks {

    private val webHosts: Set<String> = setOf("meeshy.me", "www.meeshy.me")

    /** Le lien du jeu d'une adresse, `null` si ce n'en est pas un (autre hôte, autre schéma, autre chemin). */
    public fun parse(raw: String): GameLink? {
        val trimmed = raw.trim().substringBefore('#').substringBefore('?')
        val scheme = trimmed.substringBefore("://", "").lowercase()
        val rest = trimmed.substringAfter("://", "")
        if (rest.isEmpty()) return null
        val host = rest.substringBefore('/').lowercase()
        val path = rest.substringAfter('/', "")
        val segments = path.split('/').filter { it.isNotEmpty() }
        return when (scheme) {
            "https" -> if (host in webHosts) GameLinkParser.link(segments) else null
            "meeshy" -> GameLinkParser.link(listOf(host) + segments)
            else -> null
        }
    }

    /** L'adresse canonique d'un lien, miroir de `gameLinkUrl` (`origin` sans barre finale). */
    public fun url(origin: String, link: GameLink): String {
        val base = origin.trimEnd('/')
        return when (link) {
            is GameLink.Season -> "$base/me/progression/saison" + (link.number?.let { "/$it" } ?: "")
            is GameLink.LeagueWeek -> "$base/me/progression/ligue" + (link.key?.let { "/$it" } ?: "")
        }
    }
}
