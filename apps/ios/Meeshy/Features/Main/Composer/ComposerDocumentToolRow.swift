import SwiftUI

// **La GÉOMÉTRIE de la rangée d'entrées du document, sortie de
// `ComposerDocumentRules.swift` le 2026-08-31.**
//
// Extraction par RESPONSABILITÉ, pas par tranche : ce fichier ne décide de rien
// sur le contenu d'un document — il ne répond qu'à « qu'est-ce qui TIENT, et
// qu'est-ce qui PARAÎT ». Le fichier d'origine avait franchi le budget de
// 1 100 lignes, et la directive du 2026-08-28 dit d'extraire AVANT d'ajouter.
//
// Il rejoint les compagnons de l'unité de la surface document
// (`AppSourceGuard.composerSurfaceCompanions`) : son nom ne porte pas celui du
// type hôte, donc aucun glob ne l'attrape — c'est exactement ce à quoi
// `alsoIncluding` sert, et l'oublier rendrait aveugle toute garde qui ancre sur
// cette règle.

/// **La géométrie de la rangée d'entrées — et le seul témoin qui compte (#4071).**
///
/// Mesuré au simulateur `Meeshy-iOS26`, taille de police NOMINALE, écran de
/// 402 pt : quatre tuiles visibles sur sept. « DOC », « LIEU » et « MICRO » ne
/// rendaient **aucun pixel**, alors que leurs trois chaînes vont jusqu'au
/// brouillon et au publieur. Du travail livré, testé, et qu'aucun utilisateur
/// ne pouvait atteindre.
///
/// **Le `ScrollView` n'est pas le coupable, l'absence de SIGNAL l'est.** C'est
/// la conclusion de #4379 sur la rangée de la scène, et elle vaut mot pour mot
/// ici : un défilement posé pour `accessibility-XXXL` finit par masquer des
/// outils dans le cas nominal, et **il n'a pas d'état d'échec** — rien ne
/// rougit, aucune garde ne tombe, l'outil disparaît en silence.
///
/// Trois issues fermées ici, et une écartée :
/// - retirer un outil ⇒ **non**, la loi 1 dit que ce qui dépasse reste ;
/// - tout faire tenir ⇒ **non** : à sept tuiles nommées plus la pastille de
///   langue, sur 402 pt, la tuile tomberait sous 44 pt — on n'achète pas
///   « tout est visible » en rendant les cibles introuvables au doigt ;
/// - faire PARAÎTRE la dernière ⇒ **oui**. Une tuile coupée invite à balayer ;
///   une tuile absente est un outil qui n'existe pas.
nonisolated enum ComposerDocumentToolRowFit {

    /// Plancher tactile, jamais une variable d'ajustement.
    static let minimumTileWidth: CGFloat = 44
    /// Resserré de 8 à 6 au #4071 : six écarts rendus, c'est une tuile de plus
    /// qui paraît. L'aération se paie ailleurs — sur la marge de la rangée.
    static let spacing: CGFloat = 6

    static func rowWidth(count: Int) -> CGFloat {
        guard count > 0 else { return 0 }
        return CGFloat(count) * minimumTileWidth + CGFloat(count - 1) * spacing
    }

    static func overflow(count: Int, available: CGFloat) -> CGFloat {
        max(0, rowWidth(count: count) - available)
    }

    /// **La dernière tuile montre-t-elle quelque chose ?**
    ///
    /// Elle commence après les `count - 1` précédentes ; elle paraît si ce
    /// début tombe AVANT le bord visible. Le témoin porte sur le début et non
    /// sur la fin, parce que c'est le premier pixel qui fait le signal — pas
    /// la tuile entière.
    static func lastTilePeeks(count: Int, available: CGFloat) -> Bool {
        guard count > 0, available > 0 else { return false }
        let debutDeLaDerniere = CGFloat(count - 1) * (minimumTileWidth + spacing)
        return debutDeLaDerniere < available
    }
}
