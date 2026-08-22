# Cycle 97 (2026-08-22) — les deux bouts de X3DH dérivent enfin les mêmes clés

## Le défaut

X3DH ne vaut que par sa SYMÉTRIE. Les quatre Diffie-Hellman sont disposés de
façon que l'initiateur et le répondeur, partant de moitiés différentes, arrivent
au même secret — et le sous-arbre les disposait correctement :

| | initiateur | répondeur | symétrique ? |
|---|---|---|---|
| DH1 | `IK_A_priv × SPK_B_pub` | `SPK_B_priv × IK_A_pub` | ✅ |
| DH2 | `EK_A_priv × IK_B_pub` | `IK_B_priv × EK_A_pub` | ✅ |
| DH3 | `EK_A_priv × SPK_B_pub` | `SPK_B_priv × EK_A_pub` | ✅ |
| DH4 | `EK_A_priv × OPK_B_pub` | `OPK_B_priv × EK_A_pub` | ✅ |

Mais ce secret n'est jamais utilisé tel quel : il traverse un HKDF dont l'`info`
porte un identifiant d'enregistrement, et **les deux bouts n'y mettaient pas le
même**.

```ts
// initiateur — X3DHKeyAgreement.ts:235
this.deriveKeys(concatenated, 'WhatsApp DMA Interoperability', recipientBundle.registrationId)
//                                                             ^^^^^^^^^^^^^^^ celui de BOB

// répondeur — X3DHKeyAgreement.ts:~393
this.deriveKeys(concatenated, 'WhatsApp DMA Interoperability', initiatorRegistrationId ?? 0)
//                                                             ^^^^^^^^^^^^^^^ celui d'ALICE
```

`SignalKeyManager` tire un identifiant par identité (`crypto.randomInt(1, 16383)`),
donc les deux valeurs diffèrent — avec une probabilité de coïncidence de 1/16383.

**Conséquence exacte** : le secret partagé COÏNCIDE, et toutes les clés qui en
sortent DIVERGENT. Clé racine, chaîne d'émission, chaîne de réception : trois
paires de valeurs étrangères l'une à l'autre. Toute session DMA nouvelle
s'établissait sans erreur, et aucun message n'y était déchiffrable.

### Ce qui rend le défaut lisible

**Le répondeur ÉNONÇAIT l'invariant que l'initiateur violait**, trois lignes
au-dessus de son propre appel :

```ts
// Note: both parties must use the same registration ID (initiator's)
// to derive identical shared secrets
```

La règle était juste, écrite, et appliquée d'un seul côté. Le côté qui la portait
en commentaire était le côté conforme.

> **Un commentaire qui énonce un invariant de PAIRE ne garde que l'exemplaire qui
> le porte.** Même famille que la règle « Cette entité a-t-elle une JUMELLE ? »
> (cycle 85) et que la note de `storyAuthorSelect` (cycle 83) : la connaissance
> était dans le dépôt, à l'endroit exact, et ne s'appliquait qu'à la moitié où
> elle était écrite.

### Pourquoi les témoins existants ne pouvaient pas le voir

`X3DHKeyAgreement.test.ts` exerce chaque côté SEUL — et **un côté seul est
toujours cohérent avec lui-même**. Aucun témoin du dépôt ne faisait se rencontrer
un initiateur et un répondeur réels pour comparer leurs clés. C'est exactement la
« quatrième famille » que le cycle 94 déclarait non outillée, et que le cycle 96
a reformulée en suivi : *rien ne garde contre une déclaration présente, bien
formée et FAUSSE contre son producteur* — ici, contre son PAIR.

### Portée, sans surenchère

