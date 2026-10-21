package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * L'entonnoir d'une banniere posee par FCM app fermee (#10938), jumeau de
 * `sw-push.js` § evenementDeNotification / noterReception.
 */
public class NotificationFunnelRulesTest {

    private static final String NOTIFICATION = "65f0a1b2c3d4e5f6a7b8c9d0";
    private static final String POST = "75f0a1b2c3d4e5f6a7b8c9d1";
    private static final String AT = "2026-10-18T20:30:00.000Z";

    private static Map<String, String> push(String... pairs) {
        Map<String, String> data = new HashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) data.put(pairs[i], pairs[i + 1]);
        return data;
    }

    private static Map<String, String> fcmBanner(String... pairs) {
        Map<String, String> data = push(pairs);
        data.put("gcm.notification.title", "Alice");
        data.put("gcm.notification.body", "Bonjour");
        return data;
    }

    private static List<String> events(Map<String, String> extras, boolean inForeground) {
        int[] next = {0};
        return NotificationFunnelRules.eventsFor(extras, inForeground, AT, () -> "id-" + next[0]++);
    }

    @Test
    public void aBannerShownByFcmOutsideTheForegroundCountsReceivedThenDisplayed() {
        List<String> lines = events(fcmBanner("notificationId", NOTIFICATION, "type", "new_message"), false);
        assertEquals(
            Arrays.asList(
                "{\"type\":\"notification\",\"action\":\"received\",\"eventId\":\"id-0\",\"occurredAt\":\"" + AT
                    + "\",\"target\":{\"kind\":\"notification\",\"id\":\"" + NOTIFICATION
                    + "\"},\"surface\":\"notifications\",\"channel\":\"fcm\",\"notificationType\":\"new_message\"}",
                "{\"type\":\"notification\",\"action\":\"displayed\",\"eventId\":\"id-1\",\"occurredAt\":\"" + AT
                    + "\",\"target\":{\"kind\":\"notification\",\"id\":\"" + NOTIFICATION
                    + "\"},\"surface\":\"notifications\",\"channel\":\"fcm\",\"notificationType\":\"new_message\"}"
            ),
            lines
        );
    }

    @Test
    public void theParentPostTravelsWhenItIsAnObjectId() {
        List<String> lines = events(fcmBanner("notificationId", NOTIFICATION, "postId", POST), false);
        assertTrue(lines.get(0).contains(
            "\"target\":{\"kind\":\"notification\",\"id\":\"" + NOTIFICATION + "\",\"parent\":{\"kind\":\"post\",\"id\":\"" + POST + "\"}}"));
        assertFalse(lines.get(0).contains("notificationType"));
    }

    @Test
    public void inTheForegroundThePageAlreadyCountsTheArrival() {
        assertEquals(Collections.emptyList(), events(fcmBanner("notificationId", NOTIFICATION), true));
    }

    @Test
    public void aDataOnlyPushIsNotABannerShownByFcm() {
        assertEquals(Collections.emptyList(), events(push("notificationId", NOTIFICATION, "type", "call"), false));
    }

    @Test
    public void theNotificationMessageMarkerAloneIsEnough() {
        Map<String, String> extras = push("notificationId", NOTIFICATION, "gcm.n.e", "1");
        assertEquals(2, events(extras, false).size());
    }

    @Test
    public void withoutAVerifiableNotificationIdNothingIsCounted() {
        assertEquals(Collections.emptyList(), events(fcmBanner("notificationId", "pas-un-id"), false));
        assertEquals(Collections.emptyList(), events(fcmBanner(), false));
    }

    @Test
    public void neitherTitleNorBodyNorAFreeFormTypeEverTravels() {
        List<String> lines = events(fcmBanner("notificationId", NOTIFICATION, "type", "x\",\"leak\":\"1"), false);
        for (String line : lines) {
            assertFalse(line, line.contains("Alice"));
            assertFalse(line, line.contains("Bonjour"));
            assertFalse(line, line.contains("leak"));
        }
    }

    @Test
    public void theStoreKeepsTheNewestEntriesWithinItsCap() {
        String stored = NotificationFunnelRules.appended(null, Arrays.asList("a", "b"), 3);
        assertEquals("a\nb", stored);
        assertEquals("b\nc\nd", NotificationFunnelRules.appended(stored, Arrays.asList("c", "d"), 3));
        assertEquals("a", NotificationFunnelRules.appended("", Collections.singletonList("a"), 3));
        assertEquals("a\nb", NotificationFunnelRules.appended("a\nb", Collections.emptyList(), 3));
    }

    @Test
    public void theDrainReadsEveryStoredLine() {
        assertEquals(Arrays.asList("a", "b"), NotificationFunnelRules.lines("a\nb"));
        assertEquals(Collections.emptyList(), NotificationFunnelRules.lines(null));
        assertEquals(Collections.emptyList(), NotificationFunnelRules.lines(""));
    }

    @Test
    public void theUnreadableStoreIsNeverAReason() {
        assertNull(NotificationFunnelRules.line(push(), "received", "id", AT));
    }

    // #10921 — balayer la banniere : `dismissed`, comme `notificationclose` sur le web.

    @Test
    public void aSwipedBannerCountsDismissedWithTheSameShape() {
        assertEquals(
            "{\"type\":\"notification\",\"action\":\"dismissed\",\"eventId\":\"id-0\",\"occurredAt\":\"" + AT
                + "\",\"target\":{\"kind\":\"notification\",\"id\":\"" + NOTIFICATION
                + "\"},\"surface\":\"notifications\",\"channel\":\"fcm\",\"notificationType\":\"new_message\"}",
            NotificationFunnelRules.dismissedLine(push("notificationId", NOTIFICATION, "type", "new_message"), AT, () -> "id-0")
        );
        assertNull(NotificationFunnelRules.dismissedLine(push("notificationId", "x"), AT, () -> "id-0"));
    }

    @Test
    public void theBannerIsFoundByTheTagFcmGaveIt() {
        assertEquals("c1", NotificationFunnelRules.bannerTag(push("gcm.notification.tag", "c1")));
        assertEquals("c2", NotificationFunnelRules.bannerTag(push("gcm.n.tag", "c2")));
        assertEquals("", NotificationFunnelRules.bannerTag(push()));
    }

    @Test
    public void onlyATaggedBannerWithAVerifiableIdTracksItsDismissal() {
        assertTrue(NotificationFunnelRules.tracksDismissal(push("gcm.notification.tag", "c1", "notificationId", NOTIFICATION)));
        assertFalse(NotificationFunnelRules.tracksDismissal(push("notificationId", NOTIFICATION)));
        assertFalse(NotificationFunnelRules.tracksDismissal(push("gcm.notification.tag", "c1", "notificationId", "x")));
    }

    @Test
    public void theDismissalAndTheActionsCarryOnlyWhatTheLineReads() {
        Map<String, String> carried = NotificationFunnelRules.lineExtras(push(
            "gcm.notification.tag", "c1", "notificationId", NOTIFICATION, "postId", POST, "type", "post_like",
            "conversationTitle", "Secret"));
        Map<String, String> expected = push("notificationId", NOTIFICATION, "postId", POST, "type", "post_like");
        assertEquals(expected, carried);
    }

    // #11052 — toucher une action de la banniere : `opened`, comme `notificationclick` sur le web.

    @Test
    public void anActionTappedOnTheBannerCountsOpenedWithTheSameShape() {
        assertEquals(
            "{\"type\":\"notification\",\"action\":\"opened\",\"eventId\":\"id-0\",\"occurredAt\":\"" + AT
                + "\",\"target\":{\"kind\":\"notification\",\"id\":\"" + NOTIFICATION
                + "\"},\"surface\":\"notifications\",\"channel\":\"fcm\",\"notificationType\":\"new_message\"}",
            NotificationFunnelRules.openedLine(push("notificationId", NOTIFICATION, "type", "new_message"), AT, () -> "id-0")
        );
        assertNull(NotificationFunnelRules.openedLine(push("notificationId", "x"), AT, () -> "id-0"));
        assertNull(NotificationFunnelRules.openedLine(push(), AT, () -> "id-0"));
    }

    // #11054 — le systeme ne montre pas la banniere : `received` seule, comme `noterReception` sur le web.

    @Test
    public void aBannerTheSystemHidesIsNotCountedDisplayed() {
        assertTrue(NotificationFunnelRules.systemShows(true, 4));
        assertTrue(NotificationFunnelRules.systemShows(true, null));
        assertFalse(NotificationFunnelRules.systemShows(false, 4));
        assertFalse(NotificationFunnelRules.systemShows(true, 0));
    }

    @Test
    public void theChannelIsReadFromThePushWithTheManifestDefault() {
        assertEquals("meeshy_notifications_silent",
            NotificationFunnelRules.channelOf(push("gcm.notification.android_channel_id", "meeshy_notifications_silent")));
        assertEquals("meeshy_notifications_silent",
            NotificationFunnelRules.channelOf(push("gcm.n.android_channel_id", "meeshy_notifications_silent")));
        assertEquals(NotificationFunnelRules.DEFAULT_CHANNEL, NotificationFunnelRules.channelOf(push()));
        assertEquals("meeshy_notifications", NotificationFunnelRules.DEFAULT_CHANNEL);
    }
}
