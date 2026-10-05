import SwiftUI
import PhotosUI
import AVFoundation
import MeeshySDK
import MeeshyUI

/// LE DÉROULÉ DE LA PHOTO (#9382) — la vue de `GamePhotoSession` : proposition,
/// caméra avant avec le cadre en surimpression, frappe en place, résultat. Plein
/// écran, jamais une feuille qui se glisse : on y fait un geste, pas une lecture.
///
/// Le refus de la caméra n'est pas une impasse : sa raison est dite, et la
/// galerie (`PhotosPicker`, hors processus — aucune permission) comme la carte
/// seule restent possibles depuis tous les états. « Aucune image n'est envoyée au
/// serveur » : tout se passe sur l'appareil.
struct GamePhotoFlowView: View {
    @ObservedObject var session: GamePhotoSession
    let onClose: () -> Void

    @State private var pickerItem: PhotosPickerItem?
    @State private var showsShare = false
    @State private var squareFormat = false

    private var theme: ThemeManager { ThemeManager.shared }

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            content
        }
        .overlay(alignment: .topTrailing) { closeButton }
        .adaptiveOnChange(of: pickerItem) { _, item in
            guard let item else { return }
            Task {
                if let data = try? await item.loadTransferable(type: Data.self) {
                    await session.useGalleryPhoto(data)
                }
                pickerItem = nil
            }
        }
        .adaptiveOnChange(of: session.state) { _, state in
            if case .done = state { onClose() }
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(String(
            localized: "game.photo.a11y",
            defaultValue: "Photo : \(session.moment.title)",
            bundle: .main
        ))
        .accessibilityAddTraits(.isModal)
    }

    private var closeButton: some View {
        Button {
            HapticFeedback.light()
            session.close()
        } label: {
            Image(systemName: "xmark")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(.white)
                .frame(width: 44, height: 44)
                .background(Circle().fill(Color.white.opacity(0.18)))
        }
        .padding(MeeshySpacing.md)
        .accessibilityLabel(String(localized: "game.photo.close", defaultValue: "Fermer", bundle: .main))
        .accessibilityIdentifier("game.photo.close")
    }

    @ViewBuilder
    private var content: some View {
        switch session.state {
        case .offer:
            offer
        case .camera(let phase):
            camera(phase)
        case .striking:
            striking
        case .result(_, let kept):
            result(kept: kept)
        case .failed:
            message(String(localized: "game.photo.failed", defaultValue: "La photo n’a pas pu être composée.", bundle: .main))
        case .done:
            Color.clear
        }
    }

    // MARK: - 1. La proposition

    private var offer: some View {
        VStack(spacing: MeeshySpacing.lg) {
            Spacer()
            MeeStickerFilmView(filmID: "duo-mee-selfie", animated: true, side: 120, animates: true, pixelCap: 240)
                .frame(width: 120, height: 120)
                .accessibilityHidden(true)
            Text(String(localized: "game.photo.offer.title", defaultValue: "On immortalise ?", bundle: .main))
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundColor(.white)
            Text(session.moment.title)
                .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
                .foregroundColor(MeeshyColors.indigo200)
            VStack(spacing: MeeshySpacing.sm) {
                bigButton(String(localized: "game.photo.selfie", defaultValue: "Selfie avec nous", bundle: .main), "camera.fill", primary: true, id: "game.photo.selfie") {
                    Task { await session.chooseSelfie() }
                }
                bigButton(String(localized: "game.photo.card_only", defaultValue: "Carte seule", bundle: .main), "rectangle.portrait", primary: false, id: "game.photo.card") {
                    Task { await session.chooseCard() }
                }
                bigButton(String(localized: "game.photo.later", defaultValue: "Plus tard", bundle: .main), "clock", primary: false, id: "game.photo.later") {
                    Task { await session.later() }
                }
            }
            .padding(.horizontal, MeeshySpacing.xl)
            Spacer()
        }
    }

    private func bigButton(_ title: String, _ symbol: String, primary: Bool, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            Label(title, systemImage: symbol)
                .font(MeeshyFont.relative(MeeshyFont.calloutSize, weight: .semibold))
                .foregroundColor(primary ? MeeshyColors.indigo950 : .white)
                .frame(maxWidth: .infinity, minHeight: 50)
                .background(Capsule().fill(primary ? Color.white : Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: - 2. La caméra

    private func camera(_ phase: PhotoCameraPhase) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Spacer(minLength: MeeshySpacing.xl)
            framed { size in
                ZStack {
                    switch phase {
                    case .live:
                        CameraPreviewLayer(session: session.camera.session)
                    case .opening:
                        Color(white: 0.12)
                        ProgressView().tint(.white)
                    case .failed:
                        Color(white: 0.12)
                    }
                    overlay(size: size, background: .clear)
                    if case .failed(let failure) = phase {
                        failureNote(failure)
                    }
                }
            }
            HStack(spacing: MeeshySpacing.xl) {
                PhotosPicker(selection: $pickerItem, matching: .images) {
                    Image(systemName: "photo.on.rectangle")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Color.white.opacity(0.16)))
                }
                .accessibilityLabel(String(localized: "game.photo.gallery", defaultValue: "Choisir une photo dans la galerie", bundle: .main))
                .accessibilityIdentifier("game.photo.gallery")

                Button {
                    HapticFeedback.medium()
                    Task { await session.shutter() }
                } label: {
                    Circle()
                        .strokeBorder(Color.white, lineWidth: 4)
                        .background(Circle().fill(Color.white.opacity(phase == .live ? 0.9 : 0.25)).padding(6))
                        .frame(width: 72, height: 72)
                }
                .buttonStyle(.plain)
                .disabled(phase != .live)
                .accessibilityLabel(String(localized: "game.photo.shutter", defaultValue: "Prendre la photo", bundle: .main))
                .accessibilityIdentifier("game.photo.shutter")

                Button {
                    HapticFeedback.light()
                    Task { await session.chooseCard() }
                } label: {
                    Image(systemName: "rectangle.portrait")
                        .font(.system(size: 20, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(width: 52, height: 52)
                        .background(Circle().fill(Color.white.opacity(0.16)))
                }
                .accessibilityLabel(String(localized: "game.photo.card_only", defaultValue: "Carte seule", bundle: .main))
                .accessibilityIdentifier("game.photo.card_only")
            }
            .padding(.bottom, MeeshySpacing.lg)
        }
    }

    private func failureNote(_ failure: CameraFailure) -> some View {
        let text: String
        switch failure {
        case .denied:
            text = String(localized: "game.photo.camera.denied", defaultValue: "La caméra est refusée. Autorise-la dans les réglages de ton appareil, ou choisis une photo dans ta galerie.", bundle: .main)
        case .unsupported:
            text = String(localized: "game.photo.camera.unsupported", defaultValue: "Cet appareil ne permet pas la caméra ici. Choisis une photo dans ta galerie, ou garde la carte seule.", bundle: .main)
        case .unavailable:
            text = String(localized: "game.photo.camera.unavailable", defaultValue: "La caméra n’est pas disponible (une autre application l’utilise ?). Choisis une photo dans ta galerie, ou garde la carte seule.", bundle: .main)
        }
        return Text(text)
            .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .padding(MeeshySpacing.lg)
            .accessibilityIdentifier("game.photo.camera.failure")
    }

    // MARK: - 3. La frappe en place

    private var striking: some View {
        VStack {
            Spacer(minLength: MeeshySpacing.xl)
            framed { size in
                ZStack {
                    overlay(size: size, background: strikeBackground, strike: session.strike)
                        .animation(.spring(response: 0.45, dampingFraction: 0.55), value: session.strike)
                    Text(String(localized: "game.mint.tchak", defaultValue: "Tchak !", bundle: .main))
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .foregroundColor(MeeshyColors.warning)
                        .opacity(session.strike)
                        .offset(y: size.height * 0.12)
                }
            }
            Spacer(minLength: MeeshySpacing.xl)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(String(localized: "game.photo.striking", defaultValue: "Mee et Meo frappent le moment dans la photo", bundle: .main))
    }

    private var strikeBackground: GamePhotoCanvasView.Background {
        guard let frozen = session.frozen else { return .card }
        return .photo(frozen, mirrored: session.state == .striking(.selfie))
    }

    // MARK: - 4. Le résultat

    private func result(kept: Bool?) -> some View {
        VStack(spacing: MeeshySpacing.md) {
            Spacer(minLength: MeeshySpacing.xl)
            if let composed = session.composed {
                Image(uiImage: squareFormat ? composed.square : composed.story)
                    .resizable()
                    .scaledToFit()
                    .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                    .padding(.horizontal, MeeshySpacing.lg)
                    .accessibilityLabel(String(localized: "game.photo.preview", defaultValue: "Aperçu : \(session.moment.title)", bundle: .main))
                Picker("", selection: $squareFormat) {
                    Text(String(localized: "game.photo.format.story", defaultValue: "9:16 · story", bundle: .main)).tag(false)
                    Text(String(localized: "game.photo.format.square", defaultValue: "1:1 · profil", bundle: .main)).tag(true)
                }
                .pickerStyle(.segmented)
                .padding(.horizontal, MeeshySpacing.xl)
            }
            if let notice = session.notice {
                Text(notice.text)
                    .font(MeeshyFont.relative(MeeshyFont.subheadSize, weight: .medium))
                    .foregroundColor(notice.tone == .good ? MeeshyColors.success : MeeshyColors.errorSoft)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, MeeshySpacing.xl)
                    .accessibilityIdentifier("game.photo.notice")
            }
            HStack(spacing: MeeshySpacing.sm) {
                resultButton(String(localized: "game.photo.save", defaultValue: "Enregistrer", bundle: .main), "square.and.arrow.down", id: "game.photo.save") {
                    Task { await session.save(square: squareFormat) }
                }
                resultButton(String(localized: "game.photo.share", defaultValue: "Partager", bundle: .main), "square.and.arrow.up", id: "game.photo.share") {
                    showsShare = true
                }
                resultButton(kept == true
                    ? String(localized: "game.photo.kept", defaultValue: "Gardée", bundle: .main)
                    : String(localized: "game.photo.keep", defaultValue: "Garder", bundle: .main),
                    kept == true ? "checkmark.circle.fill" : "book.closed", id: "game.photo.keep") {
                    Task { await session.keep() }
                }
            }
            .padding(.horizontal, MeeshySpacing.lg)
            .padding(.bottom, MeeshySpacing.lg)
        }
        .sheet(isPresented: $showsShare) {
            if let composed = session.composed {
                ShareSheet(activityItems: [squareFormat ? composed.square : composed.story]) { completed in
                    session.shared(completed: completed)
                }
            }
        }
    }

    private func resultButton(_ title: String, _ symbol: String, id: String, action: @escaping () -> Void) -> some View {
        Button {
            HapticFeedback.light()
            action()
        } label: {
            VStack(spacing: 4) {
                Image(systemName: symbol).font(.system(size: 18, weight: .semibold))
                Text(title).font(MeeshyFont.relative(MeeshyFont.footnoteSize, weight: .semibold))
            }
            .foregroundColor(.white)
            .frame(maxWidth: .infinity, minHeight: 56)
            .background(RoundedRectangle(cornerRadius: MeeshyRadius.md).fill(Color.white.opacity(0.16)))
        }
        .buttonStyle(.plain)
        .accessibilityIdentifier(id)
    }

    // MARK: - Briques

    private func message(_ text: String) -> some View {
        Text(text)
            .font(MeeshyFont.relative(MeeshyFont.bodySize, weight: .medium))
            .foregroundColor(.white)
            .multilineTextAlignment(.center)
            .padding(MeeshySpacing.xl)
    }

    /// Un cadre 9:16 qui tient dans l'écran, l'aperçu comme la frappe.
    private func framed<Inner: View>(@ViewBuilder _ inner: @escaping (CGSize) -> Inner) -> some View {
        GeometryReader { proxy in
            let ratio = PhotoFormat.story.size.width / PhotoFormat.story.size.height
            let height = min(proxy.size.height, proxy.size.width / ratio)
            let size = CGSize(width: height * ratio, height: height)
            inner(size)
                .frame(width: size.width, height: size.height)
                .clipShape(RoundedRectangle(cornerRadius: MeeshyRadius.lg, style: .continuous))
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }

    /// Le cadre du moment, dessiné dans l'espace de l'image finale puis mis à l'échelle.
    private func overlay(size: CGSize, background: GamePhotoCanvasView.Background, strike: Double = 1) -> some View {
        let format = PhotoFormat.story
        let scale = size.width / format.size.width
        return GamePhotoCanvasView(
            moment: session.moment,
            dateLabel: GamePhotoComposer.dateLabel(Date()),
            format: format, background: background, strike: strike
        )
        .frame(width: format.size.width, height: format.size.height)
        .scaleEffect(scale, anchor: .topLeading)
        .frame(width: size.width, height: size.height, alignment: .topLeading)
        .allowsHitTesting(false)
    }
}
