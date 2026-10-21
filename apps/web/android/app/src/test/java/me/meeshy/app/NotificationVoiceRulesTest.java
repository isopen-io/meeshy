package me.meeshy.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.Test;

/** Un vocal recu s'ecoute depuis sa notification (#10641), jumeau du lecteur de la NSE iOS (#8856). */
public class NotificationVoiceRulesTest {

    private static final String URL = "https://gate.meeshy.me/api/v1/attachments/file/2025%2F12%2Fu%2Fvoice.m4a";
    private static final String API = "https://gate.meeshy.me";

    private static Map<String, String> voicePush() {
        Map<String, String> data = new HashMap<>();
        data.put("type", "new_message");
        data.put("conversationId", "c1");
        data.put("conversationTitle", "Famille");
        data.put("messageId", "m1");
        data.put("senderDisplayName", "Andre Tabeth");
        data.put("senderUsername", "atabeth");
        data.put("attachmentUrl", URL);
        data.put("attachmentMimeType", "audio/mp4");
        data.put("attachmentDurationMs", "16879");
        data.put("attachmentId", "a1");
        data.put("attachmentLanguage", "");
        data.put("notificationLocKey", "");
        data.put("gcm.notification.tag", "c1");
        return data;
    }

    private static Map<String, String> with(String key, String value) {
        Map<String, String> data = voicePush();
        if (value == null) data.remove(key);
        else data.put(key, value);
        return data;
    }

    // ── Ce qui s'ecoute ─────────────────────────────────────────────────────

    @Test
    public void aVoiceMessageWithItsMediaIsListenable() {
        NotificationVoiceRules.Voice voice = NotificationVoiceRules.voiceOf(voicePush());
        assertNotNull(voice);
        assertEquals(URL, voice.url);
        assertEquals("a1", voice.attachmentId);
        assertEquals("m1", voice.messageId);
        assertEquals("c1", voice.conversationId);
        assertEquals(16879L, voice.durationMs);
        assertEquals("Andre Tabeth", voice.author);
        assertEquals("Famille", voice.conversationTitle);
        assertEquals("c1", voice.tag);
        assertEquals("", voice.language);
    }

    @Test
    public void theAuthorFallsBackToTheUsername() {
        assertEquals("atabeth", NotificationVoiceRules.voiceOf(with("senderDisplayName", " ")).author);
    }

    @Test
    public void theShortNotificationTagOfFcmIsReadToo() {
        Map<String, String> data = with("gcm.notification.tag", null);
        data.put("gcm.n.tag", "c9");
        assertEquals("c9", NotificationVoiceRules.voiceOf(data).tag);
    }

    @Test
    public void anUnknownDurationStaysUnknown() {
        assertEquals(-1L, NotificationVoiceRules.voiceOf(with("attachmentDurationMs", "")).durationMs);
        assertEquals(-1L, NotificationVoiceRules.voiceOf(with("attachmentDurationMs", "abc")).durationMs);
    }

    // ── Le fail-closed a deux niveaux ───────────────────────────────────────

    @Test
    public void aProtectedMessageIsNeverListenableEvenIfItsMediaTravelled() {
        // Second verrou : le serveur vide deja l'adresse sous la cle ; la coque
        // ne se fie pas a cette retenue et lit la DECLARATION elle-meme.
        assertNull(NotificationVoiceRules.voiceOf(with("notificationLocKey", "notification.viewOnce")));
        assertNull(NotificationVoiceRules.voiceOf(with("notificationLocKey", "notification.ephemeral")));
    }

    @Test
    public void aMessageWithoutMediaIsNotListenable() {
        assertNull(NotificationVoiceRules.voiceOf(with("attachmentUrl", "")));
        assertNull(NotificationVoiceRules.voiceOf(with("attachmentUrl", null)));
    }

    @Test
    public void anEncryptedMessageIsNotListenable() {
        assertNull(NotificationVoiceRules.voiceOf(with("encryptedContent", "AbC==")));
    }

    @Test
    public void onlyAnAudioMediaIsListenable() {
        assertNull(NotificationVoiceRules.voiceOf(with("attachmentMimeType", "image/jpeg")));
        assertNull(NotificationVoiceRules.voiceOf(with("attachmentMimeType", "video/mp4")));
        assertNull(NotificationVoiceRules.voiceOf(with("attachmentMimeType", "")));
    }

    @Test
    public void aCallOrASocialPushIsNotListenable() {
        assertNull(NotificationVoiceRules.voiceOf(with("type", "call")));
        assertNull(NotificationVoiceRules.voiceOf(with("type", "post_like")));
        assertNotNull(NotificationVoiceRules.voiceOf(with("type", "message_reply")));
        assertNotNull(NotificationVoiceRules.voiceOf(with("type", "user_mentioned")));
    }

