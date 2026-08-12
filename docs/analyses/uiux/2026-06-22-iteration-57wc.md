# Analyse — Itération 57wc (web)

## Revue de cohérence (étapes 1–3 de la routine)
- **Doublons analyses** : trois collisions de numéro gérées ce run, signe que la
  veine i18n-FR est saturée par les agents parallèles. (1) iter-56w
  `AttachmentDeleteDialog` livré par #771 → PR #770 **fermée sans merge**
  (doublon). (2) 57w pris par #774 (i18n `ReelPlayer`). (3) 57wb pris par #780
  (i18n `ReelsFeedScreen`). Ce travail **a11y** (CreateGroupModal), de périmètre
  disjoint, est renuméroté **57wc** (convention 49w/49wb, 54w/54wb, 56w/56wb).
- **Complétude plans** : cluster i18n « micro-surfaces FR » (53w) soldé ; surface
  reels (lecteur #774 + écran #780) entièrement i18n. Chaque issue 1→57wb est
  annotée dans `branch-tracking.md`.
- **Annotation** : `branch-tracking.md` mis à jour (état + history + deferred +
  les trois collisions).

## Problème traité — a11y : bouton de sélection non labellisé (WCAG 2.1 A)
`components/dashboard/CreateGroupModal.tsx` — dans la liste « Utilisateurs
disponibles », chaque rangée sélectionnable est :

```tsx
<div role="button" tabIndex={0}
     onClick={() => toggleUserSelection(user)}
     onKeyDown={/* Enter/Space */}>
  …avatar, nom, @username, ✓ si sélectionné…
</div>
```

→ `role="button"` + handlers clavier mais **aucun `aria-label`** (le rôle button
masque le contenu textuel aux lecteurs d'écran qui annoncent « button » nu) et
**aucun `aria-pressed`** (l'état coché ✓ n'est qu'un indice visuel, invisible en
audio). Violation WCAG 2.1 §4.1.2 (Name, Role, Value). Le composant sœur
`CommunitySelectionStep.tsx` fait correctement `aria-label`+`aria-pressed` —
incohérence d'accessibilité dans le même flux de création de communauté.

## Correctif
```tsx
aria-pressed={isSelected}
aria-label={t(
  isSelected ? 'createGroupModal.deselectMember' : 'createGroupModal.selectMember',
  { name: user.displayName || user.username }
)}
```
- **i18n** (pas de FR figé) : le label passe par `t()` (`useI18n('dashboard')`
  déjà présent). Le pattern hérité de `CommunitySelectionStep` utilise des FR
  durs — non répliqué ici, on fait mieux.
- 2 clés neuves `dashboard.createGroupModal.{selectMember,deselectMember}` (param
  `{name}`), miroir de la clé existante `removeMember "{name}"`, ×4 locales.

## Décisions
- Veine a11y choisie **délibérément** pour ne pas entrer en collision avec les
  agents parallèles concentrés sur l'i18n-FR (cf. 3 collisions de numéro).
- Param `{name}` sans fallback string (signature `t()` = params OU fallback) ;
  parité ×4 locales garantit zéro flash.

## Vérifié — NE PLUS re-flagger
- La rangée de sélection de `CreateGroupModal.tsx` est désormais accessible
  (`aria-label` + `aria-pressed`, i18n ×4 locales). `tsc` 0 erreur ;
  `__tests__/app/dashboard/page.test.tsx` 36/36 verts.

## Revue optimisation (étape 4) — a11y, opportunités repérées (différées)
- `components/conversations/conversation-item/ConversationItem.tsx:205` — même
  défaut (`role="button"` non labellisé), blast radius plus large mais **sans
  test** ; vérifier l'état post-merges parallèles avant 58w.
- Pattern de référence (à i18n-iser au passage) : `CommunitySelectionStep.tsx`
  (labels FR figés).
- Hors a11y : `PostsFeedScreen` (suite feed i18n), `app/settings/loading.tsx`
  (server component), console.error FR, `next-themes`.

## Statut
✅ Implémenté + vérifié (tsc + 36/36 tests) — itération 57wc.
