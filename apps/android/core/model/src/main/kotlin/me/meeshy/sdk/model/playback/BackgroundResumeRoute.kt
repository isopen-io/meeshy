package me.meeshy.sdk.model.playback

/**
 * Par quelle route une REPRISE de lecture demandée depuis la notification ou l'écran verrouillé
 * obtient le focus audio.
 *
 * Depuis Android 15, une application qui cible l'API 35 ou plus doit être l'application au premier
 * plan, ou tenir un service de premier plan, pour DEMANDER le focus : sinon `requestAudioFocus`
 * rend `AUDIOFOCUS_REQUEST_FAILED` (https://developer.android.com/about/versions/15/behavior-changes-15,
 * « Restrictions on requesting audio focus »). Or le vocal en pause a rendu le focus au bout de 3 s
 * et son service a quitté le premier plan : « Lecture » depuis l'écran verrouillé demandait donc le
 * focus AVANT que le service ne soit revenu au premier plan, et la lecture échouait sans un mot.
 *
 * La route est la décision : prendre le premier plan d'abord, le focus ensuite. Un focus encore
 * refusé après cela est un REFUS explicite, jamais un silence.
 */
public enum class BackgroundResumeRoute {
    /** Le système laisse demander le focus tel quel. */
    Focus,

    /** `startForeground` d'abord, `requestAudioFocus` ensuite. */
    EnterForegroundThenFocus,
    ;

    public companion object {
        /** Première API dont la demande de focus est réservée à l'application au premier plan ou à son service. */
        public const val FOCUS_RESTRICTION_API: Int = 35

        public fun of(
            appForeground: Boolean,
            serviceForeground: Boolean,
            targetSdk: Int,
            sdkInt: Int,
        ): BackgroundResumeRoute {
            val restricted = sdkInt >= FOCUS_RESTRICTION_API && targetSdk >= FOCUS_RESTRICTION_API
            val mayRequestFocus = appForeground || serviceForeground
            return if (restricted && !mayRequestFocus) EnterForegroundThenFocus else Focus
        }
    }
}
