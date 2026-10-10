# Google Play Console — « Contenu de l'application » de Meeshy (`me.meeshy.app`)

> Issue #9843. Relevé du 2026-10-10 sur `dev` (`bc01f4bc42`). L'application Android est la coque Capacitor de `apps/web` (`apps/web/capacitor.config.ts:165`) ; elle parle à `services/gateway`, qui délègue au traducteur (`services/translator`) et à l'agent IA (`services/agent`).
>
> **Ce document est une analyse sourcée, pas un avis juridique.** Chaque réponse se recopie telle quelle dans la console, la preuve est en regard. Les points marqués **[À TRANCHER]** ne doivent pas être recopiés avant d'avoir été levés (§ 5). Une réponse est vraie à la date du relevé : toute feature qui ajoute une donnée, un SDK ou un destinataire oblige à refaire le formulaire.
>
> Le Kotlin natif (`apps/android`) est gelé et ne fait pas partie de ce paquet.

---

## 0. Ce que la coque embarque réellement

| Élément | Constat | Preuve |
|---|---|---|
| SDK tiers natifs | **Un seul : Firebase Cloud Messaging** (`firebase-messaging` 25.0.1, via `@capacitor/push-notifications`). Ni Firebase Analytics, ni Crashlytics, ni Sentry, ni régie publicitaire, ni SDK de paiement. | `apps/web/android/app/build.gradle:84`, `apps/web/android/variables.gradle` (`firebaseMessagingVersion`), `apps/web/android/app/capacitor.build.gradle` (2 plugins : `capacitor-community-media`, `capacitor-push-notifications`) |
| Dépendances JS de production | `@capacitor-community/media`, `@capacitor/push-notifications`, `@mediapipe/tasks-vision` (modèle et WASM **embarqués**, exécution sur l'appareil), `@tanstack/*`, `preact`, `socket.io-client`, `zod`, `zustand`. Aucune analytique, aucun rapport de plantage. | `apps/web/package.json:82-92`, `apps/web/src/lib/calls/video-effects-segmentation.ts:2-5,35-38` |
| Plugins maison | 17 plugins Java (appel, enregistreur, lecture, contacts, presse-papiers, partage, garde d'écran, reconnaissance vocale…). | `apps/web/android/app/src/main/java/me/meeshy/app/` |
| Permissions sensibles | Micro, caméra, position approximative **et précise**, notifications. **Pas** de `READ_CONTACTS`, **pas** de `READ_MEDIA_*` ni de stockage, **pas** de `QUERY_ALL_PACKAGES`. | `AndroidManifest.xml:176-233` ; `<queries>` limité à deux intents, `:249-256` |
| Transport | API `https://gate.meeshy.me`, WebView servie en `https`, aucun `usesCleartextTraffic`. | `apps/web/src/lib/api/config.ts:77`, `apps/web/capacitor.config.ts:116` |
| Traduction, transcription, synthèse vocale | Modèles **locaux** au serveur (Whisper, NLLB-200, MMS, Chatterbox). Aucun appel à une API de traduction ou de voix tierce. | `services/translator/src/services/` (aucun appel sortant hors téléchargement de poids) ; `apps/web/src/institutional/privacy.ts:201,232` |
| Prestataires côté serveur | E-mail : Brevo, SendGrid, Mailgun. SMS : Twilio, Brevo, Vonage. Push : FCM (Android, web), APNs (iOS). Géolocalisation IP : base DB-IP **locale**. **Agent IA : OpenAI ou Anthropic** (voir § 5, point 1). | `services/gateway/src/services/email/providers.ts:28,42`, `services/gateway/src/services/EmailService.ts:269`, `services/gateway/src/services/SmsService.ts:82,142,204`, `services/gateway/src/services/geoip/local-geoip-database.ts`, `infrastructure/docker/compose/docker-compose.prod.yml:459-470` |

**Sens de « partagé » retenu** (définition Google) : un transfert à un tiers. Ne sont **pas** des partages : un prestataire qui traite pour notre compte (e-mail, SMS, FCM, hébergement), un transfert que l'utilisateur déclenche et attend (un message envoyé à ses destinataires, une position envoyée dans une conversation), une obligation légale. **Toutes les réponses « Partagé : Non » ci-dessous tiennent à une condition** : chaque prestataire est lié par un contrat de sous-traitance (RGPD, art. 28) et n'utilise pas les données pour son propre compte. C'est à vérifier contrat par contrat (§ 5).

---

## 1. Sécurité des données — questions générales

| Question de la console | Réponse | Preuve |
|---|---|---|
| Votre application collecte-t-elle ou partage-t-elle des types de données utilisateur obligatoires ? | **Oui** | § 2 |
| Toutes les données utilisateur collectées sont-elles chiffrées en transit ? | **Oui** | HTTPS/WSS vers `gate.meeshy.me` (`config.ts:77`) ; schéma `https` de la WebView (`capacitor.config.ts:116`) ; aucun trafic en clair autorisé (aucun `usesCleartextTraffic` dans `AndroidManifest.xml`, `targetSdk 36`) ; FCM en TLS ; appels WebRTC en DTLS-SRTP. Le chiffrement de bout en bout est **optionnel, par conversation** (#9224) et n'est pas ce que cette case demande. |
| Comment les utilisateurs peuvent-ils créer un compte ? | **Nom d'utilisateur et mot de passe** ; **Autre : lien de connexion par e-mail** | `services/gateway/src/routes/auth/register.ts:170`, `services/gateway/src/services/MagicLinkService.ts` |
| Offrez-vous aux utilisateurs un moyen de demander la suppression de leurs données ? | **Oui** | Dans l'appli : Réglages > suppression du compte (`apps/web/src/routes/settings-sections.tsx`, `apps/web/src/routes/account-deletion.tsx:29-45`). Délai de grâce 30 jours puis purge et anonymisation (`services/gateway/src/routes/account-deletion.ts:22`, `services/gateway/src/services/AccountPurgeService.ts:23-67,110-140`). |
| URL de suppression du compte | **`https://meeshy.me/account/deletion`** **[À TRANCHER, § 5 point 4]** | Route déclarée `apps/web/src/routes/route-table.tsx:348`. Hors connexion, la page affiche aujourd'hui « Ce lien ne porte pas les informations nécessaires. Connectez-vous… » (`apps/web/src/lib/interface-catalogs/catalog-fr.ts:326`) et ne dit ni les étapes, ni ce qui est supprimé ou conservé, ni la durée — ce que Google exige de la page liée. |
| Suppression partielle sans supprimer le compte (facultatif) | **Oui** | Suppression de ses messages, posts, commentaires ; retrait de ses traductions ; export des données (`services/gateway/src/routes/me/export.ts`, `apps/web/src/lib/api/data-export.ts`). |
| Engagement envers les règles relatives aux familles | **Non applicable** (aucune tranche de moins de 13 ans, § 3) | |
| Examen de sécurité indépendant | **Non** | Aucun audit tiers à ce jour. |

---

## 2. Sécurité des données — type par type

Légende : **C** collecté · **P** partagé · **É** traitement éphémère · **Req.** obligatoire / facultatif. Finalités Google : Fonctionnement de l'appli · Analyses · Communications du développeur · Publicité ou marketing · Prévention des fraudes, sécurité et conformité · Personnalisation · Gestion du compte.

**Aucune donnée n'est collectée pour « Publicité ou marketing »** : l'appli ne contient ni publicité ni SDK publicitaire (§ 0), et la fiche du store promet « Zéro pub ». C'est aussi la condition de l'usage non commercial de NLLB-200 et MMS-TTS (CC-BY-NC 4.0, #9227).

### 2.1 Position

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Position approximative | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Prévention des fraudes/sécurité · Gestion du compte | Ville, pays et coordonnées de ville **déduits de l'adresse IP** à chaque connexion (base DB-IP locale, `local-geoip-database.ts`), gardés sur la session (`packages/shared/prisma/schema.prisma:2990-3001`) et le compte (`lastLoginLocation`, `registrationLocation`, `schema.prisma:253-259` ; `AuthService.ts:295`). Montrés à l'utilisateur dans « Sécurité > sessions ». Permission `ACCESS_COARSE_LOCATION` (`AndroidManifest.xml:199`). |
| Position précise | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Tuile « Position » du composeur : `getCurrentPosition` (`apps/web/src/lib/view/use-location-request.ts:64-71`), coordonnées transmises **sans arrondi** (`apps/web/src/lib/send/shared-place.ts:41-49`) et stockées dans le message. `enableHighAccuracy: false`, mais `ACCESS_FINE_LOCATION` est déclarée (`AndroidManifest.xml:200`) : Google attend alors « précise ». Envoyée aux destinataires choisis par l'utilisateur (transfert attendu, pas un partage). La recherche « à proximité » (`services/gateway/src/routes/posts/nearby.ts`) **n'est pas appelée par l'appli web** (aucune occurrence dans `apps/web/src`) : elle ne concerne aujourd'hui que l'app iOS. |

### 2.2 Informations personnelles

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Nom | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Gestion du compte | `firstName`, `lastName`, `displayName`, `username` (`schema.prisma:105-120`). |
| Adresse e-mail | **Oui** | Non | Non | **Obligatoire** | Gestion du compte · Communications du développeur · Prévention des fraudes/sécurité | Seul champ exigé par l'API (`packages/shared/types/api-schemas/auth.ts:248`). Envoyée aux prestataires d'e-mail transactionnel (sous-traitants). Communications : e-mails de compte, de sécurité, digest et diffusions. |
| ID utilisateur | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Gestion du compte · Prévention des fraudes/sécurité · Analyses | Identifiant de compte, pseudo, code de parrainage (`schema.prisma:106-116`) ; rattaché aux clics de liens suivis (`participantId`, `schema.prisma:2164`). |
| Adresse postale | Non | | | | | Aucun champ. |
| Numéro de téléphone | **Oui** | Non | Non | **Obligatoire** | Gestion du compte · Prévention des fraudes/sécurité · Fonctionnement | `phoneNumber` (`schema.prisma:115`). Le formulaire d'inscription web l'exige (#9343, fermée) même si l'API accepte un e-mail seul. Vérifié par SMS via un prestataire (sous-traitant). Sert à être retrouvé par ses contacts (désactivable). |
| Origine ethnique | Non | | | | | Aucun champ. |
| Opinions politiques ou religieuses | Non | | | | | Aucun champ. Voir § 5 point 1 (profilage de l'agent IA). |
| Orientation sexuelle | Non | | | | | Aucun champ. |
| Autres infos | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Personnalisation | Langues (`systemLanguage`, `regionalLanguage`, locale et pays de l'appareil, `schema.prisma:160-177`), fuseau horaire (`:153`), biographie. La date de naissance (`:356`) n'est demandée que pour le profil vocal, qui ne se crée pas depuis l'appli web (aucun écran dans `apps/web/src`). |

### 2.3 Informations financières

| Type | C | Remarque |
|---|---|---|
| Infos de paiement, achats, solvabilité, autres infos financières | **Non** | Aucun paiement, aucun achat intégré, aucune permission `BILLING` (§ 4.2). |

### 2.4 Santé et remise en forme

| Type | C | Remarque |
|---|---|---|
| Infos de santé, infos de remise en forme | **Non** | Aucune fonctionnalité de santé (§ 4.3). |

### 2.5 Messages

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| E-mails | Non | | | | | L'appli ne lit pas la messagerie de l'utilisateur. |
| SMS ou MMS | Non | | | | | Aucune permission SMS. |
| Autres messages dans l'appli | **Oui** | **Non [À TRANCHER, § 5 point 1]** | Non | **Obligatoire** | Fonctionnement | Messages, leurs traductions, transcriptions d'appel gravées (`schema.prisma:905`, `apps/web/src/lib/calls/call-notice.ts:19-20`). Le texte d'un aperçu traverse FCM pour la bannière (sous-traitant). Dans une conversation chiffrée de bout en bout, le serveur ne voit pas le clair (#9224). **Les messages des groupes, chaînes et conversations publiques sont lus par l'agent IA et envoyés à OpenAI ou Anthropic** : « Non » n'est vrai que si ces fournisseurs agissent en sous-traitants sans usage propre. |

### 2.6 Photos et vidéos

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Photos | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Pièces jointes, avatar, bannière, stories, posts, stickers (`apps/web/src/components/composer-attachment-panel.tsx:262,286`, `apps/web/src/routes/profile.tsx:318`). Les métadonnées EXIF (dont le GPS) sont retirées au téléversement (`services/gateway/src/services/attachments/UploadProcessor.ts:364`). Les selfies du jeu restent sur l'appareil (`apps/web/src/lib/game-photo/notebook.ts:3-8`) : non collectés. |
| Vidéos | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Mêmes sources. Un enregistrement d'appel vidéo n'est possible qu'avec l'accord de tous les participants (`schema.prisma:2513-2531`). |

### 2.7 Fichiers audio

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Enregistrements vocaux ou sonores | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Messages vocaux (`RECORD_AUDIO`, `AndroidManifest.xml:186`), transcrits par Whisper puis traduits et resynthétisés **sur nos serveurs**. Enregistrement d'appel avec consentement de tous (`schema.prisma:2513`). Clonage vocal : seulement après consentement explicite (`services/gateway/src/services/ConsentValidationService.ts:9-13`) et non activable depuis l'appli Android (aucun écran) ; s'il a été activé depuis iOS, l'empreinte vocale du compte sert aussi aux vocaux envoyés depuis Android (`schema.prisma:3314-3360`). |
| Fichiers musicaux | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Commentaires qui acceptent `audio/*` (`apps/web/src/lib/comments/comment-media.ts:19`), sons de story. |
| Autres fichiers audio | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Mêmes sources. |

### 2.8 Fichiers et documents

| Type | C | Remarque |
|---|---|---|
| Fichiers et documents | **Non** | L'appli Android n'offre aucun sélecteur de documents génériques : images, vidéos, audio et fiches de contact `.vcf` seulement (`composer-attachment-panel.tsx:173,262,286,314`). La feuille de partage d'Android n'accepte que `image/*`, `video/*`, `text/plain` (`AndroidManifest.xml`, filtres `SEND`). |

### 2.9 Agenda

| Type | C | Remarque |
|---|---|---|
| Événements d'agenda | **Non** | Aucune permission, aucun accès. |

### 2.10 Contacts

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Contacts | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Au sens de Google, « Contacts » couvre aussi le graphe social : liste d'amis, demandes d'ami, blocages, historique d'appels (`schema.prisma:155,1772,2366`). S'y ajoute la **fiche unique** que l'utilisateur choisit d'envoyer dans une conversation : le sélecteur système (`ACTION_PICK`) ne rend que le nom et le numéro de cette fiche (`apps/web/android/app/src/main/java/me/meeshy/app/MeeshyContactsPlugin.java:19-30`). **L'appli Android ne lit ni ne téléverse le carnet d'adresses** : pas de `READ_CONTACTS`, aucun appel aux routes de carnet depuis `apps/web/src`. La synchronisation du carnet (et la règle HMAC des non-inscrits, #9225 / #9230) concerne l'app iOS seule. |

### 2.11 Activité dans les applis

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Interactions avec l'appli | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Analyses · Personnalisation | Vues, impressions et engagement des posts (`schema.prisma:4092-4160`), accusés de lecture, dernière activité (`lastActiveAt`, `:151`), clics sur les liens suivis avec contexte de l'appareil (`apps/web/src/lib/links/click-context.ts`, `services/gateway/src/routes/tracking-links/tracking.ts:116-140`). Le propriétaire d'un lien ne voit que pays, ville, type d'appareil et navigateur, jamais l'IP ni l'empreinte (`routes/tracking-links/response-schemas.ts:105-119`). |
| Historique des recherches dans l'appli | **Oui** | Non | **Oui** | **Facultatif** | Fonctionnement | Les requêtes partent au serveur et ne sont pas enregistrées (`services/gateway/src/routes/conversations/search.ts`, aucune écriture). « Éphémère » suppose qu'aucun journal ne les garde : à vérifier (§ 5 point 6). |
| Applis installées | Non | | | | | Visibilité limitée à deux intents (`AndroidManifest.xml:249-256`). |
| Autre contenu généré par l'utilisateur | **Oui** | Non | Non | **Facultatif** | Fonctionnement | Posts, stories, réels, statuts, commentaires, biographie, packs de stickers, sous-titres d'appel gravés. |
| Autres actions | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Prévention des fraudes/sécurité | Progression du jeu (séries, registre des Meeshes, missions — `schema.prisma:5167-5300`), signalements (`:2319`), blocages. |

### 2.12 Navigation sur le Web

| Type | C | Remarque |
|---|---|---|
| Historique de navigation | **Non** | L'appli n'a pas de navigateur et ne lit pas l'historique. Le clic sur un lien suivi publié dans Meeshy est déclaré en « Interactions avec l'appli » (§ 5 point 7). |

### 2.13 Infos et performances des applis

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Journaux de plantage | **Non** | | | | | Aucun SDK de plantage, aucun envoi d'erreurs client. Les « Android vitals » de la Play Console sont collectés par Google, pas par l'appli. |
| Diagnostics | **Oui** | Non | Non | **Obligatoire** | Analyses · Fonctionnement | Qualité des appels (RTT, pertes, codec, effets, modèle d'appareil) envoyée au raccrochage (`apps/web/src/lib/calls/call-analytics.ts:1-40`, `services/gateway/src/socketio/call-client-reports.ts:252-338`) ; accusés de remise des push (`PushDeliveryReceipt.java`) ; version et build de l'appli sur la session (`schema.prisma:2959-3032`). |
| Autres données sur les performances | Non | | | | | |

### 2.14 Appareil ou autres identifiants

| Type | C | P | É | Req. | Finalités | Preuve et remarques |
|---|---|---|---|---|---|---|
| Appareil ou autres ID | **Oui** | Non | Non | **Obligatoire** | Fonctionnement · Prévention des fraudes/sécurité · Gestion du compte · Analyses | Jeton FCM et identifiant d'appareil (`PushToken`, `schema.prisma:3506-3520`) ; identifiant d'installation Firebase géré par le SDK FCM ; identifiants de session, modèle et système de l'appareil, adresse IP (`UserSession`, `:2959-3032`) ; empreinte d'appareil sur les clics de liens suivis (`schema.prisma:2176`, `click-context.ts`). Aucun identifiant publicitaire. |

### 2.15 Récapitulatif à recopier

- **Collectés** : position approximative, position précise, nom, e-mail, ID utilisateur, téléphone, autres infos, autres messages, photos, vidéos, enregistrements vocaux, fichiers musicaux, autres fichiers audio, contacts, interactions, recherches (éphémère), autre contenu généré, autres actions, diagnostics, appareil ou autres ID.
- **Partagés** : **aucun**, sous les conditions du § 5 (point 1 en premier).
- **Non collectés** : adresse, origine ethnique, opinions, orientation, infos financières, santé et forme, e-mails, SMS/MMS, fichiers et documents, agenda, applis installées, navigation web, journaux de plantage, autres performances.

---

## 3. Public cible et contenu

### 3.1 Ce que disent les textes et le produit

| Fait | Preuve |
|---|---|
| **Les CGU et la politique de confidentialité ne fixent aucun âge minimum.** | `apps/web/src/institutional/terms.ts` (168 lignes, aucune clause d'âge), `apps/web/src/institutional/privacy.ts` (seule mention : « Vérification de l'âge (pour certaines fonctionnalités) », `:87`, et les durées du profil vocal à partir de 18 ans, `:269`). |
| **Aucune barrière d'âge à l'inscription.** La date de naissance n'est demandée que pour le profil vocal. | `apps/web/src/routes/signup.tsx` (aucun champ d'âge) ; `services/gateway/src/services/VoiceProfileService.ts:365-368`. La passerelle sait déjà distinguer un adulte (`PostService.ts:211-213`, découvrabilité géographique réservée aux majeurs). |
| **L'appli met en contact avec des inconnus.** Chaque inscrit rejoint d'office la conversation globale « meeshy » ; recherche de personnes et demandes d'ami ; communautés et conversations publiques ; lien d'invitation sans compte. | `services/gateway/src/routes/auth/register.ts:172` ; fiche du store (`apps/web/android/play/listings/fr-FR/full_description.txt`). |
| **La fiche du store parle à un public jeune.** Tutoiement, « un meilleur ami qui ne parle pas ta langue », K-pop, anime, gaming, correspondant, niveaux, défis et badges ; mascottes Mee et Meo dans le jeu. | `listings/fr-FR/full_description.txt`, `title.txt`, `short_description.txt` |
| Garde-fous existants : signalement et blocage dans l'appli, modération. | `apps/web/src/components/report-sheet.tsx`, `apps/web/src/lib/api/blocks.ts`, `schema.prisma:2319` |

### 3.2 Réponse recommandée

| Case | Réponse | Justification |
|---|---|---|
| 5 ans et moins | Non | |
| 6-8 ans | Non | |
| 9-12 ans | Non | Moins de 13 ans : règlement Familles, incompatible avec une messagerie ouverte aux inconnus. |
| 13-15 ans | **Non** | Voir ci-dessous. |
| 16-17 ans | **Non** | Voir ci-dessous. |
| 18 ans et plus | **Oui** | |

**Recommandation : « 18 ans et plus » seul, à condition de mettre les textes d'accord avant la soumission** (issue à ouvrir, § 6). Raisons :
1. L'appli met des inconnus en relation par défaut (conversation globale, recherche, demandes d'ami) et n'a aucune protection propre aux mineurs. Déclarer 13-17 engage Google à vérifier ces protections, et le DSA (art. 28) exige « un niveau élevé de protection de la vie privée, de sûreté et de sécurité » pour un service accessible aux mineurs.
2. Le RGPD (art. 8) fixe à 15 ans en France l'âge du consentement d'un mineur pour un service de la société de l'information ; en dessous, il faut l'accord du titulaire de l'autorité parentale. Rien de tel n'existe aujourd'hui.
3. L'agent IA, qui écrit au nom d'utilisateurs réels dans les groupes (§ 5 point 1), rend toute ouverture aux mineurs plus risquée encore.

**Ce choix n'est cohérent que si** : (a) les CGU fixent l'âge minimum à 18 ans ; (b) l'inscription demande une déclaration d'âge ; (c) la fiche du store ne vise pas les adolescents. Avec la fiche actuelle, un examinateur Google peut juger que le public réel inclut des mineurs. **Option alternative à soumettre au porteur** : un âge minimum de 16 ans (cases 16-17 et 18+), qui suppose des protections propres aux mineurs (pas de conversation globale d'office, pas de découverte par des inconnus, contenus filtrés) — c'est une décision produit et juridique, pas une case.

| Question | Réponse | Justification |
|---|---|---|
| Votre appli peut-elle attirer involontairement les enfants ? | **Non** (avec réserve) | Aucun contenu destiné aux moins de 13 ans, aucun personnage pour enfants dans la fiche. Réserve : les mascottes Mee et Meo et les mécaniques de jeu (séries, badges, récompenses) ne doivent pas être mises en avant dans les captures et la vidéo de la fiche. |

### 3.3 Déclaration voisine à ne pas oublier

Google exige des applis sociales et de communication une déclaration de **normes de sécurité des enfants** (règlement « Child Safety Standards ») : des normes publiées contre l'exploitation sexuelle des enfants, un signalement dans l'appli, la prise en charge des contenus pédocriminels et un contact désigné. **Aucune page de ce type n'existe dans `apps/web/src/institutional`** (recherche « CSAM / CSAE / pédocriminel / sécurité des enfants » : zéro résultat). À rédiger avant la soumission (§ 6).

---

## 4. Déclarations courtes

### 4.1 Applications gouvernementales

**Non.** Meeshy n'est ni développée ni publiée par ou pour une administration.

### 4.2 Fonctionnalités financières

**« Mon appli ne propose aucune fonctionnalité financière. »**

- Aucun achat intégré, aucun abonnement, aucun paiement : aucune dépendance Stripe, PayPal ou Play Billing, ni dans la coque (`apps/web/package.json`, `apps/web/android/app/build.gradle`) ni dans la passerelle (`services/gateway/package.json:30-80`). Aucune permission `com.android.vending.BILLING`.
- Les **Meeshes** sont une monnaie de jeu **gagnée** en jouant (`reason: 'mint'`, `services/gateway/src/services/meesh/MeeshService.ts:279`) et **dépensée** uniquement en effets de jeu : gel ou rallumage de la Flamme, changement de mission, sceau de saison (`services/gateway/src/services/game/MeeshSpend.ts:26`). Rien ne s'achète avec de l'argent, rien ne se convertit en argent.
- Réserve : le registre porte aussi des « dons » entre utilisateurs (`MeeshService.ts:131`). Tant qu'ils restent sans valeur monétaire, ils ne changent pas la réponse.

### 4.3 Santé

**« Mon appli n'a pas de fonctionnalités de santé. »** Aucune donnée de santé, aucun capteur de santé, aucune intégration Health Connect.

### 4.4 Cases voisines (pour mémoire)

- **Publicités** : « Non, mon appli ne contient pas de publicités » (§ 0 ; fiche : « Zéro pub »).
- **Accès à l'appli** : fournir un compte de démonstration à l'examinateur (identifiants hors dépôt, comme pour l'App Store).
- **Appli d'actualités** : Non.

---

## 5. Ce qui reste incertain — à lever avant de recopier

1. **L'agent IA (bloquant).** `services/agent` est déployé dans le compose de production du dépôt (`infrastructure/docker/compose/docker-compose.prod.yml:459-470`, `LLM_PROVIDER=openai`, `gpt-4o-mini`, repli Anthropic). Il lit les messages des conversations `group`, `channel`, `public` et `global`, **actif par défaut** même sans configuration (`services/agent/src/memory/mongo-persistence.ts:579-606` ; `schema.prisma:4310-4313`, `enabled @default(true)`), les envoie au fournisseur de LLM, déduit de chaque participant un profil de 23 traits psychologiques (`AgentUserRole`, `schema.prisma:4426-4460`), puis **publie des messages au nom d'utilisateurs réels inactifs** (`asUserId`, `services/agent/src/delivery/redis-delivery-queue.ts:97-304` ; seuil d'inactivité 72 h, reprise automatique). Conséquences :
   - **Formulaire** : « Autres messages : Partagé = Non » n'est vrai que si OpenAI et Anthropic sont liés par un contrat de sous-traitance sans usage propre ni rétention. Sinon, la réponse est « Oui ».
   - **Politique de confidentialité** : elle ne nomme que l'hébergement comme prestataire (`privacy.ts:226`) et ne dit rien de cet agent, du profilage ni des messages écrits au nom de l'utilisateur. Google rejette une fiche de sécurité des données qui contredit la politique de confidentialité.
   - **Règles Google Play** : publier au nom d'une personne réelle sans qu'elle le sache relève des règles sur l'usurpation d'identité et le comportement trompeur.
   - **RGPD** : transparence (art. 13), opposition au profilage (art. 21), information sur la logique de traitement, et transfert hors UE si le fournisseur traite aux États-Unis (chapitre V).
   - Le compose du dépôt diffère de celui de la production (`CLAUDE.md`, « Production ») : il faut **vérifier sur le serveur** si l'agent tourne et avec quelle clé.
2. **Prestataires non déclarés dans la politique de confidentialité** : e-mail (Brevo, SendGrid, Mailgun), SMS (Twilio, Brevo, Vonage), push (Google FCM, Apple APNs), LLM. La politique doit les nommer ou en décrire les catégories, et chaque contrat de sous-traitance doit être vérifié.
3. **Âge minimum absent** des CGU et de la politique de confidentialité, et aucune déclaration d'âge à l'inscription (§ 3).
4. **Page de suppression** : `https://meeshy.me/account/deletion` exige d'être connecté et, déconnecté, parle d'un « lien » incomplet. Google demande une page qui nomme l'appli, décrit les étapes, dit ce qui est supprimé ou conservé (messages anonymisés plutôt que supprimés, `AccountPurgeService.ts:38-50,126-138`) et la durée (30 jours). Il faut soit enrichir cette page pour le visiteur déconnecté, soit publier une section dédiée et donner son adresse.
5. **Position précise ou approximative** : les coordonnées partent sans arrondi et la permission précise est déclarée. Si le porteur préfère « approximative seulement », il faut arrondir les coordonnées et retirer `ACCESS_FINE_LOCATION`.
6. **Recherche « éphémère »** : vrai seulement si aucun journal de la passerelle ou de Traefik ne garde les requêtes (paramètres d'URL). À vérifier dans les journaux de production.
7. **Clics de liens suivis** : ville et appareil du visiteur visibles par le propriétaire du lien. Ce n'est pas un tiers au sens de Google, mais l'empreinte d'appareil et la collecte fine (écran, mémoire, cœurs) relèvent de l'art. 5(1)(c) du RGPD (minimisation) et de l'art. 82 de la loi Informatique et Libertés (lecture d'informations du terminal).
8. **Sous-titres d'appel** : `MeeshySpeechPlugin` utilise le service de reconnaissance vocale du système (`SpeechRecognizer.createSpeechRecognizer`, `MeeshySpeechPlugin.java:135`, sans `EXTRA_PREFER_OFFLINE`). Sur la plupart des appareils, c'est Google qui traite l'audio, éventuellement dans le cloud. Ce traitement relève de l'OS ; il mérite une ligne dans la politique de confidentialité.
9. **SDK FCM** : il collecte l'identifiant d'installation Firebase et le jeton. Google le déclare comme traitement pour le compte du développeur (déclaré ici en « Appareil ou autres ID », non partagé). Vérifier que l'export des métriques de remise de FCM n'est pas activé.
10. **Sauvegarde Android** : `allowBackup="true"` (`AndroidManifest.xml:7`) ; seul l'état d'appel est exclu (`res/xml/data_extraction_rules.xml`). La session de la WebView part donc dans la sauvegarde Google de l'utilisateur. Ce n'est pas une collecte au sens du formulaire, mais un point de sécurité.
11. **Carnet d'adresses iOS** (hors formulaire Android) : #9230 est **ouverte** — le serveur garde encore en clair le nom, les numéros et les e-mails des contacts non inscrits (`schema.prisma:518-531`, `ContactDirectoryService.ts:303-324`). Une fois corrigé, l'empreinte HMAC reste une **pseudonymisation** et non une anonymisation (RGPD, considérant 26 et art. 4(5)) : les empreintes restent des données personnelles.
12. **Participants sans compte** (lien d'invitation) : leur nom affiché, leur langue et leur session sont collectés sans compte. Les mêmes réponses s'appliquent, mais la suppression passe par la sortie de la conversation, pas par la page de suppression de compte.

---

## 6. Issues à ouvrir (proposées, non ouvertes)

| Titre proposé | Contenu |
|---|---|
| L'agent IA n'écrit plus au nom d'un utilisateur réel sans son accord, et la politique de confidentialité le décrit | Arrêt ou opt-in explicite par utilisateur et par conversation, étiquette « généré par IA », contrat de sous-traitance OpenAI/Anthropic, mise à jour de `privacy.ts`. Bloque la fiche de sécurité des données. |
| Les CGU fixent un âge minimum et l'inscription le fait déclarer | Clause d'âge dans `terms.ts` et `privacy.ts`, case ou date à l'inscription (web et iOS), refus en dessous. Bloque la déclaration du public cible. |
| La page de suppression de compte sert le visiteur déconnecté comme Google l'exige | Étapes, données supprimées et conservées, délai de 30 jours, nom de l'appli et du développeur. |
| La politique de confidentialité nomme ses sous-traitants | E-mail, SMS, push, LLM, reconnaissance vocale du système ; transferts hors UE. |
| Meeshy publie ses normes de sécurité des enfants | Page publique, contact désigné, procédure de signalement des contenus pédocriminels, déclaration Play. |
| La fiche du store ne vise pas un public mineur | À trancher avec la décision d'âge. |

---

## 7. Ce qui exige un juriste

- **La décision d'âge minimum** (18 ou 16 ans) et les protections propres aux mineurs : elle engage le RGPD (art. 8), le DSA (art. 28) et la responsabilité de Meeshy. Ce n'est pas une case de la console.
- **L'agent IA** : publier au nom d'utilisateurs réels, profiler leurs traits psychologiques et transmettre leurs messages à un fournisseur américain demande une base légale (art. 6), une information (art. 13-14), peut-être une analyse d'impact (art. 35 : profilage à grande échelle) et un cadre de transfert (chapitre V). Seul un avis juridique peut dire si cela peut continuer, et sous quelle forme.
- **Les contrats de sous-traitance** (art. 28) avec chaque prestataire : c'est d'eux que dépend chaque « Partagé : Non » de ce formulaire.
- **Les normes de sécurité des enfants** et l'obligation de signaler les contenus pédocriminels selon le droit applicable : texte à faire valider avant publication.
