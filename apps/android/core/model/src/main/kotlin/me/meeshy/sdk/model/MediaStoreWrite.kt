package me.meeshy.sdk.model

/** Où une entrée de l'album vit : son nom d'affichage et son dossier MediaStore (`Pictures/Meeshy`, `Movies/Meeshy`). */
public data class GalleryEntryName(
    val displayName: String,
    val relativePath: String,
)

/**
 * La galerie connaît-elle une entrée de ce nom ? Rend son URI, ou `null` quand elle ne la montre pas (#14651).
 *
 * Sans permission de lecture, MediaStore ne montre à l'app que ce qu'ELLE a écrit depuis son installation : `null`
 * ne prouve donc aucune absence, et l'écriture garde le dernier mot ([MediaStoreWrite.NameTaken]).
 */
public fun interface MediaStoreNameLookup {
    public fun find(entry: GalleryEntryName): String?
}

/** Ce qu'une écriture dans MediaStore a produit. */
public sealed interface MediaStoreWrite {
    public data class Written(val uri: String) : MediaStoreWrite

    /**
     * L'album portait déjà un fichier de ce nom, que MediaStore a refusé d'écraser en renommant le nouveau : le nom
     * étant dérivé de l'empreinte, c'est CE média. La copie a été retirée.
     */
    public data object NameTaken : MediaStoreWrite

    public data object Failed : MediaStoreWrite

    public companion object {
        /**
         * Lit le nom que MediaStore a VRAIMENT donné à l'entrée [uri] demandée sous [requested] : renommée en
         * « nom (n).ext », c'est qu'un fichier de ce nom occupait déjà l'album — même s'il appartient à une
         * installation précédente et reste invisible à celle-ci. Un nom illisible ou autrement changé ne prouve rien.
         */
        public fun classify(uri: String, requested: String, actual: String?): MediaStoreWrite {
            if (actual == null || actual == requested) return Written(uri)
            val dot = requested.lastIndexOf('.')
            val base = if (dot > 0) requested.substring(0, dot) else requested
            val extension = if (dot > 0) requested.substring(dot) else ""
            val renamed = Regex("^" + Regex.escape(base) + " \\(\\d+\\)" + Regex.escape(extension) + "$")
            return if (renamed.matches(actual)) NameTaken else Written(uri)
        }
    }
}
