package me.meeshy.app;

import static org.junit.Assert.assertArrayEquals;
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

    /** #9845 — la fenetre flottante prend la forme de la video, comme dans Chrome Android. */
    @Test
    public void aVerticalReelFloatsInPortrait() {
        assertArrayEquals(new int[] { 1080, 1920 }, FullscreenPictureInPicture.aspect(1080, 1920));
        assertArrayEquals(new int[] { 1920, 1080 }, FullscreenPictureInPicture.aspect(1920, 1080));
    }

    @Test
    public void anExtremeShapeIsBroughtBackWithinWhatAndroidAccepts() {
        assertArrayEquals(new int[] { 100, 238 }, FullscreenPictureInPicture.aspect(100, 1000));
        assertArrayEquals(new int[] { 238, 100 }, FullscreenPictureInPicture.aspect(4000, 1000));
    }

    @Test
    public void anUnknownSizeKeepsTheSystemShape() {
        assertNull(FullscreenPictureInPicture.aspect(0, 1920));
        assertNull(FullscreenPictureInPicture.aspect(1080, 0));
        assertNull(FullscreenPictureInPicture.aspect(-1, 10));
    }
}
