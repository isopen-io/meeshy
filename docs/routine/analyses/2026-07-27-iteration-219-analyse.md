# Iteration 219 — `customDestinationLanguage` (3e priorité du Prisme) canonicalisé au write boundary : SSOT `normalizeLanguageCode` + déduplication du schéma

## Protocole (démarrage)
`main` @ `dc5056df` (dernier commit : `test(ios/share-extension)`). Branche
`claude/brave-archimedes-h8tnrc` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` (le postinstall `turbo run generate` s'est bloqué sur un
`pnpm add pnpm@9.15.0` réseau-hung — contourné en lançant `prisma generate --generator client`
directement, <1 s ; puis `bun run build` shared). Jest gateway présent sous
`services/gateway/node_modules/.bin/jest` ; vitest shared.

PRs ouvertes au démarrage — **audit anti-doublon** (12 PRs #2362→#2374). Série langue en vol :
- **#2372** (`claude/quirky-curie…`) : `conversation-helpers.ts` — repli **au READ** des préférences
  in-app invalides (whitespace/1-lettre → niveau suivant du Prisme).
- **#2371** / **#2364** (série brave-archimedes) : canonicalisation de `Message.originalLanguage`
  aux chemins **edit** et **links**.
- **#2374** : gateway/calls NODE_ENV ; **#2373/#2370/#2369/#2368/#2367/#2366/#2363/#2362** : iOS/Android.

**Aucune PR ouverte ne touche `packages/shared/utils/validation.ts` ni
`services/gateway/src/services/preferences/PreferencesService.ts`.** Zéro chevauchement de fichier.
Cette itération traite un write boundary **distinct** de #2371/#2364 (préférence utilisateur
`customDestinationLanguage`, pas `Message.originalLanguage`) et **complémentaire** de #2372
(#2372 défend au READ ; ici on canonicalise au WRITE pour rendre la base auto-cohérente).

## Sélection : **Priorité 1 — correctness + Single Source of Truth (racine du routage de langue)**

Candidat **explicitement légué** par les itérations 217/218 (« Future Considerations ») :
> Préférences in-app (`systemLanguage` & co) : même asymétrie write-verbatim / read-normalize —
> convergence write-boundary candidate.

L'audit a **précisé** la cible : `systemLanguage`/`regionalLanguage` sont **déjà** canoniques au
write (schéma partagé `supportedLanguageCode` valide le support + `.toLowerCase()`, rejette les
région-tags). Le **seul** champ de langue in-app qui échappe à cette garde est
`customDestinationLanguage` (3e priorité du Prisme).

## Current state (avant correctif)

`packages/shared/utils/validation.ts` définissait `customDestinationLanguage` avec un schéma inline
**plus faible** que `supportedLanguageCode`, **dupliqué à l'identique** dans deux schémas d'entrée :
```ts
// updateUserProfileSchema (route PATCH /users/profile) ET UserSchemas.update
customDestinationLanguage: z.string().min(2).max(5).transform((code) => code.toLowerCase())…
```
Vérifié empiriquement (`updateUserProfileSchema.safeParse`) :
- `systemLanguage: 'fr-FR'` → **REJETÉ** (`supportedLanguageCode`, région-tag non supporté).
- `customDestinationLanguage: 'fr-FR'` → **accepté**, stocké `'fr-fr'`.
- `customDestinationLanguage: 'en-US'` → **accepté**, stocké `'en-us'`.

En parallèle, `services/gateway/.../PreferencesService.updateLanguagePreferences` (write boundary de
service, actuellement non routé mais public + testé) lowercase ses trois champs par `.toLowerCase()`
brut — même faiblesse (ne réduit pas les région-tags).

## Problems identified

1. **Bug de correctness — Prisme forcé sur l'original au niveau priorité 3.** Un
   `customDestinationLanguage` persisté `'fr-fr'` :
   - ne matche aucune `MessageTranslation.targetLanguage` (clé lowercase canonique `'fr'`) →
     `preferredTranslation` retombe sur le message **original** (violation directe du Prisme,
     règle #1) alors qu'une traduction `'fr'` valide existe.
   - source NLLB / clé de cache de traduction fragmentées (`'fr-fr'` ≠ `'fr'`).
   - stats par langue éclatées.
   Impact réel : iOS `Locale.current.identifier` = `'fr_FR'` et web `navigator.language` = `'fr-FR'`
   sont les formes **majoritaires** émises par les plateformes.
2. **Duplication de schéma (dette).** La définition inline faible existait en **deux** exemplaires
   identiques → dérive garantie si l'un évolue sans l'autre.
3. **Asymétrie write-verbatim / read-normalize.** #2372 doit défendre au read précisément parce que
   la valeur stockée n'est pas canonique. Racine non traitée = défense par site.

## Root causes
- `customDestinationLanguage` a été conçu plus permissif que `supportedLanguageCode` (pas de contrôle
  de support — un « custom » destination), mais « permissif sur le support » a été confondu avec « ne
  pas canonicaliser la forme » — or canonicaliser est local, pur, sans I/O.
- Absence d'un sous-schéma nommé unique → duplication + divergence.

## Business impact
- Traductions manquées et Prisme cassé pour tout utilisateur configurant une langue de destination
  personnalisée depuis un client dont la plateforme émet un locale région-taggé (la majorité).

## Technical impact
- `customDestinationLanguage` devient **canonique par construction** en base → SSOT.
- Un seul sous-schéma `customDestinationLanguageCode` remplace deux définitions inline → dédup.
- `PreferencesService` converge sur le même SSOT `normalizeLanguageCode`.

## Risk assessment
**Faible.**
- Repli `normalizeLanguageCode(code) ?? code.toLowerCase()` : **comportement d'acceptation strictement
  inchangé** — un code irréductible (ISO 639-3 supporté `'bas'`, code inconnu `'zzzz'`) reste
  identique à l'ancien `.toLowerCase()`. Seuls les **région-tags réductibles** changent (`'fr-FR'` →
  `'fr'`), strictement des améliorations.
- `normalizeLanguageCode` est idempotent sur les codes canoniques (`'fr'` → `'fr'`) → messages et tests
  existants inchangés.
- Sémantiques `''` (effacement langue secondaire) et `null` préservées (union `z.literal('')`/`z.null()`
  hors du sous-schéma).
- `UserSchemas.full` (schéma de **représentation** de sortie, `z.string()` nu partout, y compris
  `systemLanguage`) intentionnellement **non touché** — pas un write boundary.
- Aucune dépendance circulaire : `language-normalize.js` n'importe que `languages.js`.

## Proposed improvements
1. Sous-schéma partagé `customDestinationLanguageCode` (validation.ts) : `normalizeLanguageCode(code)
   ?? code.toLowerCase()`, remplaçant les deux définitions inline dupliquées.
2. Importer `normalizeLanguageCode` dans validation.ts (déjà voisin dans `utils/`).
3. `PreferencesService.updateLanguagePreferences` : `.toLowerCase()` brut → `normalizeLanguageCode(x)
   ?? x.toLowerCase()` pour les trois champs.

## Expected benefits
- `customDestinationLanguage` canonique en base → Prisme résolu correctement à la priorité 3, source
  NLLB correcte, clé de cache stable, stats exactes. Duplication de schéma supprimée.

## Implementation complexity
Très faible : +1 import + 1 sous-schéma partagé, 2 lignes inline remplacées (validation.ts) ; +1 import,
3 lignes (PreferencesService) ; +8 tests RED→GREEN (5 validation, 3 PreferencesService).

## Validation criteria
- RED prouvé : `customDestinationLanguage: 'fr-FR'` → `'fr-fr'` (validation.test.ts échoue en attendant
  `'fr'`) ; `'en_US'` → `'en_us'`.
- GREEN : `'fr-FR'`/`'fr_FR'` → `'fr'`, `'en-US'`/`'en_US'` → `'en'`, `'bas'` préservé, `''`/`null`
  inchangés ; `UserSchemas.update` idem.
- Non-régression : validation.test.ts 44/44, suites shared langue 205/205 ; gateway profile +
  PreferencesService + register 113/113 ; MessageTranslationService + messages-list-language +
  preferences e2e 86/86.

## Future Considerations
- Autres consommateurs de `customDestinationLanguage` en écriture hors schémas partagés (aucun trouvé
  dans le gateway ; les 3 sites identifiés passent par validation.ts) — re-balayer si de nouveaux
  chemins d'écriture apparaissent.
- Migration légère optionnelle : normaliser les lignes `User.customDestinationLanguage` historiques
  région-taggées (batch idempotent) pour retirer la défense au read (#2372) — à isoler (stockage).
- Miroir cross-platform : vérifier que le client iOS/web n'écrit pas `customDestinationLanguage` par un
  chemin non validé (ex. cache local direct) qui contournerait la canonicalisation gateway.
