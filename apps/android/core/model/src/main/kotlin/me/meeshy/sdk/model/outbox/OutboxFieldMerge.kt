package me.meeshy.sdk.model.outbox

import kotlinx.serialization.json.JsonObject

/**
 * La fusion CHAMP PAR CHAMP de deux écritures en file pour une même cible (miroir de `OutboxMutationRules` côté iOS) :
 * le dernier à parler gagne sur chaque clé qu'il nomme, et une clé qu'il ne nomme pas garde la valeur de l'écriture
 * précédente. Un titre changé puis une description changée partent donc en UNE requête qui porte les deux.
 */
public object OutboxFieldMerge {

    /** [newer] posé sur [older] : les clés de [newer] l'emportent, les autres de [older] survivent. */
    public fun merge(older: JsonObject, newer: JsonObject): JsonObject = JsonObject(older + newer)

    /** [merge] sur une suite d'écritures, de la plus ancienne à la plus récente. */
    public fun mergeAll(writes: List<JsonObject>): JsonObject =
        writes.fold(JsonObject(emptyMap())) { acc, next -> merge(acc, next) }
}

/**
 * Les identifiants SENTINELLES des lignes qui ne visent aucune conversation (profil, blocage, amis, réglages) : un
 * identifiant stable, à préfixe réservé, jamais confondu avec un ObjectId de conversation ni avec un identifiant local
 * (`cid_`, `cmid_`, `pending_`) — donc jamais retenu derrière une résolution d'identifiant.
 */
public object OutboxSentinelTargets {
    private const val PREFIX: String = "~"

    /** Le réglage du compte adressé par [method] et [endpoint] : une clé de fusion par couple. */
    public fun settingsAction(method: String, endpoint: String): String =
        "${PREFIX}settings:${method.uppercase()}:${endpoint.trim().trimStart('/')}"

    public fun isSentinel(targetId: String): Boolean = targetId.startsWith(PREFIX)
}

/**
 * Les bornes d'une liste envoyée au serveur par un marquage « lu » : jamais un tableau non borné. La passerelle refuse
 * plus de [MAX_IDS] identifiants ; au-delà, on garde les plus RÉCENTS (la fin de la liste).
 */
public object ReadListBounds {
    public const val MAX_IDS: Int = 200
    public const val MAX_LANGUAGES: Int = 8

    public fun cappedIds(ids: List<String>): List<String> =
        ids.filter { it.isNotBlank() }.distinct().let { if (it.size > MAX_IDS) it.takeLast(MAX_IDS) else it }

    /** Des codes de langue non vides, sans doublon, ramenés à [MAX_LANGUAGES] en gardant les rangs de tête. */
    public fun framedLanguages(languages: List<String>): List<String> =
        languages.map { it.trim().lowercase() }.filter { it.isNotEmpty() }.distinct().take(MAX_LANGUAGES)
}
