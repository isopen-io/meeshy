# Plan d'itération 52w — i18n libellés type conversation (Ranking admin)

**Date** : 2026-06-22 · **Périmètre** : Web only · **Base** : `main` HEAD

## Objectif
Solder le différé **49wb** : `getTypeLabel` (`ranking/utils.tsx`) renvoyait des
libellés FR durs, affichés tels quels aux admins EN/ES/PT.

## Étapes
- [x] Repérer le finding & ses appelants (`grep getTypeLabel` → 1 appelant :
      `ConversationRankCard`, qui a déjà `useI18n('admin')`).
- [x] Choisir le patron : `getTypeLabel(type, t)` aligné sur le local
      `AgentOverviewTab.getTypeLabel(type, t)` existant.
- [x] Ajouter `ranking.conversationType.{direct,group,public,broadcast,unknown}`
      × 4 locales (fr/en/es/pt) sous `admin`.
- [x] Threader `t` dans `getTypeLabel` + l'appel de `ConversationRankCard`.
- [x] Vérifier : jest ranking 30/30 ; `tsc` 0 erreur sur fichiers touchés.
- [x] Docs (analyse + plan + branch-tracking).

## Fichiers touchés
- `apps/web/components/admin/ranking/utils.tsx`
- `apps/web/components/admin/ranking/ConversationRankCard.tsx`
- `apps/web/locales/{fr,en,es,pt}/admin.json` (+7 lignes chacun)

## Hors périmètre (laissé en différé)
- `next-themes` orphelin (`package.json` + lockfile) — passe isolée.
- mocks jest `@meeshy/shared/encryption` — config jest isolée.
- deep links `/v2/chats?id=`, swipe-back mobile, audit dark admin (reste) —
  chantiers larges.

## Critère de succès
Badges de type de conversation du classement admin localisés dans les 4
langues ; tests verts ; diff minimal.
