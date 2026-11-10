## 2026-11-10 : L'interopérabilité WhatsApp a son consentement versionné, une durée de conservation du numéro de l'ami lue d'une configuration, et un signalement de contenu externe sans analyse serveur (#17120)

### Contexte
Chantier #17007, volet TECHNIQUE de #16999 (RGPD/DSA). La conversation externe existe côté serveur depuis #17117
(décision `2026-11-10-une-conversation-externe-nait-chiffree-de-bout-en-bout-et-adressee-par-numero.md`). Il manquait :
le consentement de l'utilisateur Meeshy avant sa première conversation externe, l'information sur ce qui part chez Meta,
une durée de conservation du numéro de l'ami tenue par UNE configuration avec une purge qui ne dépend pas seulement d'un
index, et le signalement d'un contenu reçu de WhatsApp (DSA art. 16 et 17, #16991 / #16992).

Ce document ne tranche pas le droit. La base légale, la responsabilité conjointe (art. 26 RGPD), l'AIPD, les transferts
hors UE, le texte définitif de l'information et la durée définitive restent au juriste dans #16999 (`décision-produit`).
Les valeurs posées ici sont PROVISOIRES et prudentes.

### Décision
- **Vocabulaire partagé** `@meeshy/shared/types/external-interop-compliance` : `EXTERNAL_INTEROP_NOTICE_VERSION`
  (`2026-11-10`, provisoire), `EXTERNAL_INTEROP_DISCLOSURES` (ce qui PEUT partir chez Meta : numéro vérifié, nom affiché,
  clés publiques, contenu chiffré de bout en bout, métadonnées d'acheminement — une liste qui en dit trop vaut mieux qu'une
  liste qui omet ; à confirmer par l'offre de référence de Meta après signature), `EXTERNAL_REPORT_ORIENTATION`, et la loi
  unique `isInteropConsentCurrent` (daté ET sous la version en vigueur).
- **Consentement** : deux colonnes `User.whatsappInteropConsentAt` / `whatsappInteropNoticeVersion` (le régime de
  `publicLeagueConsentAt` / `Version`, pas de booléen à côté). `GET /conversations/external/consent` sert l'information
  en vigueur (version, liste, durée de conservation configurée) et l'état ; `PUT` `{ network, noticeVersion, granted }`
  (Zod strict, aucune date du client) date par le SERVEUR, refuse une version périmée en
  `409 EXTERNAL_CONVERSATION_NOTICE_OUTDATED`. `POST /conversations/external` refuse sans consentement en vigueur :
  `403 EXTERNAL_CONVERSATION_CONSENT_REQUIRED` (après numéro vérifié et porte e2ee, avant toute écriture).
  **Retirer le consentement efface les adresses d'amis** que le compte gardait : sans consentement, le numéro n'a plus
  d'usage. Les conversations restent (cycle de vie propre) ; le relais à venir n'y adresse plus rien.
- **Conservation** : `EXTERNAL_PEER_HANDLE_RETENTION_DAYS` (jours entiers) est la SEULE source de la durée
  (`externalPeerRetentionDays`, `services/external-conversation/peer-retention.ts`) ; absente ou illisible ⇒ 90 j
  (constante partagée), au-delà de 365 ⇒ 365. L'ouverture et la réouverture posent `purgeAfter` depuis elle, et
  `GET …/consent` la dit à l'utilisateur. Le staging la pose à 90 par défaut.
- **Purge planifiée** : `purgeExpiredExternalPeers` (adresses `purgeAfter <= maintenant`) tourne au démarrage puis
  toutes les heures (`external-peer-retention-sweep`, `jobs/index.ts`). Elle ne REMPLACE pas l'index TTL de #17117 :
  elle en est le filet — l'index n'existe que si la migration nommée a tourné, et la décision précédente notait qu'une
  tâche peut s'arrêter ; à deux, aucun des deux oublis ne garde un numéro. La purge à la suppression de la conversation
  ou du compte reste celle de #17117 (`eraseExternalPeerOnClose`, `eraseExternalPeerHandlesOpenedBy`).
- **Signalement** `POST /conversations/:id/external/report` `{ reportType, disclosedText?, blockPeer? }` :
  - seul un membre ACTIF d'une conversation `external` la signale ; sinon 404, sans dire pourquoi ;
  - le clair ne part que si le signalant le transmet lui-même (`disclosedText`, ≤ 2000) : il devient la `reason`
    d'une ligne `Report` ORDINAIRE (`reportedType: 'conversation'`), lue par un modérateur humain, via
    `ReportService.createReport` (un signalement ouvert par signalant et par cible, priorité `assessReportPriority`) ;
  - aucune analyse de contenu : ni traduction, ni classification, ni modération automatique ;
  - le pair est bloqué par défaut (`ExternalConversationPeer.blockedAt`) — le relais à venir ne remet plus rien de ce
    pair à l'ouvreur ; Meeshy ne peut pas agir sur le compte WhatsApp ;
  - la réponse porte `orientation: 'meta-reporting'` : le client dit le chemin du mécanisme de Meta (sans lien tant que
    l'adresse n'est pas confirmée, #16999).
- Les trois portes sont derrière le drapeau `EXTERNAL_CONVERSATIONS` (éteint en production), débit par compte (20/h
  consentement, 10/h signalement, compteur fermé), et ne journalisent qu'un nom d'erreur.

### Alternatives rejetées
- *Un `purpose` de plus dans `PUT /me/consents/{purpose}`* : ce chemin exige `CONSENT_POLICY_VERSION` (la politique de
  confidentialité générale), alors que l'information sur l'interopérabilité a sa propre version, qui changera après
  l'avis du juriste et la signature avec Meta sans que la politique générale change.
- *L'index TTL seul* : sa création est une étape d'exploitation ; un oubli garde les numéros sans fin.
- *Copier les derniers messages côté serveur au signalement* (modèle WhatsApp) : le serveur ne les a pas en clair ; seul
  le signalant peut les transmettre.
- *Bloquer en supprimant l'adresse* : le pair redeviendrait joignable à la réouverture, et l'utilisateur perdrait la
  trace de son blocage.

### Conséquences
- Le relais (lot suivant) doit lire `blockedAt` et ne rien remettre d'un pair bloqué ; aucun déblocage n'existe encore.
- L'export RGPD (`GET /me/export`) ne porte encore ni le consentement d'interopérabilité ni les adresses d'amis gardées :
  suivi par issue.
- Les écrans d'information et de consentement des trois clients consomment `GET`/`PUT …/consent` ; leur entrée vit dans
  le lot clients (#17007).
