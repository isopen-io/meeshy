package me.meeshy.sdk.model

import com.google.common.truth.Truth.assertThat
import me.meeshy.sdk.model.media.MediaPermissionState
import org.junit.Test

/**
 * La décision de la porte unique d'accès (caméra, micro, photos, lieu, notifications,
 * contacts) et sa machine d'état. Tout part de faits plateforme bruts : Android ne dit pas
 * « jamais demandé » ou « refus définitif », ces états se reconstruisent à partir de
 * l'historique des demandes et de `shouldShowRequestPermissionRationale`.
 */
class PermissionRequestPlanTest {

    private val microphone = AndroidPermissions.RECORD_AUDIO

    private fun facts(
        granted: Set<String> = emptySet(),
        rationale: Set<String> = emptySet(),
        requested: Set<String> = emptySet(),
        notificationsEnabled: Boolean = true,
        blocked: Boolean = false,
    ) = PermissionFacts(
        grantedPermissions = granted,
        rationalePermissions = rationale,
        requestedPermissions = requested,
        appNotificationsEnabled = notificationsEnabled,
        blockedByPolicy = blocked,
    )

    private fun stepFor(
        nature: PermissionNature,
        facts: PermissionFacts,
        sdkInt: Int = 34,
    ): PermissionStep = PermissionRequestPlan.decide(PermissionRequestPlan.snapshot(nature, sdkInt, facts))

    // ---- la décision, nature par nature ----

