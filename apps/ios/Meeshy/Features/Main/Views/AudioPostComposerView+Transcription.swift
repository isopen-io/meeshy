import SwiftUI
import UIKit
import MeeshySDK
import MeeshyUI

/// **La TRANSCRIPTION de la création audio** — sa langue, son relevé, ses
/// échecs et les deux façons de s'en passer.
///
/// Extrait de `AudioPostComposerView.swift` au 2026-09-01 (#4657), qui passait
/// 1 191 lignes : la directive 2026-08-28 interdit d'ajouter à un fichier hors
/// budget, et `FileSizeBudgetGuardTests` la mesure. La ligne de découpe est une
/// RESPONSABILITÉ — d'un côté ce que l'auteur ENREGISTRE et place, de l'autre
/// ce que l'appareil en COMPREND. Les deux bougent pour des raisons
/// différentes.
///
/// Conséquence de forme, à connaître avant d'y toucher : `private` est de
/// portée FICHIER en Swift, y compris sur un `@State`. Les propriétés que ce
/// frère lit ont dû s'élargir en `internal` — ce n'est pas un relâchement
/// voulu, c'est le prix de la découpe (le `CLAUDE.md` iOS le documente déjà
/// pour `StoryViewerView+Content`).
extension AudioPostComposerView {

    // MARK: - Language Selector

