# Itération 165i — Analyse UI/UX iOS : sélecteur de motif de signalement (VoiceOver de l'état sélectionné)

**Date** : 2026-07-19
**Piste** : iOS (suffixe `i`).
**Surfaces** :
- `apps/ios/Meeshy/Features/Main/Components/ReportMessageSheet.swift`
- `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageReportDetailView.swift`

**Base** : `main` HEAD (`efedb69`)
**Branche** : `claude/laughing-thompson-ek97fy`
**Gate** : CI `iOS Tests`
**Catégorie** : Accessibilité — VoiceOver (état porté par icône/couleur seule)

## Contexte

Le flux de signalement de message existe en **deux points d'entrée** qui partagent le **même**
composant de rangée `reportTypeRow` (même `enum ReportType`, même structure de `Button`) :
- `ReportMessageSheet` — feuille autonome (accent = couleur de conversation) ;
- `MessageReportDetailView` — onglet « Signaler » du `MessageDetailSheet` (accent = `MeeshyColors.error`,
  + confirmation obligatoire avant envoi).

Typographie déjà 100 % sémantique (`.callout/.subheadline/.caption/.title3`) → **0 Dynamic Type à
migrer**. Le déficit était purement **sémantique VoiceOver**.

Numéro **165i** : strictement au-dessus du plus haut mergé (164i = `InviteFriendsSheet`, PR #2022).
Aucun commit iOS dans les 20 derniers de `main` (release/android/web) → **0 contention**.

## Constat (avant 165i)

Dans chaque `reportTypeRow`, l'**état sélectionné** d'un motif est signalé **uniquement** par :
- l'apparition d'un glyphe `checkmark.circle.fill` (à droite) ;
- la teinte accent de l'icône de gauche + le fond/bordure de la carte.

Pour VoiceOver, la rangée est un `Button` qui lit bien son libellé (`type.label` + `type.description`),
**mais rien n'annonce lequel des sept motifs est actuellement sélectionné** — l'information
« ce motif est coché » est portée **par l'icône et la couleur seules**. Violation directe de la règle
a11y « Never rely only on color to convey meaning » (CLAUDE.md). De plus, l'icône décorative de motif
et le checkmark ne sont pas masqués de VoiceOver (bruit potentiel « image »).

## Corrections appliquées (2 fichiers, 0 logique, 0 changement visuel, 0 clé i18n)

Fix **identique** appliqué aux deux surfaces (même défaut, même composant) :

- **Trait `.isSelected` sur la rangée** : `.accessibilityAddTraits(isSelected ? .isSelected : [])`
  sur le `Button` → VoiceOver annonce désormais « Sélectionné » pour le motif actif. Le `Button`
  lisait déjà `label` + `description` (combinés automatiquement) ; on ajoute juste l'état.
- **Glyphes décoratifs masqués** : `.accessibilityHidden(true)` sur l'icône de motif (`type.icon`,
  redondante avec le libellé) et sur le `checkmark.circle.fill` (l'état passe maintenant par le trait).

Aucun changement de rendu visuel, de copie, de layout ou de logique. Le `checkmark` reste affiché
visuellement (transition `.scale`/`.opacity` intacte).

## Périmètre / non-régression

- **2 fichiers**, 0 logique, 0 mutation d'état, 0 changement de layout/couleur/copie visible,
  0 test neuf, **0 clé i18n neuve** (les libellés de motif sont déjà localisés via `ReportType`).
- Précédent `.isSelected` déjà répandu dans l'app (`NewConversationView`, `LanguagePickerSheet`,
  `MyStoriesView`, `NotificationSettingsView`, `EffectsPickerView`, `UniversalComposerBar`…) → pattern
  aligné, pas d'invention.
- Le guard test `ConversationMenuSystemDesignGuardTests.test_report_requestsConfirmation_beforeSubmit`
  n'assert que sur `showReportConfirm`, `.confirmationDialog` et le compte d'appels `onReport?(` —
  **aucun** n'est touché par des modificateurs a11y. Aucune régression de test.
- `import` : `ReportMessageSheet` (MeeshySDK) et `MessageReportDetailView` (MeeshyUI) déjà présents ;
  `AccessibilityTraits`/`accessibilityAddTraits` sont SwiftUI natif → 0 import neuf.

## Statut

**TERMINÉE** — l'état sélectionné du sélecteur de motif de signalement est désormais annoncé par
VoiceOver (trait `.isSelected`) sur les deux points d'entrée, au lieu d'être porté par la seule
coche + couleur ; glyphes décoratifs masqués. Ne plus re-flagger ces surfaces pour VoiceOver.

### Note de dette (consistance / réutilisation)

`ReportMessageSheet.reportTypeRow` et `MessageReportDetailView.reportTypeRow` sont **quasi-identiques**
(seuls diffèrent l'accent et le nom de la `@State`). Une future itération pourra les unifier en un
composant partagé `ReportReasonRow(type:isSelected:accent:onTap:)` (app-side, paramètres opaques) pour
supprimer la duplication — hors périmètre 165i (refactor structurel, risque de régression supérieur au
budget « 0 logique » d'une itération a11y).

---

## Analyses corrigées & complètes (ne pas reproduire)

- Sélecteur de motif de signalement (`reportTypeRow` de `ReportMessageSheet` +
  `MessageReportDetailView`) — **165i** : trait VoiceOver `.isSelected` sur la rangée (état
  auparavant porté par coche + couleur seules) + icône de motif et checkmark `.accessibilityHidden`.
  Typographie déjà sémantique (0 Dynamic Type). **SOLDÉ.** Dette notée : duplication `reportTypeRow`
  à unifier (hors périmètre a11y).
