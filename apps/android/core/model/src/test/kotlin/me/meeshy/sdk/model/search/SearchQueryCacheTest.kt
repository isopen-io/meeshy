package me.meeshy.sdk.model.search

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertSame
import org.junit.Assert.assertThrows
import org.junit.Assert.assertTrue
import org.junit.Test

class SearchQueryCacheTest {

    private fun cache(capacity: Int = 5, ttlMillis: Long = 120_000L) =
        SearchQueryCache.empty<List<String>>(capacity, ttlMillis)

    // Un put suivi d'un get dans la fenetre TTL rend la valeur mise en cache —
    // le coeur du "cache-first" : une requete deja vue se ressert sans reseau.
    @Test
    fun `put then get within the TTL returns the cached value`() {
        val c = cache().put("cafe", listOf("a", "b"), nowMillis = 0)
        assertEquals(listOf("a", "b"), c.get("cafe", nowMillis = 1_000))
    }

    // La cle est normalisee (trim + lowercase) : chercher "  CAFE " retrouve
    // l'entree mise sous "cafe" — parite iOS `query.lowercased().trimmingCharacters`.
    @Test
    fun `keys are normalised trim plus lowercase on both put and get`() {
        val c = cache().put("  CaFe ", listOf("x"), nowMillis = 0)
        assertEquals(listOf("x"), c.get("cafe", nowMillis = 0))
        assertEquals(listOf("x"), c.get(" CAFE  ", nowMillis = 0))
    }

    // Une entree dont l'age atteint le TTL est un MISS (borne exclue : iOS teste
    // `elapsed < staleTTL`). Exactement au TTL -> perime.
    @Test
    fun `an entry exactly at the TTL boundary is a miss`() {
        val c = cache(ttlMillis = 120_000L).put("cafe", listOf("x"), nowMillis = 0)
        assertNull(c.get("cafe", nowMillis = 120_000L))
    }

    // Juste avant le TTL -> encore frais.
    @Test
    fun `an entry one millisecond before the TTL is still fresh`() {
        val c = cache(ttlMillis = 120_000L).put("cafe", listOf("x"), nowMillis = 0)
        assertEquals(listOf("x"), c.get("cafe", nowMillis = 119_999L))
    }

    // get est une lecture PURE : lire une entree perimee ne mute rien (l'instance
    // renvoie toujours le meme etat) — l'eviction se fait au put, pas au get.
    @Test
    fun `get is a pure read and never mutates the cache`() {
        val c = cache(ttlMillis = 10L).put("cafe", listOf("x"), nowMillis = 0)
        c.get("cafe", nowMillis = 100L) // perime, mais lecture pure
        assertEquals(1, c.size)
    }

    // Une requete inconnue est un MISS.
    @Test
    fun `an unknown query is a miss`() {
        assertNull(cache().get("nope", nowMillis = 0))
    }

    // Une cle vide (ou qui se normalise a vide) ne se met JAMAIS en cache et se
    // lit toujours en MISS — le Prisme/gateway ne cherche pas le vide.
    @Test
    fun `a blank query is never stored and always misses`() {
        val c = cache().put("   ", listOf("x"), nowMillis = 0)
        assertEquals(0, c.size)
        assertNull(c.get("   ", nowMillis = 0))
    }

    // put sur une cle deja presente REMPLACE sa valeur et la remonte en tete de
    // fraicheur (comme iOS `removeAll { key } ; append`).
    @Test
    fun `putting an existing key replaces its value`() {
        val c = cache()
            .put("cafe", listOf("old"), nowMillis = 0)
            .put("cafe", listOf("new"), nowMillis = 1_000)
        assertEquals(listOf("new"), c.get("cafe", nowMillis = 1_500))
        assertEquals(1, c.size)
    }

