package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Une position demandee localisation eteinte propose de l'allumer, comme Chrome (#10227). */
public class LocationPromptRulesTest {

    @Test
    public void aGrantedRequestWithLocationOffOpensTheLocationSettings() {
        assertTrue(LocationPromptRules.opensLocationSettings(true, false));
    }

    @Test
    public void aGrantedRequestWithLocationOnGoesStraightToThePage() {
        assertFalse(LocationPromptRules.opensLocationSettings(true, true));
    }

    @Test
    public void aRefusedRequestNeverLeavesTheApp() {
        assertFalse(LocationPromptRules.opensLocationSettings(false, false));
        assertFalse(LocationPromptRules.opensLocationSettings(false, true));
    }
}
