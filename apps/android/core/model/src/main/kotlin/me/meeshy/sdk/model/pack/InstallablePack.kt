package me.meeshy.sdk.model.pack

/**
 * **Ce qu'un pack, de n'importe quel domaine, doit dire pour qu'une étagère l'installe, le retire et le compte** —
 * les champs communs de `PackSummaryBase`. [P] est le type concret : l'étagère reçoit des copies, jamais une mutation.
 */
interface InstallablePack<P : InstallablePack<P>> {
    val slug: String
    val installed: Boolean
    val installCount: Int

    /** Dessiné ou embarqué par le client : installer ne rapporte aucun octet, donc aucune relecture des installés. */
    val isBundled: Boolean

    fun withInstall(installed: Boolean, installCount: Int): P
}
