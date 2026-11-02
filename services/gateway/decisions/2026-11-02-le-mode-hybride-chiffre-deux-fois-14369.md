## 2026-11-02 : Le mode hybride chiffre deux fois — une couche serveur scellée au repos, une couche appareil libsignal par appareil (#14369)

**Statut** : Accepté pour dev/staging (directive porteur du 2026-11-02 : « les modes sont clairs et l'hybride est correctement implémenté »). La production reste bloquée par l'avis AGPL (#11548) et l'audit cryptographique externe (#3710), comme tout le chantier libsignal.

**Contexte** : jusqu'ici, `hybrid` chiffrait exactement comme `server` (`sealTextAtRest`) ; seul le libellé différait. Le type `HybridEncryptedPayload` et les aides de `EncryptionService` décrivaient un modèle à destinataire UNIQUE (une enveloppe E2EE + une copie serveur) que le relais libsignal par appareil (#3706) ne peut pas porter, et qu'aucun envoi ne produisait.

**Spécifications suivies** : X3DH/PQXDH et Double Ratchet de Signal pour la couche appareil (inchangés : c'est le scellement du bout en bout, `E2EEMessageSealing`), Sesame (§ 3, correspondance exacte avec l'annuaire d'appareils) pour son admission. Aucune primitive nouvelle.

### Le protocole

| porteur de l'envoi | `server` | `hybrid` | `e2ee` | sans chiffrement |
|---|---|---|---|---|
| clair seul | admis, scellé au repos | **admis, scellé au repos** (couche serveur seule) | refusé `E2EE_PLAINTEXT_REFUSED` | admis |
| clair + couche appareil | refusé `E2EE_REGIME_CHANGED` | **admis : scellé au repos ET enveloppes rangées** | refusé `E2EE_PLAINTEXT_REFUSED` (avant la couche) | refusé `E2EE_REGIME_CHANGED` |
| couche appareil sans clair ni chiffré | refusé `E2EE_REGIME_CHANGED` | refusé comme message vide (la couche appareil n'est pas un porteur de corps, `carriesNonTextBody`) | refusé `E2EE_REGIME_CHANGED` | refusé `E2EE_REGIME_CHANGED` |
| chiffré client + relais | refusé `E2EE_REGIME_CHANGED` | refusé `E2EE_REGIME_CHANGED` | admis (bout en bout) | refusé `E2EE_REGIME_CHANGED` |
| chiffré client sans relais | refusé `SERVER_AT_REST_CIPHERTEXT_REFUSED` | refusé `SERVER_AT_REST_CIPHERTEXT_REFUSED` | refusé `E2EE_CLIENT_OUTDATED` | refusé `E2EE_REGIME_CHANGED` |

- **Le fil** : un envoi hybride porte `content` (le clair), `encryptionMode: 'hybrid'`, `encryptionProtocol: 'libsignal-v1'`, `envelopes`, `encryptionMetadata.senderDeviceId` (et `regimeEpoch`), et **aucun `encryptedContent`**. `toDeviceLayer` (`validation/encryption-envelope.ts`) le recompose en `MessageRequest.deviceLayer` ; il est exclusif de `toEncryptedPayload`, qui ne naît que d'un chiffré. REST et socket `message:send` portent la même unité ; iOS envoie par REST.
- **L'admission** (`admitSendUnderRegime`) : une couche appareil hors d'une conversation `hybrid` est refusée `E2EE_REGIME_CHANGED`. En `hybrid`, elle passe la MÊME admission qu'un envoi `e2ee` : époque déclarée, appareil émetteur lié à la session, Sesame contre l'annuaire de tous les membres actifs inscrits (409 `E2EE_DEVICES_MISMATCH`), expéditeur inscrit (403 `E2EE_DEVICE_NOT_BOUND`).
- **La persistance** : le clair suit le chemin `server` (`getEncryptionContext` → `sealTextAtRest`), donc traduction, transcription, recherche, édition et agent continuent. Les enveloppes vont dans `MessageEnvelope` (`persistAdmittedEnvelopes`), distribuées par `e2ee:envelope` et `GET /e2ee/envelopes`, effacées à l'accusé ou à 30 jours, comme en `e2ee`. La ligne garde le mode `hybrid`, son `content` est `''` (scellé), jamais `[Encrypted]`.
- **Le marqueur** : `Message.metadata.deviceLayer = 'libsignal-v1'` (`HYBRID_DEVICE_LAYER_METADATA_KEY`) dit qu'un message hybride porte sa couche appareil. Absent ⇒ couche serveur seule. Le marqueur sert l'OBSERVATION (mesurer la part des envois à deux couches) ; il n'est pas servi aux clients comme une preuve, puisque c'est le serveur qui l'écrit. Côté destinataire, seule une enveloppe ouverte prouve quelque chose : sans enveloppe, l'interface ne prétend rien.
- **Un hybride sans couche appareil reste admis.** Android et le web n'ont pas encore libsignal (#14591, #14592), un ancien iOS non plus, et un iOS sans session ou face à un pair sans appareil chiffrant se replie : le mode doit rester utilisable par tous.
- **Les groupes** : la passerelle accepte le fan-out par paire (une enveloppe par appareil de chaque membre, bornée par `E2EE_ENVELOPE_BOUNDS`). iOS ne scelle aujourd'hui que pour un tête-à-tête (le scelleur prend un pair) : **un groupe hybride envoie la couche serveur seule**. Le fan-out par paire côté client, puis Sender Keys ou MLS, sont des suites.
- **L'édition** : elle ne passe que par la couche serveur (déjà admise en `hybrid`). La couche appareil n'est pas renvoyée ; l'appareil destinataire déclare alors le message **invérifiable**, jamais en écart.
- **Les pièces jointes, le lieu, le sticker, le transfert** : couche serveur seule (le scelleur ne les couvre pas, comme en `e2ee`).

### Le client iOS

- Envoi : `HybridTextRoute` (app) scelle par `EndToEndMessagingProviding.deliver`, le chemin du bout en bout (409 Sesame rechiffré), et poste le clair et les enveloppes dans une requête. Tout échec de la couche appareil (scellement impossible, refus `E2EE_*` hors `E2EE_PLAINTEXT_REFUSED`) renvoie le clair seul sous le même `clientMessageId` et se journalise ; une panne de transport suit la reprise ordinaire.
- Réception : l'enveloppe s'ouvre au coffre scellé (`E2EEEnvelopeOpener`), comme en `e2ee`. `HybridThreadIntegrity` compare son clair, s'il est à SA place (règle de `EndToEndThreadPlaintexts.isInPlace`), au texte servi : **vérifié** (sceau discret dans le pied), **écart** (le texte de l'auteur s'affiche, ses traductions serveur se taisent, triangle d'alerte), **invérifiable** (message modifié). Le clair hybride vit au coffre et non dans la base des messages : la règle du coffre (`apps/ios/decisions/2026-10-25-le-clair-e2ee-ne-s-ecrit-que-dans-le-coffre.md`) n'est pas affaiblie.

### Modèle de menace, honnêtement

| menace | ce que l'hybride garantit |
|---|---|
| serveur compromis ou curieux qui LIT | **rien** : la couche serveur est lisible par la passerelle, par conception (traduction, recherche). L'hybride n'est pas le bout en bout ; l'interface le dit. |
| serveur qui ALTÈRE un texte servi | détecté par l'appareil destinataire qui a reçu l'enveloppe (écart signalé, texte de l'auteur affiché) |
| serveur qui SUPPRIME la couche appareil | non détecté : sans enveloppe, l'appareil ne prétend rien. Le serveur peut aussi déclasser un envoi en couche serveur seule. |
| attaquant réseau | TLS pour les deux couches ; la couche appareil reste opaque même si TLS tombe |
| substitution de clé | celle du bout en bout : l'annuaire est servi par le serveur, la vérification des numéros de sécurité reste à l'utilisateur |
| appareil volé | le clair est au coffre scellé comme en `e2ee`, et de toute façon lisible côté serveur |

**Revue requise** : cette conception relève de l'audit cryptographique externe (#3710) avant toute promotion. L'agent `auditeur-adversarial` la relit avant la fusion ; il ne remplace pas l'audit.

**Alternatives rejetées** : bâtir sur `HybridEncryptedPayload` (destinataire unique, incompatible avec le relais par appareil ; déprécié, gardé pour rétrocompatibilité des types) ; porter la couche appareil dans `encryptedPayload` (sa présence marque un chiffré pour toute la chaîne de validation) ; refuser un hybride sans couche appareil (Android et le web ne pourraient plus écrire) ; rendre le marqueur `metadata.deviceLayer` probant côté client (le serveur l'écrit).

**Rétrocompatibilité** : un serveur antérieur ignore les enveloppes d'un envoi sans `encryptedContent` et range la couche serveur seule ; un client antérieur n'envoie pas de couche appareil et reste admis. Aucune route, aucun événement ne change ; le manifeste des routes est inchangé.
