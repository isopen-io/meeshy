# Analyse — Itération 262 : deux résolveurs web réécrivaient la descente du Prisme à la main (`.toLowerCase()`) au lieu de consommer `resolvePrismTranslation`

## Protocole (démarrage)

`main` @ `11f0c31e`. Branche `claude/brave-archimedes-k7v876` réalignée sur
`origin/main` au départ (0 devant / 0 derrière).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), `npx prisma generate --generator client` + `bun run build` dans
`packages/shared` (exit 0).

**Audit anti-doublon** (6 PRs ouvertes au départ : #3474 iOS NSE, #3473 gateway
recipient-language, #3472 gateway calls, #3471 gateway ObjectId SSOT, #3470 iOS
a11y, #3463 gateway pagination). **Zéro chevauchement** : les cinq PRs gateway/iOS
ne touchent aucun fichier de `apps/web/`. Ce lot est purement web/front — surface
disjointe.

## Sélection : **Priorité 1 — features récemment développées (Prisme de contenu web), défaut de justesse**

Le § « Règles critiques du Prisme (2026-08-10) » de `CLAUDE.md` a été construit sur
plusieurs cycles (118→124) autour d'une SSOT unique de la descente linguistique :
`resolvePrismTranslation()` (`packages/shared/utils/conversation-helpers.ts`), qui
rend `{ language, text } | null`. La règle est explicite :

> **La descente elle-même est UNE fonction** : `resolvePrismTranslation()`. Tout
> consommateur TS qui doit DIRE dans quelle langue il sert l'appelle plutôt que de
> réécrire la boucle : c'est la réécriture qui a produit trois familles divergentes
> en trois cycles.

Or **deux résolveurs de `apps/web` réécrivaient encore cette boucle à la main**, avec
un `.toLowerCase()` brut au lieu de la normalisation canonique
(`normalizeLanguageForDedup` : casse repliée **ET** région strippée). C'est le
« défaut mesuré » que la docstring de `resolvePrismTranslation` nomme mot pour mot
(lignes 182-196) — reproduit hors du résolveur.

## Current state (avant correctif)

| site | forme de la comparaison | conséquence |
|---|---|---|
| `apps/web/hooks/use-post-translation.ts` → `findTranslation()` | `code.trim().toLowerCase() === language`, `original.trim().toLowerCase()` | **texte affiché faux** |
| `apps/web/components/conversations/focal/focal-row-utils.ts` → `focalServedLanguage()` | `key.toLowerCase()`, `lang.trim().toLowerCase()` | **libellé de langue faux** |

### Problème 1 — POST/COMMENTAIRE : le texte servi est faux (Prisme #3)

`findTranslation` descend le prisme ordonné du lecteur mais compare les codes par
`.toLowerCase()`. Un code **région-tagué** — produit par le pipeline de traduction
(clé de carte) ou par un message écrit avant la canonicalisation au write-boundary
(`Message.originalLanguage`) — ne réduit jamais à son rang :

- Prisme `['en','fr']` (anglophone primaire), post `originalLanguage: 'en-US'`,
  carte `{ fr: 'Bonjour' }` : `'en-us' === 'en'` est **faux**, donc l'original ne
  court-circuite pas à son rang 1 ; la boucle matche `fr` et sert **« Bonjour »** à
  un lecteur anglophone dont le post est **déjà en anglais**. Rétrogradation exacte
  de la langue PRIMAIRE — la violation du Prisme #3.
- Clé de carte `{ 'pt-BR': 'Olá' }`, préférence `pt` : `'pt-br' !== 'pt'` → pas de
  match → l'original anglais est servi alors qu'une traduction portugaise existe.

### Problème 2 — FOCAL : le libellé de langue servie est faux

`resolveFocalMessageDisplay` a besoin du **texte** ET de la **langue** servie
(« affiché en fr, écrit en en »). Il appelait `resolveLastMessagePreview` (qui rend
le texte, correctement normalisé) **puis re-dérivait la langue** par une seconde
boucle, `focalServedLanguage`, en `.toLowerCase()`. Pour une clé `'pt-BR'` et une
préférence `'pt'` : `resolveLastMessagePreview` **sert bien** le texte portugais
(sa descente normalise), mais `focalServedLanguage` ne trouve pas `'pt'` (la clé est
`'pt-br'`), rend `undefined`, et le libellé retombe sur `originalLanguage`. Le fil
affichait donc **le texte portugais étiqueté « écrit en anglais »** — le méta que la
fonction existe pour fournir, faux.

## Root causes

1. **Duplication de la descente.** La carte des posts est
   `Record<string, { text }>` (objets), non le `Record<string, string>` du
   résolveur partagé — quelqu'un a réécrit la boucle au lieu d'adapter la seule
   FORME. Le motif d'adaptation correct existait déjà (`buildFocalTranslationsRecord`).
2. **Deux projections d'une seule descente.** Focal lisait le texte d'une descente
   (partagée, normalisée) et la langue d'une autre (locale, non normalisée). La SSOT
   expose déjà la PAIRE `{ language, text }` précisément pour ça.
3. **`.toLowerCase()` ≠ `normalizeLanguageForDedup`.** Le premier replie la casse ;
   le second replie la casse ET strippe la région. Pour comparer des codes dont les
   producteurs diffèrent (prefs lecteur vs pipeline vs write-boundary hérité), seul
   le second est correct.

## Business / Technical impact

- **Business** : un lecteur anglophone (ou tout lecteur dont un rang est
  région-tagué) voyait des posts/commentaires traduits alors que le contenu était
  déjà dans sa langue, ou l'inverse (original servi malgré une traduction
  disponible). Cas **nominal**, pas limite : la règle 2 du Prisme fait entrer la
  locale appareil (souvent région-taguée, `en-US`) au rang 4 pour tout lecteur dont
  l'appareil n'est pas dans sa langue applicative.
