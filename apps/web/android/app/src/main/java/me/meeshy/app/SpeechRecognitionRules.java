package me.meeshy.app;

import android.speech.SpeechRecognizer;

/**
 * La loi pure de {@link MeeshySpeechPlugin} (#9446) : comment une erreur du
 * `SpeechRecognizer` d'Android se dit dans le vocabulaire de l'API Web Speech
 * (`SpeechRecognitionErrorEvent.error`), et quand une ecoute continue reprend
 * d'elle-meme apres un silence au lieu de finir.
 *
 * La page (`call-speech.ts`) lit ce vocabulaire tel que Chrome le parle :
 * `not-allowed` est un refus, `language-not-supported` et `audio-capture`
 * rendent la capture indisponible, tout le reste se relance.
 */
final class SpeechRecognitionRules {

    /** Aucun service de reconnaissance sur l'appareil : la langue ne peut y etre reconnue. */
    static final String UNAVAILABLE = "language-not-supported";

    /**
     * Une ecoute qui rend un silence plus tot que cela ne se relance pas
     * nativement : un service qui echoue aussitot ferait tourner une boucle
     * serree ; la fin remonte a la page, qui compte ses relances vaines.
     */
    static final long MIN_LISTEN_MS = 1_000;

    private SpeechRecognitionRules() {}

    static String webError(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS:
                return "not-allowed";
            case SpeechRecognizer.ERROR_LANGUAGE_NOT_SUPPORTED:
            case SpeechRecognizer.ERROR_LANGUAGE_UNAVAILABLE:
                return "language-not-supported";
            case SpeechRecognizer.ERROR_AUDIO:
                return "audio-capture";
            case SpeechRecognizer.ERROR_NO_MATCH:
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT:
                return "no-speech";
            case SpeechRecognizer.ERROR_NETWORK:
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT:
            case SpeechRecognizer.ERROR_SERVER:
            case SpeechRecognizer.ERROR_SERVER_DISCONNECTED:
            case SpeechRecognizer.ERROR_TOO_MANY_REQUESTS:
                return "network";
            default:
                return "aborted";
        }
    }

    /** Un silence au cours d'une ecoute continue : elle reprend, comme celle de Chrome. */
    static boolean listensAgain(boolean continuous, int code, long listenedMs) {
        boolean silence = code == SpeechRecognizer.ERROR_NO_MATCH || code == SpeechRecognizer.ERROR_SPEECH_TIMEOUT;
        return continuous && silence && listenedMs >= MIN_LISTEN_MS;
    }

    /** La confiance d'Android vaut -1 quand le service n'en donne pas ; le web attend 0..1. */
    static float confidence(float[] scores) {
        if (scores == null || scores.length == 0) return 0f;
        float score = scores[0];
        return score < 0f ? 0f : Math.min(score, 1f);
    }
}
