import CoreGraphics
import Foundation

/// Quelles surfaces le lecteur a ouvertes PAR-DESSUS la story, et lesquelles
/// d'entre elles embarquent leur propre défilement. Fonctions pures des
/// drapeaux d'affichage que le lecteur tient : il les lit, elles décident.
enum StoryReaderSurfaceRules {

    /// Surfaces que le reader ouvre PAR-DESSUS la story : strip de langues,
    /// barre d'emojis, overlay de commentaires, sélecteurs plein écran.
    ///
    /// Elles ont toutes le même contrat (directive user 2026-07-25) : un toucher
    /// n'importe où les referme, et un changement de slide aussi. Sans ce
    /// contrat commun, chaque surface exigeait un geste différent — et taper à
    /// côté faisait avancer la story au lieu de la refermer.
    static func hasActiveFeature(
        showLanguageOptions: Bool,
        showFullLanguagePicker: Bool,
        showEmojiStrip: Bool,
        showFullEmojiPicker: Bool,
        showCommentsOverlay: Bool,
        showAudioTranscript: Bool
    ) -> Bool {
        showLanguageOptions || showFullLanguagePicker
            || showEmojiStrip || showFullEmojiPicker
            || showCommentsOverlay
            || showAudioTranscript
    }

    /// Sous-ensemble des surfaces du reader qui embarquent leur PROPRE
    /// `ScrollView` (liste de commentaires, sélecteur d'emojis plein écran,
    /// explorateur de langues). Le drag du lecteur est monté sur un ancêtre de
    /// toutes : quand l'`UIScrollView` de la surface emporte la séquence de
    /// touches, SwiftUI ne délivre JAMAIS le `onEnded` du drag — et la lecture
    /// restait gelée. Un geste NÉ dans l'une d'elles est donc rendu au scroll
    /// (cf. la garde de point de départ dans `unifiedDragGesture`), tandis
    /// qu'un geste né dans la story encore visible AU-DESSUS reste au drag
    /// parent, qui peut ainsi refermer la surface d'un glissement.
    ///
    /// Les surfaces NON scrollables (strip d'emojis, strip de langues — qui revendique son glissé horizontal quand il défile, #12646 —,
    /// transcription) gardent, elles, le swipe de fermeture — c'est un simple
    /// bandeau, aucun recognizer concurrent ne peut voler le geste.
    /// **La légende dépliée en fait partie depuis #4831.** Son corpus est une
    /// `ScrollView` comme les autres, et elle a vécu HORS de cette liste tout le
    /// temps où elle a existé : un glissement pour lire faisait naviguer ou
    /// refermer.
    ///
    /// > Un mécanisme de cession qui ÉNUMÈRE ses ayants droit ne protège que ce
    /// > qu'on a pensé à y inscrire. Chaque surface défilante ajoutée après lui
    /// > naît hors de sa protection, et rien ne rougit — le mécanisme fait
    /// > exactement ce pour quoi il a été écrit.
    static func hasScrollableSurface(
        showCommentsOverlay: Bool,
        showFullEmojiPicker: Bool,
        showFullLanguagePicker: Bool,
        isCaptionExpanded: Bool
    ) -> Bool {
        showCommentsOverlay || showFullEmojiPicker || showFullLanguagePicker
            || isCaptionExpanded
    }

    /// Bord supérieur de la surface scrollable à opposer au point de départ du
    /// drag — `nil` quand il n'est pas connu, ce que la garde interprète comme
    /// « tout le geste revient à la surface » (fail-safe).
    ///
    /// DEUX SURFACES SUR TROIS RESTENT `nil` VOLONTAIREMENT : le sélecteur
    /// d'emojis plein écran (`EmojiFullPickerSheet`, MeeshyUI) et l'explorateur
    /// de langues (`StoryLanguageDetailView`) rendent tous deux un panneau
    /// bas-ancré À L'INTÉRIEUR d'une racine plein écran (scrim + panneau). Depuis
    /// le point d'insertion, un `GeometryReader` ne mesurerait que cette racine —
    /// `minY == 0`, soit « la surface commence en haut de l'écran », une valeur
    /// vraie mais inutile. Leur panneau, lui, est redimensionnable (poignée de
    /// l'emoji picker) et son cadre n'est publié nulle part. Estimer sa hauteur
    /// ici dupliquerait des constantes d'un autre module, dont la dérive
    /// laisserait passer un geste NÉ DANS le `ScrollView` : `onEnded` jamais
    /// délivré, `gestureAxis` collé à 2, lecture gelée. On préfère le
    /// conservatisme jusqu'à ce que ces deux vues publient elles-mêmes la clé
    /// `StoryReaderScrollableSurfaceTopKey` depuis le parent de leur `ScrollView`
    /// (une ligne dans chacune, hors périmètre de ce lot).
    static func effectiveScrollableSurfaceTopY(
        showFullEmojiPicker: Bool,
        showFullLanguagePicker: Bool,
        measuredTopY: CGFloat?
    ) -> CGFloat? {
        if showFullEmojiPicker || showFullLanguagePicker { return nil }
        return measuredTopY
    }
}
