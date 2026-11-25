package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotEquals;
import static org.junit.Assert.assertTrue;

import java.security.SecureRandom;
import org.junit.Test;

/**
 * #19243 — `MainActivity` est exportee : n'importe quelle app peut lui remettre
 * un intent. Seul ce que la coque a scelle elle-meme decroche ou compose.
 */
public class IntentSealRulesTest {

    @Test
    public void aFreshSealIsLongAndUnpredictable() {
        SecureRandom random = new SecureRandom();
        String first = IntentSealRules.fresh(random);
        String second = IntentSealRules.fresh(random);
        assertEquals(64, first.length());
        assertTrue(first.matches("[0-9a-f]{64}"));
        assertNotEquals(first, second);
    }

    @Test
    public void onlyTheExactSealIsHonoured() {
        String seal = IntentSealRules.fresh(new SecureRandom());
        assertTrue(IntentSealRules.honours(seal, seal));
        assertFalse(IntentSealRules.honours(seal, seal.substring(1)));
        assertFalse(IntentSealRules.honours(seal, seal.toUpperCase()));
    }

    @Test
    public void aForgedIntentWithoutSealIsNeverHonoured() {
        String seal = IntentSealRules.fresh(new SecureRandom());
        assertFalse(IntentSealRules.honours(seal, null));
        assertFalse(IntentSealRules.honours(seal, ""));
    }

    @Test
    public void aMissingSealOnTheShellSideHonoursNothing() {
        assertFalse(IntentSealRules.honours(null, null));
        assertFalse(IntentSealRules.honours("", ""));
        assertFalse(IntentSealRules.honours(null, "abc"));
    }
}
