package me.meeshy.sdk.model

/** Les phrases TalkBack d'une ligne de commentaire, composées sur des gabarits localisés fournis par l'hôte. */
public object CommentRowSemantics {

    /** iOS `a11y.comment.body` : « %1$@ : %2$@ » (heure, contenu). */
    public fun bodyLabel(format: String, time: String, content: String): String = String.format(format, time, content)

    public fun spokenContent(content: String, isVeiled: Boolean, veiledLabel: String): String =
        if (isVeiled) veiledLabel else content

    /** Valeur du bouton Répondre : le nombre de réponses, vide quand il n'y en a pas. */
    public fun replyValue(replyCount: Int, countFormat: String): String =
        if (replyCount > 0) String.format(countFormat, replyCount) else ""

    public fun likeStateDescription(isLiked: Boolean, count: Int, likedLabel: String, countFormat: String): String =
        listOfNotNull(
            likedLabel.takeIf { isLiked },
            String.format(countFormat, count).takeIf { count > 0 },
        ).joinToString(", ")
}
