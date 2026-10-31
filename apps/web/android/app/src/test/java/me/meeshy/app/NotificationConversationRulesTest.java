package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/**
 * #12473 — la banniere d'une conversation montre l'expediteur et empile ses
 * messages au lieu de remplacer le precedent, comme iOS empile par fil.
 */
public class NotificationConversationRulesTest {

    private static final String API = "https://gate.meeshy.me";

    private static Map<String, String> push(String... pairs) {
        Map<String, String> data = new HashMap<>();
        for (int i = 0; i + 1 < pairs.length; i += 2) data.put(pairs[i], pairs[i + 1]);
        return data;
    }

    private static NotificationConversationRules.Line line(String id, String sender, String text, long at) {
        return new NotificationConversationRules.Line(id, sender, text, at);
    }

    @Test
    public void theSenderAvatarIsFetchedFromAMeeshyHost() {
        assertEquals(
            "https://static.meeshy.me/u/a.jpg",
            NotificationConversationRules.avatarUrl(push("senderAvatar", "https://static.meeshy.me/u/a.jpg"), API, false));
    }

    @Test
    public void aRelativeAvatarIsResolvedAgainstTheGateway() {
        assertEquals(
            "https://gate.meeshy.me/api/v1/attachments/file/a.jpg",
            NotificationConversationRules.avatarUrl(push("senderAvatar", "/api/v1/attachments/file/a.jpg"), API, false));
    }

    @Test
    public void noAvatarUnderAProtectedDeclarationNorForEncryptedContent() {
        assertNull(NotificationConversationRules.avatarUrl(
            push("senderAvatar", "https://static.meeshy.me/u/a.jpg", "notificationLocKey", "NOTIFICATION_PROTECTED_MESSAGE"), API, false));
        assertNull(NotificationConversationRules.avatarUrl(
            push("senderAvatar", "https://static.meeshy.me/u/a.jpg", "encryptedContent", "x"), API, false));
    }

    @Test
    public void noAvatarFromAForeignHostOrWithoutAnAddress() {
        assertNull(NotificationConversationRules.avatarUrl(push("senderAvatar", "https://evil.example/a.jpg"), API, false));
        assertNull(NotificationConversationRules.avatarUrl(push("senderAvatar", ""), API, false));
        assertNull(NotificationConversationRules.avatarUrl(push(), API, false));
        assertNull(NotificationConversationRules.avatarUrl(push("senderAvatar", "/a.jpg"), null, false));
    }

    @Test
    public void aNewMessageStacksUnderThePreviousOnes() {
        List<NotificationConversationRules.Line> stacked = NotificationConversationRules.stack(
            Arrays.asList(line("n1", "Ana", "Bonjour", 1), line("n2", "Ana", "Tu es la ?", 2)),
            line("n3", "Ana", "🎵 Audio · 0:10", 3));
        assertEquals(3, stacked.size());
        assertEquals("n1", stacked.get(0).id);
        assertEquals("n3", stacked.get(2).id);
    }

    @Test
    public void aCorrectionReplacesItsOwnLineInPlace() {
        List<NotificationConversationRules.Line> stacked = NotificationConversationRules.stack(
            Arrays.asList(line("n1", "Ana", "Bonjur", 1), line("n2", "Ana", "Tu es la ?", 2)),
            line("n1", "Ana", "Bonjour", 3));
        assertEquals(2, stacked.size());
        assertEquals("Bonjour", stacked.get(0).text);
        assertEquals("n2", stacked.get(1).id);
    }

    @Test
    public void onlyTheLatestLinesAreKept() {
        List<NotificationConversationRules.Line> previous = new java.util.ArrayList<>();
        for (int i = 0; i < 9; i++) previous.add(line("n" + i, "Ana", "m" + i, i));
        List<NotificationConversationRules.Line> stacked = NotificationConversationRules.stack(previous, line("n9", "Ana", "m9", 9));
        assertEquals(NotificationConversationRules.MAX_LINES, stacked.size());
        assertEquals("n9", stacked.get(stacked.size() - 1).id);
        assertEquals("n" + (10 - NotificationConversationRules.MAX_LINES), stacked.get(0).id);
    }

    @Test
    public void aLineWithoutTextIsNeverStacked() {
        List<NotificationConversationRules.Line> stacked = NotificationConversationRules.stack(
            Collections.singletonList(line("n1", "Ana", "Bonjour", 1)), line("n2", "Ana", "  ", 2));
        assertEquals(1, stacked.size());
    }

    @Test
    public void linesSurviveTheirRoundTripThroughTheBannerExtras() {
        List<NotificationConversationRules.Line> lines = Arrays.asList(line("n1", "Ana", "Bonjour", 1), line(null, null, "Salut", 2));
        List<NotificationConversationRules.Line> back = NotificationConversationRules.decode(
            NotificationConversationRules.ids(lines), NotificationConversationRules.senders(lines),
            NotificationConversationRules.texts(lines), NotificationConversationRules.times(lines));
        assertEquals(2, back.size());
        assertEquals("n1", back.get(0).id);
        assertEquals("Ana", back.get(0).sender);
        assertNull(back.get(1).sender);
        assertEquals(2L, back.get(1).timeMs);
    }

    @Test
    public void unevenExtrasDecodeToNothing() {
        assertEquals(0, NotificationConversationRules.decode(new String[] {"a"}, new String[] {}, new String[] {"t"}, new long[] {1}).size());
        assertEquals(0, NotificationConversationRules.decode(null, null, null, null).size());
    }
}
