# Iteration 95 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `90b75bdc` (« feat(story/composer): HistoryStore — pure state stack for global undo
(C9 inc.1) » — HEAD au démarrage, working tree propre). Branche de travail
`claude/brave-archimedes-h4tiq3` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

PR ouvertes au démarrage : **#1458** (Android — durable friend-request outbox, `apps/android`
uniquement). Disjointe des fichiers `packages/shared` + `apps/web` ciblés ici. Cible retenue :
**F57** (parké it.91→94, LOW) — dérive de frontière ASCII (`hasMentions`) vs Unicode
(`parseMentions`) dans le système de mentions, correction partagée + web vérifiable en vitest/jest.

## Cible : F57 — `hasMentions` (ASCII `\w`) sous-détecte les `@DisplayName` accentués

### Current state
Le système de mentions expose deux niveaux de détection qui doivent rester cohérents :

1. **`parseMentions`** (`packages/shared/utils/mention-parser.ts`) — la source de vérité qui
   résout un texte contre les participants. Sa détection de `@DisplayName` utilise des frontières
   **Unicode** : `(?<![\p{L}\p{N}_])@…(?![\p{L}\p{N}_])`. Un `@Éric`, `@André Tabeth`,
   `@Владимир` est donc bien reconnu et résolu.
2. **`hasMentions`** — le prédicat grossier « ce texte contient-il au moins une mention ? »,
   utilisé pour décider d'un traitement (highlight, hint de notification, gating d'un fetch).
   Il était implémenté en **ASCII** : `/@\w/` (`\w` = `[A-Za-z0-9_]`).

