import Foundation

/// **Un élément qui ENTRE dans la scène** (#13864, règle R5 de
/// `docs/superpowers/specs/2026-10-31-un-seul-compositeur-design.md`).
///
/// Dès le choix, l'élément se montre à sa place, en espace réservé avec son
/// anneau, et le reste de l'écran attend : voile sur les outils et le socle,
/// « Publier » retenu, aucun second ajout. Le ✕ de l'espace réservé annule.
/// Miroir d'Android `IncomingMediaPlaceholder`.
///
/// Ce qui retient l'écran est la PRÉPARATION : charger la photothèque, copier
/// un fichier, recevoir l'image d'un sticker. Une fois posé, l'élément monte en
/// arrière-plan (la pré-montée, `ComposerPreUpload`), et cela ne retient rien :
/// l'envoi se lit sur l'objet sélectionné (`ComposerSceneIntakeCopy.sendingBadge`).
///
/// Hors ligne, l'élément se pose « en attente » et l'écran reste utilisable :
/// un hors-ligne n'est pas un chargement bloquant. Un échec libère l'écran et
/// se dit avec « Réessayer ».
nonisolated struct ComposerSceneIntake: Equatable, Sendable {

    enum Kind: Equatable, Sendable {
        case media
        case sticker
    }

    enum Phase: Equatable, Sendable {
        case preparing(done: Int, total: Int)
        case failed
    }

    let id: UUID
    let kind: Kind
    let phase: Phase
    let isOffline: Bool
    /// Le média fondera le fond de la scène : l'espace réservé la couvre.
    let foundsScene: Bool

    static func starting(kind: Kind, total: Int, isOffline: Bool, foundsScene: Bool,
                         id: UUID = UUID()) -> ComposerSceneIntake {
        ComposerSceneIntake(id: id, kind: kind, phase: .preparing(done: 0, total: max(1, total)),
                            isOffline: isOffline, foundsScene: foundsScene)
    }

    func advanced(done: Int) -> ComposerSceneIntake {
        guard case let .preparing(_, total) = phase else { return self }
        return with(.preparing(done: min(max(0, done), total), total: total))
    }

    func failing() -> ComposerSceneIntake {
        with(.failed)
    }

    var isPreparing: Bool {
        if case .preparing = phase { return true }
        return false
    }

    var isFailed: Bool { phase == .failed }

    var blocksComposer: Bool { isPreparing && !isOffline }

    var isWaiting: Bool { isPreparing && isOffline }

    /// La part prête d'une SÉRIE, ou `nil` tant que l'anneau tourne sans
    /// mesure : un seul élément n'a pas de progression lisible avant d'être là.
    var ringFraction: Double? {
        guard case let .preparing(done, total) = phase, total > 1, done > 0 else { return nil }
        return min(1, Double(done) / Double(total))
    }

    static func canStart(over current: ComposerSceneIntake?) -> Bool {
        !(current?.blocksComposer ?? false)
    }

    static func holdsPublication(_ current: ComposerSceneIntake?) -> Bool {
        current?.blocksComposer ?? false
    }

    private func with(_ phase: Phase) -> ComposerSceneIntake {
        ComposerSceneIntake(id: id, kind: kind, phase: phase, isOffline: isOffline, foundsScene: foundsScene)
    }
}

/// Les mots de l'ajout, dans les sept langues du catalogue — ceux d'Android
/// (`story_composer_incoming_*`).
nonisolated enum ComposerSceneIntakeCopy {

    static var preparing: String {
        String(localized: "composer.intake.preparing", defaultValue: "Préparation…", bundle: .main)
    }

    static var waiting: String {
        String(localized: "composer.intake.waiting", defaultValue: "En attente", bundle: .main)
    }

    static var cancel: String {
        String(localized: "composer.intake.cancel", defaultValue: "Annuler l’ajout", bundle: .main)
    }

    static var retry: String {
        String(localized: "composer.intake.retry", defaultValue: "Réessayer", bundle: .main)
    }

    static func title(_ kind: ComposerSceneIntake.Kind) -> String {
        switch kind {
        case .media:
            return String(localized: "composer.intake.title.media", defaultValue: "Média en cours d’ajout", bundle: .main)
        case .sticker:
            return String(localized: "composer.intake.title.sticker", defaultValue: "Sticker en cours d’ajout", bundle: .main)
        }
    }

    static func failed(_ kind: ComposerSceneIntake.Kind) -> String {
        switch kind {
        case .media:
            return String(localized: "composer.intake.failed.media",
                          defaultValue: "Le média n’a pas pu être ajouté.", bundle: .main)
        case .sticker:
            return String(localized: "composer.intake.failed.sticker",
                          defaultValue: "Le sticker n’a pas pu être ajouté.", bundle: .main)
        }
    }

    /// Ce que l'espace réservé dit, et ce que VoiceOver annonce.
    static func status(_ intake: ComposerSceneIntake, locale: Locale = .current) -> String {
        if intake.isFailed { return failed(intake.kind) }
        if intake.isOffline { return waiting }
        guard let part = intake.ringFraction else { return preparing }
        return "\(preparing) \(LocalizedNumber.percent(Int((part * 100).rounded()), locale: locale))"
    }

    /// « Envoi 40 % » : la pré-montée de l'objet SÉLECTIONNÉ, `nil` au repos,
    /// prête ou échouée — la publication reprend un envoi manqué sans rien dire.
    static func sendingBadge(for state: ComposerPreUploadState, locale: Locale = .current) -> String? {
        guard case .uploading = state, let part = state.fraction else { return nil }
        let pourcent = LocalizedNumber.percent(Int((part * 100).rounded()), locale: locale)
        return String(format: String(localized: "composer.intake.sending", defaultValue: "Envoi %@", bundle: .main),
                      pourcent)
    }
}
