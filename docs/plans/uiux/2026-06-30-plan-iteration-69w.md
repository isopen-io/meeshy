# Plan — Itération 69w (Web)

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
