# Iteration 219 — Canonicalisation de `Message.originalLanguage` sur les chemins d'écriture **hors funnel** (share-links + édition REST)

## Protocole (démarrage)
`main` @ `58cdf6c4` (dernier commit : feat android/chat E2EE disclaimer #2400).
Branche `claude/brave-archimedes-2yox8g` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` (postinstall `turbo run generate` bloqué sur un fetch réseau des
binaryTargets ARM/musl → généré manuellement `native` uniquement, schema **inchangé** au commit).
Le jest gateway mappe `@meeshy/shared/(.*)` → **source** `packages/shared/$1` : l'import de
`normalizeLanguageCode` est transpilé par ts-jest à la volée, pas de rebuild `dist` requis.

PRs ouvertes au démarrage — **audit anti-doublon** (20 PRs #2380→#2399) :
- **#2380** (`shared/dnd`) et **#2395** (`gateway/reactions` — rejette les réactions sur messages
  soft-deleted) : ne touchent **pas** aux chemins de langue.
- **#2381→#2399** : dependabot (CI actions, radix-ui, next, protobuf, libsignal…) — aucun fichier métier.
- **Aucune PR ouverte ne touche `routes/links/messages.ts` ni `routes/conversations/messages-advanced.ts`.**
  Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — correctness + Single Source of Truth (suite directe de 218)**

Candidat **explicitement légué** par l'itération 218 (« Future Considerations ») :
> Chemins d'édition (`messages-advanced.ts:439`) et links (`routes/links/messages.ts:196,445`) écrivent
> aussi `originalLanguage` — auditer pour la même canonicalisation si un client peut y injecter un
> locale brut.

L'itération 218 a rendu `Message.originalLanguage` canonique **au funnel** `MessagingService.handleMessage`
(socket + REST `POST /messages` + agent). Cette itération ferme les **trois chemins d'écriture qui
contournent le funnel** et persistaient encore la claim client verbatim.

## Current state (avant correctif)

Trois `prisma.message.{create,update}` écrivent `originalLanguage` **sans** passer par le funnel de 218 :

1. `routes/links/messages.ts:196` — envoi anonyme via share-link :
   `originalLanguage: body.originalLanguage` (schema `sendMessageSchema.originalLanguage = z.string().default('fr')`).
2. `routes/links/messages.ts:445` — envoi authentifié via share-link : idem.
3. `routes/conversations/messages-advanced.ts:219` — **édition REST** :
   `const { content, originalLanguage = 'fr' } = bodyResult.data;` puis `message.update({ data: { originalLanguage } })`
   et retraduction `_processRetranslationAsync` source = ce même `originalLanguage`
   (`CommonSchemas.language` = regex `^[a-z]{2,3}(-[A-Z]{2})?$` → **accepte `fr-FR`/`en-US`** verbatim).

Les clients envoient le locale brut de la plateforme (iOS `Locale.current` → `fr_FR`, web `navigator.language`
→ `fr-FR`, casse variable → `FR`). Ces valeurs atteignaient `Message.originalLanguage` **telles quelles**
sur ces trois chemins.

Le chemin **socket d'édition** (`MessageHandler.handleMessageEdit`), lui, **ne réécrit pas**
`originalLanguage` : il réutilise la valeur stockée (déjà canonique). Asymétrie REST-vs-socket
identifiée et corrigée côté REST.

## Problems identified

1. **Bug de correctness — fragmentation des consommateurs de `originalLanguage` (même classe que 218).**
   Un `'fr-FR'` persisté casse :
   - **Source NLLB** : mapping keyé `'fr' → 'fra_Latn'` ; `'fr-FR'` ne matche pas → source mal résolue.
   - **Clé de cache de traduction** : `TranslationCache.generateKey(id, target, originalLanguage)` mélange
     `'fr-FR'` et `'fr'` → miss de cache, doublons de traduction.
   - **Stats par langue** : agrégats admin (`routes/admin/languages.ts`, `analytics.ts`) comptent
     `'fr-FR'` ≠ `'fr'` → stats éclatées.
   - **Broadcast client** : `LINK_MESSAGE_NEW` diffuse `originalLanguage` brut — le client doit re-normaliser.
2. **Incohérence write-boundary.** 218 a canonicalisé le funnel ; ces trois chemins produisaient encore
   des lignes non canoniques → la base restait hétérogène selon la surface d'envoi (share-link vs
   conversation normale) et l'édition REST pouvait **dé-canonicaliser** un message déjà propre.

## Root causes
- Ces chemins **précèdent** ou **contournent** le funnel `handleMessage` (share-links = surface anonyme
  historique ; édition REST = route avancée séparée) et n'avaient jamais reçu la normalisation au write.
- La claim est trustée verbatim au write pour éviter un round-trip détecteur — mais « trust » ≠ « ne pas
  normaliser » : normaliser est local, pur, sans I/O (leçon 218 non encore propagée à ces sites).

## Business impact
- Traductions manquées/dupliquées et stats de langue fausses pour tout message envoyé **via share-link**
  (onboarding anonyme = surface d'acquisition clé) ou **édité via REST**, dès que la plateforme émet un
  locale région-taggé (la majorité). Impact direct sur le Prisme Linguistique et les dashboards admin.

## Technical impact
- `Message.originalLanguage` devient canonique par construction sur **100 % des chemins d'écriture**
  (funnel 218 + ces 3 sites). SSOT en base réellement homogène. Zéro nouveau helper, zéro dépendance de
  build : réutilise `normalizeLanguageCode` (SSOT `@meeshy/shared/utils/language-normalize`).

## Risk assessment
**Faible.**
- Repli `normalizeLanguageCode(claim) ?? claim` **identique** au funnel 218 → mêmes garanties : code
  irréductible (`'bas'`, 2-lettres inconnu) conservé verbatim ; codes déjà canoniques inchangés
  (idempotence) ; seuls les claims réductibles (`'fr-FR'`→`'fr'`, `'en_US'`→`'en'`) changent = améliorations.
- Aucun round-trip détecteur ajouté ; aucune modification des chemins de lecture.
- Édition REST : la valeur normalisée alimente aussi la source de retraduction → retraduction plus correcte
  (bonus), jamais moins.

## Proposed improvements
1. `routes/links/messages.ts` : importer `normalizeLanguageCode` ; calculer
   `const originalLanguage = normalizeLanguageCode(body.originalLanguage) ?? body.originalLanguage;` après
   `parse`, dans les deux handlers (anon + auth), et l'utiliser dans les deux `message.create`.
2. `routes/conversations/messages-advanced.ts` : importer `normalizeLanguageCode` ; renommer la claim en
   `claimedLanguage` au destructure et calculer `originalLanguage = normalizeLanguageCode(claimedLanguage) ?? claimedLanguage`
   avant l'`update` et la retraduction.

## Expected benefits
- `Message.originalLanguage` canonique en base sur tous les chemins → NLLB source correcte, clé de cache
  stable, stats exactes, broadcast propre — y compris pour les share-links et l'édition REST.

## Implementation complexity
Très faible : +2 imports, +3 lignes de normalisation, 3 sites d'écriture re-câblés, +4 tests RED→GREEN
(2 links anon/auth, 1 links « bas » verbatim non-régression, 1 édition REST).

## Validation criteria
- RED prouvé (source revertée via `git stash`) : claim `'fr-FR'`/`'en_US'` → `create/update` avec la valeur
  brute (3 tests échouent) ; `'bas'` reste vert (irréductible, comportement inchangé).
- GREEN : `'fr-FR'`→`'fr'`, `'en_US'`→`'en'` persistés ; `'bas'`→`'bas'` verbatim. 131/131 sur les 2 suites
  ciblées. Suite gateway complète sans régression.

## Future Considerations
- **Migration légère optionnelle** (léguée par 217/218) : normaliser les lignes `Message.originalLanguage`
  historiques région-taggées (batch idempotent) pour retirer définitivement la défense au read de 216.
- **Préférences in-app** (`systemLanguage` & co) : même asymétrie write-verbatim / read-normalize
  documentée (`normalizeInAppLanguage`) — convergence write-boundary candidate (plus large, migration).
- **Posts/commentaires** : `routes/posts/types.ts` définit `originalLanguage: z.string().min(2).max(16)` —
  auditer si le service posts/comments persiste une claim brute (même canonicalisation candidate).
- **Convergence schema** : envisager de porter la normalisation dans `CommonSchemas.language` via
  `.transform` (SSOT unique) une fois tous les consommateurs audités — précédent `routes/anonymous.ts:28`
  (`normalizeLanguageForDedup`).
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
# Itération 219 — Analyse : canonicalisation du format DND `HH:MM` (write-boundary + défense pure)

**Date** : 2026-07-27
**Surface** : `packages/shared` (TypeScript, pure, testable vitest)
**Priorité** : P1 (fonction développée récemment — GW7 Do-Not-Disturb timezone-aware)

## Current state
La fenêtre Do-Not-Disturb (GW7) est évaluée par une **fonction pure unique**,
`isWithinDnd()` dans `packages/shared/utils/notification-dnd.ts`. Elle compare l'heure locale
courante (`"HH:MM"` zero-paddée) aux bornes `dndStartTime`/`dndEndTime` par **comparaison
lexicographique de chaînes** pour (a) détecter une fenêtre à cheval sur minuit (`start > end`)
et (b) tester l'appartenance (`currentTime >= start`, `currentTime < end`).

Cette logique n'est correcte **que si** les bornes sont elles aussi au format zero-paddé
`"HH:MM"` (heure sur 2 chiffres). La fonction ne le garantit pas : elle **assume** le format
sans le normaliser.

Or le format des bornes est validé par **quatre** schémas dont **un diverge** :

| Site | Regex | Accepte `"9:00"` ? |
|------|-------|--------------------|
| `types/preferences/notification.ts:44-45` (schéma défaut) | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| `services/gateway/.../notification-schemas.ts:192,196` | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| `services/gateway/config/user-preferences-defaults.ts:169` (`isValidDndTime`) | `/^([01]\d|2[0-3]):([0-5]\d)$/` | ❌ non (canonique) |
| **`utils/validation.ts:1515-1516`** (`NotificationPreferenceSchemas.update`) | `/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/` | ✅ **oui** (laxiste) |

Le `[01]?` rend le chiffre de tête optionnel : `"9:00"` passe le schéma laxiste et peut donc
atteindre la persistance sans normalisation.

## Problems identified
1. **Divergence de schéma** : un seul des quatre validateurs admet l'heure sur 1 chiffre.
   Drift silencieux contre le principe SSOT du CLAUDE.md.
2. **Fragilité de la fonction pure** : `isWithinDnd` dépend implicitement du format d'entrée
   du caller au lieu de le rendre robuste.

## Root causes
- La comparaison lexicographique exige un padding strict, mais le padding n'est appliqué qu'à
  `currentTime` (calculé), jamais aux bornes (fournies par le caller / la base).
- Le schéma d'update `validation.ts` a été écrit avec une regex laxiste divergente des trois
  autres sites, laissant une porte d'entrée pour une valeur non canonique.

## Business impact
Un document persistant avec `"9:00"` (via le schéma laxiste, ou hérité) casse **totalement**
la fenêtre DND : `('9:00' > '17:00')` vaut `true` (char `'9'`=0x39 > `'1'`=0x31), donc une
fenêtre diurne 09:00–17:00 est mal détectée comme **overnight** et devient un blocage
minuit → 17:00. L'utilisateur voit ses notifications supprimées toute la matinée, ou au
contraire reçoit des notifications en pleine fenêtre voulue. Impact direct sur la confiance
produit (les notifications sont un contrat).

## Technical impact
- `isWithinDnd` devient robuste par construction (padding local, pur, idempotent).
- Les quatre write-boundaries convergent sur la **seule** regex canonique → SSOT restauré.
- Les documents hérités `"9:00"` déjà en base sont désormais évalués correctement (le padding
  au read couvre le stock existant que la seule regserrée ne réparerait pas).

## Risk assessment
**Très faible.**
- `padWallClock` est **idempotent** sur les valeurs déjà canoniques (`"22:00"` → `"22:00"`)
  → tous les tests et documents existants inchangés.
- Une entrée qu'il ne sait pas parser (pas de `:`) est renvoyée **verbatim** → comportement
  identique à l'actuel pour le vraiment-malformé, aucune perte.
- Le resserrage de `validation.ts` ne fait que **rejeter** une forme non canonique qu'aucun
  test/consommateur n'exigeait (grep : seuls mes nouveaux tests utilisent `"9:00"`), et les
  trois autres sites la rejetaient déjà.

## Proposed improvements
1. `notification-dnd.ts` : helper pur `padWallClock(value)` (pad heure+minute), appliqué aux
   deux bornes en tête de `isWithinDnd`.
2. `validation.ts:1515-1516` : regex laxiste → canonique `/^([01]\d|2[0-3]):([0-5]\d)$/`.

## Expected benefits
- Fenêtre DND correcte pour toute valeur légale ou héritée.
- SSOT du format `HH:MM` sur les quatre sites.
- Zéro nouvelle dépendance, zéro I/O, fonction pure toujours testable isolément.

## Implementation complexity
Très faible : +1 helper pur (~6 lignes), 2 lignes modifiées dans `isWithinDnd`, 2 lignes de
regex resserrées, +7 tests (3 DND non-paddé, 4 schéma update).

## Validation criteria
- RED prouvé (branche non patchée) : `"9:00"` accepté par `update` (échoue en attendant rejet) ;
  `isWithinDnd({start:'9:00', end:'17:00'})` à 03:00 → `true` (échoue en attendant `false`).
- GREEN : `update` rejette `"9:00"`/`"8:30"`, accepte `"09:00"`/`"23:59"` ; `isWithinDnd`
  traite `"9:00"`→`"09:00"` correctement (diurne, overnight, avec offset).
- Non-régression : suite complète `packages/shared` verte (1427 tests), `tsc --noEmit` 0 erreur.

## Future considerations
- Migration idempotente optionnelle des documents `dndStartTime`/`dndEndTime` historiques
  région-taggés `"H:MM"` → `"HH:MM"` pour retirer à terme la défense au read.
- `SecuritySanitizer.truncate` (`services/gateway/utils/sanitize.ts:219`) coupe par unités
  UTF-16 et peut scinder une paire de substitution / séquence ZWJ emoji dans un aperçu de
  notification → lone surrogate `�`. Candidat P3 séparé (grapheme-safe truncation).
