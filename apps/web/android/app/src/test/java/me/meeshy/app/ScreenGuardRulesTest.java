package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** La capture d'un contenu qui disparait, selon la version d'Android (#9617, #9574). */
public class ScreenGuardRulesTest {

    @Test
    public void onlyTheVisibleStateMeansRecorded() {
        assertTrue(ScreenGuardRules.recorded(ScreenGuardRules.SCREEN_RECORDING_STATE_VISIBLE));
        assertFalse(ScreenGuardRules.recorded(0));
        assertFalse(ScreenGuardRules.recorded(null));
    }

    @Test
    public void theVisibleStateIsTheFrameworkValue() {
        assertEquals(1, ScreenGuardRules.SCREEN_RECORDING_STATE_VISIBLE);
    }

    @Test
    public void anAbsentOrUnreadableRequestClearsTheFlag() {
        assertTrue(ScreenGuardRules.secure(Boolean.TRUE));
        assertFalse(ScreenGuardRules.secure(Boolean.FALSE));
        assertFalse(ScreenGuardRules.secure(null));
    }

    /** #10508 — la capture d'ecran ne se detecte qu'a partir d'Android 14 (API 34), et rien avant. */
    @Test
    public void screenshotsAreDetectedFromApi34Only() {
        assertFalse(ScreenGuardRules.detectsScreenshots(33));
        assertTrue(ScreenGuardRules.detectsScreenshots(34));
        assertTrue(ScreenGuardRules.detectsScreenshots(35));
    }

    /** #10508 — l'enregistrement ou la recopie ne se detecte qu'a partir d'Android 15 (API 35). */
    @Test
    public void recordingIsDetectedFromApi35Only() {
        assertFalse(ScreenGuardRules.detectsRecording(34));
        assertTrue(ScreenGuardRules.detectsRecording(35));
    }
}
