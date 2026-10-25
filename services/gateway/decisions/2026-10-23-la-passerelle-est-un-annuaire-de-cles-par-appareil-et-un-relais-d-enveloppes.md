## La passerelle est un annuaire de clés publiques par appareil et un relais d'enveloppes libsignal opaques (2026-10-23, #3706)

**Contexte** : `SignalPreKeyBundle` tient un bundle par compte (`userId @unique`), remplacé sans condition,
avec des champs de clé privée ; la pré-clé unique n'est jamais consommée ; `POST /signal/session/establish`
répond toujours 503. Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`.

**Décision** :
- Modèles additifs `E2EEDevice` (un appareil : identité publique, pré-clé signée, pré-clé Kyber de dernier
  recours, lien push), `E2EEOneTimePreKey` (EC et Kyber, un document par clé) et `MessageEnvelope` (une enveloppe par appareil destinataire,
  effacée à l'accusé de réception, au plus tard à 30 jours). Aucun champ de clé privée.
- Au plus 16 appareils actifs par compte (`E2EE_MAX_ACTIVE_DEVICES`, pour qu'un envoi en tête-à-tête tienne
  dans 32 enveloppes), sur les places `deviceId` 1…16 ; un appareil retiré rend sa place, jamais à la même
  `registrationId`, et l'appareil d'une session finie est retiré (#12543). Le compteur jamais décrémenté de
  la première version épuisait la plage en 127 réinstallations.
- Pré-clé unique réservée par `findOneAndUpdate` sur `usedAt: null` ; signatures XEdDSA vérifiées à la
  publication (`@signalapp/libsignal-client`).
- Routes neuves sous `/api/v1/e2ee/` ; un envoi `e2ee` porte une enveloppe par appareil actif des
  participants (mes autres appareils approuvés compris), sinon 409 `E2EE_DEVICES_MISMATCH`
  `{ missing, extra, stale }` (Sesame) ; un `regimeEpoch` périmé donne 409 `E2EE_REGIME_CHANGED`.
- `POST /signal/session/establish` est retiré au lieu d'être branché (#12519) : la session se construit sur
  l'appareil, la passerelle n'a rien à établir.
- `POST /signal/keys` et `GET /signal/keys/:userId` restent servis pour les clients publiés, ne sont plus lus
  par aucun nouveau client, et se retirent à zéro usage mesuré (#9223).
- La politique de bascule vit dans une seule fonction (`E2EE_TOGGLE_POLICY`, défaut `admins`, #12517) et se
  sert au client par `canToggleEncryption`.

**Alternatives rejetées** :
- *Rendre `SignalPreKeyBundle` multi-appareil en place* : casse les anciens clients qui le lisent et garde
  les champs de clé privée.
- *Les enveloppes dans `encryptionMetadata`* : sa borne de 8 Ko ne tient pas trois enveloppes PQXDH, et
  chaque appareil lirait celles des autres.
- *Brancher `signalService` pour faire répondre la route 503* : le serveur n'a pas à établir de session.

**Conséquences** : le serveur voit qui écrit à quel appareil, quand, et la taille ; jamais le contenu.
Un ancien client lit un message illisible annoncé (`e2eeUpgradeRequired`) et reçoit `E2EE_CLIENT_OUTDATED`
s'il envoie dans une conversation chiffrée : rien n'est perdu en silence.

**Précisions d'implémentation (lot 1, #3706)** — là où le code s'écarte de la lettre de la spécification, et pourquoi :
- *Preuve de liaison à l'enrôlement* (ajout) : l'identité, la pré-clé signée et la pré-clé Kyber de dernier
  recours d'un appareil sont PUBLIQUES (servies dans chaque bundle, signatures comprises). Sans preuve, quiconque
  tient un jeton du compte pouvait réenrôler cette identité et lier l'appareil à SA session, puis lire et effacer
  ses enveloppes. L'enrôlement exige donc une signature XEdDSA de `deviceBindingMessage(userId, registrationId,
  identityKey, timestamp)` (`@meeshy/shared/types/e2ee-directory`), à ±10 min de l'horloge passerelle. C'est une
  composition écrite par Meeshy à partir de primitives libsignal : surface de revue externe (#3710).
- *Salle socket par appareil* : la socket rejoint `device:<userId>:<deviceId>:<registrationId>` d'après l'appareil
  ACTIF lié à SA session (`sid` vérifié du JWT), jamais d'après un `e2eeDeviceId` déclaré au handshake ; un enrôlement
  fait entrer les sockets déjà ouvertes de la session. La salle nomme la GÉNÉRATION, pas la place : une place se
  reprend, et la socket restée d'un appareil retiré ne reçoit rien de celle qui lui succède ; le retrait la fait
  sortir de sa salle (#12592).
- *Compteur* : le champ s'appelle `lastDeviceId` (dernier numéro attribué, 0 = aucun), pas `nextDeviceId`.
- *Garde du régime* (#12522, #12562) : `encryptionMetadata.regimeEpoch`, quand l'envoi le déclare, est comparé à
  `Conversation.encryptionEpoch` (absent = 0) ; une époque périmée, des enveloppes ou tout autre chiffré vers une
  conversation qui n'est pas `e2ee` rendent 409 `E2EE_REGIME_CHANGED`, sans rien ranger. Un envoi sans époque déclarée
  (client antérieur) n'est pas jugé sur elle.
- *Ancien format* : un chiffré sans enveloppes dans une conversation `e2ee` rend 400 `E2EE_CLIENT_OUTDATED` ; un
  texte clair garde `E2EE_PLAINTEXT_REFUSED`, que le web publié sait dire (`apps/web/src/lib/send/failure-reason.ts`).
- *Bornes* : 200 pré-clés uniques non consommées par appareil et par nature ; 10 écritures d'annuaire et 30
  lectures de bundles (par couple demandeur, cible) par minute ; un champ au nom de clé privée fait refuser la
  requête entière.
- *Retrait* : retirer un appareil efface ses pré-clés uniques ET ses enveloppes en attente.
