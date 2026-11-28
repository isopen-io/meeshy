package me.meeshy.sdk.model.game

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import java.time.ZoneId
import org.junit.Test

/**
 * La file des invitations à immortaliser (#20655, tranche Android de #20643) : miroir de `createPhotoAlerts`
 * (`apps/web/src/lib/game-photo/alerts.ts`) et de `GamePhotoAlertQueue` (SDK Swift, #20653), témoins tirés de
 * `alerts.test.ts` et de `GamePhotoAlertQueueTests`. La loi est pure : la mémoire appareil d'un compte entre, la mémoire
 * suivante et la décision sortent ; l'hôte de l'app la range et accuse.
 */
class GamePhotoAlertQueueTest {

    private val minute = 60_000L
    private val hour = 60 * minute
    private val t0 = 1_792_670_400_000L

    private fun standing(flame: Int = 0, minted: Int = 0) = PhotoCatchUpStanding(flameRecord = flame, minted = minted)

    private fun photo(
        invitations: PhotoInvitationsSetting = PhotoInvitationsSetting.Every,
        baseline: PhotoCatchUpStanding? = null,
        moments: List<GamePhotoMomentRow> = emptyList(),
    ) = GamePhotoBlock(
        invitations = invitations,
        baseline = baseline?.let {
            GamePhotoBaseline(it.rank, it.division, it.levelRecord, it.prestige, it.minted, it.treasuryTier, it.flameRecord, it.pastCycleRecords)
        },
        moments = moments,
    )

    private fun pacing(
        memory: PhotoAlertMemory,
        now: Long = t0,
        sessionStartedAt: Long? = t0 - hour,
        surface: PhotoAlertPacing.Surface = PhotoAlertPacing.Surface.Passive,
    ) = PhotoAlertPacing(now = now, dayKey = "2026-10-22", sessionStartedAt = sessionStartedAt, surface = surface, shown = memory.shown)

    /** Une lecture passive complète : observer, puis décider si une étape neuve est trouvée. */
    private fun read(
        memory: PhotoAlertMemory,
        standing: PhotoCatchUpStanding,
        photo: GamePhotoBlock? = null,
        known: List<String> = emptyList(),
        now: Long = t0,
        sessionStartedAt: Long? = t0 - hour,
    ): Pair<GamePhotoAlertQueue.Decision, PhotoAlertMemory> =
        when (val observed = GamePhotoAlertQueue.observe(memory, standing, photo)) {
            is GamePhotoAlertQueue.Observation.Baseline -> GamePhotoAlertQueue.Decision.None(observed.memory) to observed.memory
            is GamePhotoAlertQueue.Observation.Unchanged -> {
                val next = observed.memory ?: memory
                GamePhotoAlertQueue.Decision.None(next) to next
            }
            is GamePhotoAlertQueue.Observation.Reached -> {
                val decision = GamePhotoAlertQueue.decide(
                    memory = memory,
                    reached = observed.stepIds,
                    standing = standing,
                    photo = photo,
                    notebookKept = emptyList(),
                    notebookKnown = known,
                    pacing = pacing(memory, now = now, sessionStartedAt = sessionStartedAt),
                )
                decision to (decision.memory ?: memory)
            }
        }

    private fun alertOf(decision: GamePhotoAlertQueue.Decision): PhotoAlert? = (decision as? GamePhotoAlertQueue.Decision.Alert)?.alert

    @Test
    fun `la premiere lecture d'un compte n'alerte pas, la situation est gardee`() {
        val observed = GamePhotoAlertQueue.observe(PhotoAlertMemory.Empty, standing(flame = 30), photo = null)
        assertThat(observed).isEqualTo(GamePhotoAlertQueue.Observation.Baseline(PhotoAlertMemory(standing(flame = 30), emptyList(), emptyList())))
    }

