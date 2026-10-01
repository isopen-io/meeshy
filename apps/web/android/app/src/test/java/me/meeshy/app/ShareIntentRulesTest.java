package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Ce que la coque accepte quand une autre application partage a Meeshy (#8884). */
public class ShareIntentRulesTest {

    @Test
    public void onlyAnImageOrAVideoIsCopied() {
        assertTrue(ShareIntentRules.isAcceptedMime("image/png"));
        assertTrue(ShareIntentRules.isAcceptedMime("video/mp4"));
        assertTrue(ShareIntentRules.isAcceptedMime("image/*"));
        assertFalse(ShareIntentRules.isAcceptedMime("text/plain"));
        assertFalse(ShareIntentRules.isAcceptedMime("application/pdf"));
        assertFalse(ShareIntentRules.isAcceptedMime(null));
    }

    @Test
    public void aFileNameNeverEscapesItsFolder() {
        assertEquals("passwd", ShareIntentRules.fileNameFor("../../etc/passwd", "image/png", 0));
        assertEquals("a.jpg", ShareIntentRules.fileNameFor("C:\\photos\\a.jpg", "image/jpeg", 0));
        assertEquals("hidden", ShareIntentRules.fileNameFor(".hidden", "image/png", 0));
    }

    @Test
    public void aFileNameKeepsLettersOfEveryLanguage() {
        assertEquals("plage été.jpg", ShareIntentRules.fileNameFor("plage été.jpg", "image/jpeg", 0));
        assertEquals("a_b_.png", ShareIntentRules.fileNameFor("a:b*.png", "image/png", 0));
    }

    @Test
    public void aMissingNameIsNumberedAndTyped() {
        assertEquals("partage-1.jpg", ShareIntentRules.fileNameFor(null, "image/jpeg", 0));
        assertEquals("partage-3.mp4", ShareIntentRules.fileNameFor("  ", "video/mp4", 2));
        assertEquals("partage-2", ShareIntentRules.fileNameFor("", "image/*", 1));
        assertEquals("partage-1", ShareIntentRules.fileNameFor("", null, 0));
    }

    @Test
    public void aLongNameIsCut() {
        String name = "a".repeat(300) + ".png";
        assertEquals(ShareIntentRules.MAX_NAME_CHARS, ShareIntentRules.fileNameFor(name, "image/png", 0).length());
    }

    @Test
    public void theByteBudgetShrinksAndNeverGoesNegative() {
        assertEquals(ShareIntentRules.MAX_TOTAL_BYTES, ShareIntentRules.remainingBytes(0));
        assertEquals(ShareIntentRules.MAX_TOTAL_BYTES - 10, ShareIntentRules.remainingBytes(10));
        assertEquals(0L, ShareIntentRules.remainingBytes(ShareIntentRules.MAX_TOTAL_BYTES + 5));
    }

    @Test
    public void theSharedTextIsBounded() {
        assertEquals("", ShareIntentRules.boundedText(null));
        assertEquals("Salut", ShareIntentRules.boundedText("Salut"));
        assertEquals(ShareIntentRules.MAX_TEXT_CHARS, ShareIntentRules.boundedText("x".repeat(30_000)).length());
    }
    @Test
    public void onlyAnotherAppsContentIsRead() {
        assertTrue(ShareIntentRules.isForeignContent("content", "com.google.android.apps.photos.contentprovider", "me.meeshy.app"));
        assertTrue(ShareIntentRules.isForeignContent("content", "media", "me.meeshy.app"));
        // file:// lirait les fichiers PRIVES de la coque au nom d'un tiers (jeton, base, preferences).
        assertFalse(ShareIntentRules.isForeignContent("file", "", "me.meeshy.app"));
        assertFalse(ShareIntentRules.isForeignContent("FILE", null, "me.meeshy.app"));
        assertFalse(ShareIntentRules.isForeignContent(null, null, "me.meeshy.app"));
        // Notre propre FileProvider : un tiers ne fait pas sortir nos fichiers par lui.
        assertFalse(ShareIntentRules.isForeignContent("content", "me.meeshy.app.fileprovider", "me.meeshy.app"));
        assertFalse(ShareIntentRules.isForeignContent("content", "me.meeshy.app", "me.meeshy.app"));
        assertFalse(ShareIntentRules.isForeignContent("content", null, "me.meeshy.app"));
    }
}
