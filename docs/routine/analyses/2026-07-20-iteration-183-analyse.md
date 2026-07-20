# Iteration 183 — `attachmentTranslationsMapSchema` : docstring auto-contradictoire affirmant une validation cross-field jamais implémentée (contrat de trust-boundary mensonger)

## Protocole (démarrage)
`main` @ `b3ffa80` (derniers merges : #2060 gateway/identifiers SSOT (itér. 182),
ios/stories tappable menu, vague #2101→#2130 ios/a11y pilotée par d'autres
sessions). Branche `claude/brave-archimedes-xx8xvp` réinitialisée sur
`origin/main`. Ce cycle prend **183**.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript. `bun install` (jest gateway) tué à répétition (exit 143) ; en
revanche le harnais **vitest de `packages/shared`** est opérationnel
(`node_modules/.bin/vitest`, 36 tests `attachment-validators` verts). La sélection
se concentre donc sur `packages/shared` où la validation est reproductible.

Point de départ : revue Priorité 1 (features récentes) + sweep dédié d'un
sous-agent Explore sur les 12 utilitaires purs de `packages/shared/utils/`. Le
sweep n'a trouvé **aucun** bug arithmétique/timezone/regex/surrogate à haute
confiance (utils exceptionnellement matures, tous couverts par des suites
edge-focused). Le **seul défaut net** est une contradiction interne de
documentation dans un validateur de trust-boundary — c'est la cible de cette
itération.

## Current state
`packages/shared/utils/attachment-validators.ts` valide, aux frontières de
confiance (Socket.IO, REST, ZMQ), les payloads JSON `transcription` / `translations`
stockés sur `MessageAttachment` / `PostMedia`. La map de traductions est modélisée
par `attachmentTranslationsMapSchema = z.record(languageCodeSchema, attachmentTranslationSchema)`.

**Deux docstrings du même fichier se contredisent frontalement sur le contrat de
cette map :**

- `:187-196` (au-dessus du schéma) affirme :
  > « Cross-field validation of `outerKey === inner.<lang>` **is enforced** by
  > `parseAttachmentTranslationsMap` below — a mismatch breaks the Prisme
  > Linguistique resolver… »
- `:253-258` (au-dessus du helper) affirme l'exact inverse, correctement :
  > « The map's outer key is informational and is **NOT cross-checked** against
  > any inner field — `AttachmentTranslation` does not carry a `targetLanguage`
  > property in the canonical shape; the language is implicit in the map key. »

La réalité du code (`:259-270`) : `parseAttachmentTranslationsMap` appelle
uniquement `attachmentTranslationsMapSchema.safeParse(input)`, qui ne fait
**aucune** vérification croisée clé↔contenu. C'est le docstring `:253-258` qui dit
vrai ; celui de `:187-196` est mensonger.

## Problems identified
1. **Contrat de trust-boundary mensonger (correctness-of-contract).** Un
   mainteneur lisant `:187-196` croit qu'un payload `{ "fr": <traduction
   espagnole> }` est rejeté à la frontière. Il ne l'est pas — `safeParse` le
   laisse passer (`ok:true`). Toute logique en aval qui « fait confiance » à cette
   garantie inexistante hérite d'un faux sentiment de sécurité sur une propriété
   du Prisme Linguistique (le client résout `translations[preferredLanguage]`).
2. **Auto-contradiction non détectable par les tests.** Les deux docstrings ne
   peuvent pas être vrais simultanément ; aucune assertion ne verrouille le
   comportement réel (aucun test sur la relation clé↔contenu). Le contrat réel
   n'est donc ni documenté fidèlement, ni testé.

## Root causes
Structurellement, `AttachmentTranslation` (forme canonique, `attachment-audio.ts`)
**ne porte aucun champ langue** de premier niveau : la langue cible est
*implicite dans la clé de map*. Une validation croisée `outerKey === inner.<lang>`
est donc **impossible à ce niveau** — il n'existe rien à comparer. Le docstring
`:187-196` décrit une garantie qui n'a jamais pu exister ; il n'a jamais été mis
en cohérence avec l'implémentation ni avec l'autre docstring.

## Business impact
Faible en runtime (aucun changement de comportement), réel en maintenabilité et
en sûreté : un contrat de sécurité faux sur le pipeline de traduction audio est
précisément le genre de piège qui conduit un futur contributeur à retirer une
validation « redondante » en aval, ouvrant une régression du Prisme.

## Technical impact
- Contrat de `parseAttachmentTranslationsMap` désormais **fidèle** et **verrouillé
  par un test**.
- Zéro changement de comportement d'exécution (fix documentaire + test de
  caractérisation).

## Risk assessment
Très faible. Le seul code modifié est un bloc de commentaire ; le test ajouté
caractérise le comportement **actuel** (il passe sur le code inchangé). Aucun
appelant, aucune signature, aucune forme persistée touchée.

## Proposed improvements (TDD)
- **RED/Characterization** : +1 test dans `__tests__/attachment-validators.test.ts`
  affirmant l'invariant réel — une map dont la **clé** ne correspond pas à la
  langue réelle du contenu est **acceptée** (`ok:true`), car il n'existe aucun
  marqueur de langue interne à recouper. Le test documente que la correction de la
  clé est la responsabilité de l'appelant, pas du validateur. (Passe sur le code
  actuel → verrou de non-régression du contrat honnête.)
- **GREEN** : réécrire le docstring `:187-196` pour dire la vérité et l'aligner
  sur `:253-258` : la clé de map fait autorité et n'est **pas** recoupée avec le
  contenu (impossible — pas de champ langue interne) ; l'appelant doit garantir
  qu'il indexe sous la bonne clé.

## Expected benefits
- Un seul contrat cohérent, honnête et testé pour la map de traductions.
- Suppression d'un faux positif de sécurité sur un chemin Prisme sensible.

## Implementation complexity
Triviale — 1 bloc de commentaire réécrit + 1 test de caractérisation.

## Validation criteria
- `packages/shared` : `vitest run __tests__/attachment-validators.test.ts` =
  **37 tests verts** (36 + 1 nouveau).
- `tsc --noEmit` (shared) inchangé (aucune signature modifiée).

## Backlog (candidats consignés — non actionnés ici)
- **`normalizeLanguageCode` (`language-normalize.ts:66-69`)** : réduction 3→2
  lettres aveugle → collision ISO 639-3 (`'arg'` Aragonais → `'ar'` Arabe,
  `'english'` → `'en'`). Fix « propre » nécessite une table ISO 639-3→639-1 (≈50
  langues) : changement de la SSOT du Prisme, risque de régression, à traiter par
  analyse dédiée (le docstring documente le tradeoff actuel comme délibéré).
- **`validatePagination` (`pagination.ts:26`) / `CommonSchemas.pagination`** :
  `limit=0` explicite coercé en `20`. Comportements alignés gateway↔shared
  (intentionnel « 0 = unset »). Toucher la sémantique = décision produit — reste
  en backlog.
- **`CommonSchemas.language` (`validation.ts:91`)** : regex case-sensitive
  (`/^[a-z]{2,3}(-[A-Z]{2})?$/`) sur `sendMessage`/`editMessage.originalLanguage`,
  vs `supportedLanguageCode` case-insensitive + lowercase ailleurs. Divergence de
  robustesse ; impact réel dépend de si un client émet un primary majuscule —
  à vérifier avant de loosen.
- `email-validator.ts:48` : borne 255 vs RFC 254 (nit, invariant SSOT préservé).
