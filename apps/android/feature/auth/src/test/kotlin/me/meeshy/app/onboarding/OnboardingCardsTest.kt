package me.meeshy.app.onboarding

import android.content.Context
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.semantics.getOrNull
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.hasContentDescription
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import com.google.common.truth.Truth.assertThat
import me.meeshy.feature.auth.R
import me.meeshy.sdk.model.onboarding.OnboardingCard
import me.meeshy.sdk.model.onboarding.OnboardingRecap
import me.meeshy.sdk.model.onboarding.OnboardingSendState
import me.meeshy.sdk.model.onboarding.OnboardingStepId
import me.meeshy.sdk.model.onboarding.OnboardingSuggestion
import me.meeshy.ui.theme.MeeshyTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RuntimeEnvironment
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w411dp-h891dp")
class OnboardingCardsTest {

    @get:Rule
    val compose = createComposeRule()

    private val context: Context = RuntimeEnvironment.getApplication()

    private fun step(id: OnboardingStepId) = OnboardingCard.Step(id)

    private fun show(state: OnboardingUiState, actions: OnboardingCardActions = OnboardingCardActions()) {
        compose.setContent {
            MeeshyTheme { OnboardingCardContent(state = state, actions = actions, reduceMotion = true) }
        }
        compose.waitForIdle()
    }

    @Test
    fun `la carte langues porte son titre, la jauge et le bouton de confirmation`() {
        var confirmed = 0
        show(OnboardingUiState(card = step(OnboardingStepId.LANGUAGES)), OnboardingCardActions(confirmLanguages = { confirmed++ }))

        compose.onNodeWithText(context.getString(R.string.onboarding_languages_title)).assertExists()
        compose.onNodeWithTag(ONBOARDING_GAUGE_TAG).assertExists()
        compose.onNodeWithTag("onboarding.languages.confirm").performClick()
        assertThat(confirmed).isEqualTo(1)
    }

    @Test
    fun `la carte langues laisse passer par Plus tard`() {
        var later = 0
        show(OnboardingUiState(card = step(OnboardingStepId.LANGUAGES)), OnboardingCardActions(later = { later++ }))

        compose.onNodeWithTag("onboarding.later").performClick()
        assertThat(later).isEqualTo(1)
    }

    @Test
    fun `la carte salut envoie le texte`() {
        var sent = 0
        val actions = OnboardingCardActions(sendGreeting = { sent++ })
        show(OnboardingUiState(card = step(OnboardingStepId.GLOBAL), greetingDraft = "Salut"), actions)
        compose.onNodeWithTag("onboarding.global.send").performClick()
        assertThat(sent).isEqualTo(1)

    }

    @Test
    fun `la carte salut sans texte ne peut pas partir`() {
        var sent = 0
        show(OnboardingUiState(card = step(OnboardingStepId.GLOBAL), greetingDraft = "  "), OnboardingCardActions(sendGreeting = { sent++ }))

        compose.onNodeWithTag("onboarding.global.send").performClick()
        assertThat(sent).isEqualTo(0)
    }

    @Test
    fun `la carte story ouvre le composeur`() {
        var opened = 0
        show(OnboardingUiState(card = step(OnboardingStepId.STORY)), OnboardingCardActions(openStory = { opened++ }))

        compose.onNodeWithTag("onboarding.story.create").performClick()
        assertThat(opened).isEqualTo(1)
    }

    @Test
    fun `la carte story attend l'adresse verifiee et propose le lien`() {
        var resent = 0
        show(
            OnboardingUiState(card = step(OnboardingStepId.STORY), storyNeedsEmailVerification = true),
            OnboardingCardActions(resendVerificationLink = { resent++ }),
        )

        compose.onNodeWithText(context.getString(R.string.onboarding_story_verify)).assertExists()
        compose.onAllNodesWithText("Tap the link we emailed you.").assertCountEquals(0)
        compose.onNodeWithTag("onboarding.email.resend").performClick()
        assertThat(resent).isEqualTo(1)
    }

    @Test
    fun `une story qui part dit ta story part et ne propose plus d'en creer une seconde`() {
        var opened = 0
        var advanced = 0
        show(
            OnboardingUiState(card = step(OnboardingStepId.STORY), storyAwaitsPublication = true),
            OnboardingCardActions(openStory = { opened++ }, advance = { advanced++ }),
        )

        compose.onNodeWithText(context.getString(R.string.onboarding_story_sending)).assertExists()
        compose.onAllNodesWithText("You can keep going — it's posting in the background.").assertCountEquals(0)
        compose.onNodeWithTag("onboarding.story.create").assertDoesNotExist()
        compose.onNodeWithTag("onboarding.later").assertDoesNotExist()
        compose.onNodeWithTag("onboarding.continue").performClick()
        assertThat(advanced).isEqualTo(1)
        assertThat(opened).isEqualTo(0)
    }

    @Test
    fun `une story qui part n'affiche aucun gain`() {
        show(OnboardingUiState(card = step(OnboardingStepId.STORY), storyAwaitsPublication = true, storyReward = null))

        compose.onNodeWithText(context.getString(R.string.onboarding_story_published)).assertDoesNotExist()
    }

