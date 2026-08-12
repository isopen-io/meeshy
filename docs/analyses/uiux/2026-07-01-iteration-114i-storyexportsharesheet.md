# Itération 114i — Analyse UI/UX iOS : `StoryExportShareSheet`

**Date** : 2026-07-01
**Piste** : iOS (suffixe `i`).
**Surface** : `apps/ios/Meeshy/Features/Main/Views/StoryExportShareSheet.swift`
**Base** : `main` HEAD (`529ccb81`)
**Branche** : `claude/upbeat-euler-s5qysh`
**Gate** : CI `iOS Tests`

## Contexte

La sheet auteur-only d'export MP4 d'une story (header, picker de langue à graver,
barre de progression / CTA). Feature Prisme Linguistique : la langue choisie est gravée
dans le MP4 partagé hors Meeshy (`UIActivityViewController`). **0 PR ouverte iOS** au
démarrage (list_pull_requests vide) → 0 contention. Numéro **114i** (113i =
`OnboardingFlowView` mergé #1327).

## Constat (avant 114i)

Le `navigationTitle`, les libellés de bouton toolbar (Annuler/OK) et l'alerte reposaient
déjà sur des `String(localized:)` + styles système par défaut. Restaient **6
`.font(.system(size:))`** en tailles fixes — donc non réactifs au Dynamic Type : hero
d'en-tête, sous-titre, label du picker, chevron du menu, texte de progression, CTA.

## Corrections appliquées (1 fichier, 0 logique)

- **5/6 `.font(.system(size:))` → `MeeshyFont.relative(...)`** : sous-titre (14), label
  « Langue à graver » (13 semibold), chevron menu (12 semibold), texte de progression
  (13 medium), label du CTA « Exporter en vidéo » (16 semibold).
- **1/6 glyphe figé** + commentaire doctrine : hero `square.and.arrow.up.fill` de l'en-tête
  (36 semibold — hero décoratif de la sheet ; le figer évite qu'il déséquilibre l'en-tête
  en XXXL, doctrine 84i).
- **2 `.accessibilityHidden(true)`** : le hero (le sous-titre adjacent porte le sens) et le
  chevron du menu (le libellé de langue sélectionnée + la sémantique `Menu` portent le contrôle).

Palette (brand gradient de la marque, `indigo50/200/500/950` sémantiques) et style de la
sheet déjà conformes → **intacts**.

## Périmètre / non-régression

- **1 seul fichier**, 0 logique, 0 test neuf, 0 clé i18n neuve (toutes les chaînes déjà
  `String(localized:)`).

## Statut

**TERMINÉE** — `StoryExportShareSheet` Dynamic Type + a11y soldé. Ne plus re-flagger le
hero figé (36pt).

---

## Analyses corrigées & complètes (ne pas reproduire)

- `StoryExportShareSheet` — 5 sites → `relative`, 1 hero figé (36pt décoratif), 2 masquages
  VoiceOver (hero + chevron menu). **SOLDÉ 114i.**
