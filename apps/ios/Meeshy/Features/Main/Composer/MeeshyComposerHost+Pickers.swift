import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI

// **Ce qui fait CHOISIR** — les six sélecteurs que le portail du composer
// monte : lieu, langue (sa capsule et sa liste), emoji, sticker, référence.
//
// Extrait de `MeeshyComposerHost+Intake.swift` au #6069, qui avait franchi le
// plafond de 1 200 lignes (#6047 l'a porté de 1 195 à 1 265 — cinq lignes de
// marge, et aucun témoin de PR pour le dire, la suite iOS étant compile-only
// sans mot-clé d'adhésion).
//
// **La ligne de partage est ce que le meuble FAIT, pas ce qu'il MONTE** :
// `+Intake` fait ENTRER de la matière et aiguille ce que les feuilles rendent ;
// ce fichier fait CHOISIR une valeur — un lieu, une langue, un glyphe, une
// référence — et rend la main. `documentOffersNearbyDiscoverability` reste
// donc chez `+Intake` bien qu'il jouxte le sélecteur de lieu : c'est une RÈGLE
// d'offre, pas un sélecteur, et la garde qui le surveille le nomme par son
// fichier.

extension MeeshyComposerHost {

    /// **Le sélecteur de lieu (T2.5)**, monté ICI plutôt que dans
    /// `ComposerDocumentSurface` — même patron que `documentCameraSheet`
    /// (`MeeshyComposerHost+DocumentSurface.swift`) : le picker est le même
    /// composant que montait le composer
    /// inline du fil (`handleFeedLocationSelection`, RETIRÉE en #6016 — ce
    /// meuble EST ce qui l'a remplacée), et il se referme lui-même
    /// (`LocationPickerView.dismiss()`) après `onSelect`.
    ///
    /// **Un lieu choisi recalcule le second opt-in DEPUIS LA MÉMOIRE**, jamais
    /// depuis l'état courant : `FeedNearbyDiscoverability.choiceForNewPlace()`
    /// lit `LocationSharingPreferencesStore` à cet instant précis, exactement
    /// ce que faisait le composer inline sur le même geste — un second lieu choisi
    /// dans la même session doit repartir du dernier palier RETENU, pas d'un
    /// toggle resté ouvert pour le lieu précédent.
    var documentLocationPickerSheet: some View {
        LocationPickerView(accentColor: MeeshyColors.brandPrimaryHex) { place in
            documentLocation = place
            documentDiscoverability = FeedNearbyDiscoverability.choiceForNewPlace()
        }
    }


    /// **La capsule de langue (T2.2)** — le septième contrôle que la feuille
    /// historique porte dans la même barre que les six outils d'attache
    /// (`FeedComposerSheet`, `composerLanguage`), et que la porte du document
    /// n'avait ni en champ, ni en contrôle, ni en canal sur
    /// `ComposerDocumentDraft` avant ce lot.
    ///
    /// Même capsule, même sélecteur que la feuille : `ComposerLanguageFlag` et
    /// `AudioLanguagePickerView` tournent déjà en production, et en fabriquer
    /// une seconde paire ici donnerait deux listes de langues et deux mémoires
    /// à faire diverger.
    /// Le nom LOCALISÉ de la langue déclarée, pour VoiceOver — un emoji drapeau
    /// ne se lit pas utilement (contrat de `ComposerLanguageFlag`). Miroir de
    /// `composerLanguageDisplayName` de la feuille.
    var documentLanguageDisplayName: String {
        let name = Locale.current.localizedString(forLanguageCode: documentLanguage) ?? documentLanguage
        return name.prefix(1).uppercased() + name.dropFirst()
    }

