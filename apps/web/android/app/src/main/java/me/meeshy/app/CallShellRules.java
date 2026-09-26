package me.meeshy.app;

import java.io.UnsupportedEncodingException;
import java.net.URLEncoder;

/**
 * Les petites regles pures de l'appel natif (#8049) : le type du service au
 * premier plan (J2, D16), l'haptique des transitions (D19) et le refus sans
 * socket (C11). Testees sur la JVM seule.
 */
public final class CallShellRules {

    /** `ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA` / `_MICROPHONE`. */
    static final int FGS_TYPE_CAMERA = 64;
    static final int FGS_TYPE_MICROPHONE = 128;

    private CallShellRules() {}

    /**
     * Les types du service au premier plan. Depuis l'API 34, demarrer un type
     * dont la permission d'execution n'est PAS accordee leve une
     * SecurityException : un type n'est donc demande que si sa permission
     * l'est. 0 = aucun service a demarrer.
     */
    public static int foregroundServiceTypes(boolean video, boolean microphoneGranted, boolean cameraGranted) {
        int types = microphoneGranted ? FGS_TYPE_MICROPHONE : 0;
        return video && cameraGranted ? types | FGS_TYPE_CAMERA : types;
    }

    /** Le motif de vibration d'une transition de l'appel, ou null s'il n'en a pas. */
    public static long[] hapticPattern(String kind) {
        if ("connected".equals(kind)) return new long[] {0, 40};
        if ("ended".equals(kind)) return new long[] {0, 30, 80, 30};
        if ("reconnecting".equals(kind)) return new long[] {0, 20};
        return null;
    }

    /** `DELETE /api/v1/calls/:callId?reason=rejected` — le refus AVANT d'avoir rejoint (`sw-push.js` § refuserAppel). */
    public static String declineUrl(String apiBase, String callId) {
        if (apiBase == null || callId == null || callId.trim().isEmpty()) return null;
        String base = apiBase.trim();
        if (!base.startsWith("https://") && !base.startsWith("http://")) return null;
        while (base.endsWith("/")) base = base.substring(0, base.length() - 1);
        try {
            return base + "/api/v1/calls/" + URLEncoder.encode(callId.trim(), "UTF-8").replace("+", "%20") + "?reason=rejected";
        } catch (UnsupportedEncodingException impossible) {
            return null;
        }
    }

    /**
     * L'en-tete du credential — jumeau de `credentialHeaders()`
     * (`src/lib/api/http.ts`) : un compte parle en `Authorization`, un invite
     * de lien en `X-Session-Token`, jamais melanges. null = aucun credential.
     */
    public static String[] credentialHeader(String kind, String token) {
        if (token == null || token.isEmpty()) return null;
        if ("registered".equals(kind)) return new String[] {"Authorization", "Bearer " + token};
        if ("anonymous".equals(kind)) return new String[] {"X-Session-Token", token};
        return null;
    }
}
