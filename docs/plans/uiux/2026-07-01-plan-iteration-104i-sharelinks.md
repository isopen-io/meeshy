# Plan — Iteration 104i (2026-07-01) — ShareLinksView

## Objectif
iOS exclusivement. Accessibilité de `ShareLinksView` (« Liens de partage ») :
- migrer les 3 glyphes actionnables `.font(.system(size:))` → `MeeshyFont.relative(...)` ;
- garder figés les 4 glyphes chrome/décoratifs/contraints (+ commentaires + `.accessibilityHidden`) ;
- **combler un vrai défaut VoiceOver** : le bouton copier icône-seule n'avait aucun `.accessibilityLabel` ;
- combiner les cartes de stats + trait `.isHeader` sur l'en-tête de section.

## Base de départ
`main` HEAD (`5a47053b`, post-#1240 et suivants). Branche `claude/upbeat-euler-spied4` resync sur
`origin/main` (après fermeture de la PR 99i #1276 superseded par #1272).

## Contexte de contention
Course perdue deux fois sur `CommunityLinkDetailView` (99i #1276 fermée superseded par #1272 ;
idem #1274/#1292). Leçon : re-check `list_pull_requests` **juste avant push** + choisir une
surface `raw>0 / relative=0` non prise. PR ouvertes : #1292 (`AudioFullscreenView` 103i), #1290
(web), #1289 (`EditPostSheet` 100i). `ShareLinksView` non prise. Numéro **104i** (> 103i).

## Étapes
1. [x] Constat supersede 99i, cleanup cron + désabonnement PR #1276.
2. [x] Resync sur `origin/main` ; grep-scan `raw>0 / relative=0` → surfaces non migrées.
3. [x] Écarter surfaces prises/risquées (Story/Composer/Bubble) ; choisir `ShareLinksView`.
4. [x] Migrer 3 glyphes actionnables → `MeeshyFont.relative`.
5. [x] Figer 4 glyphes chrome/décoratifs + commentaires + `.accessibilityHidden`.
6. [x] `.accessibilityLabel(common.copyLink)` sur le bouton copier (défaut réel comblé, 0 clé neuve).
7. [x] `.accessibilityElement(.combine)` cartes stats + `.isHeader` en-tête « MES LIENS ».
8. [x] Vérifier : 3 relative + 4 `.system` figés = 7 ; clé `common.copyLink` existante.
9. [x] Re-check `list_pull_requests` juste avant push → `ShareLinksView` toujours non prise.
10. [x] Docs analyse + plan (`-104i-sharelinks`) + entrée `branch-tracking.md`.
11. [ ] Commit + push `claude/upbeat-euler-spied4`.
12. [ ] Ouvrir PR, attendre CI `iOS Tests` verte, merger dans `main`, supprimer la branche.

## Contraintes respectées
- 1 fichier de production, 0 logique, 0 clé i18n neuve (`common.copyLink` réutilisée), 0 test neuf.
- Palette déjà tokenisée + texte déjà en polices sémantiques → intacts.
- `MeeshyFont`/`MeeshyColors` via `@_exported import MeeshyUI` → 0 import ajouté.

## Gate
CI `ios-tests.yml`. Merge dans `main` après CI verte.
