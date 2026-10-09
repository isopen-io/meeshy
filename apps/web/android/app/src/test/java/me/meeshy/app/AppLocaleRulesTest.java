package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import org.junit.Test;

/** La langue que la page demande devient celle de l'application (#9749). */
public class AppLocaleRulesTest {

    @Test
    public void aCataloguedLanguageIsApplied() {
        assertEquals("de", AppLocaleRules.target("", "de", false));
        assertEquals("ar", AppLocaleRules.target("fr", "ar", false));
    }

    @Test
    public void anEmptyTagHandsBackToTheSystem() {
        assertEquals("", AppLocaleRules.target("de", "", false));
        assertEquals("", AppLocaleRules.target("de", null, false));
    }

    @Test
    public void theSameLanguageChangesNothing() {
        assertNull(AppLocaleRules.target("it", "it", false));
        assertNull(AppLocaleRules.target("", "", false));
    }

    @Test
    public void aLanguageOutsideTheInterfaceIsRefused() {
        assertNull(AppLocaleRules.target("", "sw", false));
        assertNull(AppLocaleRules.target("", "fr,en", false));
    }

    @Test
    public void theTagIsReadInLowerCaseWithoutSpaces() {
        assertEquals("pt", AppLocaleRules.target("", " PT ", false));
    }

    @Test
    public void atStartTheChoiceOnlyFillsAnEmptySetting() {
        assertEquals("es", AppLocaleRules.target("", "es", true));
        assertNull(AppLocaleRules.target("de", "es", true));
        assertNull(AppLocaleRules.target(null, "", true));
    }
}
