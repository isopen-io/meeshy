# Cycle 94 — Un sous-système E2EE hors du compilateur n'est pas du code, c'est une intention

**Date** : 2026-08-22
**Branche** : `claude/keen-hamilton-70pini`
**Périmètre** : passerelle — `src/dma-interoperability/` (Signal Protocol, interopérabilité DMA)

**Clients touchés** : aucun. Aucun nom d'événement ajouté ni retiré, aucune charge
utile temps réel modifiée, aucune ligne de Socket.IO touchée, aucune route
enregistrée changée. Le sous-arbre corrigé n'est aujourd'hui importé par **rien**
(§1) — le lot est entièrement interne à la passerelle.

---

## 1. Ce que le cycle a trouvé

Le suivi ouvert par le cycle 93 disait : *« `SignalProtocolEngine` émet des IV de
16 octets alors que `SignalSchemas.encryptedMessage.iv` (mort) en attend 12 »*.
C'est vrai. Ce n'était pas le défaut.

En cherchant qui pouvait bien laisser vivre cette divergence, deux lignes
répondent :

```jsonc
// services/gateway/tsconfig.json
"exclude": [ …, "src/dma-interoperability/**/*", … ]

// services/gateway/jest.config.json
"testPathIgnorePatterns": [ …, "<rootDir>/src/dma-interoperability/" ]
```

**Ce sont les deux SEULES occurrences de `dma-interoperability` hors du sous-arbre
lui-même.** Vérifié par balayage sur `.ts`, `.js` et `.json` du dépôt entier :
personne ne l'importe, personne ne l'enregistre, personne ne l'instancie.

Le sous-arbre — **3 231 lignes de production** en 6 modules (X3DH, Double Ratchet,
gestion de clés, moteur, adaptateurs), plus 1 642 lignes réparties en 3 suites de
tests — est donc :

| ce dont il est exclu | par quoi |
|---|---|
| la compilation (`bun run build`) | `tsconfig.json` `exclude` |
| le type-check (`type-check` = même tsconfig) | idem |
| le banc de test | `jest.config.json` `testPathIgnorePatterns` |
| la couverture | `collectCoverageFrom` ne le liste pas |
| l'exécution | aucun importateur |

**Preuve indépendante que rien ne l'a compilé depuis longtemps** : quatre de ses
modules importaient `'../../../shared/prisma/client'` (et un
`'../../../../shared/prisma/client'`), chemins qui résolvent vers
`services/gateway/shared/prisma/client` — un répertoire qui n'existe **ni dans le
dépôt, ni dans l'image Docker** (le `Dockerfile` génère le client Prisma dans
`packages/shared/prisma/client`, et `.gitignore` ignore explicitement
`./**/*/shared/prisma`). Un import qui ne résout nulle part avait survécu.

> **Une exclusion de `tsconfig` est un choix qui ne se relit jamais.** Elle ne
> lève aucun avertissement, ne fait rougir aucune suite, ne baisse aucune
> couverture — puisqu'elle retire le code de tout ce qui mesure. Le seul symptôme
> est l'absence de symptôme.

## 2. Ce que le compilateur a dit dès qu'on l'a laissé regarder

Périmètre inclus dans `tsconfig.json`, sans rien toucher d'autre : **8 erreurs sur
3 231 lignes de production**. Quatre sont du bruit de typage `Buffer` (@types/node ≥ 22 :
`Buffer<ArrayBufferLike>` vs `Buffer<ArrayBuffer>`), et **quatre sont des défauts
d'exécution** :

### 2.1 `SignalProtocolAdapter` construisait X3DH sans ses dépendances

```ts
this.x3dh = new X3DHKeyAgreement();     // TS2554: Expected 2 arguments, but got 0
```

