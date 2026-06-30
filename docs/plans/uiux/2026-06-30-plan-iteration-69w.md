# Plan — Itération 69w (Web)

> **Scope** : `apps/web` exclusivement. Base : `main` HEAD (db5cf6e, post-#1082/68w). Branche : `claude/practical-fermat-vbsdvr`.

## Objectif
Solder le cluster d'accessibilité clavier du **modal de création de lien de conversation** : rendre opérables au clavier (Enter/Space), focusables et correctement exposés au lecteur d'écran tous les contrôles de configuration aujourd'hui souris-only. Catégorie « différé prioritaire 69w+ » du pointeur autoritaire 68w.

## Étapes
1. **Audit ciblé** `apps/web` (hors clusters 67w/68w) → liste rankée de `<div onClick>`/`role`-less. Cluster retenu : `create-link-modal/`. ✅
2. **LanguagesSection.tsx** : `CardHeader` repliable → `role="button"` + `tabIndex={0}` + `aria-expanded` + `onKeyDown` Enter/Space + `focus-visible`. ✅
3. **PermissionsSection.tsx** : idem. ✅
4. **SelectableSquare.tsx** (substitut de case réutilisé partout dans le modal) → `role="checkbox"` + `aria-checked` + `aria-label` + `aria-disabled` + `tabIndex` (−1 si disabled) + `onKeyDown` Enter/Space (no-op si disabled) + `focus-visible`. ✅
5. **Tests** : 2 nouvelles suites (16 cas) + non-régression. ✅
6. **CI vert** → merge `main` via PR → supprimer branche → MAJ branch-tracking. ⏳

## Contraintes
- 0 nouvelle clé i18n (libellés/titres existants = nom accessible).
- Pattern clavier identique à 67w/68w (inline `onKeyDown`, pas de hook partagé — aucun n'existe).
- Token `focus-visible:ring-ring` (standard shadcn, déjà utilisé `ui/button`, `ui/tabs`).
- Aucune modification de comportement souris (clic préservé, testé).

## Critères d'acceptation
- [x] En-têtes Langues/Permissions activables clavier + `aria-expanded`.
- [x] `SelectableSquare` = checkbox accessible (toutes ses instances).
- [x] jest ciblé 16/16 + non-régression 25/25.
- [x] `tsc --noEmit` 0 erreur sur le diff.
- [ ] CI verte sur la PR, merge `main`, branche supprimée.

## ✅ PLAN EXÉCUTÉ (69w — 2026-06-30)
Toutes les étapes de code/tests/docs faites. Reste : merge `main` après CI verte. Suite (70w+) : audit a11y clavier restant (admin agent Badges, AudioEffectsTimeline, details-sidebar, invite-user-modal) — cf. analyse 69w § différé.
**Objectif** : accessibilité clavier des cartes de communauté (`GroupCard`) sur `/groups` — solder l'anti-pattern `<div onClick>` souris-only signalé par le pointeur 68w (balayage hors video-calls/conversations).

## Étapes
1. [x] Audit transverse `<div>/<span>/<li>` + `onClick` sans `role`/`tabIndex`/`onKeyDown` (hors zones soldées 67w/68w) → cluster `GroupCard` (2 contrôles, 1 fichier, surface à fort trafic).
2. [x] `GroupCard.tsx` carte : `role="button"` + `tabIndex` + `aria-pressed` + `aria-label` + `onKeyDown` Enter/Space + `focus-visible`.
3. [x] `GroupCard.tsx` span copie identifiant : idem + `stopPropagation` clavier (la copie ne sélectionne pas la carte).
4. [x] i18n : 2 clés `groups.card.{openLabel,copyIdentifier}` ×4 locales (interpolation `{name}`/`{identifier}`).
5. [x] Type-safety : élargir `onCopyIdentifier` `MouseEvent` → `MouseEvent | KeyboardEvent` (GroupCard → GroupsList → groups-layout). Aucun cast.
6. [x] Test `__tests__/components/groups/GroupCard.test.tsx` (7 cas, vert).
7. [x] Type-check : 0 erreur sur fichiers modifiés.
8. [ ] Commit → push branche `claude/practical-fermat-8hpdmm` → PR → CI vert → merge `main`.

## Fichiers touchés
- `apps/web/components/groups/GroupCard.tsx` (fix a11y + i18n)
- `apps/web/components/groups/GroupsList.tsx` (type prop)
- `apps/web/components/groups/groups-layout.tsx` (signature handler)
- `apps/web/locales/{en,fr,es,pt}/groups.json` (+`card`)
- `apps/web/__tests__/components/groups/GroupCard.test.tsx` (nouveau)

## Backlog (itérations futures, non détaillé)
- `components/links/` cartes de liens extensibles cliquables.
- `components/contacts/` lignes de contact cliquables.
- `components/admin/` lignes de tableaux cliquables.
