package me.meeshy.app.stories

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StoryReaderDragOwnershipTest {
    private val frames = StoryDragFrames(
        rail = StoryDragRegion(300f, 200f, 360f, 600f),
        reactionBar = StoryDragRegion(20f, 300f, 280f, 360f),
        composer = StoryDragRegion(0f, 700f, 360f, 760f),
    )

    @Test
    fun `un glissé né sur la scène appartient au lecteur`() {
        assertThat(StoryReaderDragOwnership.ownerAt(150f, 150f, frames)).isEqualTo(StoryDragOwner.Reader)
    }

    @Test
    fun `chaque cadre désigne son propriétaire`() {
        assertThat(StoryReaderDragOwnership.ownerAt(330f, 400f, frames)).isEqualTo(StoryDragOwner.Rail)
        assertThat(StoryReaderDragOwnership.ownerAt(100f, 330f, frames)).isEqualTo(StoryDragOwner.ReactionBar)
        assertThat(StoryReaderDragOwnership.ownerAt(100f, 730f, frames)).isEqualTo(StoryDragOwner.Composer)
    }

    @Test
    fun `le panneau défilant prime et son bord inconnu lui donne tout`() {
        val open = frames.copy(hasScrollableSurface = true, scrollableSurfaceTop = 400f)
        assertThat(StoryReaderDragOwnership.ownerAt(100f, 450f, open)).isEqualTo(StoryDragOwner.ScrollableSurface)
        assertThat(StoryReaderDragOwnership.ownerAt(100f, 150f, open)).isEqualTo(StoryDragOwner.Reader)
        val unknown = frames.copy(hasScrollableSurface = true, scrollableSurfaceTop = null)
        assertThat(StoryReaderDragOwnership.ownerAt(100f, 10f, unknown)).isEqualTo(StoryDragOwner.ScrollableSurface)
    }

    @Test
    fun `rail composeur et panneau cèdent tous les axes la barre seulement l'horizontal`() {
        listOf(StoryDragOwner.Rail, StoryDragOwner.Composer, StoryDragOwner.ScrollableSurface).forEach {
            assertThat(StoryReaderDragOwnership.yieldsEverything(it)).isTrue()
            assertThat(StoryReaderDragOwnership.yieldsHorizontalAxis(it)).isTrue()
        }
        assertThat(StoryReaderDragOwnership.yieldsEverything(StoryDragOwner.ReactionBar)).isFalse()
        assertThat(StoryReaderDragOwnership.yieldsHorizontalAxis(StoryDragOwner.ReactionBar)).isTrue()
        assertThat(StoryReaderDragOwnership.yieldsHorizontalAxis(StoryDragOwner.Reader)).isFalse()
    }

    @Test
    fun `l'axe se décide à huit dp de domination puis se garde`() {
        val tracker = StoryReaderDragTracker()
        assertThat(tracker.track(8f, 0f, featureAtStart = false, horizontalYields = false)).isEqualTo(StoryDragAxis.Undecided)
        assertThat(tracker.track(9f, 0f, featureAtStart = false, horizontalYields = false)).isEqualTo(StoryDragAxis.Horizontal)
        assertThat(tracker.track(0f, 90f, featureAtStart = false, horizontalYields = false)).isEqualTo(StoryDragAxis.Horizontal)
        assertThat(tracker.isInFlight).isTrue()
    }

    @Test
    fun `l'horizontal cédé ne prend aucun axe`() {
        val tracker = StoryReaderDragTracker()
        assertThat(tracker.track(40f, 0f, featureAtStart = false, horizontalYields = true)).isEqualTo(StoryDragAxis.Undecided)
        assertThat(tracker.isInFlight).isFalse()
    }

    @Test
    fun `la surface ouverte est photographiée à la décision verticale et se consomme à la fin`() {
        val tracker = StoryReaderDragTracker()
        tracker.track(0f, 30f, featureAtStart = true, horizontalYields = false)
        tracker.track(0f, 60f, featureAtStart = false, horizontalYields = false)
        assertThat(tracker.finish()).isEqualTo(StoryReaderDragTracker.Ended(StoryDragAxis.Vertical, hadActiveFeature = true))
        assertThat(tracker.finish()).isEqualTo(StoryReaderDragTracker.Ended(StoryDragAxis.Undecided, hadActiveFeature = false))
    }

    @Test
    fun `le toucher qui a refermé la surface compte comme surface ouverte au départ`() {
        val tracker = StoryReaderDragTracker()
        tracker.featureConsumedByTouch = true
        tracker.track(0f, 30f, featureAtStart = false, horizontalYields = false)
        assertThat(tracker.finish().hadActiveFeature).isTrue()
        assertThat(tracker.featureConsumedByTouch).isFalse()
    }

    @Test
    fun `la purge libère un axe collé et incrémente le jeton`() {
        val tracker = StoryReaderDragTracker()
        tracker.owner = StoryDragOwner.Rail
        tracker.track(40f, 0f, featureAtStart = false, horizontalYields = false)
        tracker.reset()
        assertThat(tracker.isInFlight).isFalse()
        assertThat(tracker.owner).isEqualTo(StoryDragOwner.Reader)
        assertThat(tracker.resetToken).isEqualTo(1)
    }

    @Test
    fun `un changement de slide libère l'axe sans purger`() {
        val tracker = StoryReaderDragTracker()
        tracker.track(40f, 0f, featureAtStart = false, horizontalYields = false)
        tracker.releaseAxis()
        assertThat(tracker.isInFlight).isFalse()
        assertThat(tracker.resetToken).isEqualTo(0)
    }

    @Test
    fun `un glissé horizontal né sur la barre ouverte ne change pas de groupe mais le vertical garde le lecteur`() {
        val owner = StoryReaderDragOwnership.ownerAt(100f, 330f, frames)
        val tracker = StoryReaderDragTracker()

        val horizontal = tracker.track(60f, 2f, featureAtStart = true, horizontalYields = StoryReaderDragOwnership.yieldsHorizontalAxis(owner))
        assertThat(horizontal).isEqualTo(StoryDragAxis.Undecided)
        assertThat(StoryReaderDragOwnership.yieldsEverything(owner)).isFalse()

        val vertical = tracker.track(2f, 60f, featureAtStart = true, horizontalYields = StoryReaderDragOwnership.yieldsHorizontalAxis(owner))
        assertThat(vertical).isEqualTo(StoryDragAxis.Vertical)
    }

    @Test
    fun `sans barre ouverte le même geste appartient au lecteur et change de groupe`() {
        val closed = frames.copy(reactionBar = null)
        val owner = StoryReaderDragOwnership.ownerAt(100f, 330f, closed)

        assertThat(owner).isEqualTo(StoryDragOwner.Reader)
        val axis = StoryReaderDragTracker().track(60f, 2f, featureAtStart = false, horizontalYields = StoryReaderDragOwnership.yieldsHorizontalAxis(owner))
        assertThat(axis).isEqualTo(StoryDragAxis.Horizontal)
    }
}
