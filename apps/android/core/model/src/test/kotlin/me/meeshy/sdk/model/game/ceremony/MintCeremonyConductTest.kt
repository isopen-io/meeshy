package me.meeshy.sdk.model.game.ceremony

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import me.meeshy.sdk.model.game.GameHapticPattern
import me.meeshy.sdk.model.game.MeeshEdition
import me.meeshy.sdk.model.game.MeeshMintResponse
import me.meeshy.sdk.model.game.TreasuryNext
import me.meeshy.sdk.model.game.TreasuryStanding
import me.meeshy.sdk.model.game.TreasuryTierKey
import me.meeshy.sdk.model.game.progression.HeritageCoin
import me.meeshy.sdk.model.game.progression.ProgressionHeritagePiece
import org.junit.Test

/**
 * LA CONDUITE DE LA CÉRÉMONIE (iOS `MintCeremonyRun`, `MintCeremonyRequest`, `GameMintSettlement`, `GameHeritageHold`) :
 * la réponse qui compte est la PREMIÈRE réglée après le toucher ; aucun coup ne vibre avant elle ; un refus ramène la
 * lumière (et ferme la scène sous « réduire les animations ») ; un toucher la passe une fois ; la tête de l'Héritage
 * garde ce qu'elle montrait au toucher jusqu'à la fin de la cérémonie ET la réponse de la passerelle.
 */
class MintCeremonyConductTest {

    private fun settled(outcome: MintSettlementOutcome, key: Int) = GameMintSettlement(outcome, key)

    private fun run(edition: MeeshEdition = MeeshEdition.Silver, number: Int = 92, reduced: Boolean = false) =
        MintCeremonyRun.start(MintCeremonyRequest(number, edition, settled = null), reduced = reduced, modest = false)

    @Test
    fun the_answer_that_counts_is_the_first_settled_after_the_tap() {
        val before = settled(MintSettlementOutcome.Refused("NETWORK"), key = 3)
        val request = MintCeremonyRequest(92, MeeshEdition.Silver, settled = before)
        assertWithMessage("le refus d'AVANT le toucher ne compte pas").that(request.answer(before)).isEqualTo(MintCeremonyAnswer.Pending)
        assertThat(request.answer(null)).isEqualTo(MintCeremonyAnswer.Pending)
        val fresh = MintCeremonyRequest(92, MeeshEdition.Silver, settled = null)
        assertThat(fresh.answer(settled(MintSettlementOutcome.Minted(93), 1))).isEqualTo(MintCeremonyAnswer.Confirmed(93))
        assertThat(fresh.answer(settled(MintSettlementOutcome.Minted(null), 1))).isEqualTo(MintCeremonyAnswer.Confirmed(92))
        assertThat(request.answer(settled(MintSettlementOutcome.Refused("MINT_BLOCKED_BY_DEBT"), 4)))
            .isEqualTo(MintCeremonyAnswer.Refused("MINT_BLOCKED_BY_DEBT"))
    }

    @Test
    fun the_gateway_reply_is_classed_insufficient_is_a_refusal_already_minted_a_coin() {
        assertThat(GameMintSettlement.outcomeOf(MeeshMintResponse(status = "insufficient", balance = 3), preview = null))
            .isEqualTo(MintSettlementOutcome.Refused("INSUFFICIENT_POINTS"))
        assertThat(GameMintSettlement.outcomeOf(MeeshMintResponse(status = "already-minted", number = 13), preview = null))
            .isEqualTo(MintSettlementOutcome.Minted(13))
        assertWithMessage("un statut inconnu ne se célèbre pas").that(GameMintSettlement.outcomeOf(MeeshMintResponse(status = "?"), null))
            .isEqualTo(MintSettlementOutcome.Refused(null))
        assertThat(GameMintSettlement.refusal(offline = true, code = null)).isEqualTo(MintSettlementOutcome.Refused("NETWORK"))
        assertThat(GameMintCeremony.refusalReason(GameMintCeremony.NETWORK_REFUSAL_CODE)).isEqualTo(MintRefusalReason.Offline)
    }

    @Test
    fun no_blow_vibrates_before_the_confirmation_then_each_blow_at_its_impact_the_last_the_strongest() {
        val waiting = run(MeeshEdition.Gold, number = 300)
        assertWithMessage("rien ne vibre tant que la passerelle se tait").that(waiting.blows(nowMs = 5000.0)).isEmpty()
        val confirmed = waiting.receive(MintCeremonyAnswer.Confirmed(300), atMs = 6300.0)
        val blows = confirmed.blows(nowMs = 6300.0)
        assertThat(blows.map { it.isFinal }).containsExactly(false, false, true).inOrder()
        assertThat(blows.first().delaySeconds).isWithin(1e-9).of(0.09)
        assertThat(confirmed.plan(6400.0).strikes.first().atMs).isEqualTo(6300)
        assertThat(MintCeremonyRun.blows(confirmed.plan(6300.0), afterMs = 6390.0 + 400).size).isEqualTo(2)
        val final = GameHapticPattern.ceremonyBlow(final = true).maxOf { it.intensity }
        assertThat(final).isGreaterThan(GameHapticPattern.ceremonyBlow(final = false).maxOf { it.intensity })
    }

