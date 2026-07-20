# Iteration 184 — `CommonSchemas.language` : validation de forme sans normalisation → corruption latente du Prisme sur `originalLanguage`

## Protocole (démarrage)
`main` @ `1615143` (derniers merges : #2132 shared/validators contrat honnête
attachmentTranslationsMapSchema (itér. 183), #2067 réduction ISO 639-3→639-1
explicite, vague ios/a11y #2101→#2130 pilotée par d'autres sessions). Branche
`claude/brave-archimedes-0wmrme` réinitialisée sur `origin/main`. Ce cycle prend
**184**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript. Le harnais **vitest de `packages/shared`** est opérationnel
(46 suites / 1368 tests verts, `tsc --noEmit` propre). La sélection se concentre
donc sur `packages/shared` où la validation est reproductible.

Point de départ : revue Priorité 1 (features récentes) + sweep d'un sous-agent
Explore sur les utilitaires purs de `packages/shared/utils/` et les validateurs
gateway récents. Le sweep a écarté (vérifiés sains) : `language-normalize.ts`
(table ISO_639_3_TO_1 exhaustivement correcte — les 62 cibles résolvent, les 56
codes 2-lettres sont atteignables, `fil`/`tgl` bien rejetés), `mention-parser.ts`
(pas de piège `lastIndex`), `email-validator.ts` (invariant préservé),
`calendar-date.ts` / `relative-time.ts` / `presence-visibility.ts` / gateway
`pagination.ts` (aucun off-by-one). Le **défaut net à haute confiance** est une
divergence SSOT sur la validation de la langue source — cible de cette itération.

## Current state
`CommonSchemas.language` (`packages/shared/utils/validation.ts:91`) valide le champ
`originalLanguage` des routes REST `sendMessage` / `editMessage`
(`routes/conversations/messages.ts:104`, `messages-advanced.ts:36`), consommées via
`SendMessageBodySchema.safeParse` / `EditMessageBodySchema.safeParse` (parse Zod
**runtime**, pas une conversion JSON-Schema Fastify).

Ancienne définition :
```ts
language: z.string().min(2).max(5).regex(/^[a-z]{2,3}(-[A-Z]{2})?$/, 'Code langue invalide'),
```

Elle **valide une forme** mais **ne normalise pas**, alors que la SSOT de
normalisation de langue du produit est `normalizeLanguageCode`
(`language-normalize.ts`, utilisée partout : `resolveUserLanguage`,
`detectComposeLanguage` web, miroirs iOS/Android).

En aval, `MessagingService` (`services/gateway/.../messaging/MessagingService.ts:181-190`)
**persiste `originalLanguage` verbatim** (`claimedLanguage ? claimedLanguage : detect…`).
Le lecteur compare ensuite `message.originalLanguage === userLanguage` (code
normalisé lowercase 2/3 lettres) pour décider s'il faut traduire.

## Problems identified
1. **Corruption latente du Prisme (correctness).** L'ancien schéma **acceptait**
   `'en-US'` et le persistait **tel quel**. Le lecteur normalisé (`'en'`) ne
   matchait jamais `'en-US'` → le message restait **éternellement « étranger »**,
   affichant en permanence l'affordance de traduction pour un contenu déjà dans la
   langue du lecteur. Vrai défaut fonctionnel du Prisme sur le chemin REST.
2. **Contradiction interne regex ↔ `max(5)`.** Le regex `/^[a-z]{2,3}(-[A-Z]{2})?$/`
   matchait `'bas-CM'` (code 639-3 supporté + région, 6 car.) mais `max(5)` le
   **rejetait**, alors que `'en-US'` (5 car.) passait. Asymétrie exactement dans la
   dimension que les tests existants protégeaient (« les codes 639-3 ne doivent
   pas être rejetés sur sendMessage/editMessage »).
3. **Divergence SSOT.** Un schéma de langue qui réimplémente une regex ad-hoc au
   lieu de déléguer à `normalizeLanguageCode` viole le principe « Single Source of
   Truth : language resolution » du CLAUDE.md racine.
4. **Doc mensongère (finding #2, corrigée).** `languageCodeSchema`
   (`attachment-validators.ts:63`) affirmait « Mirrors the widened
   `CommonSchemas.language` regex » — faux (formes différentes) et devenu
   doublement faux après cette itération (plus de regex du tout).

## Root causes
`CommonSchemas.language` a été conçu comme un **validateur de forme** et non comme
un **normaliseur**, contrairement au reste du pipeline langue. Le fix #2067
(#639-3) avait élargi le corps `{2}`→`{2,3}` sans bumper `max(5)` (d'où la
contradiction) ni relier le schéma à la SSOT de normalisation.

## Business impact
Réel côté UX : un utilisateur dont un client envoie `originalLanguage` avec un
sous-tag région/casing (locales iOS/Android, `Accept-Language` web brut) voyait
ses propres messages traités comme étrangers. Silencieux, non couvert par un test.

## Technical impact
- `CommonSchemas.language` **normalise** désormais via la SSOT et rejette les
  entrées non réductibles. La valeur persistée est toujours canonique.
- Contradiction regex/`max` supprimée (plus de regex : la SSOT porte la règle).
- Zéro nouveau `any`, signature de sortie inchangée (`string`) → aucun consommateur
  cassé (`SendMessageBody`, `.optional().default('fr')` intacts).

## Risk assessment
Faible. Élargit l'acceptation (BCP-47 réel) tout en **garantissant** une sortie
canonique — strictement plus correct pour tous les consommateurs de
`originalLanguage`. Seule bascule de contrat : `'EN'` passe de *rejeté* à
*accepté→`'en'`* (plus robuste, aligné sur les locales réelles). Chemin socket
(`z.string().optional()`) inchangé — non régressé (voir backlog).

## Proposed improvements (TDD) — RÉALISÉ
- **RED** : `__tests__/validation.test.ts` — nouveau bloc `normalizes region /
  script / case variants…` asserant `parse('en-US') === 'en'`,
  `parse('zh-Hant-HK') === 'zh'`, `parse('es-419') === 'es'`,
  `parse('bas-CM') === 'bas'`, `parse('EN') === 'en'` (échoue : `'en-US'` renvoyé
  verbatim). Rejets durcis : `''`, `'123'`, `'@@'`.
- **GREEN** : `validation.ts` — import `normalizeLanguageCode`, schéma réécrit
  `.transform(normalizeLanguageCode).refine(code !== undefined)`.
- **DOC** : `attachment-validators.ts` — remplacement du claim « mirrors » par la
  distinction réelle (forme brute préservée vs normalisation).

## Expected benefits
- Suppression d'une corruption latente du Prisme sur le chemin REST.
- `CommonSchemas.language` aligné sur la SSOT de normalisation.
- Contrat honnête et testé (bornes cohérentes, sortie canonique garantie).

## Implementation complexity
Faible — 1 schéma réécrit + 1 import + 1 bloc de tests + 1 comment corrigé.

## Validation criteria — TOUS VERTS
- `packages/shared` : `vitest run` = **46 suites / 1368 tests** verts (bloc langue
  7 tests, +3 vs avant).
- `tsc --noEmit` (shared) = exit 0.

## Backlog (candidats consignés — non actionnés ici)
- **Vrai chokepoint unique : `MessagingService.ts:181`** — normaliser
  `claimedLanguage` via `normalizeLanguageCode(request.originalLanguage)` couvrirait
  **les deux** chemins (REST **et** socket `z.string().optional()`) en un seul
  point, rendant la normalisation du schéma REST redondante mais défensive.
  Non fait ici : code gateway, non testable reproductiblement dans cet
  environnement (jest gateway OOM / prisma generate requis). À traiter dès qu'un
  run gateway est disponible.
- **Socket `originalLanguage: z.string().optional()`** (socket-event-schemas.ts:24,49)
  — aucune validation de forme ni normalisation ; incohérent avec le chemin REST
  désormais durci. À aligner avec le fix du chokepoint ci-dessus.
- **`validatePagination` (`pagination.ts:26`)** : `limit=0` coercé en `20` —
  décision produit, reste en backlog.
- `email-validator.ts:48` : borne 255 vs RFC 254 (nit, invariant SSOT préservé).
