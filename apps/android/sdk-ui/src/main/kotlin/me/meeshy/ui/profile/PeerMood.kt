package me.meeshy.ui.profile

import androidx.compose.runtime.Immutable
import androidx.compose.runtime.ProvidableCompositionLocal
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.staticCompositionLocalOf

/** L'humeur vivante d'une personne, telle que la boule de mood de son avatar la porte. */
@Immutable
public data class PeerMood(val statusId: String, val emoji: String)

/**
 * Les humeurs vivantes lues par les surfaces qui ne dépendent pas de `:feature:feed` (en-tête de
 * conversation). `:app` fournit l'instantané des statuts ; sans hôte, personne n'a d'humeur.
 */
public fun interface PeerMoodDirectory {
    public fun moodOf(userId: String?): PeerMood?
}

/**
 * Ouvre la page plein écran d'une humeur (iOS `Route.moodSpotlight`) : en conversation, toucher la
 * boule de mood y mène DIRECTEMENT, sans bulle ni pop-up de réponse (#13987).
 */
public fun interface PeerMoodOpener {
    public fun open(mood: PeerMood)
}

public object NoPeerMoods : PeerMoodDirectory {
    override fun moodOf(userId: String?): PeerMood? = null
}

public object InertPeerMoodOpener : PeerMoodOpener {
    override fun open(mood: PeerMood): Unit = Unit
}

public val LocalPeerMoodDirectory: ProvidableCompositionLocal<PeerMoodDirectory> =
    compositionLocalOf { NoPeerMoods }

public val LocalPeerMoodOpener: ProvidableCompositionLocal<PeerMoodOpener> =
    staticCompositionLocalOf { InertPeerMoodOpener }
