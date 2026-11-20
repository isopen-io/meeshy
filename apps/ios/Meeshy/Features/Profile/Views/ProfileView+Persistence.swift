import SwiftUI
import PhotosUI
import MeeshySDK
import MeeshyUI
import os

// MARK: - Persistance : chargement des champs, enregistrement optimiste, envoi des images

extension ProfileView {
    func loadUserData() {
        firstName = user?.firstName ?? ""
        lastName = user?.lastName ?? ""
        displayName = user?.displayName ?? user?.username ?? ""
        bio = user?.bio ?? ""
        city = user?.declaredCity ?? ""
        cityCircle = user?.declaredCityCircle
        accentChoice = ProfileAccentChoice(wire: user?.profileAccentColor)
        systemLanguage = user?.systemLanguage ?? "fr"
        regionalLanguage = user?.regionalLanguage ?? ""
        customDestinationLanguage = user?.customDestinationLanguage ?? ""
        editSettings = ProfileEditSettings.make(user: user)
    }

    func loadImageForEditor(from item: PhotosPickerItem, completion: @escaping (UIImage?) -> Void) {
        Task {
            guard let data = try? await PickedMedia.loadImageData(item),
                  let image = UIImage(data: data) else {
                completion(nil)
                return
            }
            completion(image)
        }
    }

    /// Entrer en édition et en sortir font paraître et partir le nom, les sélecteurs d'image et les chevrons : la
    /// bascule passe par une transaction animée, immédiate sous « réduire les animations ».
    func setEditing(_ editing: Bool) {
        meeshyWithMotion(.morph, reduceMotion: reduceMotion) { isEditing = editing }
    }

    /// Le bandeau d'erreur paraît et part dans une transaction animée, immédiate sous « réduire les animations ».
    func showError(_ message: String?) {
        meeshyWithMotion(.morph, reduceMotion: reduceMotion) { errorMessage = message }
    }

    // MARK: - Actions

    /// Hors ligne : la requête est mise en file (`SettingsActionQueue`) et
    /// rejouée au retour du réseau ; l'apply optimiste reste en place.
    private func queueOfflineSave(_ request: UpdateProfileRequest, rollingBackTo original: MeeshyUser) {
        do {
            let payload = try JSONEncoder().encode(request)
            // The gateway route is `PATCH /users/me` (services/gateway/src/routes/users/profile.ts) —
            // `/users/me/profile` does not exist and 404s forever on replay.
            // `SettingsAction` PERSISTE ce chemin pour le rejouer plus tard :
            // il lui faut une chaîne, pas une adresse typée. Elle est DÉRIVÉE
            // du catalogue plutôt qu'écrite — sinon ce site redeviendrait le
            // seul endroit du dépôt où un chemin s'écrit à la main, et le
            // commentaire ci-dessus dit ce que ça coûte.
            let action = SettingsAction(
                endpoint: APIClient.shared.legacyPath(for: UsersEndpoint.me),
                httpMethod: "PATCH",
                payload: payload
            )
            Task { await SettingsActionQueue.shared.enqueue(action) }
            FeedbackToastManager.shared.showSuccess(String(
                localized: "profile.save.queued",
                defaultValue: "Enregistré, envoi au retour du réseau",
                bundle: .main
            ))
        } catch {
            // Encoding failure means nothing was queued — the optimistic
            // apply made by the caller must not be left standing as a silent lie.
            Logger.settings.error("Offline profile save failed to encode payload: \(error.localizedDescription, privacy: .public)")
            authManager.currentUser = original
            setEditing(true)
            HapticFeedback.error()
            showError(String(localized: "profile.save.error", defaultValue: "Erreur lors de l'enregistrement", bundle: .main))
        }
    }

