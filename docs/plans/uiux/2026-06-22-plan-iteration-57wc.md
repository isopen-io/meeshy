# Plan — Itération 57wc (web)

## Contexte
Base : `main` HEAD `657e588` (post-#774 iter-57w ReelPlayer, #780 iter-57wb
ReelsFeedScreen, #776 iter-56wb error-color, #771 iter-56w dialogues). La veine
i18n-FR est **saturée par les agents parallèles** (3 collisions de numéro déjà
sur ce run : #770 doublon de #771 ; 57w pris par #774 ; 57wb pris par #780).
Cette itération reste sur une **veine distincte : accessibilité (a11y)** et se
numérote **57wc**.

## Périmètre (web only) — a11y WCAG 2.1 niveau A
`components/dashboard/CreateGroupModal.tsx` (liste « Utilisateurs disponibles »).
Chaque rangée utilisateur sélectionnable est un `<div role="button" tabIndex={0}>`
avec handlers clavier (Enter/Space) **mais sans `aria-label` ni `aria-pressed`** :
les lecteurs d'écran annoncent un « button » anonyme, sans dire QUI est
sélectionné ni l'état coché. Violation WCAG 2.1 §4.1.2 (Name, Role, Value).

## Approche
- `aria-pressed={isSelected}` (état) + `aria-label` nommant l'utilisateur et
  l'action (Sélectionner/Désélectionner {name}).
- **i18n** via `t()` (`useI18n('dashboard')` déjà présent) — PAS de FR figé,
  contrairement au pattern hérité de `CommunitySelectionStep.tsx`.
- Réutilise le pattern de clé existant `createGroupModal.removeMember "{name}"`.
- 2 clés neuves `dashboard.createGroupModal.{selectMember,deselectMember}` ×4
  locales (param `{name}`).

## Clés ajoutées (×4 locales en/es/fr/pt)
- `dashboard.createGroupModal.selectMember` = `Select {name}`
- `dashboard.createGroupModal.deselectMember` = `Deselect {name}`

## Validation
- `tsc --noEmit` : 0 erreur sur `CreateGroupModal.tsx`.
- `__tests__/app/dashboard/page.test.tsx` : 36/36 verts.
- Parité ×4 locales vérifiée + JSON valide.

## Suite (58w+)
- `components/conversations/conversation-item/ConversationItem.tsx:205` — même
  défaut a11y (`role="button"` non labellisé), blast radius plus large, **pas de
  test** → vérifier l'état après merges parallèles avant de traiter.
- `CommunitySelectionStep.tsx` : labels a11y FR figés → i18n au passage.
- `PostsFeedScreen` (suite feed i18n), `app/settings/loading.tsx` (server
  component), console.error FR, `next-themes` orphelin.
