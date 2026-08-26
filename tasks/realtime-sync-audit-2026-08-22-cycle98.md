# Cycle 98 (2026-08-22) — un message chiffré par un bout se déchiffre enfin à l'autre

## Ce que ce cycle construit

Le cycle 94 a déclaré la « quatrième famille » non outillée : rien ne garde contre
**deux moitiés d'un même protocole chacune cohérente avec elle-même et fausses
l'une contre l'autre**. Le cycle 97 a construit la première confrontation — au
niveau de X3DH, et elle s'arrêtait au HKDF. Tout ce qui COMPOSE ce résultat
ensuite restait hors de portée.

Ce cycle pousse la confrontation jusqu'au bout : `dma-session-roundtrip.test.ts`
fait chiffrer un message par une PRODUCTION réelle et le fait déchiffrer par une
autre. Deux `SignalProtocolEngine` distincts, chacun avec son `SignalKeyManager`,
son X3DH et son Double Ratchet, au-dessus de tables en mémoire.

**Il est tombé du premier coup, et il a fallu réparer QUATRE défauts pour le faire
passer.** Aucun n'était visible aux témoins existants ; tous vivaient dans
l'espace entre deux moitiés correctes.

## Les quatre défauts

### 1. La clé éphémère de l'initiateur ne partait pas sur le fil

`encryptMessage` appelait `initializeSession(rootKey, chainKeySend, chainKeyReceive)`
en OMETTANT le quatrième paramètre — la paire de clés DH que X3DH venait de
produire. `dhRatchetKeyPair` restait donc `undefined`, et l'étape 5 publiait :

```ts
ephemeralPublicKey: ratchetSession.dhRatchetKeyPair?.publicKey || Buffer.alloc(0)
```

Un **buffer vide**. Le répondeur ne pouvait calculer ni DH2, ni DH3, ni DH4 — il
levait `DH operation failed: DH2: identity × ephemeral`.

> C'est MOT POUR MOT le défaut que le cycle 96 a corrigé sur
> `SignalProtocolAdapter` — « La rendre au seul `rootKey` donnait à l'appelant un
> secret que son pair ne pouvait par construction jamais retrouver ». Le moteur,
> sa JUMELLE, l'a gardé deux cycles de plus. La règle « Cette entité a-t-elle une
> JUMELLE ? » (cycle 85) a encore coûté, et pour la même raison : le correctif a
> été écrit là où le défaut avait été TROUVÉ, pas là où sa FORME vivait.

### 2. Le répondeur croisait les chaînes DEUX FOIS

X3DH livre au répondeur des chaînes déjà croisées — c'est la disposition qui fait
que l'émission de l'un est la réception de l'autre :

```ts
// X3DHKeyAgreement.ts:404 — Note: responder's send is initiator's receive and vice versa
chainKeySend: derived.chainKeyReceive,
chainKeyReceive: derived.chainKeySend,
```

`SignalProtocolEngine.responderKeyAgreement` le REDIT à son tour :

```ts
// Note: X3DH already swaps chain keys for responder, so use them directly
```

Et `decryptMessage` — son UNIQUE consommateur, cent lignes plus bas — les
recroisait :

```ts
ratchetSession = this.doubleRatchet.initializeSession(
  session.rootKey,
  session.chainKeyReceive,   // ← second croisement
  session.chainKeySend
);
```

Deux croisements s'annulent. Le répondeur se retrouvait avec **exactement
l'orientation de l'initiateur** : il déchiffrait avec la chaîne d'ÉMISSION de son
pair, donc jamais.

> **L'invariant était écrit DEUX FOIS, chez le producteur, et violé chez l'unique
> consommateur.** Le cycle 97 avait formulé la règle pour deux fichiers (« un
> commentaire qui énonce un invariant de PAIRE ne garde que l'exemplaire qui le
> porte »). Ici les deux commentaires et la violation sont dans la MÊME CLASSE.
> La distance n'est pas ce qui protège ou expose : c'est la présence, ou non, d'un
> témoin qui traverse les deux.

