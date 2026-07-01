# Plan itération 94i — `AffiliateView` Dynamic Type/VoiceOver + nettoyage merge `DataExportView`

**Base de départ** : `main` HEAD `99aefe6e` (post-91i/93i, forte contention parallèle).
**Branche** : `claude/upbeat-euler-pt8xxj` (resync sur `main`).
**Portée** : 2 fichiers iOS (1 cible + 1 correction), sweep + dédoublonnage.

## Objectif
1. Rendre l'écran Parrainage `AffiliateView` conforme Dynamic Type + VoiceOver, en comblant 4 boutons icône-only non étiquetés (vrais bugs a11y).
2. Nettoyer les artefacts de merge (`.combine` dupliqués, commentaire dupliqué, `.isHeader` redondant) laissés sur `DataExportView` par la fusion de deux itérations parallèles.

## Étapes
1. [x] Resync sur `main` ; constater la contention (90i×3, 93i) ; choisir **94i** (> plus haut).
2. [x] Vérifier `AffiliateView` non pris (0 commit/PR) → retenu.
3. [x] `AffiliateView` : migrer 16/17 `.system(size:)` → `MeeshyFont.relative` ; figer le héros vide 36pt.
4. [x] `AffiliateView` : ajouter 4 `.accessibilityLabel` (créer/copier/partager/supprimer, clés SSOT) + `.isHeader` (titre + section) + `.combine` (cartes stat) + `.accessibilityHidden` (glyphes déco).
5. [x] `DataExportView` : retirer les `.combine` dupliqués (infoCard, errorBanner), fusionner le commentaire de badge, retirer l'`.isHeader` interne redondant.
6. [x] Vérifier grep : Affiliate 1 figé/16 relative ; DataExport 3 combine légitimes / 2 isHeader / 1 commentaire.
7. [x] Docs analyse + plan + tracking.
8. [ ] Commit + push ; PR ; CI `iOS Tests` verte.
9. [ ] Merger dans `main`, supprimer la branche, mettre à jour le pointeur tracking.

## Risques
- **Compile** : `MeeshyFont`/`MeeshyColors` déjà résolus dans `AffiliateView` (ré-export transitif) → pas d'import ajouté. `.rounded` supporté par `relative(...design:)`.
- **Visuel** : cadence par défaut = tailles identiques → pas de régression.
- **Merge DataExport** : nettoyage pur, aucun changement de comportement VoiceOver net.

## Prochaines cibles différées (95i+)
`MemberManagementSection` (17) ; puis `StoryViewerView+Content` (31, ⚠️ collision i18n) et `ConversationView+Composer` (22, prudent) ; Glass `MessageOverlayMenu` (21). **Vérifier systématiquement `git log`/PR avant de prendre une cible** — forte contention iOS parallèle.
