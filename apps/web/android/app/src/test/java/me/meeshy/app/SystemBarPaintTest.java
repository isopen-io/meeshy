package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Le fond des barres systeme suit le theme de l'app sous Android 15 (#9533). */
public class SystemBarPaintTest {

    @Test
    public void belowAndroid15TheStatusBarIsPaintedByTheShell() {
        assertTrue(SystemBarPaint.paintsStatus(24));
        assertTrue(SystemBarPaint.paintsStatus(34));
    }

    @Test
    public void fromAndroid15TheWebPageAlreadyPaintsBehindTheBars() {
        assertFalse(SystemBarPaint.paintsStatus(35));
        assertFalse(SystemBarPaint.paintsNavigation(35));
        assertFalse(SystemBarPaint.paintsNavigation(36));
    }

    @Test
    public void theNavigationBarIsPaintedOnlyWhereItsButtonsCanTurnDark() {
        assertFalse(SystemBarPaint.paintsNavigation(24));
        assertFalse(SystemBarPaint.paintsNavigation(25));
        assertTrue(SystemBarPaint.paintsNavigation(26));
        assertTrue(SystemBarPaint.paintsNavigation(34));
    }

    @Test
    public void theThemeColorOfThePageBecomesAnOpaqueColour() {
        assertEquals(Integer.valueOf(0xFFF1F3F9), SystemBarPaint.opaque("#f1f3f9"));
        assertEquals(Integer.valueOf(0xFF0B0C14), SystemBarPaint.opaque("#0B0C14"));
    }

    @Test
    public void anythingElseLeavesTheBarsAsTheyAre() {
        assertNull(SystemBarPaint.opaque(null));
        assertNull(SystemBarPaint.opaque(""));
        assertNull(SystemBarPaint.opaque("f1f3f9"));
        assertNull(SystemBarPaint.opaque("#fff"));
        assertNull(SystemBarPaint.opaque("#f1f3f9aa"));
        assertNull(SystemBarPaint.opaque("#g1f3f9"));
    }
}
