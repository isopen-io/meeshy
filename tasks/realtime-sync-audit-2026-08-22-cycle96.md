# Cycle 96 (2026-08-22) — l'accord de clés X3DH s'authentifie

## Le défaut

X3DH n'a qu'une ancre de confiance : la clé d'identité. Tout le reste du paquet
de pré-clés — la pré-clé signée, la pré-clé unique, l'identifiant
d'enregistrement — arrive par un canal que le protocole suppose HOSTILE (ici :
les colonnes `DMAEnrollment` d'un annuaire d'interopérabilité). Ce qui rattache
la pré-clé signée à la clé d'identité, et donc ce qui fait de l'accord un accord
AUTHENTIFIÉ, est `signedPreKey.signature` — et rien d'autre. La spécification
en fait une étape obligatoire (X3DH §3.3) : *« Alice verifies the prekey
signature and aborts the protocol if verification fails »*.

Le dépôt TRANSPORTAIT cette signature de bout en bout :

| étape | site | état |
|---|---|---|
| produite | `SignalKeyManager.generateAndStoreSignedPreKey` (ECDSA-SHA256 sur les octets SPKI de la pré-clé) | ✅ |
| persistée | `DMAEnrollment.signedPreKeySignature` | ✅ |
| relue et placée dans le paquet | `SignalProtocolEngine.initiateNewSession` | ✅ |
| déclarée OBLIGATOIRE | `PreKeyBundle.signedPreKey.signature` | ✅ |
| **vérifiée** | `X3DHKeyAgreement.initiatorKeyAgreement` | ❌ **jamais lue** |

La pré-clé signée était donc acceptée sur la seule parole de l'annuaire.

**Le contraste interne est ce qui rend le défaut lisible.** Le moteur REJETTE
strictement un message dont la signature de CONTENU ne vérifie pas
(`decryptMessage` étape 2, `throw`), pendant que la signature qui établit la
session elle-même n'était confrontée à rien. La couche du message était
authentifiée ; la couche qui lui donne sa clé ne l'était pas.

**Et la suite du sous-arbre le documentait sans le voir** : ses six constructions
de paquet passent `signature: crypto.randomBytes(64)`, et l'accord aboutissait.
Soixante-quatre octets aléatoires étaient une signature acceptable — c'est la
preuve la plus courte que rien ne vérifiait.

### Portée réelle, sans surenchère