    @Test
    fun `la carte amis demande une personne, puis laisse continuer`() {
        var added: String? = null
        val friend = OnboardingSuggestion("u1", "lina", "Lina", languages = listOf("fr"))
        show(
            OnboardingUiState(card = step(OnboardingStepId.FRIENDS), suggestions = listOf(friend)),
            OnboardingCardActions(addFriend = { added = it }),
        )

        compose.onNodeWithText("Lina").assertExists()
        compose.onNodeWithTag("onboarding.friends.add.u1").performClick()
        assertThat(added).isEqualTo("u1")
    }

    @Test
    fun `la carte notifications ne demande qu'au Oui`() {
        var accepted = 0
        var later = 0
        show(
            OnboardingUiState(card = step(OnboardingStepId.NOTIFICATIONS)),
            OnboardingCardActions(acceptNotifications = { accepted++ }, later = { later++ }),
        )

        compose.onNodeWithTag("onboarding.notifications.no").performClick()
        assertThat(later).isEqualTo(1)
        assertThat(accepted).isEqualTo(0)
        compose.onNodeWithTag("onboarding.notifications.yes").performClick()
        assertThat(accepted).isEqualTo(1)
    }

    @Test
    fun `le recapitulatif offre d'explorer, de terminer et de decouvrir le jeu`() {
        var explored = 0
        var finished = 0
        var game = 0
        show(
            OnboardingUiState(card = OnboardingCard.Recap, recap = OnboardingRecap(points = 12, level = 1, streakDays = 2, badges = 1)),
            OnboardingCardActions(explore = { explored++ }, finish = { finished++ }, openGame = { game++ }),
        )

        compose.onNodeWithTag("onboarding.recap.explore").performClick()
        compose.onNodeWithTag("onboarding.recap.done").performClick()
        compose.onNodeWithTag("onboarding.recap.game").performClick()
        assertThat(listOf(explored, finished, game)).containsExactly(1, 1, 1)
    }

    @Test
    fun `la carte e-mail renvoie le lien`() {
        var resent = 0
        show(
            OnboardingUiState(card = step(OnboardingStepId.EMAIL), accountEmail = "a@b.me"),
            OnboardingCardActions(resendVerificationLink = { resent++ }),
        )

        compose.onNodeWithTag("onboarding.email.resend").performClick()
        assertThat(resent).isEqualTo(1)
    }

    @Test
    fun `la carte e-mail dit une fois quoi toucher, sans ligne d'attente`() {
        show(OnboardingUiState(card = step(OnboardingStepId.EMAIL), accountEmail = "a@b.me"))

        compose.onNodeWithText("Tap the link we sent to confirm your account.").assertExists()
        compose.onNodeWithText("Sent to a@b.me").assertExists()
        compose.onAllNodesWithText("We'll move on as soon as your address is confirmed.").assertCountEquals(0)
    }

    @Test
    fun `la carte salut ne redit pas que le texte est modifiable`() {
        show(OnboardingUiState(card = step(OnboardingStepId.GLOBAL), greetingDraft = "Salut"))

        compose.onNodeWithText("Meeshy Global, where everyone hangs out.").assertExists()
        compose.onAllNodesWithText("Edit it if you like, it's yours.").assertCountEquals(0)
    }

    @Test
    fun `la carte story nomme la photo et son audience, sans promesse de modification`() {
        show(OnboardingUiState(card = step(OnboardingStepId.STORY)))

        compose.onNodeWithText("One pic, one line: a story.").assertExists()
        compose.onNodeWithText("Visible to your friends").assertExists()
    }

    @Test
    fun `la carte age ne montre plus la consigne de geste, le selecteur la porte pour le lecteur d'ecran`() {
        val gesture = context.getString(R.string.onboarding_age_picker_hint)
        show(OnboardingUiState(card = step(OnboardingStepId.AGE)))

        compose.onNodeWithText("So we can suggest the right spaces.").assertExists()
        compose.onAllNodesWithText(gesture).assertCountEquals(0)
        val state = compose.onNodeWithTag("onboarding.age.picker").fetchSemanticsNode().config
            .getOrNull(SemanticsProperties.StateDescription)
        assertThat(state).isEqualTo(gesture)
    }

    @Test
    fun `la carte age ne repete pas son titre en legende, le lecteur d'ecran garde le nom du champ`() {
        show(OnboardingUiState(card = step(OnboardingStepId.AGE)))

        compose.onAllNodesWithText("Date of birth").assertCountEquals(0)
        compose.onNode(hasContentDescription("Date of birth", substring = true)).assertExists()
    }

    @Test
    fun `la carte story porte son propre titre, distinct de la carte profil`() {
        show(OnboardingUiState(card = step(OnboardingStepId.STORY)))

        compose.onNodeWithText("Your story").assertExists()
        compose.onAllNodesWithText("Show yourself").assertCountEquals(0)
    }

    @Test
    fun `le recapitulatif ne dit plus que rien ne presse`() {
        show(OnboardingUiState(card = OnboardingCard.Recap, recap = OnboardingRecap(points = 12, level = 1, streakDays = 2, badges = 1)))

        compose.onNodeWithText("Tomorrow, your Flame will have burned for 3 days.").assertExists()
    }

    @Test
    fun `la carte age confirme seulement une date choisie`() {
        var declared = 0
        show(OnboardingUiState(card = step(OnboardingStepId.AGE), ageDatePicked = false), OnboardingCardActions(declareBirthDate = { declared++ }))
        compose.onNodeWithTag("onboarding.age.confirm").performClick()
        assertThat(declared).isEqualTo(0)
    }
}
