package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import org.junit.Test;

/**
 * #10626 — les widgets lisent l'instantane publie par la page et rien
 * d'autre : decodage tolerant, surcouche optimiste « marquer lu », cible de
 * la reponse rapide, couleurs et presence.
 */
public class WidgetSnapshotRulesTest {

    private static String row(String id, int unread, boolean muted) {
        return "{\"id\":\"" + id + "\",\"name\":\"Nom " + id + "\",\"initials\":\"N\",\"preview\":\"Salut\","
            + "\"at\":1760000000000,\"unread\":" + unread + ",\"muted\":" + muted + ",\"pinned\":false,"
            + "\"group\":false,\"accent\":\"#6366F1\",\"avatar\":null}";
    }

    private static String snapshot(int unread, String... rows) {
        return "{\"v\":1,\"unread\":" + unread + ",\"conversations\":[" + String.join(",", rows) + "],"
            + "\"favorites\":[{\"id\":\"f1\",\"name\":\"Amina\",\"initials\":\"AM\",\"accent\":\"#34D399\","
            + "\"avatar\":\"https://gate.meeshy.me/a.jpg\",\"presence\":\"online\"}]}";
    }

    @Test
    public void anAbsentOrUnreadableSnapshotIsNotPublished() {
        assertFalse(WidgetSnapshotRules.decode(null).published);
        assertFalse(WidgetSnapshotRules.decode("").published);
        assertFalse(WidgetSnapshotRules.decode("{pas du json").published);
        assertFalse(WidgetSnapshotRules.decode("{\"v\":99,\"unread\":3}").published);
    }