Un attaquant qui substitue la pré-clé signée n'obtient PAS le clair : `DH2 =
EK_A × IK_B` exige la moitié privée de la clé d'identité du répondeur, qu'il n'a
pas. Ce qu'il obtient, c'est le choix de `SPK_B` et `OPK_B` pour toute session
nouvelle — donc DH1/DH3/DH4 sous son contrôle, un secret partagé qu'aucune des
deux parties ne partage vraiment, et un empoisonnement durable de session. Et
surtout : la disparition de la seule garantie qui SURVIT à l'épinglage de la clé
d'identité. Épingler `IK_B` ne servait à rien tant que rien ne reliait le reste
du paquet à `IK_B`.

## Le second défaut, même famille : une signature RETIRÉE

`decryptMessage` étape 2 portait :

```ts
if (senderIdentityKey && encryptedMessage.signature.length > 0) { … vérifier, refuser … }
else if (encryptedMessage.signature.length > 0) { … avertir … }
```

Un message arrivant **sans signature** ne franchissait AUCUNE des deux branches :
ni vérification, ni avertissement, ni refus. Le bloc se déclare
`SECURITY: Strict signature verification` ; il n'était strict que contre une
signature FAUSSE, jamais contre une signature RETIRÉE — et le retrait est
strictement moins cher que la forgerie. `signMessage` en pose une sur tout
message émis (étape 4 du chiffrement), donc une signature vide ne peut venir que
de la voie.

Portée, sans surenchère là non plus : l'authentification GCM tient encore le
message à la clé de session, donc ce n'est pas une forgerie ouverte — c'est la
perte du lien d'IDENTITÉ (qui a envoyé), pendant que le code croit l'avoir
vérifié.

> **Les deux défauts sont la même phrase** : une authentification dont
> l'attaquant décide s'il la subit. L'un ne lit jamais la preuve, l'autre
> l'accepte absente.

## Ce qui a été fait

- `X3DHKeyAgreement.initiatorKeyAgreement` **authentifie le paquet en étape 0**,
  avant la génération de l'éphémère et avant tout DH : aucun secret n'est dérivé
  contre une clé non authentifiée. Refus fail-closed sur toute la surface —
  signature absente, clé illisible, exception d'OpenSSL valent REFUS.
- Type d'erreur propre `X3DHSignedPreKeyRejected` : un appelant doit distinguer
  « ce paquet est inauthentique » (signal d'ATTAQUE, ne se réessaie pas) d'un
  accord tombé pour une raison d'exploitation.
- Compteurs `signedPreKeysVerified` / `signedPreKeysRejected`, séparés
  d'`agreementErrors` pour la même raison.
- `SignalProtocolEngine.decryptMessage` : le gate devient `if (senderIdentityKey)`.
  Dès qu'une clé d'identité est fournie, l'appelant DEMANDE l'authentification ;
  le verdict est celui de `verifyMessageSignature`, qui rend déjà `false` sur une
  signature vide comme sur une signature fausse. La branche d'avertissement
  (signature présente, pas de clé pour la vérifier) est intacte.
- `ISignalProtocolAdapter.performX3DH` **transporte la signature** — ce qui
  DISSOUT le `as any` de `SignalProtocolAdapter` : ce cast existait précisément
  parce que le contrat ne portait pas le seul champ qui authentifie l'accord, et
  il masquait cette absence. Suivi ouvert depuis le cycle 95, refermé ici.

### Deux corrections de contrat que le lot emportait

En reprenant la signature de `performX3DH` (zéro appelant dans le dépôt) :

- `ourEphemeralPrivate` était **déclaré et silencieusement ignoré** —
  `initiatorKeyAgreement` génère toujours le sien. Retiré plutôt qu'honoré :
  réemployer un éphémère d'une session à l'autre détruirait la confidentialité
  persistante que cette clé existe pour porter. L'API ne doit pas offrir ce que
  l'appelant ne doit pas faire.
- La méthode ne rendait que `rootKey` et **jetait la clé éphémère publique**, que
  le répondeur doit avoir pour calculer DH2/DH3/DH4. Elle rendait donc à
  l'appelant un secret que son pair ne pouvait, par construction, jamais
  retrouver. Le résultat est maintenant `{ rootKey, ourEphemeralPublic }`.

Positionnel → objet nommé au passage : cinq `Buffer` positionnels dont deux
transposables sans erreur de type est un piège, pas une signature.

## Témoins

`src/__tests__/unit/dma-x3dh-authentication.test.ts` — 11 témoins, **11/11 verts**.

Les suites du sous-arbre restant ignorées par jest (elles montent un
`PrismaClient` réel — vérifié à ce cycle : la suite PEND sans base), les témoins
vivent dans `src/__tests__/unit/`, où le cycle 95 avait déjà posé les siens.

**Le paquet accepté sort du PRODUCTEUR réel**, jamais d'un signeur recopié :
`producedSignedPreKey()` appelle `SignalKeyManager.generateAndStoreSignedPreKey`.
Si quelqu'un change CE QUI est signé, le vérificateur et le témoin ne peuvent pas
dériver ensemble en silence — c'est la règle du CLAUDE.md (« ne JAMAIS
ré-implémenter le corps d'une méthode de production dans un helper de test »)
appliquée à un cas où la copie aurait été très facile à écrire.

### ROUGE prouvé, deux fois, séparément

| mutation | témoins tombés |
|---|---|
| retrait de `assertSignedPreKeyIsAuthentic` | **7 / 11** |
| retour du gate `&& signature.length > 0` | **1 / 11** (celui du retrait) |

Et un ROUGE de chargement avant l'implémentation (TS2305 sur
`X3DHSignedPreKeyRejected`, TS2554 sur `performX3DH`).

## Gates

- `tsc --noEmit` (gateway) : **0**
- suite ciblée : **11 / 11**
- suite complète gateway sous bun : voir le commit

## Suivis ouverts

- **Les 3 suites du sous-arbre restent ignorées par jest.** Mesuré à ce cycle :
  elles PENDENT (PrismaClient réel sans base), elles ne « échouent » même pas.
  Et elles portent maintenant une dette de plus : leurs six constructions de
  paquet passent `crypto.randomBytes(64)` en signature, que le vérificateur
  refuse désormais à juste titre — les instruire une par une, en leur faisant
  produire de vraies signatures, jamais en desserrant la vérification.
- **`SignalProtocolAdapter.performX3DH` fige `registrationId: 0`** alors que
  `deriveKeys` le mêle à l'info HKDF : deux pairs qui ne s'accordent pas sur cet
  entier dérivent des clés différentes. Le moteur passe la vraie valeur ;
  l'adaptateur, non. Non corrigé ici — le porter demande de décider qui est
  autoritatif sur cet identifiant, ce qui est un lot en soi.
- **X3DH n'inclut pas le préfixe `F` (32 octets 0xFF) de la spécification** dans
  l'entrée du HKDF, et le sel est nul plutôt que de longueur de hachage. Écart de
  spécification sans conséquence de sécurité tant que les deux bouts sont ce
  dépôt ; il en aura une le jour d'une interopérabilité réelle avec libsignal.
- **`SignalKeyManager.encryptKey`** : cadre auto-porté à offsets FIXES, migrer
  exige un préfixe de version (cycle 95, inchangé).
- **La quatrième famille n'est toujours pas outillée** — rien ne garde contre une
  déclaration présente, bien formée et FAUSSE contre son producteur. Ce cycle en
  ajoute une variante : rien ne garde non plus contre une preuve TRANSPORTÉE et
  jamais LUE. Les deux se ressemblent : un champ dont la présence rassure et dont
  personne ne vérifie l'effet.
