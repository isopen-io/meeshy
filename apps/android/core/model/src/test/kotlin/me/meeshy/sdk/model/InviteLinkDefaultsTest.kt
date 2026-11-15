package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class InviteLinkDefaultsTest {

    private fun draft() = InviteLinkDefaults.draft("c1")

    @Test
    fun `le brouillon par defaut autorise messages images et historique, refuse les fichiers, exige le pseudo`() {
        val form = draft().form
        assertThat(form.conversationId).isEqualTo("c1")
        assertThat(form.allowAnonymousMessages).isTrue()
        assertThat(form.allowAnonymousImages).isTrue()
        assertThat(form.allowViewHistory).isTrue()
        assertThat(form.allowAnonymousFiles).isFalse()
        assertThat(form.requireNickname).isTrue()
        assertThat(form.requireAccount).isFalse()
        assertThat(form.requireEmail).isFalse()
        assertThat(form.expiration).isEqualTo(ShareLinkExpiration.Never)
        assertThat(form.maxUsesEnabled).isFalse()
    }

    @Test
    fun `sans lien genere les options sont a regenerer`() {
        assertThat(InviteLinkDefaults.optionsModified(null, draft())).isTrue()
    }

    @Test
    fun `un brouillon identique a celui du lien genere n'est pas modifie`() {
        assertThat(InviteLinkDefaults.optionsModified(draft(), draft())).isFalse()
    }

    @Test
    fun `changer le message ou une option marque le brouillon modifie, le rétablir l'efface`() {
        val generated = draft()
        val edited = generated.withMessage("Salut").withForm { it.withAllowAnonymousFiles(true) }
        assertThat(InviteLinkDefaults.optionsModified(generated, edited)).isTrue()
        assertThat(InviteLinkDefaults.optionsModified(generated, edited.withMessage("").withForm { it.withAllowAnonymousFiles(false) })).isFalse()
    }

    @Test
    fun `le resume liste l'expiration et les permissions accordees dans l'ordre des icones`() {
        val summary = InviteLinkDefaults.summary(
            draft().withForm { it.withExpiration(ShareLinkExpiration.Days7).withAllowAnonymousFiles(true) },
        )
        assertThat(summary.expiration).isEqualTo(ShareLinkExpiration.Days7)
        assertThat(summary.permissions).containsExactly(
            InvitePermission.Messages, InvitePermission.Images, InvitePermission.Files, InvitePermission.History,
        ).inOrder()
    }

    @Test
    fun `le resume est vide quand aucune permission n'est accordee`() {
        val summary = InviteLinkDefaults.summary(
            draft().withForm {
                it.withAllowAnonymousMessages(false).withAllowAnonymousImages(false).withAllowViewHistory(false)
            },
        )
        assertThat(summary.permissions).isEmpty()
    }

    @Test
    fun `la requete retombe sur le nom et le message par defaut quand ils sont vides`() {
        val request = InviteLinkDefaults.toRequest(draft(), 0L, "Rejoins-moi", "Rejoins \"Équipe\"")!!
        assertThat(request.description).isEqualTo("Rejoins-moi")
        assertThat(request.name).isEqualTo("Rejoins \"Équipe\"")
        assertThat(request.allowAnonymousFiles).isFalse()
        assertThat(request.allowViewHistory).isTrue()
        assertThat(request.requireNickname).isTrue()
        assertThat(request.expiresAt).isNull()
        assertThat(request.maxUses).isNull()
    }

    @Test
    fun `la requete porte le message et le nom saisis, la limite et l'expiration`() {
        val edited = draft().withMessage("Viens !").withForm {
            it.withName("Mon lien").withMaxUsesEnabled(true).withMaxUses(5).withExpiration(ShareLinkExpiration.Hours24)
        }
        val request = InviteLinkDefaults.toRequest(edited, 0L, "d", "n")!!
        assertThat(request.description).isEqualTo("Viens !")
        assertThat(request.name).isEqualTo("Mon lien")
        assertThat(request.maxUses).isEqualTo(5)
        assertThat(request.expiresAt).isEqualTo("1970-01-02T00:00:00Z")
    }

    @Test
    fun `un compte requis coupe pseudo et e-mail dans la requete`() {
        val request = InviteLinkDefaults.toRequest(
            draft().withForm { it.withRequireAccount(true).withRequireEmail(true) }, 0L, "d", "n",
        )!!
        assertThat(request.requireAccount).isTrue()
        assertThat(request.requireNickname).isFalse()
        assertThat(request.requireEmail).isFalse()
    }

    @Test
    fun `le nom par defaut cite la conversation entre guillemets`() {
        assertThat(InviteLinkDefaults.defaultLinkName("Rejoins la conversation", "Équipe"))
            .isEqualTo("Rejoins la conversation \"Équipe\"")
    }

    @Test
    fun `le stepper avance de 1 sous 100 puis de 10 et reste borne entre 1 et 10000`() {
        val form = draft().form.withMaxUsesEnabled(true)
        assertThat(InviteLinkDefaults.stepMaxUses(form.withMaxUses(99), 1).maxUses).isEqualTo(100)
        assertThat(InviteLinkDefaults.stepMaxUses(form.withMaxUses(100), 1).maxUses).isEqualTo(110)
        assertThat(InviteLinkDefaults.stepMaxUses(form.withMaxUses(1), -1).maxUses).isEqualTo(1)
        assertThat(InviteLinkDefaults.stepMaxUses(form.withMaxUses(10_000), 1).maxUses).isEqualTo(10_000)
    }
}