    var languageSelector: some View {
        VStack(alignment: .leading, spacing: 10) {
            // **« Langue du son », et seulement AVANT l'enregistrement**
            // (directive porteur 2026-09-01). Ce n'est pas la langue de la
            // transcription : c'est celle qui est PARLÉE — la transcription
            // n'en est qu'une conséquence, et le Prisme s'en sert ensuite pour
            // traduire. Une fois le son capté, l'en-tête ne dit plus rien que
            // les pastilles ne montrent, et la place qu'il prend manque au
            // rognage.
            if phase == .idle || phase == .recording {
                HStack(spacing: 6) {
                    Image(systemName: "globe")
                        .font(.caption.weight(.semibold))
                        .accessibilityHidden(true)
                    Text(String(localized: "composer.audio.transcription.language",
                                defaultValue: "Langue du son", bundle: .main))
                        .font(.caption.weight(.semibold))
                    Spacer()
                }
                .foregroundColor(theme.textSecondary)
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(suggestedLocales, id: \.identifier) { loc in
                        languageChip(for: loc)
                    }
                    moreLanguagesButton
                }
                .padding(.horizontal, 2)
            }
        }
        // Seul l'ENREGISTREMENT ferme le choix : pendant qu'on parle, changer
        // la langue n'aurait aucun sens. La transcription EN COURS, elle, reste
        // ouverte — c'est précisément le moment où l'on s'aperçoit qu'on s'est
        // trompé de langue, et la relance ci-dessous s'en charge.
        .disabled(phase == .recording)
        .opacity(phase == .recording ? 0.5 : 1)
        .sheet(isPresented: $showLanguagePicker) {
            AudioLanguagePickerView(selectedLocale: $selectedLocale)
        }
        // **Changer la langue RELANCE la transcription** (directive porteur
        // 2026-09-01). Sans cela le sélecteur était un contrôle à moitié
        // inerte : il agissait avant la transcription et plus après, alors que
        // c'est APRÈS qu'on lit le résultat et qu'on voit l'erreur de langue.
        .adaptiveOnChange(of: selectedLocale.identifier) { _, _ in
            guard offersTranscription, let url = recordedURL,
                  phase == .preview || phase == .transcribing else { return }
            runTranscription(url: url)
        }
    }

    func languageChip(for loc: Locale) -> some View {
        let isSelected = loc.identifier == selectedLocale.identifier
        return Button {
            selectedLocale = loc
            HapticFeedback.light()
        } label: {
            Text(Self.shortDisplayName(for: loc))
                .font(.footnote.weight(.semibold))
                .foregroundColor(isSelected ? .white : theme.textPrimary)
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    Capsule().fill(
                        isSelected
                            ? AnyShapeStyle(MeeshyColors.brandGradient)
                            : AnyShapeStyle(theme.surface(tint: "C7D2FE"))
                    )
                )
                .overlay(
                    Capsule()
                        .stroke(MeeshyColors.indigo400.opacity(isSelected ? 0 : 0.3), lineWidth: 1)
                )
        }
        // Le libellé visuel est un code court (« FR ») ; VoiceOver annonce le nom
        // complet localisé. L'état sélectionné n'était signalé que par la couleur
        // (fond gradient) → invisible sans la vue : on ajoute le trait `.isSelected`.
        .accessibilityLabel(Self.fullDisplayName(for: loc))
        .accessibilityAddTraits(isSelected ? .isSelected : [])
    }

    var moreLanguagesButton: some View {
        Button {
            showLanguagePicker = true
            HapticFeedback.light()
        } label: {
            HStack(spacing: 4) {
                Image(systemName: "line.3.horizontal.decrease.circle.fill")
                    .font(.footnote)
                    .accessibilityHidden(true)
                Text(String(localized: "common.more", defaultValue: "Plus"))
                    .font(.footnote.weight(.semibold))
            }
            .foregroundColor(MeeshyColors.indigo500)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(
                Capsule().stroke(MeeshyColors.indigo400.opacity(0.4), lineWidth: 1)
            )
        }
        // « Plus » seul est ambigu en VoiceOver → intention explicite.
        .accessibilityLabel(String(localized: "composer.audio.languages.more", defaultValue: "Plus de langues"))
    }

    var suggestedLocales: [Locale] {
        var seeds: [String] = []
        let user = AuthManager.shared.currentUser
        if let lang = user?.systemLanguage { seeds.append(lang) }
        if let lang = user?.regionalLanguage, lang != user?.systemLanguage {
            seeds.append(lang)
        }
        if let kbd = UITextInputMode.activeInputModes.first?.primaryLanguage {
            seeds.append(String(kbd.prefix(2)))
        }
        // **Les langues que l'app EXPÉDIE, toutes** (#4657). Le repli valait
        // `["fr", "en"]` et le tout était coupé à quatre : un lecteur
        // germanophone, hispanophone ou italophone devait passer par le « + »
        // pour transcrire dans SA langue, alors que l'app la sert. Les sept
        // locales du catalogue viennent donc en secours, dans l'ordre où
        // `CFBundleLocalizations` les déclare, après ce que le compte et le
        // clavier ont déjà nommé.
        seeds.append(contentsOf: Self.shippedLanguageCodes)

        let normalized = seeds.map { code in
            EdgeTranscriptionService.normalizedLocale(for: Locale(identifier: code))
        }

        var seen = Set<String>()
        return normalized.filter { seen.insert($0.identifier).inserted }
            .prefix(Self.suggestionCap).map { $0 }
    }

    /// **Cinq suggestions, pas sept** (directive porteur 2026-09-01).
    ///
    /// Les sept locales expédiées remplissaient la rangée jusqu'au bord :
    /// « Plus de langues » existait, mais hors champ, donc invisible — un
    /// contrôle qu'il fallait deviner. La borne à cinq n'est pas un goût
    /// d'affichage, c'est ce qui garantit que la porte vers les AUTRES langues
    /// se voit sans geste. Les deux dernières du catalogue (IT, AR) restent
    /// atteignables par elle, comme les cinquante autres.
    ///
    /// Elle s'applique APRÈS le semis : un lecteur italophone verra donc « IT »
    /// en tête, parce que son compte ou son clavier l'a nommée — la borne coupe
    /// la queue générique, jamais ce qui vient de l'utilisateur.
    static let suggestionCap = 5

    /// Les langues expédiées, LUES au bundle plutôt que retapées : une huitième
    /// locale ajoutée au catalogue apparaîtra ici sans qu'on y pense, et une
    /// retirée disparaîtra — c'est ce qu'une liste recopiée ne fait jamais.
    static var shippedLanguageCodes: [String] {
        let declarees = Bundle.main.object(forInfoDictionaryKey: "CFBundleLocalizations") as? [String]
        let codes = (declarees ?? []).map { String($0.prefix(2)) }
        return codes.isEmpty ? ["fr", "en", "de", "es", "it", "pt", "ar"] : codes
    }

    static func shortDisplayName(for locale: Locale) -> String {
        if let lang = locale.language.languageCode?.identifier {
            return lang.uppercased()
        }
        return locale.identifier.uppercased()
    }

    // Nom complet localisé (« Français ») pour l'annonce VoiceOver — le chip
    // n'affiche visuellement que le code court.
    static func fullDisplayName(for locale: Locale) -> String {
        if let name = Locale.current.localizedString(forIdentifier: locale.identifier),
           !name.isEmpty {
            return name.prefix(1).uppercased() + name.dropFirst()
        }
        return shortDisplayName(for: locale)
    }

    /// **Ce que la feuille dit du TEXTE** — et le site UNIQUE d'où l'éditeur
    /// manuel se présente.
    ///
    /// La feuille de rédaction vivait sur `errorPanel`, donc « Rédiger »
    /// n'existait QUE si la reconnaissance avait échoué. Une transcription
    /// réussie n'était pas corrigeable, et un son ROUVERT — qui ne re-transcrit
    /// pas — n'affichait rien du tout : ni son texte, ni le moyen d'en écrire un.
    /// Le porteur l'a nommé le 2026-09-01 (#4697) : « avec toujours la possibilité
    /// de rédiger la description ».
    ///
    /// Le montage est donc porté par le PARENT des deux branches, pas par l'une
    /// d'elles — une feuille attachée à une vue qui disparaît disparaît avec
    /// elle.
    @ViewBuilder
    var contentPanel: some View {
        Group {
            if let error = transcriptionError {
                errorPanel(error)
            } else if phase == .preview {
                transcriptionPreview(transcription)
            }
        }
        .sheet(isPresented: $showManualTranscription) {
            ManualTranscriptionEditor(
                initialText: transcription?.text ?? "",
                language: Self.shortDisplayName(for: selectedLocale),
                onValidate: { texte in
                    adopterTranscriptionManuelle(texte)
                    showManualTranscription = false
                },
                onCancel: { showManualTranscription = false }
            )
        }
    }

    /// **Reprendre un texte DÉJÀ écrit** — la traduction inverse de
    /// `buildPayload`, qui rend à la feuille ce que le composer lui avait pris.
    /// Les segments survivent : ce sont eux qui portent le défilement synchronisé
    /// de la carte, et les jeter rendrait un texte immobile.
    static func adopt(_ payload: MobileTranscriptionPayload?) -> OnDeviceTranscription? {
        guard let payload else { return nil }
        // **Une confiance ABSENTE n'est pas une confiance BASSE.** Le payload
        // la rend optionnelle ; un texte écrit à la main n'en porte pas, et
        // `adopterTranscriptionManuelle` pose déjà `1` pour la même raison —
        // afficher un doute que personne n'a exprimé serait pire que se taire.
        let confiance = payload.confidence ?? 1
        return OnDeviceTranscription(
            text: payload.text,
            language: payload.language,
            confidence: confiance,
            segments: payload.segments.map { segment in
                let debut = segment.start ?? 0
                return OnDeviceTranscriptionSegment(
                    text: segment.text,
                    timestamp: debut,
                    duration: max(0, (segment.end ?? debut) - debut),
                    confidence: confiance)
            }
        )
    }

    /// `nil` ⇒ aucune transcription : la carte l'INVITE au lieu de se taire.
    /// C'est l'état d'un son rouvert, et le silence s'y lisait comme « ce son
    /// n'a pas de texte » alors qu'il en avait peut-être un.
    func transcriptionPreview(_ t: OnDeviceTranscription?) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Image(systemName: "text.bubble.fill")
                    .font(.footnote)
                    .foregroundColor(MeeshyColors.indigo400)
                    .accessibilityHidden(true)
                Text(String(localized: "composer.audio.transcription.title", defaultValue: "Transcription"))
                    .font(.footnote.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo400)
                Spacer()
                Text((t?.language ?? Self.shortDisplayName(for: selectedLocale)).uppercased())
                    .font(.caption2.weight(.semibold))
                    .foregroundColor(theme.textMuted)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Capsule().fill(theme.surface(tint: "A5B4FC")))
            }

            let texte = t?.text ?? ""
            Text(texte.isEmpty
                 ? String(localized: "composer.audio.transcription.none", defaultValue: "Aucune transcription disponible.")
                 : texte)
                .font(.subheadline)
                .foregroundColor(texte.isEmpty ? theme.textMuted : theme.textPrimary)
                .frame(maxWidth: .infinity, alignment: .leading)
                .lineSpacing(4)
                // La transcription est du contenu utilisateur → copiable (sélection native).
                .textSelection(.enabled)

            // **Écrire ou corriger, TOUJOURS** — c'est la seule porte de la
            // description quand la reconnaissance a réussi, et la seule tout
            // court sur un son rouvert.
            Button { showManualTranscription = true } label: {
                Label(texte.isEmpty
                      ? String(localized: "composer.audio.transcription.write",
                               defaultValue: "Rédiger", bundle: .main)
                      : String(localized: "composer.audio.transcription.edit",
                               defaultValue: "Modifier", bundle: .main),
                      systemImage: "square.and.pencil")
                    .font(.caption.weight(.semibold))
                    .foregroundColor(MeeshyColors.indigo400)
            }
            .frame(minHeight: 44)
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(.ultraThinMaterial)
                .overlay(
                    RoundedRectangle(cornerRadius: 16)
                        .stroke(MeeshyColors.indigo300.opacity(isDark ? 0.25 : 0.35), lineWidth: 1)
                )
        )
        .transition(.opacity.combined(with: .move(edge: .top)))
    }

    /// **Une ligne, et rien de plus** (directive porteur 2026-09-01).
    ///
    /// Le panneau portait un titre, le message technique du moteur sur quatre
    /// lignes, puis un bouton en dessous. Ce que l'auteur a besoin de savoir
    /// tient en deux mots — la transcription n'a pas eu lieu — et ce qu'il peut
    /// FAIRE doit être à portée du même regard. Le message du moteur
    /// (« kAFAssistantErrorDomain 1101 ») ne lui apprend rien qu'il puisse
    /// utiliser ; il reste dans l'annonce d'accessibilité, où il ne coûte pas
    /// trois lignes d'écran.
    func errorPanel(_ error: String) -> some View {
        // **Le message, puis ses sorties DESSOUS** (directive porteur
        // 2026-09-01). La ligne unique a été tentée et mesurée : à quatre
        // éléments sur 402 pt, ou bien on force les largeurs et la rangée POUSSE
        // son conteneur — toute la feuille se décalait, bords rognés — ou bien
        // on les réduit et « Transcription indis… » n'apprend rien.
        //
        // Empiler règle les deux d'un coup : le message garde sa phrase
        // entière, les actions gardent leur largeur, et plus rien ne dépend de
        // la langue ni du Dynamic Type.
        VStack(alignment: .leading, spacing: 10) {
            ligneMessage
            ligneActions
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.horizontal, 12)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        // Un rectangle arrondi plutôt qu'une capsule : la forme doit tenir les
        // DEUX dispositions, et une capsule sur deux lignes dessine un stade.
        .background(
            RoundedRectangle(cornerRadius: 18)
                .fill(MeeshyColors.error.opacity(isDark ? 0.12 : 0.08))
                .overlay(RoundedRectangle(cornerRadius: 18)
                    .stroke(MeeshyColors.error.opacity(0.3), lineWidth: 1))
        )
        // Le détail technique n'est pas montré, mais il n'est pas PERDU : il
        // part dans l'annonce, seul endroit où un diagnostic peut vivre sans
        // occuper l'écran de quelqu'un qui n'en fera rien.
        .accessibilityElement(children: .contain)
        .accessibilityHint(error)
        // La feuille de rédaction est montée par `contentPanel`, au-dessus des
        // DEUX branches : posée ici, elle ne servait que le cas d'erreur.
    }

    /// Ce qui s'est passé.
    private var ligneMessage: some View {
        HStack(spacing: 6) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.caption)
                .foregroundColor(MeeshyColors.error)
                .accessibilityHidden(true)
            Text(String(localized: "composer.audio.transcription.unavailable",
                        defaultValue: "Transcription indisponible"))
                .font(.caption.weight(.semibold))
                .foregroundColor(theme.textPrimary)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    /// Ce qu'on peut faire.
    @ViewBuilder
    private var ligneActions: some View {
        HStack(spacing: 8) {
            if recordedURL != nil {
                actionErreur(String(localized: "common.retry", defaultValue: "Réessayer"),
                             pleine: true, action: retryTranscription)
            }
            // **Deux façons de s'en passer** (directive porteur 2026-09-01).
            // La reconnaissance vocale échoue pour des raisons qui ne regardent
            // pas l'auteur — pas de modèle pour sa langue, audio bruité,
            // service indisponible. Lui laisser une transcription VIDE le prive
            // de la traduction et de la recherche pour une panne dont il n'est
            // pas responsable ; deux gestes suffisent à la lui rendre.
            actionErreur(String(localized: "composer.audio.transcription.write",
                                defaultValue: "Rédiger", bundle: .main),
                         pleine: false) { showManualTranscription = true }
            // « Coller » n'apparaît QUE si le presse-papiers porte du texte.
            // `hasStrings` répond sans le LIRE, donc sans déclencher la demande
            // d'autorisation d'iOS. Un bouton qui collerait du vide serait un
            // contrôle sans effet ; celui-ci n'existe que quand il en a un.
            if UIPasteboard.general.hasStrings {
                actionErreur(String(localized: "composer.audio.transcription.paste",
                                    defaultValue: "Coller", bundle: .main),
                             pleine: false, action: collerTranscription)
            }
            Spacer(minLength: 0)
        }
    }

    /// Une action de la ligne d'erreur. `pleine` distingue le geste NOMINAL —
    /// réessayer, la machine peut encore réussir — des deux replis manuels.
    @ViewBuilder
    private func actionErreur(_ titre: String,
                              pleine: Bool,
                              action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(titre)
                .font(.caption.weight(.semibold))
                .foregroundColor(pleine ? .white : MeeshyColors.indigo400)
                .lineLimit(1)
                .fixedSize(horizontal: true, vertical: false)
                .padding(.horizontal, 8)
                .padding(.vertical, 6)
                .background(
                    Capsule()
                        .fill(pleine ? AnyShapeStyle(MeeshyColors.brandGradient)
                                     : AnyShapeStyle(Color.clear))
                        .overlay(Capsule().stroke(
                            pleine ? Color.clear : MeeshyColors.indigo400.opacity(0.45),
                            lineWidth: 1))
                )
        }
        .buttonStyle(.plain)
        .layoutPriority(0)
    }

    /// **Coller n'est pas rédiger** : le presse-papiers est lu ICI, au tap, et
    /// nulle part avant — c'est ce qui évite la bannière « Meeshy a collé
    /// depuis… » à chaque ouverture de la feuille.
    func collerTranscription() {
        guard let texte = UIPasteboard.general.string,
              !texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        adopterTranscriptionManuelle(texte)
        HapticFeedback.light()
    }

    /// **Une transcription écrite à la main EST une transcription.**
    ///
    /// Elle porte la langue CHOISIE — celle du sélecteur, pas une devinée — et
    /// une confiance de 1 : l'auteur sait ce qu'il a dit mieux qu'un modèle.
    /// Aucun segment n'est fabriqué : inventer des horodatages pour un texte
    /// qu'on n'a pas aligné produirait des sous-titres faux, et un sous-titre
    /// faux est pire qu'aucun.
    func adopterTranscriptionManuelle(_ texte: String) {
        let propre = texte.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !propre.isEmpty else { return }
        transcription = OnDeviceTranscription(
            text: propre,
            language: EdgeTranscriptionService.normalizedLocale(for: selectedLocale)
                .language.languageCode?.identifier ?? "fr",
            confidence: 1,
            segments: []
        )
        transcriptionError = nil
        phase = .preview
    }
}