**Et ce défaut ANNULAIT le cycle 97.** Ce cycle-là a fait converger les deux
HKDF ; le moteur redivergeait aussitôt après. Un correctif de symétrie prouvé à
une couche et défait à la couche qui le consomme reste un correctif sans effet.

### 3. L'initiateur consommait une pré-clé unique, le répondeur l'ignorait

`initiateNewSession` prend une pré-clé libre du destinataire et calcule un vrai
DH4. `responderKeyAgreement` passait un littéral :

```ts
undefined, // preKeyId - optional
```

Sans identifiant, le répondeur replie sur `dh4 = Buffer.alloc(32)`. Les deux bouts
concaténaient donc des quatrièmes moitiés différentes — **32 octets nuls contre un
Diffie-Hellman réel**.

La cause profonde était un trou de CONTRAT : `EncryptedMessage` ne portait aucun
identifiant de pré-clé, et le répondeur n'a aucun moyen de le deviner. Le champ
`preKeyId` a donc été ajouté au message, porté par CHAQUE message (pas seulement
le premier : un répondeur qui a perdu son état doit pouvoir rétablir la session
depuis n'importe lequel).

> **Le symptôme ne nommait pas la cause.** L'échec se présentait à la couche GCM,
> `Unsupported state or unable to authenticate data` — c'est-à-dire sous les traits
> d'une ALTÉRATION du message. Même déplacement de diagnostic que le `?? 0` fermé
> au cycle 97, et même leçon : une valeur par défaut plausible transforme un
> désaccord de protocole en soupçon d'attaque.

### 4. Le ratchet asymétrique ne croisait pas — la jumelle dormante

`DoubleRatchet.asymmetricRatchet` tire un bloc de 96 octets du DH et l'attribue
**au même endroit des deux côtés** : `okm[32:64]` en émission, `okm[64:96]` en
réception, que l'on émette ou que l'on reçoive. Les deux bouts prenant la même
moitié dans le même rôle, l'émission de l'un n'est jamais la réception de l'autre.

Mesuré avant correction — la clé racine converge, l'orientation non :

```
alice.rootKey === bob.rootKey : true
alice.send    === bob.receive : false
alice.send    === bob.send    : true     ← la forme exacte du défaut
```

Corrigé en reconduisant à chaque pas la disposition que X3DH applique à l'accord
initial. `asymmetricRatchet` n'a **aucun appelant de production** : c'était un
piège armé, pas une panne. Il est traité dans le même lot au titre de la règle de
la JUMELLE — c'est précisément en le remettant à plus tard qu'on fabrique le
défaut n° 1.

## Les témoins

| fichier | ce qu'il garde | ROUGE prouvé |
|---|---|---|
| `dma-session-roundtrip.test.ts` (5) | deux productions réelles, aller-retour complet | 5/5 tombent sur chacune des mutations 1, 2 et 3, séparément |
| `dma-double-ratchet-symmetry.test.ts` (4) | l'orientation à chaque pas de ratchet | 3/4 tombent ; la clé racine reste verte |

**Les affirmations sont SÉPARÉES, et la séparation EST le diagnostic** : secret
partagé d'abord, orientation ensuite, texte clair enfin. Sur la mutation 4, le
témoin de clé racine reste vert pendant que les trois autres tombent — il localise
la panne dans l'attribution des chaînes plutôt que dans le DH, exactement ce
qu'un unique `expect` sur le texte clair ne dirait pas.

Le troisième témoin du ratchet est écrit **en négatif** (`chainKeySend` de l'un
n'est PAS `chainKeySend` de l'autre) parce que c'est ainsi que le défaut se
présentait : vert sur chaque session prise seule.

## Ce qu'il a fallu débloquer

`SignalProtocolEngine.initialize()` **ne pouvait pas aboutir**. Le moteur
construisait son `SignalKeyManager` sans jamais lui transmettre d'identité, et
n'en possédait aucune à transmettre ; `storeIdentityKey` lève « User ID not set ».
`setUserId` — que `SignalProtocolAdapter`, la jumelle, portait depuis toujours —
a été ajouté à la même place. Sans lui, aucun témoin de bout en bout n'était
possible, ce qui est probablement la raison pour laquelle il n'en existait aucun.

## Le fait qui manquait aux journaux précédents

**Le sous-arbre `dma-interoperability` (9 fichiers) n'est importé de NULLE PART
dans la passerelle.** Vérifié à l'échelle du dépôt : aucun `new SignalProtocolEngine`,
aucun appelant de `performX3DH`, aucune route. Il est compilé (il figure dans
l'`include` de `tsconfig.json`) et jamais exécuté.

Les cycles 95, 96 et 97 y ont corrigé de vrais défauts de sécurité et les ont
décrits en termes de production — « aucun message n'y était déchiffrable » — sans
noter que rien n'atteint ce code. **La gravité y est POTENTIELLE, pas subie.**
C'est une correction à porter à la lecture de ces trois journaux, et le fait le
plus important de ce cycle-ci pour qui décide où va l'effort.

Corollaire de méthode : le bon moment pour rendre ce sous-arbre cohérent est
maintenant, AVANT qu'il soit branché — mais il ne faut pas le compter comme une
panne réparée en production.

## Gates

- `tsc --noEmit` passerelle : **0 erreur**
- Suite complète passerelle : **832 suites, 19197 témoins, 0 échec**
- Suites du sous-arbre (exclues de jest) : 56 échecs sur 114 — **identiques avant
  et après**, mesuré en revertant le changement. Aucune régression introduite ;
  elles étaient déjà rouges, ce qui est vraisemblablement pourquoi elles sont
  exclues.

## Suivis

- [ ] **Les 3 suites du sous-arbre sont rouges et exclues de jest** (hérité c96/c97,
      désormais CHIFFRÉ : 56/114). Tant qu'elles sont exclues, le sous-arbre n'a
      pour garde que les deux témoins de ce cycle et celui du cycle 97, tous placés
      hors du sous-arbre pour cette raison. Les réparer, puis retirer
      `<rootDir>/src/dma-interoperability/` de `testPathIgnorePatterns`.
- [ ] **`asymmetricRatchet` : le suivi des clés distantes reste à instruire.** Le
      croisement est corrigé et prouvé sur UN pas. Au-delà, celui qui reçoit
      remplace sa paire de clés alors que son pair pointe encore l'ancienne clé
      publique ; le ratchet canonique fait DEUX pas de KDF par rotation là où
      celui-ci n'en fait qu'un. Non corrigé faute d'appelant, et parce qu'un
      demi-correctif y serait pire que le défaut nommé.
- [ ] **Le répondeur ne CONSOMME pas la pré-clé unique qu'il utilise.** Relevé en
      branchant `preKeyId` : `responderKeyAgreement` lit la pré-clé et ne la retire
      jamais du pool, alors que « à usage unique » est la propriété qui la définit.
      L'initiateur, lui, la marque `isUsed` dans sa transaction. Un `preKeyId`
      arbitraire venu du fil ne crée pas de faille NOUVELLE (pré-clé absente ⇒ le
      répondeur lève ; pré-clé fausse ⇒ le secret diverge et GCM refuse), mais la
      non-consommation autorise le REJEU de l'accord initial. À traiter avec le
      lot qui branchera le sous-arbre.
- [ ] **`SignalKeyManager.registrationId` tiré au hasard dans le CONSTRUCTEUR**
      (hérité c97), remplacé par la valeur persistée seulement au chargement.
- [ ] **Préfixe `F` et sel du HKDF** (hérité c96/c97) — conformité libsignal.
- [ ] **La quatrième famille est désormais outillée sur UNE paire.** Restent à
      instruire, telles que le cycle 97 les a nommées : sérialiseur/décodeur
      Socket.IO, et producteur passerelle / décodeurs iOS-Android. La forme du
      témoin est acquise : faire se rencontrer deux PRODUCTIONS réelles, et séparer
      les affirmations pour que la première qui tombe nomme la couche.