Le sous-arbre DMA n'est pas sur le chemin de messagerie Meeshy : c'est la couche
d'interopérabilité (règlement européen), et `performX3DH` de l'adaptateur n'a
aujourd'hui aucun consommateur de production. Le défaut n'a donc cassé aucun
utilisateur. Ce qu'il garantissait, c'est que **la première session
d'interopérabilité réelle aurait échoué à 100 %**, et échoué de la pire manière :
pas au moment de l'accord, mais au premier déchiffrement, sous les traits d'une
authentification GCM rompue — c'est-à-dire sous les traits d'une ATTAQUE.

## Le second défaut, même famille : `?? 0`

Le répondeur repliait sur `0` un identifiant absent. Ce repli ne dégrade pas la
session, il en fabrique une que le pair ne retrouvera jamais — et il le fait
SILENCIEUSEMENT, en déplaçant le diagnostic vers la couche GCM, plusieurs
secondes et deux modules plus loin.

> **Un défaut par défaut est un défaut qui ment sur sa cause.** Fail-closed, dans
> la lignée du cycle 96 : refuser à l'endroit où la cause est encore lisible.

## Le troisième : un résultat qui tait ce dont le pair a besoin

`ISignalProtocolAdapter.performX3DH` rendait `{ rootKey, ourEphemeralPublic }`.
Dès lors que l'identifiant de l'initiateur ENTRE dans la dérivation, un pair qui
ne l'a pas ne peut rien dériver — le résultat est incomplet exactement comme il
l'était pour la clé éphémère publique, que le cycle 96 y a ajoutée pour cette
raison mot pour mot. Corrigé dans le même lot : `ourRegistrationId` accompagne
désormais la clé éphémère.

## Quelle valeur est autoritative, et pourquoi

Les deux bouts doivent lier le même entier ; il fallait choisir lequel. **Celui de
l'INITIATEUR**, pour une raison qui n'est pas de convention :

| | l'initiateur le connaît | le répondeur le connaît | couvert par une signature |
|---|---|---|---|
| id de l'initiateur | chez lui (`getRegistrationId`) | dans l'inscription de l'expéditeur | — (jamais transporté dans le paquet) |
| id du destinataire | **seulement par le paquet de pré-clés** | chez lui | ❌ **non** |

`PreKeyBundle.registrationId` arrive par un canal que X3DH suppose HOSTILE, et la
signature de la pré-clé signée ne couvre QUE les octets SPKI de cette pré-clé —
pas ce champ. Le lier donnerait à l'annuaire un levier pour désaccorder deux pairs
**sans jamais toucher à une signature**, donc sans franchir la vérification que le
cycle 96 vient de poser. Le choix de l'initiateur ferme cette porte par
construction.

Le champ reste dans le paquet comme étiquette de session ; il n'entre plus dans
aucune dérivation, et un témoin garde le fait qu'y toucher ne déplace rien.

## Ce qui a été fait

- `initiatorKeyAgreement` lie `this.keyManager.getRegistrationId()` — le nôtre —
  au lieu de `recipientBundle.registrationId`.
- `responderKeyAgreement` : `?? 0` remplacé par `assertInitiatorRegistrationId`,
  fail-closed sur absent ET sur non-entier. Le paramètre devient **requis au
  typage** (première garde) ; la garde runtime subsiste parce que la valeur
  traverse une frontière que le typage ne couvre pas — elle vient d'une colonne
  (`DMAEnrollment.registrationId`).
- `ISignalProtocolAdapter.performX3DH` rend `ourRegistrationId`.
- `SignalProtocolAdapter` : le `registrationId: 0` du paquet est documenté comme
  étiquette, avec l'interdiction explicite d'y injecter l'identifiant du pair —
  ce serait rouvrir la porte fermée ci-dessus. **Le suivi du cycle 96 est refermé
  par là**, et pas comme il l'annonçait : ce `0` n'était pas à « porter », il
  était à retirer de la dérivation.

## Témoins

`services/gateway/src/__tests__/unit/dma-x3dh-derivation-symmetry.test.ts` (5) —
il confronte deux PRODUCTIONS réelles, la pré-clé signée sortant du producteur
réel (`generateAndStoreSignedPreKey`) et franchissant la vérification du cycle 96.

