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
