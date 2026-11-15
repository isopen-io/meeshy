package me.meeshy.sdk.model.game.guide

import me.meeshy.sdk.model.game.GameBlock
import me.meeshy.sdk.model.game.GameDay

/** Le dernier passage sur Progression, par compte — il ne sert qu'à dire « content de te revoir » après sept jours. */
public interface GuideVisitStore {
    public fun lastVisitDay(): String?
    public fun rememberVisit(day: String)
}

/** Le dernier instantané lu, par compte : une montée de ligue arrivée app fermée se raconte à l'ouverture suivante. */
public interface GuideSnapshotStore {
    public fun load(): GuideSnapshot?
    public fun save(snapshot: GuideSnapshot)
}

/**
 * LE GUIDE D'UNE OUVERTURE D'ÉCRAN (iOS `GameGuideSession`, miroir de `apps/web/src/routes/progression-guide.ts`) —
 * quelle carte Mee et Meo montrent, et quand elle est vue.
 *
 *  1. À la PREMIÈRE lecture portant le bloc de jeu : l'intégration d'abord (la première étape non vue), sinon UN
 *     moment. Une seule carte.
 *  2. PENDANT que l'écran est ouvert : une transition remplace la carte, sauf pendant l'intégration.
 *  3. Une carte est VUE dès qu'elle s'affiche : sa clé part à [markSeen] (`POST /me/game/guide/seen`) et entre aussitôt
 *     dans l'état, pour que la prochaine ouverture la dise en version COURTE. Un envoi refusé ne retire pas la carte.
 *  4. « Plus tard » écarte la carte (pendant l'intégration : « Passer » montre l'étape suivante) ; « Passer
 *     l'intégration » marque les étapes restantes en UN envoi.
 *
 * Rien n'est persisté ici en dehors des deux magasins de l'appareil et de l'envoi au serveur : écarter une carte ne
 * se retient pas — une urgence se redira à la prochaine ouverture, une découverte vue ne se redit pas.
 */
public class GameGuideSession(
    private val visits: GuideVisitStore,
    private val memory: GuideSnapshotStore?,
    private val today: () -> String,
    private val markSeen: (List<String>) -> Unit,
) {
    public var card: GuideCard? = null
        private set

    private var seen: Set<String> = emptySet()
    private var opened = false
    private var previous: GameBlock? = null

    /** À chaque lecture du bloc réglée (réseau, cache, geste réglé). */
    public fun observe(game: GameBlock, settled: Boolean = true) {
        if (!settled) return
        seen = seen + game.guideSeen
        val before = previous
        previous = game
        val snapshot = GuideSnapshot.of(game)
        if (!opened) {
            opened = true
            val day = today()
            val last = visits.lastVisitDay()
            visits.rememberVisit(day)
            show(openingCard(game, last?.let { GameDay.diff(it, day) }, snapshot))
            memory?.save(snapshot)
            return
        }
        memory?.save(snapshot)
        if (before == null) return
        val events = GameGuideEvents.transitions(before, game).map(GuideAnyEvent::Original) +
            GameGuideEventsV2.transition(before, game).map(GuideAnyEvent::Wave2)
        if (events.isEmpty()) return
        val moment = GameGuideV2.chooseMoment(events, seen) ?: return
        if (card?.step != null) return
        show(GameGuideCards.of(moment))
    }

    /** « Plus tard » / « Passer ». */
    public fun dismiss() {
        if (card?.step == null) {
            card = null
            return
        }
        show(GameGuide.nextOnboardingStep(seen)?.let(GameGuideCards::of))
    }

    /** « Passer l'intégration » : les étapes restantes partent vues en UN envoi. */
    public fun skipAll() {
        val remaining = GameGuide.onboardingSteps.map { GameGuide.onboardingSeenKey(it.key) }.filter { it !in seen }
        send(remaining)
        card = null
    }

    private fun openingCard(game: GameBlock, daysAway: Int?, now: GuideSnapshot): GuideCard? {
        GameGuide.nextOnboardingStep(seen)?.let { return GameGuideCards.of(it) }
        val stored = memory?.load()
        val events = GameGuideEvents.standing(game, seen, daysAway).map(GuideAnyEvent::Original) +
            GameGuideEventsV2.standing(game, seen).map(GuideAnyEvent::Wave2) +
            stored?.let { GameGuideEventsV2.between(it, now) }.orEmpty().map(GuideAnyEvent::Wave2)
        return GameGuideV2.chooseMoment(events, seen)?.let(GameGuideCards::of)
    }

    private fun show(next: GuideCard?) {
        card = next
        if (next != null && next.key !in seen) send(listOf(next.key))
    }

    private fun send(keys: List<String>) {
        if (keys.isEmpty()) return
        seen = seen + keys
        markSeen(keys)
    }
}
