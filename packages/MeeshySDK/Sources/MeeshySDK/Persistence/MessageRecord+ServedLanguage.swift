import Foundation

// #9191 — la langue d'origine d'une ligne se corrige à chaque charge servie.
//
// Une ligne peut naître avec une langue d'origine PROVISOIRE : la bulle
// pré-enregistrée par la NSE (`"en"` quand le push n'en porte pas), la
// réconciliation depuis le cache (`"fr"` en dur), un envoi optimiste (langue
// devinée au clavier). La branche de mise à jour de `upsertFromAPIMessages`
// ne la touchait jamais : la première valeur écrite restait définitive. Or la
// bulle résout le Prisme sur cette colonne — une origine fausse au rang 1 du
// lecteur (« fr ») lui fait servir l'ORIGINAL coréen pendant que l'aperçu de
// liste, qui lit `lastMessageOriginalLanguage` servi par la passerelle, sert
// la traduction. Ni une relance ni une réouverture n'y changeaient rien.

extension MessageRecord {

    /// Adopte la langue d'origine que la passerelle sert. Une charge sans
    /// langue (événement partiel, passerelle ancienne) ne retire rien.
    mutating func adoptServedOriginalLanguage(_ served: String?) {
        guard let served, !served.isEmpty else { return }
        originalLanguage = served
    }
}