- **Technical** : divergence web ↔ iOS/Android (`APIPost.resolveTranslation`,
  `LanguageResolver.preferredTranslation` normalisent tous deux), et deux copies de
  la boucle à maintenir en phase avec la SSOT.

## Risk assessment

Faible. Refactor délégant à une fonction partagée déjà éprouvée et couverte ;
comportement rigoureusement préservé sur les codes déjà canoniques (idempotence de
`normalizeLanguageForDedup`). Aucun consommateur ne lisait un champ retiré
(`findTranslation` ne rendait que `.text`, utilisé seul ; `focalServedLanguage`
était privé et non exporté).

## Proposed improvements (implémentées)

1. `findTranslation` (posts) : aplatir la carte `{ code: { text } }` →
   `{ code: text }` et déléguer à `resolvePrismTranslation`. Retour `string | null`.
2. `resolveFocalMessageDisplay` (focal) : une SEULE descente
   `resolvePrismTranslation` → lire `{ language, text }` de la paire. Suppression de
   `focalServedLanguage` (boucle divergente).

## Scope EXCLU (honnête) — suivi laissé ouvert

**`apps/web/hooks/use-audio-translation.ts` → `resolveAutoLanguage()`** porte la
MÊME boucle `.toLowerCase()`, et le même défaut de rang sur une langue d'origine
région-taguée. Elle est **délibérément hors périmètre** parce que router la
sélection de PISTE audio par `normalizeLanguageForDedup` **change une sémantique**,
pas seulement un cas d'échec : la région strippée ferait matcher une préférence
`fr-CA` contre une piste vocale `fr-FR` (voix différente). Le retour est aussi la
clé stockée servant à retrouver la piste par égalité stricte (`currentAudioUrl`).
C'est un arbitrage **produit** (« une piste régionale voisine vaut-elle mieux que
l'original ? »), à instruire avec une décision sémantique — pas un refactor
behavior-preserving. Un témoin existant (`FR-CA`/`fr-ca`) fige déjà la préservation
du code stocké ; le migrer demande d'abord de trancher le cas `fr-CA`↔`fr-FR`.

## Expected benefits

- Justesse : posts/commentaires et libellé Focal respectent le Prisme #3 sur codes
  région-tagués. Parité web ↔ iOS/Android rétablie.
- Maintenabilité : deux copies de la descente supprimées ; une seule SSOT.

## Implementation complexity

Basse. 2 fichiers de production, ~30 lignes nettes, délégation à une fonction
existante.

## Validation criteria

- TDD RED→GREEN : 3 témoins neufs tombent avant, passent après.
- Suites focal (22/218) + feed + post-translation vertes.
- `tsc --noEmit` : mes fichiers 0 erreur (baseline pré-existante 1196 inchangée,
  mesurée par stash).
