# Cercles de proximité et mode Sang : analyse d'impact (AIPD) et conformité

Lot `conformite-cercles`, issue #13942, chapeau #13925, milestone #215. Rédigé le 2026-11-08 par l'agent `conformite-juridique`.

> **Ce document est une analyse technique de conformité, pas un avis juridique.** Il décrit le traitement tel que le code le fait, nomme les obligations avec leur article, propose des corrections techniques et prépare le dossier d'un juriste. Les questions du § 11 exigent un avis signé avant toute ouverture au public.

**Ce qu'il complète.** La première analyse a été déposée le 2026-11-02 en commentaire de #13942, sur l'arbre `d6eef14f5e`. Elle analysait le jalon 2 (écoute, talkie, Bring, position) **avant son écriture**. Depuis, une grande part du jalon 2 est dans `dev`, et le porteur a ouvert les cercles à l'équipe (#16623, 2026-11-07 puis 2026-11-08) et remonté les arrivées et départs de lieux au MVP (#14161). Ce document reprend l'analyse du 2 novembre, la confronte au code réel, dit ce qui a été corrigé et ajoute ce qui est nouveau. Il fait foi dans le dépôt ; le commentaire du 2 novembre reste l'historique.

**Révision du 2026-11-22 (#20364).** La directive du porteur du 2026-11-22 (#20359) remplace le consentement fonction par fonction : chaque palier arrive avec ses fonctions actives, le Sang se consent en une fois et ne se restreint qu'en redescendant. Le § 13 l'analyse. Les passages remplacés sont marqués « Remplacé le 2026-11-22 » et restent lisibles à leur date. Décision : `services/gateway/decisions/2026-11-22-de-sang-a-sang-rien-ne-se-cache-sauf-descendre-20359.md`.

**Base lue.** `origin/dev` à `8b2c2456afb` (2026-11-08), en lecture seule. Branches ouvertes lues : `claude/cercles-16623-serveur` (privilège d'équipe étendu aux audiences), `claude/cercles-16642-serveur` (consentements entre collègues). Spec : `docs/superpowers/specs/2026-10-31-cercles-et-mode-sang-design.md`. Issues lues : les 150 issues du milestone #215, dont #13942, #13948, #14399 à #14412, #14420, #14421, #14465, #14678, #16623, #16642, #16814.

**Ce qui n'est pas analysé ici.** Les appels et les messages directs selon le cercle (#14107, #14108, #14687) : ils réduisent l'exposition et relèvent du régime existant de la messagerie.

---

## 1. Verdict par feature, au 2026-11-08

« Bloquant » veut dire : pas de mise en production publique tant que la colonne de droite n'est pas faite.

| Feature | Dans `dev` | Verdict pour la production | Ce qui lève le blocage |
|---|---|---|---|
| Présence Ami binaire, notifications par cercle, audiences `ACQUAINTANCES` / `CLOSE` / `BLOOD`, jeu borné par le cercle | oui | **Non bloquant** : ces lots réduisent l'exposition | Politique de confidentialité (§ 8) |
| Comptage par paire (`PairInteractionDay`) et Connaissance automatique | oui | **Bloquant**, levable par du code | E7 (#14405), politique (§ 8), registre (§ 9) |
| Rituel du Sang et ses consentements | oui | **Bloquant** | E4 (#14402), E6 (#14404), E5 et J1 |
| Écoute : catégorie (Proche), titre et origine (Sang) | oui (serveur, web, iOS en réception) | **Bloquant** pour le titre ; non bloquant pour la catégorie | Titre : J2, E5. Émission Apple Music : conditions MusicKit (N7) |
| Talkie hors E2EE | oui | **Bloquant**, levable vite | Durée de la copie vocale (#14465, #14678), silence de nuit (#14482), PushToTalk (§ 10) |
| Bring | oui (serveur, Android ; interrupteur global côté web et iOS en cours) | **Bloquant**, levable vite | E12 (#14409), mineurs la nuit (#14421, J3), trace de 30 j (#14420) |
| Position temporaire 1 h / 8 h, à précision choisie | oui (serveur) | **Non bloquant**, sous conditions | Charges push sans coordonnées, textes d'autorisation localisés (E11), politique |
| Regarder ou écouter ensemble | oui (serveur) | **Non bloquant** | Politique ; arrêt sur départ d'un compte (#17022) |
| Position Sang continue, historique 30 j, proximité, journal des consultations | **non** (#13937 ouvert, aucune trace de `LocationTrace`) | **Non bloquant tant que le flag reste OFF** et que la liste blanche ne contient que des comptes de test majeurs et informés. **Bloquant** pour toute ouverture | J1, J3, J4 ; déclarations des stores (§ 10) ; consultation préalable éventuelle (art. 36) |
| Arrivées et départs de lieux entre Sangs (#14161) | **non** | Même régime que la position Sang (même flag) | N3 ; J12 |
| Privilège d'équipe (#16623) | outils : oui ; audiences et entourage : branche ouverte | **Bloquant** pour les audiences de contenu sur des comptes personnels | N1 (#16814 et trois issues à ouvrir), J11 |
| Mineurs (transverse) | — | **Bloquant** | E5, E6 ; J1, J3 |
| **(2026-11-22)** Paliers actifs, verrou du Sang, accord unique à la liste (#20361, #20362) | branche du lot | **Bloquant** | Conditions C1 à C12 (§ 13.3) ; avis J14 à J18 |

---

## 2. Le traitement réel, lu dans le code

### 2.1 Liens et compteurs
- **`UserRelation`** (`packages/shared/prisma/schema.prisma`) : une ligne par paire, niveau accordé par chacun, `levelSince`, délais de 30 jours, `origin`. `transitions` reçoit un `push` à chaque passage et n'est **jamais borné** (`services/gateway/src/services/relations/userRelationWriter.ts:98`). Les baisses y restent à vie (E7, #14405 ouvert).
- **`PairInteractionDay`** : une ligne par paire et par jour UTC, dix-huit compteurs (neuf natures × deux sens), **aucun contenu**. TTL de 120 jours. Toute paire qui interagit est comptée, liée ou non : c'est le graphe des interactions de toute la plateforme sur 120 jours.
- **Connaissance automatique** (`services/gateway/src/services/relations/autoAcquaintance.ts`) : naît sur les seuils de la semaine glissante. Elle est empêchée par un blocage, par l'âge déclaré (`declaresMinorApart`) et, **depuis #14406**, par la préférence `privacy.autoAcquaintance` (`packages/shared/utils/auto-acquaintance-preference.ts`) : un choix stocké l'emporte ; sans choix, activée pour un majeur et un âge inconnu, **désactivée pour un mineur déclaré**. E8 est corrigé côté serveur.

### 2.2 Consentements par personne : `RelationFeatureSetting`

> **Remplacé le 2026-11-22 (§ 13).** Les colonnes deviennent tri-état : nulle = le défaut du palier (actif dès Proche pour la catégorie d'écoute, la batterie et l'injoignabilité ; actif au Sang pour le reste, après l'accord à la liste). Au Sang, le retrait par partage de #14401 disparaît, sauf pour un Sang qui n'a pas encore accepté la liste (décision B, #20367) et sous les conditions C3 et C7. L'accord au palier s'ajoute : `bloodBundleAcceptedAt`, `bloodBundleVersion`, par côté.

- Booléens `listeningCategoryShared` (optionnel), `listeningTitleShared`, `locationShared`, `locationHistoryShared`, `proximityShared`, tous faux par défaut.
- **Depuis #14401**, une date de retrait par partage (`…WithdrawnAt`) et la route `PUT /relations/:userId/settings` (`services/gateway/src/routes/relations/settings.ts`) : un partage se retire sans quitter le Sang (E3 corrigé côté serveur).
- Préférences de réception : `bringBlockedAt`, `talkieBlockedAt` (dates nullables, conformes à la règle « pas de booléen + date »).
- **Reste** : un seul `consentedAt` pour tous les partages, sans version du texte affiché (E4, #14402). Une ligne née d'un blocage porte quand même une date de consentement (#14477).
- **Purge** : `AccountPurgeService.ts:135` efface les lignes où le compte est `ownerId` **ou** `otherId` (E1 corrigé, #14399 fermé).
- **Export** : `GET /me/export?types=relations` sert `links`, `interactionDays` et `consents` (`routes/me/export.ts:828`, E2 corrigé, #14400 fermé). Les clients iOS et Android ne demandent pas encore toutes les sections (#14498).

### 2.3 La loi d'accès (`packages/shared/utils/relation-access.ts`, `relation-levels.ts`)
- Fonction pure. Deux natures de consentement, écrites dans `relation-levels.ts` (E9 corrigé, #14407 fermé) :
  - **consentement RGPD de l'émetteur**, faux par défaut (**remplacé le 2026-11-22** : actif par défaut au palier de `RELATION_LEVEL_DEFAULT_ON`, voir § 13) : `listening.category`, `listening.title`, `location.live`, `location.temporary`, `location.history`, `location.proximity` ;
  - **préférence de réception du destinataire**, active par défaut, base « contrat » : `bring`, `talkie`.
- Seuils : `location.temporary` et `bring` dès Ami, `talkie`, `together` et `listening.category` dès Proche, le reste du partage dès Sang.
- Bouclier des mineurs (`RELATION_MINOR_TARGET_MIN_LEVEL`) : seulement `dm.request` (Connaissance) et `call.ring` (Ami). **Aucun** refus d'âge sur la position, le Bring ou le talkie : c'est la décision du porteur du 2026-10-31.
- Privilège d'équipe : voir § 3.9.

### 2.4 Écoute (`services/gateway/src/services/nowPlaying/`)
- L'émetteur publie un état complet ; le relais le range **scellé** (`secret-at-rest`, AES-256-GCM, clé serveur) sous une clé Redis de TTL **900 s** (`NOW_PLAYING_TTL_SECONDS`), effacée par `now-playing:clear`.
- Chaque lecteur reçoit la projection de **son** accès dans sa room `user:<id>` : titre et origine (Sang qui a reçu le titre), catégorie seule (Proche qui a reçu la catégorie), ou rien. Le consentement est relu à chaque publication, jamais mis en cache. Une baisse, un blocage ou un retrait efface chez l'autre.
- Rien en base. Conforme à l'exigence du 2 novembre (« ≤ 15 min, jamais en base »).

### 2.5 Talkie (`services/gateway/src/services/talkie/`)
- Chaque fragment repart à l'instant où il arrive. **Le serveur ne stocke rien** : ni fragment, ni copie, ni transcription (`talkieRelay.ts:12`).
- Bornes : 30 s par prise de parole, 16 Ko par fragment, 512 Ko et 300 fragments au total. Rejugement pendant la prise de parole (préférence, appel, Ne pas déranger, E2EE, baisse, compte désactivé).
- **Refusé si la paire a une conversation directe chiffrée** (`TALKIE_E2EE_CONVERSATION`, `talkieGate.ts:141`). E10 corrigé (#14408 fermé).
- **La copie en message vocal est faite par le client**, par le chemin vocal ordinaire : elle suit la durée d'un message (durée du compte) et passe par la transcription, la traduction et la synthèse vocale existantes. La durée est en décision (#14465, #14678).

### 2.6 Bring (`services/gateway/src/services/bring/`)
- État en Redis pour la fenêtre de sonnerie, quota par paire et par jour calendaire **du destinataire** (son fuseau, repli UTC). Rien en base : **aucune trace** d'un Bring envoyé ou reçu (#14420 ouvert).
- Interrupteur global `notification.bringEnabled` lu par le serveur (`bringService.ts:163`) ; réglages web et iOS en cours (#16588, #16609). Blocage par personne : `bringBlockedAt`.
- Le nom et l'avatar de l'expéditeur ne partent pas sur l'écran verrouillé si le destinataire a coupé `showSenderName`.
- iOS : seulement `time-sensitive` dans les entitlements, **pas** de Critical Alerts (#14112 ouvert).

### 2.7 Position temporaire (`services/gateway/src/services/sharedLocation/`, #16980)
- Décision du porteur du 2026-11-07 : le serveur garde la position **entière** et la liste des destinataires avec la précision accordée à chacun, et **tronque au service**. L'état est scellé (`secret-at-rest`, lié au compte en données authentifiées).
- Durée : 60 ou 480 minutes (`SHARED_LOCATION_DURATIONS_MINUTES`). La durée de vie de la clé **est** le temps restant ; `location:share-stop` l'efface ; pointeurs de session au plus 8 h. **Aucun historique.**
- `GET /relations/locations?bbox=` sert, champ par champ, la position à la précision du lecteur (`routes/relations/locations.ts`).
- Aucun journal de coordonnées trouvé dans le relais.

### 2.8 Regarder ou écouter ensemble (`services/gateway/src/services/together/`, #17012)
- Séance scellée en Redis, TTL 4 h, index de paire et d'utilisateur par HMAC à clé secrète. Coupée par un blocage ou une baisse. Aucun contenu du média n'est copié.

### 2.9 Ce qui n'existe pas encore
- `LocationTrace`, `LocationConsultation`, proximité, lieux (#13937, #14161) : aucune trace dans le code.
- iOS `Info.plist` : seulement `NSLocationWhenInUseUsageDescription`, **en anglais** et qui parle de « find nearby friends » ; pas de `location` dans `UIBackgroundModes` ; pas de `InfoPlist.strings`. `NSAppleMusicUsageDescription` est présent.
- Android : `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `USE_FULL_SCREEN_INTENT`. **Ni** `ACCESS_BACKGROUND_LOCATION`, **ni** `FOREGROUND_SERVICE_LOCATION`, **ni** `NotificationListenerService` : l'écoute Android n'émet pas encore (#16836).
- Live Activity de position (« jusqu'à l'arrivée ») : pas encore côté iOS.

---

## 3. Analyse d'impact (art. 35 RGPD)

### 3.1 Elle est requise
Les lignes directrices WP248 rév.01 du CEPD exigent une AIPD dès que deux critères sont réunis. Ici, six le sont :
1. **évaluation** : niveaux calculés depuis les interactions ;
2. **surveillance systématique** : position continue, historique, lieux ;
3. **données hautement personnelles** : localisation, voix, goûts culturels ;
4. **personnes vulnérables** : mineurs de 13 à 17 ans, ouverts au Sang ;
5. **usage innovant** : Bring qui passe Ne pas déranger, proximité, arrivées et départs ;
6. **croisement** : comptage d'interactions de toute la plateforme, croisé avec les liens.

La liste française des traitements soumis à AIPD (CNIL, délibération 2018-327) vise aussi la localisation à grande échelle. L'échelle n'est pas atteinte à moins de 1 000 utilisateurs, mais les critères ci-dessus suffisent.

**Consultation préalable (art. 36)** : obligatoire si le risque résiduel reste élevé après les mesures. C'est au responsable du traitement, conseillé, de le dire pour la position des mineurs (J4).

### 3.2 Tableau par traitement

| Traitement | Finalité | Données | Base légale proposée | Destinataires | Durée (code) |
|---|---|---|---|---|---|
| T1. Comptage par paire | Proposer et ouvrir les cercles | Paire, jour, compteurs par nature et sens | Intérêt légitime (art. 6(1)(f)), opposition possible (art. 21) | Les deux membres (progression, notification) | 120 j (TTL) |
| T2. Connaissance automatique | Ouvrir le message direct à qui échange déjà | Lien, transitions | Intérêt légitime ; décision automatisée à qualifier (art. 22, J5) | Les deux membres | Vie du lien ; transitions **sans borne** (E7) |
| T3. Liens choisis et rituel | Graduer ce que chacun voit | Niveaux accordés, demandes, transitions | Contrat (art. 6(1)(b)) | Les deux membres | Vie du lien ; purge du compte |
| T4. Consentements de cercle | Démontrer et appliquer les choix | Partages, retraits, préférences de réception ; **depuis le 2026-11-22**, l'accord à la liste du Sang et sa version | Obligation de démontrer (art. 7(1)) | Responsable | Vie de la ligne ; preuve à fixer (J9) |
| T5. Écoute | Partager ce que j'écoute | Catégorie ; titre et origine | Consentement (art. 6(1)(a)) ; **explicite** pour le titre (art. 9(2)(a), J2) | Proche consentant : catégorie ; Sang consentant : titre | 900 s, scellé, jamais en base |
| T6. Talkie | Parler en direct à un Proche | Voix (fragments), paire, horodatage ; copie vocale | Contrat ; confidentialité des communications (directive 2002/58, art. 5(1)) | La personne visée ; Apple et Google pour l'acheminement | Fragments : aucun stockage. Copie : durée d'un message (#14465) |
| T7. Bring | Faire sonner l'autre en urgence | Expéditeur, destinataire, heure, quota | Contrat ; le blocage est une préférence de réception, pas un consentement | La personne visée ; Apple et Google | Fenêtre de sonnerie et quota en Redis ; aucune trace |
| T8. Position temporaire | Montrer où je suis pour 1 h ou 8 h | Coordonnées entières, destinataires et leur précision | Consentement (art. 6(1)(a)) et art. 5(3) de la directive 2002/58 (art. 82 LIL) pour la lecture du GPS | Chaque Ami choisi, à la précision choisie | Durée du partage (≤ 8 h), scellé |
| T9. Ensemble | Lecture synchronisée | Paire, média, position de lecture | Contrat | La paire | 4 h |
| T10. Position Sang continue, historique, proximité, journal | Savoir où est un très proche | Coordonnées continues ; historique ; consultations ; co-localisation | Consentement **explicite** par observateur et par partage (art. 9(2)(a) par inférence, J2). **Remplacé le 2026-11-22** : un accord par observateur, à la liste entière du Sang (§ 13, J14) | Chaque Sang consentant, jamais un admin ni une room | Live : rien après l'arrêt. Historique et consultations : 30 j (prévu). Proximité : délai 2 h |
| T11. Lieux (#14161) | Prévenir d'une arrivée ou d'un départ | Géorepère d'un lieu nommé (maison, travail, école), événements | Consentement explicite de l'observé seul | Le Sang consentant | Vie du lieu ; événements à fixer |
| T12. Privilège d'équipe | Tester les cercles entre comptes de l'équipe | Tout ce qui précède, entre comptes MODERATOR, ADMIN et BIGBOSS | **À qualifier** (N1, J11) | Les comptes de l'équipe | Celle de chaque feature |

### 3.3 Comptage et Connaissance automatique (T1, T2)
- **Risques** : (a) un graphe des interactions réutilisable à d'autres fins ; (b) la Connaissance ouvre le message direct sans demande : un adulte peut joindre directement un mineur **qui ne s'est pas déclaré** ; (c) la notification révèle que l'autre a beaucoup interagi ; (d) une progression servie à une paire non liée peut trahir l'âge ou l'opposition de l'autre (#14527).
- **Mesures en place** : aucun contenu, TTL 120 j, blocage, âge déclaré, opposition (#14406), purge, export.
- **À ajouter** : E7 ; une garde « lecteurs fermés » de `PairInteractionDay` qui fige la finalité ; ne plus compter une paire dont l'un s'oppose (#14682) ; l'interrupteur serveur global (#14680) ; ne jamais ouvrir sans le choix d'un majeur déclaré (#14683).
- **Risque résiduel** : faible pour les majeurs, moyen pour les mineurs non déclarés tant que l'âge reste facultatif (E6).

### 3.4 Écoute (T5)
- **Inférences sensibles** : un titre peut révéler une religion, une opinion ou une orientation. La CJUE juge qu'une donnée **susceptible de révéler indirectement** une catégorie particulière en relève (C-184/20, *OT*, 1er août 2022 ; C-252/21, *Meta c. Bundeskartellamt*, 4 juillet 2023). Le titre exige un consentement explicite : le rituel donne une action positive distincte, ce qui va dans ce sens (J2).
- **Mesures en place** : troncature serveur par lecteur, relecture du consentement à chaque publication, effacement à la baisse et au retrait, TTL 900 s, scellement.
- **À ajouter** : liste d'applications exclues et pause d'un geste sur chaque client émetteur ; signe visible quand le partage est actif ; pour Android, divulgation visible avant l'accès aux notifications (§ 10.2) ; conditions MusicKit et Spotify (N7).
- **Risque résiduel** : faible pour la catégorie ; moyen pour le titre (art. 9, mineurs).

### 3.5 Talkie (T6)
- **Risques** : (a) voix jouée sans geste du destinataire, en public ; (b) la copie vocale garde la voix aussi longtemps qu'un message et passe par la transcription : elle doit respecter les consentements vocaux existants (`voice-data`, `voice-profile`, `voice-cloning`) ; (c) harcèlement vocal ; (d) **pas chiffré de bout en bout** : l'interface doit le dire (loyauté, art. 5(1)(a)).
- **Mesures en place** : refus sous Proche, en E2EE, en appel, en Ne pas déranger ; bornes de débit ; coupure au blocage, non annoncée à l'émetteur ; aucun stockage serveur.
- **À ajouter** : silence la nuit dans le fuseau du destinataire même sans Ne pas déranger (#14482) ; durée de la copie (#14465 : je recommande l'option de minimisation, effacement à 30 j, #14678) ; signalement d'une prise de parole (lot #14110) ; E2EE du talkie à terme (#13949).
- **Risque résiduel** : faible une fois la copie bornée.

### 3.6 Bring (T7)
- **Risques** : (a) harcèlement de nuit, Ne pas déranger passé, jusqu'à 30 par jour d'un Sang ; (b) **un adulte Ami d'un mineur** peut le réveiller chaque nuit (#14421) ; (c) **confiance mal placée** : présenté comme « urgence extrême », il peut ne pas sonner (pas de Critical Alerts, silencieux, réseau). Responsabilité si l'on s'y fie (E12, J8) ; (d) sans trace, un abus ne peut pas être signalé après coup (#14420).
- **Mesures en place** : quota par jour, blocage par personne non notifié, interrupteur global côté serveur, arrêt d'un geste, nom masqué sur l'écran verrouillé selon le réglage.
- **À ajouter** : E12 (clause et phrase d'écran) ; trace de 30 jours pour signaler (#14420), ce qui est proportionné à la finalité de sécurité (art. 5(1)(e)) ; règle de nuit pour les mineurs (#14421) ; ne pas laisser deviner le blocage ni le fuseau (#14677).
- **Risque résiduel** : faible pour les majeurs une fois E12 fait.

### 3.7 Position temporaire (T8)
- **Inchangé le 2026-11-22** : la position temporaire reste hors du verrou du Sang et garde son geste par partage.
- **Ce qui est bien** : durée courte (1 h ou 8 h) qui s'éteint seule, précision choisie par destinataire, troncature serveur, scellement, aucun historique, consentement faux par défaut. C'est compatible avec le standard 10 de l'AADC (désactivé par défaut, retour à « off » à la fin du partage).
- **Point d'attention** : le serveur garde la position **entière** pour pouvoir servir plus précis après une montée de lien. C'est un choix du porteur, défendable par la durée courte. Mais la minimisation (art. 5(1)(c)) voudrait ne garder que la précision la plus fine accordée à un destinataire actuel. À reconsidérer si la durée maximale augmente.
- **`secret-at-rest`** utilise une clé serveur : c'est une **mesure de sécurité** (art. 32), pas une pseudonymisation au sens de l'art. 4(5), puisque le responsable lit en clair.
- **À ajouter** : extinction à la désactivation du compte (#16987) ; charges APNs, FCM et Live Activity sans coordonnées (ETA et distance seulement) ; signalement d'un partage de position en tête de file (#14505).

### 3.8 Position Sang continue, historique, proximité, lieux (T10, T11)
- **Risques** : (a) **contrôle coercitif** : un partenaire ou un proche exige le partage ; un consentement donné sous pression n'est pas libre (art. 4(11), art. 7(4)) ; (b) un mineur suivi par un majeur ; (c) fuite de l'historique ; (d) consentement figé alors que la relation se dégrade ; (e) inférences sensibles. **Les lieux aggravent (a), (b) et (e)** : « maison », « école » et « travail » nomment exactement ce qu'un harceleur cherche, et l'école désigne un mineur.
- **Révisé le 2026-11-22 (§ 13.2, point 4)** : le fantôme global et le fantôme ciblé n'agissent plus entre Sangs. La seule restriction est la baisse, dont l'autre peut déduire l'effet. Le risque (a) remonte, et les mesures compensatoires du § 13.5 deviennent des conditions de production.
- **Mesures prévues par la spec** : flag OFF et liste blanche ; fantôme global et ciblé, indétectable (**plus entre Sangs depuis le 2026-11-22**) ; journal des consultations visible du seul observé, avec alerte d'excès ; effacement de son historique ; rien enregistré en fantôme ; proximité au plus une fois toutes les 2 h ; lieux activés par l'observé seul, trois interrupteurs éteints par défaut, aucune coordonnée dans l'alerte, 5 lieux par paire.
- **À ajouter avant le flag** :
  - rappel de consentement périodique (« X voit ta position depuis 30 jours, continuer ? ») ;
  - signe permanent visible côté observé quand un partage est actif ;
  - retrait d'un geste depuis la notification persistante ;
  - proximité seulement si **les deux** ont consenti l'un envers l'autre ;
  - précision dégradée par défaut pour un mineur déclaré ;
  - lecture de l'historique journalisée dans `LocationConsultation` **avant** d'être servie ;
  - lieux : pour un mineur déclaré, pas de lieu « école » nommé comme tel, ou décision J12 ; durée des événements d'arrivée et de départ (proposition : 30 j, comme l'historique) ;
  - aucune coordonnée dans les journaux, les charges push ni les Live Activities.
- **Risque résiduel** : moyen pour les majeurs, **élevé pour les mineurs** (J1, J3, J4).

### 3.9 Privilège d'équipe (T12, #16623) — nouveau
**Ce que fait le code.** Entre deux comptes dont **les deux** rôles sont MODERATOR, ADMIN ou BIGBOSS (`isPlatformTeam`, `role-types.ts:328`), le niveau effectif vaut Sang, sans lien (`relation-access.ts:165`). Restent fermés : le blocage, soi-même, `NOBODY`, le consentement et, entre un mineur et un majeur déclarés, le privilège lui-même. Sur `dev`, les audiences de contenu et l'entourage restent au lien réel. **La branche `claude/cercles-16623-serveur` les ouvre** (décision du 2026-11-08), ne laissant fermée que `acquaintance.auto`. La branche `claude/cercles-16642-serveur` permet de consentir au titre et à la position entre collègues sans lien.

**Analyse.**
- **Qui sont ces personnes ?** Les rôles MODERATOR, ADMIN et BIGBOSS sont portés par des comptes Meeshy **personnels** : rien dans le code ne distingue un compte de test d'un compte qu'un modérateur bénévole ou un salarié utilise pour sa vie privée.
- **Audiences de contenu (N1-a).** Une publication « Sang » d'un membre de l'équipe deviendra lisible par **tous** les comptes de l'équipe, et ses Proches seront prévenus… mais aussi toute l'équipe. L'auteur a choisi une audience ; le système l'élargit à un groupe qu'il ne voit pas. C'est un manquement probable à la loyauté et à la transparence (art. 5(1)(a), art. 13) et à la protection dès la conception (art. 25(2) : par défaut, les données ne sont pas rendues accessibles à un nombre indéterminé de personnes sans intervention de la personne).
- **Consentement entre collègues (N1-b).** Le CEPD tient le consentement d'un salarié envers son employeur pour rarement libre (lignes directrices 05/2020 sur le consentement, §§ 21 à 23 ; considérant 43). Un BIGBOSS qui demande à un MODERATOR de partager sa position ou son écoute crée exactement ce déséquilibre. En France, la géolocalisation d'un salarié est en outre encadrée (Code du travail, art. L. 1121-1 : restriction justifiée et proportionnée ; information préalable, art. L. 1222-4).
- **Bring entre collègues (N1-c).** Au niveau Sang, un collègue peut faire sonner un autre **30 fois par jour**, Ne pas déranger passé, sans aucun lien. Le blocage par personne et l'interrupteur global existent, mais le défaut est ouvert.
- **Perte du rôle (N1-d).** Un consentement accordé entre collègues survit à la perte du rôle et deviendrait lisible si un lien Sang naissait plus tard, sans rituel (#16814). Le correctif de la branche 16623 (`f9ddaaaaca3`) coupe l'accès au fil et au temps réel, mais pas la ligne de consentement.
- **Âge inconnu (N1-e).** Le privilège ne s'éteint qu'entre un mineur et un majeur **déclarés**. Un modérateur mineur sans date de naissance l'obtient face à un adulte.

**Mesures proposées.**
1. Restreindre le privilège à des comptes marqués **de test** (un champ ou une liste blanche serveur, comme le flag de position), plutôt qu'à tout compte d'équipe. C'est la mesure qui lève tous les risques à la fois, et elle sert l'objectif du porteur (tester sans construire de liens).
2. À défaut : informer chaque compte de l'équipe, à l'attribution du rôle, de ce que le privilège ouvre ; dans le composer d'un compte d'équipe, dire « L'équipe voit aussi cette publication » sous les audiences de cercle ; offrir de s'en retirer.
3. Bring entre collègues sans lien : quota d'Ami (1 par jour), pas de Sang.
4. Consentements accordés hors rituel : marqués comme tels, éteints à la perte du rôle (#16814), et expirant seuls (proposition : 7 jours).
5. Attribuer MODERATOR, ADMIN ou BIGBOSS seulement à un compte dont l'âge déclaré est majeur.

---

## 4. Les mineurs (transverse)

- **Âge minimal du compte** : 13 ans. Déclaration de la date de naissance **facultative** (politique, « Âge et Mineurs »).
- **Art. 8 RGPD et art. 45 LIL.** Pour un service de la société de l'information proposé directement à un enfant, le consentement d'un mineur seul n'est valable qu'à partir de **15 ans en France** ; en dessous, il faut le consentement conjoint du mineur et du titulaire de l'autorité parentale. D'autres États membres fixent 13, 14 ou 16 ans.
- **Jumelle divergente (E5, #14403).** `services/gateway/src/services/social/eventPrivacy.ts:6` déclare `DIGITAL_CONSENT_AGE = 15` et ferme le profilage sous 15 ans, alors que la loi des cercles ouvre la position, le titre d'écoute et la position temporaire dès 13 ans. La constante vit dans la passerelle, pas dans `packages/shared`.
- **Âge inconnu (E6, #14404).** Le rituel, la position temporaire et l'écoute s'ouvrent sans date de naissance. L'âge déclaré ne protège que celui qui se déclare.
- **DSA, art. 28.** Les lignes directrices de la Commission (14 juillet 2025) recommandent de désactiver par défaut le partage de position des mineurs et jugent l'auto-déclaration insuffisante comme assurance de l'âge. Mais l'art. 19 DSA exclut les micro et petites entreprises de la section 3, art. 28 compris (J3).
- **AADC (Royaume-Uni)**, si Meeshy y est proposé à des moins de 18 ans. Standard 10 : position désactivée par défaut, signe visible, et retour à « off » à la fin de chaque session pour une position visible des autres. La position temporaire y est compatible ; la position Sang **continue** d'un mineur ne l'est pas sans « raison impérieuse » démontrée (J3).
- **Décision du porteur (#13948).** Sang, position et Bring ouverts à tous derrière un consentement refusable. Tenable pour les 15 à 17 ans en France. Pour les 13 et 14 ans, elle exige le consentement parental (niveau Atome, #15094, hors MVP) ou une autre base que le consentement (J1).

---

## 5. Durées de conservation

| Donnée | Où | Durée dans le code | Durée proposée | État |
|---|---|---|---|---|
| Compteurs par paire | `PairInteractionDay` | 120 j (TTL) | 120 j | Conforme |
| Lien | `UserRelation` | Vie du lien ; purge du compte | Une ligne revenue à PUBLIC des deux côtés s'efface après son délai de 30 j | À ajouter (issue à ouvrir) |
| Passages du lien | `UserRelation.transitions` | **Sans borne** | La dernière baisse par acteur, ou 12 mois | E7, #14405 |
| Consentements | `RelationFeatureSetting` | Vie de la ligne ; purgés avec le compte | Vie du lien ; preuve d'un retrait : durée fixée par le juriste | E4, J9 |
| Rituel | Redis | 60 s | 60 s | Conforme |
| Écoute | Redis, scellé | 900 s, effacée à `clear` | Inchangé | Conforme |
| Talkie, fragments | Mémoire | Aucun stockage | Inchangé | Conforme |
| Talkie, copie vocale | `Message` + pièce jointe | Celle d'un message | 30 j (`expiresAt`), sauf si le direct n'a pas été reçu | #14465, #14678 |
| Bring, sonnerie et quota | Redis | Fenêtre de sonnerie ; jour du destinataire | Quota : 48 h au plus | Conforme |
| Bring, trace | — | **Aucune** | 30 j, pour revoir et signaler | #14420 |
| Position temporaire | Redis, scellé | Temps restant du partage (≤ 8 h) ; pointeurs ≤ 8 h | Inchangé | Conforme |
| Ensemble | Redis, scellé | 4 h | Inchangé | Conforme |
| Position Sang, historique | `LocationTrace` (prévu) | — | 30 j (TTL), effacement à la demande, rien en fantôme, purge du compte | Exigence de #13937 |
| Journal des consultations | `LocationConsultation` (prévu) | — | 30 j (TTL), purge des deux comptes | Exigence de #13937 |
| Proximité | Redis, `Notification` | — | Délai 2 h ; notification 30 j ; aucune trace du lieu | Exigence de #13937 |
| Lieux et leurs événements | (prévu) | — | Lieu : jusqu'à son retrait ou celui du lien. Événements : 30 j | Exigence de #14161 |
| Live Activity « jusqu'à l'arrivée » | Appareil | — | Aucune coordonnée ; fin à l'arrivée ou au terme | Exigence de #14109 |

---

## 6. Écarts : état au 2026-11-08

### 6.1 Écarts de l'analyse du 2 novembre

| # | Écart | Issue | État lu dans le code |
|---|---|---|---|
| E1 | Consentements non purgés à la suppression du compte | #14399 | **Corrigé** (`AccountPurgeService.ts:135`). Comptes purgés avant : #14461 |
| E2 | Export sans cercles | #14400 | **Corrigé** côté serveur. Clients : #14498 |
| E3 | Pas de retrait d'un partage sans quitter le Sang | #14401 | **Corrigé** côté serveur (`PUT /relations/:userId/settings`, dates de retrait). Suites : #14585, #14586, #14587, #14685, #14686 |
| E4 | Consentement sans version du texte | #14402 | **Partiel** : dates de retrait présentes ; pas de version ni de date d'octroi par partage |
| E5 | Âge du consentement numérique (15 ans) contredit par la loi des cercles | #14403 | **Ouvert**, suspendu à J1 |
| E6 | Rituel et position sans âge déclaré | #14404 | **Ouvert** |
| E7 | Passages du lien sans borne | #14405 | **Ouvert** |
| E8 | Pas d'opposition à la Connaissance automatique | #14406 | **Corrigé** côté serveur ; suites : #14526, #14680, #14682, #14683 |
| E9 | Consentement et préférence de réception confondus | #14407 | **Corrigé** (`relation-levels.ts`) |
| E10 | Talkie en clair dans une conversation chiffrée | #14408 | **Corrigé** (`talkieGate.ts:141`) ; coupure en cours de parole : #14490 |
| E11 | Texte d'autorisation de position en anglais seul, sans « Toujours » | rattaché à #13937 et #14109 | **Ouvert** : `Info.plist` inchangé |
| E12 | Pas de clause « Meeshy n'est pas un service d'urgence » | #14409 | **Ouvert** : rien dans `terms.ts` |
| E13 | Politique muette sur les cercles et sans base légale | #14410 | **Ouvert** : `privacy.ts` daté du 22 octobre, sans cercles (§ 8) |
| E14 | Pas de registre des traitements | #14411 | **Ouvert** : fiches proposées au § 9 |
| E15 | Story exportée par un autre : présence et cercle de l'auteur | #14412 | **Ouvert** |

### 6.2 Écarts nouveaux

| # | Écart (code lu) | Référence | Correction technique | Issue |
|---|---|---|---|---|
| N1 | Privilège d'équipe sur des comptes personnels : audiences élargies sans le savoir, consentement entre collègues, Bring à 30 par jour, consentement qui survit au rôle, âge inconnu (§ 3.9) | Art. 5(1)(a), 13, 25(2) ; considérant 43 ; Code du travail L. 1121-1 | § 3.9, mesures 1 à 5 | #16814 ; à ouvrir : « Le privilège des cercles de l'équipe ne vaut que pour des comptes de test », « Une publication de cercle d'un compte de l'équipe dit que l'équipe la voit aussi », « Un rôle d'équipe ne s'attribue qu'à un majeur déclaré » |
| N2 | Le Bring entre deux collègues sans lien vaut un Bring de Sang (30 par jour) | Art. 5(1)(c), 25 | Quota d'Ami pour un niveau ouvert par le rôle | À ouvrir : « Entre collègues sans lien, le Bring garde le quota d'un Ami » |
| N3 | Lieux nommés (maison, école, travail) entre Sangs, prévus au MVP sans règle pour un mineur | Art. 25, considérant 38 ; AADC 10 | Pas de lieu « école » pour un mineur déclaré tant que J12 n'est pas rendu ; événements 30 j ; aucune coordonnée | Commentaire sur #14161 |
| N4 | Position temporaire : le serveur garde la position entière, même quand aucun destinataire ne reçoit la précision fine | Art. 5(1)(c) | Garder la précision la plus fine accordée à un destinataire actuel ; recalculer à la montée de lien à partir du prochain envoi | À ouvrir si la durée maximale dépasse 8 h ; sinon accepté et documenté |
| N5 | La politique dit que Ne pas déranger ne laisse passer que les « alertes de sécurité critiques » ; le Bring et le talkie la traversent ou la contournent | Art. 12, 13 | § 8 | #14410 |
| N6 | La politique annonce une « Vérification de l'âge » (carte « Données Vocales ») qui n'existe pas | Art. 5(1)(a), 13 | Retirer ou décrire exactement | #14410 |
| N7 | Émission de l'écoute depuis Apple Music (#16803) : les conditions MusicKit et Apple Media Services encadrent l'affichage de données de lecture à des tiers ; non vérifié | Contrat (conditions développeur) | Relire l'accord MusicKit et les conditions de Spotify avant d'ouvrir l'émission | À ouvrir : « L'émission de l'écoute respecte les conditions MusicKit et Spotify » |
| N8 | `NSLocationWhenInUseUsageDescription` parle de « find nearby friends », une feature qui n'existe pas | App Store 5.1.1(ii) ; art. 13 | Texte exact, localisé en 7 langues | Avec E11 |

---

## 7. Écrans de consentement

> **Remplacé le 2026-11-22 (§ 13).** Au rituel du Sang, une seule action positive porte sur la liste entière, versionnée. À l'entrée en Proche, la liste de ce qui s'active est montrée avant l'acte. Les autres règles ci-dessous restent : dépliant, version, sept langues, accessibilité, retrait à la place de l'activation (au Sang, ce retrait est la baisse).

Règles communes, inchangées au 2026-11-08 : une action positive par partage ; refuser ne bloque pas le niveau ; défaut éteint pour tout consentement ; un dépliant « ce que ça montre, à qui, combien de temps, comment arrêter » ; version du texte enregistrée (E4) ; 7 langues ; VoiceOver et TalkBack ; le retrait est à la place de l'activation. Ces écrans précèdent et expliquent les autorisations du système, sans les remplacer.

**État.** Le rituel iOS déplie désormais chaque partage : durée, lieu de stockage, journal des consultations, fantôme, où retirer, lien vers la politique (`367f53fb886`, dans `dev`). Le web accorde la catégorie d'écoute (#16831). Android : #16836, #14427.

| Moment | Feature | Nature | Texte du dépliant (à faire valider) |
|---|---|---|---|
| Entrée en Ami | Bring reçu | Préférence de réception, active | « [X] peut faire sonner ton téléphone pour une urgence, même en silencieux et en Ne pas déranger, [1] fois par jour. Tu peux l'en empêcher, lui seulement ou tout le monde, dans Réglages. Il ne saura pas que tu l'as bloqué. Meeshy n'est pas un service d'urgence : en cas de danger, appelle le 112. » |
| Entrée en Ami | Position temporaire émise | Consentement, éteint | « [X] verra où tu es pendant [1 h / 8 h], à la précision que tu choisis. Rien n'est gardé après. Tu arrêtes quand tu veux. » |
| Entrée en Proche | Talkie reçu | Préférence de réception, active | « [X] peut te parler en direct ; sa voix se joue dès qu'elle arrive, sauf en appel, en Ne pas déranger et la nuit. **Ce n'est pas chiffré de bout en bout.** Une copie reste en message vocal [30 jours]. » |
| Entrée en Proche | Catégorie d'écoute émise | Consentement, éteint | « [X] verra si tu écoutes de la musique, regardes une vidéo ou navigues, sans le titre. Seul l'état du moment est transmis. Pause d'un geste. » |
| Rituel Sang | Titre et origine | Consentement **explicite**, éteint | « Un titre peut en dire beaucoup sur toi (croyances, opinions, goûts). Rien n'est gardé après la fin de l'écoute. Tu peux exclure des applications. » |
| Rituel Sang | Position continue, historique, proximité | Consentements explicites, éteints | Textes actuels, plus : « On te redemandera dans 30 jours » et « la proximité seulement si [X] l'a acceptée aussi ». |
| Lien Sang | Lieux (#14161) | Consentement explicite de l'observé, éteint | « [X] saura quand tu arrives ou pars de [lieu]. Il ne voit pas l'adresse. Tu coupes pour ce lieu, pour [X] ou pour tous. » |
| Compte de l'équipe | Privilège (N1) | Information | « Comme membre de l'équipe, tes collègues ont avec toi les features d'un Sang sans lien, et voient tes publications de cercle. » (si la mesure 1 n'est pas retenue) |
| Mineur déclaré de moins de 15 ans | Tout consentement | Selon J1 | « Pour partager ça, il faut aussi l'accord d'un parent », ou la feature est absente et l'interface le dit |
| Âge jamais déclaré | Avant le rituel et toute position | Écran neutre | Date de naissance demandée une fois, sans case pré-remplie (E6) |

---

## 8. Politique de confidentialité : diff proposé

Fichier : `apps/web/src/institutional/privacy.ts`, servi sur meeshy.me/privacy et ouvert depuis les trois clients. Ce diff est une **proposition de texte** : il ne doit pas être publié avant la relecture du juriste (J1, J2, J8), et sa publication doit être **notifiée** aux utilisateurs (section « Mises à Jour »). Il se livre par #14410, avec les témoins de `privacy.test.ts`.

```diff
-  mention: 'Dernière mise à jour : 22 octobre 2026',
+  mention: 'Dernière mise à jour : [date de publication]',

   // Informations Collectées › Données Vocales
-                "Vérification de l'âge (pour certaines fonctionnalités)",
+                "Les messages vocaux et la copie de vos prises de parole en talkie",

   // Informations Collectées › Informations Techniques
                 'Localisation approximative (ville, pays)',
+                'Position précise, seulement quand vous la partagez (pour une durée, ou en continu avec un Sang)',
+                'Ce que vous écoutez ou regardez, seulement quand vous le partagez',

   // Informations Collectées › Activité
                 'Mentions et réactions',
+                'Vos cercles : le niveau que vous accordez à chaque personne et vos demandes',
+                "Le nombre et la nature de vos échanges avec chaque personne, par jour, jamais leur contenu",

+  {
+    title: 'Vos Cercles',
+    blocks: [{ kind: 'paragraphes', body: [
+      "Chaque lien a un niveau : Public, Communauté, Connaissance, Ami, Proche, Sang. Chacun accorde le sien, et c'est le plus bas des deux qui compte.",
+      "Pour proposer et ouvrir les cercles, Meeshy compte chaque jour, pour chaque paire, combien de fois et de quelle façon vous avez échangé (message, réaction, vue, audio…), sans jamais lire le contenu, y compris en chiffré de bout en bout. Base : notre intérêt légitime. Durée : 120 jours. Vous pouvez refuser la Connaissance automatique dans Réglages › Confidentialité ; elle est désactivée par défaut si vous avez moins de 18 ans.",
+      "Une baisse de niveau, une sortie ou un refus ne sont jamais notifiés à l'autre.",
+    ] }],
+  },
+  {
+    title: 'Partages en Direct',
+    blocks: [{ kind: 'cartes', cards: [
+      { title: 'Écoute', body: "Proches : la catégorie (musique, vidéo, navigation). Sangs : le titre et l'application. Seulement à qui vous l'accordez, retirable à tout moment. Seul l'état du moment est transmis ; rien n'est gardé plus de 15 minutes. Base : votre consentement." },
+      { title: 'Talkie', body: "Entre Proches. La voix est relayée sans être stockée par nos serveurs ; une copie reste en message vocal [30 jours]. Ce n'est pas chiffré de bout en bout, et c'est indisponible dans une conversation chiffrée. Base : le service que vous demandez." },
+      { title: 'Bring', body: "Fait sonner le téléphone d'un ami, même en silencieux et en Ne pas déranger, dans un quota par jour. Vous pouvez le bloquer pour une personne ou pour tous. Meeshy n'est pas un service d'urgence : en cas de danger, appelez le 112." },
+      { title: 'Position', body: "Pour 1 h ou 8 h à des Amis choisis, à la précision que vous choisissez pour chacun ; rien n'est gardé après. Entre Sangs, si vous l'activez : en continu, avec un historique de 30 jours, une alerte de proximité et des arrivées et départs de lieux que vous choisissez. Vous voyez qui a consulté votre position. Base : votre consentement, retirable à tout moment." },
+    ] }],
+  },

   // Âge et Mineurs
+            "Votre âge déclaré sert aussi aux cercles : pas de Connaissance automatique entre un mineur et un adulte, et [règle J1 pour les partages de moins de 15 ans].",

   // Partage de Vos Données
+            "Les personnes à qui vous accordez un partage (écoute, position) le reçoivent ; personne d'autre, ni nos équipes.",

   // Nos Sous-traitants › Notifications
+            "Apple et Google acheminent aussi les notifications de talkie, de Bring et de position (sans coordonnées ni audio).",

   // Vos Droits
-            'Exporter vos données dans un format standard',
+            'Exporter vos données dans un format standard, cercles, compteurs et consentements compris',

   // Notifications
-            "… sans notifications (sauf alertes de sécurité critiques).",
+            "… sans notifications. Un Bring, que vous pouvez bloquer, passe outre.",

+  {
+    title: 'Bases Légales',
+    blocks: [{ kind: 'list', items: [
+      "Exécution du service (art. 6(1)(b) RGPD) : compte, messagerie, traduction, talkie, Bring, cercles choisis.",
+      "Consentement (art. 6(1)(a), et art. 9(2)(a) quand un partage peut révéler une donnée sensible) : écoute, position, fonctionnalités vocales.",
+      "Intérêt légitime (art. 6(1)(f)) : comptage des échanges par paire, sécurité, prévention des abus.",
+      "Obligation légale (art. 6(1)(c)) : [à compléter par le juriste].",
+    ] }],
+  },
```

Le même changement va dans les CGU (`apps/web/src/institutional/terms.ts`) : la clause « pas un service d'urgence » (E12) et l'interdiction d'utiliser le talkie et le Bring pour harceler, avec le signalement.

---

## 9. Registre des traitements (art. 30) : fiches des cercles

L'exemption de l'art. 30(5) (moins de 250 salariés) ne joue pas : ces traitements sont réguliers et certains portent sur des données de l'art. 9. Fiches à reporter dans le registre du responsable (#14411), qui doit aussi porter son identité, celle du DPO s'il y en a un, et les autres traitements de Meeshy.

| Fiche | Finalité | Catégories de personnes | Catégories de données | Destinataires | Transferts hors UE | Durée | Mesures (art. 32) |
|---|---|---|---|---|---|---|---|
| R1. Cercles et comptage | Graduer la visibilité ; Connaissance automatique | Utilisateurs | Liens, niveaux, passages ; compteurs par paire et jour | Les deux membres | Non | Lien : sa vie ; compteurs : 120 j | Aucun contenu ; TTL ; loi d'accès unique |
| R2. Consentements de cercle | Démontrer et appliquer | Utilisateurs | Partages, retraits, blocages Bring et talkie | Responsable | Non | Vie du lien ; preuve : J9 | Purge des deux côtés ; export |
| R3. Écoute | Partage en direct | Utilisateurs émetteurs | Catégorie, titre, application | Proches et Sangs consentants | Non | 900 s | Scellement, troncature serveur |
| R4. Talkie | Communication vocale en direct | Utilisateurs | Voix, paire, heure | La personne visée | Apple, Google (acheminement, sans audio) | Fragments : aucun ; copie : #14465 | Refus en E2EE ; bornes de débit |
| R5. Bring | Alerte sonore | Utilisateurs | Paire, heure, quota | La personne visée | Apple, Google | Redis ; trace 30 j (#14420) | Quota ; blocage ; interrupteur global |
| R6. Position | Partage temporaire ; Sang continu (flag) | Utilisateurs, mineurs compris | Coordonnées ; historique ; consultations ; lieux | Amis et Sangs consentants | Apple, Google (sans coordonnées) | ≤ 8 h ; 30 j pour l'historique | Scellement ; précision par destinataire ; flag |
| R7. Ensemble | Lecture synchronisée | Utilisateurs | Paire, média, position de lecture | La paire | Non | 4 h | Scellement ; HMAC des index |

---

## 10. Stores

Inchangé depuis le 2 novembre sauf ce qui est marqué **(nouveau)**. Les numéros de guidelines sont à reconfirmer sur la version en vigueur avant la soumission : le texte intégral n'a pas pu être relu ici (hôte hors liste autorisée).

### 10.1 App Store
- **Localisation « Toujours » (Sang continu)** : `NSLocationAlwaysAndWhenInUseUsageDescription` exacte et localisée, mode `location` dans `UIBackgroundModes`, ajoutés **seulement** par le lot `sang-position-historique`. Guideline 5.1.5 : la position seulement quand elle sert directement la feature ; 5.1.1 : l'app fonctionne si on la refuse ; 2.5.4 : le mode d'arrière-plan sert à sa seule fin. Préparer un compte de démonstration Sang et une vidéo pour la revue. **(nouveau)** Corriger dès maintenant le texte « When In Use », qui promet « find nearby friends » (N8).
- **Critical Alerts (Bring)** : entitlement `com.apple.developer.usernotifications.critical-alerts`, sur demande (#14112). Apple l'accorde pour la santé, la sécurité publique et la sécurité du domicile : **forte probabilité de refus** pour une messagerie sociale. Même accordé, il faut l'autorisation `.criticalAlert` de l'utilisateur. En attendant, `time-sensitive` ne passe **pas** le mode silencieux, et l'interface doit le dire. Ne jamais détourner PushKit VoIP pour sonner un Bring.
- **PushToTalk (talkie)** : capacité « Push to Talk », mode d'arrière-plan correspondant, `NSMicrophoneUsageDescription` (présente). On ne rejoint un canal qu'au premier plan, par un geste ; un seul canal actif ; jeton éphémère ; pushs `pushtotalk` vers `<bundle>.voip-ptt`. Le chemin sans PushToTalk (son de notification écrit par la NSE dans `Library/Sounds`) peut être jugé contraire à l'usage des notifications (2.5.4, 4.5.4) : le décrire dans les notes de revue, avec le message vocal pour repli.
- **Étiquettes App Privacy** : position précise liée à l'utilisateur ; données d'usage (écoute) ; enregistrements audio (copie du talkie). Questionnaire d'âge : partage de position et voix en direct.
- **Contenu généré** (1.2) : signaler et bloquer s'appliquent au talkie et au Bring (#14110). **Suppression de compte** (5.1.1(v)) : emporte les cercles (fait, E1). **Export du chiffrement** : rien ne change.

### 10.2 Google Play
- **`ACCESS_BACKGROUND_LOCATION`** : admis seulement pour la fonction principale, avec une **divulgation visible dans l'app** (le mot « position », la collecte en arrière-plan, les features concernées), un **formulaire qui ne décrit qu'une seule feature** et une **vidéo** de 30 s. Ne pas déclarer la proximité, que Google classe parmi les usages « premier plan seulement ». Déclarer le partage continu avec ses Sangs, lancé par l'utilisateur.
- **Option recommandée** : un service au premier plan de type `location`, lancé par l'utilisateur, avec notification persistante, qui évite `ACCESS_BACKGROUND_LOCATION`. Il exige `FOREGROUND_SERVICE_LOCATION` et la déclaration de type de service dans la Play Console (description, vidéo). C'est aussi le signe visible qu'attend l'AADC.
- **`NotificationListenerService` (écoute sur Android, #16836) (nouveau détail)** : `MediaSessionManager.getActiveSessions` exige que l'utilisateur accorde l'accès aux notifications dans les réglages du système. C'est un accès à **toutes** les notifications de l'appareil. La politique « User Data » de Google exige une divulgation visible et un consentement explicite avant une collecte inattendue, et la revue peut demander pourquoi l'app a besoin de cet accès. Le service ne doit lire **que** les sessions média, ne rien transmettre d'autre, et le dire. Si la revue le refuse, l'écoute Android se limite à ce que Meeshy joue lui-même, et l'interface le dit.
- **Bring** : canal `USAGE_ALARM` ; `USE_FULL_SCREEN_INTENT` est tenu au titre des appels, l'utiliser pour le Bring sort du cas déclaré (#16619 : « sa sonnerie tient la politique Play »).
- **Talkie** : services au premier plan `mediaPlayback` et `microphone` déclarés ; mettre à jour la déclaration des types.
- **Data safety** : position précise et approximative, enregistrements vocaux, activité dans l'app (écoute), et leur partage avec d'autres utilisateurs.

---

## 11. Ce qui exige un juriste humain, et pourquoi

| # | Question | Pourquoi un avis signé |
|---|---|---|
| J1 | Un mineur de 13 ou 14 ans (en France ; jusqu'à 15 ans ailleurs) peut-il activer seul la position, son historique, les lieux et le titre d'écoute ? Faut-il le consentement parental (art. 8 RGPD, art. 45 LIL) ou une autre base ? Quel seuil par pays ? | Licéité. La décision #13948 et la règle des 15 ans déjà appliquée (`eventPrivacy.ts`) se contredisent |
| J2 | Le titre d'écoute, l'historique de position et les lieux relèvent-ils de l'art. 9 ? Le rituel vaut-il consentement **explicite** ? | Qualification ; jurisprudence C-184/20 et C-252/21 |
| J3 | L'art. 28 DSA s'applique-t-il (exemption de l'art. 19) ? L'AADC s'applique-t-il ? Si oui, la position continue d'un mineur et le Bring reçu la nuit sont-ils compatibles ? | Champ d'application ; statut de l'entreprise |
| J4 | Le risque résiduel de la position Sang des mineurs reste-t-il élevé ? Faut-il consulter la CNIL (art. 36) ? | Engagement envers une autorité |
| J5 | La Connaissance automatique, qui ouvre le message direct sans demande, affecte-t-elle un mineur « de manière similairement significative » (art. 22) ? | Qualification |
| J6 | La directive 2002/58 (art. 5(3) et art. 9) s'applique-t-elle à la position GPS relayée par une messagerie OTT ? | Champ d'application |
| J7 | Une baisse silencieuse faite par B peut-elle être refusée à A au titre de l'art. 15(4) ? | Mise en balance des droits de tiers |
| J8 | Responsabilité si un Bring ne sonne pas ; rédaction de la clause des CGU | Responsabilité civile ; clauses limitatives encadrées |
| J9 | Combien de temps garder la preuve d'un consentement retiré ? | Prescription ; charge de la preuve |
| J10 | Apple et Google reçoivent des métadonnées de talkie, de Bring et de position : les garanties du chapitre V citées par la politique les couvrent-elles ? | Contrat et transfert |
| J11 **(nouveau)** | Le privilège d'équipe sur des comptes personnels : quelle base légale pour élargir l'audience d'un membre de l'équipe ? Un consentement entre collègues (position, écoute) est-il libre ? Le droit du travail (L. 1121-1, L. 1222-4, information du CSE s'il existe) s'applique-t-il à des modérateurs bénévoles ? | Relation de travail ; qualification du statut des modérateurs |
| J12 **(nouveau)** | Les lieux nommés entre Sangs (maison, école) pour un mineur : compatibles avec l'art. 25 et l'AADC, ou à exclure ? | Protection des mineurs ; proportionnalité |
| J13 **(nouveau)** | L'affichage à un tiers du titre lu dans Apple Music ou Spotify est-il permis par leurs conditions développeur ? | Contrat avec un tiers |
| J14 **(2026-11-22)** | Un accord unique à la liste du Sang (position continue, historique, proximité, titre d'écoute, batterie, état du téléphone, chute, talkie, Bring, Ensemble) est-il un consentement libre et spécifique, alors que la position continue n'existe qu'au Sang ? Le Sang peut-il se présenter comme un service (art. 6(1)(b)) dont la transparence est l'objet ? Le titre d'écoute (art. 9 par inférence, J2) peut-il être consenti dans cette liste ? | Art. 7(4), considérant 43 ; CEPD 05/2020 §§ 25-44 ; CEPD 2/2019 sur l'art. 6(1)(b) |
| J15 **(2026-11-22)** | Sans fantôme entre Sangs, le risque de contrôle coercitif reste-t-il élevé après les mesures du § 13.5 ? Faut-il consulter la CNIL (art. 36) avant d'allumer la position Sang ? | Engagement envers une autorité ; art. 25, 35, 36 |
| J16 **(2026-11-22)** | Un mineur déclaré peut-il consentir à la liste entière ? Faut-il l'exclure du verrou (mesure C7) ou du Sang avant 15 ans ? | Art. 8, considérant 38 ; AADC standard 10 ; prolonge J1 et J3 |
| J17 **(2026-11-22)** | Quelle base légale pour la catégorie d'écoute, la batterie et l'injoignabilité actives par défaut au Proche : l'exécution du service choisi (art. 6(1)(b)) avec opposition par personne, ou un consentement recueilli à l'entrée en Proche ? Pour les Proches d'avant le 2026-11-22, l'activation peut-elle suivre une simple information ? | Art. 6, 7, 25(2) ; considérant 32 |
| J18 **(2026-11-22)** | Entre collègues de l'équipe, sans lien ni rituel, le défaut actif du Sang et le verrou peuvent-ils jouer ? (Recommandation : non, condition C2.) | Prolonge J11 ; considérant 43 ; Code du travail L. 1121-1 |

Je ne rédige ni la demande Critical Alerts, ni le formulaire Play, ni une notification à la CNIL : ce sont des engagements envers un tiers. #14112 porte le brouillon des entitlements ; c'est au porteur de l'envoyer.

**Licences.** Aucune de ces features n'introduit de publicité, d'offre payante ni de revente de données : l'usage de NLLB-200 et de MMS-TTS (CC-BY-NC 4.0) reste non commercial (#9227). La copie vocale du talkie passe par le pipeline existant sans en changer la nature. **Vigilance** : si Critical Alerts, PushToTalk, le Sang ou le privilège d'équipe devenaient une offre « premium » ou un service vendu à une organisation, ce serait une monétisation, que le remplacement des modèles doit précéder.

---

## 12. Actions avant la production

**Avant toute promotion du jalon 1** (code, sans juriste) :
1. E7 (#14405), E4 (#14402), E6 (#14404).
2. Politique (§ 8) relue puis publiée et notifiée ; CGU (E12) ; registre (§ 9).
3. N1 : décider la mesure 1 du § 3.9 (comptes de test) **avant** de fusionner `claude/cercles-16623-serveur` vers la production ; #16814.

**Avant le jalon 2 en production** :
4. J1, J2, J3 rendus, puis E5 selon l'avis.
5. Talkie : durée de la copie (#14465) et silence de nuit (#14482).
6. Bring : E12, trace de 30 j (#14420), mineurs la nuit (#14421), N2.
7. Charges APNs, FCM et Live Activity sans audio ni coordonnées ; aucun titre ni coordonnée dans les journaux ; une garde de test par lot.
8. Stores (§ 10) : entitlements, notes de revue, vidéos, déclarations Play, étiquettes, questionnaire d'âge ; N7 et N8.

**Avant d'allumer le flag de position Sang** :
9. AIPD validée par un juriste (J4), consultation préalable si nécessaire.
10. Rappel de consentement périodique, signe visible, retrait d'un geste depuis la notification persistante, journal servi **avant** toute lecture d'historique ; N3 et J12 pour les lieux.

---

## 13. Révision du 2026-11-22 : de Sang à Sang rien ne se cache, sauf descendre (#20359, #20364)

Rédigé le 2026-11-22 par l'agent `conformite-juridique`. Base lue : la branche `claude/paliers-actifs-sang-verrouille`, en cours d'écriture (`packages/shared/utils/relation-levels.ts`, `relation-emitter-consent.ts`, `blood-bundle.ts`), et `services/gateway/src/routes/relations/lower.ts`. Décision : `services/gateway/decisions/2026-11-22-de-sang-a-sang-rien-ne-se-cache-sauf-descendre-20359.md`. **Ce n'est pas un avis juridique.**

### 13.1 Le traitement tel que la branche l'écrit

- **Défauts par palier** (`RELATION_LEVEL_DEFAULT_ON`). Colonne nulle = active si le niveau effectif atteint le palier : Proche pour la catégorie d'écoute, la batterie et l'injoignabilité ; Sang pour le titre d'écoute, la position continue, l'historique, la proximité, le relevé de batterie, l'inactivité, l'appel et la chute.
- **Verrou** (`RELATION_BLOOD_LOCKED_FEATURES`). Au niveau effectif Sang, équipe comprise, une fois l'accord donné : ni refus stocké, ni coupure globale, ni blocage de réception ne ferment. Une coupure répond 409.
- **Accord à la liste** (`BLOOD_BUNDLE_VERSION = '2026-11-22'`, quatorze features). Stocké par côté.
- **Décision B**. Avant l'accord, les refus déjà donnés restent appliqués.
- **Baisse** (`lower.ts`). Unilatérale ; le niveau effectif est le minimum des deux accords. Silencieuse (RG-07), immédiate, partages éteints des deux côtés (`withdrawSharesAfterDrop`). Elle passe par `appVersionFloorPreHandler`, mais le web n'est jamais jugé.

**Écart lu dans la branche.** `resolveEmitterConsent` rend `granted` pour une colonne nulle au Sang **avant** tout accord à la liste. La paire de l'équipe, une paire née d'un rituel ancien, ou un corps v1 dont le `false` n'est pas écrit partageraient donc leur position sans aucun acte. C'est l'objet de C1, C2 et C4.

### 13.2 Analyse par point

1. **Consentement donné au palier, retiré par la baisse (art. 7(1) à 7(4)).**
   - *Pour.* Une seule action positive, informée, versionnée (art. 7(1) : la preuve existe). Le retrait est plus simple que l'octroi : le rituel demande deux personnes et plusieurs écrans, la baisse un geste (art. 7(3) ; CEPD 05/2020 §§ 113-114). Un choix réel existe : le Proche garde des réglages par personne.
   - *Contre.* La liste mêle des finalités distinctes : localisation continue et son historique, santé (chute), goûts culturels (titre), sécurité (inactivité, Bring). Le considérant 43 présume non libre un consentement qui ne permet pas de consentir séparément « lorsque cela est approprié ». La position continue n'existe qu'au Sang : la vouloir, c'est accepter le reste (CEPD 05/2020 §§ 42-44, granularité). Retirer un seul élément coûte tout le palier, donc un détriment (§§ 46-48).
   - *Verdict* : **avis signé requis (J14)**. Conforme sous les conditions C1, C3 à C5, C8, C11 et C12 pour la forme de l'accord et du retrait.

2. **Défauts actifs au Proche, « champs jamais réglés ».**
   - Pour un **nouveau** Proche, l'activation peut tenir si la liste est montrée AVANT l'acte qui fait le palier (la demande ou l'acceptation), et si l'acte est enregistré avec la version de la liste. La branche prévoit une information « une fois, sans bloquer » à l'entrée en Proche : si elle vient après l'acte, ce n'est ni un consentement ni une information préalable (art. 13(1)).
   - Pour un Proche **d'avant le 2026-11-22**, une colonne nulle voulait dire « refusé par défaut ». La lire « actif » sans acte de la personne, c'est déduire un accord du silence (art. 4(11), considérant 32 ; CJUE C-673/17, *Planet49*). Il faut que la liste soit montrée, avec le choix, avant l'activation. C'est la même logique que la décision B.
   - La catégorie d'écoute était classée consentement (§ 2.3). La batterie et l'injoignabilité sont peu sensibles et peuvent relever de l'exécution du service choisi, avec opposition par personne (art. 6(1)(b), 21). L'art. 25(2) pèse peu ici : le destinataire est une personne choisie, pas un nombre indéterminé.
   - *Verdict* : **conforme sous condition** pour les nouveaux Proches (liste avant l'acte, version stockée). **Avis signé requis (J17)** pour la base légale de la catégorie d'écoute et pour l'activation chez les Proches existants.

3. **Sang sans restriction.**
   - L'art. 7(3) est satisfait par la baisse, à condition qu'elle reste toujours possible (C8).
   - Entre collègues de l'équipe, il n'y a ni lien ni rituel, donc ni accord ni baisse. Le verrou y supprimerait tout retrait : **non conforme** en l'état. C2 le corrige.
   - Un retrait d'autorisation du système (position, Santé) reste toujours possible et ne doit être ni puni ni annoncé (C10, art. 7(4)).
   - *Verdict* : **conforme sous condition** (C2, C8, C10).

4. **Coupures globales qui n'épargnent plus les Sangs.**
   - Le fantôme global et ciblé était « indétectable ». C'était la mesure principale contre le contrôle coercitif (§ 3.8 (a)) : se cacher sans que l'autre le sache. La baisse est silencieuse, mais ses effets se voient (la position disparaît, le palier change).
   - La coupure globale du Bring ne protège plus d'un Sang qui sonne trente fois par jour, Ne pas déranger passé.
   - *Verdict* : **conforme sous condition** pour la transparence (C9 : « tous sauf tes Sangs » dit avant l'activation, et « Passer mes Sangs en Proche » au même endroit). **Avis signé requis (J15)** sur le risque résiduel et la consultation préalable : les mesures du § 13.5 deviennent des conditions d'allumage du flag de position.

5. **Chute (art. 9).**
   - L'accord global explicite reste (`fallAlertConsentedAt`, version courante), le refus sous 15 ans aussi (#18748, points 2 et 5). Seul le retrait par personne entre Sangs disparaît.
   - L'accord explicite doit nommer ses destinataires : « à tous tes Sangs, présents et à venir ». L'accord à la liste ne le remplace jamais.
   - *Verdict* : **conforme sous condition** (C6). L'avis signé déjà requis par #18748 reste requis.

6. **Mineurs (art. 8, considérant 38).**
   - Le consentement d'un mineur déclaré devient l'accord à la liste. Avant 15 ans en France, le consentement seul ne suffit pas pour un traitement fondé sur l'art. 6(1)(a) (art. 45 LIL ; J1 toujours ouvert). Entre 15 et 17 ans, l'accord groupé aggrave la question de la liberté : un mineur ne peut plus refuser seulement sa position.
   - L'AADC (standard 10) et les lignes directrices de la Commission sur l'art. 28 DSA demandent la position désactivée par défaut et un signe visible.
   - *Verdict* : **avis signé requis (J16, J1, J3)**. Mesure conservatoire C7 : pour un émetteur mineur déclaré, ni verrou ni défaut actif sur la position continue, l'historique, la proximité et le titre d'écoute. L'âge inconnu (E6, #14404) reste ouvert.

7. **Décision B (#20367).**
   - Elle ne présume aucun accord à partir d'un refus. C'est la seule option qui tient sans avis contraire. A efface des refus explicites : c'est un consentement présumé. C retire un lien que personne n'a demandé à retirer.
   - Conditions : C1 (les champs jamais réglés ne s'ouvrent pas pour les quatre consentements du rituel), C3 (le retrait par partage reste jusqu'à l'accord), C12 (carte neutre, sans échéance) ; l'accord d'un côté ne lève pas les refus de l'autre.
   - *Verdict* : **conforme sous condition**.

### 13.3 Conditions que le code respecte

C1 à C12 de la décision. En bref :
- **C1** : avant l'accord à la liste de la version courante, titre d'écoute, position continue, historique et proximité ne s'ouvrent que sur un `true` stocké.
- **C2** : entre collègues sans lien, ni défaut actif du Sang ni 409.
- **C3** : pas de 409 avant l'accord du côté qui coupe.
- **C4** : un `false` d'un corps v1 ne devient jamais un partage.
- **C5** : un accord ne vaut que pour sa version.
- **C6** : la chute garde son accord explicite, retirable par un 200, et le refus sous 15 ans.
- **C7** : un émetteur mineur déclaré retire sa position et son titre sans quitter le Sang.
- **C8** : la baisse est toujours possible (par le web au moins), immédiate, et efface l'accord des deux côtés.
- **C9** : « tous sauf tes Sangs » avant l'activation d'une coupure globale, et « Passer mes Sangs en Proche » au même endroit.
- **C10** : aucun refus d'autorisation du système n'est puni ni annoncé.
- **C11** : l'accord et sa version partent dans l'export, sont purgés avec le compte et effacés à la baisse.
- **C12** : la carte B est neutre, sans pré-sélection ni échéance.

### 13.4 Ce qui exige un avis signé

J14 à J18 (§ 11), plus J1, J2, J3 et J4, que cette révision aggrave. Aucune promotion en production de #20361 et #20362 sans ces avis. Je ne rédige pas de notification à la CNIL : c'est un engagement envers une autorité.

### 13.5 Mesures compensatoires recommandées

Elles deviennent des conditions d'allumage du flag de position Sang (§ 12, point 10) :
1. Rappel périodique à 30 jours : « X voit ta position depuis 30 jours. Garder Sang / Passer en Proche. »
2. Signe permanent côté observé, avec la baisse en un geste depuis la notification persistante.
3. Journal des consultations servi avant toute lecture d'historique.
4. « Passer mes Sangs en Proche » d'un geste.
5. Depuis un Bring ou un talkie reçu d'un Sang : « Arrêter » et « Passer X en Proche ».
6. Signalement d'un Sang depuis sa fiche (#14110), sans le prévenir.

**Licences.** Rien ici n'introduit de publicité, d'offre payante ni de revente de données : NLLB-200 et MMS-TTS restent dans un usage non commercial (#9227).

---

*Sources externes : Google Play Console Help, « Requesting access to location in the background » (9799150) et « Understanding foreground service and full-screen intent requirements » (13392821) ; Apple, documentation PushToTalk ; Apple Developer News, mise à jour des guidelines du 25 janvier 2024 ; lignes directrices de la Commission sur l'art. 28 DSA (14 juillet 2025) ; CEPD, lignes directrices 05/2020 sur le consentement et WP248 rév.01 ; ICO, Age Appropriate Design Code, standard 10. Consultées le 2026-11-02 pour la première analyse et non relues ici ; à reconfirmer avant toute soumission.*
