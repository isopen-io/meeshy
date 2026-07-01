# Plan — Iteration 95i (2026-07-01) — CommunityLinkDetailView

## Objectif
iOS exclusivement. Rendre `CommunityLinkDetailView` (détail d'un lien communautaire) compatible
Dynamic Type : migrer 9/10 `.font(.system(size:))` → `MeeshyFont.relative(...)`, garder figé le
seul glyphe héros non-scalable (cercle fixe 60×60), et améliorer VoiceOver (masquage glyphes
décoratifs, regroupement cartes stat, trait `.isHeader`).

## Base de départ
`main` HEAD (`5deacf76`, post-#1236). Branche assignée `claude/upbeat-euler-rod5v3`, resync sur
`origin/main` au démarrage (protocole branch-tracking). Surface disjointe de toute PR ouverte.

## Contexte de contention
Essaim d'agents iOS parallèles (~12 PR ouvertes). Surfaces prises : SupportView, AffiliateView (×3),
EffectsPicker, AddParticipantSheet, NotificationSettingsView, TwoFactorSetupView, SharePickerView (×2),
MemberManagementSection, LocationPickerView (×2), ConversationPreferencesTab, NewConversationView.
`CommunityLinkDetailView` = **aucune PR** → choisi pour zéro collision. `94i` saturé → **95i**.

## Étapes
1. [x] Diagnostic contention (`list_pull_requests`) + resync branche sur `origin/main`.
2. [x] Choisir surface disjointe `CommunityLinkDetailView` (10 sites, sœur de `CommunityLinksView`/91i).
3. [x] Migrer 9 sites texte/glyphes → `MeeshyFont.relative(size, weight:, design:)`.
4. [x] Garder figé le glyphe héros 60×60 (l. 35) + commentaire + `.accessibilityHidden`.
5. [x] VoiceOver : masquer 3 glyphes décoratifs, `.combine` sur `communityStatCard`, `.isHeader` sur en-tête section.
6. [x] Vérifier : 9 `relative` + 1 `.system` figé = 10.
7. [x] Docs analyse + plan (`-95i-community-detail`) + entrée `branch-tracking.md`.
8. [ ] Commit + push `claude/upbeat-euler-rod5v3`.
9. [ ] Ouvrir PR vers `main`, attendre CI `ios-tests.yml` verte.
10. [ ] Merger dans `main`, supprimer la branche mergée, mettre à jour le pointeur.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n, 0 test neuf (sweep pur + traits déclaratifs).
- Style iOS déjà en place (palette tokenisée + i18n catalogue) → préservé.
- `MeeshyFont` déjà résoluble via `import MeeshySDK` (jeu d'imports identique à la sœur 91i).

## Gate
CI `ios-tests.yml` (compile Xcode 26.1.x + tests simulateur iOS 18.2). Merge dans `main` après CI verte.