    func saveProfile() {
        guard let original = authManager.currentUser else { return }

        let identityEdits = (
            firstName: Self.identityValueToSend(firstName, original: original.firstName),
            lastName: Self.identityValueToSend(lastName, original: original.lastName),
            displayName: Self.identityValueToSend(displayName, original: original.displayName)
        )
        if let refusal = Self.identityRefusalMessage(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName
        ) {
            HapticFeedback.error()
            showError(refusal)
            return
        }

        // Optimistic update — apply the edits to the local user immediately
        // so the UI reflects them without waiting for the round-trip. Server
        // response replaces this with the canonical form on success; on
        // failure we roll back to the snapshot and re-open the editor.
        let voicePublicEdit = editSettings.voicePublicToSend(original: original)
        let autoTranslateEdit = editSettings.autoTranslateToSend(original: original)
        let optimistic = original.applyingProfileEdits(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage),
            autoTranslateEnabled: autoTranslateEdit,
            voicePublic: voicePublicEdit
        )
        let cityEdit = Self.cityEditToSend(typed: city, circle: cityCircle, original: original)
        let changesCity = cityEdit.city != nil || cityEdit.circle != nil
        let accentEdit = Self.accentEditToSend(accentChoice, original: original)
        let withCity = changesCity
            ? optimistic.withDeclaredCity(ProfileCity.normalized(city), circle: cityCircle)
            : optimistic
        authManager.currentUser = accentEdit.map { withCity.withProfileAccent($0.wire) } ?? withCity
        setEditing(false)
        HapticFeedback.success()

        let request = UpdateProfileRequest(
            firstName: identityEdits.firstName,
            lastName: identityEdits.lastName,
            displayName: identityEdits.displayName,
            bio: Self.changedOrNil(bio, original: original.bio),
            systemLanguage: systemLanguage.isEmpty ? nil : systemLanguage,
            regionalLanguage: Self.changedOrNil(regionalLanguage, original: original.regionalLanguage),
            customDestinationLanguage: Self.changedOrNil(customDestinationLanguage, original: original.customDestinationLanguage),
            voicePublic: voicePublicEdit,
            city: cityEdit.city,
            cityCircle: cityEdit.circle,
            profileAccentColor: accentEdit,
            autoTranslateEnabled: autoTranslateEdit
        )
        send(request, rollingBackTo: original)
    }

    /// Offline path — persist the request to SettingsActionQueue so it replays automatically once connectivity
    /// returns. The optimistic UI is already in place; the user gets a confirmation toast.
    private func send(_ request: UpdateProfileRequest, rollingBackTo original: MeeshyUser) {
        if NetworkMonitor.shared.isOffline {
            queueOfflineSave(request, rollingBackTo: original)
            return
        }

        isSaving = true
        Task {
            do {
                let updatedUser = try await UserService.shared.updateProfile(request)
                authManager.currentUser = Self.mergingServerUser(updatedUser, onto: authManager.currentUser)
            } catch {
                // Rollback to the pre-edit snapshot so the user can fix the issue.
                authManager.currentUser = original
                setEditing(true)
                HapticFeedback.error()
                showError(error.localizedDescription)
            }
            isSaving = false
        }
    }

    func uploadAvatar(_ image: UIImage) {
        upload(image, as: .avatar)
    }

    func uploadBanner(_ image: UIImage) {
        upload(image, as: .banner)
    }

    /// La photo ou la bannière part, puis le compte servi se fond sur l'utilisateur courant ; un échec le dit deux
    /// fois (toast et bandeau), comme avant.
    private func upload(_ image: UIImage, as slot: ProfileImageSlot) {
        setUploading(true, slot)
        Task {
            do {
                let updatedUser = try await ProfileImageUploader().upload(image, as: slot)
                authManager.currentUser = Self.mergingServerUser(updatedUser, onto: authManager.currentUser)
                HapticFeedback.success()
                FeedbackToastManager.shared.showSuccess(slot == .avatar
                    ? String(localized: "profile.avatar.updated", bundle: .main)
                    : String(localized: "profile.banner.updated", bundle: .main))
            } catch {
                let failure = slot == .avatar
                    ? String(localized: "profile.avatar.error", bundle: .main)
                    : String(localized: "profile.banner.error", bundle: .main)
                HapticFeedback.error()
                FeedbackToastManager.shared.showError(failure)
                showError(failure)
            }
            setUploading(false, slot)
        }
    }

    private func setUploading(_ uploading: Bool, _ slot: ProfileImageSlot) {
        switch slot {
        case .avatar:
            isUploadingAvatar = uploading
            if !uploading { avatarItem = nil }
        case .banner:
            isUploadingBanner = uploading
            if !uploading { bannerItem = nil }
        }
    }
}
