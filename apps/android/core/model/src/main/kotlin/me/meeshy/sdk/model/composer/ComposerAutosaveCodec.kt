package me.meeshy.sdk.model.composer

/** Un nom de fichier STABLE par source : un même fichier, d'une sauvegarde à la suivante, n'est copié qu'une fois (FNV-1a, pas `hashCode`). */
public object ComposerAutosaveFileName {
    public const val SOURCE_PREFIX: String = "f-"

    /** Le dossier des copies de session d'un brouillon restauré. */
    public const val SESSION_DIRECTORY: String = "meeshy_composer_autosave_session"

    /** [path] est le chemin du fichier source ; une copie de session garde le nom qu'elle avait dans le brouillon. */
    public fun forSource(path: String): String {
        val segments = path.replace('\\', '/').split('/').filter { it.isNotEmpty() }
        val last = segments.lastOrNull().orEmpty()
        if (last.startsWith(SOURCE_PREFIX) && SESSION_DIRECTORY in segments) return last
        val ext = last.substringAfterLast('.', "").lowercase().ifEmpty { "bin" }
        return SOURCE_PREFIX + fnv1a(normalised(path)) + "." + ext
    }

    public fun forBlob(key: String): String = "s-" + fnv1a(key) + ".bin"

    public fun fnv1a(text: String): String {
        var hash = -0x340d631b7bdddcdbL
        for (byte in text.encodeToByteArray()) {
            hash = (hash xor (byte.toLong() and 0xff)) * 0x100000001b3L
        }
        return java.lang.Long.toHexString(hash)
    }

    private fun normalised(path: String): String = path.replace('\\', '/').replace(Regex("/+"), "/")
}

/** Ce qu'une écriture remet au magasin : les fichiers à copier dans le tiroir, déjà nommés (nom -> chemin source). */
public data class ComposerAutosaveMediaTable(
    val files: Map<String, String>,
    val aliases: Map<String, String> = emptyMap(),
) {
    val referencedFiles: Set<String> get() = files.keys
}

/**
 * L'aller et le retour entre une adresse de fichier et son nom dans le brouillon (iOS `ComposerAutosaveCodec`), par UNE table :
 * c'est ce qui garde cohérents les porteurs clés par adresse. Deux adresses d'un même fichier (copie de pose, pièce jointe)
 * partagent un seul fichier du brouillon et un alias.
 */
public object ComposerAutosaveCodec {

    /** L'aller : chaque adresse devient un nom ; [copies] relie une copie de pose à sa source (un fichier, deux noms). */
    public fun write(paths: Collection<String>, copies: Map<String, String> = emptyMap()): Pair<Map<String, String>, ComposerAutosaveMediaTable> {
        val files = linkedMapOf<String, String>()
        val aliases = linkedMapOf<String, String>()
        val names = linkedMapOf<String, String>()
        for (path in paths) {
            val name = ComposerAutosaveFileName.forSource(path)
            val source = copies[path]
            if (source == null) {
                files[name] = path
            } else {
                val canon = ComposerAutosaveFileName.forSource(source)
                files[canon] = source
                if (canon != name) aliases[name] = canon
            }
            names[path] = name
        }
        return names to ComposerAutosaveMediaTable(files, aliases)
    }

    /** Le retour : chaque nom redevient l'adresse de la copie de session ; un nom sans copie (fichier perdu) tombe seul. */
    public fun restore(names: Map<String, String>, sessionPathByFile: Map<String, String>, aliases: Map<String, String> = emptyMap()): Map<String, String> {
        val resolved = sessionPathByFile.toMutableMap()
        aliases.forEach { (alias, canon) ->
            if (alias !in resolved) sessionPathByFile[canon]?.let { resolved[alias] = it }
        }
        return names.mapNotNull { (path, name) -> resolved[name]?.let { path to it } }.toMap()
    }
}
