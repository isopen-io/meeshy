package me.meeshy.sdk.post

import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

/**
 * Ce qu'UN geste optimiste a écrit sur la ligne d'un post (#13594) : une trace par ligne de la file d'envoi, clé = son
 * `cmid`, jamais une par post. Plusieurs gestes peuvent être en vol sur un même post (le premier part, le suivant
 * attend) : chaque retour arrière vise SON geste.
 *
 * [revertTo] est l'état du lecteur tel que le SERVEUR l'a avant ce geste. Quand un geste plus ancien est refusé, le
 * serveur ne l'a jamais reçu : le [revertTo] des gestes suivants redevient le sien, sinon un second refus rallumerait
 * un cœur que le serveur n'a jamais eu.
 */
internal class GestureTrace(
    val postId: String,
    val seq: Long,
    @Volatile var revertTo: Boolean,
    val state: Boolean,
    val count: Int,
)

internal class GestureTraces {
    private val byCmid = ConcurrentHashMap<String, GestureTrace>()
    private val sequence = AtomicLong()

    fun record(cmid: String, postId: String, revertTo: Boolean, state: Boolean, count: Int) {
        byCmid[cmid] = GestureTrace(postId, sequence.incrementAndGet(), revertTo, state, count)
    }

    /** La ligne n'a jamais été écrite dans la file (geste annulé par son contraire) : sa trace ne vise personne. */
    fun discard(cmid: String) {
        byCmid.remove(cmid)
    }

    fun forgetPost(postId: String) {
        byCmid.entries.removeIf { it.value.postId == postId }
    }

    fun clear() = byCmid.clear()

    /**
     * La file a REMPLACÉ les lignes [gone] par [cmid] (même geste, rejoué sans bascule de la ligne) : la plus récente trace
     * qui a écrit [state] passe sous [cmid], les autres traces de [gone] sortent. Sans cela, le refus de la
     * ligne de remplacement ne trouverait aucune trace et laisserait allumé un cœur que le serveur n'a jamais eu.
     */
    fun adopt(cmid: String?, state: Boolean, gone: List<String>) {
        val heir = gone.mapNotNull { byCmid[it] }.filter { it.state == state }.maxByOrNull { it.seq }
        gone.forEach(byCmid::remove)
        if (cmid != null && heir != null) byCmid[cmid] = heir
    }

    fun cmidsOf(postId: String): List<String> = byCmid.entries.filter { it.value.postId == postId }.map { it.key }

    /** Ce que le refus d'un geste emporte : sa trace, et si un geste plus récent du même post décide encore de l'état. */
    class Refusal(val trace: GestureTrace, val overridden: Boolean)

    /**
     * La trace du geste refusé : celle de [cmid], à défaut la plus récente du post qui a écrit l'état opposé à
     * [revertedTo]. Elle sort de la table, et les gestes plus récents du même post héritent de son [GestureTrace.revertTo].
     * Les gestes sont des états terminaux : tant qu'un plus récent attend, c'est lui qui décide de ce que le lecteur voit.
     */
    fun take(postId: String, cmid: String?, revertedTo: Boolean): Refusal? {
        val taken = if (cmid != null) {
            byCmid[cmid]?.takeIf { it.postId == postId }?.also { byCmid.remove(cmid) }
        } else {
            byCmid.entries
                .filter { it.value.postId == postId && it.value.state == !revertedTo }
                .maxByOrNull { it.value.seq }
                ?.also { byCmid.remove(it.key) }
                ?.value
        } ?: return null
        val later = byCmid.values.filter { it.postId == postId && it.seq > taken.seq }
        later.forEach { it.revertTo = taken.revertTo }
        return Refusal(taken, overridden = later.isNotEmpty())
    }
}
