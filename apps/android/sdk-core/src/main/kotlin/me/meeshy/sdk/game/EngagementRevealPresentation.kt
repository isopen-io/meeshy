package me.meeshy.sdk.game

import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.mapLatest
import me.meeshy.sdk.engagement.EngagementProgressRepository
import me.meeshy.sdk.model.game.GameRarityEntry
import me.meeshy.sdk.model.game.engagement.EngagementReveal
import me.meeshy.sdk.model.game.engagement.RevealRim
import me.meeshy.sdk.session.SessionRepository

/**
 * Ce que l'hôte de la célébration pose à l'écran avec le palier (miroir des états de `EngagementRevealHost`, iOS) :
 * la rareté mesurée du succès (#9390), si la carte à partager s'offre (#7742) et le pseudo PUBLIC de l'auteur (jamais celui d'un invité).
 */
data class EngagementRevealPresentation(
    val reveal: EngagementReveal,
    val rarity: GameRarityEntry?,
    val offersPhotos: Boolean,
    val authorHandle: String?,
)

/**
 * **La célébration, prête à se poser.** La rareté se lit AVANT que la célébration ne se présente — au cache de la
 * progression, jamais au réseau — pour que le liseré soit là dès la première image et ne surgisse pas après coup. Elle
 * reste celle d'avant si le cache ne la connaît pas. « Jeu masqué » retire la célébration, donc le liseré avec elle.
 */
@Singleton
class EngagementRevealPresenter @Inject constructor(
    private val coordinator: EngagementRevealCoordinator,
    private val progress: EngagementProgressRepository,
    private val prefs: GameDevicePrefsStore,
    private val session: SessionRepository,
) {
    @OptIn(ExperimentalCoroutinesApi::class)
    val presentation: Flow<EngagementRevealPresentation?> = coordinator.showing.mapLatest { reveal ->
        reveal ?: return@mapLatest null
        val devicePrefs = prefs.current()
        val rarities = runCatching { progress.cachedRarities() }.getOrNull()
        EngagementRevealPresentation(
            reveal = reveal,
            rarity = RevealRim.entry(reveal, rarities, hidden = devicePrefs.hidden),
            offersPhotos = devicePrefs.offersPhotos,
            authorHandle = session.currentUser.value?.takeIf { it.isAnonymous != true }?.username?.takeIf { it.isNotBlank() },
        )
    }.distinctUntilChanged()

    fun finish() = coordinator.finish()
}