    @Test
    public void aVoiceWithoutConversationOrMessageIsNotListenable() {
        assertNull(NotificationVoiceRules.voiceOf(with("conversationId", "")));
        assertNull(NotificationVoiceRules.voiceOf(with("messageId", null)));
    }

    // ── L'adresse que le lecteur a le droit de lire ─────────────────────────

    @Test
    public void meeshyHostsOverHttpsAreAllowed() {
        assertTrue(NotificationVoiceRules.allowedMediaUrl(URL, API, false));
        assertTrue(NotificationVoiceRules.allowedMediaUrl("https://meeshy.me/a.m4a", null, false));
        assertTrue(NotificationVoiceRules.allowedMediaUrl("https://staging.meeshy.me/a.m4a", null, false));
    }

    @Test
    public void theConfiguredApiHostIsAllowed() {
        assertTrue(NotificationVoiceRules.allowedMediaUrl("https://api.example.org/f.m4a", "https://api.example.org/", false));
    }

    @Test
    public void anyOtherHostIsRefused() {
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://evil.example/a.m4a", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://meeshy.me.evil.example/a.m4a", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://evilmeeshy.me/a.m4a", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://user@gate.meeshy.me/a.m4a", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("file:///sdcard/a.m4a", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("not a url", API, false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl(null, API, false));
    }

    @Test
    public void ipLiteralsAreRefusedEvenAsTheConfiguredHost() {
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://192.168.1.2/a.m4a", "https://192.168.1.2", false));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("https://[::1]/a.m4a", "https://[::1]", false));
    }

    @Test
    public void plainHttpIsADebugOnlyLoopback() {
        assertFalse(NotificationVoiceRules.allowedMediaUrl("http://gate.meeshy.me/a.m4a", API, true));
        assertFalse(NotificationVoiceRules.allowedMediaUrl("http://10.0.2.2:3000/a.m4a", API, false));
        assertTrue(NotificationVoiceRules.allowedMediaUrl("http://10.0.2.2:3000/a.m4a", API, true));
        assertTrue(NotificationVoiceRules.allowedMediaUrl("http://localhost:3000/a.m4a", API, true));
    }

    @Test
    public void aVoiceWhoseUrlIsNotAllowedIsNotListenable() {
        assertNull(NotificationVoiceRules.listenable(with("attachmentUrl", "https://evil.example/a.m4a"), API, false));
        assertNotNull(NotificationVoiceRules.listenable(voicePush(), API, false));
    }

    @Test
    public void aRedirectIsResolvedAgainstItsOriginThenRevalidated() {
        assertEquals("https://gate.meeshy.me/b.m4a", NotificationVoiceRules.redirectTarget(URL, "/b.m4a", API, false));
        assertNull(NotificationVoiceRules.redirectTarget(URL, "https://evil.example/b.m4a", API, false));
        assertNull(NotificationVoiceRules.redirectTarget(URL, null, API, false));
    }

    @Test
    public void theServedTypeMustBeAudio() {
        assertTrue(NotificationVoiceRules.servedAudio("audio/mp4"));
        assertTrue(NotificationVoiceRules.servedAudio("Audio/MPEG; charset=binary"));
        assertFalse(NotificationVoiceRules.servedAudio("text/html"));
        assertFalse(NotificationVoiceRules.servedAudio(null));
    }

    @Test
    public void aDeclaredLengthOverTheCapIsRefusedUpFront() {
        assertTrue(NotificationVoiceRules.lengthAcceptable(-1));
        assertTrue(NotificationVoiceRules.lengthAcceptable(1_203_805));
        assertFalse(NotificationVoiceRules.lengthAcceptable(NotificationVoiceRules.MAX_BYTES + 1));
    }

    // ── Ce que la notification affiche ──────────────────────────────────────

    @Test
    public void theDurationReadsLikeTheBubble() {
        assertEquals("0:16", NotificationVoiceRules.duration(16879));
        assertEquals("1:14", NotificationVoiceRules.duration(74680));
        assertEquals("0:00", NotificationVoiceRules.duration(400));
        assertEquals("1:02:03", NotificationVoiceRules.duration(3_723_000));
        assertEquals("", NotificationVoiceRules.duration(-1));
    }

