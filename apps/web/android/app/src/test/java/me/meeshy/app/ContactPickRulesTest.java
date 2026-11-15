package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import android.provider.ContactsContract.CommonDataKinds.Phone;
import org.junit.Test;

/** Le libellé d'un numéro choisi dans le carnet, dans les clés que la carte localise (#8242). */
public class ContactPickRulesTest {

    @Test
    public void aKnownTypeBecomesTheSharedLabelKey() {
        assertEquals("mobile", ContactPickRules.labelFor(Phone.TYPE_MOBILE, null));
        assertEquals("home", ContactPickRules.labelFor(Phone.TYPE_HOME, null));
        assertEquals("work", ContactPickRules.labelFor(Phone.TYPE_WORK, null));
        assertEquals("main", ContactPickRules.labelFor(Phone.TYPE_MAIN, null));
        assertEquals("other", ContactPickRules.labelFor(Phone.TYPE_OTHER, null));
    }

    @Test
    public void everyFaxAndPagerCollapsesToItsKey() {
        assertEquals("fax", ContactPickRules.labelFor(Phone.TYPE_FAX_WORK, null));
        assertEquals("fax", ContactPickRules.labelFor(Phone.TYPE_FAX_HOME, null));
        assertEquals("fax", ContactPickRules.labelFor(Phone.TYPE_OTHER_FAX, null));
        assertEquals("pager", ContactPickRules.labelFor(Phone.TYPE_PAGER, null));
        assertEquals("pager", ContactPickRules.labelFor(Phone.TYPE_WORK_PAGER, null));
    }

    @Test
    public void aCustomTypeKeepsTheAuthorsOwnLabel() {
        assertEquals("Standard", ContactPickRules.labelFor(Phone.TYPE_CUSTOM, "  Standard "));
        assertNull(ContactPickRules.labelFor(Phone.TYPE_CUSTOM, "   "));
        assertNull(ContactPickRules.labelFor(Phone.TYPE_CUSTOM, null));
    }

    @Test
    public void anUnmappedTypeHasNoLabel() {
        assertNull(ContactPickRules.labelFor(Phone.TYPE_CAR, null));
        assertNull(ContactPickRules.labelFor(-1, null));
    }
}
