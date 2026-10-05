package me.meeshy.app;

/**
 * #9446 — les erreurs du `SpeechRecognizer` dites dans le vocabulaire de Web
 * Speech, comme Chrome Android : la page ne connait que lui
 * (`src/lib/calls/call-speech.ts`). Les codes sont ceux de
 * `android.speech.SpeechRecognizer.ERROR_*`, ecrits en clair pour une table
 * testee sur la JVM seule.
 */
public final class SpeechErrors {

    private SpeechErrors() {}

    public static String webError(int code) {
        switch (code) {
            case 3:
                return "audio-capture";
            case 5:
                return "aborted";
            case 6:
                return "no-speech";
            case 7:
                return "no-match";
            case 9:
                return "not-allowed";
            case 12:
            case 13:
                return "language-not-supported";
            default:
                return "network";
        }
    }
}