`X3DHKeyAgreement`'s constructor est `(keyManager: SignalKeyManager, prisma:
PrismaClient)`. Sans eux, `initiatorKeyAgreement` lit
`this.keyManager.getIdentityPublicKey()` sur `undefined` : **tout accord de clés
passant par cet adaptateur lève**, à la première ligne utile.

### 2.2 …et appelait deux méthodes PRIVÉES, dont une de la mauvaise forme

```ts
const preKeys = await this.keyManager.generatePreKeyBatch(count);  // TS2341
return preKeys.map((pk: any) => ({ id: pk.id, publicKey: pk.publicKey }));
```

`generatePreKeyBatch` est le générateur BRUT : synchrone, il rend des `KeyPair`
(`{publicKey, privateKey}`) **sans id** — l'attribution d'id vit dans
`generateAndStorePreKeys`, via `getNextPreKeyId()`. Le contrat annoncé par
l'adaptateur, `Array<{id, publicKey}>`, sortait donc avec `id: undefined` sur
chaque entrée. **Le `(pk: any)` est ce qui l'a rendu invisible** : le seul endroit
du chemin où le compilateur aurait pu parler avait été explicitement mis en
sourdine.

### 2.3 Le moteur passait à X3DH un paquet de la FORME de la base, pas du contrat

```ts
await this.x3dh.initiatorKeyAgreement({
  identityKey:           Buffer.from(…),
  signedPreKey:          Buffer.from(…),   // TS2739 — attendu { id, publicKey, signature }
  signedPreKeySignature: Buffer.from(…),   // clé qui n'existe pas dans PreKeyBundle
  onetimePreKey:         …                 // le contrat dit `preKey`
}, …);
```

`PreKeyBundle` déclare `signedPreKey: { id, publicKey, signature }`,
`preKey?: { id, publicKey }` et `registrationId: number`. La forme plate posée ici
recopiait les COLONNES de `DMAEnrollment`. Trois conséquences, cumulatives :

1. `initiatorKeyAgreement` lit `recipientBundle.signedPreKey.publicKey` — `undefined`
   sur un `Buffer` — et le passe à `performDH`. **DH1 et DH3 lèvent.**
2. La clé unique était chargée depuis la base sous le nom `onetimePreKey`, que le
   contrat ne connaît pas : `recipientBundle.preKey` est toujours `undefined`, donc
   **DH4 n'a jamais été calculé** et `preKeyUsed` reste `undefined` — un X3DH à 3
   DH au lieu de 4, sur une pré-clé que le moteur consomme quand même en base.
3. `registrationId` n'était pas passé, et `deriveKeys` fait
   `registrationId.toString()` : **TypeError** sur `undefined`.

Autrement dit, l'établissement de session initiateur était non-fonctionnel de bout
en bout, par trois chemins indépendants. Aucun ne pouvait être vu : le module ne
compile pas, ne tourne pas, n'est appelé par personne.

## 3. Le défaut du suivi — la largeur du nonce

Le dépôt DÉCLARE **trois fois** la largeur du nonce AES-GCM de l'interopérabilité
DMA, et les trois déclarations vivent dans `packages/shared/utils/validation.ts` :

| déclaration | valeur |
|---|---|
| `SignalProtocolLimits.AES_GCM_IV_SIZE` | `12` |
| `SignalValidation.validateEncryptedPayload` | rejette tout IV ≠ 12 octets |
| `SignalSchemas.encryptedMessage.iv` | `z.string().length(16)` — 16 caractères base64 = ces 12 octets |

Et **tous les autres sites AES-GCM du dépôt** disent 12 : `encryption-utils.ts`,
`AttachmentEncryptionService.ts`, `node-crypto-adapter.ts`,
`apps/web/lib/encryption/attachment-encryption.ts`. C'est la taille standard de
GCM (96 bits, la seule qui n'impose pas la dérivation de J0 par GHASH), et celle
qu'emploie libsignal — donc la seule qui interopère, ce qui est l'objet même d'un
répertoire nommé `dma-interoperability`.

Deux sites de production émettaient `crypto.randomBytes(16)` :
`SignalProtocolEngine.encryptMessage` et `SignalProtocolAdapter.encryptMessage`.
Les deux passent maintenant par `SignalProtocolLimits.AES_GCM_IV_SIZE` — la
constante, pas le nombre, pour que la déclaration soit la source et non un jumeau.

**Aucune migration n'est nécessaire, et c'est vérifiable** : sur ces deux chemins
l'IV VOYAGE avec le chiffré (`EncryptedMessage.iv` ;
`{ciphertext, iv, authTag}`), et `decryptMessage` le lit tel quel. Un chiffré émis
sous l'ancienne largeur se déchiffre encore.

### Le troisième site est laissé tel quel, et c'est délibéré

`SignalKeyManager.encryptKey` émet lui aussi un IV de 16 octets, mais son cadre
est **auto-porté à offsets FIXES** :

```ts
return Buffer.concat([iv, authTag, encrypted]);   // iv(16) | authTag(16) | …
const iv = encryptedData.subarray(0, 16);         // le lecteur code les offsets
```

Rien ne distingue `iv(12)|tag(16)` de `iv(16)|tag(16)` dans les octets : changer
l'écrivain sans versionner le lecteur rend **illisible tout matériel de clé déjà
persisté** (`encryptKeyForStorage` alimente `DMASession`). Le nonce y est privé,
jamais sur un fil, donc sans enjeu d'interopérabilité. Migration possible (écrire
un préfixe de version, ou tenter le nouveau cadre puis retomber sur l'ancien —
l'authentification GCM est le discriminant), mais c'est un lot à part : le
bénéfice est cosmétique et le risque porte sur des clés privées. **Consigné en
suivi §6, pas fait ici.**

## 4. Les témoins

`src/__tests__/unit/dma-signal-wire-crypto.test.ts` — **dans un chemin que jest
exécute**, ce que les trois suites du sous-arbre ne sont pas (§5). Six témoins qui
branchent le producteur sur ses propres déclarations :

- le nonce a la largeur que `SignalProtocolLimits` DÉCLARE ;
- la charge utile produite est ACCEPTÉE par `SignalValidation.validateEncryptedPayload` ;
- sa forme base64 est PARSÉE par `SignalSchemas.encryptedMessage` ;
- aller-retour chiffrement/déchiffrement ;
- 32 chiffrements sous la même clé de session ne réemploient aucun nonce ;
- un chiffré altéré est refusé (l'authentification GCM tient).

**Le rouge est prouvé, pas supposé.** Deux mesures :

1. Avant correctif, la suite ne se CHARGE pas : ts-jest rend les trois `TS2554` /
   `TS2341` du §2 en échec de suite (les codes ignorés du `jest.config.json` ne les
   couvrent pas). *Le premier témoin exécutable qui importe ce sous-arbre découvre
   qu'il ne compile pas.*
2. Après correctif, en remettant le littéral `16` dans l'adaptateur :
   **3 échecs / 6** — largeur, validateur, schéma. Les trois autres (aller-retour,
   unicité, altération) restent verts, ce qui est juste : GCM fonctionne avec un
   nonce de 16 octets, il n'interopère simplement pas.

## 5. Ce que ce lot ne fait PAS, et pourquoi

**Les 3 suites du sous-arbre restent ignorées par jest.** Mesuré : levée de
l'ignore, elles rendent **56 échecs sur 114 témoins**
(`DoubleRatchet` : compteurs de statistiques à 0, numéros de message qui ne
suivent pas ; `SignalKeyManager` et `X3DHKeyAgreement` : `new PrismaClient()` réel,
qui suppose une base). Les rendre vertes est un lot en soi, et un lot qui se fait
en regardant chaque échec — pas en desserrant des assertions pour obtenir du vert.
Le chiffre est ici pour que le prochain cycle parte d'une mesure, pas d'une
estimation.

**Le sous-arbre n'entre PAS dans `collectCoverageFrom`.** Y verser 3 231 lignes de production
quasi non couvertes ferait passer la couverture globale sous le seuil
(`lines: 87`) et rougir la CI, ce qui n'a rien à voir avec le défaut corrigé. Il y
entrera quand ses suites tourneront.

**Le sous-arbre n'est PAS supprimé.** C'était l'autre option honnête devant
3 231 lignes de production que rien n'appelle. L'interopérabilité DMA est une obligation
réglementaire européenne, donc une décision de FEUILLE DE ROUTE : supprimer un
sous-système qu'un texte de loi impose n'est pas un arbitrage d'hygiène de code.
Le remettre sous le compilateur est le geste qui coûte le moins et qui rend la
décision possible plus tard, en connaissance de cause.

## 6. Suivis ouverts

- **`SignalKeyManager.encryptKey`** : cadre à offsets fixes portant un IV de
  16 octets (§3). Migration versionnée à faire, ou décision assumée de le laisser.
- **`SignalProtocolAdapter.performX3DH`** garde un `as any` sur son paquet : la
  signature de `ISignalProtocolAdapter` ne transporte pas la signature de la
  pré-clé signée, que `PreKeyBundle` déclare obligatoire.
- **X3DH ne VÉRIFIE jamais `signedPreKey.signature`.** `initiatorKeyAgreement` lit
  `.publicKey` et `.id`, jamais `.signature`. C'est précisément le lien qui
  rattache la pré-clé signée à la clé d'identité : sans lui, l'accord de clés
  n'est pas authentifié. Le moteur CHARGEAIT pourtant la signature depuis la base
  (sous un nom que le contrat ignorait) — elle est désormais posée à sa place dans
  le paquet, prête à être vérifiée. **Le plus important des trois.**
- Les 56 témoins rouges du §5.

## 7. La leçon

> **Une exclusion de `tsconfig` est la seule façon de rendre du code invisible à
> tout ce qui mesure.** Un test qu'on retire fait baisser la couverture ; un
> fichier qu'on supprime laisse un import cassé ; un `any` local laisse le reste du
> fichier sous contrôle. Une ligne d'`exclude`, elle, ne coûte rien à personne et
> retire le code de la compilation, du type-check, du banc et de la couverture d'un
> seul geste — pendant que le répertoire reste là, plein, crédible, et cité dans
> les documents d'architecture.

Et le corollaire de méthode, qui vaut au-delà de ce sous-arbre :

> **Quand un défaut a survécu longtemps, la question utile n'est pas « qui l'a
> écrit ? » mais « qu'est-ce qui aurait dû le voir, et pourquoi s'est-il tu ? ».**
> Le suivi du cycle 93 nommait un IV de 4 octets de trop. Ce qu'il fallait aller
> chercher, c'est ce qui laissait un écart pareil vivre entre trois déclarations
> partagées et leur unique producteur : deux lignes de configuration, écrites une
> fois, jamais relues.
