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
- **L'édition** : elle ne passe que par la couche serveur (déjà admise en `hybrid`). La couche appareil n'est pas renvoyée, donc **aucune édition n'est prouvée par l'auteur** : un texte modifié qui diffère du texte scellé est un écart « modifié — original disponible », jamais un silence. Sans cette règle, un serveur qui altère un texte et pose `isEdited` rendait le verdict muet (audit adversarial du lot). Une édition scellée par l'appareil de l'auteur est une suite.
- **Les pièces jointes, le lieu, le sticker, le transfert** : couche serveur seule (le scelleur ne les couvre pas, comme en `e2ee`). `message:send-with-attachments` accepte les champs libsignal (même schéma que `message:send`) mais ne recompose AUCUNE couche appareil : la légende d'un média part en couche serveur seule (témoin `MessageHandler.hybridDeviceLayerAttachments.test.ts`). `metadata.deviceLayer` n'est pas une métadonnée déclarable par le client (`clientDeclaredMetadata` ne la rend jamais ; témoin dans `hybridDeviceLayerSend.test.ts`).

### Le client iOS

- Envoi : `HybridTextRoute` (app) scelle par `EndToEndMessagingProviding.deliver`, le chemin du bout en bout (409 Sesame rechiffré), et poste le clair et les enveloppes dans une requête. Tout échec de la couche appareil (scellement impossible, refus `E2EE_*` hors `E2EE_PLAINTEXT_REFUSED`) renvoie le clair seul sous le même `clientMessageId` et se journalise ; une panne de transport suit la reprise ordinaire.
- Réception : l'enveloppe s'ouvre au coffre scellé (`E2EEEnvelopeOpener`), comme en `e2ee`. `HybridThreadIntegrity` retient son clair s'il est à SA place (règle de `EndToEndThreadPlaintexts.isInPlace`) **et rattaché à CE message** (`HybridDeviceLayer.isBound`) : identifiant client présent des DEUX côtés et égal — la ligne du magasin garde celui que la passerelle sert, colonne GRDB `servedClientMessageId` — et instant scellé (`E2EEContent.sentAt`) à **±10 minutes** de l'instant servi (`createdAt`). La fenêtre borne le rejeu d'une ancienne enveloppe sous un message neuf ; un envoi scellé puis remis plus de dix minutes après (reprise hors ligne) devient invérifiable, ce qui est sûr (aucun sceau). Le verdict se rejuge à chaque pose, sur la ligne telle qu'elle est :
  - **vérifié** : un sceau discret dans le pied, **seulement quand le texte ORIGINAL est affiché**. Le Prisme montre la traduction par défaut, et une traduction est produite par le serveur : le sceau n'apparaît qu'après la bascule vers l'original, et VoiceOver dit « Texte original vérifié par votre appareil ».
  - **écart** : le **texte SERVI reste affiché** (avec ses traductions), un repère neutre dit « Le texte reçu ne correspond pas à celui chiffré par l'appareil de l'expéditeur » et un toucher dévoile « Voir le texte de l'appareil ». Aucune faute n'est attribuée. Remplacer le texte servi par celui de l'appareil laisserait un auteur envoyer un texte bénin au serveur et un texte abusif dans ses enveloppes, hors de portée de la modération, du signalement et de la recherche, en accusant « nos serveurs » (audit adversarial). Un **signalement** d'un message en écart emporte les deux textes (`HybridThreadIntegrity.reportReason`, borné aux 2 000 unités UTF-16 de la route) : c'est le lecteur qui choisit de remettre au serveur le texte que l'appareil de l'expéditeur lui a scellé.
  - **modifié — original disponible** : l'écart d'un message que le serveur présente comme modifié.
  - **invérifiable** (rien ne s'affiche) : couche à sa place mais non rattachée.

  Le clair hybride vit au coffre et non dans la base des messages : la règle du coffre (`apps/ios/decisions/2026-10-25-le-clair-e2ee-ne-s-ecrit-que-dans-le-coffre.md`) n'est pas affaiblie.

### Modèle de menace, honnêtement

| menace | ce que l'hybride garantit |
|---|---|
| serveur compromis ou curieux qui LIT | **rien** : la couche serveur est lisible par la passerelle, par conception (traduction, recherche). L'hybride n'est pas le bout en bout ; l'interface le dit. |
| serveur qui ALTÈRE le texte original servi d'un tête-à-tête iOS ↔ iOS, ET remet l'enveloppe | **détecté** par l'appareil destinataire (écart, ou « modifié — original disponible » s'il pose `isEdited`) |
| serveur qui ALTÈRE une TRADUCTION | **non couvert** : les traductions sont produites par le serveur ; aucun sceau ne s'affiche à côté d'elles |
| serveur qui SUPPRIME l'enveloppe, puis altère | **non détecté aujourd'hui** : sans enveloppe, l'appareil ne prétend rien, et rien ne distingue cette suppression d'un envoi légitime en couche serveur seule (Android, web, ancien iOS, groupe, échec de scellement). Le serveur peut aussi déclasser un envoi. Afficher « non vérifié » à un hybride sans couche quand le pair a des appareils chiffrants n'est pas fait : l'annuaire est servi par le même serveur, le repli légitime d'iOS produirait de faux avertissements, et la règle n'est pas encore à coût nul (suite à ouvrir). |
| serveur qui REJOUE une ancienne enveloppe sous un nouveau message | refusé : identifiant client des deux côtés et fenêtre de ±10 minutes, sinon invérifiable |
| auteur qui envoie deux textes différents (serveur / enveloppes) | le texte servi reste affiché et modérable ; le destinataire voit l'écart et peut le signaler avec les deux textes. Aucune cause n'est désignée. |
| pièces jointes, légendes de média, lieu, sticker, groupes | **non couverts** : couche serveur seule |
| attaquant réseau | TLS pour les deux couches ; la couche appareil reste opaque même si TLS tombe |
| substitution de clé | celle du bout en bout : l'annuaire est servi par le serveur, la vérification des numéros de sécurité reste à l'utilisateur |
| appareil volé | le clair est au coffre scellé comme en `e2ee`, et de toute façon lisible côté serveur |

**Revue requise** : cette conception relève de l'audit cryptographique externe (#3710) avant toute promotion. L'agent `auditeur-adversarial` la relit avant la fusion ; il ne remplace pas l'audit.

**Alternatives rejetées** : bâtir sur `HybridEncryptedPayload` (destinataire unique, incompatible avec le relais par appareil ; déprécié, gardé pour rétrocompatibilité des types) ; porter la couche appareil dans `encryptedPayload` (sa présence marque un chiffré pour toute la chaîne de validation) ; refuser un hybride sans couche appareil (Android et le web ne pourraient plus écrire) ; rendre le marqueur `metadata.deviceLayer` probant côté client (le serveur l'écrit).

**Rétrocompatibilité** : un serveur antérieur ignore les enveloppes d'un envoi sans `encryptedContent` et range la couche serveur seule ; un client antérieur n'envoie pas de couche appareil et reste admis. Aucune route, aucun événement ne change ; le manifeste des routes est inchangé.