Le premier témoin sépare volontairement les deux affirmations — « le secret
partagé coïncide » puis « les clés dérivées coïncident ». **Cette séparation est
le diagnostic** : elle localise la panne dans le HKDF plutôt que dans les DH, là
où un unique `expect` sur la clé racine aurait laissé chercher partout.

**ROUGE prouvé deux fois, séparément :**

| mutation | effet |
|---|---|
| état initial, avant tout correctif | **4/5 tombent** — seul « le secret partagé coïncide » passe, ce qui isole la panne au HKDF |
| retour de `recipientBundle.registrationId` sur le seul initiateur | **3/5 tombent** — les deux témoins de symétrie et celui de l'altération ; le fail-closed tient |

## Gates

- `tsc --noEmit` gateway : 0 erreur
- `dma-x3dh-derivation-symmetry` + `dma-x3dh-authentication` : 16/16
- suite complète gateway : voir § Résultat de la passe complète

Deux témoins du cycle 96 ont dû recevoir `getRegistrationId` sur leur double de
gestionnaire de clés : l'initiateur lit désormais légitimement une seconde chose
de lui. Le docstring qui affirmait « ne lit qu'UNE méthode » a été corrigé — une
affirmation, donc à vérifier (cycles 86 bis / 93 / 94).

## Suivis ouverts

- [ ] **Le préfixe `F` et le sel du HKDF** (hérité du cycle 96) — X3DH §2.2 exige
      32 octets `0xFF` en tête de l'entrée du HKDF, et un sel de longueur de
      hachage plutôt que nul. Sans conséquence tant que les deux bouts sont ce
      dépôt ; en aura une à la première interopérabilité réelle avec libsignal.
      **Et l'`info` de libsignal ne porte aucun identifiant d'enregistrement** :
      le lot qui alignera sur la spécification retirera ce que ce cycle-ci vient
      de rendre cohérent. C'est le bon ordre — cohérent d'abord, conforme ensuite.
- [ ] **Les 3 suites du sous-arbre restent ignorées par jest** (hérité du cycle
      96) : elles PENDENT sur un `PrismaClient` réel sans base, elles n'échouent
      même pas. Leurs paquets `randomBytes(64)` sont désormais refusés à juste
      titre. Les instruire une par une en leur faisant produire de VRAIES
      signatures — jamais en desserrant la vérification.
- [ ] **`SignalKeyManager.registrationId` est tiré au hasard dans le
      CONSTRUCTEUR** et n'est remplacé par la valeur persistée qu'au chargement
      (`loadFromStorage`). Un gestionnaire non initialisé lie donc un entier que
      rien n'a publié. Le moteur initialise toujours le sien, donc pas de panne
      constatée — mais c'est la même forme que le `?? 0` fermé ici : une valeur
      par défaut plausible là où l'absence devrait se déclarer.
- [ ] **La quatrième famille reste non outillée**, et ce cycle en donne la
      formulation la plus nette : rien ne garde contre deux moitiés d'un même
      protocole qui sont chacune cohérente avec elle-même et fausses l'une contre
      l'autre. Le témoin posé ici est manuel et ne couvre que X3DH. Les paires du
      dépôt qui appellent le même traitement : chiffrement/déchiffrement du
      Double Ratchet, sérialiseur/décodeur d'événements Socket.IO, producteur
      gateway / décodeur iOS-Android.

## Suivis hérités des cycles 94–95, toujours ouverts

- [ ] `GET /messages/:messageId` n'agrège pas les réactions de pièce jointe
      (relation `reactions` brute chargée, contrat = `reactionSummary` +
      `currentUserReactions`).
- [ ] `APIMessage.translations` en `try` non tolérant quand ses trois voisins
      sont en `try?` (lot iOS).
