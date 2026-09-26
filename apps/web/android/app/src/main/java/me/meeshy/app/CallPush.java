package me.meeshy.app;

import java.util.Map;

/**
 * Ce que la coque fait d'une poussee FCM (#8049) — la decision PURE que
 * {@link MeeshyMessagingService} execute. Forme de la charge : la passerelle,
 * `services/gateway/src/services/call-incoming-push.ts` (`type: call`, callId,
 * conversationId, callerName, isVideo, title, body, answerLabel,
 * declineLabel) et `call-push-mirroring.ts` (`call_cancel`,
 * `call_answered_elsewhere` + callId). Modele : `IncomingCallPushRouter` du
 * Kotlin gele.
 *
 * - {@link Kind#NOT_CALL} : tout autre message, remis INCHANGE au plugin
 *   `@capacitor/push-notifications`.
 * - {@link Kind#RING} : poser la notification d'appel plein ecran.
 * - {@link Kind#STOP} : retirer la notification de cet appel.
 * - {@link Kind#SUPPRESS} : un appel qui ne doit pas sonner — malforme, deja
 *   sonne ou arrete, ou application au premier plan (le socket fait deja
 *   sonner l'ecran d'appel : deux sonneries pour un appel).
 */
public final class CallPush {

    public enum Kind { NOT_CALL, RING, STOP, SUPPRESS }

    public static final String TYPE_CALL = "call";
    public static final String TYPE_CANCEL = "call_cancel";
    public static final String TYPE_ANSWERED_ELSEWHERE = "call_answered_elsewhere";

    public final Kind kind;
    public final String callId;
    public final String conversationId;
    public final String callerName;
    public final String title;
    public final String body;
    public final String answerLabel;
    public final String declineLabel;
    public final boolean video;

    private CallPush(Kind kind, Map<String, String> data) {
        this.kind = kind;
        this.callId = text(data, "callId");
        this.conversationId = text(data, "conversationId");
        this.callerName = text(data, "callerName");
        this.title = text(data, "title") != null ? text(data, "title") : callerName;
        this.body = text(data, "body");
        this.answerLabel = text(data, "answerLabel");
        this.declineLabel = text(data, "declineLabel");
        this.video = "true".equals(text(data, "isVideo"));
    }

    public static CallPush route(Map<String, String> data, boolean appInForeground, CallRingLedger ledger, long now) {
        String type = text(data, "type");
        String callId = text(data, "callId");
        if (TYPE_CANCEL.equals(type) || TYPE_ANSWERED_ELSEWHERE.equals(type)) {
            return new CallPush(callId == null ? Kind.SUPPRESS : Kind.STOP, data);
        }
        if (!TYPE_CALL.equals(type)) return new CallPush(Kind.NOT_CALL, data);
        if (callId == null || text(data, "conversationId") == null) return new CallPush(Kind.SUPPRESS, data);
        if (appInForeground || ledger.silenced(callId, now)) return new CallPush(Kind.SUPPRESS, data);
        return new CallPush(Kind.RING, data);
    }

    /** `data` FCM : des chaines plates, `""` valant absence (`shell-push.ts` § dataOf). */
    private static String text(Map<String, String> data, String key) {
        String value = data.get(key);
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** L'identifiant de notification d'un appel — le meme a la pose et au retrait. */
    public static int notificationId(String callId) {
        return ("call:" + callId).hashCode();
    }
}
