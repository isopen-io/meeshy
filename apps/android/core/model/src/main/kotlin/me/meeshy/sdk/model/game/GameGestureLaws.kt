package me.meeshy.sdk.model.game

/**
 * L'identifiant d'idempotence d'une écriture du jeu (iOS `requestId(for:)` / `spent(_:)`) : né UNE fois par INTENTION
 * (le toucher de l'utilisateur), JAMAIS par requête. Un réessai après un échec réseau rejoue le même identifiant — la
 * passerelle reconnaît la requête et rend le résultat de la première écriture, jamais une seconde. Il ne se renouvelle
 * qu'après une réponse de la passerelle ([spent]), ou quand elle dit qu'il a déjà servi à une AUTRE écriture
 * ([GameRefusalLaw.releasesId]).
 *
 * Une intention est une clé stable : `chest`, `reroll:<mission>`, `claim:<halte>`. [generate] est injecté pour qu'un
 * test puisse nommer les identifiants.
 */
public class GameIntentIds(private val generate: () -> String) {
    private val ids = HashMap<String, String>()

    @Synchronized
    public fun idFor(intention: String): String = ids.getOrPut(intention, generate)

    @Synchronized
    public fun spent(intention: String) {
        ids.remove(intention)
    }
}

/** Ce que la passerelle dit d'un refus d'une écriture, et ce que le client en fait. */
public object GameRefusalLaw {

    /** Le code que le transport donne à une requête qui n'est jamais partie ou dont la réponse n'est jamais revenue. */
    public const val OFFLINE_CODE: String = "NETWORK"

    /** Rien n'est parti (ou rien n'est revenu) : aucun refus à lire, l'état affiché n'a pas changé. */
    public fun isOffline(code: String?): Boolean = code == OFFLINE_CODE

    /**
     * Un refus qui est une RÉPONSE de la passerelle (un 409 du contrat, un code inconnu, un 5xx, une charge illisible)
     * dit que l'écran était peut-être périmé, ou qu'une écriture a pu être prise sans que le client le sache : l'état se
     * relit, au lieu de laisser mentir ce qui est affiché. Seule une coupure ne relit rien — elle n'a rien appris.
     */
    public fun refreshesAfter(code: String?): Boolean = !isOffline(code)

    /**
     * Un refus DÉFINITIF : la passerelle a répondu par un code de son contrat (un 409 d'état). L'intention est jugée ; la
     * rejouer sous le même identifiant rendrait le même refus, alors qu'un nouvel essai, une fois l'écran relu, peut
     * aboutir — l'identifiant se renouvelle. Une coupure, un délai ou un 5xx (code inconnu) ne jugent rien : l'écriture
     * a pu être prise, l'identifiant est rejoué tel quel et la passerelle reconnaît la première.
     */
    public fun isDefinitive(code: String?): Boolean = GameErrorCode.fromWire(code) != null

    /** « Identifiant déjà servi à une AUTRE écriture » : le rejouer se heurterait au même refus. */
    public fun releasesId(code: String?): Boolean = GameErrorCode.fromWire(code) == GameErrorCode.RequestIdConflict
}

/**
 * Un segment de chemin d'une route d'écriture. L'identifiant d'une mission vient d'une charge serveur : seuls passent
 * les caractères non réservés (RFC 3986) hors le point, que `..` ne peut donc jamais former. Miroir de
 * `GamePathSegment` (iOS).
 */
public object GamePathSegments {
    public fun isSafe(value: String): Boolean =
        value.isNotEmpty() && value.all { it in 'A'..'Z' || it in 'a'..'z' || it in '0'..'9' || it == '-' || it == '_' || it == '~' }
}
