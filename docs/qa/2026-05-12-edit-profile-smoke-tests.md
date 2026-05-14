# Edit Profile — Smoke Tests Checklist

Worktree: `feat-edit-profile-vm` (commit `d9946228` — Task 18 complete)
Plan: `docs/superpowers/plans/2026-05-12-edit-profile-viewmodel.md` (Task 19)
Date: 2026-05-12

## Pré-requis

- App lancée via `./apps/ios/meeshy.sh run`
- Connexion : `atabeth / pD5p1ir9uxLUf2X2FpNE`
- Naviguer vers Profile → Edit Profile

## Steps

### 1. Vérification initiale
- [ ] displayName affiché = valeur stockée
- [ ] bio affichée = valeur stockée
- [ ] avatar affiché = valeur stockée

### 2. Save displayName uniquement
- [ ] Modifier displayName → Save
- [ ] Retour instantané vers Profile
- [ ] displayName mis à jour partout (Profile + bubbles + conversation header)
- [ ] Toast success affiché
- [ ] Pas de toast d'erreur après 2s (pas de rollback)

### 3. Save bio uniquement
- [ ] Modifier bio → Save
- [ ] Retour instantané, bio mise à jour
- [ ] Toast success ; pas de rollback

### 4. Save avatar uniquement
- [ ] Sélectionner photo → Save
- [ ] Spinner "Envoi de la photo..." visible
- [ ] Retour, nouvel avatar visible partout (Profile + conversation header + bulles)
- [ ] Toast success ; pas de rollback

### 5. Save displayName + bio + avatar
- [ ] Modifier les 3 → Save
- [ ] Spinner upload → save → retour
- [ ] Les 3 mises à jour visibles instantanément

### 6. Back sans sauvegarder
- [ ] Modifier displayName → tap chevron Back
- [ ] Retour Profile, displayName inchangé (vérifie hasChanges ne déclenche pas de save automatique)

### 7. Offline (airplane mode)
- [ ] Activer airplane mode
- [ ] Modifier displayName → Save
- [ ] Toast success affiché (queue persistée localement)
- [ ] Profile + conversation header montrent le nouveau name
- [ ] Désactiver airplane mode
- [ ] OutboxFlusher fire PATCH /api/v1/users/profile dans les secondes suivantes
- [ ] Pas de rollback (server accepte)

### 8. Force-rollback (optionnel — nécessite cooperation server)
- [ ] Pause OutboxFlusher OU mock 5xx 4 fois sur PATCH profile
- [ ] Après maxAttempts, `.exhausted` déclenche `restoreLocalProfileSnapshot`
- [ ] Profile revient à l'ancien displayName
- [ ] Toast d'erreur "Mise a jour du profil echouee"

## Critères de réussite

Steps 1-7 doivent tous passer pour valider le worktree.
Step 8 est facultatif (test de la branche `.exhausted` du `observeOutcome`).

## Notes

Les 22 tests automatisés couvrent :
- 2 `MeeshyUserProfileMutationTests` (SDK)
- 3 `AuthManagerProfileMutationTests` (SDK)
- 1 `AttachmentUploaderTests` (app)
- 16 `EditProfileViewModelTests` (app)

Les smoke tests vérifient l'intégration end-to-end (UI ↔ ViewModel ↔ AuthManager ↔ OfflineQueue ↔ Cache ↔ Backend) que les unit tests ne peuvent pas couvrir.