    var documentLanguageCapsule: some View {
        Button {
            presentedPortal = .language
            HapticFeedback.light()
        } label: {
            Text(ComposerLanguageFlag.label(for: documentLanguage))
                .font(MeeshyFont.relative(13, weight: .semibold))
                .foregroundColor(MeeshyColors.indigo400)
                .padding(.horizontal, 10)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(MeeshyColors.indigo400.opacity(0.15))
                        .overlay(
                            Capsule()
                                .stroke(MeeshyColors.indigo400.opacity(0.3), lineWidth: 1)
                        )
                )
        }
        .accessibilityLabel(Text(ComposerDocumentCopy.language))
        .accessibilityValue(documentLanguageDisplayName)
        // Même correctif que l'ancienne tuile de lieu (#4034, retirée) :
        // `.padding(16)` datait
        // de l'ancien `.overlay(alignment: .bottomTrailing)` et doublait la
        // marge une fois la capsule devenue enfant du `HStack` de `toolRow`
        // — cause du débordement horizontal mesuré au simulateur.
    }

    /// Le sélecteur du dépôt, monté tel quel — même raison que
    /// `emojiPickerSheet`, plus bas dans ce fichier : `AudioLanguagePickerView`
    /// tourne déjà en production sous la feuille historique, avec ses
    /// catégories, sa recherche et son bouton « afficher toutes les langues ».
    /// En fabriquer un second ici serait deux listes de langues à faire
    /// diverger.
    var documentLanguagePickerSheet: some View {
        AudioLanguagePickerView(
            selectedLocale: Binding(
                get: { Locale(identifier: documentLanguage) },
                set: { newLocale in
                    documentLanguage = newLocale.language.languageCode?.identifier ?? newLocale.identifier
                }
            ),
            // L'IDENTIFIANT, pas la phrase (#4621) : `"Langue du post"` était une
            // clé-PHRASE, retirée du catalogue quand les soixante et une phrases
            // françaises ont cessé de servir de clé. La feuille affichait donc sa
            // clé brute, en français, dans les sept locales. Le défaut était déjà
            // nommé par `ComposerDocumentRules.language` :
            // « sa clé contient des espaces et échappe au cliquet français ».
            title: "feed.post.language"
        )
    }



    var emojiPickerSheet: some View {
        EmojiPickerSheet(quickReactions: Self.quickEmojis, title: "composer.attach.emoji") { emoji in
            documentText += emoji
            presentedPortal = nil
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    /// **La porte STICKER de la scène** — et ce qu'elle ne fait PAS.
    ///
    /// Elle ne se confond pas avec `emojiPickerSheet`, sa voisine d'apparence :
    /// celle-là INSÈRE un glyphe dans le texte du document, celle-ci POSE un
    /// `StorySticker` sur la scène — un objet déplaçable, ordonnable et
    /// minutable, qui survit à la publication et au reader. Deux gestes, deux
    /// niveaux du modèle ; les confondre était le raccourci qui a tenu la porte
    /// fermée (« `showsEmojiPicker` insère dans le TEXTE, ce qui n'est pas la
    /// même chose » — la phrase était juste, la conclusion non).
    ///
    /// **La feuille se REFERME sur la pose** (directive porteur 2026-08-30).
    ///
    /// Elle restait ouverte, par emprunt à l'atelier : « on pose rarement un
    /// seul sticker ». C'était un raisonnement de PLANCHE de stickers, pas de
    /// scène — sur un plateau, poser un sticker et le PLACER sont un seul
    /// geste, et une feuille qui recouvre la moitié basse empêche la seconde
    /// moitié. Refermer rend la scène au doigt immédiatement.
    ///
    /// **Et le sticker se pose en GRAND.** Le défaut de la taille par défaut
    /// donne un glyphe minuscule au centre, que l'auteur doit agrandir avant de
    /// le placer — deux gestes pour un. `StorySticker.posedScale` le pose à la
    /// taille où il se voit.
    ///
    /// Les deux rappels vont au VIEWMODEL, jamais au canvas : muter par le
    /// modèle est ce qui garde publication, reader et export d'accord — et le
    /// meuble n'a aucune référence à la vue UIKit.
    var stickerPickerSheet: some View {
        StickerPickerView(onStickerSelected: { emoji in
            viewModel.addSticker(emoji: emoji, scale: StorySticker.posedScale)
            presentedPortal = nil
            HapticFeedback.light()
        }, onLibraryStickerSelected: { item in
            // Le bitmap suffit à la pose : il vit sous l'id de l'ÉLÉMENT dans
            // `loadedImages` jusqu'à ce que la publication le téléverse et
            // remplisse `postMediaId`. Les octets animés le suivent (#3956) —
            // un GIF posé sans eux perdrait son mouvement entre la grille et
            // la scène, sans qu'aucun site rougisse.
            viewModel.addSticker(image: item.thumbnail,
                                 provider: StoryStickerLibraryItem.provider,
                                 scale: StorySticker.posedScale,
                                 animatedData: item.animatedData)
            presentedPortal = nil
            HapticFeedback.light()
        }, onTemplateSelected: { gabarit, emplacements in
            // **L'échelle vient du GABARIT**, pas de `posedScale` : ce 2,2
            // agrandit un glyphe NU, et ferait déborder un cartouche qui mesure
            // déjà son contenu. `addSticker(template:slots:)` la lit lui-même.
            viewModel.addSticker(template: gabarit, slots: emplacements)
            presentedPortal = nil
            HapticFeedback.light()
        }, onLocationTemplateSelected: { lieu, gabarit in
            // **Un lieu décoré reste un `StoryLocationObject`**, jamais un
            // sticker jumeau : lui seul porte les coordonnées et l'id de POI
            // que la plateforme LIT (`/posts/nearby`). Le gabarit n'en décore
            // que l'apparence.
            viewModel.addLocation(place: lieu, styleId: gabarit.id)
            presentedPortal = nil
            HapticFeedback.light()
        })
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }

    /// **La SECONDE porte pour nommer** — celle qui n'écrit pas.
    ///
    /// La première reste la frappe `@`, servie inline par la surface
    /// (`ComposerMentionControllerBox` → `ComposerMentionStrip`) : elle écrit le
    /// nom DANS le texte, pendant la saisie. Celle-ci cherche la personne
    /// correctement, puis laisse choisir COMMENT elle paraît — `INLINE`,
    /// `NOTE` (« Avec … » sous le contenu) ou `SILENT` (notifiée, invisible aux
    /// tiers). Le mode ne se choisit pas à la frappe, et c'est toute la raison
    /// d'être de cette feuille.
    ///
    /// `forCanvas: false` — un post n'a aucune couche de positionnement : lui
    /// proposer le badge `PINNED` promettrait un affichage qui n'arriverait
    /// jamais. C'est `StoryMentionPickerSheet` qui porte cette règle, on ne fait
    /// que lui dire de quelle matière il s'agit.
    ///
    /// Exactement la feuille que `ReferenceComposerBar` ouvre depuis le mood :
    /// une seconde aurait été une seconde vérité sur « comment on nomme ».
    var referencePickerSheet: some View {
        StoryMentionPickerSheet(
            references: composerReferences,
            modes: PostReferenceDisplay.declarable(forCanvas: false)
        ) { updated in
            composerReferences = updated
        }
        // Aucune `presentationDetents` ici : la feuille porte la sienne
        // (`AudiencePickerPresentationStyle`), et c'est ce que font déjà ses
        // deux autres montages côté SDK. Ce site était le seul à la redéclarer
        // — deux déclarations du même fait, dont l'une gagnait en silence
        // (#6134).
    }

    /// Les six emojis de tête, ceux que le composer du fil propose déjà. Écrits
    /// ici plutôt qu'en ligne pour que la liste reste une donnée nommée le jour
    /// où elle deviendra une mémoire de récents.
    static let quickEmojis = ["\u{1F600}", "\u{2764}\u{FE0F}", "\u{1F525}", "\u{1F44D}", "\u{1F602}", "\u{1F389}"]
}
