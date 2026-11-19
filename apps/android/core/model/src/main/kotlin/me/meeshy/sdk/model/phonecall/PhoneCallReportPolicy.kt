package me.meeshy.sdk.model.phonecall

/**
 * Ce que MON téléphone rapporte (#18753), sans AUCUNE permission : le mode audio d'`AudioManager`. `MODE_IN_CALL`
 * (appel téléphonique) et `MODE_IN_COMMUNICATION` (appel VoIP, Meeshy compris) disent « en appel » ; la sonnerie
 * (`MODE_RINGTONE`) non. Jamais `READ_PHONE_STATE`, jamais de numéro ni d'interlocuteur : un booléen.
 *
 * Les valeurs sont celles d'`android.media.AudioManager`, recopiées ici pour que la règle se prouve sur une JVM nue.
 */
public object PhoneCallReportPolicy {
    public const val MODE_IN_CALL: Int = 2
    public const val MODE_IN_COMMUNICATION: Int = 3

    public fun isInCall(audioMode: Int): Boolean = audioMode == MODE_IN_CALL || audioMode == MODE_IN_COMMUNICATION

    /**
     * Un rapport part quand la valeur CHANGE par rapport au dernier accepté — et toujours le premier de la session, même
     * faux, pour clore un appel dont l'app (tuée, suspendue) n'a pas vu la fin. Rien hors session ni partage coupé
     * (« coupé = le fantôme, collecte comprise ») ; un réglage pas encore connu (`null`) ne bloque pas.
     */
    public fun shouldReport(lastAccepted: Boolean?, current: Boolean, signedIn: Boolean, sharingEnabled: Boolean?): Boolean =
        signedIn && sharingEnabled != false && lastAccepted != current
}
