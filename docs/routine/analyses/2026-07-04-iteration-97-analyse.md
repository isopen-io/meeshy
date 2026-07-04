# Iteration 97 — Analyse d'optimisation (2026-07-04)

## Protocole (démarrage)
`main` @ `3b06d9f5` (« feat(android/contacts): friends Room cache for cold-start paint (#1461) » —
HEAD au démarrage, working tree propre après `git reset --hard origin/main`). Branche de travail
`claude/brave-archimedes-spgzbe` recréée depuis `origin/main` (`git checkout -B … origin/main`),
0 commit non-mergé à préserver.

> **Renumérotation 96 → 97** : ce cycle avait initialement pris le n° 96, mais une itération
> parallèle (PR #1465, F58) a mergé ses propres `docs/routine/{analyses,plans}/…-iteration-96-*`
> sur `main` pendant le rebase. Pour ne pas écraser leur travail, ce document est renuméroté **97**.
> Leçon transverse (déjà notée par #1465) : vérifier `origin/main` juste avant de statuer un numéro
> d'itération ou un item de backlog — un cycle parallèle peut l'avoir consommé.

PR ouvertes au démarrage : **#1462** (gateway — TOCTOU race sur l'édition de message ;
`services/gateway/src/socketio/handlers/MessageHandler.ts` + `routes/messages.ts`, session tierce
en cours, CI pending). **Disjointe** des fichiers `packages/shared` ciblés ici — laissée à sa
session, aucun fichier partagé.

Le backlog F-series (F51→F60) est épuisé (F51→F57 traités it.90→95 ; F58/F59/F60 parkés). Revue
d'ingénierie fraîche via agent d'exploration ciblé sur les zones récemment développées
(`mention-parser`, résolveurs de langue, cache social, compteurs). Cible retenue : **F61 (neuf,
MEDIUM)** — dérive de frontière ASCII↔Unicode **résiduelle** dans `parseMentions`, jumelle exacte de
F57 (traité it.95) mais sur le path `@username` au lieu de `hasMentions`.

## Cible : F61 — le fallback `@username` de `parseMentions` utilisait une frontière gauche **ASCII** (`\w`) là où le path `@DisplayName` utilise la frontière **Unicode** (`NAME_BOUNDARY_LEFT`)

### Current state
`packages/shared/utils/mention-parser.ts` déclare (lignes 7-11) une **source de vérité unique** pour
la frontière d'un nom de mention :

```ts
const NAME_CHAR = '[\\p{L}\\p{N}_]';
const NAME_BOUNDARY_LEFT = `(?<!${NAME_CHAR})`;   // Unicode-aware
const NAME_BOUNDARY_RIGHT = `(?!${NAME_CHAR})`;
```

Le path `@DisplayName` (ligne 40) honore cette source de vérité :
`${NAME_BOUNDARY_LEFT}@${escapeRegex(p.displayName)}${NAME_BOUNDARY_RIGHT}` avec le flag `u`.

Mais le fallback `@username` (ligne 49, **avant ce cycle**) réimplémentait la frontière gauche **à la
main en ASCII**, sans flag `u` :

```ts
const handleRegex = /(?<![\w])@(\w{1,30})/g;   // \w = [A-Za-z0-9_], ASCII
```

Le but déclaré de cette frontière gauche (JSDoc ligne 19-20, tests `contact@marie.com`) est de
**rejeter les `@` internes d'adresses e-mail**. La garde ASCII ne tient que si le caractère qui
précède le `@` est ASCII. Si c'est une **lettre Unicode** (`é`, `à`, `ø`, cyrillique…), le
lookbehind ASCII **échoue silencieusement** et le `@` interne d'un e-mail est capturé comme une
mention.

### Problems identified
- **Faux positif de mention → mauvais utilisateur notifié.** Avec un participant `{ username:
  'atabeth' }`, `parseMentions('écris à André@atabeth.com', participants)` retournait `['u1']` :
  l'adresse e-mail `André@atabeth.com` était résolue comme une mention de l'utilisateur `atabeth`,
  qui recevait une notification de mention parasite. `Andre@atabeth.com` (ASCII `e`) retournait
  correctement `[]`. **Même entrée, une lettre accentuée d'écart, résultat opposé.**
- **Dérive de frontière intra-module résiduelle.** Deux paths voisins du même module répondaient
  différemment à « ce `@` est-il collé à un caractère de nom ? » — exactement la classe de bug F57,
  mais F57 n'avait unifié que `hasMentions` + le path `@DisplayName`, laissant ce fallback derrière.
- **Réimplémentation locale de `NAME_BOUNDARY_LEFT`** au lieu de réutiliser la constante déclarée
  source de vérité unique (violation Single Source of Truth affichée en tête de fichier).

### Root cause
La frontière gauche du fallback `@username` encodait un **second jeu de caractères de nom** (`\w`
ASCII) au lieu de réutiliser `NAME_BOUNDARY_LEFT` (Unicode). L'itération 95 (F57) a unifié
`hasMentions` et les frontières `@DisplayName` sur `NAME_CHAR`, mais la ligne 49 n'a pas été
migrée — dette de cohérence résiduelle.

### Business impact
La mention est une affordance sociale centrale (feed, commentaires, messages). Notifier un
utilisateur parce que son **username apparaît par hasard dans une adresse e-mail écrite après un
prénom accentué** (`André@…`, `José@…`, `François@…` — population de noms la plus fréquente en
francophone-first) est un faux positif visible, potentiellement gênant (notification non sollicitée,
« pourquoi suis-je mentionné ? »). La finition du geste social compte comme différenciateur.

### Technical impact
- 1 fichier production (`packages/shared/utils/mention-parser.ts`), 1 ligne changée + JSDoc alignée.
- Le comportement **se restreint strictement** : rejette davantage de faux positifs e-mail, ne
  change aucun cas de mention légitime (préfixée par espace / début de string / ponctuation
  non-nom). Le flag `u` laisse `\w{1,30}` en ASCII (usernames ASCII par validation — intentionnel)
  et n'upgrade que la frontière gauche en Unicode.
- Consommateurs de `parseMentions` (gateway `MentionService`, web) inchangés côté contrat.

### Risk assessment
**Très faible.** Changement chirurgical d'une ligne réutilisant une constante existante déjà éprouvée
sur le path voisin. Comportement strictement plus restrictif. RED-GREEN prouvé. Suite `packages/
shared` complète verte (1258 tests), `tsc` 0 erreur.

### Proposed improvements (implémenté ce cycle)
Remplacer le littéral regex ASCII par une construction qui réutilise `NAME_BOUNDARY_LEFT` :

```ts
const handleRegex = new RegExp(`${NAME_BOUNDARY_LEFT}@(\\w{1,30})`, 'gu');
```

### Expected benefits
- Zéro faux positif de mention sur adresse e-mail précédée d'une lettre Unicode.
- Parité de frontière totale entre les 3 détections du module (`hasMentions`, `@DisplayName`,
  `@username`) — un seul jeu de caractères, zéro drift résiduel.

### Implementation complexity
Triviale (1 ligne + JSDoc). Aucun changement de signature, d'import, ou de contrat public.

### Validation criteria
- [x] Test RED d'abord : `parseMentions('écris à André@atabeth.com', participants)` attendu `[]`,
      observé `['u1']` avant le fix (+ variante cyrillique `Влад@jcharlesnm`).
- [x] GREEN après fix : `__tests__/mention-parser.test.ts` 26/26 verts.
- [x] Non-régression : suite `packages/shared` complète 1258/1258 verte.
- [x] `bun run build` shared (tsc) : 0 erreur.
- [x] Tests web `hasMentions` (`mentions.service`, `messages.service`) : path non touché (prédicat,
      pas la résolution de handle) — aucun assert du comportement ancien.

## Candidats écartés ce cycle (documentés)
- **F58** (comment-reaction `postType` STATUS/REEL collapse) : **soldé en parallèle par PR #1465**
  (mergé sur `main` pendant ce cycle, Leçon 63-F58). Retiré du backlog.
- **F59** (divergence REST comment-like / socket comment-reaction) : réel mais dans
  `services/gateway/src/socketio/handlers/CommentReactionHandler.ts` + `NotificationService.ts` ;
  sévérité LOW. Reporté — itération gateway dédiée.
- **F62** (LOW, neuf, à confirmer) : `resolveUserLanguage` retourne les prefs in-app **brutes**
  (`'EN'`) là où `resolveUserLanguagesOrdered` les lowercase (`'en'`) ; `getRequiredLanguages`
  s'appuie sur le premier. Latent SI les prefs sont garanties lowercase à l'écriture — à confirmer
  par lecture de `normalize.ts` / points d'écriture avant fix. Reporté.

## Améliorations futures (report)
- **F51b** (LOW) : réécriture des docs `notifications/` (composition défunte, module fantôme).
- **F56b** (LOW) : symétriser le gateway pour émettre un `likeCount` absolu sur
  `post:reaction-added/removed`.
- ~~**F58**~~ : soldé par PR #1465 (mergé sur `main` ce cycle).
- **F59** (LOW) : REST comment-like vs socket comment-reaction notif type divergence.
- **F60** (LOW) : unifier les 4 `extractMentions` (casse + support `-` dans les handles).
- **F62** (LOW, neuf) : case drift `resolveUserLanguage` vs `resolveUserLanguagesOrdered` — à
  confirmer que c'est live et non latent avant d'agir.