    @Test
    public void theLockScreenNamesTheAuthorAndTheConversation() {
        NotificationVoiceRules.Voice voice = NotificationVoiceRules.voiceOf(voicePush());
        assertEquals("Andre Tabeth", NotificationVoiceRules.playerTitle(voice, "Message vocal"));
        assertEquals("Famille", NotificationVoiceRules.playerSubtitle(voice));
        NotificationVoiceRules.Voice direct = NotificationVoiceRules.voiceOf(with("conversationTitle", ""));
        assertEquals("", NotificationVoiceRules.playerSubtitle(direct));
        NotificationVoiceRules.Voice anonymous = NotificationVoiceRules.voiceOf(withBoth(null, null));
        assertEquals("Message vocal", NotificationVoiceRules.playerTitle(anonymous, "Message vocal"));
    }

    private static Map<String, String> withBoth(String displayName, String username) {
        Map<String, String> data = voicePush();
        data.remove("senderDisplayName");
        data.remove("senderUsername");
        if (displayName != null) data.put("senderDisplayName", displayName);
        if (username != null) data.put("senderUsername", username);
        return data;
    }

    // ── Le rapport d'ecoute, celui de la page ───────────────────────────────

    @Test
    public void theListenIsReportedOnTheAttachmentLikeThePage() {
        assertEquals("https://gate.meeshy.me/api/v1/attachments/a1/status", NotificationVoiceRules.reportUrl("https://gate.meeshy.me/", "a1"));
        assertEquals("https://gate.meeshy.me/api/v1/attachments/a%2F1/status", NotificationVoiceRules.reportUrl(API, "a/1"));
        assertNull(NotificationVoiceRules.reportUrl(null, "a1"));
        assertNull(NotificationVoiceRules.reportUrl("/api", "a1"));
        assertNull(NotificationVoiceRules.reportUrl(API, ""));
    }

    @Test
    public void aCompletedListenCarriesItsStretchAndLanguage() {
        List<NotificationVoiceRules.Stretch> stretches = Collections.singletonList(
            new NotificationVoiceRules.Stretch(0, 16879, "completed"));
        assertEquals(
            "{\"action\":\"listened\",\"playPositionMs\":16879,\"complete\":true,\"durationMs\":16879,"
                + "\"stretches\":[{\"startMs\":0,\"endMs\":16879,\"endedBy\":\"completed\"}],\"language\":\"fr\"}",
            NotificationVoiceRules.reportBody(16879, 16879, true, stretches, "fr"));
    }

