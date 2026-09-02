import SwiftUI
import MeeshySDK
import MeeshyUI

/// **Le sélecteur de HASHTAGS** (#4636, directive porteur 2026-08-31 : « mettre
/// une section Hashtag, ainsi que l'outil hashtag dans la liste des outils »).
///
/// ## Ce qu'il ne fait PAS
///
/// Il ne tient aucune liste. Ce qu'on choisit ici s'écrit dans le TEXTE de la
/// publication (`ComposerHashtags.inserting`), qui reste la seule source des
/// balises — exactement comme le serveur dérive les mentions INLINE en relisant
/// les `@handle`. Une liste parallèle donnerait deux vérités : ce qu'on lit dans
/// le texte, et ce qu'on envoie.
///
/// ## Les tendances sont une SUGGESTION, jamais une condition
///
/// Elles se chargent en arrière-plan et leur absence ne bloque rien : le champ
/// de saisie suffit à poser n'importe quelle balise. Une liste vide est un état
/// NOMINAL (hors-ligne, aucune tendance), pas un chargement éternel — d'où
/// l'absence de spinner sur un écran dont le contrôle principal est déjà utile.
struct ComposerHashtagSheet: View {

    /// Les balises DÉJÀ dans le texte — servies, jamais recalculées ici : deux
    /// dérivations du même texte divergeraient au premier écart de motif.
    let current: [String]
    let trending: [APIHashtag]
    let onToggle: (String) -> Void

    @State private var saisie: String = ""
    @FocusState private var champActif: Bool

    private var propre: String {
        saisie.trimmingCharacters(in: CharacterSet(charactersIn: "# "))
    }

    /// Une balise déjà posée ne se réajoute pas : la loi 4 veut qu'un bouton
    /// sans effet n'existe pas, et « ajouter » un hashtag présent n'en a aucun.
    private var peutAjouter: Bool {
        !propre.isEmpty && !current.contains { $0.lowercased() == propre.lowercased() }
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack {
                Text(ComposerAudienceCopy.hashtagsSection.capitalized)
                    .font(MeeshyFont.relative(17, weight: .semibold))
                    .foregroundStyle(.white)
                Spacer()
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)

            champ

            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    if !current.isEmpty { bloc(titre: ComposerAudienceCopy.hashtagsSection, tags: current, posees: true) }
                    if !trending.isEmpty {
                        bloc(titre: ComposerHashtagCopy.trending,
                             tags: trending.map(\.tag).filter { tag in
                                 !current.contains { $0.lowercased() == tag.lowercased() }
                             },
                             posees: false)
                    }
                }
                .padding(.horizontal, 16)
                .padding(.bottom, 24)
            }
        }
        .background(MeeshyColors.indigo950.ignoresSafeArea())
        .preferredColorScheme(.dark)
        .onAppear { champActif = true }
    }

    private var champ: some View {
        HStack(spacing: 10) {
            Text("#")
                .font(MeeshyFont.relative(17, weight: .semibold))
                .foregroundStyle(MeeshyColors.hashtagColor(isDark: true))
            TextField(ComposerHashtagCopy.placeholder, text: $saisie)
                .textInputAutocapitalization(.never)
                .autocorrectionDisabled()
                .focused($champActif)
                .foregroundStyle(.white)
                .onSubmit { ajouter() }
            Button(action: ajouter) {
                Text(ComposerHashtagCopy.add)
                    .font(MeeshyFont.relative(13, weight: .semibold))
                    .foregroundStyle(peutAjouter ? MeeshyColors.brandPrimary : .white.opacity(0.25))
            }
            .buttonStyle(.plain)
            .disabled(!peutAjouter)
        }
        .padding(.horizontal, 14)
        .frame(minHeight: 48)
        .background(RoundedRectangle(cornerRadius: 12, style: .continuous)
            .fill(Color.white.opacity(0.07)))
        .padding(.horizontal, 16)
        .padding(.bottom, 8)
    }

    private func ajouter() {
        guard peutAjouter else { return }
        onToggle(propre)
        saisie = ""
        HapticFeedback.light()
    }

    @ViewBuilder
    private func bloc(titre: String, tags: [String], posees: Bool) -> some View {
        if !tags.isEmpty {
            VStack(alignment: .leading, spacing: 8) {
                Text(titre)
                    .font(MeeshyFont.relative(9.5, weight: .semibold))
                    .tracking(1.2)
                    .foregroundStyle(.white.opacity(0.5))
                FlowingChips(items: tags) { tag in
                    Button {
                        onToggle(tag)
                        HapticFeedback.light()
                    } label: {
                        HStack(spacing: 6) {
                            Text("#\(tag)")
                                .font(MeeshyFont.relative(12, weight: .medium))
                                .foregroundStyle(posees
                                                 ? MeeshyColors.hashtagColor(isDark: true)
                                                 : .white.opacity(0.85))
                            Image(systemName: posees ? "xmark" : "plus")
                                .font(.system(size: 9, weight: .bold))
                                .foregroundStyle(.white.opacity(0.5))
                        }
                        .padding(.horizontal, 11)
                        .frame(minHeight: 36)
                        .background(Capsule().fill(Color.white.opacity(posees ? 0.10 : 0.05)))
                        .overlay(Capsule().strokeBorder(
                            posees ? MeeshyColors.brandPrimary.opacity(0.4) : Color.white.opacity(0.12),
                            lineWidth: 1))
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel("#\(tag)")
                    .accessibilityAddTraits(posees ? [.isSelected] : [])
                }
            }
            .padding(.top, 10)
        }
    }
}

/// Les mots du sélecteur. Hors du `body` — une chaîne composée dans une vue est
/// hors de portée d'un témoin, et c'est du vocabulaire produit.
nonisolated enum ComposerHashtagCopy {

    static var placeholder: String {
        String(localized: "composer.hashtag.placeholder",
               defaultValue: "Ajouter un hashtag", bundle: .main)
    }

    static var add: String {
        String(localized: "composer.hashtag.add", defaultValue: "Ajouter", bundle: .main)
    }

    static var trending: String {
        String(localized: "composer.hashtag.trending", defaultValue: "TENDANCES", bundle: .main)
    }
}
