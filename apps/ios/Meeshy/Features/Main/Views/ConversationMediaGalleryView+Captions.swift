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

    /// La rangée de langues de la légende (`GalleryCaptionLanguageRow`) — absente
    /// dès qu'il n'y a rien à basculer (loi 4).
    @ViewBuilder
    func captionLanguageRow(_ id: String) -> some View {
        let langues = captionLanguages(id)
        if !langues.isEmpty {
            GalleryCaptionLanguageRow(languages: langues,
                                      active: activeCaptionLanguage(id)) { code in
                captionLanguage[id] = code
            }
        }
    }

    /// **La légende du plein écran rejoint la couche PARTAGÉE.**
    ///
    /// Une troisième façon de replier la même chose — `Text` brut,
    /// `lineLimit(4)`, aucune bascule — serait la forme INERTE : une légende de
    /// cinq lignes s'y arrêterait au milieu d'une phrase, sans que rien n'indique
    /// qu'il en reste, ni ne permette de la lire.
    ///
    /// > Deux surfaces converties sur trois, c'est une règle qui a l'air
    /// > partagée. La troisième ne rougit pas : elle affiche un texte, tronqué
    /// > proprement, et seule la comparaison avec ses sœurs le révèle.
    ///
    /// Ce qui passe au composant est la RÈGLE — 15 mots de tête au-delà de 30,
    /// l'invite, l'ancrage bas-gauche déplié. Le retrait reste 16 pt, celui de
    /// `bottomMetadataOverlay` juste au-dessus : la légende s'aligne sur sa
    /// colonne, comme en réel.
    func captionOverlay(_ text: String, links: [String: String]) -> some View {
        MediaCaptionOverlay(caption: text,
                            isExpanded: captionExpanded,
                            trackedLinks: links,
                            horizontalInset: 16,
                            maxExpandedHeight: cadreCaptionMaxHeight,
                            // **« JUSTE afficher le texte déplié avec effet
                            // ombre »** — donc pas de voile en plus. Le
                            // dégradé noir du composant sert les hôtes qui
                            // n'ont rien d'autre pour détacher le texte ; ici
                            // l'ombre suffit, et le voile masquait le média
                            // que l'utilisateur est venu regarder.
                            dimsBackgroundWhenExpanded: false,
                            onToggle: {
                                withAnimation(.easeInOut(duration: 0.2)) {
                                    captionExpanded.toggle()
                                }
                            })
            .padding(.vertical, MeeshySpacing.sm)
    }
}