    // Au-dela de la capacite, la PLUS ANCIENNE entree est evincee (LRU par ordre
    // d'insertion — parite iOS `removeFirst` boucle a capacite 5).
    @Test
    fun `putting past capacity evicts the oldest entry`() {
        var c = cache(capacity = 2)
        c = c.put("a", listOf("1"), nowMillis = 0)
        c = c.put("b", listOf("2"), nowMillis = 1)
        c = c.put("c", listOf("3"), nowMillis = 2)
        assertEquals(2, c.size)
        assertNull(c.get("a", nowMillis = 2)) // "a" evince
        assertEquals(listOf("2"), c.get("b", nowMillis = 2))
        assertEquals(listOf("3"), c.get("c", nowMillis = 2))
    }

    // Re-mettre une cle existante ne consomme PAS un slot supplementaire : elle
    // est retiree puis re-ajoutee, donc la capacite protege les cles DISTINCTES.
    @Test
    fun `re-putting an existing key does not evict another key`() {
        var c = cache(capacity = 2)
        c = c.put("a", listOf("1"), nowMillis = 0)
        c = c.put("b", listOf("2"), nowMillis = 1)
        c = c.put("a", listOf("1b"), nowMillis = 2) // maj de "a", pas une 3e cle
        assertEquals(2, c.size)
        assertEquals(listOf("1b"), c.get("a", nowMillis = 2))
        assertEquals(listOf("2"), c.get("b", nowMillis = 2))
    }

    // invalidate vide tout : une donnee sous-jacente a change (socket), la
    // prochaine recherche doit repartir en reseau (parite iOS
    // `invalidateMessageQueryCache -> removeAll`).
    @Test
    fun `invalidate clears every entry`() {
        val c = cache()
            .put("a", listOf("1"), nowMillis = 0)
            .put("b", listOf("2"), nowMillis = 0)
            .invalidate()
        assertEquals(0, c.size)
        assertNull(c.get("a", nowMillis = 0))
        assertNull(c.get("b", nowMillis = 0))
    }

    // invalidate sur un cache deja vide rend la MEME instance (no-op sans copie
    // inutile) — laisse un test epingler l'inertie.
    @Test
    fun `invalidate on an empty cache returns the same instance`() {
        val c = cache()
        assertSame(c, c.invalidate())
    }

    // put d'une cle vide rend la MEME instance (no-op).
    @Test
    fun `putting a blank key returns the same instance`() {
        val c = cache()
        assertSame(c, c.put("  ", listOf("x"), nowMillis = 0))
    }

    // Le cache est immuable : put rend une NOUVELLE instance, l'ancienne est
    // inchangee.
    @Test
    fun `put returns a new instance leaving the original untouched`() {
        val original = cache()
        val updated = original.put("cafe", listOf("x"), nowMillis = 0)
        assertEquals(0, original.size)
        assertEquals(1, updated.size)
    }

    // Une capacite ou un TTL non positif est un contrat casse a la construction.
    @Test
    fun `empty rejects a non-positive capacity`() {
        assertThrows(IllegalArgumentException::class.java) {
            SearchQueryCache.empty<List<String>>(capacity = 0, ttlMillis = 1)
        }
    }

    @Test
    fun `empty rejects a non-positive ttl`() {
        assertThrows(IllegalArgumentException::class.java) {
            SearchQueryCache.empty<List<String>>(capacity = 1, ttlMillis = 0)
        }
    }

    // Les valeurs par defaut miroir iOS : capacite 5, TTL 120 s.
    @Test
    fun `defaults mirror iOS capacity five and TTL 120 seconds`() {
        assertEquals(5, SearchQueryCache.DEFAULT_CAPACITY)
        assertEquals(120_000L, SearchQueryCache.DEFAULT_TTL_MILLIS)
        var c = SearchQueryCache.empty<List<String>>()
        repeat(6) { i -> c = c.put("q$i", listOf("$i"), nowMillis = i.toLong()) }
        assertEquals(5, c.size)
        assertNull(c.get("q0", nowMillis = 6)) // la 1re des 6 est evincee a cap 5
    }

    // normalize est exposee comme SSOT de la cle : un consommateur qui doit
    // comparer deux requetes utilise la meme regle, pas une re-implementation.
    @Test
    fun `normalize is the shared key rule`() {
        assertEquals("cafe", SearchQueryCache.normalize("  CaFe "))
        assertTrue(SearchQueryCache.normalize("   ").isEmpty())
    }
}
