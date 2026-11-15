package me.meeshy.app;

import android.media.AudioManager;

/**
 * Le flux que reglent les touches de volume (#10375). Chrome pose
 * `STREAM_MUSIC` : hors appel, monter le volume avant de lancer un vocal regle
 * les MEDIAS, jamais la sonnerie, et le baisser ne passe pas en vibreur.
 * Pendant un appel, le flux par defaut laisse Android regler la voix
 * (`MODE_IN_COMMUNICATION`).
 */
final class VolumeStreamRules {


    private VolumeStreamRules() {}

    static int stream(boolean inCall) {
        return inCall ? AudioManager.USE_DEFAULT_STREAM_TYPE : AudioManager.STREAM_MUSIC;
    }
}
