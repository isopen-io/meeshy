package me.meeshy.sdk.model.composer

import me.meeshy.sdk.model.SharedPlace
import me.meeshy.sdk.model.location.LocationAccess

/**
 * La feuille « Lieu » de la story (#13846) : la recherche par nom, les lieux autour de l'auteur, et le lieu choisi que « OK »
 * pose sur la scène. Rien n'est choisi d'office — « OK » reste grisé tant que l'auteur n'a rien touché — et après un refus
 * de localisation aucun lieu n'est proposé : la recherche par nom reste, et la feuille dit pourquoi (fail-closed, jamais de
 * lieu par défaut).
 */
data class StoryPlaceSheetState(
    val access: LocationAccess = LocationAccess.UNKNOWN,
    val nearby: List<SharedPlace> = emptyList(),
    val query: String = "",
    val results: List<SharedPlace> = emptyList(),
    val selected: SharedPlace? = null,
) {
    /** Les lieux montrés : ceux de la recherche, sinon ceux d'autour — jamais après un refus. */
    val proposed: List<SharedPlace>
        get() = when {
            query.isNotBlank() -> results
            access == LocationAccess.DENIED -> emptyList()
            else -> nearby
        }

    /** « OK » ne pose que ce qui est choisi ET encore montré. */
    val canConfirm: Boolean get() = selected != null && selected in proposed

    val showsRefusal: Boolean get() = access == LocationAccess.DENIED

    fun withAccess(access: LocationAccess): StoryPlaceSheetState =
        if (access == LocationAccess.DENIED) copy(access = access, nearby = emptyList()) else copy(access = access)

    fun withNearby(places: List<SharedPlace>): StoryPlaceSheetState =
        if (access == LocationAccess.DENIED) this else copy(nearby = places)

    fun queried(query: String): StoryPlaceSheetState =
        copy(query = query, results = if (query.isBlank()) emptyList() else results)

    /** Une réponse pour une saisie dépassée est ignorée. */
    fun withResults(forQuery: String, places: List<SharedPlace>): StoryPlaceSheetState =
        if (forQuery != query) this else copy(results = places)

    fun chosen(place: SharedPlace): StoryPlaceSheetState = copy(selected = place)
}
