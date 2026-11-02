package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** Le fond derriere les barres systeme suit le theme de l'app (#9533, #12447). */
public class SystemBarPaintTest {

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
