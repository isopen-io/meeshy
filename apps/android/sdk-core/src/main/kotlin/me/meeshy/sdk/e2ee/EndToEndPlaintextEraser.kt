package me.meeshy.sdk.e2ee

/**
 * **Un clair E2EE effacé quitte aussi le coffre local** (#14633, miroir de `EndToEndPlaintextJanitor`, iOS #13001) :
 * suppression pour tous, retrait pour moi, éphémère échu, vue unique ouverte. Modèle de menace : un appareil volé qui
 * garderait le texte d'un message que tout le monde croit parti.
 *
 * Les clés sont celles sous lesquelles le coffre a pu ranger le message : son identifiant servi, et l'identifiant client
 * de MES envois. Un échec ne remonte pas : la projection du fil (`LibsignalEndToEndThread`) réessaie à chaque lecture.
 */
public interface EndToEndPlaintextEraser {
    public suspend fun erase(messageIds: Collection<String>)

    public companion object {
        /** Aucun coffre : rien à retirer (témoins, et tout hôte sans E2EE). */
        public val None: EndToEndPlaintextEraser = object : EndToEndPlaintextEraser {
            override suspend fun erase(messageIds: Collection<String>) = Unit
        }
    }
}
