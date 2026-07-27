# Iteration 219 — `originalLanguage` persisté verbatim sur les 2 chemins share-link (`prisma.message.create`) : canonicalisation au write boundary (SSOT `normalizeLanguageCode`)

## Protocole (démarrage)
`main` @ `7c0e93fd` (dernier commit : feat android/conversations UserCategoryCatalog cache-first #2361).
Branche `claude/brave-archimedes-6s4qmo` réinitialisée sur `origin/main` (0 commit d'écart).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` : le postinstall `turbo run generate` reste bloqué par le proxy
(connu depuis l'itération 216) → tué manuellement ; les dépendances runtime + `@prisma/client` du
store `.bun` sont présentes. Le jest gateway mappe `@meeshy/shared/(.*)` → **source** (pas `dist`),
donc l'import de `normalizeLanguageCode` est transpilé par ts-jest à la volée (aucun rebuild `dist`).

PRs ouvertes au démarrage — **audit anti-doublon** : aucune PR ouverte ne touche
`services/gateway/src/routes/links/**`. Cette itération finalise le **write-boundary sweep** de langue
initié par 216 (read) → 218 (funnel `MessagingService`) → **219 (chemins share-link, hors funnel)**.
Zéro chevauchement de fichier.

## Sélection : **Priorité 1 — correctness + Single Source of Truth (couche langue, write boundary)**

Candidat **explicitement légué** par l'itération 218 (« Future Considerations ») :
> - **links** (`routes/links/messages.ts:196,445`) écrivent aussi `originalLanguage` — auditer pour la
>   même canonicalisation si un client peut y injecter un locale brut.

**Audit du legs :**
- Chemin **édition** (`MessageHandler.handleMessageEdit`) : **écarté après vérification** — il ne persiste
  aucune langue fournie par le client (`update` de `content`/`isEdited`/`editedAt`/`translations`
  uniquement) ; `originalLanguage` est **relu depuis la base** (déjà canonique via 218). Non concerné.
- Chemins **share-link** (`routes/links/messages.ts:196` anonyme, `:445` enregistré) : **confirmés
  défectueux** — les deux `prisma.message.create` persistent `body.originalLanguage` **verbatim**.

## Current state (avant correctif)

Le schéma Zod partagé des deux routes d'envoi share-link (`sendMessageSchema`, `routes/links/types.ts:64`) :
```ts
originalLanguage: z.string().default('fr'),   // ← accepte n'importe quelle string verbatim
```
Les deux handlers parsent ce schéma puis écrivent le résultat brut :
```ts
// links/messages.ts:196 (anonyme via x-session-token) ET :445 (utilisateur enregistré)
const message = await fastify.prisma.message.create({
  data: { …, originalLanguage: body.originalLanguage, … },   // ← locale brut persisté
});
```
Ces chemins **contournent entièrement** `MessagingService.handleMessage` (le funnel corrigé en 218) :
ils appellent `prisma.message.create` directement. Un client émettant son locale plateforme brut
(iOS `fr_FR`, web `fr-FR`, `Accept-Language` `en-US`, `zh-Hant-HK`) persiste ce tag région/script
non canonique dans `Message.originalLanguage`.

## Problems identified
- `Message.originalLanguage` non canonique en base pour tout message envoyé via lien partagé →
  mêmes symptômes que 218 : filtre anti-auto-traduction manqué (`fr-FR !== fr` ⇒ NLLB `fr→fr`
  corrompt le texte), clé de cache de traduction instable (`fr-FR` vs `fr`), stats de langue faussées,
  broadcast d'un code non canonique aux clients.
- Asymétrie avec le funnel principal : depuis 218 un message socket/REST voit son `originalLanguage`
  canonicalisé, mais **le même message via share-link ne l'est pas** → base hétérogène selon la surface.

## Root causes
- La langue d'origine est **trustée verbatim** au write (défaut `'fr'`, `z.string()` sans transform) —
  « trust » confondu avec « ne pas normaliser », alors que normaliser est **local, pur, sans I/O**.
- 218 a canonicalisé le **funnel unique** (`handleMessage`) mais les routes share-link écrivent
  **directement** via Prisma, hors funnel → non couvertes par 218.

## Business impact
- Impact direct Prisme Linguistique (qualité de traduction) pour les conversations à liens partagés —
  cœur du produit anonyme/onboarding Meeshy. Un participant anonyme dont la plateforme émet un locale
  région-taggé (la majorité) voyait ses messages mal routés.

## Technical impact
- `Message.originalLanguage` devient **canonique par construction** sur **toutes** les surfaces d'écriture
  (funnel 218 + share-link 219). La défense au read (216) reste belt-and-suspenders pour les lignes
  héritées. Zéro nouveau helper, zéro nouvelle dépendance de build.

## Risk assessment
**Très faible.**
- Placement dans le schéma Zod = point de canonicalisation **unique** partagé par les 2 sites
  `message.create` (DRY, un 3e site futur parsant `sendMessageSchema` est automatiquement couvert).
- Repli `normalizeLanguageCode(v) ?? v` (identique à 218) : un code **irréductible** (ISO 639-3 supporté
  `'bas'`, ou 2-lettres inconnu `'xx'`) est **conservé verbatim** → comportement identique à l'actuel,
  aucune perte de donnée, aucun round-trip détecteur ajouté.
- Seuls les codes **réductibles** changent : `'fr-FR'`/`'fr_FR'`/`'FR'` → `'fr'`, `'en-US'` → `'en'`,
  `'zh-Hant-HK'` → `'zh'` — strictement des améliorations.
- `normalizeLanguageCode` **idempotent** sur les codes canoniques (`'fr'`→`'fr'`) → le défaut `'fr'` et
  le test existant `originalLanguage: 'en'` restent inchangés.
- Type `SendMessageInput` inchangé (`z.infer` de la sortie du transform = `string`).

## Proposed improvements
1. Importer `normalizeLanguageCode` (SSOT `@meeshy/shared/utils/language-normalize`, déjà consommé par
   6 autres fichiers gateway) dans `routes/links/types.ts`.
2. Canonicaliser au write via un `.transform` sur le champ du schéma :
   `z.string().default('fr').transform((v) => normalizeLanguageCode(v) ?? v)`.

## Expected benefits
- `Message.originalLanguage` canonique en base sur les 2 chemins share-link → NLLB source correcte,
  clé de cache stable, stats de langue exactes, broadcast propre. Homogénéité write-boundary complète
  avec le funnel 218.

## Implementation complexity
Très faible : +1 import, 1 champ modifié (transform), +2 blocs de tests RED→GREEN.

## Validation criteria
- **RED prouvé** (schéma non patché, fix stashé) : `originalLanguage: 'fr-FR'` → parse conserve
  `'fr-FR'` (test échoue en attendant `'fr'`). Confirmé : 1 failed / 31 passed.
- **GREEN** : `'fr-FR'/'fr_FR'/'FR'` → `'fr'`, `'en-US'` → `'en'`, `'zh-Hant-HK'` → `'zh'`.
- **Non-régression** : `'bas'`/`'xx'` (irréductibles) → verbatim ; défaut `'fr'` inchangé ;
  `'en'` inchangé. `types.test.ts` 32/32 vert ; suite `routes/links/**` 229/229 verte.

## Future Considerations
- Migration légère optionnelle : normaliser les lignes `Message.originalLanguage` historiques
  région-taggées (batch idempotent) — à isoler (impact stockage historique) — retirerait la défense
  au read (216).
- Préférences in-app (`systemLanguage` & co) : même asymétrie write-verbatim / read-normalize
  (documentée `normalizeInAppLanguage`) — convergence write-boundary candidate (plus large, migration).
- Attachements share-link (`POST /links/:identifier/messages/attachments` s'il existe) : auditer un
  éventuel 3e write direct de langue hors funnel.
# Iteration 219 — Canonicalisation `originalLanguage` aux 3 write boundaries restants (édition REST + messages via lien) : parité complète avec le funnel 218i

## Protocole (démarrage)
`main` @ `41d57f95` (dernier commit : feat android/conversations catalogue socket sync #2365).
Branche `claude/brave-archimedes-mmg8fn` réinitialisée sur `origin/main`.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). `bun install` ; `prisma generate --generator client`. Le jest gateway mappe
`@meeshy/shared/(.*)` → **source** `packages/shared/$1` (pas `dist`), donc l'import de
`normalizeLanguageCode` est transpilé par ts-jest à la volée — pas de rebuild `dist` requis.

## Sélection : **Priorité 1 — extension directe de l'itération 218 (correctness + SSOT)**

Candidat **explicitement légué** par l'itération 218 (« Améliorations futures ») :
> - Auditer les chemins d'édition (`handleMessageEdit`, `messages-advanced.ts`) et links pour la même
>   canonicalisation.

L'itération 218 a canonicalisé `Message.originalLanguage` au **seul funnel de création**
(`MessagingService.handleMessage`). Mais **trois chemins d'écriture supplémentaires** persistent
`originalLanguage` **hors** de ce funnel, directement via `prisma.message.{create,update}`. Ils
n'étaient donc **pas** couverts par 218i.

## Current state (avant correctif)

Audit exhaustif des sites qui écrivent `Message.originalLanguage` hors funnel :

1. **`routes/conversations/messages-advanced.ts:216`** — édition REST (`PUT /conversations/:id/messages/:messageId`).
   ```ts
   const { content, originalLanguage = 'fr' } = bodyResult.data; // EditMessageBodySchema
   ...
   await prisma.message.update({ data: { content, originalLanguage, isEdited: true, ... } });
   ```
   `EditMessageBodySchema.originalLanguage = CommonSchemas.language.optional()`, dont le regex
   `^[a-z]{2,3}(-[A-Z]{2})?$` **accepte** `'fr-FR'`, `'en-US'`, `'pt-BR'` sans les normaliser.
   → une édition **réécrit** un `originalLanguage` déjà canonique avec un locale brut client.

2. **`routes/links/messages.ts:191`** — message anonyme via lien partagé (`POST /links/:id/messages`).
   `originalLanguage: body.originalLanguage`, où `sendMessageSchema` (links/types.ts:64) =
   `z.string().default('fr')` — **aucune** validation de forme, **aucune** normalisation. Le client
   peut injecter n'importe quel locale brut.

3. **`routes/links/messages.ts:440`** — message d'un utilisateur enregistré via lien
   (`POST /links/:id/messages/auth`). Même `body.originalLanguage` verbatim, même schéma laxiste.

Le chemin socket `MessageHandler.handleMessageEdit` (ligne 625) **n'écrit pas** `originalLanguage`
(il ne touche que `content`, `isEdited`, `editedAt`, `translations`) → déjà correct, hors périmètre.

## Problems identified

Même classe de bug que 218i, sur les 3 sites hors funnel :
1. **Fragmentation NLLB / cache / stats.** `originalLanguage` est la langue **source** de la traduction
   (mapping `'fr' → 'fra_Latn'`), la clé de cache (`TranslationCache.generateKey(id, target, originalLanguage)`),
   et une dimension de stats par langue. Un `'fr-FR'` persisté ne matche pas `'fr'` → source mal résolue,
   miss de cache/doublons, stats éclatées.
2. **L'édition REST est un régresseur silencieux.** Un message créé via le funnel (canonique `'fr'`)
   qui est **édité** via REST avec un locale brut voit son `originalLanguage` **rétrogradé** de `'fr'`
   vers `'fr-FR'` — 218i annulé pour ce message.
3. **Les liens partagés sont la surface la moins protégée** : `z.string().default('fr')` accepte tout.

## Root causes
- 218i a canonicalisé le funnel **unique de création** mais le codebase a **quatre** write boundaries
  pour `originalLanguage` (funnel + édition REST + 2 chemins liens). La normalisation doit vivre à
  **chaque** frontière d'écriture, pas seulement à la principale.
- Les schémas Zod de ces routes **valident la forme** (ou pas du tout, pour les liens) mais ne
  **canonicalisent** pas — cohérent avec la doc `attachment-validators.ts` : « valide la forme BCP-47
  brute (sans normaliser) ». La normalisation est une responsabilité **applicative** au write.

## Business impact
- Traductions manquées/dupliquées et stats fausses pour tout message **édité** ou **envoyé via lien**
  par une plateforme émettant un locale région-taggé (iOS `fr_FR`, web `fr-FR` — la majorité). Impact
  direct sur le Prisme Linguistique et les dashboards admin, identique à 218i mais sur des surfaces
  non couvertes.

## Technical impact
- `Message.originalLanguage` devient canonique par construction sur **tous** les chemins d'écriture →
  SSOT en base complète. Zéro nouveau helper, zéro nouvelle dépendance de build (import de
  `normalizeLanguageCode`, déjà exporté sur `main` et déjà consommé par `MessageTranslationService`
  et `MessagingService`).

## Risk assessment
**Faible.**
- Repli `normalizeLanguageCode(x) ?? x` : un code **irréductible** (ISO 639-3 supporté comme `'bas'`,
  ou 2-lettres inconnu) est **conservé verbatim** → comportement identique à l'actuel, aucune perte de
  donnée, aucun round-trip détecteur (pur, local, sans I/O).
- Seuls les claims **réductibles** changent : `'fr-FR'` → `'fr'`, `'en-US'` → `'en'`, `'pt-BR'` → `'pt'`
  — strictement des améliorations.
- `normalizeLanguageCode` est **idempotent** sur les codes déjà canoniques → messages existants et
  tests existants (`originalLanguage: 'fr'`) inchangés.

## Proposed improvements
1. Importer `normalizeLanguageCode` dans `messages-advanced.ts` et `links/messages.ts`.
2. Canonicaliser au write sur les 3 sites : `normalizeLanguageCode(x) ?? x`.

## Expected benefits
- `Message.originalLanguage` canonique quel que soit le chemin d'entrée (funnel, édition, lien) → NLLB
  source correcte, clé de cache stable, stats exactes, plus de rétrogradation à l'édition.

## Implementation complexity
Très faible : +2 imports, 3 write boundaries normalisées, +5 blocs de tests RED→GREEN
(3 canonicalisation + 2 non-régression irréductible).

## Validation criteria
- **RED prouvé** (source revert temporaire) : les 3 tests de canonicalisation échouent
  (`'fr-FR'`/`'en-US'`/`'pt-BR'` persistés verbatim) ; les tests irréductibles restent verts.
- **GREEN** : `'fr-FR'` → `'fr'` (édition), `'en-US'` → `'en'` (lien anon), `'pt-BR'` → `'pt'` (lien auth).
- **Non-régression** : `'bas'` → `'bas'` verbatim sur édition + lien anon ; suites
  `conversation-messages-advanced` + `links-messages` vertes (132 tests) ; smoke gateway
  (34 suites / 554 tests messaging+links+conversations) vert ; tsc gateway sans erreur nouvelle
  (seule l'erreur pré-existante `sanitize.ts` `@meeshy/shared` bare-import subsiste).

## Future Considerations
- **Migration idempotente** des `Message.originalLanguage` historiques région-taggés (batch) pour
  retirer définitivement la défense au read (216i) — à isoler (impact stockage historique).
- **Convergence write-boundary des préférences in-app** (`systemLanguage` & co) : même asymétrie
  write-verbatim / read-normalize (documentée `normalizeInAppLanguage`) — candidate plus large.
- **`participant.language`** : audité côté lecture (`normalizeLanguageForDedup` en 217i) ; vérifier si
  un chemin d'écriture persiste un locale brut de participant (join anonyme via lien).
