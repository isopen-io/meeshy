package me.meeshy.sdk.model.comment

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import java.util.Base64

/**
 * Une pièce de commentaire DÉJÀ téléversée, rangée sous son index d'origine (iOS `UploadedCommentMedia`).
 * L'instant du téléversement voyage avec l'id : le serveur balaie au bout de 24 h un média pré-téléversé qu'aucun
 * commentaire n'a réclamé, un rejeu tardif re-téléverse donc le fichier, toujours sur le disque.
 */
@Serializable
public data class UploadedCommentMedia(
    val sourceIndex: Int,
    val id: String,
    val uploadedAtMillis: Long,
) {
    public fun isClaimable(nowMillis: Long): Boolean {
        val age = nowMillis - uploadedAtMillis
        return age >= 0 && age < CLAIM_WINDOW_MS
    }

    public companion object {
        /** Sous les 24 h du balayage serveur, avec la marge d'un rejeu lent. */
        public const val CLAIM_WINDOW_MS: Long = 20L * 60L * 60L * 1000L
    }
}

/** Le jeton présenté ne désigne pas l'auteur du commentaire : rien ne part. */
public class CommentOwnershipRefusal : Exception("Le compte courant n'est pas l'auteur du commentaire")

/**
 * Un commentaire en attente appartient au compte qui l'a écrit, et à lui seul. UNE règle, fermée par défaut : tout ce qui
 * ne permet pas de DÉCIDER (auteur absent ou vide, jeton absent ou illisible) vaut NON (iOS `CommentOwnership`).
 */
public object CommentOwnership {

    /** Un identifiant de compte utilisable, `null` quand il est absent ou vide. */
    public fun identity(raw: String?): String? = raw?.trim()?.takeIf { it.isNotEmpty() }

    /** `true` SEULEMENT quand [currentUserId] est l'auteur déclaré. */
    public fun owns(authorId: String?, currentUserId: String?): Boolean {
        val author = identity(authorId) ?: return false
        return author == identity(currentUserId)
    }

    /** Le compte qu'un jeton de session DÉSIGNE (revendication `userId` du JWT), `null` pour tout jeton mal formé. */
    public fun userIdInToken(token: String?): String? {
        val parts = token?.split('.') ?: return null
        if (parts.size != JWT_PARTS) return null
        val claims = runCatching {
            Json.parseToJsonElement(String(Base64.getUrlDecoder().decode(parts[1]), Charsets.UTF_8))
        }.getOrNull() as? JsonObject ?: return null
        return identity((claims["userId"] as? JsonPrimitive)?.takeIf { it.isString }?.contentOrNull)
    }

    /**
     * Le jeton sous lequel ce commentaire a le droit de partir : celui qui est remis, SI il désigne l'auteur déclaré.
     * Vérification et envoi lisent la même valeur — aucune seconde lecture, donc aucun décalage.
     */
    public fun tokenBound(authorId: String?, token: String?): String {
        val author = identity(authorId)
        val designated = userIdInToken(token)
        if (token.isNullOrEmpty() || author == null || designated != author) throw CommentOwnershipRefusal()
        return token
    }

    private const val JWT_PARTS = 3
}

/** Ce qu'un envoi (ou un rejeu) doit faire de chaque pièce d'un commentaire (iOS `CommentMediaReplay.plan`). */
public object CommentMediaResume {

    public data class Plan(
        /** Les pièces déjà montées et encore présentables. */
        val acquired: List<UploadedCommentMedia>,
        /** Les index à téléverser (jamais montés, ou montés depuis trop longtemps). */
        val toUpload: List<Int>,
        /** Les index dont le fichier a disparu ET qu'aucun id présentable ne couvre. */
        val missing: List<Int>,
    )

    public fun plan(
        pieceCount: Int,
        uploaded: List<UploadedCommentMedia>,
        nowMillis: Long,
        fileExists: (Int) -> Boolean,
    ): Plan {
        val known = uploaded.associateBy { it.sourceIndex }
        val indexes = 0 until pieceCount
        val claimable = indexes.mapNotNull { index -> known[index]?.takeIf { it.isClaimable(nowMillis) } }
        val covered = claimable.mapTo(HashSet()) { it.sourceIndex }
        val rest = indexes.filter { it !in covered }
        return Plan(claimable, rest.filter(fileExists), rest.filterNot(fileExists))
    }

    /** Les ids à lier au commentaire, dans l'ordre où l'auteur a posé ses pièces. */
    public fun attachmentIds(uploaded: List<UploadedCommentMedia>): List<String> =
        uploaded.sortedBy { it.sourceIndex }.map { it.id }
}
