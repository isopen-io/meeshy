# Écrire depuis Meeshy à un ami sur WhatsApp — interopérabilité DMA (design)

> Directive porteur du 2026-11-08.
> Statut : **validé par le porteur le 2026-11-08**. Pilotage : issue parapluie [#17007](https://github.com/isopen-io/meeshy/issues/17007),
> milestone n° 257 « On écrit depuis Meeshy à un ami sur WhatsApp », issues filles par lot.
> Routine : `.claude/workflows/meeshy-dma-whatsapp.js`, relancée toutes les 5 h.

## 1. Intention

Un utilisateur de Meeshy écrit, depuis Meeshy, à un ami qui n'a que WhatsApp — et
l'ami lui répond depuis WhatsApp. Rien de ce que Meeshy-Meeshy fait aujourd'hui ne
change, ne se dégrade ni ne disparaît.

**Pourquoi le DMA** : Meeshy n'est pas contrôleur d'accès ; le règlement (UE)
2022/1925 ne lui impose rien. Son article 7 oblige en revanche WhatsApp et
Messenger à s'ouvrir aux services tiers qui le demandent. Meeshy sera ce tiers.

**Pourquoi construire avant de demander** (décision porteur) : la demande à Meta
déclenche un délai de trois mois et une revue de sécurité du demandeur. Arriver
avec une implémentation libsignal mûre, testée sur les trois plateformes, rend la
demande crédible et fait tomber le délai sur un code prêt. La demande elle-même,
l'accord d'interopérabilité et l'acceptation de l'offre de référence de Meta
restent au porteur : aucun agent n'y touche.

## 2. Objectifs, non-objectifs, anti-objectifs

**Objectifs**
- Échanges à DEUX entre un utilisateur Meeshy et un utilisateur WhatsApp :
  texte d'abord, puis médias (photos, vocaux, vidéos, fichiers).
- Chiffrement de bout en bout par **libsignal** (la bibliothèque officielle, déjà
  intégrée : `packages/LibSignalClient` iOS, `:core:e2ee` Android, passerelle
  `EncryptionService`), même version partout, prouvé sur iOS, Android et web.
- Une conversation WhatsApp se comporte comme une conversation Meeshy **en mode
  e2ee** (#9224, #12949) : le serveur ne voit jamais le clair, la traduction se
  fait sur l'appareil, les features qui exigent le clair côté serveur sont
  absentes et l'interface le dit.
- Tout ce qui ne dépend pas de Meta est construit derrière une interface
  **« pair externe »**, avec deux implémentations : un FAUX WhatsApp maintenant,
  l'adaptateur Meta après signature.
- Une **coquille web** branchée sur le staging joue l'ami WhatsApp : elle reçoit,
  déchiffre et répond. C'est la preuve de bout en bout sans Meta.
- Les obligations RGPD/DSA propres à l'interopérabilité (#16999) sont traitées
  dans le chantier : consentement, numéros de non-inscrits, signalement d'un
  contenu externe.
- **Dernière étape** : quand libsignal est prouvé sur toutes les plateformes, le
  moteur Signal « maison » (`services/gateway/src/dma-interoperability/`, ~3 200
  lignes, aucun importateur, X3DH non authentifié — décision du cycle 94) est
  retiré, ainsi que ce qui ne sert plus dans les modèles Prisma `DMASession`,
  `DMAEnrollment`, `PreKey` (à réévaluer : réutiliser ou retirer).

**Non-objectifs (v1)**
- Les groupes mixtes Meeshy/WhatsApp (lot suivant, après les échanges à deux).
- Les appels vocaux et vidéo (Meta ne les ouvre qu'en 2027).
- Messenger (même mécanique, plus tard).
- Toute connexion réelle à Meta avant la signature.

**Anti-objectifs — échec même si « ça marche »**
- Une régression d'une feature Meeshy-Meeshy, quelle qu'elle soit.
- Un clair qui transite ou se stocke côté serveur pour une conversation WhatsApp.
- Une seconde implémentation crypto (jumelle) à côté de libsignal.
- Une écriture en production, ou un contact avec Meta, par la routine.
- Une interface qui fait croire qu'une feature marche avec WhatsApp alors qu'elle
  est absente.

## 3. Contraintes

- `dev` = staging, autonomie complète (#9226) ; production intouchable par la
  routine. Rétrocompatibilité (#9231) : un ancien client ignore proprement une
  conversation externe.
- Tout lot crypto, accès ou migration passe par l'agent `auditeur-adversarial`
  avant fusion.
- CI des PR gelée (`PR_CI_GEL`) : la preuve est un `workflow_dispatch` (ci, ios,
  android) sur la branche, la CI de `dev` fait foi après fusion.
- Règles du dépôt : aucune feature sans issue, TDD, budgets de cohésion, pas de
  `Co-Authored-By` (pied `Claude-Session:` seul), synchronisation par fusion
  d'`origin/dev`, push de ses seuls commits.
- Versions libsignal aujourd'hui divergentes (passerelle 0.106.1, shared 0.105.4
  après #16888, iOS/Android 0.105.4) : l'alignement est le PREMIER lot.

## 4. Ce que le porteur a décidé

| Sujet | Décision |
|---|---|
| Résultat visé | écrire depuis Meeshy à un ami sur WhatsApp |
| Ordre | développement prêt AVANT la demande à Meta |
| Exécution | sessions **cloud** pour tout le développement et les tests |
| Preuve de bout en bout | une **coquille web** branchée sur le staging |
| Rythme | une routine planifiée **toutes les 5 heures** |
| Web | dans la v1 : le pont WASM libsignal est livré (le bundle web passe sous AGPL-3.0, l'écran Licences le dit — `libsignal-engine.ts`) ; c'est un lot préalable à la coquille |
| Numéros | l'utilisateur Meeshy doit avoir un numéro **vérifié** pour écrire à WhatsApp ; le numéro de l'ami WhatsApp est gardé **en clair**, seulement pour une conversation que l'utilisateur a ouverte lui-même, avec une **durée de conservation** (exception assumée à #9225, bornée ; la durée exacte et sa base légale sont fixées par le lot conformité avec #16999) |
| Licence | AGPL acceptée pour les clients (porteur, 2026-11-08) — pas de licence commerciale Signal |
| Moteur maison | retiré une fois libsignal prouvé sur toutes les plateformes |
| DSA / RGPD | issues ouvertes à part (milestones 255 et 256), #16999 rattachée ici |

## 5. Forme de la routine (proposition — calls de l'auteur, à corriger)

- **Un workflow** `.claude/workflows/meeshy-dma-whatsapp.js` + sa skill, sur le
  modèle des chantiers existants (`meeshy-cercles-et-sang`,
  `meeshy-liste-iso-ios`) : registre des lots, reprise depuis l'état des issues,
  lots fusionnés sautés, branches du chantier reprises.
- **Une routine cloud** (`schedule`) qui relance ce workflow toutes les 5 h. Un
  passage = un tour borné (quelques lots, budget d'agents plafonné) ; un tour
  qui trouve un lot déjà en cours le reprend au lieu d'en ouvrir un autre.
- **Sous-agents** :
  - *Cadreur* (opus) — lit l'offre de référence publique de Meta et l'arbre
    vivant, tient le registre des lots et leurs issues.
  - *crypto-e2ee* — libsignal sur les trois plateformes, vecteurs de test
    croisés (un message chiffré sur iOS se déchiffre sur Android, web, coquille).
  - *Passerelle* (sonnet) — interface « pair externe », faux WhatsApp,
    conversation de type externe, adressage par numéro, relais de blobs opaques.
  - *Clients* (sonnet) — iOS, Android, web : la conversation externe en mode
    e2ee, états dits (absent, en attente, pair non joignable).
  - *Conformité* — consentement, non-inscrits, signalement externe (#16999).
  - *Auditeur adversarial* — obligatoire avant fusion des lots sensibles.
  - *Recetteur* — déploie et fait tourner la coquille web sur le staging,
    scénarios de bout en bout ; consigne les recettes appareil réel pour le
    porteur (les sessions cloud n'ont ni Xcode ni SDK Android).
  - *Mécanique* (haiku) — synchronisations, rapports, clôtures.
- **Ordre des lots** : (1) alignement libsignal et vecteurs croisés ;
  (2) interface pair externe + faux WhatsApp ; (3) coquille web sur staging ;
  (4) conversation externe côté serveur ; (5) clients web, iOS, Android ;
  (6) médias ; (7) conformité ; (8) dossier de demande Meta (doc pour le
  porteur : architecture, preuves, revue de sécurité) ; (9) retrait du moteur
  maison ; puis groupes.
- **Arrêt** : la routine s'arrête seule quand le milestone est fermé, ou se met
  en pause et le dit quand un lot bute deux fois ou qu'une décision porteur
  manque.

## 6. Choix de l'auteur (à vérifier par le porteur)

- **Production avant signature** : toute entrée « écrire à un ami WhatsApp »
  est derrière un drapeau, éteint en production, allumé au staging et pour
  l'équipe, jusqu'à la signature avec Meta. Le gating est dans le lot clients.
- **Fidélité du faux WhatsApp** : il suit le format PUBLIC de l'offre de
  référence de Meta (enveloppes, distribution des prékeys, médias) aussi loin
  qu'elle est publiée, pour que l'adaptateur Meta se branche sans toucher aux
  clients et que les preuves alimentent le dossier de demande. Ce qui n'est pas
  publié est isolé derrière l'interface pair externe et marqué « à confirmer
  après signature ».
- **Identité et appareils** : on réutilise l'E2EE libsignal PAR APPAREIL déjà
  posée (#14591, ADR-030) — une session par appareil, pas d'identité dédiée à
  WhatsApp — sauf si l'offre de référence l'interdit ; le cadreur le vérifie au
  premier lot et rouvre la question au porteur s'il bute.

## 7. Laissé au constructeur

- Le découpage fin des lots et leurs critères de fin.
- La forme exacte de l'interface pair externe et du faux WhatsApp.
- L'hébergement de la coquille web sur le staging (sous-domaine, conteneur).
- Le choix réutiliser/retirer des modèles Prisma DMA existants.
- Le plafond d'agents par tour, dans la limite de la consigne de taille.
