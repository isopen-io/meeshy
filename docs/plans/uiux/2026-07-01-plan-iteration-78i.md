# Plan — Iteration 78i (2026-07-01) — iOS i18n `ConversationSettingsView`

## Objectif
Compléter l'i18n de `ConversationSettingsView.swift` (SDK `MeeshyUI`) : migrer toutes les
chaînes de chrome français figées restantes vers des clés `String(localized:…bundle:.module)`,
en réutilisant les clés SSOT existantes quand elles existent, et compléter le catalogue SDK.

## Base de départ
`main` HEAD `3dac3630` (resync avant démarrage ; branche `claude/upbeat-euler-rvcs10`).
Note : 77i (`SharePickerView`) est **mergé** (PR #1162) — pointeur iOS mis à jour.

## Étapes
1. [x] Survey des littéraux FR non localisés dans les vues iOS (sous-agent Explore) → cible
   prioritaire `ConversationSettingsView` (fichier à moitié localisé, forte visibilité).
2. [x] Inventaire des clés SSOT existantes (`conversation.settings.*`, `common.*`) dans le
   catalogue SDK ; repérage du gap `conversation.settings.delete.button` (fr-only).
3. [x] Ajouter 31 clés ×5 langues à `Sources/MeeshyUI/Resources/Localizable.xcstrings` +
   compléter `delete.button` (de/en/es/pt-BR). Format Xcode préservé
   (`json.dumps(..., ensure_ascii=False, indent=2, separators=(',', ' : '))`,
   `extractionState: extracted_with_value`, fr `new` / autres `needs_review`). Guard anti-clash.
4. [x] Migrer `ConversationSettingsView.swift` :
   - Alerte delete-for-me : titre/message → `deleteForMe.*` ; boutons → `common.cancel` +
     `conversation.settings.delete.button` (SSOT).
   - Message alerte delete-for-all → `conversation.settings.delete.confirm.message`.
   - Section Permissions : header + writeRole + 4 options Picker + announcement (+subtitle) +
     slowMode (+off) + autoTranslate (+subtitle).
   - Section Membres : header interpolé `%d` + placeholder recherche + empty state.
   - Badges de rôle : `conversation.role.{creator,admin,moderator}` (libellés seulement).
   - Menu membre : promoteAdmin/promoteModerator/demoteMember/expel/ban.
   - Zone dangereuse : labels boutons `deleteForMe.label` / `deleteForAll.label`.
   - Toasts ViewModel : roleUpdated / memberExpelled / memberBanned.
5. [x] Vérifier absence de résidu FR hors `String(localized:)` (grep ciblé) — seuls restent
   `10s/30s/1min/5min` (durées neutres, conformes).
6. [x] Vérifier aucun test SDK n'assère les anciens littéraux (grep) → aucun.
7. [x] Roundtrip JSON valide (Python).
8. [ ] Commit + push branche ; PR ; gate = CI `ios-tests.yml`.
9. [ ] Merge dans `main` après CI verte ; supprimer la branche ; MAJ branch-tracking.

## Risques / points d'attention
- **@Sendable closures** : les nouvelles chaînes sont dans des ViewBuilders `@MainActor`
  (Picker, badges, menu, alertes), pas dans les closures `@Sendable` de `PhotosPicker`
  (déjà hissées en constantes dans `visualSection`, non touché) → pas d'erreur d'isolation.
- **SSOT** : réutiliser `conversation.settings.delete.button` (« Supprimer ») pour le bouton
  delete-for-me évite un doublon ; la complétion de ses 4 langues manquantes est une
  **amélioration** (avant : fallback FR pour EN/ES/DE/pt-BR), pas une régression.
- **Interpolation** : `%d` via `String(format:)` — pattern éprouvé (77i).
- Pas de test neuf : swap mécanique, vue non snapshotée, couverture = compile CI.

## Vérification finale
- [x] `grep` : 0 chrome FR hors `String(localized:)` (hors durées numériques neutres).
- [x] JSON `Localizable.xcstrings` valide (roundtrip Python) ; format Xcode préservé
  (diff = ajouts + 1 ligne modifiée sur `delete.button`).
- [ ] CI `ios-tests.yml` verte.
