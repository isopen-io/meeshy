package me.meeshy.app.game.photo

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.io.File
import java.nio.file.Files
import kotlinx.coroutines.runBlocking
import me.meeshy.sdk.model.game.GamePhotoBlock
import me.meeshy.sdk.model.game.GamePhotoMomentRow
import me.meeshy.sdk.model.game.PhotoAlertMemory
import me.meeshy.sdk.model.game.PhotoAlertPacing
import me.meeshy.sdk.model.game.PhotoCatchUpStanding
import me.meeshy.sdk.model.game.PhotoInvitationsSetting
import me.meeshy.sdk.model.game.photo.NotebookEntry
import me.meeshy.sdk.model.game.photo.NotebookStatus
import org.junit.After
import org.junit.Test

/**
 * La file des invitations à immortaliser, côté app (#20783, tranche Android de #20643) : iso de `GamePhotoInvitations`
 * (iOS, #20775) et de `createPhotoAlerts` (`apps/web/src/lib/game-photo/alerts.ts`), témoins repris de
 * `GamePhotoInvitationsTests` et de `alerts.test.ts`.
 */
class GamePhotoInvitationsTest {

    private val now = 1_792_670_400_000L
    private val hour = 3_600_000L
    private val root: File = Files.createTempDirectory("photo-alerts").toFile()

    @After fun tearDown() {
        root.deleteRecursively()
    }

    private class Memories : PhotoAlertMemoryStoring {
        val stored = mutableMapOf<String, PhotoAlertMemory>()
        var refuses = false

        override fun memory(userId: String): PhotoAlertMemory = stored[userId] ?: PhotoAlertMemory.Empty

        override fun store(memory: PhotoAlertMemory, userId: String): Boolean {
            if (refuses) return false
            stored[userId] = memory
            return true
        }
    }

    private class Sut(
        val invitations: GamePhotoInvitations,
        val memories: Memories,
        val notebook: FakePhotoNotebook,
        val acknowledgements: MutableList<List<String>>,
    )

    private fun sut(
        sessionStartedAt: Long? = now - hour,
        memories: Memories = Memories(),
        notebook: FakePhotoNotebook = FakePhotoNotebook(),
    ): Sut {
        val acknowledgements = mutableListOf<List<String>>()
        val invitations = GamePhotoInvitations(
            memories = memories,
            notebook = { notebook },
            acknowledge = { acknowledgements += it },
            now = { now },
            sessionStartedAt = sessionStartedAt,
        )
        return Sut(invitations, memories, notebook, acknowledgements)
    }

    private fun flame(days: Int) = PhotoCatchUpStanding(flameRecord = days)

    private fun photo(invitations: PhotoInvitationsSetting = PhotoInvitationsSetting.Every, moments: List<GamePhotoMomentRow> = emptyList()) =
        GamePhotoBlock(invitations = invitations, moments = moments)

    /** Une Flamme de 6 jours posée, puis une Flamme de 7 constatée : l'invitation attend un geste. */
    private suspend fun pendingSevenDays(sut: Sut): PendingPhotoInvitation? {
        sut.invitations.observe("u1", flame(6), photo = null)
        sut.invitations.observe("u1", flame(7), photo = null)
        return sut.invitations.pending.value
    }

    // Les lectures du jeu

    @Test
    fun `la premiere lecture d'un compte pose la ligne de base sans invitation`() = runBlocking<Unit> {
        val sut = sut()

        val outcome = sut.invitations.observe("u1", flame(30), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.Baseline)
        assertThat(sut.invitations.pending.value).isNull()
        assertThat(sut.memories.stored["u1"]?.standing).isEqualTo(flame(30))
    }

    @Test
    fun `une etape franchie depuis la ligne de base tient l'invitation et avance la situation`() = runBlocking<Unit> {
        val sut = sut()

        sut.invitations.observe("u1", flame(6), photo = null)
        val outcome = sut.invitations.observe("u1", flame(7), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.Alert)
        val pending = sut.invitations.pending.value
        assertThat(pending?.announce?.id).isEqualTo("flame:7")
        assertThat(pending?.propose?.id).isEqualTo("flame:7")
        assertThat(pending?.userId).isEqualTo("u1")
        assertThat(sut.memories.stored["u1"]?.standing).isEqualTo(flame(7))
    }

    @Test
    fun `pendant qu'une invitation attend la suivante attend sans avancer la situation`() = runBlocking<Unit> {
        val sut = sut()
        pendingSevenDays(sut)

        val outcome = sut.invitations.observe("u1", flame(30), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.Busy)
        assertThat(sut.invitations.pending.value?.announce?.id).isEqualTo("flame:7")
        assertThat(sut.memories.stored["u1"]?.standing).isEqualTo(flame(7))
    }

    @Test
    fun `une etape que le carnet connait deja n'invite rien`() = runBlocking<Unit> {
        val seven = GamePhotoInvitations.moment("flame:7", flame(7))
        assertThat(seven).isNotNull()
        val sut = sut(notebook = FakePhotoNotebook(initial = listOf(NotebookEntry(seven!!, NotebookStatus.Pending, createdAt = 1L))))

        sut.invitations.observe("u1", flame(6), photo = null)
        val outcome = sut.invitations.observe("u1", flame(7), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.None)
        assertThat(sut.invitations.pending.value).isNull()
        assertWithMessage("la situation avance quand même").that(sut.memories.stored["u1"]?.standing).isEqualTo(flame(7))
    }

