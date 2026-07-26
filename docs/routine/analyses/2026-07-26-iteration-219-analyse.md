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