Résultat : `hasMentions('@Éric')` retournait **`false`** (le `É` n'est pas dans `\w` ASCII), alors
que `parseMentions('@Éric', participants)` **résolvait** bien la mention. Dérive de frontière
directe entre les deux fonctions du même module.

De plus, le prédicat était **dupliqué à l'identique 4 fois**, toutes en ASCII :
- `packages/shared/utils/mention-parser.ts` → `hasMentions` (`/@\w/`)
- `packages/shared/types/mention.ts` → `hasMentions` (`/@\w+/`)
- `apps/web/services/mentions.service.ts` → `hasMentions` (`/@\w+/`)
- `apps/web/services/messages.service.ts` → `hasMentions` (`/@\w+/`)

### Problems identified
- **Sous-détection des noms accentués / non-latins** : sur un produit **francophone-first** (noms
  courants `André`, `Éric`, `José`, `François`, `Zoé`, `Renée`…), tout `@DisplayName` à initiale
  accentuée était invisible pour `hasMentions` — l'UI dépendante (surbrillance, indice de mention)
  était silencieusement désactivée sur exactement la population de noms la plus fréquente en FR.
- **Dérive de frontière intra-module** : deux fonctions voisines (`parseMentions` Unicode /
  `hasMentions` ASCII) répondaient différemment à la même question « `@Éric` est-il une mention ? ».
- **Quadruple duplication** : un même prédicat réécrit 4 fois → toute correction devait être
  répliquée 4 fois (dette + risque de divergence future).

### Root cause
`hasMentions` et les frontières de `parseMentions` encodaient **deux jeux de caractères de nom
distincts** (`\w` ASCII vs `\p{L}\p{N}_` Unicode) au lieu d'un seul. Aucune source de vérité
unique pour « qu'est-ce qu'un caractère de nom ». Les copies web réimplémentaient le prédicat au
lieu de déléguer au partagé (violation du principe **Single Source of Truth**).

### Business impact
La mention est une affordance sociale/collaborative centrale (feed, commentaires, messages). Un
`@André` qui n'allume ni surbrillance ni indice de mention est un défaut de qualité perçu
immédiatement sur le geste social, sur la population de noms **la plus courante** de la base
utilisateurs francophone — surface où la finition compte comme différenciateur.

### Technical impact
- `mention-parser.ts` : introduction d'une constante unique `NAME_CHAR = '[\\p{L}\\p{N}_]'`, dont
  **dérivent** les frontières gauche/droite ET `hasMentions` (`new RegExp('@' + NAME_CHAR, 'u')`).
  Un seul jeu de caractères → dérive **impossible par construction**.
- `types/mention.ts` : `hasMentions` **délègue** à celui de `mention-parser` (import ciblé, arête
  `types → utils` unidirectionnelle, zéro cycle).
- `apps/web/services/{mentions,messages}.service.ts` : les deux copies `hasMentions` **délèguent**
  au partagé (`@meeshy/shared/types/mention`) — 2 duplications supprimées, drift Unicode corrigé.
- Zéro changement de comportement pour `parseMentions` : `\p{L}\p{N}_` était déjà sa frontière,
  seule la *provenance* (constante) change. Confirmé par 113 tests gateway `MentionService` verts.
- `extractMentions` (handles) laissé **inchangé** : les usernames sont ASCII par validation
  (`^[a-zA-Z0-9_-]+$`), l'extraction de handle ASCII est donc correcte — hors périmètre F57.

### Risk assessment
FAIBLE. Le seul élargissement de comportement est `hasMentions` qui retourne désormais `true` sur
un `@` suivi d'une lettre Unicode — un sur-ensemble strict de l'ancien comportement ASCII (aucun
cas passant de `true` à `false`). Le garde « `@` + espace = pas une mention » (adresse e-mail
`test@ domain`) reste vrai (`@` suivi d'un espace ne matche pas `NAME_CHAR`). `parseMentions`
inchangé. Aucun schéma, migration, API publique ni événement socket modifié.

### Proposed improvements
1. `NAME_CHAR` source unique dans `mention-parser.ts` ; frontières + `hasMentions` en dérivent.
2. `types/mention.ts` `hasMentions` délègue au partagé.
3. Les 2 copies web délèguent au partagé (dédup + fix Unicode).
4. Tests de régression : détection `@Éric` / `@André` / cyrillique ; non-détection `@ ` (e-mail).

### Expected benefits
- `@André`, `@Éric`, `@José`, `@Владимир` correctement détectés partout (partagé + web).
- Dérive de frontière éliminée par construction (un seul `NAME_CHAR`).
- Duplication 4→1 (source unique déléguée), dette réduite.

### Implementation complexity
FAIBLE — 1 constante + dérivation, 3 délégations, 4 fichiers de production, couverts par 4 tests
de régression neufs (2 shared, 1 par service web).

### Validation criteria
- [x] `hasMentions('@Éric')` / `'@André Tabeth'` / `'@Владимир'` → `true` (RED sans fix, GREEN après).
- [x] `hasMentions('test@ domain.com')` → `false` (garde e-mail préservé).
- [x] Suite `mention-parser` shared : 25/25 verte (22 existants + 3 neufs).
- [x] Suite shared complète : 1256/1256 verte, 43 fichiers, 0 régression.
- [x] `mentions.service` + `messages.service` web : 79/79 verts (76 existants + 3 neufs).
- [x] Gateway `MentionService` (parseMentions inchangé) : 113/113 verts.
- [x] `bun run build` shared (tsc) : 0 erreur (import `types → utils` propre).

## Candidats écartés ce cycle (documentés)
- **Unifier `extractMentions` (4 copies)** : les copies divergent sur la casse (web préserve, shared
  `types/mention` lowercase) et sont ASCII-correctes (usernames `^[a-zA-Z0-9_-]+$`). Unifier
  changerait un comportement observable hors périmètre F57 — reporté (candidat DRY futur, `-`
  non-`\w` mérite une passe dédiée).
- **Rendre les handles Unicode** : impossible — les usernames sont ASCII par validation
  (`normalize.ts`, `admin-user.ts`, `use-register-form.ts`). Le drift ne concerne que les
  `@DisplayName`, déjà couverts par `parseMentions`.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed` (aligne posts non-❤️ sur le chemin heart-absolu).
- **F58** (LOW) : comment-reaction `postType` STATUS/REEL collapse.
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
- **F60** (LOW, neuf) : unifier les 4 `extractMentions` (casse + support `-` dans les handles).
