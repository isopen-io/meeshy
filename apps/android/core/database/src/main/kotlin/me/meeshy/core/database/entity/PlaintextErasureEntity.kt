package me.meeshy.core.database.entity

import androidx.room.Entity
import androidx.room.Index

/**
 * Un clair E2EE que le coffre de cet appareil doit retirer (#14655, miroir de `e2ee_plaintext_erasures`, iOS #13001).
 * IDENTIFIANTS seuls, jamais de texte : la ligne s'inscrit dans la transaction qui efface le message (pierre tombale
 * confirmée, retrait, masquage, expiration, conversation supprimée) et survit à un arrêt de l'app comme à un coffre
 * verrouillé, jusqu'à ce que le coffre l'ait retirée ([acknowledgedAt]). Une ligne acquittée reste connue un temps : une
 * enveloppe du même message ouverte APRÈS l'effacement repart aussitôt.
 *
 * @property account le compte dont le coffre se vide ; `""` = le compte de la session qui possède cette base.
 * @property kind [KIND_MESSAGE] (un message, [itemId] = son identifiant) ou [KIND_CONVERSATION] (tous les clairs de la
 *   conversation [itemId] composés jusqu'à [recordedAt]).
 * @property clientMessageId le `cid_` du message : le coffre ne le retire que si [senderId] est le compte qui vide.
 */
@Entity(
    tableName = "e2ee_plaintext_erasures",
    primaryKeys = ["account", "kind", "itemId"],
    indices = [Index("acknowledgedAt")],
)
public data class PlaintextErasureEntity(
    val account: String,
    val kind: String,
    val itemId: String,
    val clientMessageId: String? = null,
    val senderId: String? = null,
    val recordedAt: Long,
    val acknowledgedAt: Long? = null,
) {
    public companion object {
        public const val KIND_MESSAGE: String = "message"
        public const val KIND_CONVERSATION: String = "conversation"

        /** Le compte de la session qui possède la base : la base est vidée à chaque fin de session. */
        public const val SESSION_ACCOUNT: String = ""
    }
}
