package me.meeshy.sdk.net

/**
 * Le [TokenStore] qui recopie la session d'un compte dans un [SessionBackup] (#14058). C'est le SITE UNIQUE
 * où les jetons s'écrivent : la connexion (toutes ses portes), le renouvellement ([SessionRefresher]) et
 * l'adoption de l'identité y passent, donc la sauvegarde les suit sans qu'aucun d'eux n'en sache rien.
 * [clear] — déconnexion, refus du renouvellement, fin d'un invité — efface la sauvegarde avec la session, et
 * l'entrée du compte au coffre des comptes gardés ([AccountShelf], #14079) : celle des AUTRES comptes reste.
 *
 * Seule une session COMPLÈTE de compte (identité, JWT, jeton de session) part : un invité de lien n'a pas de
 * JWT, et l'état transitoire d'une connexion (jetons posés avant l'identité) n'est pas une session. Écriture
 * et lecture de la session se font sous le même verrou que [clear] : un renouvellement concurrent d'une
 * déconnexion ne peut pas réécrire, après l'effacement, la session qu'elle vient de fermer.
 */
class BackedUpTokenStore(
    private val delegate: TokenStore,
    private val backup: SessionBackup,
    private val shelf: AccountShelf = NoAccountShelf,
    private val consent: SessionBackupConsent = SessionBackupConsent { true },
) : TokenStore by delegate {

    private val lock = Any()

    private var mirrored: BackedUpSession? = null

    /** Le compte dont la sauvegarde a été refusée puis effacée dans ce processus : l'effacement ne se répète pas. */
    private var refusedFor: String? = null

    override var jwt: String?
        get() = delegate.jwt
        set(value) = write { delegate.jwt = value }

    override var sessionToken: String?
        get() = delegate.sessionToken
        set(value) = write { delegate.sessionToken = value }

    override var userId: String?
        get() = delegate.userId
        set(value) = write { delegate.userId = value }

    override fun clear() {
        synchronized(lock) {
            delegate.userId?.let(shelf::erase)
            delegate.clear()
            mirrored = null
            refusedFor = null
            backup.erase()
        }
    }

    private fun write(change: () -> Unit) {
        synchronized(lock) {
            change()
            val session = BackedUpSession.of(delegate) ?: return
            if (!consent.allows(session.userId)) return refuse(session.userId)
            refusedFor = null
            if (session == mirrored) return
            mirrored = session
            backup.save(session)
        }
    }

    private fun refuse(userId: String) {
        if (refusedFor == userId) return
        refusedFor = userId
        mirrored = null
        backup.erase()
    }
}

/**
 * Le compte a-t-il demandé à rester connecté sur cet appareil ? « Rester connecté » décoché (#14058) : aucune
 * sauvegarde hors de l'app, et celle qui existait est effacée.
 */
fun interface SessionBackupConsent {
    fun allows(userId: String): Boolean
}
