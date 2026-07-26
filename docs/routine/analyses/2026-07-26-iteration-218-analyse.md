# Iteration 218 — `Message.originalLanguage` persisté verbatim (locale brute client) : normalisation à l'écriture (SSOT `normalizeLanguageCode`) pour rendre la base auto-cohérente

## Protocole (démarrage)
`main` @ `f7cfef45` (dernier commit : feat android/conversations UserCategoryCatalog reducer #2359).
Branche `claude/brave-archimedes-nqlb3m` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` ; `prisma generate --generator client`. Le jest gateway mappe
`@meeshy/shared/(.*)` → **source** `packages/shared/$1` (pas `dist`), donc l'import de
`normalizeLanguageCode` est transpilé par ts-jest à la volée — pas de rebuild `dist` requis.

PRs ouvertes au démarrage — **audit anti-doublon** (24 PRs #2334→#2357) :
- **#2357** (217i, série brave-archimedes) : `routes/anonymous.ts`, `packages/shared/utils/language-normalize.ts`
  (**ajoute** `normalizeLanguageForDedup`), `conversation-helpers.ts`. **N'exporte pas encore sur `main`.**
- **#2356** : gateway/calls — `routes/calls.ts`, `services/CallService.ts`, `socketio/CallEventsHandler.ts`.
- **#2334→#2355** : **toutes iOS/Android** (NavigationStack, a11y, StatusComposerView, window metrics, haptics).

**Aucune PR ouverte ne touche `services/gateway/src/services/messaging/MessagingService.ts`.** Zéro
chevauchement de fichier. Cette itération n'utilise **que** `normalizeLanguageCode` (déjà exporté sur
`main`) — **aucune dépendance** au `normalizeLanguageForDedup` de #2357 encore non mergé.

## Sélection : **Priorité 1 — correctness + Single Source of Truth (racine du routage de langue)**

Candidat **explicitement légué** par l'itération 216 (« Future improvements ») :
> - Normaliser `originalLanguage` à l'écriture (`MessagingService.ts:181`) — source unique en base.

L'itération 216 a corrigé le **symptôme** au **read** (`_resolveTargetLanguages` normalise les deux
côtés du filtre anti-auto-traduction). Cette itération corrige la **racine** au **write** : le champ
`Message.originalLanguage` lui-même est persisté canonique, ce qui rend correct **tous** les
consommateurs en aval sans re-normalisation défensive par site.

## Current state (avant correctif)

`MessagingService.handleMessage` est le **funnel unique de création** de message — socket
(`MessageHandler.handleMessageSend` / `handleMessageSendWithAttachments`), REST
(`conversations/messages.ts:1768`), agent (`MeeshySocketIOManager:2421`) et translation-non-blocking
(`translation-non-blocking.ts:379`) y convergent tous.

```ts
const claimedLanguage = request.originalLanguage?.trim();
const originalLanguage = claimedLanguage
  ? claimedLanguage                       // ← claim TRUSTED VERBATIM
  : (request.content ? await detectLanguage(...) : 'fr');
```

La claim client est le **locale brut de la plateforme** :
- iOS : `Locale.current.identifier` → `'fr_FR'`, `'en_US'`.
- Web : `navigator.language` → `'fr-FR'`, `'en-US'`.
- Casse variable → `'FR'`, `'EN'`.

Ces valeurs atteignent `Message.originalLanguage` **telles quelles**.

## Problems identified

1. **Bug de correctness — fragmentation de tous les consommateurs de `originalLanguage`.**
   Un `'fr-FR'` persisté :
   - **Source NLLB** : `originalLanguage` est la langue source de la traduction. Le mapping NLLB est
     keyé `'fr' → 'fra_Latn'` ; `'fr-FR'` ne matche pas → source mal résolue.
   - **Clé de cache de traduction** : `TranslationCache.generateKey(message.id, targetLang, message.originalLanguage)`
     (`MessageTranslationService.ts:481`) mélange `'fr-FR'` et `'fr'` → miss de cache, doublons.
   - **Stats par langue** : `conversationStatsService.updateStats(conversationId, originalLanguage)` et les
     agrégats admin (`routes/admin/languages.ts`, `user-stats.ts`) comptent `'fr-FR'` ≠ `'fr'` → stats
     éclatées (même classe de bug que l'itération 217 sur `spokenLanguages`).
   - **Broadcast client** : `originalLanguage: message.originalLanguage` diffuse `'fr-FR'` — le client doit
     re-normaliser pour résoudre le Prisme.
2. **Band-aid dispersé au read.** L'itération 216 a dû ajouter `normalizeLanguageCode(originalLanguage) ?? …`
   dans `_resolveTargetLanguages` **précisément parce que** la valeur stockée n'est pas canonique. Chaque
   nouveau consommateur devrait répéter cette défense. Racine non traitée = dette qui se propage.

## Root causes
- La langue d'origine est **trustée verbatim** au write pour éviter un round-trip détecteur (~266 ms cold),
  mais « trust » a été confondu avec « ne pas normaliser » — or normaliser est **local, pur, sans I/O**.
- Absence de canonicalisation au **seul point d'entrée** où la donnée entre en base (le funnel
  `handleMessage`), reportant la charge sur N sites de lecture.

## Business impact
- Traductions manquées/dupliquées et stats de langue fausses pour tout utilisateur dont la plateforme
  émet un locale région-taggé (la **majorité** : iOS `fr_FR`, web `fr-FR`). Impact produit direct sur le
  Prisme Linguistique (qualité de traduction) et sur les dashboards admin.

## Technical impact
- `Message.originalLanguage` devient **canonique par construction** → SSOT en base. La défense au read
  (216) devient belt-and-suspenders (toujours utile pour les lignes héritées), plus une obligation par
  site. Zéro nouveau helper, zéro nouvelle dépendance de build.

## Risk assessment
**Faible.**
- Seul le **chemin claim** change ; le chemin détecteur (déjà canonique) est intact.
- Repli `normalizeLanguageCode(claim) ?? claim` : un code **irréductible** (ISO 639-3 supporté comme
  `'bas'`, ou 2-lettres inconnu) est **conservé verbatim** → comportement identique à l'actuel, aucune
  perte de donnée, aucun round-trip détecteur ajouté.
- Seuls les claims **réductibles** changent : `'fr-FR'`/`'fr_FR'`/`'FR'` → `'fr'`, `'en-US'` → `'en'`,
  `'zh-Hant-HK'` → `'zh'` — strictement des améliorations.
- `normalizeLanguageCode` est **idempotent** sur les codes déjà canoniques (`'fr'`→`'fr'`) → les messages
  existants et les tests existants (`originalLanguage: 'fr'`) restent inchangés.
- Les gardes vides/whitespace (216) sont **préservées** : la normalisation n'intervient qu'après
  `trim()`-truthy.

## Proposed improvements
1. Importer `normalizeLanguageCode` (SSOT `@meeshy/shared/utils/language-normalize`, déjà consommé par
   `MessageTranslationService`) dans `MessagingService`.
2. Canonicaliser la claim au write : `claimedLanguage ? (normalizeLanguageCode(claimedLanguage) ?? claimedLanguage) : …détecteur`.

## Expected benefits
- `Message.originalLanguage` canonique en base → NLLB source correcte, clé de cache stable, stats de
  langue exactes, broadcast propre. Un seul point de normalisation au lieu de N défenses au read.

## Implementation complexity
Très faible : +1 import, 1 ligne modifiée (branche claim), +2 blocs de tests RED→GREEN.

## Validation criteria
- RED prouvé (branche non patchée) : claim `'fr-FR'` → `message.create` avec `originalLanguage: 'fr-FR'`
  (test échoue en attendant `'fr'`).
- GREEN : claim `'fr-FR'` → `'fr'` persisté, **sans** appel détecteur (`fetch` mocké en rejet dur).
- Non-régression : claim `'bas'` (irréductible) → `'bas'` verbatim ; claim `'fr'` inchangé ; claims
  vide/whitespace → détecteur (gardes 216 intactes). Suite `MessagingService.test.ts` verte + surface
  gateway jest sans régression.

## Future Considerations
- Chemins d'**édition** (`MessageHandler.handleMessageEdit`, `messages-advanced.ts:439`) et **links**
  (`routes/links/messages.ts:196,445`) écrivent aussi `originalLanguage` — auditer pour la même
  canonicalisation si un client peut y injecter un locale brut.
- Migration légère optionnelle : normaliser les lignes `Message.originalLanguage` historiques région-taggées
  (batch idempotent) pour retirer définitivement la défense au read — à isoler (impact stockage historique).
- Préférences in-app (`systemLanguage` & co) : même asymétrie write-verbatim / read-normalize
  (documentée `normalizeInAppLanguage`) — convergence write-boundary candidate (plus large, migration).