    @Test
    fun a_confirmation_fixes_the_coin_the_gateway_numbered_and_only_once() {
        val confirmed = run().receive(MintCeremonyAnswer.Confirmed(93), atMs = 6300.0)
        assertThat(confirmed.number).isEqualTo(93)
        assertThat(confirmed.answeredAtMs).isEqualTo(6300.0)
        assertThat(confirmed.isFinished).isFalse()
        val again = confirmed.receive(MintCeremonyAnswer.Confirmed(94), atMs = 7000.0)
        assertThat(again).isEqualTo(confirmed)
    }

    @Test
    fun a_refusal_turns_the_scene_back_and_mee_says_why() {
        val refused = run().receive(MintCeremonyAnswer.Refused("TREASURY_LOCKED"), atMs = 2000.0)
        assertThat(refused.mode).isEqualTo(MintCeremonyMode.Refused)
        assertThat(refused.refusal).isEqualTo(MintRefusalReason.Locked)
        assertThat(refused.plan(2500.0).refusal).isNotNull()
        assertThat(refused.blows(2500.0)).isEmpty()
        assertThat(refused.isFinished).isFalse()
    }

    @Test
    fun under_reduced_motion_the_scene_is_its_final_state_and_a_refusal_closes_it() {
        val reduced = run(reduced = true)
        assertThat(reduced.plan(0.0).mode).isEqualTo(MintCeremonyMode.Reduced)
        assertThat(reduced.particles.count).isEqualTo(0)
        assertThat(reduced.receive(MintCeremonyAnswer.Refused(null), atMs = 300.0).isFinished).isTrue()
    }

    @Test
    fun a_silent_gateway_does_not_hold_the_hammer_forever() {
        val waiting = run()
        assertThat(waiting.timedOut(nowMs = 19_000.0)).isEqualTo(waiting)
        val given = waiting.timedOut(nowMs = GameMintCeremony.PENDING_LIMIT_MS + 1.0)
        assertThat(given.mode).isEqualTo(MintCeremonyMode.Refused)
        assertThat(given.refusal).isEqualTo(MintRefusalReason.Other)
    }

    @Test
    fun a_touch_skips_the_scene_once_and_it_no_longer_listens() {
        val skipped = run().finished()
        assertThat(skipped.isFinished).isTrue()
        assertThat(skipped.receive(MintCeremonyAnswer.Confirmed(93), atMs = 6000.0).number).isEqualTo(92)
    }

    @Test
    fun the_number_247_is_struck_once_like_silver_but_in_gold_dust() {
        val request = MintCeremonyRequest(247, MeeshEdition.Silver, settled = null)
        assertThat(request.look).isEqualTo(MeeshEdition.Gold)
        val plan = MintCeremonyRun.start(request, reduced = false, modest = false).plan(0.0)
        assertThat(plan.strikes).hasSize(1)
        assertThat(plan.grand).isFalse()
        assertThat(plan.particles.dust.map { it.material }.toSet()).containsExactly(MintCeremonyDustMaterial.Gold)
    }

    private val coffret = TreasuryStanding(held = 12, tier = TreasuryTierKey.Coffret, next = TreasuryNext(TreasuryTierKey.Coffre, 100, 88))
    private val before = ProgressionHeritagePiece.of(12, coffret, minted = 91)
    private val after = ProgressionHeritagePiece.of(13, coffret.copy(held = 13), minted = 92)

    @Test
    fun the_heritage_head_keeps_what_it_showed_at_the_tap_until_the_ceremony_ends_and_the_gateway_answers() {
        val earlier = settled(MintSettlementOutcome.Minted(91), key = 4)
        val hold = GameHeritageHold.of(before, earlier)
        val answer = settled(MintSettlementOutcome.Minted(92), key = 5)
        assertWithMessage("cérémonie en cours, réponse reçue : rien ne bouge").that(GameHeritageHold.shown(after, hold, answer)).isEqualTo(before)
        assertWithMessage("cérémonie finie, réponse d'AVANT le toucher : retenue").that(GameHeritageHold.shown(after, hold.ended(), earlier))
            .isEqualTo(before)
        val released = GameHeritageHold.shown(after, hold.ended(), answer)
        assertThat(released).isEqualTo(after)
        assertThat(released.coin).isEqualTo(HeritageCoin.of(92))
        assertWithMessage("sans retenue, la tête suit l'état servi").that(GameHeritageHold.shown(after, null, null)).isEqualTo(after)
    }

    @Test
    fun a_refused_strike_releases_the_head_on_the_state_the_gateway_serves_unchanged() {
        val hold = GameHeritageHold.of(before, null).ended()
        val refused = settled(MintSettlementOutcome.Refused("NETWORK"), key = 1)
        assertThat(GameHeritageHold.shown(before, hold, refused)).isEqualTo(before)
        assertThat(hold.isReleasedBy(refused)).isTrue()
    }
}
