package me.meeshy.app.game.photo

import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.test.junit4.createComposeRule
import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.async
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.model.composer.capture.CaptureZone
import me.meeshy.sdk.model.game.PhotoStepEmblem
import me.meeshy.sdk.model.game.photo.GamePhotoMoment
import org.junit.After
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * Le lien d'invitation de la carte du moment (iOS `GamePhotoSession`, #13978, #17392) : un lien déjà là se montre et part
 * en texte ; sans jeton, l'aperçu montre son emplacement et seul « Partager » le crée ; « Mon lien d'invitation sur la
 * carte » retiré, la carte part sans lien, sans texte et sans jeton ; rien ne sort avec un emplacement.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34])
class GamePhotoReferralSessionTest {

    @get:Rule val compose = createComposeRule()

    @After fun settleFrames() {
        Snapshot.sendApplyNotifications()
        compose.waitForIdle()
    }

    private val moment = GamePhotoMoment("rank:polyglotte:3", PhotoStepEmblem.Start)
    private val link = "https://meeshy.me/join/abc"
    private val composer = FakeComposer()
    private val requests get() = composer.requests

    private fun session(links: FakeReferralLinks?, gallery: FakeGallery = FakeGallery(), notebook: FakePhotoNotebook = FakePhotoNotebook()) =
        fakeSession(moment, composer = composer, gallery = gallery, notebook = notebook, referralLinks = links)

    @Test
    fun `un lien deja la se pose sur la carte et part en texte avec l image`() = runTest {
        val links = FakeReferralLinks(existing = link)
        val s = session(links)
        s.prepareReferral()

        s.chooseCard()
        val out = s.prepareShare()

        assertThat(requests.first().referral?.link).isEqualTo(link)
        assertThat(requests.first().referral?.placeholder).isFalse()
        assertThat(out?.text).isEqualTo("Rejoins-moi sur Meeshy : $link")
        assertThat(links.creations).isEqualTo(0)
        assertThat(s.offersLinkChoice).isTrue()
    }

    @Test
    fun `sans jeton l apercu montre l emplacement et Partager cree le lien avant de partager`() = runTest {
        val links = FakeReferralLinks(existing = null)
        val s = session(links)
        s.prepareReferral()
        s.chooseCard()

        assertThat(requests.single().referral?.placeholder).isTrue()

        val out = s.prepareShare()

        assertThat(links.creations).isEqualTo(1)
        assertThat(requests.last().referral?.link).isEqualTo(FakeReferralLinks.NEW_LINK)
        assertThat(out?.text).isEqualTo("Rejoins-moi sur Meeshy : ${FakeReferralLinks.NEW_LINK}")
    }

    @Test
    fun `un refus de creation partage la carte sans bandeau et sans texte`() = runTest {
        val links = FakeReferralLinks(existing = null, created = null)
        val s = session(links)
        s.prepareReferral()
        s.chooseCard()

        val out = s.prepareShare()

        assertThat(out).isNotNull()
        assertThat(out?.text).isNull()
        assertThat(requests.last().referral).isNull()
        assertThat(s.offersLinkChoice).isFalse()
    }

    @Test
    fun `retirer mon lien recompose la carte sans bandeau, sans texte et sans creer de jeton`() = runTest {
        val links = FakeReferralLinks(existing = null)
        val s = session(links)
        s.prepareReferral()
        s.chooseCard()

        s.setLinkOnCard(false)
        val out = s.prepareShare()

        assertThat(s.linkOnCard).isFalse()
        assertThat(requests.last().referral).isNull()
        assertThat(out?.text).isNull()
        assertThat(links.creations).isEqualTo(0)
    }

    @Test
    fun `la galerie ne recoit jamais l emplacement du lien`() = runTest {
        val gallery = FakeGallery()
        val s = session(FakeReferralLinks(existing = null), gallery = gallery)
        s.prepareReferral()
        s.chooseSelfie()

        s.take(CaptureZone.FRAME)

        assertThat(gallery.saved).hasSize(1)
        assertThat(requests.first().referral?.placeholder).isTrue()
        assertThat(requests.last().referral).isNull()
    }

    @Test
    fun `garder la carte retient le lien dans la recette, jamais l emplacement`() = runTest {
        val notebook = FakePhotoNotebook()
        val s = session(FakeReferralLinks(existing = link), notebook = notebook)
        s.prepareReferral()
        s.chooseCard()

        s.keep()

        assertThat(notebook.kept.single().second.recipe.showLink).isTrue()
    }

    @Test
    fun `un second toucher pendant la creation n ouvre pas une seconde feuille`() = runTest {
        val links = FakeReferralLinks(existing = null).apply { gate = CompletableDeferred() }
        val s = session(links)
        s.prepareReferral()
        s.chooseCard()

        val first = async { s.prepareShare() }
        runCurrent()
        val second = s.prepareShare()
        links.gate?.complete(Unit)

        assertThat(second).isNull()
        assertThat(first.await()?.text).isEqualTo("Rejoins-moi sur Meeshy : ${FakeReferralLinks.NEW_LINK}")
        assertThat(links.creations).isEqualTo(1)
    }

    @Test
    fun `sans service de parrainage la carte part comme avant, sans choix de lien`() = runTest {
        val s = session(links = null)
        s.prepareReferral()
        s.chooseCard()

        val out = s.prepareShare()

        assertThat(s.offersLinkChoice).isFalse()
        assertThat(requests.single().referral).isNull()
        assertThat(out?.bytes).isEqualTo(byteArrayOf(1))
        assertThat(out?.text).isNull()
    }
}
