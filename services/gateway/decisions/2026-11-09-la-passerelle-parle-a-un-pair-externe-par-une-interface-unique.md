## La passerelle parle à un pair externe par une interface unique, admise en un seul site, avec un faux WhatsApp au staging (2026-11-09, #17115)

### Contexte
Chantier #17007 (« On écrit depuis Meeshy à un ami sur WhatsApp », DMA art. 7), design
`docs/superpowers/specs/2026-11-08-dma-whatsapp-interop-design.md` § 2 et § 6 : tout ce qui ne dépend pas de
Meta se construit derrière une interface « pair externe », avec un faux WhatsApp maintenant et l'adaptateur Meta
après signature. Le moteur maison `src/dma-interoperability/` (X3DH non authentifié, clés sur le serveur) ne se
réutilise pas : il sera retiré.

### Décision
- **Un seul contrat** : `src/services/external-peer/external-peer-contract.ts`. Schémas Zod STRICTS, types dérivés :
  publier / récupérer un bundle de pré-clés par appareil, remettre / recevoir une enveloppe libsignal opaque
  (types 2 et 3), accuser réception, remettre / relire une pièce opaque (octets + SHA-256). Un champ hors contrat
  fait refuser l'appel entier ; il n'est jamais retiré en silence. Les formes de pré-clés sont celles de l'annuaire
  Meeshy (`@meeshy/shared/types/e2ee-directory`).
- **Un seul site d'admission** : `admitExternalPeer` (`external-peer-gate.ts`) enveloppe toute implémentation.
  Clé privée refusée à toute profondeur, contrat vérifié, et le corps d'une enveloppe doit se lire par libsignal
  (`SignalMessage.deserialize` / `PreKeySignalMessage.deserialize`) comme le type déclaré : sinon
  `EXTERNAL_PEER_PLAINTEXT_REFUSED`. Le journal ne reçoit que méthode, code et réseau.
- **Identité** : on réutilise l'identité libsignal PAR APPAREIL déjà posée (#14591, ADR-030) — `ProtocolAddress`
  `userId.deviceId` côté Meeshy, numéro E.164 + appareil côté WhatsApp. Aucune identité dédiée.
- **Faux WhatsApp** (`fake-whatsapp-peer.ts`) : annuaire de bundles et relais d'enveloppes et de pièces, état dans
  un `PeerStore` (sous-ensemble de `CacheStore` : Redis du staging, ou mémoire). Réservation ATOMIQUE de chaque
  pré-clé unique par `setnx` sur sa réservation ; une nouvelle `registrationId` efface les pré-clés de l'ancienne
  génération ; rétention 30 jours (`E2EE_ENVELOPE_RETENTION_DAYS`). Aucun hôte appelé.
- **Choix par configuration** (`external-peer-selection.ts`) : `EXTERNAL_PEER_PROVIDER=fake-whatsapp` ouvre le
  faux en développement, en test (`NODE_ENV` dans une liste FERMÉE) ou au staging déclaré (`MEESHY_ENV=staging`) ;
  un `NODE_ENV` absent ou inconnu le laisse fermé, la production le garde fermé même demandé, et aucune autre
  valeur n'ouvre rien tant que l'accord avec Meta n'est pas signé.
- **Relève par pages** : `receiveEnvelopes` sert au plus `E2EE_ENVELOPE_BOUNDS.maxEnvelopes` enveloppes, les plus
  anciennes d'abord — la borne même de l'accusé ; l'accusé d'une page découvre la suivante, et une file longue ne
  part jamais d'un bloc.
- **Modèles Prisma `DMASession`, `DMAEnrollment`, `PreKey`** : ni réutilisés ni modifiés. L'état du faux est celui
  des serveurs de WhatsApp, pas une donnée Meeshy ; le lot « retrait-moteur-maison » tranche leur sort.
- **Garde de source** (`external-peer-isolation-guard.test.ts`) : aucun module de production n'importe
  `dma-interoperability/`, et aucune source du pair externe ne porte d'URL, d'hôte de Meta ni de module réseau.

### Alternatives rejetées
- *Réutiliser le moteur maison* : X3DH non authentifié et ratchet défectueux ; une seconde implémentation crypto à
  côté de libsignal est un anti-objectif du design.
- *Retirer les champs inconnus (`strip`)* comme l'annuaire Meeshy : à la frontière d'un réseau tiers, un champ
  `text` ou `fileName` posé à côté du chiffré est une fuite en préparation ; on le refuse.
- *Reconnaître un chiffré par un analyseur maison* (octet de version, champs protobuf) : la lecture est celle de
  libsignal, la seule qui fasse foi.

### Conséquences
- La porte attrape le clair ACCIDENTEL ; un client malveillant peut toujours emballer un clair dans un message
  libsignal bien formé. La confidentialité vient du chiffrement sur l'appareil, et une pièce opaque n'est
  vérifiée que par son empreinte (un blob clair passerait).
- Aucune route ne branche encore la porte : la coquille web (lot 3) et la conversation externe (lot 4) la
  consomment.
- Fidélité à l'offre publique de Meta, champ par champ : `services/gateway/docs/pair-externe-fidelite-offre-meta.md`.
  Le point le plus lourd y est « à confirmer » : libsignal 0.106 exige une pré-clé Kyber (PQXDH), et aucune source
  publique ne dit que WhatsApp en sert une.
