## La passerelle est un annuaire de clés publiques par appareil et un relais d'enveloppes libsignal opaques (2026-10-23, #3706)

**Contexte** : `SignalPreKeyBundle` tient un bundle par compte (`userId @unique`), remplacé sans condition,
avec des champs de clé privée ; la pré-clé unique n'est jamais consommée ; `POST /signal/session/establish`
répond toujours 503. Spécification : `docs/superpowers/specs/2026-10-23-e2ee-libsignal-ios-macos.md`.

**Décision** :
- Modèles additifs `E2EEDevice` (un appareil : identité publique, pré-clé signée, pré-clé Kyber de dernier
  recours, lien push), `E2EEOneTimePreKey` (EC et Kyber, un document par clé), `E2EEDeviceCounter`
  (`deviceId` 1…127 jamais réutilisé) et `MessageEnvelope` (une enveloppe par appareil destinataire,
  effacée à l'accusé de réception, au plus tard à 30 jours). Aucun champ de clé privée.
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
