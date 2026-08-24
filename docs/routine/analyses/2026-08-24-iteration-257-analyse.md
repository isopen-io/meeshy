# Analyse — Itération 257 : la surface COMMENTAIRES (+ STATUS) restait au rang 1 du Prisme

## Protocole (démarrage)

`main` @ `cba70d47` (dernier commit : `Merge PR #3444 — cycle 122 : la réponse et
la mention n'appliquaient AUCUN Prisme`). Branche `claude/brave-archimedes-vp5myc`
réalignée sur `origin/main` (0 avance / 0 retard). Itération 256 (borne stricte
`time-range`) mergée via PR #3409.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate` + `bun run build` dans `packages/shared`
(exit 0). Runner web (`next/jest`, SWC) vérifié vert sur une suite témoin.

**Audit anti-doublon** (PRs ouvertes) : #3454 (`claude/keen-hamilton-rgj2yp` —
gateway/notifications, bannière serveur), #3455 (Android stories), + file
Dependabot. **Aucune ne touche `apps/web/components/v2/{CommentItem,CommentThread,
CommentList,StatusBar}.tsx` ni les hôtes web ciblés** — zéro chevauchement.

## Sélection : **Priorité 1 — feature récemment modernisée dont le câblage était resté à moitié**

Suivi NOMMÉ dans `CLAUDE.md` (§ Prisme, cycle 120) et dans `use-post-translation.ts` :
> « Les COMMENTAIRES (`CommentList`→`CommentItem`), STORIES (`StoryViewer`) et
> STATUS (`StatusBar`) reçoivent encore un `userLanguage` unique — corrects mais
> pas encore conscients du rang. »

`TranslationToggle` sait DESCENDRE le prisme ordonné depuis le cycle 120 (prop
`preferredLanguages`), et les surfaces POSTS (`PostCard`, `PostDetail`) la passent.
La surface COMMENTAIRES ne passait toujours qu'`userLanguage` (rang 1) — donc
rang-aveugle.

## Current state (avant correctif)

`TranslationToggle` a DEUX modes d'auto-résolution :
- `preferredLanguages` fourni → il DESCEND le prisme (rangs 1→4 + fallback) et sert
  la première langue disponible (par traduction, ou parce que l'original est déjà
  écrit dedans, à son rang).
- `preferredLanguages` absent → repli historique sur `userLanguage` (rang 1 seul).

| surface | prop passée au toggle | rang-conscient ? |
|---|---|---|
| `PostCard` / `PostDetail` (contenu) | `preferredLanguages` | ✅ oui |
| `CommentItem` (via `CommentList`/`CommentThread`) | `userLanguage` seul | ❌ non |
| `StatusBar` (`StatusPopover`) | `userLanguage` seul | ❌ non |

`CommentList` est monté par TROIS hôtes — `PostDetail`, `StoryViewer`,
`ReelsFeedScreen` — tous fournissaient `userLanguage` uniquement. `StatusBar` est
monté par `PostsFeedScreen`, qui calcule déjà `preferredLanguages` (pour `PostCard`)
mais ne le passait pas à `StatusBar`.

## Problems identified

1. **Rang-aveuglité identique à celle corrigée pour les posts au cycle 120.** Un
   lecteur francophone (rang 1 = `fr`) dont le navigateur est en anglais (rang 4 =
   `en`, locale appareil — cas NOMINAL du Prisme étendu) voyait un commentaire
   espagnol EN ESPAGNOL alors qu'une traduction anglaise existait — pendant que le
   POST au-dessus, lui, servait l'anglais. `userLanguage='fr'` ne consulte jamais
   le rang 4 : pas de traduction `fr` ⇒ repli sur l'original.
2. **Divergence de comportement entre types de contenu voisins.** Le § Cohérence du
   Prisme exige que TOUT le contenu se résolve pareil. Post et commentaire, côte à
   côte, se résolvaient différemment.

## Root causes

Le cycle 120 a extrait `preferredLanguages` dans `TranslationToggle` et l'a câblé
sur les surfaces POSTS, en documentant explicitement que commentaires/stories/status
restaient à faire (« reçoivent encore un `userLanguage` unique »). La dette était
identifiée et bornée ; elle n'attendait que le câblage — même patron d'omission que
234→236 (`>=`) ou 121→122 (bannière serveur).

## Business impact

Un lecteur dont la langue applicative n'a pas de traduction mais dont la locale
appareil en a une (le cas nominal du Prisme étendu 2026-05-26) voyait des
commentaires et statuts en langue étrangère — friction linguistique que le Prisme
existe pour supprimer. Le correctif ferme cette friction sur DEUX des trois surfaces
restantes.

## Technical impact

- **Ajout PUREMENT additif** d'une prop `preferredLanguages?: string[]` sur
  `CommentItemProps`, `CommentThreadProps`, `CommentListProps`, `CommentRepliesProps`,
  `StatusBarProps`, `StatusPopoverProps` — threadée jusqu'au `TranslationToggle`.
