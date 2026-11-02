package me.meeshy.sdk.model.push

/**
 * À qui un push est destiné, au regard du compte connecté sur l'appareil (#13567). La passerelle nomme le destinataire
 * (`recipientUserId`) ; un appareil dont le compte est parti hors ligne garde son jeton FCM rattaché à ce compte, donc
 * un push peut viser un autre compte que celui connecté — ou personne, quand nul n'est connecté.
 */
public enum class PushRecipient {
    /** Le push nomme le compte connecté. */
    SELF,

    /** Le push nomme un autre compte, ou un compte alors que personne n'est connecté : ni écriture, ni bannière. */
    FOREIGN,

    /** Une passerelle antérieure ne nomme personne : le comportement d'avant tient (rétrocompatibilité). */
    UNNAMED,
    ;

    public companion object {
        public fun of(recipientUserId: String?, signedInUserId: String?): PushRecipient = when {
            recipientUserId == null -> UNNAMED
            recipientUserId == signedInUserId -> SELF
            else -> FOREIGN
        }
    }
}
