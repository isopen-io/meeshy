package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Une video en plein ecran flotte quand on quitte l'app, comme dans Chrome Android (#9242). */
public class FullscreenPictureInPictureTest {

    @Test
    public void aFullscreenVideoFloatsWhenTheUserLeaves() {
        assertTrue(FullscreenPictureInPicture.floats(26, true, true));
        assertTrue(FullscreenPictureInPicture.floats(36, true, true));
    }

    @Test
    public void nothingFloatsOutsideFullscreen() {
        assertFalse(FullscreenPictureInPicture.floats(36, false, true));
    }

    @Test
    public void nothingFloatsBeforeApi26() {
        assertFalse(FullscreenPictureInPicture.floats(25, true, true));
    }

    @Test
    public void nothingFloatsWhenTheDeviceHasNoPictureInPicture() {
        assertFalse(FullscreenPictureInPicture.floats(36, true, false));
    }

    /** #9847 — le bouton de la fenetre flottante d'une video, comme dans Chrome Android. */
    @Test
    public void aPlayingVideoOffersPause() {
        assertEquals("pause", FullscreenPictureInPicture.toggleAction(Boolean.TRUE));
    }

    @Test
    public void aPausedVideoOffersPlay() {
        assertEquals("play", FullscreenPictureInPicture.toggleAction(Boolean.FALSE));
    }

    @Test
    public void noButtonWhileThePageHasNotToldTheState() {
        assertNull(FullscreenPictureInPicture.toggleAction(null));
    }
}
