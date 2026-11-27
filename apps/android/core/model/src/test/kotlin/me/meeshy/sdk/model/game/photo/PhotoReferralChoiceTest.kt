package me.meeshy.sdk.model.game.photo

import com.google.common.truth.Truth.assertThat
import org.junit.Test

/**
 * Le lien d'invitation de la carte (iOS `GamePhotoSession`, conformité H-2 et H-8) : il se montre tant que l'utilisateur
 * ne l'a pas retiré, l'aperçu montre son emplacement quand aucun jeton n'existe encore, et rien ne sort de l'app avec un
 * emplacement ni avec un lien retiré.
 */
class PhotoReferralChoiceTest {

    private val link = "https://meeshy.me/join/abc"

    @Test
    fun `avant toute lecture la carte n offre aucun choix et ne montre aucun bandeau`() {
        val choice = PhotoReferralChoice()
        assertThat(choice.offersLinkChoice).isFalse()
        assertThat(choice.preview).isNull()
        assertThat(choice.outgoingLink).isNull()
    }

    @Test
    fun `un lien deja lu se montre sur la carte et part en texte`() {
        val choice = PhotoReferralChoice().read(link)
        assertThat(choice.offersLinkChoice).isTrue()
        assertThat(choice.preview).isEqualTo(PhotoReferralBanner.Ready(link))
        assertThat(choice.outgoingLink).isEqualTo(link)
        assertThat(choice.needsCreation).isFalse()
    }

    @Test
    fun `sans jeton l apercu montre l emplacement et rien ne sort tant que Partager ne l a pas cree`() {
        val choice = PhotoReferralChoice().read(null)
        assertThat(choice.offersLinkChoice).isTrue()
        assertThat(choice.preview).isEqualTo(PhotoReferralBanner.Placeholder)
        assertThat(choice.outgoingLink).isNull()
        assertThat(choice.needsCreation).isTrue()
    }

    @Test
    fun `Partager cree le jeton et la carte part avec le vrai lien`() {
        val choice = PhotoReferralChoice().read(null).created(link)
        assertThat(choice.preview).isEqualTo(PhotoReferralBanner.Ready(link))
        assertThat(choice.outgoingLink).isEqualTo(link)
        assertThat(choice.needsCreation).isFalse()
    }

    @Test
    fun `un refus de creation retire le bandeau et le choix, et ne se retente pas`() {
        val choice = PhotoReferralChoice().read(null).created(null)
        assertThat(choice.preview).isNull()
        assertThat(choice.offersLinkChoice).isFalse()
        assertThat(choice.needsCreation).isFalse()
        assertThat(choice.outgoingLink).isNull()
    }

    @Test
    fun `retirer le lien retire le bandeau, le texte et toute creation de jeton`() {
        val withLink = PhotoReferralChoice().read(link).withLinkOnCard(false)
        assertThat(withLink.preview).isNull()
        assertThat(withLink.outgoingLink).isNull()
        assertThat(withLink.offersLinkChoice).isTrue()

        val withoutToken = PhotoReferralChoice().read(null).withLinkOnCard(false)
        assertThat(withoutToken.needsCreation).isFalse()
        assertThat(withoutToken.preview).isNull()
    }

    @Test
    fun `remettre le lien le rend sans relire le reseau`() {
        val choice = PhotoReferralChoice().read(link).withLinkOnCard(false).withLinkOnCard(true)
        assertThat(choice.preview).isEqualTo(PhotoReferralBanner.Ready(link))
        assertThat(choice.outgoingLink).isEqualTo(link)
    }

    @Test
    fun `une seconde lecture ne remplace pas un lien deja obtenu`() {
        val choice = PhotoReferralChoice().read(null).created(link).read(null)
        assertThat(choice.outgoingLink).isEqualTo(link)
    }

    @Test
    fun `la recette du carnet dit si le lien etait sur la carte`() {
        assertThat(PhotoReferralChoice().read(link).showsLink).isTrue()
        assertThat(PhotoReferralChoice().read(null).showsLink).isFalse()
        assertThat(PhotoReferralChoice().read(link).withLinkOnCard(false).showsLink).isFalse()
    }
}
