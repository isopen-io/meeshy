# Itération 282 — `customDestinationLanguageCode` admet un code 639-3 région-taggé (borne `.max(6)`, parité SSOT)

Jumelle de l'itération 266 (`docs/routine/analyses/2026-08-25-iteration-266-langcode-max6-analyse.md`), qui avait propagé `.max(5)→.max(6)` à neuf frontières de langue de contenu et déclaré la classe « fermée ». Un dixième site avait échappé au grep de clôture.

## État actuel

Le Prisme Linguistique résout le contenu par ordre de priorité (`resolveUserLanguage`, `packages/shared/utils/conversation-helpers.ts`) :
1. `systemLanguage` · 2. `regionalLanguage` · 3. **`customDestinationLanguage`** · 4. `deviceLocale` · 5. `'fr'`.

Le champ de priorité 3, `customDestinationLanguage`, est validé au write boundary par le schéma `customDestinationLanguageCode` (`packages/shared/utils/validation.ts:107`). Contrairement à `supportedLanguageCode` (priorités 1-2, gardé par `.refine(isSupportedLanguage)`), il n'exige PAS que le code soit supporté — seulement une longueur + une `.transform` normalisante via le SSOT `normalizeLanguageCode`, précisément pour accepter un locale de plateforme région-taggé (`'fr-FR'` → `'fr'`) et le canonicaliser avant persistance.

Sa borne était `.min(2).max(5)`. Son jumeau, `CommonSchemas.language` (`validation.ts:178`), porte `.max(6)` — et son commentaire (lignes 168-177) documente POURQUOI : `.max(5)` « contredisait la regex et rejetait la forme 639-3 + région (`bas-CM` = `[a-z]{3}` + `-` + `[A-Z]{2}` = 6 chars) ».

## Problème identifié

`normalizeLanguageCode('bas-CM')` rend correctement `'bas'` (langue camerounaise officiellement supportée, 639-3 sans équivalent 639-1, préservée verbatim — documenté `language-normalize.ts:84`). Mais `.max(5)` tombe **avant** la `.transform` : une charge `{ customDestinationLanguage: 'bas-CM' }` lève une `ZodError` (`too_big`, `<=5`) → **HTTP 400**.

Un utilisateur dont la locale appareil expose `'bas-CM'` (ou `'ewo-CM'`, `'ksf-CM'`, `'nnh-CM'`, `'dua-CM'`) **ne peut littéralement pas régler sa langue de destination personnalisée** — l'exclusion silencieuse exacte d'une population officiellement supportée que l'itération 266 prétendait avoir fermée pour toutes les langues de contenu.

### Producteur ↔ consommateur (pourquoi c'est réel)
- **Producteur (write boundary)** : `services/gateway/src/routes/users/profile.ts` → `updateUserProfileSchema.parse(request.body)`. La route Fastify ne déclare aucun schéma de body ; ce parse Zod est l'**unique** portillon. `updateUserProfileSchema.customDestinationLanguage` (`validation.ts:373`) et `UserSchemas.update.customDestinationLanguage` (`validation.ts:293`) référencent tous deux `customDestinationLanguageCode`.
- **Consommateur** : `customDestinationLanguage` persisté alimente `resolveUserLanguage` (priorité 3) sur les trois clients.

## Cause racine

L'itération 266 a vérifié sa clôture par `grep 'min(2).max(5)'` (mono-ligne). `customDestinationLanguageCode` (et `supportedLanguageCode`) écrivent `.min(2)` et `.max(5)` sur des lignes **séparées** — le grep ne les a jamais vus. Les neuf sites corrigés portaient tous `.min(2).max(5)` sur une seule ligne.

## Périmètre — un seul défaut vivant

`supportedLanguageCode` (`validation.ts:86`, priorités 1-2) porte le même `.max(5)` sur deux lignes, MAIS il est gardé par `.refine(isSupportedLanguage)`, et `isSupportedLanguage('bas-CM')` est `false` (cache clé sur `'bas'`, pas `'bas-cm'`) : un code région-taggé y est rejeté par conception, borne ou pas. Ce n'est **pas** un bug vivant — laissé inchangé pour garder le périmètre minimal. Le seul défaut prouvable est `customDestinationLanguageCode`.

## Impact

- **Métier** : un utilisateur d'une langue camerounaise supportée ne peut pas configurer sa langue de destination personnalisée depuis une locale région-taggée. Silencieux (400), donc non diagnostiqué.
- **Technique** : jumelle divergente d'une SSOT documentée ; dette de cohérence (dimension 6) + complétude (dimension 13, langue manquante).
- **Risque** : nul — la borne ne fait que s'**élargir**. Aucun code aujourd'hui accepté ne devient rejeté (garde anti-sur-élargissement : 7 chars toujours refusé).

## Amélioration proposée

`packages/shared/utils/validation.ts:110` — `.max(5)` → `.max(6)`, miroir de `CommonSchemas.language`. Commentaire de schéma mis à jour citant la raison (longueur max de la forme 639-3 + région) et la cause du miss (borne sur deux lignes).

## Critère de validation

- **RED prouvé** : `updateUserProfileSchema.parse({ customDestinationLanguage: 'bas-CM' })` levait `too_big (<=5)` avant.
- **GREEN** : rend `'bas'` après (transform réduit `'bas-CM'` → `'bas'`).
- **Anti-sur-élargissement** : `'abcd-CM'` (7 chars) toujours rejeté.
- Suite `vitest` shared complète verte (2704 tests), `tsc --noEmit` exit 0.

## Dimensions (roadmap treize dimensions)

6 Cohérence (parité SSOT des bornes de langue), 11 Maintenabilité (aucune jumelle divergente), 13 Complétude (langue supportée enfin réglable).
