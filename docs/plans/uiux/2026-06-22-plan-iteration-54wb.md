# Plan d'itération 54wb — i18n/a11y design-system v2 (composer/reply/audio)

**Date** : 2026-06-22 · **Périmètre** : Web (`apps/web`) · **Base** : `main` `8e9c95e` (rebasé sur #764)
**Branche** : `claude/practical-fermat-indb44` (assignée) → merge `main` après vérification.

> Numérotée `54wb` (collision avec une `54w` parallèle d'un autre agent — page story #764 ;
> périmètres disjoints, convention 49w/49wb).

## Objectif
Solder le différé i18n/a11y des building blocks v2 `PostComposer`, `ReplyPreview`,
`AudioPlayer` (suite de 53w `ConversationItem`). Logique épurée : aucune nouvelle UI,
uniquement bascule des chaînes dures vers `useI18n('common')` + réutilisation des clés existantes.

## Étapes
1. [x] Localiser et confirmer les chaînes dures (3 fichiers v2).
2. [x] Ajouter les clés sous `common` × 4 locales (en/fr/es/pt) :
   - `postComposer.{contentLabel,addPhoto,addVideo,changeVisibility,visibility.{public,friends,except,only,private}}`
   - `audioProgress`, `audioUnavailable`
   - réutilisées : `publish`, `play`, `pause`
3. [x] `PostComposer` : `label`→`labelKey` + `t()` sur libellés, aria-labels, bouton Publish.
4. [x] ~~`ReplyPreview`~~ → soldé en parallèle par 55w (#769) ; mon volet retiré du diff +
   clés `common.replyPreview.*` supprimées (anti-divergence).
5. [x] `AudioPlayer` : `useI18n('common')` en tête + `t()` sur 2 aria-labels + garde.
6. [x] Parité JSON vérifiée sur 4 locales (script) ; `replyPreview.*` retiré après rebase 55w.
7. [x] `tsc --noEmit` : 0 erreur sur les fichiers touchés (reste = bruit env. `@meeshy/shared` non buildé).
8. [x] Commit, push, PR #768, rebases successifs `main` (#767, #769), merge, MAJ branch-tracking.

## Risques / garde-fous
- `AudioPlayer` early-return avant hooks (pré-existant) : `useI18n` placé **avant** le return
  pour rester appelé inconditionnellement — ne pas déplacer après.
- Emojis conservés hors i18n (langue-agnostiques) — ne pas les traduire.
- **CI non déclenchable** par le token routine (voir analyse) → vérification locale + merge.

## Suite (55w+)
`components/v2/ReplyPreview` SOLDÉ. Reste cluster 53w : `AttachmentDeleteDialog.tsx`,
`auth/PhoneExistsModal.tsx`, autres aria-labels statiques v2 non audités.
