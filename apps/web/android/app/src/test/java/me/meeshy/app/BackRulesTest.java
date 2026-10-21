package me.meeshy.app;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

/** Le retour n'est intercepté que lorsque la coque a quelque chose à reculer (#10585). */
public class BackRulesTest {

    @Test
    public void theRootLeavesBackToTheSystem() {
        assertFalse(BackRules.interceptsBack(false, false));
    }

    @Test
    public void historyIsWalkedBackInTheWebView() {
        assertTrue(BackRules.interceptsBack(false, true));
    }

    @Test
    public void fullscreenIsLeftFirst() {
        assertTrue(BackRules.interceptsBack(true, false));
        assertTrue(BackRules.interceptsBack(true, true));
    }
}
