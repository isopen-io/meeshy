# Iteration 242 — `SignalSchemas.encryptedMessage.iv` exigeait 24 caractères base64 (long. d'un authTag) alors qu'un IV de 12 octets en base64 en fait 16 — le gate wire aurait rejeté 100 % des IV réels

## Protocole (démarrage)
`main` @ `65015b6e` (dernier commit : `Merge pull request #3264 from isopen-io/claude/keen-hamilton-ox4upm`).
Branche `claude/brave-archimedes-lkupts` réalignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts` (3861 paquets ; le postinstall
`grpc-tools` échoue derrière le proxy sortant, cf. CLAUDE.md — sans impact), puis
`cd packages/shared && npx prisma generate --generator client && bun run build`. Suite
`packages/shared/__tests__/validation.test.ts` verte au départ (54 tests).

**Audit anti-doublon** (13 PRs ouvertes au départ, toutes de `jcnm` : #3242, #3243, #3245, #3247,
#3249, #3250, #3253, #3255, #3257, #3259, #3262, #3263, #3265). Fichiers touchés relevés un par un :
`webrtc-service.ts`, `composer-references.ts` / `mention-parser.ts`, `time-remaining.ts`,
`mentions-schemas.ts`, `concurrency.ts`, `role-types.ts`, `focal-row-utils.ts`, `storyEffectsV3.ts`,
`time-range.ts` / `attachment-validators.ts` / `call-schemas.ts` / `messages-schemas.ts`. **Aucune PR
ouverte ne touche `packages/shared/utils/validation.ts` ni `packages/shared/__tests__/validation.test.ts`**
— zéro chevauchement de fichier. Cible trouvée par un audit sous-agent ciblé des schémas Zod et des
utilitaires purs `packages/shared/utils/`, hors des classes déjà saturées (normalisation de langue,
invariant `endMs>=startMs`, casse des rôles, clamp de pagination, garde `Number.isFinite`).

## Sélection : **Priorité 1 — durcissement de contrat (schéma de validation chiffrement), défaut prouvable par arithmétique**

`SignalSchemas` (`packages/shared/utils/validation.ts:1102`) est la famille de schémas Zod du
protocole Signal (frontière de confiance du chiffrement E2EE). Son schéma `encryptedMessage`
modélise le tuple `{ ciphertext, iv, authTag, messageNumber }` du message chiffré transmis sur le
fil. Le champ `iv` y était contraint à **24 caractères** — la longueur d'un authTag, pas d'un IV.

## Current state (avant correctif)

```ts
encryptedMessage: z.object({
  ciphertext: z.string().min(1, 'Ciphertext is required'),
  iv: z.string().length(24, 'IV must be 12 bytes base64'),      // 12 bytes = 24 base64 chars  ← FAUX
  authTag: z.string().length(24, 'Auth tag must be 16 bytes base64'), // 16 bytes with padding
  messageNumber: z.number().int().min(0).max(SignalProtocolLimits.MAX_MESSAGE_NUMBER),
}),
```

## Problems identified

1. **Arithmétique base64 fausse — le gate rejette tout IV réel.** Un IV AES-256-GCM fait **12 octets**
   (`encryption-utils.ts:20` `const IV_LENGTH = 12;`), et il est **base64-encodé** avant transmission
   (`encryption-utils.ts:41` `iv: uint8ArrayToBase64(result.iv)`). Or `12` octets en base64 = `ceil(12/3)*4`
   = **16 caractères** (12 est divisible par 3 → aucun padding). Le schéma exigeait `.length(24)` :
   `Buffer.alloc(12).toString('base64').length === 16 !== 24` → **tout IV valide serait refusé**.
   Le commentaire in-line « `12 bytes = 24 base64 chars` » est arithmétiquement faux (24 caractères
   base64 décodent ~18 octets, jamais 12).
2. **Drift copié depuis le champ jumeau `authTag`.** L'authTag AES-GCM fait 16 octets → base64 =
   `ceil(16/3)*4` = **24 caractères** (padding `==`). `authTag.length(24)` est **correct**. La preuve
   que le schéma est bien base64 (et non hex) tient à ce champ : 16 octets en hex feraient 32
   caractères, pas 24. Donc `24` est la constante d'un authTag, recopiée verbatim sur `iv` sans
   corriger pour la taille de 12 octets — un classique copier-coller entre champs voisins.
3. **Défaut latent, mais mine amorcée.** `SignalSchemas` est **exporté sans consommateur vivant**
   (grep exhaustif `SignalSchemas` sur `packages/`, `services/`, `apps/` → seule la définition). Le
   défaut ne casse rien aujourd'hui au runtime ; mais l'étape naturelle suivante d'un « contract
   hardening » — brancher ce schéma pour valider les payloads réels — provoquerait un **rejet de
   100 % des messages Signal valides** (panne totale du chiffrement E2EE sur le fil). Fermer la porte
   maintenant retire la mine.

## Root causes
- Le champ `iv` a été écrit en clonant la contrainte `.length(24)` de son voisin `authTag` (même
  fichier, deux lignes plus bas), en supposant à tort que les deux valeurs partagent la même longueur
  base64. Elles ne la partagent pas : 12 octets ≠ 16 octets. Aucun test ne référençait
  `SignalSchemas.encryptedMessage` (seul le validateur runtime buffer-based `validateEncryptedPayload`
  était testé, avec `iv: Buffer.alloc(12), authTag: Buffer.alloc(16)` — la bonne vérité de terrain),
  ce qui a laissé la constante fausse passer inaperçue.

## Business impact
- **Latent aujourd'hui, catastrophique si activé.** Aucune régression utilisateur en vol (schéma non
  branché). Mais la valeur du correctif est préventive et de sûreté : un schéma de validation de
  chiffrement dont la contrainte de longueur contredit la réalité du wire est une bombe à retardement.
  Le fix aligne le contrat sur la donnée réellement émise et rend le commentaire véridique.

## Technical impact
- **Runtime :** nul hors branchement du schéma (aucun consommateur). Le correctif est un changement
  d'une constante (`24 → 16`) + correction de deux commentaires.
- **Cohérence :** le schéma wire (`SignalSchemas.encryptedMessage`) et le validateur runtime
  (`SignalValidation.validateEncryptedPayload`, buffers 12/16) décrivent désormais **le même** tuple.
- **Coverage :** nouveau bloc `describe('SignalSchemas.encryptedMessage — base64 length invariants')`
  (4 tests) : un IV de 12 octets base64 (16 car.) est **accepté**, un authTag de 16 octets base64
  (24 car.) est **accepté**, un IV de mauvaise taille (16 octets → 24 car.) est **rejeté**, un authTag
  de mauvaise taille (12 octets → 16 car.) est **rejeté**. Le schéma est désormais référencé par un
  test — plus de drift silencieux possible.
- **`tsc` :** 0 nouvelle erreur. Type inféré `z.infer<typeof SignalSchemas.encryptedMessage>`
  inchangé (`{ ciphertext: string; iv: string; authTag: string; messageNumber: number }`).

## Risk assessment
- **Très faible.** Une constante de longueur resserrée de `24` vers `16` sur un champ dont la seule
  valeur légitime a exactement 16 caractères. Aucun consommateur en production. Aucun émetteur ne
  produit d'IV de 24 caractères base64 (ce serait un IV de 18 octets, hors spec AES-GCM). Rollback =
  revert du commit unique.

## Proposed improvements (livrées)
1. **RED** : bloc de 4 tests référençant `SignalSchemas.encryptedMessage` — 3 tombent rouges sur
   `main` (l'IV valide de 16 car. est rejeté ; l'IV erroné de 24 car. est accepté).
2. **GREEN** : `iv: z.string().length(16, 'IV must be 12 bytes base64')` + commentaires corrigés
   (`12 bytes base64 = 16 chars (no padding)` / `16 bytes base64 = 24 chars (padded)`).

## Expected benefits
- Le gate de chiffrement wire accepte les IV réels et rejette les tailles hors spec — contrat correct.
- Le schéma wire et le validateur runtime convergent sur le même tuple 12/16 octets.
- Commentaire arithmétiquement véridique (retrait d'une doc trompeuse pour tout futur lecteur).

## Implementation complexity
- **Triviale.** 1 constante + 2 commentaires en production, 1 bloc de 4 tests. 2 fichiers.

## Validation criteria
- [x] RED prouvé : 3 tests rouges sur `main` (`SignalSchemas.encryptedMessage` rejette l'IV valide de
      16 car. et accepte l'IV erroné de 24 car.).
- [x] GREEN : `validation.test.ts` 58/58.
- [x] Suite `packages/shared` vitest complète : **2352/2352** verts (96 fichiers) — aucune régression.
- [x] `tsc --noEmit -p tsconfig.json` (shared) : 0 erreur.
- [x] `bun run build` (shared) : OK ; `dist/utils/validation.js` porte `.length(16`.
- [ ] CI verte sur la branche (gate lint/bun réel).

## Améliorations futures (non retenues cette itération)
- **Brancher `SignalSchemas.encryptedMessage`** au chemin de validation des payloads Signal wire
  (aujourd'hui non consommé) — refactor de sûreté à peser séparément, avec audit des émetteurs
  client (web + iOS) pour confirmer la parité exacte du tuple `{ ciphertext, iv, authTag,
  messageNumber }`.
- **Parité base64 des autres champs `SignalSchemas`** (`preKeyBundle.*`, `sessionEstablish.*`) :
  la plupart sont `min(1)` sans longueur fixe (clés de taille variable), donc pas de contrainte de
  longueur à auditer — mais confirmer qu'aucun autre champ ne porte une longueur base64 mal calculée.
- **Brique partagée `base64Length(bytes)`** pour dériver la longueur attendue au lieu de coder la
  constante en dur — rendrait ce drift structurellement impossible. À peser (touche plusieurs
  schémas).
