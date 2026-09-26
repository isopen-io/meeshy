import SwiftUI
import MeeshySDK

// MARK: - La légende servie et ce que VoiceOver en dit

// Extrait de `ConversationMediaGalleryView.swift` (#8095) : le fichier touchait
// le plafond de 1 200 lignes, et le lot qui fait feuilleter à la galerie les
// médias jamais chargés devait y ajouter une propriété et un suivi de page. On
// extrait d'abord, on ajoute ensuite. La découpe suit une RESPONSABILITÉ — ce
// que la galerie DIT d'une pièce (légende, langues, libellés VoiceOver) — et
// ne change aucun comportement : les corps sont déplacés à l'identique.

extension ConversationMediaGalleryView {

    /// **Le texte de la légende, dans la langue courante** — source UNIQUE pour
    /// l'affichage ET pour VoiceOver (#4934).
    ///
    /// Les deux la partagent parce qu'un lecteur d'écran qui énoncerait une
    /// autre langue que celle affichée serait pire qu'un lecteur muet : il
    /// affirmerait quelque chose de faux. C'est la leçon de
    /// `reference_one_string_for_sight_and_for_voiceover_serves_one_of_them`,
    /// prise par l'autre bout.
    func servedCaption(_ id: String) -> String? {
        if let serving = captionServings[id] {
            if let chosen = captionLanguage[id], let texte = serving.alternatives[chosen] {
                return texte.isEmpty ? nil : texte
            }
            return serving.text.isEmpty ? nil : serving.text
        }
        guard let simple = captionMap[id], !simple.isEmpty else { return nil }
        return simple
    }

    /// Les langues offertes pour CE média — vides quand il n'y a rien à
    /// basculer. Ordonnées pour que la rangée ne danse pas d'un rendu à l'autre :
    /// un dictionnaire n'a pas d'ordre, et une rangée de drapeaux qui se
    /// réarrange à chaque redessin serait illisible.
    func captionLanguages(_ id: String) -> [String] {
        guard let serving = captionServings[id], serving.alternatives.count > 1 else { return [] }
        return serving.alternatives.keys.sorted()
    }

    /// La langue ACTIVE : celle que le lecteur a choisie, sinon celle dont le
    /// texte est servi. Déduire l'active du TEXTE plutôt que de la supposer
    /// évite qu'un drapeau se dise actif au-dessus d'une autre langue.
    func activeCaptionLanguage(_ id: String) -> String? {
        if let chosen = captionLanguage[id] { return chosen }
        guard let serving = captionServings[id] else { return nil }
        return serving.alternatives.first(where: { $0.value == serving.text })?.key
    }

    /// Libellé VoiceOver d'une image plein écran : la légende si le call site en
    /// fournit une, sinon un libellé générique (l'image ne doit jamais être muette).
    func imageAccessibilityLabel(_ attachment: MessageAttachment) -> String {
        if let caption = servedCaption(attachment.id) {
            return caption
        }
        return String(localized: "gallery.image", defaultValue: "Image", bundle: .main)
    }

    /// Résumé VoiceOver de la rangée métadonnées (dimensions + poids), joint de
    /// façon locale-aware. Chaîne vide si aucune métadonnée n'est disponible.
    func mediaMetadataAccessibilityLabel(_ att: MessageAttachment) -> String {
        var parts: [String] = []
        if let w = att.width, let h = att.height, w > 0, h > 0 {
            parts.append(String(
                format: String(localized: "gallery.dimensions", defaultValue: "%1$d par %2$d", bundle: .main),
                w, h
            ))
        }
        if att.fileSize > 0 {
            parts.append(att.fileSizeFormatted)
        }
        return ListFormatter.localizedString(byJoining: parts)
    }
}
