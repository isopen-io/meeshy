package me.meeshy.sdk.model.playback

/** Ce que Meeshy enregistre. */
public enum class RecordingSource {
    /** Message vocal, commentaire vocal, post audio, voix d'une story. */
    VoiceMessage,

    /** Vidéo filmée par la caméra de Meeshy (composer, message vidéo). */
    Video,
}

/** Le traitement du signal que la session applique à la prise de son. */
public enum class RecordingAudioMode {
    /** Annulation d'écho, gain et réduction de bruit du système (source de communication). */
    VoiceProcessing,

    /** Aucun traitement : le micro tel quel (source standard). */
    Standard,

    /** Le mode de la capture vidéo (source caméscope). */
    VideoCapture,
}

/** Le profil Bluetooth autorisé pendant la prise. */
public enum class RecordingBluetoothProfile {
    /** Le micro des écouteurs est celui qu'on attend quand on les porte (mains libres, mono). */
    HandsFree,

    /**
     * Sortie haute qualité seulement : le son se capte au micro de l'appareil et la lecture garde
     * la haute qualité dans les écouteurs (le mains libres les ferait basculer en mono basse
     * définition).
     */
    HighQualityOutput,
}

/** La configuration de la session partagée pendant un enregistrement. */
public data class RecordingSessionConfiguration(
    val category: SessionCategory,
    val mode: RecordingAudioMode,
    val mixing: SessionMixing,
    val defaultsToSpeaker: Boolean,
    val bluetooth: RecordingBluetoothProfile,
)

/** Ce que devient la session quand l'enregistrement se termine. */
public enum class RecordingSessionHandBack {
    /**
     * Un son Meeshy joue encore : la session redevient celle d'une lecture de contenu (non
     * mélangeable), le micro se libère.
     */
    ReturnToContentPlayback,

    /** Plus rien ne joue : la session est rendue, et la musique des autres applications reprend. */
    ReleaseSession,
}

/**
 * **La loi UNIQUE de la session d'enregistrement** — port de iOS `RecordingSessionLaw` (#11042).
 *
 * Décisions porteur du 2026-10-19 (b, d) : pendant un vocal ou une vidéo filmée dans Meeshy, les
 * sons EXTÉRIEURS sont coupés — la session n'est pas mélangeable —, et un son de Meeshy qui jouait
 * continue, plus bas ([PlaybackDuckLedger]), puis remonte à la fin.
 *
 * Sans option de mélange, c'est la session de Meeshy elle-même qui joue et enregistre : son propre
 * lecteur continue dans la même session, ce qui est voulu, et l'autre application s'interrompt.
 */
public object RecordingSessionLaw {

    /**
     * - Vocal seul : traitement de la voix du système (écho, gain, bruit) ; Bluetooth mains libres,
     *   le micro des écouteurs étant celui qu'on attend quand on les porte.
     * - Vocal par-dessus un son Meeshy : aucun traitement. Le traitement de la voix atténue de
     *   lui-même, sans borne ni retour, tout ce qui ne passe pas par lui — le son Meeshy deviendrait
     *   inaudible au lieu d'être baissé d'un facteur connu, et l'annulation d'écho l'effacerait de
     *   la prise. Le volume vient alors du seul [PlaybackDuckLedger], qui le rend exact.
     * - Vidéo : le mode de la capture vidéo ; Bluetooth haute qualité seulement.
     */
    public fun configuration(
        source: RecordingSource,
        meeshySoundPlaying: Boolean,
    ): RecordingSessionConfiguration = when (source) {
        RecordingSource.VoiceMessage -> RecordingSessionConfiguration(
            category = SessionCategory.PlayAndRecord,
            mode = if (meeshySoundPlaying) RecordingAudioMode.Standard else RecordingAudioMode.VoiceProcessing,
            mixing = SessionMixing.NonMixable,
            defaultsToSpeaker = true,
            bluetooth = RecordingBluetoothProfile.HandsFree,
        )

        RecordingSource.Video -> RecordingSessionConfiguration(
            category = SessionCategory.PlayAndRecord,
            mode = RecordingAudioMode.VideoCapture,
            mixing = SessionMixing.NonMixable,
            defaultsToSpeaker = true,
            bluetooth = RecordingBluetoothProfile.HighQualityOutput,
        )
    }

    /**
     * À la fin d'un enregistrement, un son Meeshy encore en lecture retrouve sa session de contenu ;
     * sinon la session se rend, et la musique des autres applications reprend.
     */
    public fun handBack(meeshySoundStillPlaying: Boolean): RecordingSessionHandBack =
        if (meeshySoundStillPlaying) {
            RecordingSessionHandBack.ReturnToContentPlayback
        } else {
            RecordingSessionHandBack.ReleaseSession
        }

    /**
     * Pendant un enregistrement, aucun lecteur de contenu ne reconfigure ni ne rend la session : la
     * lecture seule couperait le micro, une désactivation arrêterait la prise. Le lecteur joue dans
     * la session d'enregistrement.
     */
    public fun contentMayReconfigureSession(recordingHoldsSession: Boolean): Boolean = !recordingHoldsSession

    /**
     * Rendre la session aux autres applications n'a de sens que si elle est encore celle de
     * l'enregistrement : un autre composant (aperçu du composer, qui porte sa propre piste) l'a
     * peut-être reprise entre-temps, et la désactiver couperait ce qu'il joue.
     */
    public fun mayReleaseSession(currentCategory: SessionCategory): Boolean =
        currentCategory == SessionCategory.PlayAndRecord
}