    @Test
    public void aPublishedSnapshotDecodesItsRowsAndFavorites() {
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(2, row("a", 3, false), row("b", 0, false)));
        assertTrue(s.published);
        assertEquals(2, s.unread);
        assertEquals(2, s.conversations.size());
        WidgetSnapshotRules.Row a = s.conversations.get(0);
        assertEquals("a", a.id);
        assertEquals("Nom a", a.name);
        assertEquals(3, a.unread);
        assertEquals(1760000000000L, a.at);
        assertEquals(0xFF6366F1, a.accent);
        assertNull(a.avatar);
        assertEquals("online", s.favorites.get(0).presence);
        assertEquals("https://gate.meeshy.me/a.jpg", s.favorites.get(0).avatar);
    }

    @Test
    public void aRowWithoutIdIsDroppedAndTheListIsCapped() {
        String[] rows = new String[WidgetSnapshotRules.MAX_ROWS + 3];
        for (int i = 0; i < rows.length; i++) rows[i] = row("c" + i, 0, false);
        String noId = "{\"name\":\"Sans id\"}";
        String[] all = Arrays.copyOf(rows, rows.length + 1);
        all[rows.length] = noId;
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(0, all));
        assertEquals(WidgetSnapshotRules.MAX_ROWS, s.conversations.size());
    }

    @Test
    public void markingReadFromTheWidgetDimsTheRowAndTheTotalAtOnce() {
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(2, row("a", 3, false), row("b", 1, false)));
        WidgetSnapshotRules.Snapshot read = WidgetSnapshotRules.withReadOverlay(s, Collections.singletonList("a"));
        assertEquals(0, read.conversations.get(0).unread);
        assertEquals(1, read.unread);
    }

    @Test
    public void aMutedConversationMarkedReadDoesNotLowerTheTotalItNeverCounted() {
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(1, row("m", 4, true), row("b", 1, false)));
        assertEquals(1, WidgetSnapshotRules.withReadOverlay(s, Collections.singletonList("m")).unread);
    }

    @Test
    public void theTotalNeverGoesBelowZero() {
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(0, row("a", 3, false)));
        assertEquals(0, WidgetSnapshotRules.withReadOverlay(s, Collections.singletonList("a")).unread);
    }

    @Test
    public void quickReplyTargetsTheFirstUnreadConversationElseTheMostRecent() {
        WidgetSnapshotRules.Snapshot s = WidgetSnapshotRules.decode(snapshot(1, row("a", 0, false), row("b", 2, false)));
        assertEquals("b", WidgetSnapshotRules.quickReplyTarget(s).id);
        WidgetSnapshotRules.Snapshot allRead = WidgetSnapshotRules.decode(snapshot(0, row("a", 0, false)));
        assertEquals("a", WidgetSnapshotRules.quickReplyTarget(allRead).id);
        assertNull(WidgetSnapshotRules.quickReplyTarget(WidgetSnapshotRules.decode(snapshot(0))));
    }

    @Test
    public void colorsParseFromHexWithAFallback() {
        assertEquals(0xFF34D399, WidgetSnapshotRules.parseColor("#34D399", 0));
        assertEquals(0xFF34D399, WidgetSnapshotRules.parseColor("34d399", 0));
        assertEquals(7, WidgetSnapshotRules.parseColor("rouge", 7));
        assertEquals(7, WidgetSnapshotRules.parseColor(null, 7));
    }

    @Test
    public void presenceFollowsTheOneThreeFiveRuleAndOfflineHasNoDot() {
        assertEquals(Integer.valueOf(0xFF34D399), WidgetSnapshotRules.presenceDot("online"));
        assertEquals(Integer.valueOf(0xFFFBBF24), WidgetSnapshotRules.presenceDot("away"));
        assertEquals(Integer.valueOf(0xFF9CA3AF), WidgetSnapshotRules.presenceDot("idle"));
        assertNull(WidgetSnapshotRules.presenceDot("offline"));
        assertNull(WidgetSnapshotRules.presenceDot(null));
    }

    @Test
    public void aBigCountIsShortened() {
        assertEquals("7", WidgetSnapshotRules.countLabel(7));
        assertEquals("99+", WidgetSnapshotRules.countLabel(250));
    }

    private static WidgetSnapshotRules.Snapshot published(int unread) {
        return new WidgetSnapshotRules.Snapshot(true, unread, Arrays.asList(
            new WidgetSnapshotRules.Row("a", "Nom a", "N", "Salut", 1760000000000L, 2, false, false, false, 0xFF6366F1, null),
            new WidgetSnapshotRules.Row("b", "Nom b", "N", "Salut", 1760000000000L, 1, false, false, false, 0xFF6366F1, null)),
            Collections.emptyList());
    }

    private static Map<String, String> push(String unreadCount) {
        Map<String, String> data = new HashMap<>();
        data.put("type", "new_message");
        if (unreadCount != null) data.put("unreadCount", unreadCount);
        return data;
    }

    @Test
    public void aPushCarriesTheUnreadTotalOnlyAsANonNegativeInteger() {
        assertEquals(Integer.valueOf(3), WidgetSnapshotRules.unreadOf(push("3")));
        assertEquals(Integer.valueOf(0), WidgetSnapshotRules.unreadOf(push("0")));
        assertNull(WidgetSnapshotRules.unreadOf(push(null)));
        assertNull(WidgetSnapshotRules.unreadOf(push("")));
        assertNull(WidgetSnapshotRules.unreadOf(push("-1")));
        assertNull(WidgetSnapshotRules.unreadOf(push("2.5")));
        assertNull(WidgetSnapshotRules.unreadOf(push("trois")));
        assertNull(WidgetSnapshotRules.unreadOf(push("99999999999")));
        assertNull(WidgetSnapshotRules.unreadOf(null));
    }

    @Test
    public void aPushedTotalReplacesThePublishedOneAndKeepsTheRows() {
        WidgetSnapshotRules.Snapshot pushed = WidgetSnapshotRules.withPushedUnread(published(2), 5);
        assertTrue(pushed.published);
        assertEquals(5, pushed.unread);
        assertEquals(2, pushed.conversations.size());
        assertEquals(2, WidgetSnapshotRules.withPushedUnread(published(2), null).unread);
    }

    @Test
    public void aPushedTotalNeverShowsUpWhileNothingIsPublished() {
        WidgetSnapshotRules.Snapshot pushed = WidgetSnapshotRules.withPushedUnread(WidgetSnapshotRules.NONE, 4);
        assertFalse(pushed.published);
        assertEquals(0, pushed.unread);
    }

    @Test
    public void theWidgetReadOverlayStillAppliesOverThePushedTotal() {
        WidgetSnapshotRules.Snapshot shown = WidgetSnapshotRules.withReadOverlay(
            WidgetSnapshotRules.withPushedUnread(published(2), 5), Collections.singletonList("a"));
        assertEquals(4, shown.unread);
    }
}
