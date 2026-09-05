import SwiftUI
import PhotosUI
import MeeshySDK

// MARK: - L'onglet EMOJI et l'onglet « Mes stickers »

/// Les deux onglets qui existaient AVANT la palette (#4579) — déplacés tels
/// quels, pour que le lot qui ajoute trois constructions ne change rien à ce
/// qui marchait.
extension StickerPickerView {

    // MARK: - Emoji

    // `emojiTab`, `categoryTabs` et `filteredEmojis` sont partis au #5012 : le
    // ruban de catégories est devenu une liste de sections, et `selectedCategory`
    // n'a plus d'état à porter. Les laisser aurait donné trois vues qui compilent
    // et que personne ne monte — une vue sans consommateur n'a aucun site où
    // rougir (leçon 483).

    /// La grille d'UNE catégorie — sans défilement propre depuis #5012 : les
    /// huit catégories sont des sections d'une seule liste verticale.
    func emojiGrid(_ category: StickerCategory) -> some View {
        Group {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 4), count: 7),
                      spacing: 8) {
                ForEach(category.emojis, id: \.self) { emoji in
                    Button {
                        // **Poser, c'est se souvenir** (2026-09-05). L'onglet
                        // RÉCENTS n'a pas d'autre source : il ne devine pas ce
                        // qu'on a posé, on le lui dit ici, au seul endroit qui
                        // le sait.
                        usage.noteUse(.emoji(emoji))
                        onStickerSelected(emoji)
                        HapticFeedback.medium()
                    } label: {
                        Text(emoji)
                            .font(.system(size: 30))
                            .frame(width: 44, height: 44)
                    }
                    .buttonStyle(.plain)  // cf. note des onglets
                    .stickerFavoriteMenu(.emoji(emoji), usage: usage)
                    .accessibilityLabel(String(localized: "story.sticker.a11y",
                                               defaultValue: "Autocollant \(emoji)",
                                               bundle: .module))
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
    }

    // MARK: - « Mes stickers »

    /// Le déclencheur naturel de C8 : coller une image PENDANT que ce panneau
    /// est ouvert la retient. Depuis S1, `StorySticker` porte une image
    /// intégrée (`postMediaId`) : taper une vignette la POSE sur le canevas, la
    /// bibliothèque n'est plus une collection sans sortie.
    var libraryTab: some View {
        // Valeurs `@MainActor` (bundle localisé) hissées hors de la closure de
        // label de `PhotosPicker`, qui est inférée `@Sendable` — même correctif
        // que `ConversationSettingsView.visualSection`, et pour la même raison :
        // `.module` y est « main actor-isolated property referenced from a
        // nonisolated context ».
        let liftLabel = String(localized: "story.sticker.library.lift",
                               defaultValue: "Détourer", bundle: .module)
        let liftA11y = String(localized: "story.sticker.library.lift.a11y",
                              defaultValue: "Détourer le sujet d'une photo", bundle: .module)
        return VStack(alignment: .leading, spacing: 10) {
            HStack {
                Spacer()
                if let stickerLibrary {
                    // **La seconde alimentation** (#3955) : détourer le sujet
                    // d'une photo. Elle n'est rendue QUE si l'app a injecté la
                    // capacité — le détourage est une API iOS 17 et le plancher
                    // du projet est 16 (loi 4 : absent, jamais grisé).
                    if stickerLibrary.canLift {
                        PhotosPicker(selection: $liftSelection, matching: .images) {
                            Label(liftLabel, systemImage: "person.and.background.dotted")
                        }
                        .labelStyle(.iconOnly)
                        .buttonBorderShape(.capsule)
                        .frame(minHeight: 32)
                        .accessibilityLabel(liftA11y)
                    }
                    PasteButton(supportedContentTypes: StoryComposerView.pasteStarterContentTypes) { providers in
                        Task { libraryItems = await stickerLibrary.paste(providers) }
                    }
                    .labelStyle(.iconOnly)
                    .buttonBorderShape(.capsule)
                    .frame(minHeight: 32)
                }
            }
            .task(id: liftSelection) {
                // `nil` ⇒ rien de choisi : la tâche se relance à chaque
                // remise à zéro de la sélection, et sortir tôt évite un
                // détourage fantôme après chaque geste.
                guard let liftSelection, let stickerLibrary else { return }
                defer { self.liftSelection = nil }
                guard let data = try? await liftSelection.loadTransferable(type: Data.self) else { return }
                // `nil` du détourage = aucun sujet trouvé : c'est l'APP qui le
                // dit à l'utilisateur (elle possède le toast), la grille
                // reste simplement inchangée.
                if let updated = await stickerLibrary.lift(imageData: data) {
                    libraryItems = updated
                }
            }
            if libraryItems.isEmpty {
                Text(String(
                    localized: "story.sticker.library.empty",
                    defaultValue: "Collez une image pour commencer votre bibliothèque",
                    bundle: .module
                ))
                .font(.system(size: 12))
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .center)
                .padding(.vertical, 24)
            } else {
                // **Plus de défilement intérieur** (#5012) : les sections se
                // parcourent dans UN défilement, et une grille bornée à 200 pt
                // au milieu volerait le geste vertical de celui qui la contient.
                Group {
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 5),
                              spacing: 8) {
                        ForEach(libraryItems) { item in
                            Button {
                                onLibraryStickerSelected(item)
                                HapticFeedback.medium()
                            } label: {
                                LibraryStickerThumbnail(item: item)
                            }
                            .buttonStyle(.plain)  // cf. note des onglets
                            .accessibilityLabel(String(
                                localized: "story.sticker.library.a11y",
                                defaultValue: "Autocollant de votre bibliothèque",
                                bundle: .module
                            ))
                        }
                    }
                    .padding(.vertical, 4)
                }
            }
        }
        .padding(.horizontal, 12)
        .padding(.top, 8)
    }
}

