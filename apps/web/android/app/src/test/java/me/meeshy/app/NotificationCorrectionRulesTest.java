package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * #10989 — une correction (`reproduced`) ne remplace que la banniere de SA
 * notification, encore affichee, dont le texte change : jumeau de
 * `sw-push.js` § corriger (#7342).
 */
public class NotificationCorrectionRulesTest {

    private static final String NOTIFICATION = "65f0a1b2c3d4e5f6a7b8c9d0";
    private static final String OTHER = "75f0a1b2c3d4e5f6a7b8c9d1";

    private static Map<String, String> correction(String title, String body) {
        Map<String, String> extras = new HashMap<>();
        extras.put("notificationId", NOTIFICATION);
        extras.put("reproduced", "true");
        extras.put("gcm.notification.tag", "conv-1");
        extras.put("gcm.notification.title", title);
        extras.put("gcm.notification.body", body);
        return extras;
    }

    private static NotificationCorrectionRules.Shown shown(String notificationId, String title, String body) {
        return new NotificationCorrectionRules.Shown(notificationId, title, body);
    }

    @Test
    public void aCorrectionReplacesItsOwnBannerWhenTheTextChanges() {
        assertTrue(NotificationCorrectionRules.shows(correction("Alice", "Bonjour !"), shown(NOTIFICATION, "Alice", "Bonjour")));
        assertTrue(NotificationCorrectionRules.shows(correction("Alice · Équipe", "Bonjour"), shown(NOTIFICATION, "Alice", "Bonjour")));
    }

    @Test
    public void aSwipedBannerDoesNotComeBack() {
        assertFalse(NotificationCorrectionRules.shows(correction("Alice", "Bonjour !"), null));
    }

    @Test
    public void aNewerMessageOfTheConversationKeepsItsBanner() {
        assertFalse(NotificationCorrectionRules.shows(correction("Alice", "Bonjour !"), shown(OTHER, "Alice", "Tu viens ?")));
    }

    @Test
    public void aCorrectionDeliveredTwiceAlertsOnce() {
        assertFalse(NotificationCorrectionRules.shows(correction("Alice", "Bonjour !"), shown(NOTIFICATION, "Alice", "Bonjour !")));
    }

    @Test
    public void aBannerPostedBeforeTheMarkKeepsTheFormerBehaviour() {
        assertTrue(NotificationCorrectionRules.shows(correction("Alice", "Bonjour !"), shown(null, "Alice", "Tu viens ?")));
    }

    @Test
    public void anOrdinaryPushIsLeftToFcm() {
        Map<String, String> extras = correction("Alice", "Bonjour");
        extras.remove("reproduced");
        assertTrue(NotificationCorrectionRules.shows(extras, null));
        Map<String, String> dataOnly = new HashMap<>();
        dataOnly.put("reproduced", "true");
        dataOnly.put("notificationId", NOTIFICATION);
        assertTrue(NotificationCorrectionRules.shows(dataOnly, null));
    }

    @Test
    public void theShortNotificationKeysAreReadToo() {
        Map<String, String> extras = new HashMap<>();
        extras.put("notificationId", NOTIFICATION);
        extras.put("reproduced", "true");
        extras.put("gcm.n.tag", "conv-1");
        extras.put("gcm.n.title", "Alice");
        extras.put("gcm.n.body", "Bonjour");
        assertEquals("conv-1", NotificationFunnelRules.bannerTag(extras));
        assertFalse(NotificationCorrectionRules.shows(extras, shown(NOTIFICATION, "Alice", "Bonjour")));
    }

    @Test
    public void aWithheldCorrectionCountsReceivedOnly() {
        List<String> lines = NotificationFunnelRules.eventsFor(
            correction("Alice", "Bonjour !"), false, false, "2026-10-19T04:30:00.000Z", () -> "id-0");
        assertEquals(1, lines.size());
        assertTrue(lines.get(0), lines.get(0).contains("\"action\":\"received\""));
    }
}