- **Repli intact** : prop absente ⇒ comportement historique (`userLanguage`).
  Chaque site d'appel préexistant sans la nouvelle prop reste inchangé.
- **Câblage des hôtes** : `PostDetail` et `PostsFeedScreen` avaient DÉJÀ
  `preferredLanguages` en portée (pour posts / `PostCard`) — simple forward.
  `StoryViewer` l'avait aussi (pour `CanvasV3Scene`) — forward à sa `CommentList`.
  `ReelsFeedScreen` n'utilisait que `usePreferredLanguage()` (singulier) — ajout de
  `usePreferredLanguages()` (pluriel, déjà exporté).
- **Web `tsc --noEmit` : zéro erreur sur les 8 fichiers de production touchés**
  (les erreurs de baseline sont dans des fichiers de test a11y/admin non touchés).

## Risk assessment

- **Faible.** Aucune régression de comportement pour un lecteur dont le rang 1 EST
  disponible (le court-circuit du rang 1 rend le même verdict). Le changement n'est
  visible que quand le rang 1 manque ET qu'un rang inférieur existe — précisément le
  cas que le Prisme veut couvrir.
- **`StoryViewer` texte legacy (non-canvasV3) : SCIEMMENT laissé de côté.** Ce
  `TranslationToggle` a `showContent={false}` et l'hôte rend `story.content`
  (l'ORIGINAL) dans un `<p>` séparé, sans `onDisplayedChange`. Y descendre le prisme
  ferait dire « EN » à la pastille pendant que le texte reste espagnol — l'exacte
  incohérence pastille/texte que `onDisplayedChange` existe pour empêcher (docstring
  `TranslationToggle`). Le corriger proprement exige de câbler `onDisplayedChange`
  pour que l'hôte serve le texte résolu — changement plus large, hors périmètre.
- **Rollback :** retirer la prop des 6 types + les forwards ; le repli `userLanguage`
  reprend seul.

## Proposed improvements (réalisées)

1. **RED** : 3 tests (`__tests__/components/v2/prisme-rank-comment-status.test.tsx`)
   avec le VRAI `TranslationToggle` — commentaire/statut espagnol, traduction
   anglaise (rang 4) mais pas française (rang 1), prisme `['fr','en']` ⇒ doit servir
   « Hello world », jamais « Hola mundo ». Les 3 tombent avant le câblage.
2. **GREEN** : prop threadée `CommentItem`/`CommentThread`/`CommentList` +
   `StatusBar`/`StatusPopover`.
3. **Câblage des 4 hôtes** : `PostDetail`, `PostsFeedScreen`, `StoryViewer`,
   `ReelsFeedScreen`.

## Expected benefits

- Commentaires et statuts servent désormais la traduction du rang disponible le plus
  haut, comme les posts — un lecteur ne voit plus une langue étrangère quand une
  traduction de sa locale appareil existe.
- Cohérence de résolution entre post et commentaire affichés côte à côte.
- Deux des trois surfaces du suivi cycle 120 fermées ; il ne reste que le texte
  legacy de story (documenté ci-dessous).

## Implementation complexity

- **Faible.** 8 fichiers de production (6 threads de prop + 4 forwards d'hôte, dont 2
  fichiers cumulant les deux), +1 hook déjà exporté (`usePreferredLanguages`), +1
  fichier de test (3 cas).

## Validation criteria

- [x] RED prouvé : 3 tests tombent avant câblage (servaient « Hola mundo »).
- [x] GREEN : les 3 passent.
- [x] Régression v2 + story : **49 suites / 402 tests** verts.
- [x] Régression feed : **22 suites / 76 tests** verts.
- [x] `tsc --noEmit` : zéro erreur sur les 8 fichiers de production touchés.
- [ ] CI verte sur la PR (gate lint/bun réel — l'`eslint` local 10.8.1 crashe avec
      `eslint-plugin-react@7.37.5`, incompatibilité PRÉEXISTANTE du dépôt, tous
      fichiers confondus, sans rapport avec ce diff).

## Améliorations futures (hors périmètre)

- **`StoryViewer` texte legacy (non-canvasV3).** Câbler `onDisplayedChange` pour que
  l'hôte serve le texte résolu, PUIS descendre le prisme sur son
  `TranslationToggle` (`showContent={false}`). Seule des trois surfaces du suivi
  cycle 120 restée au rang 1, et pour une raison de fond (pastille/texte
  découplés), pas par simple omission.
- **Web COMMENTAIRES/STATUS — désormais rang-conscients ; STORIES partiellement.**
  Mettre à jour le tableau de `CLAUDE.md` (§ Prisme, famille posts/commentaires) et
  le suivi cycle 120 pour refléter la fermeture.
