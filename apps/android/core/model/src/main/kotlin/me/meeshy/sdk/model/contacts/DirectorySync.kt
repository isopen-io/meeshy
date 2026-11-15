package me.meeshy.sdk.model.contacts

import kotlinx.serialization.Serializable
import kotlinx.serialization.Transient

/** Filtre serveur du repertoire (`GET directory/contacts?filter=`). */
enum class DirectoryFilter(val wire: String) {
    All("all"),
    Meeshy("meeshy"),
    Invitable("invitable"),
}

/**
 * Mode de synchronisation. Il choisit le VERBE — `PUT` remplace (purge ce que la charge ne
 * contient pas), `PATCH` fusionne (ne purge jamais) — et n'est jamais ecrit dans le corps.
 */
enum class DirectorySyncMode { Merge, Replace }

/**
 * Une requete de synchronisation. [mode] est `@Transient` : il porte le verbe, pas le corps.
 * [syncStartedAt] est l'horloge SERVEUR du premier lot, repetee sur les suivants ;
 * [isFinalBatch] n'est pose qu'au dernier lot d'un remplacement.
 */
@Serializable
data class DirectorySyncRequest(
    val contacts: List<ContactMatchEntry>,
    val defaultCountry: String? = null,
    @Transient val mode: DirectorySyncMode = DirectorySyncMode.Replace,
    val syncStartedAt: String? = null,
    val isFinalBatch: Boolean? = null,
)

@Serializable
data class DirectorySyncResult(
    val totalContacts: Int = 0,
    val processedContacts: Int = 0,
    val syncedCount: Int = 0,
    val matchedCount: Int = 0,
    val removedCount: Int = 0,
    /** Jeton de lots ; `null` = passerelle anterieure au contrat de lots. */
    val syncStartedAt: String? = null,
    /** Filigrane de relecture (`updatedSince`). */
    val appliedAt: String? = null,
)
