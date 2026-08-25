# Itération 266 — Analyse : la borne `.max(5)` des codes de langue rejouait, dans neuf schémas, la régression que la SSOT avait fermée

> Note de coordination : deux sessions sœurs portaient déjà un lot étiqueté
> « It. 266 » (#3500 `isPrivateIp`/IPv6, #3497 e2ee `skipMessageKeys`). Ce lot-ci
> est disjoint (validation de forme des codes de langue) et nommé
> `iteration-266-langcode-max6` pour éviter toute collision de fichier au merge.

## État courant

`CommonSchemas.language` (`packages/shared/utils/validation.ts:178`) est la SSOT
de la forme d'un code de langue accepté à une frontière d'entrée :

```ts
language: z.string().min(2).max(6).regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Code langue invalide'),
```

Son commentaire (lignes 168-177) DOCUMENTE une régression déjà corrigée : la
borne avait été **délibérément élargie de `.max(5)` à `.max(6)`** parce que
`.max(5)` contredisait la regex et rejetait la forme ISO 639-3 + région
(`bas-CM`, `ewo-CM`, `ksf-CM` — langues camerounaises officiellement supportées,
préservées verbatim par `normalizeLanguageCode`, 6 caractères).

Le correctif de la SSOT n'avait atteint **aucune** des copies de cette borne.
Neuf champs de langue, client-contrôlés, portaient encore `.min(2).max(5)` :

| # | fichier | champ | couche |
|---|---|---|---|
| 1-2 | `services/gateway/src/routes/translation.ts` | `source_language`, `target_language` | Zod **et** schéma Fastify (`maxLength: 5`) |
| 3-4 | `services/gateway/src/routes/translation-non-blocking.ts` | `source_language`, `target_language` | Zod **et** schéma Fastify |
| 5 | `services/gateway/src/validation/socket-event-schemas.ts` | `SocketTranslationRequestSchema.targetLanguage` | Zod (schéma orphelin — piège armé) |
| 6-7 | `services/gateway/src/routes/posts/types.ts` | `CreatePostSchema.originalLanguage`, `TranslatePostSchema.targetLanguage` | Zod |
| 8-12 | `packages/shared/utils/validation.ts` | `MessageSchemas.send/edit.originalLanguage`, `TranslatedAudioSchemas.request.targetLanguage`, `VoiceModelSchemas.create.language`, `AnonymousParticipantSchemas.join.language` | Zod |

Cinq des copies vivent **dans le fichier même de la SSOT**, à quelques centaines
de lignes du commentaire qui explique pourquoi `.max(5)` est faux.

## Problèmes identifiés

1. **Une régression documentée comme fermée était rouverte en neuf exemplaires.**
   Un client demandant une traduction (`target_language: 'bas-CM'`), publiant un
   post dans une langue régionalisée, créant un modèle vocal ou rejoignant en
   anonyme dans un de ces codes recevait un **400** à la frontière — pour une
   langue que la plateforme supporte de première classe.
2. **Deux couches de refus sur les routes REST de traduction.** Le schéma Fastify
   (`maxLength: 5`, validé par AJV **avant** le handler) ET le schéma Zod
   (`.max(5)`, dans le handler) rejetaient tous deux le code — corriger un seul
   n'aurait rien changé.
3. **Un piège armé** (`SocketTranslationRequestSchema`, sans consommateur de
   production aujourd'hui) : le jour où quelqu'un le câble, il rejette
   silencieusement les mêmes codes.

## Causes racines

C'est la forme exacte de la leçon 261 du dépôt : *une énumération de sites porte
deux affirmations — « ces sites appliquent la règle » et « ce sont les sites où
la règle s'applique »*, la seconde presque jamais vérifiée. La SSOT a été
élargie ; personne n'a demandé *qui d'autre borne un code de langue ?*. Et la
leçon corollaire : **le Prisme s'applique à TOUT le contenu** (§ Cohérence du
`CLAUDE.md`) — messages, audio, posts, modèles vocaux, participants anonymes —
donc la classe ne se ferme pas sur les seules routes de traduction.

## Impact métier

Un utilisateur d'une langue camerounaise régionalisée (`bas-CM`, `ewo-CM`,
`ksf-CM`, `nnh-CM`, `dua-CM`) ne pouvait pas : demander une traduction vers cette
langue (REST bloquant/non-bloquant), publier un post en la déclarant comme langue
d'origine, en demander la traduction, créer un modèle vocal dans cette langue, ni
rejoindre une conversation anonyme dans cette langue. Exclusion silencieuse (400)
d'une population de locuteurs officiellement supportée.

## Impact technique

Aucune valeur de retour légitime ne change : le correctif est **purement
élargissant** (`.max(5)` → `.max(6)`). Toute entrée acceptée avant l'est encore ;
seules des entrées jusque-là refusées à tort (codes 6 caractères) sont désormais
admises. Aucun rétrécissement, donc aucun risque de régression sur les clients
existants.

## Évaluation du risque

**Faible.** Changement additif d'une borne de longueur, sans nouvelle regex (voir
« Alternative rejetée »). Type-check gateway + shared verts ; suite shared
complète (2612) verte ; suites gateway validation (359) + traduction + posts
vertes.

## Améliorations proposées (livrées)

- Aligner les neuf champs sur `.max(6)`, plus les deux `maxLength: 5` des schémas
  Fastify des routes de traduction.
- Ajouter des témoins qui TOMBENT sous l'ancien `.max(5)` : trois par la
  frontière réelle (`app.inject` traverse AJV **et** Zod), un par schéma partagé
  (vitest), plus les gardes « toujours refuser 7 caractères » pour prouver
  l'absence de sur-élargissement.

### Alternative rejetée : réutiliser `CommonSchemas.language` (avec sa regex)

La consolidation SSOT « pure » serait de remplacer chaque borne par
`CommonSchemas.language`. Elle a été écartée : la regex `^[a-z]{2,3}(-[A-Z]{2})?$`
**rétrécit** le comportement de ces champs — elle rejetterait le sentinelle
`'auto'` (lu par `translation.ts` : `messageSourceLanguage !== 'auto'`), les codes
en casse haute (`'FR'`) et les régions en minuscules (`'en-us'`) que les bornes
actuelles admettent. Rétrécir une frontière de validation est exactement le
changement de comportement que les leçons du dépôt signalent comme source de
régressions non mesurées. Le DÉFAUT documenté est la borne de LONGUEUR ; on la
corrige, et on ne mêle pas à ce lot une décision produit sur la tolérance de
forme.

## Bénéfices attendus

- Les locuteurs des langues régionalisées supportées ne sont plus exclus.
- La classe `.max(5)` est CLOSE : plus aucune copie ne reste (vérifié par grep sur
  `services` + `packages`).
- Le piège armé du schéma socket orphelin est désamorcé.

## Complexité d'implémentation

Triviale — onze bornes numériques + descriptions OpenAPI, aucun nouveau module.

## Critères de validation

- [x] Témoins RED d'abord (3 gateway + 1 shared échouent sous `.max(5)`).
- [x] Tous verts après correctif.
- [x] `tsc --noEmit` gateway = 0, shared = 0.
- [x] `vitest run` shared = 2612 verts ; `jest` gateway validation = 359 verts,
      traduction + posts/types verts.
- [x] `grep 'min(2).max(5)'` sur `services` + `packages` = plus aucune occurrence
      de code de langue.
