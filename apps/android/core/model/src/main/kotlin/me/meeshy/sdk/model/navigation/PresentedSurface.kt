package me.meeshy.sdk.model.navigation

/** Une famille de surface présentée par-dessus la navigation (iOS `PresentedSurfaceKind`). */
public enum class PresentedSurfaceKind {
    STORY_VIEWER,
    REELS,
    CONVERSATION_COVER,
    MEDIA_GALLERY,
    COMPOSER,

    /** Une feuille présentée seule : commentaires, infos de conversation, aperçu, partage, nouvelle conversation. */
    SHEET,
    PLACE,
    SEARCH,
    PROFILE_PHOTO,
    CONTACT_CARD,

    /** Un écran du jeu : il RETIENT, une partie en cours ne se perd pas. */
    GAME,
}

/** Ce qu'une surface répond à l'ouverture d'une conversation. */
public enum class PresentedSurfaceYield {
    /** Elle se referme : rien de ce qu'elle porte ne se perd. */
    CLOSES,

    /** Elle tient un travail qu'une fermeture perdrait : elle reste, la conversation s'ouvre quand elle part. */
    RETAINS,
}

/** La fenêtre d'une surface ou d'une demande : une ouverture ne referme que les surfaces de SA fenêtre. */
@JvmInline
public value class PresentedSurfaceScope(public val id: String)

/** L'identité d'une déclaration : deux jetons ne sont jamais égaux. */
public class PresentedSurfaceToken internal constructor()

/**
 * **Ce qui est présenté par-dessus la navigation, et qui s'efface devant une conversation** (miroir d'iOS
 * `PresentedSurfaceRegistry`, #10539). Le contenu présenté se DÉCLARE ici avec sa façon de se refermer ; le routeur,
 * seul, demande le passage. Une surface qui RETIENT (composeur non vide, partie de jeu) garde aussi tout ce qui est sous
 * elle, et l'ouverture attend son départ ; une ouverture retenue plus de [awaitingValidityMillis] est oubliée.
 *
 * Fil principal uniquement, comme le routeur qui l'appelle.
 */
public class PresentedSurfaceLedger(
    private val nowMillis: () -> Long,
    private val awaitingValidityMillis: Long = 120_000L,
) {
    private class Declared(
        val token: PresentedSurfaceToken,
        val kind: PresentedSurfaceKind,
        val scope: PresentedSurfaceScope?,
        val answer: () -> PresentedSurfaceYield,
        val close: () -> Unit,
    ) {
        /** Une surface sans fenêtre, ou une demande sans fenêtre, se rencontrent toujours. */
        fun isReached(from: PresentedSurfaceScope?): Boolean = scope == null || from == null || scope == from
    }

    private class Awaiting(
        val scope: PresentedSurfaceScope?,
        val open: (Boolean) -> Unit,
        val sinceMillis: Long,
    )

    private val declared = mutableListOf<Declared>()
    private val awaiting = mutableListOf<Awaiting>()

    /** Du dessous vers le dessus : l'ordre de déclaration est celui de présentation. */
    public val declaredKinds: List<PresentedSurfaceKind> get() = declared.map { it.kind }

    /** [answer] est relu à chaque demande : un composeur change de réponse selon ce qu'il tient. */
    public fun declare(
        kind: PresentedSurfaceKind,
        scope: PresentedSurfaceScope? = null,
        answer: () -> PresentedSurfaceYield,
        close: () -> Unit,
    ): PresentedSurfaceToken {
        val token = PresentedSurfaceToken()
        declared += Declared(token, kind, scope, answer, close)
        return token
    }

    public fun retire(token: PresentedSurfaceToken) {
        if (!declared.removeAll { it.token == token }) return
        resumeAwaitingOpenings()
    }

    /**
     * Referme ce qui se referme dans la fenêtre [scope], puis appelle [open] (`true` : une surface est partie, la cible
     * se pose dessous sans animation). Sous une surface qui retient, [open] attend son départ.
     */
    public fun clearForConversation(scope: PresentedSurfaceScope?, open: (closedSurfaces: Boolean) -> Unit) {
        awaiting.removeAll { it.scope == scope }
        val reached = declared.filter { it.isReached(scope) }
        val topRetainer = reached.indexOfLast { it.answer() == PresentedSurfaceYield.RETAINS }
        val closing = reached.drop(topRetainer + 1)
        // Retirées AVANT d'être refermées : une fermeture peut rappeler `retire` sans relancer une ouverture.
        declared.removeAll(closing.toSet())
        closing.forEach { it.close() }
        if (topRetainer >= 0) {
            awaiting += Awaiting(scope, open, nowMillis())
            return
        }
        open(closing.isNotEmpty())
    }

    private fun resumeAwaitingOpenings() {
        val released = awaiting.filter { pending ->
            declared.none { it.isReached(pending.scope) && it.answer() == PresentedSurfaceYield.RETAINS }
        }
        for (pending in released) {
            // Une ouverture relancée peut en avoir servi une autre entre-temps.
            if (!awaiting.remove(pending)) continue
            if (nowMillis() - pending.sinceMillis > awaitingValidityMillis) continue
            clearForConversation(pending.scope, pending.open)
        }
    }
}
