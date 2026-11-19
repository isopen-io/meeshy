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

    /**
     * Pendant qu'un appel Meeshy SONNE, son aperçu audible passe le téléphone en `MODE_IN_COMMUNICATION` avant tout
     * décroché ([MeeshyCallRinging]) : ce mode-là ne dit rien — le compter dirait « en appel » à tort, et dirait aux Sangs
     * qu'un appel arrive, puis quand il est refusé (audit #18753). Un appel téléphonique (`MODE_IN_CALL`) compte toujours.
     */
    public fun isInCall(audioMode: Int, meeshyCallRinging: Boolean = false): Boolean =
        audioMode == MODE_IN_CALL || (audioMode == MODE_IN_COMMUNICATION && !meeshyCallRinging)

    /**
     * Un rapport part quand la valeur CHANGE par rapport au dernier accepté — et toujours le premier de la session, même
     * faux, pour clore un appel dont l'app (tuée, suspendue) n'a pas vu la fin. Rien hors session ni partage coupé
     * (« coupé = le fantôme, collecte comprise ») ; un réglage pas encore connu (`null`) ne bloque pas.
     */
    public fun shouldReport(lastAccepted: Boolean?, current: Boolean, signedIn: Boolean, sharingEnabled: Boolean?): Boolean =
        signedIn && sharingEnabled != false && lastAccepted != current
}

/**
 * « Un appel Meeshy sonne et son aperçu est audible » (#18753) : allumé par le coordinateur d'appel quand il route
 * l'aperçu avant décroché, éteint au décroché et à la fin. Seul le rapporteur « en appel » le lit, pour ne pas compter
 * ce mode audio comme un appel. Un drapeau de processus, sans état durable.
 */
public object MeeshyCallRinging {
    private val ringing = java.util.concurrent.atomic.AtomicBoolean(false)

    public val isRinging: Boolean get() = ringing.get()

    public fun set(value: Boolean) {
        ringing.set(value)
    }
}
