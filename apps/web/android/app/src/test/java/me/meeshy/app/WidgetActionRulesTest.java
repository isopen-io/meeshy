package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import org.junit.Test;

/**
 * #10626 — les actions des widgets : liens profonds vers une conversation, la
 * file « marquer lu » que la page vide au retour (les photos : WidgetAvatarRulesTest).
 */
public class WidgetActionRulesTest {

    @Test
    public void aConversationOpensByTheShortSchemeTheWebRouterReads() {
        assertEquals("meeshy://c/abc123", WidgetActionRules.conversationLink("abc123"));
        assertEquals("meeshy://c/abc123?compose=1", WidgetActionRules.replyLink("abc123"));
        assertEquals("meeshy://c/a%2Fb", WidgetActionRules.conversationLink("a/b"));
        assertEquals("meeshy://chats", WidgetActionRules.LIST_LINK);
    }

    @Test
    public void onlyAReplyLinkAsksForTheComposer() {
        assertEquals("abc", WidgetActionRules.composeTarget("meeshy://c/abc?compose=1"));
        assertNull(WidgetActionRules.composeTarget("meeshy://c/abc"));
        assertNull(WidgetActionRules.composeTarget("meeshy://u/abc?compose=1"));
        assertNull(WidgetActionRules.composeTarget("https://evil.example/c/abc?compose=1"));
        assertNull(WidgetActionRules.composeTarget(null));
        assertNull(WidgetActionRules.composeTarget("::"));
    }

    @Test
    public void theMarkReadQueueKeepsEachConversationOnce() {
        List<String> once = WidgetActionRules.withId(Collections.emptyList(), "c1");
        List<String> twice = WidgetActionRules.withId(once, "c1");
        assertEquals(Collections.singletonList("c1"), twice);
        assertEquals(Arrays.asList("c1", "c2"), WidgetActionRules.withId(twice, "c2"));
        assertEquals(Collections.singletonList("c1"), WidgetActionRules.withId(once, ""));
    }

    @Test
    public void theMarkReadQueueIsBounded() {
        List<String> ids = new ArrayList<>();
        for (int i = 0; i < WidgetActionRules.MAX_QUEUE + 10; i++) ids = WidgetActionRules.withId(ids, "c" + i);
        assertEquals(WidgetActionRules.MAX_QUEUE, ids.size());
        assertEquals("c" + (WidgetActionRules.MAX_QUEUE + 9), ids.get(ids.size() - 1));
    }

    @Test
    public void theQueueRoundTripsThroughItsStoredForm() {
        List<String> ids = Arrays.asList("c1", "c\"2");
        assertEquals(ids, WidgetActionRules.parseIds(WidgetActionRules.encodeIds(ids)));
        assertEquals(Collections.emptyList(), WidgetActionRules.parseIds(null));
        assertEquals(Collections.emptyList(), WidgetActionRules.parseIds("pas une liste"));
        assertEquals(Collections.singletonList("ok"), WidgetActionRules.parseIds("[\"ok\", 4, null]"));
    }
}
