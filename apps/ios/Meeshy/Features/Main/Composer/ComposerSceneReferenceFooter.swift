import SwiftUI
import MeeshySDK
import MeeshyUI

// MARK: - Ce que la publication EMPORTE, au pied de la scène (#5002)

/// **La règle : qui paraît au pied de la scène, et qui n'y paraît jamais.**
///
/// > Directive porteur 2026-09-03 : « les hashtag et mention referencé (pas les
/// > mention inline et mention caché) doivent apparaitre en bas de la scene ».
///
/// Les deux exclusions ne sont pas du même ordre, et c'est ce qui rend la règle
/// intéressante :
///
/// - **INLINE** est déjà VISIBLE — le `@handle` est écrit dans le texte, que
///   l'auteur relit. Le répéter au pied dirait deux fois la même chose ;
/// - **SILENT** est délibérément INVISIBLE aux tiers (« Notifier seulement »).
///   Le montrer au pied ne serait pas une redite mais une CONTRADICTION :
///   l'auteur croirait que sa publication l'annonce.
///
/// PINNED n'y paraît pas davantage : la pastille posée sur le canevas EST son
/// affichage — c'est exactement le raisonnement de `ReferenceNoteRow`, et c'est
/// pourquoi cette vue ne réécrit pas la règle mais MONTE la rangée du lecteur.
///
/// **Le pied du composer et la rangée du lecteur sont la même vue.** Un auteur
/// qui voit « Avec Alice, Bob » pendant qu'il compose voit littéralement ce que
/// son lecteur verra ; une seconde implémentation aurait divergé au premier mode
/// ajouté, chaque copie restant cohérente avec elle-même.
enum ComposerSceneReferences {

    /// Les références du composer, traduites dans le modèle que la rangée du
    /// lecteur lit. **Aucun filtre ici** : `ReferenceNoteRow.noted(in:)` est le
    /// site unique de l'exclusion, et le doubler recréerait la divergence que
    /// cette vue existe pour éviter.
    static func readerReferences(from references: [ComposerReference]) -> [PostReference] {
        references.map {
            PostReference(userId: $0.userId ?? $0.username,
                          username: $0.username,
                          display: $0.display)
        }
    }

    /// **Y a-t-il quelque chose à montrer ?** Répondu sans monter la vue, et
    /// sans recopier la règle : la question passe par le même filtre que le
    /// rendu.
    static func isServed(hashtags: [String], references: [ComposerReference]) -> Bool {
        !hashtags.isEmpty
            || !ReferenceNoteRow.noted(in: readerReferences(from: references)).isEmpty
    }
}

// MARK: - Le pied

/// **Ce que la publication emporte, lu au pied de la scène** (#5002).
///
/// ## Pourquoi au pied, et dans le COULOIR
///
/// La scène montre ce que le lecteur VERRA ; les hashtags et les personnes
/// nommées ne se peignent sur aucun de ses pixels. Les poser sur la carte
/// ferait mentir l'aperçu sur le rendu final (`apps/ios/CLAUDE.md` § 1, loi 6),
/// et volerait au passage les touches de la bande qu'ils couvriraient — un
/// objet se déplace n'importe où dans le cadre.
///
/// Le pied est donc le couloir du plateau, sous la carte : la place que
/// l'escalier du bas donne déjà à ce qui appartient à la PUBLICATION.
///
/// ## Ce que le doigt ouvre
///
/// Les deux feuilles qui existent déjà — celle des hashtags, celle des
/// mentions. Le pied n'édite rien lui-même : il LIT, et ouvre l'endroit où l'on
/// modifie. C'est la même division du travail que la trace du son de fond, qui
/// se lit au-dessus de la scène et s'édite dans sa feuille.
struct ComposerSceneReferenceFooter: View {

    /// Les balises DÉRIVÉES du texte de la publication, sans leur `#`
    /// (`ComposerHashtags.tags(in:)`). Le pied ne les cherche pas : les
    /// dériver ici ouvrirait un second chemin vers le même fait.
    let hashtags: [String]

    /// Les personnes que la publication nomme, tous modes confondus. Le pied
    /// les filtre par la rangée du lecteur — lui passer une liste déjà filtrée
    /// déplacerait la règle chez l'appelant, où elle se dédoublerait.
    let references: [ComposerReference]