/// **La vignette d'un sticker de la bibliothèque — animée si elle l'est** (#3956).
///
/// `Image(uiImage:)` ne joue PAS une `UIImage` animée : il lit le `cgImage` de
/// base et ignore le tableau d'images. Une grille écrite avec lui montrerait
/// donc la première image d'un GIF sans qu'aucune ligne soit fausse — la panne
/// muette que `AnimatedImageView` existe pour fermer.
///
/// Le décodage passe par `AnimatedImageMemo` : une grille se re-rend à chaque
/// collage, à chaque changement d'onglet et à chaque frappe dans le champ de
/// recherche, et re-décoder N images à chacun de ces rendus ferait sauter le
/// défilement de la palette.
///
/// Le budget de décodage est celui de la CASE (52 pt), jamais celui de la
/// scène : trente images de 512 px pour une vignette coûteraient trente bitmaps
/// dont on n'utiliserait qu'un dixième des pixels.
private struct LibraryStickerThumbnail: View {
    let item: StoryStickerLibraryItem

    private static let side: CGFloat = 52

    private var decoded: AnimatedImageDecoder.Decoded? {
        guard let bytes = item.animatedData else { return nil }
        return AnimatedImageMemo.decoded(
            key: item.id, bytes: bytes,
            maxPixelSize: StoryStickerLibraryItem.thumbnailPixelBudget)
    }

    var body: some View {
        Group {
            if let decoded {
                // `.scaleAspectFill` : la même règle de remplissage que le
                // `scaledToFill` du chemin fixe — deux cadrages différents dans
                // la même grille se verraient au premier GIF posé à côté d'un
                // PNG.
                AnimatedImageView(decoded: decoded, contentMode: .scaleAspectFill)
            } else {
                Image(uiImage: item.thumbnail)
                    .resizable()
                    .scaledToFill()
            }
        }
        .frame(width: Self.side, height: Self.side)
        .clipShape(RoundedRectangle(cornerRadius: 10))
    }
}

// MARK: - Sticker Category

public enum StickerCategory: String, CaseIterable {
    case smileys, animals, food, activities, travel, objects, symbols, flags