    @Test
    public void anUnknownDurationAnEmptyTraceAndAnInvalidLanguageAreOmitted() {
        // `language` exige deux lettres et `stretches` des segments non vides :
        // les envoyer vides ferait rejeter le rapport ENTIER (400).
        assertEquals(
            "{\"action\":\"listened\",\"playPositionMs\":4000,\"complete\":false}",
            NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), ""));
    }

    @Test
    public void aLanguageTheGatewayAcceptsTravelsLikeInTheApp() {
        // wireLanguageCode (messages-schemas.ts) : 2 a 16 caracteres, 2 ou 3 lettres et un sous-code (#11376).
        String head = "{\"action\":\"listened\",\"playPositionMs\":4000,\"complete\":false";
        assertEquals(head + ",\"language\":\"bas\"}", NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), "bas"));
        assertEquals(head + ",\"language\":\"pt-br\"}", NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), " pt-BR "));
        assertEquals(head + "}", NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), "x"));
        assertEquals(head + "}", NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), "12"));
        assertEquals(head + "}", NotificationVoiceRules.reportBody(4000, -1, false, Collections.emptyList(), "fr-" + "a".repeat(20)));
    }

    @Test
    public void emptyOrInvertedStretchesAreDroppedAndTheTraceIsCapped() {
        List<NotificationVoiceRules.Stretch> trace = Arrays.asList(
            new NotificationVoiceRules.Stretch(10, 10, "pause"),
            new NotificationVoiceRules.Stretch(20, 5, "pause"),
            new NotificationVoiceRules.Stretch(0, 300, "pause"));
        assertEquals(1, NotificationVoiceRules.usable(trace).size());
        List<NotificationVoiceRules.Stretch> many = new java.util.ArrayList<>();
        for (int i = 0; i < 60; i++) many.add(new NotificationVoiceRules.Stretch(i * 10, i * 10 + 1 + i, "pause"));
        List<NotificationVoiceRules.Stretch> capped = NotificationVoiceRules.usable(many);
        assertEquals(50, capped.size());
        // Les plus COURTES tombent, l'ordre chronologique des rescapees reste.
        assertEquals(100, capped.get(0).startMs);
        assertEquals(590, capped.get(49).startMs);
    }

    // ── Revue adversariale (#10641) ─────────────────────────────────────────

    private static String jwt(String payloadJson) {
        java.util.Base64.Encoder b64 = java.util.Base64.getUrlEncoder().withoutPadding();
        return b64.encodeToString("{\"alg\":\"HS256\"}".getBytes(java.nio.charset.StandardCharsets.UTF_8)) + "."
            + b64.encodeToString(payloadJson.getBytes(java.nio.charset.StandardCharsets.UTF_8)) + ".sig";
    }

    @Test
    public void aRegisteredAccountIsItsUserAcrossTokenRefreshes() {
        String first = NotificationVoiceRules.accountOf("registered", jwt("{\"userId\":\"u1\",\"exp\":1}"));
        String refreshed = NotificationVoiceRules.accountOf("registered", jwt("{\"userId\":\"u1\",\"exp\":2}"));
        String other = NotificationVoiceRules.accountOf("registered", jwt("{\"userId\":\"u2\"}"));
        assertNotNull(first);
        assertEquals(first, refreshed);
        assertFalse(first.equals(other));
        assertFalse(first.contains("u1."));
    }

    @Test
    public void anUnreadableOrAnonymousTokenIsAnOpaqueFingerprintNeverTheTokenItself() {
        String anonymous = NotificationVoiceRules.accountOf("anonymous", "session-secret");
        assertNotNull(anonymous);
        assertFalse(anonymous.contains("session-secret"));
        assertFalse(anonymous.equals(NotificationVoiceRules.accountOf("registered", "session-secret")));
        assertNotNull(NotificationVoiceRules.accountOf("registered", "not.a-jwt"));
        assertNull(NotificationVoiceRules.accountOf("registered", ""));
        assertNull(NotificationVoiceRules.accountOf("unknown", "t"));
    }

    @Test
    public void theOriginIsTheAccountAndTheEnvironment() {
        String token = jwt("{\"userId\":\"u1\"}");
        String prod = NotificationVoiceRules.origin("https://gate.meeshy.me/", "registered", token);
        assertEquals(prod, NotificationVoiceRules.origin("https://gate.meeshy.me", "registered", token));
        assertFalse(prod.equals(NotificationVoiceRules.origin("https://staging.meeshy.me", "registered", token)));
        assertNull(NotificationVoiceRules.origin(null, "registered", token));
        assertNull(NotificationVoiceRules.origin("https://gate.meeshy.me", "registered", null));
    }

    @Test
    public void aPendingReportOrAnOfferedVoiceOnlyServesTheSameAccountOnTheSameEnvironment() {
        // Apres une deconnexion, le rapport de A ne part ni avec le jeton de B
        // ni vers l'autre `apiBase` (jeton de production vers le staging, #9232).
        assertTrue(NotificationVoiceRules.sameOrigin("o1", "o1"));
        assertFalse(NotificationVoiceRules.sameOrigin("o1", "o2"));
        assertFalse(NotificationVoiceRules.sameOrigin(null, null));
        assertFalse(NotificationVoiceRules.sameOrigin("o1", null));
    }

    @Test
    public void aDownloadFinishedAfterPauseOrDestructionIsAbandoned() {
        assertTrue(NotificationVoiceRules.mayPrepare(false, "m1", "m1"));
        assertFalse(NotificationVoiceRules.mayPrepare(true, "m1", "m1"));
        assertFalse(NotificationVoiceRules.mayPrepare(false, "m1", null));
        assertFalse(NotificationVoiceRules.mayPrepare(false, "m1", "m2"));
    }

    @Test
    public void onlyTheBannerOfThisMessageIsTouched() {
        // Le tag vaut la conversation : une banniere plus recente du meme fil
        // le porte aussi. A l'offre, une banniere encore vierge est la sienne.
        assertTrue(NotificationVoiceRules.bannerMatches(null, "m1", true));
        assertTrue(NotificationVoiceRules.bannerMatches("m1", "m1", true));
        assertFalse(NotificationVoiceRules.bannerMatches("m2", "m1", true));
        assertTrue(NotificationVoiceRules.bannerMatches("m1", "m1", false));
        assertFalse(NotificationVoiceRules.bannerMatches(null, "m1", false));
        assertFalse(NotificationVoiceRules.bannerMatches("m2", "m1", false));
    }

    @Test
    public void theLockScreenNamesNobodyUnlessPrivateNotificationsAreAllowed() {
        assertTrue(NotificationVoiceRules.revealOnLockScreen(1));
        assertFalse(NotificationVoiceRules.revealOnLockScreen(0));
        assertFalse(NotificationVoiceRules.revealOnLockScreen(-1));
    }
}