    @Test
    fun `la Flamme constatee a 7 jours apres la ligne de base est annoncee et proposee`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 6))
        val (decision, next) = read(memory, standing(flame = 7))
        assertThat(alertOf(decision)).isEqualTo(PhotoAlert(announce = "flame:7", propose = "flame:7", reached = listOf("flame:7")))
        assertWithMessage("la situation avance dès qu'une étape est décidée").that(next.standing).isEqualTo(standing(flame = 7))
    }

    @Test
    fun `la dixieme Meesh sans la premiere annonce Meesh 10 et propose Meesh 1`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(minted = 9))
        val (decision, _) = read(memory, standing(minted = 10))
        assertThat(alertOf(decision)?.announce).isEqualTo("meesh:10")
        assertThat(alertOf(decision)?.propose).isEqualTo("meesh:1")
    }

    @Test
    fun `pendant le delai de grace l'etape passive attend sans toucher la memoire`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 6))
        val (waiting, kept) = read(memory, standing(flame = 7), sessionStartedAt = t0)
        assertThat(waiting).isEqualTo(GamePhotoAlertQueue.Decision.Wait)
        assertThat(waiting.memory).isNull()
        assertThat(kept).isEqualTo(memory)
        val (later, _) = read(kept, standing(flame = 7), now = t0 + 11 * minute, sessionStartedAt = t0)
        assertThat(alertOf(later)?.propose).isEqualTo("flame:7")
    }

    @Test
    fun `notifiee, presentee ou immortalisee ailleurs, l'etape ne s'annonce pas et ne reste pas en embuscade`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 6))
        listOf(
            GamePhotoMomentRow("flame:7", notifiedAt = "2026-10-22T10:00:00Z"),
            GamePhotoMomentRow("flame:7", presentedAt = "2026-10-22T10:00:00Z"),
            GamePhotoMomentRow("flame:7", keptAt = "2026-10-22T10:00:00Z"),
        ).forEach { row ->
            val (decision, next) = read(memory, standing(flame = 7), photo = photo(moments = listOf(row)))
            assertThat(decision).isEqualTo(GamePhotoAlertQueue.Decision.None(next))
            assertThat(read(next, standing(flame = 7)).first).isEqualTo(GamePhotoAlertQueue.Decision.None(next))
        }
    }

    @Test
    fun `le reglage jamais tait l'invitation mais la situation avance`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 6))
        val (decision, next) = read(memory, standing(flame = 7), photo = photo(invitations = PhotoInvitationsSetting.Never))
        assertThat(alertOf(decision)).isNull()
        assertThat(next.standing).isEqualTo(standing(flame = 7))
    }

    @Test
    fun `la ligne de base servie l'emporte sur celle de l'appareil`() {
        val served = photo(baseline = standing(flame = 7))
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 6), photo = served)
        assertThat(alertOf(read(memory, standing(flame = 7), photo = served).first)).isNull()
    }

    @Test
    fun `une etape que le carnet de l'appareil connait ne se repropose pas`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(minted = 9))
        assertThat(alertOf(read(memory, standing(minted = 10), known = listOf("meesh:1")).first)).isNull()
    }

    @Test
    fun `rien de neuf, la memoire ne se reecrit que si la situation a bouge`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(flame = 8))
        assertThat(GamePhotoAlertQueue.observe(memory, standing(flame = 8), photo = null)).isEqualTo(GamePhotoAlertQueue.Observation.Unchanged(null))
        assertThat(GamePhotoAlertQueue.observe(memory, standing(flame = 9), photo = null))
            .isEqualTo(GamePhotoAlertQueue.Observation.Unchanged(PhotoAlertMemory(standing(flame = 9), emptyList(), emptyList())))
    }

    @Test
    fun `afficher l'invitation accuse les etapes atteintes et l'etape proposee, et regle le rythme`() {
        val (_, memory) = read(PhotoAlertMemory.Empty, standing(minted = 9))
        val (decision, next) = read(memory, standing(minted = 10))
        val alert = alertOf(decision)!!
        val shown = GamePhotoAlertQueue.displayed(next, alert, at = t0, dayKey = "2026-10-22")
        assertThat(shown.acknowledge).containsExactly("meesh:10", "meesh:1").inOrder()
        assertThat(shown.memory.shown).containsExactly(PhotoAlertPacing.Shown(at = t0, dayKey = "2026-10-22"))
        assertThat(shown.memory.noticed).containsExactly("meesh:10", "meesh:1").inOrder()
        val (silent, _) = read(shown.memory, standing(flame = 7, minted = 10), now = t0 + hour)
        assertWithMessage("l'écart minimal et le plafond du jour rendent la suivante silencieuse").that(alertOf(silent)).isNull()
    }

    @Test
    fun `le rythme ne garde que les douze dernieres invitations montrees`() {
        val alert = PhotoAlert(announce = "flame:7", propose = "flame:7", reached = listOf("flame:7"))
        val memory = (0L until 20L).fold(PhotoAlertMemory.Empty) { memory, index ->
            GamePhotoAlertQueue.displayed(memory, alert, at = index, dayKey = "2026-10-22").memory
        }
        assertThat(memory.shown).hasSize(GamePhotoAlertQueue.SHOWN_KEPT)
        assertThat(memory.shown.first().at).isEqualTo(8L)
        assertThat(memory.noticed).containsExactly("flame:7")
    }

    @Test
    fun `un geste ignore le delai de grace et la journee cede a une etape de piste`() {
        assertThat(GamePhotoAlertQueue.admitted(listOf("flame:7", "day:2026-10-22"))).containsExactly("flame:7")
        assertThat(GamePhotoAlertQueue.admitted(listOf("day:2026-10-22"))).containsExactly("day:2026-10-22")
        val memory = PhotoAlertMemory(standing(flame = 6), emptyList(), emptyList())
        val decision = GamePhotoAlertQueue.decide(
            memory = memory,
            reached = listOf("flame:7"),
            standing = standing(flame = 7),
            photo = null,
            notebookKept = emptyList(),
            notebookKnown = emptyList(),
            pacing = pacing(memory, sessionStartedAt = t0, surface = PhotoAlertPacing.Surface.Gesture),
        )
        assertThat(alertOf(decision)?.propose).isEqualTo("flame:7")
    }

    @Test
    fun `la pastille s'eteint a la visite du carnet`() {
        val memory = PhotoAlertMemory(standing(), emptyList(), listOf("flame:7"))
        assertThat(memory.hasNotice).isTrue()
        assertThat(GamePhotoAlertQueue.carnetVisited(memory).hasNotice).isFalse()
    }

    @Test
    fun `la memoire se range et se relit a l'identique, illisible elle vaut vide`() {
        val memory = PhotoAlertMemory(
            standing = PhotoCatchUpStanding(
                rank = GloryRank.Ambassadeur,
                division = 4,
                levelRecord = 30,
                minted = 12,
                treasuryTier = TreasuryTierKey.Coffret,
                flameRecord = 9,
                pastCycleRecords = listOf(40, 12),
            ),
            shown = listOf(PhotoAlertPacing.Shown(at = t0, dayKey = "2026-10-22")),
            noticed = listOf("rank:ambassadeur:4"),
        )
        assertThat(PhotoAlertMemory.read(memory.encoded())).isEqualTo(memory)
        assertThat(PhotoAlertMemory.read(PhotoAlertMemory.Empty.encoded())).isEqualTo(PhotoAlertMemory.Empty)
        assertThat(PhotoAlertMemory.read("""{"standing":{"rank":"astre"}}""")).isEqualTo(PhotoAlertMemory.Empty)
        assertThat(PhotoAlertMemory.read("""{"standing":null,"shown":[{"at":"hier"}],"noticed":[]}""")).isEqualTo(PhotoAlertMemory.Empty)
        assertThat(PhotoAlertMemory.read("pas du json")).isEqualTo(PhotoAlertMemory.Empty)
        assertThat(PhotoAlertMemory.read(null)).isEqualTo(PhotoAlertMemory.Empty)
    }

    @Test
    fun `la memoire d'un web ou d'un iOS anterieur se relit, les champs absents valent vide`() {
        assertThat(PhotoAlertMemory.read("""{"standing":{"rank":"murmure","division":5,"levelRecord":1,"prestige":0,"minted":0,"flameRecord":3}}"""))
            .isEqualTo(PhotoAlertMemory(standing(flame = 3), emptyList(), emptyList()))
    }

    @Test
    fun `la journee locale se lit dans le fuseau donne`() {
        val lateEvening = 1_792_699_200_000L
        assertThat(GamePhotoAlertQueue.dayKey(lateEvening, ZoneId.of("Europe/Paris"))).isEqualTo("2026-10-22")
        assertThat(GamePhotoAlertQueue.dayKey(lateEvening, ZoneId.of("Asia/Tokyo"))).isEqualTo("2026-10-23")
    }
}