/// **L'éditeur de transcription manuelle** (#4657) — le repli « Rédiger ».
///
/// Une feuille, un champ, deux boutons. Elle ne propose ni horodatage ni
/// segment : ce qu'on écrit ici est un TEXTE, et le prétendre aligné sur
/// l'audio serait mentir à la traduction comme au sous-titrage.
struct ManualTranscriptionEditor: View {
    let initialText: String
    let language: String
    let onValidate: (String) -> Void
    let onCancel: () -> Void

    @State private var texte: String = ""
    @FocusState private var focused: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 12) {
                Text(String(localized: "composer.audio.transcription.write.hint",
                            defaultValue: "Écrivez ce qui est dit dans l'enregistrement.",
                            bundle: .main))
                    .font(.footnote)
                    .foregroundColor(.secondary)

                TextEditor(text: $texte)
                    .focused($focused)
                    .font(.body)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .background(
                        RoundedRectangle(cornerRadius: 14)
                            .fill(Color.primary.opacity(0.06))
                    )
                    .frame(minHeight: 180)

                Spacer(minLength: 0)
            }
            .padding(16)
            .navigationTitle(String(localized: "composer.audio.transcription.title",
                                    defaultValue: "Transcription", bundle: .main))
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button(String(localized: "common.cancel", defaultValue: "Annuler",
                                  bundle: .main), action: onCancel)
                }
                ToolbarItem(placement: .principal) {
                    Text(language)
                        .font(.caption2.weight(.semibold))
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Capsule().fill(Color.primary.opacity(0.08)))
                        .accessibilityHidden(true)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(String(localized: "composer.audio.confirm",
                                  defaultValue: "Ajouter", bundle: .main)) {
                        onValidate(texte)
                    }
                    .disabled(texte.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear {
                texte = initialText
                focused = true
            }
        }
    }
}
