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
