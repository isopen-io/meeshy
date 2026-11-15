package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.media.session.PlaybackState;
import java.util.Locale;
import java.util.TimeZone;
import org.junit.Test;

/**
 * Ce que dit et ce que permet la carte de lecture de la coque (#10624), comme
 * la carte Now Playing d'iOS (`ConversationAudioCoordinator+NowPlaying`).
 */
public class PlaybackRulesTest {

    private static final String VOICE = "Message vocal";
    private static final String PROTECTED = "Message protégé";
    private static final long OCT_14_0930_UTC = 1_760_434_200_000L;

    private static PlaybackRules.Labels labels(String sender, String conversation, Long sentAtMs, boolean protectedTrack) {
        return PlaybackRules.labels(sender, conversation, sentAtMs, protectedTrack, VOICE, PROTECTED, Locale.FRANCE, TimeZone.getTimeZone("UTC"));
    }

    @Test
    public void inAConversationTheTitleIsTheConversationAndTheDateTheArtistTheAuthor() {
        PlaybackRules.Labels labels = labels("Nour", "Famille", OCT_14_0930_UTC, false);
        assertEquals("Famille — 14/10/2025 09:30", labels.title);
        assertEquals("Nour", labels.artist);
        assertEquals("Famille", labels.album);
    }

    @Test
    public void withoutADateTheTitleIsTheConversationAlone() {
        assertEquals("Famille", labels("Nour", "Famille", null, false).title);
    }

    @Test
    public void outsideAConversationTheTitleIsTheAuthor() {
        PlaybackRules.Labels labels = labels("Nour", null, OCT_14_0930_UTC, false);
        assertEquals("Nour", labels.title);
        assertNull(labels.artist);
        assertNull(labels.album);
    }

    @Test
    public void aProtectedVoiceSaysOnlyItsAuthor() {
        PlaybackRules.Labels labels = labels("Nour", "Famille", OCT_14_0930_UTC, true);
        assertEquals("Nour", labels.title);
        assertEquals(PROTECTED, labels.artist);
        assertNull(labels.album);
    }

    @Test
    public void withoutAnyNameTheTitleIsAVoiceMessage() {
        assertEquals(VOICE, labels("  ", null, null, false).title);
        assertEquals(VOICE, labels(null, null, null, true).title);
    }

    @Test
    public void aPlayingTrackOffersPauseAndSeekButNeitherNextNorPreviousWithoutAQueue() {
        long actions = PlaybackRules.actions(true, 42_000, false, false);
        assertTrue((actions & PlaybackState.ACTION_PAUSE) != 0);
        assertTrue((actions & PlaybackState.ACTION_PLAY_PAUSE) != 0);
        assertTrue((actions & PlaybackState.ACTION_SEEK_TO) != 0);
        assertFalse((actions & PlaybackState.ACTION_PLAY) != 0);
        assertFalse((actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
        assertFalse((actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
    }

    @Test
    public void aParkedTrackOffersPlay() {
        long actions = PlaybackRules.actions(false, 42_000, false, false);
        assertTrue((actions & PlaybackState.ACTION_PLAY) != 0);
        assertFalse((actions & PlaybackState.ACTION_PAUSE) != 0);
    }

    @Test
    public void aTrackOfUnknownDurationCannotBeSeeked() {
        assertFalse((PlaybackRules.actions(true, 0, false, false) & PlaybackState.ACTION_SEEK_TO) != 0);
    }

    @Test
    public void aDeclaredQueueArmsNextAndPrevious() {
        long actions = PlaybackRules.actions(true, 42_000, true, true);
        assertTrue((actions & PlaybackState.ACTION_SKIP_TO_NEXT) != 0);
        assertTrue((actions & PlaybackState.ACTION_SKIP_TO_PREVIOUS) != 0);
    }

    @Test
    public void thePositionAdvancesWithTheRateWhilePlaying() {
        assertEquals(13_000, PlaybackRules.projected(10_000, 1.5f, 1_000, 3_000, 42_000, true));
    }

    @Test
    public void thePositionHoldsWhilePaused() {
        assertEquals(10_000, PlaybackRules.projected(10_000, 1f, 1_000, 9_000, 42_000, false));
    }

    @Test
    public void thePositionNeverPassesTheEnd() {
        assertEquals(42_000, PlaybackRules.projected(40_000, 1f, 0, 10_000, 42_000, true));
    }

    @Test
    public void skippingStaysWithinTheTrack() {
        assertEquals(25_000, PlaybackRules.skip(10_000, PlaybackRules.SKIP_MS, 42_000));
        assertEquals(42_000, PlaybackRules.skip(35_000, PlaybackRules.SKIP_MS, 42_000));
        assertEquals(0, PlaybackRules.skip(5_000, -PlaybackRules.SKIP_MS, 42_000));
    }

    @Test
    public void aSeekTargetIsClampedToTheTrack() {
        assertEquals(0, PlaybackRules.clamp(-500, 42_000));
        assertEquals(42_000, PlaybackRules.clamp(50_000, 42_000));
        assertEquals(50_000, PlaybackRules.clamp(50_000, 0));
    }

    @Test
    public void theAppBadgeSitsBottomLeftOnTheArtwork() {
        int[] badge = PlaybackRules.badge(600);
        assertEquals(24, badge[0]);
        assertEquals(420, badge[1]);
        assertEquals(180, badge[2]);
        assertEquals(576, badge[3]);
    }

    @Test
    public void numbersFromThePageAreReadWhateverTheirJsonWidth() {
        assertEquals(42_000L, PlaybackRules.millis(42_000, 0));
        assertEquals(1_760_434_200_000L, PlaybackRules.millis(1_760_434_200_000L, 0));
        assertEquals(1_500L, PlaybackRules.millis(1_499.6, 0));
        assertEquals(7L, PlaybackRules.millis("douze", 7));
        assertEquals(7L, PlaybackRules.millis(null, 7));
        assertEquals(1.5f, PlaybackRules.rate(1.5), 0f);
        assertEquals(2f, PlaybackRules.rate(2), 0f);
        assertEquals(1f, PlaybackRules.rate(null), 0f);
        assertEquals(1f, PlaybackRules.rate(-3.0), 0f);
    }

    private static PlaybackRules.Track track(long positionMs, boolean playing) {
        return track(positionMs, playing, false);
    }

    private static PlaybackRules.Track track(long positionMs, boolean playing, boolean buffering) {
        return new PlaybackRules.Track("att-1", "Nour", "Famille", OCT_14_0930_UTC, null, false, 42_000, positionMs, 1f, playing, buffering, false, false, 1_000);
    }

    @Test
    public void aTrackWaitingForTheNetworkHoldsItsPosition() {
        assertEquals(10_000, track(10_000, true, true).position(9_000));
    }

    @Test
    public void aTrackPausedLaterKeepsWhereItGot() {
        PlaybackRules.Track paused = track(10_000, true).at(4_000, false);
        assertEquals(13_000, paused.positionMs);
        assertFalse(paused.playing);
        assertEquals(13_000, paused.position(99_000));
    }

    @Test
    public void aSeekMovesTheTrackAndRestartsTheExtrapolationThere() {
        PlaybackRules.Track moved = track(10_000, true).seek(30_000, 5_000);
        assertEquals(30_000, moved.position(5_000));
        assertEquals(32_000, moved.position(7_000));
        assertTrue(moved.playing);
    }
}