    /// **Le bord gauche du DESSIN**, mesuré par la surface — la JUMELLE BASSE
    /// de ce que `ComposerSceneSoundHeader` reçoit depuis #5011 (#5036).
    ///
    /// > Directive porteur 2026-09-03 : « les hashtag et mention doivent etre
    /// > directement en bas de la scene **aligé comme le son de fond de la
    /// > scene** ! »
    ///
    /// Le montage posait `.padding(.horizontal, 16)` — un littéral, quand la
    /// carte est ajustée à son ratio puis CENTRÉE : son bord gauche vaut
    /// `16 + (largeur de carte − largeur de dessin) / 2`, et bouge avec le ratio
    /// comme avec l'écran. Mesuré au #5017 : 65 pt là où le littéral en donnait
    /// 44. Les deux bandes qui encadrent la carte s'alignaient donc l'une sur le
    /// dessin et l'autre sur le couloir — le même mot, deux bords.
    ///
    /// `0` avant la première passe de mise en page : le pied se pose alors au
    /// bord et se recale à la frame suivante, sans saut visible (il n'apparaît
    /// que lorsqu'une référence existe, donc jamais pendant l'ouverture).
    var leadingInset: CGFloat = 0

    var tint: Color = MeeshyColors.indigo400

    /// `nil` ⇒ la ligne reste une lecture, et ne s'annonce alors ni comme
    /// bouton ni comme activable (loi 4 : un contrôle existe s'il a un effet).
    var onOpenHashtags: (() -> Void)?
    var onOpenMentions: (() -> Void)?

    private var readerReferences: [PostReference] {
        ComposerSceneReferences.readerReferences(from: references)
    }

    var body: some View {
        if ComposerSceneReferences.isServed(hashtags: hashtags, references: references) {
            VStack(alignment: .leading, spacing: 6) {
                if !hashtags.isEmpty { hashtagRow }
                // La rangée du LECTEUR, montée telle quelle : elle porte la
                // règle d'exclusion, le mot « Avec » et la ponctuation.
                // `currentUserId: nil` retire le marqueur « Vous êtes
                // référencé·e ici » — il répond à quelqu'un qui vient de
                // recevoir une notification, ce que l'auteur n'est pas.
                ReferenceNoteRow(references: readerReferences,
                                 currentUserId: nil,
                                 accentColor: tint) { _ in
                    onOpenMentions?()
                    HapticFeedback.light()
                }
                .equatable()
            }
            .padding(.leading, leadingInset)
            .padding(.trailing, leadingInset)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    /// Les balises, en rangée qui défile — une publication peut en porter
    /// beaucoup, et les laisser passer à la ligne ferait sauter la scène d'une
    /// hauteur variable à chaque frappe.
    private var hashtagRow: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 6) {
                ForEach(hashtags, id: \.self) { balise in
                    chip(balise)
                }
            }
        }
        // Une seule annonce pour toute la rangée : autant d'arrêts VoiceOver
        // que de balises pour une information qui se lit d'un coup serait une
        // punition, pas une aide.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Self.spokenHashtags(hashtags))
        .accessibilityAddTraits(onOpenHashtags == nil ? [] : .isButton)
        .accessibilityAction { onOpenHashtags?() }
    }

    @ViewBuilder
    private func chip(_ balise: String) -> some View {
        // **Elle SCALE.** Une taille figée ne se justifie que par un cadre fixe
        // qui déborderait en grandissant ; une capsule à hauteur minimale n'en
        // est pas un, et figée sous une rangée « Avec … » qui scale, elle
        // inverserait la hiérarchie du pied aux grandes tailles.
        let etiquette = Text("#\(balise)")
            .font(MeeshyFont.relative(13, weight: .semibold))
            .foregroundStyle(tint)
            .lineLimit(1)
            .padding(.horizontal, 10)
            .frame(minHeight: 28)
            .background(Capsule().fill(tint.opacity(0.14)))
        if let onOpenHashtags {
            Button {
                onOpenHashtags()
                HapticFeedback.light()
            } label: { etiquette }
                .buttonStyle(.plain)
        } else {
            etiquette
        }
    }

    /// **Les balises se DISENT sans leur croisillon.** « #voyage » s'annonce
    /// « dièse voyage » ou, pire, se tait : le mot compte, le signe est une
    /// convention d'écriture.
    static func spokenHashtags(_ hashtags: [String]) -> String {
        let role = String(localized: "composer.scene.hashtags.a11y",
                          defaultValue: "Hashtags", bundle: .main)
        guard !hashtags.isEmpty else { return role }
        return "\(role) : \(hashtags.joined(separator: ", "))"
    }
}