    @Test
    fun `a never asked microphone is explained first then requested`() {
        val step = stepFor(PermissionNature.MICROPHONE, facts())

        assertThat(step).isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.FIRST_REQUEST))
    }

    @Test
    fun `an already granted microphone proceeds without anything shown`() {
        val step = stepFor(PermissionNature.MICROPHONE, facts(granted = setOf(microphone), requested = setOf(microphone)))

        assertThat(step).isEqualTo(PermissionStep.Proceed)
    }

    @Test
    fun `a simple refusal with an explanation still possible explains again`() {
        val step = stepFor(
            PermissionNature.MICROPHONE,
            facts(requested = setOf(microphone), rationale = setOf(microphone)),
        )

        assertThat(step).isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.AFTER_REFUSAL))
    }

    @Test
    fun `asked before with no explanation possible is a definitive denial sent to the settings`() {
        val step = stepFor(PermissionNature.MICROPHONE, facts(requested = setOf(microphone)))

        assertThat(step).isEqualTo(PermissionStep.SendToSettings)
    }

    @Test
    fun `a rationale without any history still counts as a previous refusal`() {
        val step = stepFor(PermissionNature.CAMERA, facts(rationale = setOf(AndroidPermissions.CAMERA)))

        assertThat(step).isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.AFTER_REFUSAL))
    }

    @Test
    fun `a policy block never prompts even when asked for the first time`() {
        val step = stepFor(PermissionNature.CAMERA, facts(blocked = true))

        assertThat(step).isEqualTo(PermissionStep.SendToSettings)
    }

    // ---- notifications avant et après Android 13 ----

    @Test
    fun `before Android 13 notifications have no system prompt`() {
        val requirements = PermissionNature.NOTIFICATIONS.requirements(sdkInt = 32)

        assertThat(requirements.hasSystemPrompt).isFalse()
        assertThat(requirements.request).isEmpty()
    }

    @Test
    fun `before Android 13 enabled notifications proceed`() {
        val step = stepFor(PermissionNature.NOTIFICATIONS, facts(notificationsEnabled = true), sdkInt = 32)

        assertThat(step).isEqualTo(PermissionStep.Proceed)
    }

    @Test
    fun `before Android 13 muted notifications go straight to the settings`() {
        val step = stepFor(PermissionNature.NOTIFICATIONS, facts(notificationsEnabled = false), sdkInt = 32)

        assertThat(step).isEqualTo(PermissionStep.SendToSettings)
    }

    @Test
    fun `from Android 13 notifications request the post notifications permission`() {
        val requirements = PermissionNature.NOTIFICATIONS.requirements(sdkInt = 33)

        assertThat(requirements.request).containsExactly(AndroidPermissions.POST_NOTIFICATIONS)
    }

    @Test
    fun `from Android 13 never asked notifications are explained then requested`() {
        val step = stepFor(PermissionNature.NOTIFICATIONS, facts(notificationsEnabled = false), sdkInt = 33)

        assertThat(step).isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.FIRST_REQUEST))
    }

    @Test
    fun `from Android 13 granted notifications proceed`() {
        val step = stepFor(
            PermissionNature.NOTIFICATIONS,
            facts(granted = setOf(AndroidPermissions.POST_NOTIFICATIONS)),
            sdkInt = 33,
        )

        assertThat(step).isEqualTo(PermissionStep.Proceed)
    }

    // ---- photothèque : le sélecteur système n'exige rien, le reste se mappe par API ----

    @Test
    fun `photo reading maps to the legacy storage permission before Android 13`() {
        val requirements = PermissionNature.PHOTO_LIBRARY_READ.requirements(sdkInt = 32)

        assertThat(requirements.request).containsExactly(AndroidPermissions.READ_EXTERNAL_STORAGE)
    }

    @Test
    fun `photo reading maps to the media permissions on Android 13`() {
        val requirements = PermissionNature.PHOTO_LIBRARY_READ.requirements(sdkInt = 33)

        assertThat(requirements.request).containsExactly(
            AndroidPermissions.READ_MEDIA_IMAGES,
            AndroidPermissions.READ_MEDIA_VIDEO,
        )
    }

    @Test
    fun `photo reading adds the user selected permission on Android 14`() {
        val requirements = PermissionNature.PHOTO_LIBRARY_READ.requirements(sdkInt = 34)

        assertThat(requirements.request).containsExactly(
            AndroidPermissions.READ_MEDIA_IMAGES,
            AndroidPermissions.READ_MEDIA_VIDEO,
            AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED,
        )
    }

    @Test
    fun `on Android 14 a user selected grant alone is limited and usable`() {
        val snapshot = PermissionRequestPlan.snapshot(
            PermissionNature.PHOTO_LIBRARY_READ,
            sdkInt = 34,
            facts = facts(granted = setOf(AndroidPermissions.READ_MEDIA_VISUAL_USER_SELECTED)),
        )

        assertThat(snapshot.state).isEqualTo(MediaPermissionState.LIMITED)
        assertThat(PermissionRequestPlan.decide(snapshot)).isEqualTo(PermissionStep.Proceed)
    }

    @Test
    fun `on Android 14 full media grants are granted`() {
        val snapshot = PermissionRequestPlan.snapshot(
            PermissionNature.PHOTO_LIBRARY_READ,
            sdkInt = 34,
            facts = facts(granted = setOf(AndroidPermissions.READ_MEDIA_IMAGES, AndroidPermissions.READ_MEDIA_VIDEO)),
        )

        assertThat(snapshot.state).isEqualTo(MediaPermissionState.GRANTED)
    }

    @Test
    fun `saving to the gallery needs no permission from Android 10`() {
        val step = stepFor(PermissionNature.PHOTO_LIBRARY_ADD, facts(), sdkInt = 29)

        assertThat(step).isEqualTo(PermissionStep.Proceed)
    }

    @Test
    fun `saving to the gallery asks for the storage write permission before Android 10`() {
        val requirements = PermissionNature.PHOTO_LIBRARY_ADD.requirements(sdkInt = 28)

        assertThat(requirements.request).containsExactly(AndroidPermissions.WRITE_EXTERNAL_STORAGE)
    }

    @Test
    fun `an approximate location grant is enough`() {
        val step = stepFor(
            PermissionNature.LOCATION,
            facts(granted = setOf(AndroidPermissions.ACCESS_COARSE_LOCATION)),
        )

        assertThat(step).isEqualTo(PermissionStep.Proceed)
    }

    @Test
    fun `a location refusal is read across both location permissions`() {
        val step = stepFor(
            PermissionNature.LOCATION,
            facts(requested = setOf(AndroidPermissions.ACCESS_FINE_LOCATION, AndroidPermissions.ACCESS_COARSE_LOCATION)),
        )

        assertThat(step).isEqualTo(PermissionStep.SendToSettings)
    }

    @Test
    fun `history of one permission does not leak onto another nature`() {
        val step = stepFor(PermissionNature.CAMERA, facts(requested = setOf(microphone)))

        assertThat(step).isEqualTo(PermissionStep.ExplainThenRequest(PermissionExplainReason.FIRST_REQUEST))
    }

    // ---- la machine d'état : jamais de boîte système sans explication, reprise de l'intention ----

    private fun snapshotOf(nature: PermissionNature, facts: PermissionFacts, sdkInt: Int = 34) =
        PermissionRequestPlan.snapshot(nature, sdkInt, facts)

    private fun reduce(state: PermissionFlowState, vararg events: PermissionFlowEvent): PermissionFlowTransition =
        events.fold(PermissionFlowTransition(state)) { acc, event -> PermissionFlowReducer.reduce(acc.state, event) }

    private val neverAsked = snapshotOf(PermissionNature.MICROPHONE, facts())
    private val granted = snapshotOf(PermissionNature.MICROPHONE, facts(granted = setOf(microphone), requested = setOf(microphone)))
    private val simpleRefusal = snapshotOf(
        PermissionNature.MICROPHONE,
        facts(requested = setOf(microphone), rationale = setOf(microphone)),
    )
    private val definitiveDenial = snapshotOf(PermissionNature.MICROPHONE, facts(requested = setOf(microphone)))

    @Test
    fun `a granted access runs the intent at once with nothing shown`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, granted),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.RunIntent)
    }

    @Test
    fun `the first request shows the explanation and launches no system prompt`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
        )

        assertThat(transition.state).isEqualTo(
            PermissionFlowState.Explaining(PermissionNature.MICROPHONE, PermissionExplainReason.FIRST_REQUEST, true),
        )
        assertThat(transition.effect).isNull()
    }

    @Test
    fun `continuing from the explanation launches the system prompt`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
            PermissionFlowEvent.Accepted,
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.AwaitingSystem(PermissionNature.MICROPHONE, true))
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.LaunchSystemRequest(PermissionNature.MICROPHONE))
    }

    @Test
    fun `the system prompt is never launched without the explanation first`() {
        val transition = reduce(PermissionFlowState.Idle, PermissionFlowEvent.Accepted)

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isNull()
    }

    @Test
    fun `dismissing the explanation abandons the intent`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
            PermissionFlowEvent.Dismissed,
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.AbandonIntent)
    }

    @Test
    fun `an accepted system prompt runs the intent`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
            PermissionFlowEvent.Accepted,
            PermissionFlowEvent.SystemAnswered(granted),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.RunIntent)
    }

    @Test
    fun `a simple refusal abandons the intent without a card and explains again next time`() {
        val afterRefusal = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
            PermissionFlowEvent.Accepted,
            PermissionFlowEvent.SystemAnswered(simpleRefusal),
        )
        val nextRequest = reduce(
            afterRefusal.state,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, simpleRefusal),
        )

        assertThat(afterRefusal.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(afterRefusal.effect).isEqualTo(PermissionFlowEffect.AbandonIntent)
        assertThat(nextRequest.state).isEqualTo(
            PermissionFlowState.Explaining(PermissionNature.MICROPHONE, PermissionExplainReason.AFTER_REFUSAL, true),
        )
    }

    @Test
    fun `a definitive denial after the prompt shows the settings card`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, neverAsked),
            PermissionFlowEvent.Accepted,
            PermissionFlowEvent.SystemAnswered(definitiveDenial),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
        assertThat(transition.effect).isNull()
    }

    @Test
    fun `an already definitive denial shows the card without any prompt`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.MICROPHONE, definitiveDenial),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
    }

    @Test
    fun `a caller that handles its own fallback gets no card on denial`() {
        val transition = reduce(
            PermissionFlowState.Idle,
            PermissionFlowEvent.Requested(PermissionNature.CAMERA, definitiveDenial, announcesRefusal = false),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.AbandonIntent)
    }

    @Test
    fun `the settings button opens the app settings and keeps the card`() {
        val transition = reduce(
            PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE),
            PermissionFlowEvent.OpenSettingsTapped,
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.OpenSettings)
    }

    @Test
    fun `coming back from the settings with the access granted closes the card and resumes the intent`() {
        val transition = reduce(
            PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE),
            PermissionFlowEvent.OpenSettingsTapped,
            PermissionFlowEvent.Resumed(granted),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.RunIntent)
    }

    @Test
    fun `coming back from the settings still denied keeps the card`() {
        val transition = reduce(
            PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE),
            PermissionFlowEvent.Resumed(definitiveDenial),
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE))
        assertThat(transition.effect).isNull()
    }

    @Test
    fun `returning to the foreground after the system prompt does not resume anything`() {
        val awaiting = PermissionFlowState.AwaitingSystem(PermissionNature.MICROPHONE, true)

        val transition = reduce(awaiting, PermissionFlowEvent.Resumed(granted))

        assertThat(transition.state).isEqualTo(awaiting)
        assertThat(transition.effect).isNull()
    }

    @Test
    fun `dismissing the card abandons the intent`() {
        val transition = reduce(
            PermissionFlowState.NeedsSettings(PermissionNature.MICROPHONE),
            PermissionFlowEvent.Dismissed,
        )

        assertThat(transition.state).isEqualTo(PermissionFlowState.Idle)
        assertThat(transition.effect).isEqualTo(PermissionFlowEffect.AbandonIntent)
    }

    @Test
    fun `a second request while one is in flight is ignored`() {
        val awaiting = PermissionFlowState.AwaitingSystem(PermissionNature.MICROPHONE, true)

        val transition = reduce(awaiting, PermissionFlowEvent.Requested(PermissionNature.CAMERA, neverAsked))

        assertThat(transition.state).isEqualTo(awaiting)
        assertThat(transition.effect).isNull()
    }
}
