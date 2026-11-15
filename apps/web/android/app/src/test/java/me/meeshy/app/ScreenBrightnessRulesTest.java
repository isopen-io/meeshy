package me.meeshy.app;

import static org.junit.Assert.assertEquals;

import org.junit.Test;

/** La luminosite demandee par la page devient celle de la fenetre (#9531). */
public class ScreenBrightnessRulesTest {

    private static final float DELTA = 0f;

    @Test
    public void aValueInRangeIsKept() {
        assertEquals(1f, ScreenBrightnessRules.window(1f), DELTA);
        assertEquals(0.4f, ScreenBrightnessRules.window(0.4f), DELTA);
        assertEquals(0f, ScreenBrightnessRules.window(0f), DELTA);
    }

    @Test
    public void aValueAboveOneIsClamped() {
        assertEquals(1f, ScreenBrightnessRules.window(3f), DELTA);
    }

    @Test
    public void aNegativeOrUnreadableValueHandsBackToTheSystem() {
        assertEquals(ScreenBrightnessRules.SYSTEM, ScreenBrightnessRules.window(-1f), DELTA);
        assertEquals(ScreenBrightnessRules.SYSTEM, ScreenBrightnessRules.window(-0.2f), DELTA);
        assertEquals(ScreenBrightnessRules.SYSTEM, ScreenBrightnessRules.window(Float.NaN), DELTA);
    }
}
