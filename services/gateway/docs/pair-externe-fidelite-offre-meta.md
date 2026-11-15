# Pair externe : ce que le faux WhatsApp imite de l'offre publique de Meta

Issue #17115, chantier #17007. Contrat : `src/services/external-peer/external-peer-contract.ts`.
Décision : `decisions/2026-11-09-la-passerelle-parle-a-un-pair-externe-par-une-interface-unique.md`.

## Sources publiques

Elles sont citées de mémoire documentaire. Aucune n'a été téléchargée par la routine : elle n'a le droit de faire
aucun appel réseau vers Meta. **Le porteur revérifie chaque ligne contre la version en vigueur de l'offre avant la
demande.**

- **[S1]** Meta Engineering, « Making messaging interoperability with third parties safe for users in Europe »,
  6 mars 2024 : Signal Protocol demandé aux tiers (un autre protocole seulement s'il offre des garanties
  équivalentes, démontrées), contenu structuré en protobuf puis chiffré, relayé par les serveurs de WhatsApp, clés
  publiques des utilisateurs WhatsApp servies par WhatsApp, médias chiffrés par le client.
- **[S2]** WhatsApp, « WhatsApp Encryption Overview » (livre blanc technique) : clés d'identité, pré-clé signée et
  pré-clés uniques consommées une fois, sessions par appareil (multi-appareil), pièces chiffrées en AES-256-CBC +
  HMAC-SHA256 avec une clé aléatoire par fichier, le SHA-256 du chiffré voyageant dans le message chiffré.
- **[S3]** WhatsApp, offre de référence d'interopérabilité au titre de l'article 7 du DMA (publiée en mars 2024) :
  conditions d'accès, demande, délai de trois mois, revue de sécurité du demandeur.

## Champ par champ

| Champ du contrat | Ce que fait le faux | Offre publique | Statut |
|---|---|---|---|
| Protocole de chiffrement | libsignal, et seulement lui. La porte refuse ce que libsignal ne sait pas lire | Signal Protocol [S1] | suit |
| Pré-clé Kyber (PQXDH) | obligatoire dans le bundle : libsignal 0.106 n'ouvre pas de session sans elle | [S2] décrit X3DH, et aucune source publique ne mentionne de pré-clé Kyber chez WhatsApp | **à confirmer après signature : peut BLOQUER.** Si WhatsApp ne sert pas de Kyber, libsignal 0.106 ne peut pas ouvrir la session. Une jumelle X3DH est exclue : la question revient au porteur |
| Identité par appareil (`registrationId`, `deviceId`) | un bundle par appareil, comme l'annuaire Meeshy (ADR-030) | sessions par appareil [S2] | suit. La plage des `deviceId` WhatsApp est **à confirmer** (le faux suit libsignal, 1…127) |
| Adresse d'un utilisateur WhatsApp | numéro E.164 (`handle`) | utilisateurs désignés par leur numéro [S1] | suit pour le principe. La forme sur le fil (identifiant WhatsApp, identifiant masqué) est **à confirmer** |
| Bundle : identité, pré-clé signée, pré-clé unique | servis par appareil, pré-clé unique réservée atomiquement et jamais servie deux fois | [S1] (clés servies par WhatsApp), [S2] (consommées une fois) | suit. L'API (demandes groupées, épuisement, réapprovisionnement) est **à confirmer** |
| Publication du bundle d'un appareil Meeshy | le tiers publie chez le pair | les utilisateurs WhatsApp doivent pouvoir obtenir les clés des utilisateurs du tiers [S1] | le sens du flux (WhatsApp interroge le tiers, ou le tiers publie chez WhatsApp) est **à confirmer** |
| Enveloppe : `type` 2 ou 3 et `body` | `CiphertextMessage` libsignal sérialisé, relayé à l'octet près | Signal Protocol [S1] [S2] | suit pour le chiffré. L'emballage (stanza, en-têtes de transport) est **à confirmer** : le faux transporte le chiffré nu |
| Contenu chiffré (texte, réponse, réaction) | hors de la porte : les clients le composent | protobuf chiffré [S1] | le schéma protobuf du contenu WhatsApp est **à confirmer** (lot clients) |
| Accusé (`acknowledge`) | l'appareil destinataire efface ce qu'il a reçu du relais | non détaillé publiquement | **à confirmer** : format, et chiffrement ou non des accusés de remise et de lecture |
| Rétention d'une enveloppe non remise | 30 jours (`E2EE_ENVELOPE_RETENTION_DAYS`) | WhatsApp dit garder 30 jours un message non remis | suit (à revérifier) |
| Pièce opaque : octets + SHA-256 | aucun nom, type, durée, vignette ni transcription, empreinte vérifiée | clé aléatoire par fichier, AES-CBC + HMAC-SHA256, empreinte dans le message [S2] | suit pour la forme. **À confirmer** : dérivation de la clé par type de média, longueur du HMAC, hôte de dépôt, taille maximale (le faux borne à 5 Mio), rétention |
| Transport et authentification du fournisseur tiers | aucun : le faux vit dans la passerelle | connexion du serveur tiers aux serveurs de WhatsApp [S1] [S3] | **à confirmer après signature** (adaptateur Meta, hors de portée de la routine) |
| Consentement et boîte séparée côté WhatsApp | hors de la porte | l'utilisateur WhatsApp choisit d'activer les discussions tierces [S1] | lot conformité (#16999) |

## Ce que le faux ne prouve pas

- Qu'un client WhatsApp réel ouvre nos enveloppes : seul l'adaptateur Meta, après signature, le prouvera.
- Que l'API de Meta a cette forme : l'interface isole ce qui est « à confirmer », pour que l'adaptateur se branche
  sans toucher aux clients.
