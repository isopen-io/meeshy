package me.meeshy.app;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import org.junit.Test;

/** L'image du presse-papier que la coque rend a « Coller » (#8640). */
public class ClipboardImageTest {

    @Test
    public void onlyAnImageTypeIsPasted() {
        assertTrue(ClipboardImage.isImage("image/png"));
        assertTrue(ClipboardImage.isImage("image/gif"));
        assertFalse(ClipboardImage.isImage("text/plain"));
        assertFalse(ClipboardImage.isImage("application/pdf"));
        assertFalse(ClipboardImage.isImage(null));
    }

    @Test
    public void anImageWithinTheCapIsReadWhole() throws IOException {
        byte[] image = new byte[] { (byte) 137, 80, 78, 71 };
        assertArrayEquals(image, ClipboardImage.readCapped(new ByteArrayInputStream(image), 4));
    }

    @Test
    public void anImageOverTheCapIsNotCarriedAcrossTheBridge() throws IOException {
        assertNull(ClipboardImage.readCapped(new ByteArrayInputStream(new byte[5]), 4));
    }

    @Test
    public void theCapLeavesRoomForAFullScreenScreenshot() {
        assertTrue(ClipboardImage.MAX_BYTES >= 16 * 1024 * 1024);
    }
}