    public var icon: String {
        switch self {
        case .smileys: return "\u{1F600}"
        case .animals: return "\u{1F43E}"
        case .food: return "\u{1F354}"
        case .activities: return "\u{26BD}"
        case .travel: return "\u{2708}\u{FE0F}"
        case .objects: return "\u{1F4A1}"
        case .symbols: return "\u{2764}\u{FE0F}"
        case .flags: return "\u{1F3F3}\u{FE0F}"
        }
    }

    public var emojis: [String] {
        switch self {
        case .smileys:
            return ["\u{1F600}", "\u{1F602}", "\u{1F60D}", "\u{1F60E}", "\u{1F61C}", "\u{1F60A}", "\u{1F609}",
                    "\u{1F622}", "\u{1F621}", "\u{1F633}", "\u{1F914}", "\u{1F92F}", "\u{1F970}", "\u{1F973}",
                    "\u{1F60B}", "\u{1F92D}", "\u{1F971}", "\u{1F976}", "\u{1F975}", "\u{1F47B}", "\u{1F4A9}"]
        case .animals:
            return ["\u{1F436}", "\u{1F431}", "\u{1F43B}", "\u{1F98A}", "\u{1F981}", "\u{1F42F}", "\u{1F984}",
                    "\u{1F40D}", "\u{1F41D}", "\u{1F98B}", "\u{1F427}", "\u{1F989}", "\u{1F99C}", "\u{1F433}"]
        case .food:
            return ["\u{1F355}", "\u{1F354}", "\u{1F32E}", "\u{1F363}", "\u{1F370}", "\u{1F369}", "\u{1F366}",
                    "\u{2615}", "\u{1F377}", "\u{1F37A}", "\u{1F353}", "\u{1F34E}", "\u{1F34C}", "\u{1F951}"]
        case .activities:
            return ["\u{26BD}", "\u{1F3C0}", "\u{1F3C8}", "\u{26BE}", "\u{1F3BE}", "\u{1F3B1}", "\u{1F3AE}",
                    "\u{1F3B5}", "\u{1F3B8}", "\u{1F3A4}", "\u{1F3AC}", "\u{1F3A8}", "\u{1F3AD}", "\u{1F3AA}"]
        case .travel:
            return ["\u{2708}\u{FE0F}", "\u{1F680}", "\u{1F3D6}\u{FE0F}", "\u{1F3D4}\u{FE0F}", "\u{1F30D}", "\u{1F5FC}", "\u{1F3E0}",
                    "\u{1F697}", "\u{1F6B2}", "\u{1F6F3}\u{FE0F}", "\u{26F2}", "\u{1F3A2}", "\u{26FA}", "\u{1F30C}"]
        case .objects:
            return ["\u{1F4A1}", "\u{1F4F7}", "\u{1F4F1}", "\u{1F4BB}", "\u{2328}\u{FE0F}", "\u{1F3A7}", "\u{1F50D}",
                    "\u{1F4DA}", "\u{270F}\u{FE0F}", "\u{1F4E6}", "\u{1F513}", "\u{2699}\u{FE0F}", "\u{1F4CE}", "\u{2702}\u{FE0F}"]
        case .symbols:
            return ["\u{2764}\u{FE0F}", "\u{1F525}", "\u{2B50}", "\u{1F4AF}", "\u{26A1}", "\u{1F31F}", "\u{1F4A5}",
                    "\u{2728}", "\u{1F308}", "\u{1F389}", "\u{1F388}", "\u{1F381}", "\u{1F3C6}", "\u{1F48E}"]
        case .flags:
            return ["\u{1F1EB}\u{1F1F7}", "\u{1F1FA}\u{1F1F8}", "\u{1F1EC}\u{1F1E7}", "\u{1F1EA}\u{1F1F8}", "\u{1F1E9}\u{1F1EA}", "\u{1F1EE}\u{1F1F9}", "\u{1F1EF}\u{1F1F5}",
                    "\u{1F1E7}\u{1F1F7}", "\u{1F1E8}\u{1F1E6}", "\u{1F1E6}\u{1F1FA}", "\u{1F1F0}\u{1F1F7}", "\u{1F1F2}\u{1F1FD}", "\u{1F1EE}\u{1F1F3}", "\u{1F1F7}\u{1F1FA}"]
        }
    }
}
