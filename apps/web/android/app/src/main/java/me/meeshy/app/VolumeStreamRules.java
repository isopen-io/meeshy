package me.meeshy.app;

/**
 * Le flux que reglent les touches de volume (#10375). Chrome pose
 * {@code STREAM_MUSIC} sur son activite : sans lui, Android regle la sonnerie
 * tant qu'aucun son ne joue. Pendant un appel, le flux revient au systeme,
 * qui regle la voix. Les valeurs sont celles d'{@code AudioManager}, recopiees
 * pour garder la regle testable sans le SDK Android.
 */
final class VolumeStreamRules {

    static final int STREAM_MUSIC = 3;
    static final int USE_DEFAULT_STREAM_TYPE = Integer.MIN_VALUE;

    private VolumeStreamRules() {}

    static int streamFor(boolean inCall) {
        return inCall ? USE_DEFAULT_STREAM_TYPE : STREAM_MUSIC;
    }
}
