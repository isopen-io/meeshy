# Itération 167i — i18n + VoiceOver `MessageEditsDetailView` (iOS)

**Date** : 2026-07-19
**Surface** : `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageEditsDetailView.swift`
**Type** : localisation (i18n) + accessibilité (VoiceOver / regroupement / icônes décoratives) —
1 fichier, 0 logique, 0 test neuf.

## Contexte

`MessageEditsDetailView` est l'onglet « Modifications » du détail d'un message : une bannière
timeline (état vide / historique) + la version actuelle du contenu + les révisions chronologiques,
ou un état vide. C'est le frère structurel de `MessageViewsDetailView` (144i, PR #1974),
`MessageReactionsDetailView` (155i), `MessageTranscriptionDetailView` (166i, PR #2030) et
`MessageForwardDetailView`.

**Anomalie détectée** : sur les 7 fichiers du dossier `MessageDetail/`, c'était le **seul** avec
`localized=0` (aucune chaîne localisée) ET `accessibilityElement=0` (aucun regroupement VoiceOver) —
tous ses frères en ont. `MessageForwardDetailView` sert de gabarit de référence (i18n + VoiceOver
complets). Cette itération met `MessageEditsDetailView` à parité.

Typographie **déjà entièrement sémantique** (`.caption2` / `.subheadline` / `.footnote` /
`.system(.caption, design: .monospaced)`) → **aucune dette Dynamic Type**. Le seul
`.font(.system(size: 28))` est le glyphe décoratif d'état vide (conservé figé + masqué VoiceOver,
doctrine 155i identique à `MessageForwardDetailView`). Aucune migration `MeeshyFont.relative`.

## Lacunes comblées

### Localisation (i18n)
Toutes les chaînes françaises hardcodées → `String(localized:defaultValue:bundle:.main)` (pattern
frère, extraction automatique des clés, aucune édition de catalogue requise) :
- `message-detail.edits.none-title` « Aucune modification »
- `message-detail.edits.history-title` « Historique »
- `message-detail.edits.none-detail` « Ce message n'a pas été modifié »
- `message-detail.edits.empty` « L'historique des modifications apparaît ici »
- `message-detail.edits.current` « Actuel »
- `message-detail.edits.version-n` « Version %d » (`String(format:)`)
- `message-detail.edits.previous-one` / `.previous-other` « %d version(s) précédente(s) »
  (helper `previousVersionsDetail(_:)` — pluralisation localisable par langue, remplace le ternaire
  `\(count > 1 ? "s" : "")` inline non-i18n)

Bonus : les accents manquants du texte hardcodé (« ete modifie », « apparait », « precedente »)
sont rétablis dans les `defaultValue` (« été modifié », « apparaît », « précédente »).

### VoiceOver
1. **Bannière timeline** — icône + titre + détail + badge compteur lus en 4 arrêts séparés (icône
   `pencil.and.list.clipboard` décorative ; badge « 3 » redondant avec le détail
   « 3 versions précédentes »). → icône `.accessibilityHidden(true)`, badge compteur
   `.accessibilityHidden(true)`, HStack `.accessibilityElement(children: .combine)` : un seul arrêt
   « Historique, 3 versions précédentes ».

2. **Rangée de révision** — rail coloré + en-tête + horodatage + contenu lus séparément ; l'état
   « actuel vs version N » signalé aussi par la couleur du rail/en-tête. → `combine` sur la HStack :
   un arrêt « Actuel, 14:30, <contenu> ». L'état reste porté par le **texte** de l'en-tête (« Actuel »
   / « Version N »), jamais par la seule couleur (conforme HIG). Le rail est un `Shape` sans label →
   déjà ignoré de VoiceOver.

3. **État vide** — glyphe `pencil.slash` décoratif exposé (redondant avec le texte). →
   `.accessibilityHidden(true)` sur l'icône + `.accessibilityElement(children: .combine)` sur la VStack.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 appel réseau (le composant est piloté par
  `editRevisions` injecté). 0 test neuf, 0 test existant référençant la surface (grep confirmé).
- Palette (`Color(hex:)`, `theme.*`, `accent`) inchangée. Fonts déjà sémantiques (0 migration).
- Clés i18n inline `defaultValue:` → compile sans édition du `.xcstrings` (auto-extraction).
- Gate = CI `iOS Tests` (compile Xcode 26.1.1 / run simu 18.2).

## Statut

**TERMINÉE** — `MessageEditsDetailView` mis à parité avec ses frères `MessageDetail/` :
7 chaînes localisées (dont pluralisation localisable), bannière/rangée/état-vide regroupés VoiceOver,
icônes décoratives + badge compteur redondant masqués. Typographie déjà sémantique (0 Dynamic Type).
Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `MessageEditsDetailView` — i18n complète (`message-detail.edits.*`, 7 clés, helper de pluralisation
  `previousVersionsDetail`) ; VoiceOver : bannière `combine` + icône/badge masqués, rangée révision
  `combine` (état porté par le texte de l'en-tête, non-couleur), état vide `combine` + glyphe masqué ;
  glyphe 28pt décoratif figé (doctrine 155i) ; fonts déjà sémantiques (0 migration Dynamic Type).
  Frère de `MessageForwardDetailView` (gabarit i18n+a11y) / `MessageViewsDetailView` (144i). **SOLDÉ 167i.**