    @Test
    fun `une etape presentee sur un autre appareil n'invite rien`() = runBlocking<Unit> {
        val sut = sut()
        val served = photo(moments = listOf(GamePhotoMomentRow(stepId = "flame:7", presentedAt = "2026-10-22T10:00:00Z")))

        sut.invitations.observe("u1", flame(6), served)
        val outcome = sut.invitations.observe("u1", flame(7), served)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.None)
        assertThat(sut.invitations.pending.value).isNull()
    }

    @Test
    fun `le reglage jamais n'invite rien mais la situation avance`() = runBlocking<Unit> {
        val sut = sut()
        val never = photo(invitations = PhotoInvitationsSetting.Never)

        sut.invitations.observe("u1", flame(6), never)
        val outcome = sut.invitations.observe("u1", flame(7), never)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.None)
        assertThat(sut.memories.stored["u1"]?.standing).isEqualTo(flame(7))
    }

    @Test
    fun `pendant la grace de la seance l'etape attend sans toucher la memoire`() = runBlocking<Unit> {
        val sut = sut(sessionStartedAt = now)
        sut.invitations.observe("u1", flame(6), photo = null)

        val outcome = sut.invitations.observe("u1", flame(7), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.Wait)
        assertThat(sut.invitations.pending.value).isNull()
        assertThat(sut.memories.stored["u1"]?.standing).isEqualTo(flame(6))
    }

    @Test
    fun `chaque compte a sa propre memoire`() = runBlocking<Unit> {
        val sut = sut()
        sut.invitations.observe("u1", flame(6), photo = null)

        val outcome = sut.invitations.observe("u2", flame(7), photo = null)

        assertWithMessage("un autre compte de l'appareil commence par sa propre ligne de base")
            .that(outcome).isEqualTo(GamePhotoInvitations.Outcome.Baseline)
        assertThat(sut.invitations.pending.value).isNull()
    }

    @Test
    fun `quand le disque refuse la memoire tient pour la seance`() = runBlocking<Unit> {
        val memories = Memories().apply { refuses = true }
        val sut = sut(memories = memories)

        sut.invitations.observe("u1", flame(6), photo = null)
        val outcome = sut.invitations.observe("u1", flame(7), photo = null)

        assertThat(outcome).isEqualTo(GamePhotoInvitations.Outcome.Alert)
        assertThat(memories.stored["u1"]).isNull()
    }

    // Les gestes

    @Test
    fun `l'invitation affichee s'accuse une fois et compte pour le rythme`() = runBlocking<Unit> {
        val sut = sut()
        val invitation = pendingSevenDays(sut)!!

        sut.invitations.displayed(invitation)
        sut.invitations.displayed(invitation)

        assertThat(sut.acknowledgements).containsExactly(listOf("flame:7"))
        assertThat(sut.memories.stored["u1"]?.shown).hasSize(1)
        assertWithMessage("la pastille du carnet s'allume").that(sut.invitations.hasNotice.value).isTrue()
    }

    @Test
    fun `une invitation qui n'attend plus ne s'accuse pas`() = runBlocking<Unit> {
        val sut = sut()
        val invitation = pendingSevenDays(sut)!!
        sut.invitations.consume()

        sut.invitations.displayed(invitation)

        assertThat(sut.acknowledgements).isEmpty()
    }

    @Test
    fun `immortaliser rend l'invitation et libere la file`() = runBlocking<Unit> {
        val sut = sut()
        val invitation = pendingSevenDays(sut)!!

        assertThat(sut.invitations.consume()).isEqualTo(invitation)
        assertThat(sut.invitations.pending.value).isNull()
        assertThat(sut.invitations.consume()).isNull()
    }

    @Test
    fun `plus tard libere la file et le moment propose attend au carnet`() = runBlocking<Unit> {
        val sut = sut()
        assertThat(pendingSevenDays(sut)).isNotNull()

        assertThat(sut.invitations.later()).isTrue()

        assertThat(sut.invitations.pending.value).isNull()
        assertThat(sut.notebook.postponed.map { it.id }).containsExactly("flame:7")
        assertThat(sut.invitations.later()).isFalse()
    }

    @Test
    fun `la visite du carnet eteint la pastille`() = runBlocking<Unit> {
        val sut = sut()
        val invitation = pendingSevenDays(sut)!!
        sut.invitations.displayed(invitation)

        sut.invitations.carnetVisited("u1")

        assertThat(sut.invitations.hasNotice.value).isFalse()
        assertThat(sut.memories.stored["u1"]?.noticed).isEmpty()
    }

    // La mémoire sur disque

    @Test
    fun `la memoire vit dans le dossier du jeu du compte et se relit`() {
        val file = GamePhotoAlertMemoryFile(root)
        val memory = PhotoAlertMemory(standing = flame(7), shown = listOf(PhotoAlertPacing.Shown(at = 1, dayKey = "2026-10-22")), noticed = listOf("flame:7"))

        assertThat(file.store(memory, "u1")).isTrue()

        assertThat(GamePhotoAlertMemoryFile(root).memory("u1")).isEqualTo(memory)
        assertWithMessage("la mémoire part avec le dossier du jeu du compte")
            .that(file.file("u1").parentFile).isEqualTo(GamePhotoNotebook.folder(root, "u1").parentFile)
        assertThat(file.memory("u2")).isEqualTo(PhotoAlertMemory.Empty)
    }

    @Test
    fun `une memoire illisible se lit vide`() {
        val file = GamePhotoAlertMemoryFile(root)
        file.file("u1").apply { parentFile.mkdirs() }.writeText("pas du json")

        assertThat(file.memory("u1")).isEqualTo(PhotoAlertMemory.Empty)
    }
}
