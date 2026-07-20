# Iteration-193i — ChangePasswordView : VoiceOver des champs sécurisés

**Date** : 2026-07-20
**Piste** : iOS (suffixe `i`)
**Fichier** : `apps/ios/Meeshy/Features/Main/Views/ChangePasswordView.swift`
**Type** : Accessibilité (VoiceOver) — flux sensible (changement de mot de passe)

## Contexte

`ChangePasswordView` est déjà bien traitée en a11y sur ses zones décoratives
(validationRow, sectionHeader combiné `.isHeader`, successOverlay combiné,
héros ≥40pt exclu du Dynamic Type). Le seul reliquat était le helper
`secureField(...)`, réutilisé pour les **trois** champs (mot de passe actuel,
nouveau, confirmation).

### Problème identifié

Chaque `secureField` empilait trois éléments VoiceOver distincts et sous-optimaux :

1. **Glyphe de tête décoratif** (`lock.fill` / `key.fill` / `checkmark.lock.fill`)
   — `Image(systemName:)` sans label → relu par VoiceOver comme un élément
   parasite (nom brut du symbole ou vide selon iOS).
2. **Libellé visuel `Text(title)`** (caption2) au-dessus du champ — annoncé
   séparément, puis…
3. **`SecureField(placeholder, …)`** dont le seul « nom » accessible était le
   `placeholder` — lequel **disparaît dès la première frappe**. Une fois un
   caractère saisi, VoiceOver ne pouvait plus annoncer le rôle du champ
   (« champ de texte sécurisé » sans indiquer *lequel*).

C'est exactement l'anti-pattern « placeholder-as-name » corrigé en **186i** sur
`CreateShareLinkView.formTextField` (#2150).

## Correctif appliqué (doctrine 186i)

Dans `secureField(...)`, 3 modifiers ajoutés, **0 changement visuel** :

- Glyphe de tête → `.accessibilityHidden(true)` (décoratif, le sens passe par le
  label du champ).
- `Text(title)` visuel → `.accessibilityHidden(true)` (doublon ; son rôle est
  réassigné au champ).
- `SecureField` → `.accessibilityLabel(title)` → VoiceOver annonce désormais
  « Mot de passe actuel, champ de texte sécurisé » / « Nouveau mot de passe… » /
  « Confirmer… » **indépendamment du contenu saisi**, tout en gardant le champ
  focalisable et éditable (pas de `.combine` sur un champ de saisie, qui
  casserait l'édition VoiceOver).

## Gains

- **A11y** : chaque champ mot de passe annonce clairement son rôle, y compris
  une fois rempli (placeholder évanescent supprimé de l'équation).
- **Bruit VoiceOver réduit** : glyphe décoratif + libellé doublon retirés du
  parcours du rotor.
- **Cohérence** : parité stricte avec `CreateShareLinkView.formTextField` (186i)
  et `NewConversationView`.

## Hors périmètre (inchangé)

- Header, back button (déjà labellisé), `validationHints`, `saveButton`,
  `successOverlay`, `PasswordStrengthIndicator` (composant SDK — non modifié,
  routine iOS-app-only).
- `textContentType(.password)` conservé tel quel (changer `.newPassword`
  toucherait l'AutoFill/suggestion — hors scope a11y de cette itération).
- Aucune clé i18n neuve (réutilise les `title` déjà localisés passés au helper).

## Statut

- **Fichiers** : 1 (vue) + 2 docs + branch-tracking
- **Logique / réseau / clé i18n neuve / test neuf** : 0
- **Changement visuel** : 0
- **Collision essaim** : `ChangePasswordView` absente de toute PR ouverte
  (vérifié via `list_pull_requests`, 2026-07-20)
- **Gate** : CI `iOS Tests` (env Linux → pas de build Xcode local possible)
