# Itération 140i — Analyse UI/UX iOS : `ThemedBackButton` (ConversationHelperViews)

**Date** : 2026-07-15
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/ConversationHelperViews.swift` (`ThemedBackButton`)
**Base** : `main` HEAD
**Branche** : `claude/laughing-thompson-gx78op`
**Gate** : CI `iOS Tests`

## Contexte

`ThemedBackButton` est le bouton retour de l'en-tête de conversation : chevron gauche dans une pastille
glass + pill rouge d'unread agrégé (convention iMessage). La surface était **partiellement migrée** — un
libellé (`.relative(18)` ligne 204) déjà scalé — mais deux glyphes traînaient encore en `.system(size:)`.
Numéro **140i** (139i = `MentionSuggestionPanel` mergé ; le lot des fichiers à 3 `.system` est épuisé,
on est dans la traîne à 2). **0 PR iOS de la piste ouverte** sur ce fichier → **0 contention** (PR #1961
`modernization-and-quality-audit` est une piste distincte, pas `ConversationHelperViews`).

## Constat (avant 140i)

**2 `.font(.system(size:))`** de nature opposée :
- **chevron.left** (16 bold, ligne 69) — **vrai glyphe d'affordance** dans un slot **généreux**
  `.frame(width: 40, height: 40)` : 40 pt laisse largement la place au glyphe de grandir sous Dynamic
  Type sans clip → **doit scaler**.
- **badge unread** `Text(displayedUnread(...))` (12 bold rounded, ligne 89) — **badge numérique compact**
  iMessage : la capsule hugge les chiffres via `.fixedSize(horizontal: true, vertical: false)` +
  `.frame(minWidth: 22, minHeight: 22)`. Le laisser scaler casserait la pastille pill-tight et la
  pousserait hors de la pastille glass du bouton retour → **doit rester figé** (même précédent que le
  badge unread de `GlobalSearchView`, l'insigne de compte de `SearchView`, etc.).

## Corrections appliquées (1 fichier, 0 logique)

- **chevron.left 16 bold → `MeeshyFont.relative(16, weight: .bold)`** : l'affordance retour scale
  désormais sous Dynamic Type (slot 40×40 = marge suffisante, aucun clip).
- **badge unread → GELÉ + commenté** : `.system(size: 12, weight: .bold, design: .rounded)` conservé,
  annotation doctrine ajoutée (badge numérique compact, pill hugge les chiffres, VoiceOver lit le compte
  depuis le libellé du bouton `a11y.back.with_unread` → glyphe `.accessibilityHidden(true)` déjà en place).

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 mutation d'état, 0 test neuf, 0 clé i18n neuve. `import MeeshyUI`
  déjà présent (le libellé ligne 204 utilisait déjà `MeeshyFont.relative`).
- A11y déjà conforme → **intacte** : le `Button` porte `.accessibilityLabel` (`a11y.back` /
  `a11y.back.with_unread`) ; le badge est `.accessibilityHidden(true)`.
- Palette (`gradientFill`, `MeeshyColors.unreadBadgeBackground(isDark:)`, glass neutre) conforme → non
  touchée. Aucun test ne référence `ThemedBackButton` → aucune régression de test.

## Statut

**TERMINÉE** — `ThemedBackButton` Dynamic Type soldé (chevron → `relative` ; badge unread figé + commenté ;
libellé ligne 204 déjà `relative`). Ne plus re-flagger cette surface.

---

## Analyses corrigées & complètes (ne pas reproduire)

- `ThemedBackButton` (ConversationHelperViews) — chevron retour 16 bold → `MeeshyFont.relative` (slot
  40×40 généreux) ; badge unread 12 bold rounded **figé** (pill compacte `.fixedSize`+`minWidth:22`, a11y
  via libellé bouton) ; libellé ligne 204 déjà `relative`. **SOLDÉ 140i.**
