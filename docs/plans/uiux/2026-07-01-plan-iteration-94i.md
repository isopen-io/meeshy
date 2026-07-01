<<<<<<< claude/upbeat-euler-8v1yh3
# Plan — Itération 94i (iOS)

**Cible** : `apps/ios/Meeshy/Features/Main/Views/SharePickerView.swift` (« Partager avec... »).
**But** : conformité Dynamic Type + VoiceOver, sans changer layout par défaut / logique / palette.

## Étapes
1. [x] Resync sur `main` HEAD ; brancher `claude/upbeat-euler-8v1yh3`.
2. [x] Anti-collision via `list_pull_requests` → `SharePickerView` non prise ; label 94i > 93i.
3. [x] Migrer 13/15 `.font(.system(size:))` → `MeeshyFont.relative(...)` (weight préservé).
4. [x] Garder 2 glyphes de contrôle 26pt figés (checkmark/paperplane slot d'action) + commentaires.
5. [x] VoiceOver : `.accessibilityElement(children: .combine)` bannière + rangée ;
       `.accessibilityHidden(true)` icône type / loupe / puce ; `.accessibilityLabel(share.sent)` checkmark.
6. [x] i18n : ajouter `share.sent` (5 langues) en texte brut, sans reformater le catalogue.
7. [x] Docs analyse + plan + `branch-tracking.md`.
8. [ ] Commit + push + PR ; gate CI `iOS Tests` ; merge dans `main` ; supprimer la branche.

## Contraintes respectées
- Un seul fichier de production + une entrée catalogue.
- 0 logique, 0 test neuf (parité sweeps précédents).
- SDK non touché (`MeeshyFont`/`MeeshyColors` déjà ré-exportés via `MeeshyUI`, déjà importé).
- Palette déjà tokenisée → aucun swap.

## Suite (95i+)
`MemberManagementSection` (17) · `AddParticipantSheet` (14) · `ForwardPickerSheet` (9) ·
`ConversationView+Composer` (22, prudent) · Glass `MessageOverlayMenu` (21).
=======
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
# Plan — Itération 94i (iOS)

**Objectif** : rendre `MemberManagementSection.swift` conforme Dynamic Type + VoiceOver, sans
changer le layout par défaut, la logique, la palette ni les chaînes i18n.

## Cible
`apps/ios/Meeshy/Features/Main/Components/MemberManagementSection.swift` (17 sites `.system(size:)`).
Surface du différé prioritaire 91i+ ; non prise par les PR iOS en vol (91i→93i).

## Étapes
1. [x] Resync branche sur `main` HEAD (`6b8abcb`), supprimer/recréer la branche de travail.
2. [x] Anti-collision `list_pull_requests` → `MemberManagementSection` libre. Numéro 94i.
3. [x] Migrer 15 sites texte-de-lecture + glyphes inline appariés → `MeeshyFont.relative(...)`
   (weight/design préservés).
4. [x] Garder 2 sites figés & commentés : `ellipsis` 32×32 (chrome tap-frame, 82i),
   `person.slash` 28pt (hero décoratif état-vide, 90i).
5. [x] VoiceOver : `.accessibilityLabel(accessibility.clear_search)` sur ✕ ; `.isHeader` +
   `.combine` sur en-tête « MEMBRES » ; `.accessibilityHidden` sur glyphes décoratifs ;
   `.combine` sur état vide.
6. [x] Vérifier 15 relative + 2 fixed = 17. 0 logique / 0 clé i18n neuve / 0 test neuf.
7. [x] Docs analyse + plan + `branch-tracking.md`.
8. [ ] Commit, push, PR. Gate = CI `iOS Tests`.
9. [ ] Merge dans `main` une fois CI vert ; supprimer la branche.

## Contraintes
- Aucune modification de logique/état/navigation.
- Palette déjà tokenisée → intacte (hex `F8B500` = teinte catégorielle de rôle, hors-scope 69i/89i).
- SwiftUI ne compile pas sous Linux → validation = CI iOS.

## Suite (95i+)
`ConversationView+Composer` (22, prudent), `StoryViewerView+Content` (31, i18n #1174),
`AboutView` (16), `CommunityLinkDetailView` (10) ; Glass `MessageOverlayMenu` (21).
>>>>>>> main
