package me.meeshy.app.chat

import com.google.common.truth.Truth.assertThat
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.test.TestScope
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import me.meeshy.sdk.conversation.LocalMessage
import me.meeshy.sdk.model.ParticipantPermissions
import me.meeshy.sdk.model.game.GameActAdvance
import me.meeshy.sdk.model.game.GameActAdvanceWatch
import me.meeshy.sdk.model.game.GameMission
import me.meeshy.sdk.model.game.GameMissions
import me.meeshy.sdk.model.game.MissionDifficulty
import org.junit.Test

/** L'acte du Rêve qui avance se voit à l'envoi, puis s'efface (#17367, tranche Android #19717). */
@OptIn(ExperimentalCoroutinesApi::class)
class ChatActAdvanceControllerTest {

    private class FakeHost(override val scope: CoroutineScope, val ui: MutableStateFlow<ChatUiState>) : ChatControllerHost {
        override val conversationId = "c1"
        override val uiState: StateFlow<ChatUiState> = ui
        override val messages: StateFlow<List<LocalMessage>> = MutableStateFlow(emptyList())
        override fun reportError(message: String?) = Unit
    }

    private class Rig(
        val scope: TestScope,
        cachedAtStart: GameMissions?,
        hidden: Boolean = false,
        guest: Boolean = false,
    ) {
        var cache: GameMissions? = cachedAtStart
        var refreshes = 0
        var now = 1_000L
        val served = MutableSharedFlow<GameMissions?>(extraBufferCapacity = 8)
        val missionsUpdated = MutableSharedFlow<Unit>(extraBufferCapacity = 8)
        val ui = MutableStateFlow(
            ChatUiState(
                conversationId = "c1",
                messages = listOf(bubble("m0", isOutgoing = false)),
                composerPermissions = if (guest) ParticipantPermissions.anonymous(canSendMessages = true, canSendFiles = true, canSendImages = true) else null,
            ),
        )
        var afterRefresh: GameMissions? = null
        val controller = ChatActAdvanceController(
            cached = { cache },
            refresh = { refreshes += 1; afterRefresh?.let { cache = it } },
            served = served,
            missionsUpdated = missionsUpdated,
            hidden = { hidden },
            clock = { now },
        ).also {
            it.attach(FakeHost(scope.backgroundScope, ui))
            scope.runCurrent()
        }

        fun send(id: String) {
            ui.value = ui.value.copy(messages = ui.value.messages + bubble(id, isOutgoing = true))
            scope.runCurrent()
        }
    }

    @Test
    fun `apres un envoi, l'acte qui avance par game updated se montre puis s'efface`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2))
        rig.send("cid_1")
        rig.served.emit(day(3))
        runCurrent()
        assertThat(rig.controller.shown.value).isEqualTo(GameActAdvance(MissionDifficulty.Medium, 3, 5))
        advanceTimeBy(GameActAdvanceWatch.SHOWN_MILLIS + 1)
        assertThat(rig.controller.shown.value).isNull()
    }

    @Test
    fun `game missions-updated fait relire le bloc une fois, le guet arme seulement`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2))
        rig.missionsUpdated.emit(Unit)
        runCurrent()
        assertThat(rig.refreshes).isEqualTo(0)

        rig.send("cid_1")
        rig.afterRefresh = day(3)
        rig.missionsUpdated.emit(Unit)
        runCurrent()
        assertThat(rig.refreshes).isEqualTo(1)
        assertThat(rig.controller.shown.value).isEqualTo(GameActAdvance(MissionDifficulty.Medium, 3, 5))
    }

    @Test
    fun `sans envoi, une avancee servie ne montre rien`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2))
        rig.served.emit(day(3))
        runCurrent()
        assertThat(rig.controller.shown.value).isNull()
    }

    @Test
    fun `quinze secondes apres l'envoi, l'avancee ne lui est plus attribuee`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2))
        rig.send("cid_1")
        rig.now += GameActAdvanceWatch.ARMED_MILLIS
        rig.served.emit(day(3))
        runCurrent()
        assertThat(rig.controller.shown.value).isNull()
    }

    @Test
    fun `Jeu masque - rien ne se montre, rien ne se relit`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2), hidden = true)
        rig.send("cid_1")
        rig.served.emit(day(3))
        rig.missionsUpdated.emit(Unit)
        runCurrent()
        assertThat(rig.controller.shown.value).isNull()
        assertThat(rig.refreshes).isEqualTo(0)
    }

    @Test
    fun `un invite de lien n'arme pas le guet`() = runTest {
        val rig = Rig(this, cachedAtStart = day(2), guest = true)
        rig.send("cid_1")
        rig.served.emit(day(3))
        runCurrent()
        assertThat(rig.controller.shown.value).isNull()
    }

    private companion object {
        fun bubble(id: String, isOutgoing: Boolean) = BubbleContent(
            messageId = id, text = id, isOutgoing = isOutgoing, isTranslated = false, originalText = null,
            senderName = null, showSenderName = false, isEdited = false, isDeleted = false, createdAtIso = null,
        )

        fun act(id: String, difficulty: MissionDifficulty, progress: Int, target: Int) = GameMission(
            id = id, templateKey = "t-$id", difficulty = difficulty, signal = "message", prism = false,
            target = target, progress = progress, reward = 10, glory = 10,
        )

        fun day(medium: Int) = GameMissions(
            dayKey = "2026-11-19", prismDay = false, unlocked = true, rerollAvailable = false,
            items = listOf(act("a", MissionDifficulty.Easy, 1, 1), act("b", MissionDifficulty.Medium, medium, 5)),
        )
    }
}
