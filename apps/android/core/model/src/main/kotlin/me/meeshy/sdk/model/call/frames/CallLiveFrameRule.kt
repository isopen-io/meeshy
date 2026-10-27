package me.meeshy.sdk.model.call.frames

/** Les règles pures du cadre en direct d'un duo (miroir de iOS `CallLiveFrameRule`) : quels cadres se proposent, et qui s'y nomme. */
object CallLiveFrameRule {
    const val PEOPLE: Int = 2
    const val ID_MAX_LENGTH: Int = 96
    private val ID_ALPHABET: Set<Char> = (('a'..'z') + ('0'..'9') + '-').toSet()

    /** Un cadre se propose en direct s'il sert un duo ET déclare la surface `live` : un cadre de capture seule ne sert jamais l'appel. */
    fun isEligible(design: CallFrameDesign): Boolean = design.serves(PEOPLE) && design.isOffered(CallFrameSurface.LIVE)

    fun frames(mood: CallFrameMood? = null, among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameDesign> =
        among.filter { isEligible(it) && (mood == null || it.mood == mood) }

    /** Les ambiances qui ont au moins un cadre en direct, dans l'ordre canonique. */
    fun moods(among: List<CallFrameDesign> = CallFrameCatalogue.all): List<CallFrameMood> {
        val served = frames(among = among).map { it.mood }.toSet()
        return CallFrameMood.entries.filter { it in served }
    }

    /** Le cadre en direct n'existe qu'en vidéo, à deux. */
    fun mayOffer(participants: Int, showsVideo: Boolean): Boolean = showsVideo && participants == PEOPLE

    /** Le cadre choisi devient-il visible ? Duo seulement, et seulement un cadre du catalogue servi en direct. */
    fun displayed(frameId: String?, participants: Int, among: List<CallFrameDesign> = CallFrameCatalogue.all): CallFrameDesign? {
        if (participants != PEOPLE || frameId == null) return null
        return CallFrameCatalogue.frame(frameId, among)?.takeIf { isEligible(it) }
    }

    /** La forme d'un identifiant du catalogue, celle que la passerelle exige. */
    fun isFrameId(value: String): Boolean {
        if (value.isEmpty() || value.length > ID_MAX_LENGTH) return false
        val parts = value.split('.')
        return parts.size in 2..4 && parts.all { part -> part.isNotEmpty() && part.all { it in ID_ALPHABET } }
    }

    /** Les personnes du cadre, dans l'ordre des cases : le nom que l'autre partage remplace celui qu'on connaissait de lui ; le mien ne change jamais. */
    fun people(subjects: List<CallFramePerson>, remoteSharedName: String?): List<CallFramePerson> {
        val shared = remoteSharedName?.trim()?.takeIf { it.isNotEmpty() } ?: return subjects
        return subjects.map { if (it.isSelf) it else it.copy(name = shared) }
    }
}
