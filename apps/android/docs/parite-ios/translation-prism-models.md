# Parité iOS → Android : `translation-prism-models`

> Relevé du 2026-10-22 (directive #11570). Ce document est un JOURNAL d'analyse daté : l'état de chaque lot vit dans son issue GitHub, jamais ici.

**113 features iOS** : 44 absentes, 52 partielles, 7 divergentes, 10 complètes sur Android. **47 lots** planifiés (≈27240 lignes Kotlin estimées, estimation haute).

## Ce que fait iOS, et où en est Android

**translation-prism-models#1** (couverture Android estimée ≈ 35 %)

Cette partie couvre la couche modèles et règles pures du SDK iOS pour le Prisme Linguistique, les messages et les conversations : décodage tolérant des messages, pièces et notifications, mapping vers la bulle, citations (réponses) avec protection, éphémères, vue unique et loi de sortie, aperçu de liste (contrat #7545, facette atomique), état utilisateur de conversation avec mutations optimistes, notifications (types, textes de repli, présentation de ligne, filtrage), préférences et consentements, profils, répertoire, canvas v3 et composeur (objets de scène, commandes de timeline).
Android (core/model, sdk-core, sdk-ui) a déjà une base saine : socle Prisme textuel, ApiMessage/ApiConversation/ApiNotification, DeliveryStatusResolver, canvas v3 en lecture, filtres de conversation, préférences, statuts, frappe, RelativeTime.
L'écart est structurel : les modèles Android sont des projections minces (ApiMessage sans transfert, lieu, sticker, avis système ni chiffrement ; ApiConversation sans contrat d'aperçu, pont, réaction ni appel actif ; 10 types de notification et ~30 métadonnées manquants), le Prisme ne s'arrête pas au rang de la langue d'origine, et les lois pures partagées (MessageActionPolicy, ContentExitLaw, FirstUnreadBoundary, EphemeralDeadline, QuoteCascade, UserProfileRepaint) n'existent pas ou divergent.
Absents : cartes de contact vCard, carnet d'adresses, consentements, onboarding, stickers et packs, sons, avis de capture et d'arrivée, traduction sur appareil et traduction partagée scellée, pont ✦, carte de lien, événements viewing:*, user:updated, message:countdown-started, participant:rights-updated.
À corriger vite : le jeton FCM est enregistré sans identité d'appareil (ni deviceId, ni type fcm explicite), la préférence d'appels hors-contacts utilise l'alias legacy allowCallsFromNonContacts, et un direct peut s'élire le lecteur lui-même quand son id est inconnu.

**translation-prism-models#2** (couverture Android estimée ≈ 22 %)

Cette partie (96 fichiers, ~14,9k lignes) réunit les lois pures et services du Prisme Linguistique côté app et SDK iOS : résolution du texte et de la piste audio, hydratation des traductions, traduction à la demande, traduction SUR l'appareil (Apple Translation) avec partage d'une enveloppe scellée aux autres membres. Elle porte aussi le menu d'appui long, la loi de sortie de contenu (vue unique, flou, éphémère), la composition de filtres et les sections de liste (Lentille), la ligne d'aperçu de conversation structurée, le modèle d'envoi OutgoingMessage, l'export « Imagine » (MessageCard : 784 templates, mise en page, PNG/GIF/MP4), le format Lens, les modes de lecture Rivière/Focal et les utilitaires SDK (identifiants idempotents, dates du fil, vCard, ThumbHash, « Lire la suite », formateurs de temps). Android a les fondations du Prisme (LanguageResolver, MessageTranslationMerge, traduction texte à la demande, piste audio de bulle), un aperçu de ligne simplifié, MimeTypeResolver, ThumbHash et PushPresentationPolicy. Divergence critique à corriger d'abord : la résolution du texte n'applique pas la règle 3 du Prisme (l'original ne concourt pas à son rang) et ajoute un repli « fr ». Entièrement absents : traduction sur l'appareil et partage, loi de sortie et menu à deux niveaux, composition de filtres, aperçu structuré (appel, réaction, protections, compte à rebours), MessageCard, Lens, vCard, extrait de message long, modèle d'envoi typé (relation, sticker, lieu, E2EE), modes de lecture. Couverture estimée à ~22 % du périmètre, pondérée par l'effort.

## Notes transverses

1) FICHIERS CHAUDS ET ORDRE DE FUSION. Tout converge sur quelques fichiers déjà hors budget (1200 lignes) : ChatViewModel.kt (2248), ChatScreen.kt (2953), MessageBubble.kt (1202), ConversationListViewModel.kt (1046), plus BubbleContent.kt / BubbleContentBuilder.kt, Message.kt, ApiMessageDetail.kt, Conversation.kt, MessageRepository.kt, MessageSocketManager.kt, OutboxModel.kt, MessageEffects.kt, Preferences.kt, Notification.kt. Règle pour tous les lots : la logique vit dans un NOUVEAU collaborateur (contrôleur, builder, loi pure) et le fichier chaud ne reçoit qu'une ligne de délégation ; ne jamais faire grossir ChatViewModel/ChatScreen/MessageBubble. Les arêtes depends_on sérialisent les propriétaires de ces fichiers : Message.kt = prisme-descente-stricte-loi puis message-fil-decodage-complet-et-tolerant puis envoi-message-relation-typee-et-requete ; ApiMessageDetail.kt = piece-jointe-fil-complet-et-protection puis message-fil-decodage-complet-et-tolerant ; Conversation.kt = liste-conversations-fil-complet-et-contrat-apercu puis conversation-etat-utilisateur-unifie ; MessageEffects.kt = sortie-contenu-loi-et-offre (bit flamme-oeil) puis envoi-message-relation-typee-et-requete ; OutboxModel.kt = envoi-message-relation-typee-et-requete puis vue-unique-et-apres-lecture-scelle-et-consommation puis accuses-lecture-par-message-et-langue-lue ; MeeshyDatabase.kt = base-donnees-migrations-explicites UNIQUEMENT. Ajouts de listen(...) dans MessageSocketManager.kt (countdown-started, viewing:*, user:updated, translation-shared, participant:rights-updated) : additifs, conflits de fusion triviaux mais à résoudre dans l'ordre de livraison. VAGUES CONSEILLEES : A (indépendants, fichiers neufs) = base-donnees-migrations-explicites, prisme-descente-stricte-loi, langues-catalogue-complet-et-autonyme, push-enregistrement-appareil-identite, conversation-directe-interlocuteur-et-resolveur, piece-jointe-fil-complet-et-protection, idempotence-ids-et-dates-fil, traduction-partagee-enveloppe-scellee, notifications-types-et-metadonnees-completes, preferences-agregat-champs-canoniques, amis-demandes-action-canonique-et-relation, profil-edition-validation-et-compteurs, scene-objets-unifies, lens-format-lecture-sure, canvas-v3-pont-ecriture ; B (socle message/Prisme) = prisme-surfaces-descente-unique, message-fil-decodage-complet-et-tolerant, sortie-contenu-loi-et-offre, liste-conversations-fil-complet-et-contrat-apercu ; C (lois et envoi) = envoi-message-relation-typee-et-requete, actions-message-et-conversation-loi, ephemere-echeance-par-lecteur-et-reveil-unique, conversation-etat-utilisateur-unifie ; D = tout le reste selon depends_on.

2) BASE ROOM. DatabaseModule.kt utilise fallbackToDestructiveMigration() : un simple bump de version vide l'outbox (messages en file d'envoi, accusés, préférences hors ligne). Quatre lots ont besoin de tables (registre de réceptions éphémères, historique d'édition, répertoire, index média) : le lot base-donnees-migrations-explicites crée ces quatre tables en UNE migration 16 vers 17 testée, et reste le seul à toucher MeeshyDatabase.kt ; les autres lots consomment les DAO. Si le domaine offline/sync possède déjà ce chantier, dédupliquer. Les ajouts de champs de fil (messages, conversations, notifications) ne demandent AUCUNE migration : les lignes Room sont des JSON (MessageEntity.payload, ConversationEntity.payload) et MeeshyApi.json lit avec ignoreUnknownKeys + coerceInputValues + explicitNulls=false (encodeDefaults reste faux : un champ égal à son défaut n'est pas écrit, donc un type explicite comme fcm doit être passé hors défaut ou avec @EncodeDefault). Tout nouveau champ doit avoir une valeur par défaut pour relire les anciennes lignes.

3) LOCALES. Android n'a que quatre jeux (en par défaut, fr, es, pt) ; iOS et le Prisme en servent sept (ar, de, it manquent partout). Les gabarits qui miroitent un fichier TS partagé (avis de capture, d'arrivée, arrivées groupées) sont des tables Kotlin pures en 7 langues dans :core:model, sans ressources. Les autres lots ajoutent leurs chaînes en en/fr/es/pt ; le comblement ar/de/it de tous les strings.xml est un prérequis externe (ext:locales-ar-de-it) à traiter une fois, en fin de vague, pour éviter trois fichiers de plus par lot.

4) VECTEURS PARTAGES. packages/shared/fixtures contient déjà les vecteurs de : prisme (reading-modes/prism-translation, prism-preview), action-policy (message-actions, conversation-actions), conversation-preview-cases.json, long-message/excerpt, shared-translation/seal, reading-modes/{bridge, badge-guide, river-lanes, river-step, river-headers, sections, sort}, lens-v1, canvas-v3, capture-save. Chaque lot de loi pure les REJOUE en test JVM (modèle : PrismPreviewVectorParityTest, qui remonte l'arborescence pour trouver le fichier). Le lot prisme-descente-stricte-loi livre le helper de test SharedFixtures réutilisé par les autres. Boucle locale : ./apps/android/meeshy.sh jvm-check (Kotlin pur, :core:model, aucun import android.* ; javax.crypto est donc permis pour l'enveloppe scellée). Le seul gate reste la CI android.yml : la logique va dans :core:model, les écrans restent minces.

5) DECISIONS A NE PAS PERDRE. (a) Notifications : Android fait déjà confiance à la phrase d'action localisée par la passerelle (Prisme côté serveur) ; la table de repli par type n'est utilisée que si le titre serveur est vide. (b) Le Prisme descend STRICTEMENT les rangs 1 à 4 sans repli fr pour tout ce qui s'affiche ou se grave ; preferredContentLanguages (repli fr) ne sert que les défauts de composition. (c) Éphémère : l'échéance naît de la réception de chaque destinataire (#7451) ; la requête n'envoie que ephemeralDuration (+ bit), jamais un expiresAt local, et le client affiche la plus proche des deux horloges. (d) Presence : aucune donnée servie, aucun point ; ne jamais fabriquer. (e) E2EE : core:crypto est vide ; ces lots décodent les drapeaux de chiffrement, appliquent fail-closed (ServerTranslationAdmission, pas d'édition ni de transfert) mais n'implémentent pas le protocole. (f) Champ de préférence d'appel : le serveur ne lit plus allowCallsFromNonContacts (alias mort, défaut canonique acceptCallsFromNonContacts = true) : l'interrupteur Android actuel est sans effet, d'où la priorité P0 du lot de préférences.

6) RISQUES ET PERIMETRE. (i) Le StickerCatalog de feature:stories est un sélecteur d'emojis, pas un catalogue de gabarits de story : le rendu vectoriel d'un sticker de message repose d'abord sur la pièce PNG/animée toujours jointe ; le redessin par gabarit est un suivi. (ii) ML Kit (traduction et identification de langue sur appareil) exige les Play Services : prévoir le moteur indisponible (repli sur l'heuristique JVM et sur les traductions partagées). (iii) ScreenCaptureCallback est API 34+ ; en dessous, FLAG_SECURE seul. (iv) Les lots Imager, Lens, Son, Scène/Timeline et canvas v3 écriture sont P1/P2 et dépendent de chantiers de composeur (ext:story-reel-composer) hors de ce domaine pour leur UI finale ; ils livrent d'abord les lois pures. (v) Chevauchements possibles avec d'autres domaines à dédupliquer à la planification : corps-requetes-sdk-alignes-ios (feed/stories), rendus de bulle vidéo, scène d'appel de groupe, modes de lecture Focal/Script/Rivière. (vi) Les écrans communauté n'existent pas dans feature:* : le lot communautés ne livre que les modèles et la matrice de permissions. (vii) Les chemins de android_files_touched qui n'existent pas encore dans l'arbre sont des fichiers à CREER (convention : core/model/.../sdk/model et sdk/lang pour les lois, sdk-core/.../sdk/<pkg> pour dépôts et services, feature/<x>/.../me/meeshy/app/<x> pour écrans et ViewModels, sdk-ui/.../ui/component/<x> pour composants).

7) COUVERTURE. Fonctionnalités déjà complètes côté Android et donc sans lot : mention et contact partagé, lieu partagé et position en direct, filtres/sections/étiquettes de conversation (base), canvas v3 en lecture, analyse d'agent, temps relatif (classification), statut humeur, présentation de notification au premier plan (PushPresentationPolicy), MimeTypeResolver, ThumbHash. Reste partiel hors lot : les écrans de modes de lecture (ext:reading-modes), le composeur de timeline (ext:story-reel-composer).

## Lots

La colonne « piste » renvoie au plan d'exécution (`README.md`). Les dépendances sont résolues : fusions redirigées, prérequis transverses et fichiers chauds compris.

| clé | piste | P | effort | ≈ lignes | dépend de | résultat |
|---|---|---|---|---|---|---|
| `accuses-lecture-par-message-et-langue-lue` | C | P0 | M | 420 | prisme-descente-stricte-loi, envoi-message-relation-typee-et-requete, persist-outbox-registre-senders, persist-messages-repository-decoupage, chat-viewmodel-state-split | Un accusé de lecture ne promeut que le message qu'il nomme, et déclare la langue réellement lue |
| `actions-message-et-conversation-loi` | C | P0 | L | 1200 | message-fil-decodage-complet-et-tolerant, sortie-contenu-loi-et-offre | Les actions permises sur un message ou une conversation suivent la même loi que sur iOS et le web |
| `avis-systeme-capture-arrivee` | C | P0 | M | 850 | message-fil-decodage-complet-et-tolerant, sortie-contenu-loi-et-offre, chat-viewmodel-state-split | « Alice a capturé l'éphémère du 07/10 à 14:05 » et « Aïcha, Tom et 12 autres viennent d'arriver » se lisent dans ma langue et mon fuseau |
| `bouclier-capture-ecran-android` | C | P0 | M | 600 | sortie-contenu-loi-et-offre, avis-systeme-capture-arrivee, socle-points-d-extension-de-l-app, socket-routage-evenements-ordre-arrivee, composer-glass-shell, chat-viewmodel-state-split, chat-bulle-decoupage-composants | Une vue unique reste noire en capture d'écran, et la capture d'un éphémère est annoncée à la conversation |
| `bulle-identite-expediteur-et-source` | C | P0 | M | 600 | message-fil-decodage-complet-et-tolerant, chat-bulle-decoupage-composants | Chaque bulle dit qui parle : fantôme pour un invité sans compte, source système ou agent reconnue |
| `citation-reponse-loi-pure` | C | P0 | L | 1000 | prisme-descente-stricte-loi, message-fil-decodage-complet-et-tolerant, piece-jointe-fil-complet-et-protection, sortie-contenu-loi-et-offre, ephemere-echeance-par-lecteur-et-reveil-unique | Répondre à un message montre une citation fidèle : texte au prisme, média, protection et pièce visée |
| `conversation-apercu-compositeur-loi` | C | P0 | L | 1100 | prisme-descente-stricte-loi, liste-conversations-fil-complet-et-contrat-apercu, conversation-derniere-ligne-facette-atomique, ephemere-echeance-par-lecteur-et-reveil-unique | La ligne d'aperçu dit un appel, une frappe, un brouillon, une réaction ou le dernier message avec les bons mots, sans jamais révéler un message protégé |
| `conversation-derniere-ligne-facette-atomique` | C | P0 | M | 650 | liste-conversations-fil-complet-et-contrat-apercu, liste-decoupage-viewmodel | La ligne de liste décrit UN seul message : auteur, aperçu, icône et état cohérents, sans mélange de deux messages |
| `conversation-directe-interlocuteur-et-resolveur` | C | P0 | S | 380 |  | Une conversation directe montre toujours l'autre personne, et répondre à une story ouvre la bonne discussion |
| `conversation-etat-utilisateur-unifie` | C | P0 | M | 700 | liste-conversations-fil-complet-et-contrat-apercu, persist-outbox-registre-senders | Épingler, couper le son, archiver, verrouiller ou lire une conversation se fait en un geste, instantanément, et se rejoue hors ligne |
| `conversation-modele-ligne-et-effectif-plafonne` | C | P0 | M | 650 | liste-conversations-fil-complet-et-contrat-apercu, conversation-etat-utilisateur-unifie, liste-decoupage-viewmodel | Une ligne de conversation a son nom, sa fraîcheur et son effectif au bon format, et ne se redessine que si son rendu change |
| `envoi-message-relation-typee-et-requete` | C | P0 | M | 850 | message-fil-decodage-complet-et-tolerant, sortie-contenu-loi-et-offre, idempotence-ids-et-dates-fil, persist-outbox-registre-senders, persist-messages-repository-decoupage, chat-viewmodel-state-split | Un envoi transporte réponse, lieu, sticker et pièces transférées sans doublon, et dit pourquoi il échoue |
| `ephemere-echeance-par-lecteur-et-reveil-unique` | C | P0 | M | 800 | persist-room-migrations, message-fil-decodage-complet-et-tolerant, sortie-contenu-loi-et-offre, persist-messages-schema-colonnes-locales, persist-messages-evenements-precoces-tombstones, socket-routage-evenements-ordre-arrivee, chat-viewmodel-state-split, socle-pipeline-push-et-cycle-de-vie | Un message éphémère décompte depuis ma réception et disparaît à la seconde exacte, avec un seul réveil |
| `idempotence-ids-et-dates-fil` | C | P0 | S | 260 |  | Chaque écriture a une clé d'idempotence valide et un id local ne part jamais vers le serveur |
| `langues-catalogue-complet-et-autonyme` | F0 | P0 | S | 180 |  | Chaque liste de langues se lit pareil : 83 langues, noms écrits dans leur propre graphie |
| `liste-conversations-fil-complet-et-contrat-apercu` | F0 | P0 | L | 1000 | message-fil-decodage-complet-et-tolerant, socket-routage-evenements-ordre-arrivee | La liste de conversations décode tout ce que la passerelle sert, sans jamais jeter une ligne |
| `message-fil-decodage-complet-et-tolerant` | F0 | P0 | M | 800 | prisme-descente-stricte-loi, piece-jointe-fil-complet-et-protection | Chaque message du serveur s'affiche complet, même quand un champ est malformé ou récent |
| `notifications-types-et-metadonnees-completes` | C | P0 | M | 600 | contrat-reseau-notifications-et-jeton | Chaque type de notification est reconnu, décodé et coloré, y compris contacts, jeux et signalements |
| `piece-jointe-fil-complet-et-protection` | F0 | P0 | M | 700 |  | Une pièce jointe garde toutes ses propriétés, ses protections et un aperçu léger |
| `preferences-agregat-champs-canoniques` | C | P0 | S | 250 |  | Mes préférences d'appel, d'activité et de consentement se synchronisent avec les bons champs du serveur |
| `premier-non-lu-loi-et-vus-accumules` | C | P0 | M | 700 | conversation-etat-utilisateur-unifie, message-fil-decodage-complet-et-tolerant, persist-messages-repository-decoupage, composer-glass-shell, chat-viewmodel-state-split | Le fil s'ouvre sur « Nouveaux messages » au bon endroit, et la lecture est comptée après une présence continue |
| `prisme-descente-stricte-loi` | F0 | P0 | M | 450 |  | Un message reste dans sa langue d'origine dès que celle-ci est l'un de mes rangs du prisme |
| `prisme-surfaces-descente-unique` | C | P0 | S | 350 | prisme-descente-stricte-loi, chat-viewmodel-state-split, story-viewer-decomposition-and-nav-graph | Bulle, fil, commentaires, stories et réels servent la même langue que décide le Prisme |
| `sortie-contenu-loi-et-offre` | C | P0 | M | 800 | piece-jointe-fil-complet-et-protection, message-fil-decodage-complet-et-tolerant, composer-glass-shell, chat-viewmodel-state-split | Un message éphémère, flouté ou à vue unique ne sort pas de Meeshy : copie, transfert, partage et enregistrement suivent sa nature |
| `communautes-roles-permissions-et-comptage` | C | P1 | S | 300 | liste-conversations-fil-complet-et-contrat-apercu | Une communauté expose ses rôles, ses permissions et son lien de partage canonique |
| `consentements-par-finalite` | C | P1 | M | 600 | preferences-agregat-champs-canoniques, settings-hub-iso-layout | Je consens, finalité par finalité, à l'analyse et à la voix, et chaque octroi pose aussi ses parents |
| `conversation-couleur-accent-personnelle` | C | P1 | S | 300 | conversation-etat-utilisateur-unifie, reglages-conversation-actions-et-ecriture-restreinte | La conversation prend ma couleur d'accent personnelle, déclinée à plus ou moins 30 degrés, dans la liste et le fil |
| `conversation-pont-ce-que-tu-as-manque` | C | P1 | M | 450 | liste-conversations-fil-complet-et-contrat-apercu, prisme-descente-stricte-loi, composer-glass-shell, chat-viewmodel-state-split | « Ce que tu as manqué » : le pont résume mes non-lus dans ma langue |
| `corps-requetes-sdk-alignes-ios` | C | P1 | S | 280 |  | Les corps de requêtes (publication, commentaire, transcription, statut de pièce) sont identiques à ceux d'iOS |
| `ephemere-choix-flamme-oeil-et-intention` | C | P1 | S | 380 | ephemere-echeance-par-lecteur-et-reveil-unique, envoi-message-relation-typee-et-requete, composer-glass-shell, chat-viewmodel-state-split | Je choisis flamme-œil ou une durée, et mon choix suit chaque message d'un envoi multiple |
| `fil-phase-de-chargement-et-erreurs-de-contenu` | C | P1 | S | 300 | composer-glass-shell, chat-viewmodel-state-split | Un spinner bloquant seulement à froid, et une erreur qui dit la vraie cause |
| `preferences-service-cache-first-et-reorganisation` | C | P1 | M | 500 | preferences-agregat-champs-canoniques | Mes préférences, catégories et réglages par conversation s'affichent instantanément et se synchronisent |
| `prisme-piste-audio-posts-commentaires-reels` | C | P1 | M | 450 | prisme-surfaces-descente-unique | Un vocal de post, de commentaire ou de réel se joue dans la piste traduite de ma langue |
| `reglages-conversation-actions-et-ecriture-restreinte` | C | P1 | M | 450 | actions-message-et-conversation-loi, liste-conversations-fil-complet-et-contrat-apercu, composer-glass-shell | Les réglages d'une conversation n'offrent que ce que mon rôle permet, et un fil en lecture seule me dit pourquoi |
| `traduction-a-la-demande-texte-et-vocal` | C | P1 | M | 600 | persist-messages-traductions-persistees, traduction-appareil-lois-et-admission, prisme-surfaces-descente-unique, persist-messages-repository-decoupage, chat-viewmodel-state-split | Je traduis un message ou un vocal à la demande, et le chargement survit à la fermeture de la feuille |
| `traduction-appareil-coordinateur-fil` | C | P1 | L | 1000 | traduction-appareil-moteur-et-detection-mlkit, traduction-partagee-service-et-socket, persist-messages-traductions-persistees, chat-viewmodel-state-split | Mon appareil traduit les messages récents vers ma langue, les montre aussitôt, puis les partage aux autres |
| `traduction-appareil-lois-et-admission` | C | P1 | M | 450 | prisme-descente-stricte-loi, message-fil-decodage-complet-et-tolerant | Ce que le serveur ne lit pas se traduit sur l'appareil seulement, sans jamais être écrit ni partagé |
| `traduction-appareil-moteur-et-detection-mlkit` | C | P1 | M | 650 | traduction-appareil-lois-et-admission, dependances-gradle-scene-medias, chat-viewmodel-state-split | Mon téléphone traduit hors ligne et reconnaît la langue que j'écris, avec un téléchargement de modèle demandé une seule fois |
| `traduction-partagee-enveloppe-scellee` | C | P1 | M | 700 |  | Ma traduction calculée sur l'appareil est scellée pour les autres membres sans que le serveur l'ouvre |
| `traduction-partagee-service-et-socket` | C | P1 | M | 450 | traduction-partagee-enveloppe-scellee, idempotence-ids-et-dates-fil, socket-routage-evenements-ordre-arrivee | Les traductions partagées par les autres membres arrivent, et la mienne leur est partagée |
| `canvas-v3-pont-ecriture` | C | P2 | M | 900 |  | Ce que je publie reste lisible partout : conversion des effets de story vers le canvas v3 sans perte |
| `conversation-recherche-resultats-serveur` | C | P2 | S | 300 | persist-messages-repository-decoupage, chat-viewmodel-state-split | La recherche dans une conversation dit pourquoi un résultat correspond : contenu ou traduction |
| `ephemere-combustion-et-mouvement-reduit` | C | P2 | S | 320 | ephemere-echeance-par-lecteur-et-reveil-unique | La destruction d'un éphémère se voit, et se simplifie quand je réduis les animations |
| `imager-sujet-protection-et-citation` | C | P2 | M | 520 | sortie-contenu-loi-et-offre, prisme-surfaces-descente-unique, citation-reponse-loi-pure | Une carte d'export ne montre que ce qu'un message a le droit de montrer, dans la langue lue |
| `lecture-plages-ecoute-visionnage` | C | P2 | S | 400 | piece-jointe-fil-complet-et-protection | Mes écoutes et visionnages sont mesurés par plages continues, avec la raison de leur fin |
| `lens-format-lecture-sure` | C | P2 | M | 800 |  | Un document MeeshyLens (filtre, cadre, stickers, particules) se lit sans jamais exécuter de code |
| `position-partagee-precision` | C | P2 | S | 250 |  | Je choisis à quel grain ma position est transmise : exacte, 100 m, 1 km ou 10 km |

### Lots fusionnés ou retirés par l'architecture

- `base-donnees-migrations-explicites` → `persist-room-migrations` (merge-into) : Même remplacement de fallbackToDestructiveMigration + export de schéma ; les quatre tables (ephemeral_receipts, edit_revisions, directory_contacts, media_index) sont créées par leur premier lot consommateur avec sa propre Migration, selon le verrou de schéma Room.
- `onboarding-parcours-serveur` → `onboarding-etat-serveur-et-file` (merge-into) : Même parcours d'onboarding déclaré par le serveur. Hérite : consentements-par-finalite.
- `notifications-filtre-preferences-focus-et-dnd-local` → `socle-pipeline-push-et-cycle-de-vie` (merge-into) : Même porte locale préférences / heures calmes / Ne pas déranger. Hérite : preferences-agregat-champs-canoniques, notifications-types-et-metadonnees-completes.
- `push-enregistrement-appareil-identite` → `jeton-push-enregistre-des-la-connexion` (merge-into) : Même remplacement de l'ancien jeton.
- `notifications-ligne-textes-de-repli-et-actions-rapides` → `ligne-notification-riche` (merge-into) : Même ligne de notification riche.
- `notifications-langue-interface-service-fcm` → `langue-interface-systeme-android` (merge-into) : Même langue d'interface appliquée aux notifications.
- `formats-affichage-noms-drapeaux-durees-et-temps` → `formats-localises-et-types-de-fichier` (merge-into) : Mêmes formats localisés (durées, noms, dates relatives).
- `conversation-apercu-ligne-rendu-et-reveil` → `ligne-apercu-rendu` (merge-into) : Même rendu de la ligne d'aperçu ; ConversationRow n'a qu'un propriétaire.
- `menu-message-deux-niveaux` → `chat-longpress-overlay-and-quick-bar` (merge-into) : Même menu d'appui long à deux niveaux.
- `citation-reponse-bulle-saut-et-vocal` → `chat-citation-carte` (merge-into) : Même carte de citation.
- `citation-protection-contagion-et-cascade` → `chat-rich-quoted-reply-and-protections` (merge-into) : Même héritage de protection par la réponse. Hérite : ephemere-echeance-par-lecteur-et-reveil-unique, citation-reponse-loi-pure.
- `vue-unique-et-apres-lecture-scelle-et-consommation` → `vue-unique-consommee-par-chaque-lecteur` (merge-into) : Même sceau et consommation à la sortie ; le flamme-oeil rejoint ce lot. Hérite : message-fil-decodage-complet-et-tolerant, piece-jointe-fil-complet-et-protection.
- `presence-ici-viewers-et-frappe` → `presence-ici-dans-la-conversation` (drop-duplicate) : Même « qui regarde / qui écrit » sans fabriquer de présence.
- `repaint-pair-temps-reel` → `profil-repeint-user-updated` (merge-into) : Même repeinture user:updated ; citations et transferts y ajoutent leurs extensions.
- `amis-demandes-action-canonique-et-relation` → `amis-blocages-routes-canoniques` (merge-into) : Même action canonique de demande d'ami et relation.
- `carnet-adresses-modeles-et-synchro` → `carnet-adresses-synchronisation` (drop-duplicate) : Même synchronisation du carnet d'adresses. Hérite : consentements-par-finalite, persist-room-migrations.
- `carnet-adresses-ecrans-ecrire-inviter` → `annuaire-repertoire-telephone` (drop-duplicate) : Même onglet répertoire (écrire / inviter).
- `carte-contact-vcard` → `carte-visite-bulle` (drop-duplicate) : Même carte de visite dans la conversation. Hérite : message-fil-decodage-complet-et-tolerant, piece-jointe-fil-complet-et-protection.
- `participant-droits-et-fiche-membre` → `fiche-participant-droits-et-temps-reel` (drop-duplicate) : Même fiche membre (droits, historique). Hérite : actions-message-et-conversation-loi.
- `affiliation-filleuls-et-statistiques` → `parrainage-liens-affilies` (drop-duplicate) : Mêmes liens d'affiliation et filleuls.
- `profil-edition-validation-et-compteurs` → `profile-own-edit-save` (merge-into) : Même édition validée du profil.
- `traductions-et-transcriptions-fil-a-jour` → `persist-messages-traductions-persistees` (merge-into) : Mêmes traductions et transcriptions servies dès la réouverture. Hérite : prisme-descente-stricte-loi, message-fil-decodage-complet-et-tolerant.
- `conversation-carte-de-lien` → `carte-lien-donnees` (drop-duplicate) : Même carte de lien de conversation. Hérite : liste-conversations-fil-complet-et-contrat-apercu.
- `world-wide-et-invite-par-lien` → `pieces-jointes-invite-selon-le-lien` (merge-into) : Même règle « ce qu'un invité peut joindre ». Hérite : carte-lien-donnees.
- `conversation-liste-filtres-composes-et-sections` → `liste-filtres-composes` (merge-into) : Mêmes filtres composés. Hérite : conversation-etat-utilisateur-unifie.
- `lecture-modes-portee-protection-et-riviere` → `loi-modes-de-lecture` (merge-into) : Même loi du mode de lecture mémorisé par lecteur.
- `message-historique-des-modifications` → `chat-fiche-historique-modifications-et-sentiment` (drop-duplicate) : Même historique des modifications. Hérite : persist-room-migrations.
- `bulle-texte-long-liens-et-facade-video` → `chat-texte-long-lire-la-suite` (merge-into) : Même « Lire la suite » ; la façade de lien vidéo est portée par video-affiche-poster-et-facade-de-lien. Hérite : prisme-surfaces-descente-unique.
- `stickers-modeles-envoi-et-rendu` → `chat-sticker-gabarits-et-bulle` (merge-into) : Même sticker sans bulle, animé. Hérite : envoi-message-relation-typee-et-requete.
- `stickers-feuille-de-packs-composeur` → `sticker-conversation-sheet-and-send` (merge-into) : Même feuille de stickers du composeur.
- `fichiers-deposer-coller-clavier-riche` → `composer-paste-drop` (drop-duplicate) : Même dépôt / collage dans le composeur.
- `mediatheque-conversation-par-genre` → `chat-media-hub-screen` (drop-duplicate) : Même médiathèque par genre.
- `scene-objets-unifies` → `scene-objets-modele-plafonds-et-pile` (drop-duplicate) : Même modèle d'objets de scène unifiés.
- `scene-commandes-timeline-et-annulation` → `montage-lois-fenetre-aimant-plan-commandes` (merge-into) : Même pile de commandes annulables.
- `imager-moteur-mise-en-page-loi` → `chat-carte-message-loi-mise-en-page` (drop-duplicate) : Même moteur MessageCard (mise en page de la carte d'export). Hérite : imager-sujet-protection-et-citation.
- `imager-peintre-canvas-et-metadonnees-png` → `chat-carte-message-rendu-et-export` (drop-duplicate) : Même peintre de carte 1080 px.
- `imager-sorties-gif-mp4-son` → `imagine-motion-export-save-share` (drop-duplicate) : Mêmes sorties GIF / MP4 avec son.
- `imager-gabarits-recherche-et-format` → `imagine-gallery` (merge-into) : Même galerie des 784 cartes avec recherche.
- `badge-guide-echelle-sept-paliers` → `game-badge-shelf` (merge-into) : Même échelle de badges à sept paliers.
- `sons-bibliotheque-stories-reels` → `sons-bibliotheque-selecteur-et-page` (drop-duplicate) : Même bibliothèque de sons.
- `stories-miniature-ma-story-et-banniere-ecartable` → `couverture-et-rendu-hors-ecran` (merge-into) : Même vignette réelle de la story.
- `appel-groupe-vignette-a-la-une` → `calls-group-stage-and-start` (merge-into) : Même mise à la une dans la grille d'appel de groupe.

## Features

### Un contenu qui disparaît ne sort pas de Meeshy : transfert, enregistrement et capture suivent sa nature

`tpm-content-exit-law` · Android : **absente** · P0 · effort M

ContentExitLaw.of(sujet) lit la nature de disparition sur le message ET chacune de ses pièces (la plus restrictive gagne) : ordinaire (tout permis, capture libre), flamme à durée (transfert permis avec durée ≤ source, rien d'autre, capture annoncée), flamme-œil après lecture (ni transfert ni sortie, capture annoncée).

Écarts :
- Porter ContentExitLaw (Nature, Subject, Piece, verdicts transfert/sortie/capture, durée max de la copie transférée) avec la table de ContentExitLawTests / vecteurs TS comme jeu de tests.
- Brancher les verdicts sur : menu d'actions (transférer, copier, enregistrer, partager, publier), partage ACTION_SEND sortant, citation (quotedCapture), visionneuses plein écran.
- Capture : verdict blocked ⇒ FLAG_SECURE (écran noir en capture et enregistrement) ; announced ⇒ avis de capture à la conversation (voir tpm-capture-notice), détecté via Activity.ScreenCaptureCallback (Android 14).
- CaptureShieldScope : portée du bouclier par pièce, fermé par défaut.

Rendu : Quand une action est refusée : entrée du menu absente (jamais grisée sans raison) ; écran noir en capture pour la vue unique.

Transposition Android : FLAG_SECURE, ScreenCaptureCallback (API 34+), intents ACTION_SEND filtrés par verdict.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContentExitLaw.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CaptureShieldScope.swift`

</details>

### La ligne d'aperçu dit un appel, un événement, des pièces ou une réaction avec ses propres mots, sans jamais révéler un message protégé

`tpm-conv-preview-contract` · Android : **absente** · P0 · effort L

Contrat #7545 (conversation-preview.ts) porté à l'identique par GET /conversations et par conversation:updated (clés plates lastMessage*, lastReaction, activeCall) : un dernier message protégé arrive SANS texte, traduction ni pièce (seulement ses drapeaux).

Écarts :
- Modèles du contrat : PreviewParam, LastMessageAttachmentSummary, LastMessageCallSummary, LastMessageSystemEvent, LastMessageNature, ConversationLastReaction, ConversationActiveCall, ConversationPreviewSticker.
- Composeur d'aperçu (ConversationPreviewComposer) : phrases d'événements système et d'appels (« Appel vidéo manqué », « X a rejoint ») depuis clés + params dans les 7 langues, résumé de pièces (« 3 photos, 1 vidéo »), libellé position, sticker.
- Dernière réaction : ligne « X a réagi ❤️ à « extrait » » avec extrait descendu par le Prisme (excerptTranslations/excerptOriginalLanguage), masqué si excerptProtection.
- Appel actif : anneau/pastille « Rejoindre » sur la ligne quand activeCall est présent (id, audio/vidéo, nombre de participants) ; aujourd'hui seul le chat lit l'appel actif.
- conversation:updated à clés plates : appliquer lastMessage*, lastReaction, activeCall comme patchs partiels (PreviewFieldUpdate), un détail absent = nil.

Rendu : Aperçu 2 lignes max ; icône de type (📷🎬🎵📍📎) devant le libellé ; réaction : emoji agrandi + extrait.

Transposition Android : Strings res/values-xx (7 langues) pour les clés ; Compose Row.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreviewContract.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/call/ActiveCallRepository.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`

### Un message à vue unique, éphémère ou flouté ne laisse rien sortir (copier, enregistrer, partager, transférer)

`tpm-msg-content-exit-law` · Android : **absente** · P0 · effort M

MessageExitOffer compose la loi de sortie partagée (ContentExitLaw : ordinaire, flamme à durée, flamme après lecture, vue unique) avec le flou (holdsBlur), le chiffrement et la citation d'un contenu protégé. offers(exit) répond pour forward, copy, save, share, imagine, publish. Un message flouté se transfère (flou hérité) mais rien d'autre ne sort ; un chiffré ne se publie pas ; un message qui cite un contenu protégé ne s'image pas. Dérivés : exitGate des visionneuses, selectionOffersForward (au moins un message transférable), mediaExitGate, captureShieldScope (couche sécurisée pour vue unique, flamme annoncée) et le verdict de capture d'écran.

Écarts :
- Porter ContentExitLaw (packages/shared/utils/content-exit-law.ts) et MessageExitOffer en Kotlin pur avec les vecteurs partagés.
- Projection ApiMessage.exitOffer (law, holdsBlur, isEncrypted message OU pièce, quotesProtectedContent) ; exitGate, isForwardable.
- Brancher TOUTES les sorties sur l'offre : menu d'appui long, feuille « Plus », sélection multiple (transfert si au moins un message sort, motif des retirés), visionneuses/enregistrement automatique, partage, Imager, Composer.
- Capture d'écran : FLAG_SECURE pour vue unique (verdict blocked), déclaration pour les flammes annoncées, rien pour libre ; portée par pièce (captureShieldScope).
- Message flouté : transfert autorisé, flou hérité par la copie, aucune autre sortie.

Transposition Android : Couche sécurisée iOS (capture bloquée) → WindowManager.LayoutParams.FLAG_SECURE ; détection de capture → Activity.ScreenCaptureCallback (API 34+).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/Message.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Mon carnet d'adresses retrouve qui est sur Meeshy et me laisse inviter les autres, sans fuite pour les non-inscrits

`tpm-address-book-directory` · Android : **absente** · P1 · effort L

DirectoryContact (répertoire persisté côté passerelle) : isOnMeeshy choisit « Lui écrire » ou « Inviter » ; nom affiché = nom du carnet d'abord, puis identité du compte, puis premier identifiant ; identifiant secondaire (pseudo, sinon numéro/e-mail) ; cible d'invitation SMS pour un hors plateforme ; vue ContactMatch pour Découvrir.

Écarts :
- Permission READ_CONTACTS à la demande avec écran d'explication ; lecture ContactsContract (noms, téléphones normalisés E.164, e-mails, pseudos issus des champs de réseaux sociaux).
- Modèles DirectoryContact, DirectoryFilter, DirectorySyncMode, ContactMatch* ; synchronisation par lots (taille bornée) merge/replace ; cache-first Room du répertoire pour un affichage instantané.
- Actions : « Lui écrire » (contact inscrit) / « Inviter » (SMS via Intent ACTION_SENDTO sms: avec message d'invitation) ; filtre tous/sur Meeshy/à inviter.
- Respect de la directive : ne jamais envoyer en clair d'identifiant d'un non-inscrit au-delà du contrat serveur (empreinte HMAC côté serveur) ; consentement explicite avant lecture du carnet.
- Surface Découvrir : intégrer les ContactMatch comme suggestions.

Rendu : Liste alphabétique avec avatar/initiales, badge « sur Meeshy » et bouton d'action à droite ; sections Sur Meeshy / À inviter.

Transposition Android : ContactsContract + libphonenumber ; WorkManager pour la synchro par lots ; Intent SMS.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContactDirectoryModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContactMatchModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`, `apps/android/feature/contacts/src/main/kotlin/me/meeshy/app/contacts/ContactsListTab.kt`

### « Alice a capturé l'éphémère du 07/10 à 14:05 » apparaît dans le fil, dans la langue et le fuseau du lecteur

`tpm-capture-notice` · Android : **absente** · P1 · effort S

CaptureNoticeMetadata (metadata.kind capture) : acteur (invité sans compte OBLIGATOIREMENT distingué, jamais un nom seul), issue (blocked = tentative sur vue unique, announced = capture effective dérivée de la nature), nature jamais ordinary, heure d'envoi du message capturé ; aucune donnée du contenu.

Écarts :
- Décoder metadata.kind=capture avec validation stricte (une issue qui contredit la nature est une forme fausse ⇒ repli sur content).
- Composer la phrase localisée (7 langues, gabarits partagés) avec fuseau du lecteur et heure d'envoi du message capturé ; sanitizedName, actorLabel invité.
- Rendu dans le fil comme ligne système centrée, jamais comme bulle ; ligne d'aperçu de liste correspondante.
- Émission : sur Android 14+, ScreenCaptureCallback déclenche l'avis (annoncée) ou la tentative (bloquée) via l'API dédiée.

Rendu : Ligne système centrée, texte secondaire de petite taille, icône d'œil ou d'appareil photo discrète ; aucune bulle.

Transposition Android : ScreenCaptureCallback (Android 14) ; java.time + DateTimeFormatter avec ZoneId pour le fuseau.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CaptureNoticeMetadata.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CaptureNoticeText.swift`

</details>

### Je consens, finalité par finalité, à l'analyse et à la voix, et chaque octroi pose aussi ses parents

`tpm-consent-purposes` · Android : **absente** · P1 · effort M

ConsentPurpose (data-processing, analytics, voice-data, voice-profile, voice-cloning) avec parents et ancêtres : un octroi par PUT /me/consents/{purpose} pose AUSSI chaque ancêtre manquant côté serveur ; la politique en vigueur est seule acceptée (409 sinon). ConsentEntry servi par GET /me/consents, finalité inconnue tolérée.

Écarts :
- Modèles ConsentPurpose (parent, ancestorsOf), ConsentPolicy.defaultVersion, ConsentEntry tolérant, ConsentsSnapshot, ConsentUpdateRequest ; tests de contrat contre packages/shared/types/consents.ts.
- Endpoints GET /me/consents et PUT /me/consents/{purpose}, gestion du 409 (politique changée) avec rechargement de la version.
- Écran « Consentements » : interrupteurs par finalité avec cascade visible (activer voice-cloning active ses parents, désactiver un parent désactive les enfants) ; recueil au premier usage de la voix.
- Aucun traitement tant que la finalité n'est pas accordée (fail-closed).

Rendu : Liste d'interrupteurs hiérarchiques indentés avec courte explication par finalité.

Transposition Android : Retrofit + DataStore ; écran de réglages Compose.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConsentModels.swift`

</details>

### Quand un contenu ne s'ouvre pas, l'écran dit la vraie cause : réseau, serveur, interdit ou introuvable

`tpm-content-fetch-failure` · Android : **absente** · P1 · effort S

ContentFetchFailure classe une erreur (via MeeshyError.from) en network (vérifier sa connexion), server (5xx, corps illisible : réessayer sans accuser le réseau), forbidden (403) et notFound (404) : pour ces deux dernières le serveur a dit non, réessayer échouerait, le contenu est indisponible. Né d'un 500 serveur qui affichait « vérifiez votre connexion » à chaque ouverture depuis une notification (#6508).

Écarts :
- Créer l'enum ContentFetchFailure et classify(NetworkResult.Failure/Throwable) : hors-ligne/timeout ⇒ network, 403 ⇒ forbidden, 404 ⇒ notFound, reste ⇒ server.
- Messages d'erreur distincts par cause (réessayer visible pour network/server seulement) pour post, story, réel, conversation ouverts depuis une notification ou un lien.
- isAbsence pour couper le bouton Réessayer.

Rendu : État d'erreur plein écran illustré : titre court, explication de la cause, bouton Réessayer seulement quand utile.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/ContentFetchFailure.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationDestination.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/NetworkResult.kt`

### « Ce que tu as manqué » : le pont ✦ résume les non-lus dans la langue du lecteur

`tpm-conv-bridge-lens` · Android : **absente** · P1 · effort M

ConversationBridge donne ce que le lecteur a manqué sur deux étages dans un seul champ : kind fallback (DONNÉES formatées par l'i18n du client : auteurs plafonnés à 2 + « +N », compteurs de médias) et kind agent (une vraie phrase soumise au Prisme, re-résolue par le résolveur existant). Champ ABSENT quand unreadCount == 0.

Écarts :
- Modèles ConversationBridge (Kind fallback/agent, suggestedMode), ConversationBridgeData (authors max 2, extraAuthorCount) et ConversationBridgeMediaCounts avec décodage tolérant.
- Formatage i18n de l'étage fallback (« Aïcha et Tom : 12 messages, 3 photos ») dans les 7 langues ; étage agent résolu par le résolveur de Prisme existant.
- Affichage de la Lentille au-dessus de la liste/au sommet du fil quand unreadCount > 0 ; dépend des modes de lecture (ConversationReadingMode, non portés).
- Aucun rendu quand le champ est absent ; ne jamais fabriquer de pont côté client.

Rendu : Bandeau ✦ discret en tête de conversation, avatars des 2 auteurs + « +N », chips de médias.

Transposition Android : Compose ; strings res/values-xx.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationBridge.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationBridgeData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationBridgeMediaCounts.swift`

</details>

### Un lien de conversation ouvre une carte lisible avant de rejoindre : membres, langues, invitant, bouton adapté

`tpm-conv-card-link` · Android : **absente** · P1 · effort M

ConversationCard est servi par GET /links/:identifier/card (lien de partage, auth optionnelle) et GET /conversations/:id/card (membre seul, sinon 404) : statistiques, état du lecteur (isMember, canJoin, requiresAccount, canJoinAnonymously), lien, invitant et message d'invitation ; cibles /join, /chat (partage) et /c (direct).

Écarts :
- Modèles ConversationCard, Stats, Viewer, Link, Inviter et décodage avec défauts ; enum ConversationCardKind tolérant.
- Résolution d'une URL meeshy.me : /join/<id>, /chat/<id> (canonique), /c/<id> ⇒ cible partage vs direct ; le manifeste gère déjà /chat et /join mais sans carte.
- Écran carte de conversation : avatar/bannière, nom, description, stats, langues, invitant + message d'invitation.
- États : chargement cache-first, lien expiré/désactivé (« ce lien ne sert plus »), hors ligne, 404.

Rendu : Carte plein écran avec bannière, avatar chevauchant, stats en chips, bouton principal collé en bas.

Transposition Android : App Links (intent-filter https meeshy.me /chat /join /c) + navigation Compose.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationCardModels.swift`

</details>

### Chaque appareil traduit les messages récents vers SA langue, les montre aussitôt, puis les partage aux autres membres

`tpm-device-translation-coordinator` · Android : **absente** · P1 · effort M

Un coordinateur par conversation ouverte, dans l'ordre : (1) LIRE les traductions déjà partagées (GET shared-translations) une fois par version de message ; (2) TRADUIRE sur l'appareil ce qui manque vers le rang le plus haut du prisme que le moteur sait faire, l'afficher aussitôt ; (3) PARTAGER en scellant la traduction avec le texte d'origine et la version source, après relecture du message juste avant l'envoi (mayPost). Messages E2EE (mode inconnu ou chiffré) : traduits et montrés en mémoire seulement (persisting false), rien n'est écrit ni partagé. Fenêtre de 40 messages, lots de 20, texte ≤ 4000 unités, message plus jeune que 20 s non lu côté passerelle, décantation 250 ms, 2 lectures max par version. Une traduction déjà servie n'est jamais écrasée ; une seule tentative par version et jeu de langues (ledger) ; partage refusé si le compte a coupé ses accusés de lecture. Couche absente en aperçu de notification et en session anonyme.

Écarts :
- Porter le coordinateur (start/stop idempotents, passes décantées, génération de worker, ledger par message+version+langues, applied par version) dans :feature:chat avec la portée du ChatViewModel.
- Source de conversation : exposer messages, langues du prisme et déclencheur (messages ou traductions changés) ; appliquer par le même canal que message:translation (fusion Room) quand persisting, en mémoire seulement en E2EE.
- Politique : windowSize 40, batchSize 20, maxSourceLength 4000, freshWindow 20 s, settleDelay 250 ms, maxFetchAttempts 2.
- Routage des couples par moteur, disponibilité avant traduction, rang le plus haut atteignable, recalcul des rangs servis juste avant d'appliquer.
- File de partage + relecture mayPost, sharingDeclined quand les accusés de lecture sont coupés, réception de message:translation-shared.
- Désactiver la couche en aperçu de notification et en session anonyme ; arrêt à la sortie de l'écran (stop vide la file de partage).

Rendu : Aucune surface visible : la traduction apparaît comme un contenu natif ; aucun spinner, jamais d'écrasement d'une traduction déjà affichée.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DeviceTranslationCoordinator.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+DeviceTranslation.swift`
- `apps/ios/Meeshy/Features/Main/Views/ConversationDeviceTranslationLayer.swift`

</details>

### L'appareil traduit les messages reçus hors ligne, avec un téléchargement de modèle demandé une seule fois par couple de langues

`tpm-device-translation-engine` · Android : **absente** · P1 · effort M

Frontière DeviceTranslationEngineProviding (engineName, availability(pair) ready/needsDownload/unsupported, translate(lot) par id, cancelPending). Sous iOS 18 AppleTranslationEngine file les travaux en série (un par session), résout les codes Meeshy 2 lettres vers les variantes Apple, fait apparaître la feuille de téléchargement système au premier travail d'un couple et retient tout refus ou échec pour la session (jamais deux feuilles). Sous iOS 16/17, moteur indisponible : l'appareil reçoit encore les traductions partagées.

Écarts :
- Définir le protocole moteur (engineName 1–64 caractères, availability, translate par lots avec ids, cancelPending) et les types Availability/Request/Result.
- Adaptateur ML Kit Translation : Translator, RemoteModelManager (modèles téléchargés), DownloadConditions ; retourner ready/needsDownload/unsupported.
- File série d'un travail à la fois ; un texte non traduit est ABSENT du résultat (jamais d'erreur remontée) et l'appelant retombe sur le rang suivant du prisme.
- Consentement de téléchargement : dialogue Meeshy une fois par couple et par session ; refus ou échec retenu ⇒ couple unsupported.
- Moteur neuf par conversation, refus de téléchargement partagé à l'échelle de la session ; moteur indisponible sans ML Kit.
- Nom de moteur écrit dans l'enveloppe partagée (engine) et translationModel (ex. mlkit-translate).

Rendu : Aucune surface visible hors le dialogue de téléchargement de modèle (texte sobre, taille du modèle, Wi-Fi uniquement par défaut).

Transposition Android : Apple Translation (iOS 18+, hôte de vue 1 pt + TranslationSession) → ML Kit on-device Translation (com.google.mlkit:translate) : pas de vue hôte, un service à file série ; feuille système de téléchargement → dialogue applicatif + DownloadConditions ; UnavailableDeviceTranslationEngine → absence de Play Services.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DeviceTranslationEngine.swift`
- `apps/ios/Meeshy/Features/Main/Services/AppleTranslationEngine.swift`

</details>

### L'appareil traduit lui-même ce que le serveur ne lit pas, vers le premier rang du Prisme qu'il sait servir

`tpm-device-translation-rules` · Android : **absente** · P1 · effort M

DeviceTranslationEligibility décide du sort d'un message du fil : ignoré par l'appareil, traduit-montré-jamais écrit-jamais partagé (le serveur ne lit pas le message : E2EE, mode inconnu, message chiffré sans mode — fail-closed), ou traduit-montré-gardé comme traduction serveur puis scellé et partagé aux autres membres.

Écarts :
- Porter DeviceTranslationDisposition + serverReadsMessage (conversationEncryptionMode nil/server/hybrid/e2ee, isEncrypted, encryptionMode) avec les vecteurs partagés ; fail-closed sur mode inconnu.
- Porter DeviceTranslationTarget / DeviceTranslationCandidates / DeviceTranslationPair (langues d'arrivée à essayer dans l'ordre du lecteur ; null si rien à calculer).
- Moteur de traduction sur appareil (hors de cette partie) : ML Kit Translate on-device avec téléchargement de modèles ; état « modèle en cours de téléchargement ».
- Affichage : traduction locale montrée comme du contenu natif avec indicateur discret ; message E2EE jamais envoyé au serveur pour traduction.

Rendu : Même rendu que le Prisme serveur avec une discrète pastille « traduit sur l'appareil » ; en E2EE l'interface dit quelles fonctions serveur sont absentes.

Transposition Android : ML Kit on-device Translation (com.google.mlkit:translate), modèles téléchargés par paire de langues.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/DeviceTranslationEligibility.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/DeviceTranslationTarget.swift`

</details>

### « X a rejoint la conversation » et « Aïcha, Tom et 12 autres viennent d'arriver » se lisent dans la langue du lecteur

`tpm-join-arrivals-notice` · Android : **absente** · P1 · effort S

JoinNoticeMetadata (avis d'arrivée, quatre portes : lien anonyme, lien inscrit, ajout par un membre, invitation) porte le sens dans metadata, jamais dans le texte : id de l'arrivant, a-t-il un compte (décisif sur lien public), porte d'entrée, règles du lien (LinkRules), pseudo ano_…, nom humain donné au formulaire.

Écarts :
- Décoder metadata.kind=join et members-arrived de façon tolérante (arrivant malformé écarté sans perdre les autres).
- Composer les phrases avec les clés de localisation system.* dans les 7 langues, miroir de join-notice.ts / arrivals-notice.ts ; badge « sans compte » pour un visiteur de lien public.
- Rendu : ligne système centrée dans le fil + aperçu de liste ; l'avis ne regroupe jamais le premier message du nouvel arrivant avec sa bulle (messageSource system).
- Action « dis-leur salut » sur la ligne d'arrivées (ouvre la réponse rapide).

Rendu : Ligne système centrée, typographie secondaire, avatars empilés optionnels pour les arrivées groupées.

Transposition Android : Strings Android par langue (res/values-xx) pour les clés system.* ; composable de ligne système.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/JoinNoticeMetadata.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ArrivalsNoticeMetadata.swift`

</details>

### Après l'inscription, le parcours guidé est déclaré par le serveur et fail-closed pour les mineurs

`tpm-onboarding-contract` · Android : **absente** · P1 · effort M

OnboardingModels (miroir de onboarding.ts, contrat de GET/PUT /me/onboarding) : le SERVEUR déclare le parcours — éligibilité, étapes vues, étapes pré-cochées par l'engagement, régime protégé, suggestions — les clients ne font que l'afficher.

Écarts :
- Modèles OnboardingState/Step/Suggestions avec décodage tolérant des étapes inconnues et protectedRegime fail-closed (absent ⇒ true ⇒ audience amis forcée).
- Endpoints GET/PUT /me/onboarding ; cache-first ; marquer les étapes vues.
- Écrans du parcours post-inscription (étapes dessinées par l'app, ordre et éligibilité du serveur) ; suggestions d'amis/communautés.
- Tests de contrat contre packages/shared/types/onboarding.ts.

Rendu : Pager plein écran, une idée par page, bouton principal en bas, progression en points.

Transposition Android : Retrofit ; Compose pager pour les étapes.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/OnboardingModels.swift`

</details>

### Répondre à un éphémère ou un flou hérite de sa protection, et la réponse meurt avec ce qu'elle cite

`tpm-reply-protection-cascade` · Android : **absente** · P1 · effort M

ReplyProtectionContagion (miroir de la loi TS) : citer un message flou rend la réponse floue non désactivable ; citer un éphémère impose le même mode (flamme-œil ⇒ flamme-œil, durée d ⇒ durée d) ; ce que le cité ne porte pas s'ajoute librement ; la vue unique ne se transmet pas.

Écarts :
- Porter contaminateReplyProtection / imposedReplyProtection (colonnes isBlurred, effectFlags, ephemeralDuration, bit afterRead) avec les vecteurs partagés de packages/shared.
- Composeur : verrouiller les contrôles d'effets (flou imposé, mode éphémère imposé) quand une réponse cible un message protégé ; ligne optimiste avec les bits attendus.
- QuoteCascade : inheritedExpiresAt, isInheritedServable (grâce 1 h), inheritedDeath avec remontée bornée, deadline(of:lookup:).
- Liens de maillon : ownDeath(message, ledger, now) lisant le registre de réceptions locales, link(for:) pour un message du fil et pour une ligne Room.

Rendu : Contrôles d'effets grisés avec cadenas et libellé expliquant pourquoi (réponse à un message protégé).

Transposition Android : Règles pures dans core/model ; registre de réceptions dans Room ; planificateur côté ChatViewModel.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyProtectionContagion.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/QuoteCascade.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/QuoteCascade+Links.swift`

</details>

### Le composeur manipule des objets de scène unifiés et une pile d'annulation de 13 commandes de timeline

`tpm-scene-timeline-models` · Android : **absente** · P1 · effort L

MeeshySceneObject est le type somme de la planche (texte, média, sticker, lieu, audio) qui remplace cinq tableaux séparés (150+ répétitions de cascades) : kind, id, géométrie x/y avec asymétrie assumée.

Écarts :
- Sealed interface MeeshySceneObject (Text, Media, Sticker, Place, Audio) avec id/kind/géométrie ; migrer les requêtes « objet d'id X » du composeur Android qui cascadent sur plusieurs listes.
- TimelineProject + EditCommand + les 13 commandes apply/revert et AnyEditCommand sérialisable ({type, payload}), pile Annuler/Rétablir persistée (CommandStack).
- ClipTransform avec bornes de saisie et applying(Field) ; fiche d'édition de piste (position en pourcentage, rotation, plan).
- Dépend du composeur de timeline (hors de cette partie) : modèles livrés en premier avec tests purs.

Rendu : Fiche d'édition : valeurs en pourcentage, rotation en degrés, glisser pour le plan ; annuler/rétablir en barre.

Transposition Android : Sealed classes + kotlinx.serialization polymorphe ; état Compose du composeur.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshySceneObject.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/AnyEditCommand.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ClipTransform.swift`

</details>

### Ma traduction calculée sur l'appareil est scellée puis partagée aux autres membres sans que le serveur l'ouvre

`tpm-shared-translation-seal` · Android : **absente** · P1 · effort L

SharedTranslationModels (miroir de shared-translation.ts) : décision porteur 2026-10-10 — l'appareil de chaque membre traduit vers SA langue puis partage sa traduction ; la passerelle ne traduit pas, elle garde et relaie une enveloppe SCELLÉE sur l'appareil sans jamais l'ouvrir.

Écarts :
- Modèles de contrat (enveloppe scellée, clé de dérivation depuis le texte du message, métadonnées de langue) et décodage tolérant.
- SharedTranslationSeal : dérivation de clé + chiffrement authentifié identiques au TS/Swift, validés par fixtures/shared-translation/seal.vectors.json (HKDF-SHA256 + AES-GCM via javax.crypto/Conscrypt).
- Endpoints de dépôt/lecture d'une traduction partagée ; ouverture à la réception puis insertion comme traduction serveur dans le Prisme.
- Interdire le partage quand le serveur ne lit pas le message (E2EE) : traduction locale uniquement.

Transposition Android : javax.crypto (AES-GCM) + HKDF via Conscrypt/BouncyCastle ; AndroidKeyStore non requis (clé dérivée du texte).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SharedTranslationModels.swift`

</details>

### Les traductions partagées par les autres membres arrivent, et la sienne leur est partagée sous enveloppe scellée

`tpm-shared-translation-service` · Android : **absente** · P1 · effort S

SharedTranslationService : POST /conversations/:id/shared-translations (share, created=false si un autre membre l'avait déjà partagée) et GET (fetch) avec filtrage préalable des ids (ObjectId) et des langues (1 à 8, ordre du prisme), pagination des ids par 100. Les refus motivés par la passerelle (compte qui ne partage pas, message changé depuis la traduction) deviennent SharedTranslationShareRefusal.

Écarts :
- Ajouter l'API Retrofit shared-translations (POST share, GET messageIds + languages) et le dépôt avec les mêmes bornes (ids ObjectId, langues valides, 8 langues max, 100 ids par requête, sans blancs ni doublons).
- Erreurs typées SharedTranslationShareRefusal (readReceiptsOff, source modifiée).
- Écouter l'événement socket message:translation-shared dans MessageSocketManager.
- Porter SharedTranslationSeal (scellement AES du texte d'origine, module Crypto, autre lot) : core:crypto est vide aujourd'hui.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/SharedTranslationService.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/translation/TranslationRepository.kt`

### Un sticker de conversation se redessine et s'anime ; la boutique de packs se parcourt et s'envoie

`tpm-stickers` · Android : **absente** · P1 · effort L

MessageSticker : un message peut porter un sticker (gabarit du catalogue de story avec emplacements figés + mouvement, ou simple emoji) ; le client envoie le PNG rendu comme pièce jointe ordinaire et, à côté, metadata.sticker {templateId, slots, animation, emoji} pour que les lecteurs capables le redessinent en vectoriel.

Écarts :
- Modèles MessageSticker + StickerPackKind/Status/TextZone/Item/Summary avec décodage tolérant (genre inconnu ⇒ unknown, jamais erreur).
- Envoi : composer le PNG rendu + metadata.sticker ; réception : rendu vectoriel animé via le catalogue de gabarits de story d'Android (StickerCatalog existe côté stories).
- Boutique de packs et feuille de pack dans le composeur ; stickers cinématiques animés (GIF/WebP animé conservé tel quel, vignette qui joue dans la feuille).
- Un sticker à vue unique : fichier non téléchargé tant que scellé.

Rendu : Bulle sans fond, sticker seul à grande taille (le sticker EST le message) ; animation en boucle douce, figée en reduce-motion.

Transposition Android : Coil avec décodeurs GIF/animated WebP (ImageDecoderDecoder).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageSticker.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StickerPackModels.swift`

</details>

### Quand un pair change de nom ou de photo, tous mes écrans le montrent à la seconde, citations et transferts compris

`tpm-user-repaint-live` · Android : **absente** · P1 · effort M

UserProfileRepaint : la loi UNIQUE qui repeint un pair quand la passerelle annonce user:updated — chaque copie DÉSIGNE le pair par son identifiant d'utilisateur (jamais le pseudo qui change, jamais un Participant.id).

Écarts :
- Événement socket user:updated absent du SocketManager Android : modèle UserUpdatedEvent (userId, groupe de nom, avatar tri-état) et décodage tolérant.
- Fonction pure repainted(...) appliquée à : participant, expéditeur de chaque message, ami, demande d'ami, fiche de pair, citation et référence de transfert (par authorUserId/senderUserId gravé).
- Application aux caches Room (messages, participants, amis) ET à l'état en mémoire, avec une seule loi partagée.
- Une copie sans id gravé (avant #9371) garde son nom : jamais d'appariement par nom.

Transposition Android : Socket.IO + Room (UPDATE ciblés par userId) ; fonction pure core/model.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserProfileRepaint.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserProfileRepaint+Quotes.swift`

</details>

### Un message très long s'ouvre sur un extrait avec « Lire la suite »

`tpm-util-long-message-excerpt` · Android : **absente** · P1 · effort S

LongMessageExcerpt (miroir de longMessageExcerpt, vecteurs long-message/excerpt) : l'unité est le graphème ; au-delà de 512 graphèmes l'extrait est le préfixe jusqu'au dernier séparateur de mot avant 25 % du texte, débarrassé en fin des séparateurs et de la ponctuation d'ouverture ; sans séparateur utile (CJK, mot géant) coupe brute à la cible ; sans ellipse (l'UI ajoute « … Lire la suite »), toujours sous la moitié du texte. Calculé sur le texte SERVI par le Prisme.

Écarts :
- Porter isLong(text) (512 graphèmes + 1, sans parcourir le message entier) et excerpt(text) avec BreakIterator/graphèmes ; rejouer packages/shared/fixtures/long-message/excerpt.vectors.json.
- Afficher l'extrait + « … Lire la suite » dans la bulle, déplier au toucher ; texte servi par le Prisme, jamais une autre langue que celle affichée.
- Séparateurs : espace, tabulation, sauts de ligne, espace idéographique (l'espace insécable interdit la coupe) ; ponctuation d'ouverture retirée en fin.

Rendu : Extrait suivi de « … Lire la suite » en couleur d'accent ; dépliage animé sans saut de scroll.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/LongMessageExcerpt.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/MessageBubble.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/RichMessageText.kt`

### Une carte de visite partagée s'affiche avec le nom du contact, et propose d'écrire à son compte Meeshy ou de l'enregistrer

`tpm-vcard-contact-card` · Android : **absente** · P1 · effort M

VCard : projection lisible d'un fichier vCard 2.1/3.0/4.0 — nom FN sinon N recomposé sinon organisation sinon premier numéro/e-mail, numéro préféré montré sous le nom, anniversaire BDAY (1990-05-12, 19900512, --05-12, --0512, horodatage), entrées typées (cell, work, pref, X-ABLabel).

Écarts :
- Parseur vCard 2.1/3.0/4.0 (continuations de ligne, encodages, N, FN, TEL, EMAIL, URL, BDAY, ORG, PHOTO ignoré) avec les mêmes cas de test que VCardTests.
- Détection ContactCardFile (MIME text/vcard, text/x-vcard, octet-stream + extension) et libellé média pour aperçu de liste, citation et galerie (« 👤 nom »).
- Bulle carte de contact : nom, numéro préféré, bouton Écrire (si compte Meeshy) / Inviter / Enregistrer ; résolution via POST /contacts/resolve (listes bornées) avec relation friend/pending/none.
- Enregistrer dans les contacts via Intent ContactsContract.Intents.Insert (aucune permission d'écriture requise) ; émission d'une carte depuis le sélecteur de contacts (génération vCard).

Rendu : Carte compacte : avatar du compte Meeshy ou initiales, nom en titre, numéro en sous-titre, deux boutons d'action en pied.

Transposition Android : ContactsContract.Intents.Insert pour l'enregistrement ; Intent ACTION_PICK pour choisir un contact à partager.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/VCard.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ContactCardFile.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PublicContactAccount.swift`

</details>

### World Wide s'ouvre à un invité : qui peut y joindre quoi se lit avant d'envoyer

`tpm-world-wide-guest` · Android : **absente** · P1 · effort S

WorldEntry (GET /api/v1/world, public) sert la clé de jonction (shareLinkIdentifier), l'avatar et la bannière de World Wide, l'effectif « 199+ » (absent pour un visiteur sans compte). GuestAttachmentKind : familles de pièces ouvertes à un invité (extensions, MIME, codes de refus) ; le client n'OFFRE que ce qui passera.

Écarts :
- WorldEntry + endpoint GET /world sans identité ; cache-first ; avatar/bannière absolus optionnels ; effectif absent ⇒ 0 non affiché.
- GuestAttachmentKind (familles, extensions, MIME, kind(ofFileName), kind(ofMimeType), WORLD_GUEST_ATTACHMENT_KINDS, knownKinds(from:)) et filtrage du sélecteur de fichiers de l'invité.
- Corps de jonction invité (nom, langue) vers la porte canonique POST /links/:key/members ; GuestJoinForm existe côté Android pour les liens (vérifier l'alignement du corps).
- Fail-closed : termes illisibles ⇒ ne rien ouvrir plutôt que tout.

Transposition Android : ActivityResultContracts.OpenDocument avec filtre MIME ; Retrofit.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/WorldModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/GuestAttachmentKind.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AnonymousSession.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/GuestJoinForm.kt`

### Chaque badge explique son échelle de sept paliers, pourquoi il est tenu et ce qui manque pour la prochaine étoile

`tpm-badge-guide` · Android : **absente** · P2 · effort M

BadgeGuide (miroir de badge-guide.ts, vecteurs partagés badge-guide.vectors.json, sur divergence le TS a raison) : l'échelle de sept paliers du cuivre au prisme (seuil, matière, ruban, date gravée), le palier atteint et POURQUOI (BadgeReachReason : compteur ≥ seuil, ou seule trace gravée quand le compteur est redescendu).

Écarts :
- Porter BadgeGuideResolver.resolve(axis, count, paliers servis) / byFamily avec les vecteurs partagés ; dépend du catalogue d'engagement (EngagementAxisKey, EngagementTier) absent côté Android.
- Écran « Guide du badge » : échelle des 7 paliers, étoiles, prochaine étoile, paliers à venir ; regroupement par famille.
- Intégration à la notification de jalon (badge_earned) et au profil.

Rendu : Sept médaillons alignés (cuivre → prisme), étoiles pleines/vides, date gravée sous chaque palier atteint.

Transposition Android : Compose ; vecteurs JSON en tests.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/BadgeGuide.swift`

</details>

### Dans un appel de groupe, toucher une vignette la met à la une, un partage d'écran y monte seul

`tpm-call-group-spotlight` · Android : **absente** · P2 · effort S

GroupCallSpotlight : focus grid ou spotlight(tileId, isScreenShare). Le choix manuel (grille ou vignette) est LOCAL et l'emporte ; sans choix, le premier membre distant qui partage son écran monte à la une (la vignette locale n'y prétend jamais) ; un « Grille » posé pendant un partage ne vaut que pour CE partage (changement de partageur ⇒ retour à l'automatique) ; une vignette épinglée reste épinglée ; si elle quitte l'appel, retour à l'automatique. Zoom borné 1…4.

Écarts :
- Porter la règle pure (focus, sharerId, choice(afterSharerChangedFrom:to:), featuresLocal, clampedZoom 1…4).
- Android n'a pas de scène d'appel de groupe (grille de vignettes, partage d'écran, vignettes en bande) : prérequis UI.
- Geste : toucher une vignette ⇒ spotlight, bouton Grille, pincement pour zoomer jusqu'à ×4.

Rendu : Grande vignette à la une avec les autres en bande ; bannière sur son propre partage d'écran ; bouton Grille toujours accessible.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/GroupCallSpotlight.swift`

</details>

Android existant : `apps/android/feature/calls/src/main/kotlin/me/meeshy/app/calls/CallScreen.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/call/ActiveCallSession.kt`

### Ce que je publie reste lisible partout : conversion StoryEffects vers canvas v3 sans perte

`tpm-canvas-v3-write-bridge` · Android : **absente** · P2 · effort M

CanvasV3Migration : pont bidirectionnel StoryEffects ⇄ CanvasV3, miroir strict de storyEffectsV3.ts (juge partagé : fixtures/canvas-v3/v1-legacy-full.v3.json) — ancres libres letterboxées par le ratio du porteur (y' = top + y·h, inverse exact pour l'aller-retour v1→v3→v1 fidèle).

Écarts :
- Android continue d'écrire du v1 (le pont d'écriture n'existe pas) : porter toCanvasV3 (texte, média, sticker, audio, dessin, location, bandes, transitions, keyframes → TimingV3).
- Valider l'aller-retour sur la fixture partagée v1-legacy-full.v3.json (égalité exacte des décimales).
- Publier en v3 uniquement quand la lecture est livrée (déjà le cas) ; rester v1 tant que le pont n'est pas à parité pour ne pas casser les anciens lecteurs.

Transposition Android : Conversion pure sur JsonObject ; tests de fixtures dans core/model.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3Migration.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### La liste de conversations se range en sections En direct, catégories puis Aujourd'hui, Hier, Cette semaine, Plus ancien

`tpm-conv-lentille-sections` · Android : **absente** · P2 · effort M

LentilleSectionResolver (miroir exact de packages/shared/utils/conversation-sections.ts, vecteurs sections/sort) partitionne en sections ordonnées pinned → live → catégories utilisateur (ordre déclaré) → today → yesterday → thisWeek → older, sans section vide, chaque conversation dans exactement une section (précédence épinglée > live > catégorie > temporel). sortConversations : épinglées, live, catégorie (orderInCategory), lastMessageAt desc (repli updatedAt), id. now et fuseau injectés. Derrière un drapeau côté iOS ; sections EN DIRECT/temporelles non repliables et jamais cibles de drop.

Écarts :
- Android ne sait qu'épinglées → catégories → « Mes conversations » : porter resolveSections/sortConversations et les vecteurs partagés.
- Sections temporelles (calendrier grégorien du lecteur, fuseau injecté) et section EN DIRECT (liveCall, aujourd'hui toujours vide).
- Identité de section propre (préfixe lentille.) : sections temporelles jamais repliables ni cibles de drop (pas de catégorie fantôme).
- Réglage/drapeau d'activation du mode Lentille.

Rendu : En-têtes de section en majuscules (EN DIRECT, AUJOURD'HUI, HIER, CETTE SEMAINE, PLUS ANCIEN) avec sticker non interactif ; contenu toujours visible.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Lentille/Core/LentilleSectionResolver.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSections.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/DraftAwareOrdering.kt`

### Un lien YouTube dans un message ou un post devient une façade vidéo avec vignette qui ouvre la vidéo

`tpm-embeddable-video-facade` · Android : **absente** · P2 · effort S

EmbeddableVideoResolver détecte (NSDataDetector) le premier lien YouTube d'un texte : youtu.be/<id>, youtube.com/watch?v=, /shorts, /embed, /v, /live, youtube-nocookie ; ids de 6 à 20 caractères ASCII [A-Za-z0-9_-] ; départ via t ou start (« 90 », « 1m30s ») ou fragment. EmbeddedVideo expose thumbnailURL (hqdefault ou maxresdefault), embedURL, watchURL (id encodé en un seul segment de chemin). Au toucher la façade ouvre l'URL watch (ou un lien tracké /l/token) – jamais de lecture inline en WebView (erreurs 15x).

Écarts :
- Porter le résolveur pur (hôtes, chemins, id valide, parseDuration, fragment) et EmbeddedVideo (vignette, embed, watch, id percent-encodé en segment unique).
- Façade vidéo (vignette + bouton lecture) dans les bulles de chat, le détail de post et la ligne de repost du fil ; au toucher ACTION_VIEW (appli YouTube ou navigateur) via ChatLinkOpener/lien tracké.
- Remplacer la LinkPreviewCard classique par la façade quand un EmbeddedVideo est résolu.

Rendu : Vignette 16:9 coins arrondis avec bouton play centré et badge YouTube discret ; même rendu dans bulle, détail de post et repost.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/EmbeddableVideoResolver.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LinkPreviewCard.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`

### Un document MeeshyLens (filtre/cadre/stickers/particules) se lit sans jamais exécuter de code

`tpm-lens-format` · Android : **absente** · P2 · effort M

Format de données Lens v1, GÉNÉRÉ depuis packages/shared/types/lens-format.ts (fraîcheur gardée par test, comportement par fixtures/lens-v1/vectors.json). LensFormat.parse ne lève jamais : ok(document, ignoredLayers, ignoredTriggers) \| updateRequired(schema) \| forbidden(raisons triées : shader, script, URL, réseau, 3D) \| invalid. Couches lut, frame, sticker, text (texte par langue du Prisme, polices fermées), particles (8 préréglages, densité) ; ancres écran ou point du visage (13 points) ; déclencheurs (onTap, onSmile, onMouthOpen, onBrowRaise, onBlink, onTime, onSpeaking) vers show/hide/burst/play/stop ; surfaces capture/live ; coût light/standard/rich avec paliers de repli ; fenêtre de validité par dates, pays, communautés. Bornes : 12 couches, 8 déclencheurs, profondeur 16.

Écarts :
- Étendre le générateur generate:lens-format pour émettre aussi du Kotlin (document, vocabulaire, parseur) avec garde de fraîcheur ; JSON exact (bool ≠ nombre, null ≠ absence).
- Rejouer fixtures/lens-v1/vectors.json en test JVM.
- Mapper les 13 points du visage vers ML Kit Face Mesh/Face Detection.
- Moteur de rendu (CameraX + OpenGL/Canvas) : aucun consommateur iOS hors du parseur à ce jour, donc à planifier après la décision produit.

Transposition Android : Vision/ARKit points du visage → ML Kit Face Detection/Mesh ; CIFilter LUT → GPU shader interne (jamais fourni par la lens).

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensDocument.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensFormat+Layers.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensFormat+Scan.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensFormat+Vocabulary.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensFormat.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Lens/LensJSONValue.swift`

</details>

### Je choisis à quel grain ma position est transmise : exacte, ~100 m, ~1 km ou ~10 km

`tpm-location-sharing-precision` · Android : **absente** · P2 · effort S

LocationPrecision (exacte, ~100 m, ~1 km, ~10 km) arrondit latitude/longitude avant tout envoi ; l'enum ne porte aucun libellé (données seules). LocationSharingPreferences persiste le choix et dégrade le lieu pour message, position en direct et autres surfaces.

Écarts :
- Modèle LocationPrecision + LocationSharingPreferences (par défaut, persistance DataStore) et fonction de dégradation du lieu.
- Section de réglages « Partage de position » avec libellés Quartier / ~1 km etc. localisés ; application de la dégradation sur tous les chemins d'envoi (message, live, post, story).
- Le rayon d'imprécision annoncé (mètres) doit correspondre au nombre de décimales conservées.

Rendu : Sélecteur à 4 niveaux avec rayon affiché (cercle d'imprécision sur la carte d'aperçu).

Transposition Android : DataStore Preferences ; arrondi pur.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationSharingPreferences.swift`

</details>

### Voir les versions précédentes d'un message édité, même après un redémarrage

`tpm-msg-edit-history` · Android : **absente** · P2 · effort S

EditHistoryStore garde, au moment de editMessage et juste avant le remplacement optimiste, le contenu AVANT édition (EditRevision : id, content, editedAt), au plus 30 révisions par message et 200 messages suivis (éviction des plus anciens), persisté, clé = id serveur canonique. Contenu vide ignoré. Purgé à la déconnexion (le texte retiré par l'auteur ne survit pas au compte). Alimente l'entrée « Historique » de la feuille Plus… quand isEdited et hasEditRevisions.

Écarts :
- Créer le magasin (table Room ou DataStore) EditRevision(messageId, content, editedAt) avec bornes 30/200, thread-safe, ignorer les contenus blancs.
- Enregistrer la révision dans la même transaction que l'édition optimiste, sous l'id serveur résolu.
- Vider à la déconnexion (SessionTeardown).
- Écran « Historique » (liste des versions, plus ancienne d'abord) accessible depuis Plus….

Rendu : Liste datée des versions précédentes, façon « Voir les modifications » de WhatsApp.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/EditHistoryStore.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEditability.kt`, `apps/android/core/database/src/main/kotlin/me/meeshy/core/database/entity/MessageEntity.kt`

### Exporter une carte avec un son ou une vidéo en GIF ou en MP4, avec la représentation du son

`tpm-msgcard-audio-motion-outputs` · Android : **absente** · P2 · effort M

MessageCardMedia décrit un média (image, vidéo, audio ; ratio, durée, nom, échantillons d'amplitude, transcription de la piste servie, crédit, sticker). MessageCardOutput.offered : image fixe toujours en tête, GIF et vidéo pour une vidéo, vidéo seule pour un son. MessageCardMotionPlan : fps, durée (GIF ≤ 6 s réduit de moitié, vidéo ≤ 15 s pleine taille, son 15/30/60 s bornés), échelle paire pour H.264, extrait MessageCardClip choisi. Le son se représente en onde, pastille, spectre ou fiche ; la transcription est posée sous la représentation, hauteur indépendante de l'instant.

Écarts :
- Porter MessageCardMedia/Output/Clip/MotionPlan, les échantillons synthétiques (graine) et le ré-échantillonnage.
- Peindre onde, pastille, spectre (≈ 20 barres), fiche et leur animation.
- Encodeurs : GIF (encodeur maison ou lib) et MP4 H.264 + AAC via MediaCodec/MediaMuxer avec la piste audio de l'extrait.
- Sélecteur d'extrait (début, durée 15/30/60 s) et mise en page de la transcription.

Transposition Android : AVAssetWriter/ImageIO → MediaCodec + MediaMuxer / encodeur GIF.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardLayout+Audio.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardMedia.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/waveform/WaveformInterpolator.kt`

### La carte d'export se met en page comme à l'écran : en-tête, citation réduite, liaison, réponse, médias, filigrane

`tpm-msgcard-layout-engine` · Android : **absente** · P2 · effort L

Loi pure, mesure injectée (police réelle ou règle fixe en test), qui rend une liste d'opérations à peindre (texte, rectangle, séparateur, point, média, glyphe, groupe) : en-tête (titre, date ; horizontal, empilé, couché montant/descendant), citation en entier et réduite, liaison du template (orbite, filet, guillemets, flèche, fil, bulles, silence), réponse en bas et en grand, médias au-dessus/en dessous/à gauche/à droite/en fond avec agencement unique, mosaïque, vague, hero ou sinusoïde (MosaicLayout), hero de support (ratio 16:9–4:5, ≤ 45 % du budget), sticker contain jamais rogné (≤ 512 px), fil de commentaires imbriqué (retrait 44, 3 niveaux max), sens du texte RTL, coupes de lignes et troncatures. Format auto 1080 de large (1080–1920 de haut) ou story 9:16, portrait 4:5, carré, paysage 16:9 ; inclinaison ±4°, filigrane diagonal « Meeshy @pseudo » toujours présent.

Écarts :
- Porter les lois pures (layout, moteur, texte wrap/truncate/direction, fil, hero, sticker, disposition) avec les vecteurs du miroir web message-card-layout.ts.
- Peintre Canvas/Bitmap Android qui consomme la liste d'opérations ; mesure via Paint/TextPaint.
- Réutiliser MosaicLayout pour vague/hero/sinusoïde ; sticker en contain, photo en cover recadrée.
- Dispositions : aspect (auto, story, portrait, square, landscape), orientation d'en-tête, place des noms, inclinaison, agencement et placement des médias.
- Rendu ≥ 1080 px sans dépasser la mémoire (budget bitmap).

Rendu : Fidélité pixel avec le web : marges 48/96, filigrane diagonal, nom d'auteur au-dessus ou en signature, médias arrondis (stickers jamais), polices des stories.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardLayout.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardLayoutEngine.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardLayout+Media.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardText.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardThread.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardHero.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardSticker.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardDisposition.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/MosaicLayout.kt`

### Une carte exportée dit qu'elle a été créée par Meeshy (métadonnées PNG)

`tpm-msgcard-png-metadata` · Android : **absente** · P2 · effort S

MessageCardPNGMetadata pose des blocs tEXt et un bloc XMP iTXt (xmp:CreatorTool) juste après IHDR, sans toucher un pixel ; CRC32 maison ; rien de l'exportateur n'y entre (son pseudo est déjà dans le filigrane). textChunks relit les blocs pour les tests et les outils.

Écarts :
- Porter le tamponnage PNG (tEXt + iTXt XMP après IHDR, CRC32) et la relecture textChunks ; tout contenu non PNG ressort tel quel.
- Mêmes mots-clés que le web (png-metadata.ts) ; test de parité.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardPNGMetadata.swift`

</details>

### Une carte d'export ne montre que ce qu'un message a le droit de montrer, dans la langue lue

`tpm-msgcard-subject-protection` · Android : **absente** · P2 · effort M

MessageCardSubject (miroir de message-card-subject.ts) décide quoi peindre : garde — un message protégé (vue unique, flouté, éphémère échu, supprimé, avis système) ne s'exporte pas ; la citation est celle de la bulle (prisme du lecteur, placeholder si protégée) ; les mots sont le texte SERVI, sauf langue d'export choisie (réponse dans cette langue, citation en prisme) ; médias photo, vidéo (poster) et son, hors pièce chiffrée ; une pièce floutée ou à vue unique rend le message inexportable ; le message cité apporte aussi ses médias ; un son part dans sa piste servie avec fichier, durée ET transcription de la même langue ; heroID pour un support de commentaire ; auteur de chaque média (anonymat suivant le bloc).

Écarts :
- Porter MessageCardSubject (quoted, reply, sentAt, quotedAt, media, heroID, viewer) et les gardes de protection (réutiliser tpm-msg-content-exit-law).
- Élection de la piste audio exportée par le prisme du lecteur ou la langue d'export ; une piste servie sans texte ne montre rien (jamais le texte de l'original).
- Médias : posters vidéo, auteurs (MessageCardMediaAuthor : nom, pseudo, citée ou non).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardSubject.swift`

</details>

### Choisir parmi 784 cartes d'export, les chercher par mot et rejouer son format par défaut

`tpm-msgcard-templates-gallery` · Android : **absente** · P2 · effort M

MessageCardTemplates compose palette (14) × typographie (8) × liaison (7) = 784 identifiants STABLES palette.typographie.liaison, identiques au web (polices des stories). MessageCardSearch cherche par mots vus par l'utilisateur (nom de palette, typographie, liaison, ton sombre/clair) sans casse ni accents, chaque mot préfixant un mot du template ; ordre de galerie bijectif identique au web (plus utilisés d'abord puis brassage sans voisins partageant palette/typo/liaison). MessageCardFormat = template, titre, auteurs, date, anonymisation citée/réponse, heures, pseudos, disposition ; format par défaut enregistré sur l'appareil (clé meeshy.export.message-card.default-format), relu et validé, valeur abîmée ⇒ aucun défaut ; onglets Détails (offeredToggles) et Frame (frameToggles).

Écarts :
- Porter les tables de palettes, typographies et liaisons avec les mêmes identifiants que apps/web/src/lib/export/message-card-templates.ts et un test de parité des 784 ids.
- Faces de police : mapper les polices des stories Android (StoryTextStyle équivalent) ; MessageCardFace natif (graisse, italique).
- Recherche insensible à la casse et aux accents (Normalizer), préfixe de mots, ton, vocabulaire localisé ; compteur d'usage pour l'ordre.
- Format par défaut persisté (DataStore) avec validation tolérante ; bascules Détails/Frame conditionnelles (titre, citation, pseudos).

Rendu : Galerie en grille de vignettes de cartes avec champ de recherche et filtre clair/sombre ; noms de palettes propres, identiques dans les sept langues.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardTemplates.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardSearch.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/MessageCard/MessageCardFormat.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTextElement.kt`

### Mes écoutes et visionnages sont mesurés par plages continues, avec la raison de leur fin

`tpm-playback-stretch` · Android : **absente** · P2 · effort M

PlaybackStretchTracker capture fidèlement l'interaction d'un participant avec un média SANS échantillonnage périodique (qui perd structurellement du contenu) : chaque plage continue de lecture est enregistrée avec sa fin — pause, déplacement du curseur, son coupé, fin du média, écran quitté ou app en arrière-plan.

Écarts :
- Porter PlaybackStretch/StretchEnd (paused, seeked, muted, ended, left, replaced) et le tracker pur (open/close de plages, plage orpheline conservée).
- Brancher sur le lecteur Media3 (onIsPlayingChanged, onPositionDiscontinuity, volume 0, onPlaybackStateChanged ENDED, cycle de vie) pour audio, vidéo et vocaux.
- Envoi des plages au point de terminaison de consommation média (alimente currentUserConsumption et listenedComplete/watchedComplete).

Transposition Android : Media3 Player.Listener + lifecycle observers.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PlaybackStretchTracker.swift`

</details>

### Marquer comme lu déclare la langue réellement lue (dominante + exceptions)

`tpm-prism-consumed-language-read-receipt` · Android : **absente** · P2 · effort S

À chaque accusé de lecture, iOS calcule pour chaque message visible la version linguistique réellement sous les yeux (ConsumedLanguageResolver : bascule manuelle > prisme > original, même résolution que le texte) puis dominantSplit la répartit en langue dominante + table d'exceptions (égalité → code alphabétiquement premier, corps déterministe), la forme attendue par mark-read. Résolu à la composition de l'accusé, pas à l'envoi de la file.

Écarts :
- markRead Android est un POST sans corps : ajouter languages {language, exceptions} au corps de mark-read.
- Porter ConsumedLanguageResolver (original, traductions disponibles, prisme, bascule manuelle) et PrismTranslationLaw.dominantSplit.
- Résoudre au moment de l'accusé et persister dans la ligne d'outbox, pas à l'envoi.
- Lecteurs audio/vidéo (réels, vocaux) : fournir un consumedLanguageProvider pour la langue réellement écoutée.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/PrismTranslationLaw.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Translations.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Toucher la citation d'un vocal le joue, jamais s'il est protégé

`tpm-quoted-audio-playback` · Android : **absente** · P2 · effort S

QuotedAudioResolver rend la pièce citée prête à jouer (QueuedAudio : attachmentId, messageId, conversationId, fileUrl, durationMs, expéditeur, avatar, receivedAt). En fenêtre, la piste suit le prisme audio de CE vocal ; hors fenêtre, c'est la piste portée par la citation, élue par AudioTrackLanguageResolver. Refus si supprimé, vue unique, flouté, chiffré, expiré, ou pièce protégée.

Écarts :
- Créer la file de lecture QueuedAudio et le résolveur pur inWindow/outOfWindow avec toutes les gardes de protection.
- La référence de réponse doit porter quotedAttachment et quotedAudioTracks (originalLanguage, urlsByLanguage) pour le cas hors fenêtre.
- Brancher le geste sur la citation dans la bulle de réponse.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/QuotedAudioResolver.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ReplyJump.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`

### La Rivière lit une conversation de groupe sur deux axes : le temps et les interlocuteurs

`tpm-reading-mode-river-lanes` · Android : **absente** · P2 · effort M

RiverLaneResolver est le miroir exact de packages/shared/utils/river-lanes.ts (vecteurs river-lanes/step/headers) : un rang par message (ordre chronologique), un laneIndex par branche. Une branche naît à la première interaction, court tant que la conversation l'entretient, meurt silenceWindowMs après la dernière et renaît dans la même colonne (colonnes partagées au-delà de maxLanes). Verdict lanes ou serialized (belowMinimum/aboveMaximum voix). Un avis système n'est la voix de personne. Navigation à deux axes resolveRiverStep (left/right/up/down → moved/edge/empty). Fonctions pures, temps injecté.

Écarts :
- Porter la loi pure (entrées message/participant/viewer, sorties RiverGeometry : nodes, spans, lanes, bubbles, connectors) et rejouer les vecteurs partagés.
- Gérer silenceWindowMs, maxLanes, minVoices, dayBoundaryOffsetMinutes, colonne 0 = rive du lecteur, connecteurs de réponse (cible hors fenêtre ⇒ aucun connecteur).
- Navigation à deux axes (resolveRiverStep) pour clavier/TalkBack.
- Peau Compose (Canvas/Path) – autre lot – consomme la loi et ses constantes sans recalculer la géométrie.

Rendu : Traits décoratifs, contenu prioritaire pour lecteurs d'écran (ordre DOM/TalkBack strictement chronologique) ; avis système pleine largeur ; couleur de branche graine = displayName via DynamicColorGenerator.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Riviere/Core/RiverLaneResolver.swift`

</details>

### Le mode de lecture d'une conversation est mémorisé par lecteur, et chaque mode montre le chrome de protection

`tpm-reading-mode-scope-and-protection-chrome` · Android : **absente** · P2 · effort S

ConversationViewerIdentity (inscrit userId ou anonyme participantId, jamais lu via anonymousSession != nil) fournit le scope de stockage des préférences de mode de lecture (clé u_<userId> ou a_<SHA-256 tronqué à 16 hex>) pour que deux invités sur le même appareil ne partagent pas une préférence. ReadingModeProtectionChrome est une table exhaustive : chaque mode (focal, script, bulles, rivière, résumé) déclare le fichier qui monte le badge de protection et celui qui monte la combustion d'un éphémère.

Écarts :
- Créer ConversationViewerIdentity + resolver pur (session anonyme > utilisateur courant > anonyme sans id) et le scope de clé DataStore avec hash SHA-256 tronqué pour l'anonyme.
- Clés meeshy_readmode_<scope>_<conversationId> et meeshy_lastopen_<scope>_<conversationId>.
- Exiger par type (when exhaustif sur le mode de lecture) que chaque mode rende le chrome de protection et la combustion d'éphémère ; garde de test équivalente à la table de chemins.
- Dépend de l'existence des modes de lecture Android (aucun aujourd'hui).

Transposition Android : UserDefaults scopé → Preferences DataStore ; CryptoKit SHA256 → MessageDigest.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Focal/Preferences/ConversationViewerIdentityResolver.swift`
- `apps/ios/Meeshy/Features/Main/Models/ReadingModeProtectionChrome.swift`

</details>

### La bibliothèque de sons alimente stories et reels : tendances, recherche, page du son

`tpm-sound-library` · Android : **absente** · P2 · effort M

APISound (projection exacte de toDTO de /posts/sounds : titre, fichier, durée, waveform, usageCount = PISTES, postCount = publications distinctes visibles — c'est celui-ci qui s'affiche —, playCount, public, auto-généré, cover + thumbHash, uploadeur) ; contentHash JAMAIS exposé (oracle de possession).

Écarts :
- Modèles APISound, APISoundUploader, APISoundPost(+Media) et endpoints /posts/sounds (liste tendances/récents, recherche, page d'un son, publications du son).
- Sélecteur de son dans le composeur de story/reel avec aperçu audio et waveform ; libellé « Son original » localisé pour un son capturé sans titre.
- Page du son : couverture, compteurs (publications, vues), grille des publications.
- Ne jamais afficher usageCount tel quel ; ne jamais lire/stocker contentHash.

Rendu : Carte de son : cover carrée, waveform miniature, durée, compteur de publications.

Transposition Android : Media3 pour l'aperçu audio ; Retrofit.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SoundModels.swift`

</details>

### Ma story affiche une miniature qui montre ce que j'ai vraiment composé

`tpm-story-my-card-thumbnail` · Android : **absente** · P2 · effort S

MyStoryThumbnailResolver choisit la source de la miniature de MyStoryCard : le thumbHash composite de storyEffects (toutes les couches : texte, dessin, stickers) s'il existe ; sinon l'URL distante du média brut ; sinon un placeholder. localCoverPath : le composite rendu en local (même pipeline que la publication et l'autosave) l'emporte sur l'ancien repli.

Écarts :
- Créer le résolveur pur (composite thumbHash > URL distante > placeholder) et le chemin de couverture locale (rendu composite > repli).
- Carte « Ma story » (publiées et brouillons) avec miniature composite, décodée par ThumbHashPainter existant.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/MyStoryThumbnailResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StorySlidePlaceholder.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`

### Une carte de contact (vCard) se lit et s'écrit, avec ses libellés et ses champs

`tpm-util-vcard` · Android : **absente** · P2 · effort M

VCardParser lit un .vcf (octets ou texte) : lignes logiques dépliées, quoted-printable avec charset, échappements, paramètres (TYPE, groupes et libellés Apple item1.X-ABLabel), propriétés multiples ; rend un VCard ou nil. VCardWriter écrit un VCard avec échappement et pliage des lignes. Utilisé par la carte de contact reçue (ContactCardDetailSheet, ViewModel, exporteur).

Écarts :
- Porter VCardParser (dépliage RFC 6350, quoted-printable + charset, séparateurs non échappés/non entre guillemets, libellés de groupe) et VCardWriter (escape, fold à 75 octets) avec leurs vecteurs.
- Modèle VCard (noms, téléphones, e-mails, adresses, organisation, notes, photo) partagé avec la carte de contact des messages.
- Intégration : lecture d'un .vcf reçu et enregistrement via ContactsContract (Intent ACTION_INSERT) ; partage d'un contact comme pièce jointe.

Transposition Android : CNContact/CNContactVCardSerialization → ContactsContract + Intent.ACTION_INSERT_OR_EDIT, parseur vCard maison.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/VCardParser.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/VCardWriter.swift`

</details>

### Le menu d'un message n'offre que ce que la loi autorise, groupé et ordonné comme sur iOS

`tpm-message-action-policy` · Android : **divergente** · P0 · effort L

MessageActionPolicy est la loi unique (miroir de messageActionsFor, vecteurs partagés) : à partir du type de contenu (MessageContentKind : supprimé, système/appel, sticker, lieu, sondage, pièce, texte…), du message (auteur, âge, épinglé).

Écarts :
- Remplacer MessageActionMenu (16 actions, règles locales) par un port exact de MessageActionPolicy + MessageContentKind + ConversationViewerAuthority + PlatformRole.
- Actions absentes : retry, openLink, copyLink, openInMaps, copyAddress, saveContact, viewResults (sondage), save (galerie), transcribe, sentiment, remove, discard.
- Divergence connue : Android masque Signaler sur son propre message, iOS le propose (décision à trancher puis aligner sur la loi TS).
- Rôles : PlatformRole exact pour modérer (un moderator en minuscules ne modère pas) vs casse pliée pour administrer ; rang de conversation exact, inconnu ⇒ 0 ; ADMIN/BIGBOSS membre ⇒ rang créateur ; MODERATOR/AUDIT/ANALYST ⇒ rang de leur ligne.
- Édition par modérateur (EditVerdict.asModerator, windowEndsAt) et fenêtre 24 h bornes incluses ; suppression pour tous selon rang ; E2EE : pas d'édition ni de transfert.

Rendu : Menu long-press : groupe primary en rangée d'icônes (répondre, réagir, copier, transférer), puis listes organize/more, bloc modération.

Transposition Android : Logique pure Kotlin (core/model) ; rendu : ModalBottomSheet/menu contextuel Compose avec groupes séparés.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageActionPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageContentKind.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationViewerAuthority.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PlatformRole.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageDeletability.kt`

### Le menu d'appui long offre les bonnes actions selon le rôle, le type, la protection et le chiffrement

`tpm-msg-longpress-menu-composition` · Android : **divergente** · P0 · effort M

MessageActionResolver compose une liste verticale compacte (au plus MessageActionPolicy.maxPrimaryActions=6, puis « Plus… » toujours en fin) : Réessayer (envoi raté), détail d'appel, Répondre, actions du type (ouvrir/copier le lien, ouvrir dans Plans/copier l'adresse), Éditer, Sélectionner, Traduire, Copier, Imager (+ export rapide), Enregistrer (une seule pièce), sticker (ajouter, favori), Composer. Au-delà de 6 les jumeaux de « Plus… » débordent d'abord. La feuille « Plus… » : actions (répondre, transférer, discussion, éditer, copier, partager, imager, épingler, favori, sticker épinglé, supprimer le média, supprimer), infos (langue, transcription, réactions, vues si accusés partagés, sentiment sur appareil, historique) et modération (signaler). Vue unique : seulement Supprimer et Vues ; supprimé/échu : seulement « Supprimer pour moi » ; flouté : aucun contenu ; E2EE : transcription et sentiment serveur absents.

Écarts :
- Android expose une liste PLATE de 14 actions : introduire le contexte immuable MessageMenuContext (rôle, canEdit/canDelete, hasText/hasMedia/hasTimebasedMedia, épinglé/favori/édité, exits, vue unique, flou, E2EE, sticker, lieu) et les verdicts de la loi partagée MessageActionPolicy (canReply, canPin, canStar, canReport, canTranslate, canRemove, canDeleteForEveryone, canDeleteForMe, canDiscard, canForward) – à porter depuis packages/shared/utils/message-action-policy.ts avec ses vecteurs.
- Menu à deux niveaux : actions primaires plafonnées + feuille « Plus… » en trois sections (actions, infos & Prisme, modération) ; ordre de débordement exportQuick > exportImage > copy > translate > edit.
- Entrées manquantes : Réessayer en tête, Sélectionner (mode sélection multiple), discussion/thread, Imager et export rapide, Composer, détail d'appel, actions du type (lien, lieu), sticker (ajouter, favori, épingler), supprimer le média, vues, réactions, transcription, sentiment, historique d'édition.
- Cas protégés absents : vue unique ⇒ [Supprimer, Vues] seulement ; message supprimé ou éphémère échu ⇒ « Supprimer pour moi » seulement ; flouté ⇒ aucune entrée de contenu ; E2EE ⇒ langue/transcription serveur absentes ; entrée « vues » masquée si accusés de lecture désactivés.
- Menu d'une PIÈCE (Tout le message, Répondre à cette pièce, Supprimer cette pièce, Transférer cette pièce).
- Signaler : iOS gouverne par le verdict canReport ; Android le masque sur ses propres messages, aligner sur le verdict partagé.
- Toutes les sorties (copier, enregistrer, partager, transférer, imager, composer) lisent MessageExitOffer, jamais un drapeau brut.

Rendu : Liste verticale compacte façon iMessage sous la bulle surélevée, entrée « Plus… » en dernier ; feuille « Plus… » en sections (Faire, Infos & Prisme, Modération) ; la bulle reste visible et le menu se pose selon son côté ; haptique léger à l'ouverture ; libellés « Composer » (jamais « Publier ») et « Imager ».

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/MessageActionResolver.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageActionMenu.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/MessageOverlayLayout.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Le message s'affiche dans ma langue, et reste dans l'original dès que l'original est déjà un de mes rangs

`tpm-prism-resolver` · Android : **divergente** · P0 · effort M

PrismTranslationResolver est LA descente du Prisme : parcourt les langues du lecteur dans l'ordre, la première servie gagne — par une traduction, ou parce que le message est déjà écrit dans cette langue (arrêt au rang de la langue d'origine, jamais un court-circuit).

Écarts :
- LanguageResolver.preferredTranslation compare targetLanguage exactement (ignoreCase) : pas de normalisation région-aveugle (pt-BR vs pt) ni de clé canonique.
- Résolveur générique PrismCandidate<Value> pour les familles non textuelles (piste audio TTS, transcription, légende de story, objets texte) afin de supprimer les boucles réécrites par famille.
- Départage déterministe de deux clés d'une même langue canonique (forme canonique d'abord, sinon ordre lexical) et traduction vide sautée.
- ReaderPrism (descente STRICTE rangs 1→4 sans repli fr) distincte de preferredContentLanguages (repli fr pour les défauts de composition) : ne servir en conversation que la première.
- ConsumedLanguageResolver (version réellement lue, sélection manuelle prioritaire, nil si indéterminable) pour l'enrichissement de statistiques de vues média.

Rendu : Aucun rendu ; transparent (le contenu traduit s'affiche comme du contenu natif, discret indicateur de langue).

Transposition Android : Kotlin pur dans core/model/lang ; vecteurs JSON partagés packages/shared/fixtures (reading-modes) comme tests.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PrismTranslationResolver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConsumedLanguageResolver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageCode.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt`

### Chaque message s'affiche dans la première langue du prisme du lecteur, l'original gagnant à son rang

`tpm-prism-text-resolution-law` · Android : **divergente** · P0 · effort S

iOS résout le texte en deux temps : ReaderPrism.resolve (systemLanguage > regionalLanguage > customDestinationLanguage > locale appareil, SANS repli « fr ») puis PrismTranslationLaw.prismTranslation, qui descend les langues du lecteur dans l'ordre ; la première servie gagne, par une traduction ou parce que le message est déjà écrit dedans (nil = original, jamais translations.first). ConversationLanguagePreferences est la valeur Equatable mise en cache par le ViewModel et invalidée au changement d'utilisateur ; la locale appareil vient du serveur (user.deviceLocale) puis de Locale.current.

Écarts :
- LanguageResolver.preferredTranslation renvoie la première traduction trouvée sans faire concourir la langue d'origine à son rang (règle 3) : prisme [fr,en], message écrit en fr avec traduction en ⇒ Android sert l'anglais, iOS l'original. Ajouter originalLanguage et le test « langue du rang == origine ⇒ null » dans la boucle.
- preferredContentLanguages ajoute le repli « fr » quand rien n'est configuré et preferredTranslation l'utilise : un utilisateur sans langue reçoit une traduction française. Créer la descente stricte ReaderPrism.resolve (rangs 1→4, dédoublonnage insensible à la casse, locale vide = rang sauté) et réserver preferredContentLanguages aux défauts de composition.
- Pas de cache de résolution par message : iOS le vide quand le prisme change (preferredLanguageRevision) ou quand la langue d'origine d'un message change (messageIdsWhoseOriginChanged, #9191) et ne mémorise pas une résolution provisoire (origine lue sur les traductions).
- Bascule manuelle (activeTranslationOverrides) prioritaire sur le prisme et retirée (clé supprimée, pas mise à null) quand le message est édité.
- Langue source de repli translatedFromLanguage (première sourceLanguage non vide et ≠ « auto ») quand le message est hors fenêtre.
- Rejouer les vecteurs partagés packages/shared/fixtures du prisme en test JVM pour verrouiller la parité TS/Swift/Kotlin.

Rendu : Aucun rendu propre : la bulle affiche le texte résolu comme du contenu natif, avec l'indicateur discret de langue (drapeau/puce) et l'exploration par appui long ; ni popup ni bannière.

Transposition Android : Locale.current → Locale.getDefault() normalisé (DeviceLocaleTag/LanguageCodeNormalizer) ; header X-Device-Locale déjà posé par DeviceLocaleInterceptor.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/ConversationLanguagePreferences.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/PrismTranslationLaw.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageResolver.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Composer plusieurs filtres de liste et retirer un filtre d'un second appui

`tpm-conv-filter-composition` · Android : **divergente** · P1 · effort S

Directive 2026-08-28 : les chips passent sous le rail de stories, plus petites. La sélection devient un ENSEMBLE. Au sein du TYPE (personnel, privée, ouvertes, globales, channels) la conjonction est un OU ; au sein de l'ÉTAT (non lus, favoris) un ET ; entre les deux familles un ET. « Tous » est le neutre (efface les autres et ne se compose avec rien), « Archives » change de corpus (les archives sont masquées partout ailleurs), l'ensemble vide vaut « Tous ». Un second appui retire le filtre. Les libellés sont localisés par clé conversation.filter.* (jamais le rawValue français) et chaque chip annonce « Toucher pour ajouter/retirer ce filtre » en accessibilité.

Écarts :
- Android n'a qu'UN filtre sélectionné (selectFilter) : passer à un Set de filtres avec toggling, isNeutral, includesArchived, selectedTypes (OU) et selectedStates (ET) ; vide ⇒ Tous.
- Second appui sur une chip sélectionnée la retire (aucun bouton d'effacement ailleurs).
- ConversationFilters.apply doit croiser les familles (type OU, état ET, entre familles ET) et traiter Archives comme bascule de corpus.
- Indice d'accessibilité par chip (ajouter/retirer) et état dit sans dépendre de la couleur.
- Libellés localisés dans les sept langues (ar, de, en, es, it, pt, fr) : Android n'a que en/fr/es/pt.
- Positionner les chips sous le rail de stories, en plus petit.

Rendu : Chips compactes sous le rail de stories, couleur d'accent par filtre (colorHex déjà aligné), chip sélectionnée pleine, transition douce ; neutre « Tous » sélectionné par défaut.

<details><summary>Sources iOS (2)</summary>

- `apps/ios/Meeshy/Features/Main/Models/ConversationFilterComposition.swift`
- `apps/ios/Meeshy/Features/Main/Models/ConversationFilterLabel.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationFilter.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationFilterBar.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationListViewModel.kt`

### Une notification sans titre serveur se lit quand même : titre, corps et contexte composés par type, dans la langue du lecteur

`tpm-notification-copy-fallback` · Android : **divergente** · P1 · effort M

formattedTitle compose ~70 phrases par type quand le serveur n'a pas de titre : « Message de X », « X vous a mentionné », « X veut se connecter », « X a rejoint Meeshy », « X était sur Meeshy récemment », « X t'invite à un duo », réactions selon l'emoji et le genre de contenu (story, humeur, réel, publication, commentaire).

Écarts :
- Android délègue au titre composé par la passerelle (BannerFraming conversation/relation/action) mais n'a pas la table de repli par type de formattedTitle quand title est vide.
- formattedBody par type : aperçu message/commentaire/post, excerpt + résumé média, loginDeviceBody (lieu · IP · OS), removalBody (« Motif : … » sans doublon).
- formattedContext/decoratedSocialContext : sous-titre serveur, sinon genre du contenu + « · » + date de publication + libellé d'expiration ; socialKindLabel (Story, Réel, Humeur, Publication).
- Cas humeur : phrases dédiées (« a commenté votre humeur », « a réagi X à votre humeur ») via socialProseKind (STATUS ⇒ MOOD) ; repost par genre (réel, story, humeur, publication).
- Les phrases françaises sont en dur côté iOS (sans accents pour une part) : sur Android, tout passer par strings.xml localisés.

Transposition Android : strings.xml par langue ; fonction pure testable JVM.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APINotification.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationBannerPresentation.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationPresentationText.kt`

### Chaque ligne de notification a le bon avatar, titre, extrait, citation et pied, sans redite

`tpm-notification-row-presentation` · Android : **divergente** · P1 · effort M

NotificationRowPresentation compose la ligne : élément de tête (avatar, jalon avec symbole, ou signature), titre, corps, citation, pied (conversation de groupe, contenu lié avec symbole/texte/état expiré, texte simple). NotificationRowText.distinct supprime toute redite entre ces blocs. NotificationQuickAction : Se connecter / Écrire.

Écarts :
- La ligne Android affiche un titre/corps de bannière unique : porter NotificationRowPresentation (leading avatar | milestone | signature, title, body, quote, footer) et NotificationRowText.distinct/repeats.
- Pied de contenu lié : symbole par genre (story, réel, humeur, publication), texte « extrait · date · expiration », état expiré (grisé) ; pied conversation de groupe seulement si type != direct.
- Jalons : milestone(badge/achievement/level/streak) avec titre et raison servis (tierRank présent) ou repli localisé (progression.axis.*, progression.<clé>.title).
- Actions rapides sous la ligne : Se connecter / Écrire pour contact_joined et badge d'invitation (isFriend ⇒ Écrire seul) avec résolution de la relation.
- Ligne « signature » des notifications de jeu (ligue, saison, mission) sans avatar.

Rendu : Avatar rond à gauche (ou médaillon de jalon coloré), titre en gras, corps 2 lignes, citation en italique avec barre, pied compact avec icône de genre.

Transposition Android : Compose LazyColumn + SwipeToDismissBox (déjà présent) ; Material Symbols.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationRowPresentation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationQuickAction.swift`

</details>

Android existant : `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationsScreen.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationRowTime.kt`

### Une pièce jointe garde toutes ses propriétés, protections et accusés par pièce

`tpm-attachment-wire-model` · Android : **partielle** · P0 · effort M

APIMessageAttachment et MeeshyMessageAttachment portent l'intégralité de la pièce : dimensions, thumbHash, variantes WebP responsives (imageVariants, décodage lossy), métadonnées audio/vidéo/document, protection par pièce (vue unique, flou, effectFlags, declaredProtection), chiffrement (iv, authTag), réactions par pièce.

Écarts :
- ApiMessageAttachment ne déclare pas : messageId, bitrate, sampleRate, codec, channels, fps, videoCodec, pageCount, lineCount, uploadedBy, isAnonymous, createdAt, forwardedFromAttachmentId, isForwarded.
- Protection par pièce absente de l'ApiMessageAttachment : isViewOnce, maxViewOnceCount, viewOnceCount, isBlurred, effectFlags et le calcul declaredProtection (fermé par défaut).
- Chiffrement : isEncrypted, encryptionMode, encryptionIv, encryptionAuthTag non décodés côté wire.
- imageVariants (variantes WebP responsives : url, largeur, hauteur, poids, format avec repli webp) et son décodage lossy absents ; sans eux l'original multi-Mo est téléchargé pour les aperçus.
- reactionSummary et currentUserReactions par pièce, currentUserConsumption (MeeshyMediaConsumption), accusés deliveredToAllAt/viewedByAllAt/downloadedByAllAt/listenedByAllAt/watchedByAllAt et compteurs.

Rendu : Hauteur d'une vidéo en bulle = largeur x ratio, plafonnée à 1,6 (portrait 5:8 max), repli 16:9 si dimensions inconnues.

Transposition Android : kotlinx.serialization ; Coil/ExoPlayer pour le choix de la variante image.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessageAttachment.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIAttachmentTranslation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyMessageAttachment.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageAttachment+VideoSizing.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiMessageDetail.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`

### Une ligne de conversation a son nom, sa fraîcheur et son effectif au bon format sur toute la liste

`tpm-conv-domain-model` · Android : **partielle** · P0 · effort M

MeeshyConversation est le modèle de domaine : nom affiché (nom personnalisé > titre > identifiant), World Wide reconnu par son identifiant, présence du dernier vu, états par utilisateur, empreinte de rendu (renderFingerprint) pour ne redessiner une cellule que si son rendu change, listRankAt pour l'ordre.

Écarts :
- Pas de modèle de domaine : l'UI manipule ApiConversation directement ; extraire un ConversationRow/Conversation immuable avec name, displayName (customName > titre > identifiant), isWorldWide (identifiant World Wide), isArchived (!isActive).
- Effectif plafonné : memberCountCapped + formatMemberCount(count, capped) → « 199+ » (aujourd'hui memberCount est un Int sans plafond).
- renderFingerprint (hash des champs qui changent le rendu) → clé de recomposition stable/@Immutable pour les cellules de liste (zéro re-rendu inutile).
- listRankAt (rang de liste distinct de lastMessageAt) : ordre cohérent avec les brouillons et les réactions.
- Hash/égalité de diffing partiels (ne combiner que le nom) → utiliser une clé stable LazyColumn + contentType.

Transposition Android : Compose LazyColumn avec key = id, @Immutable data class, derivedStateOf.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversation+MemberCount.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyFeedItem.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`

### La ligne de liste décrit UN seul message : auteur, aperçu, icône et état cohérents, sans mélange de deux messages

`tpm-conv-last-message-facet` · Android : **partielle** · P0 · effort M

LastMessageFacet remplace atomiquement les onze champs lastMessage* (texte, traductions, langue d'origine, pièces, auteur, auteur userId, flou, vue unique, échéance, lieu, nature) : un chemin temps réel ne peut plus laisser l'auteur de l'ancien message avec le texte du nouveau.

Écarts :
- Pas de facette atomique : ApiConversationLastMessage est remplacé champ à champ par plusieurs chemins.
- revertingDeletion : à la suppression du dernier message, revenir au message précédent servi (REST relu), vider seulement si le remplaçant est inconnu ; ne rien faire si un conversation:updated plus récent est passé.
- ConversationListAuthor : fusion de l'auteur au moment de l'événement socket (senderId connu) avec le mot « Toi » localisé ; un auteur périmé ne survit jamais à un changement de dernier message.
- LastMessageSummaryKind.afterRead (flamme-œil) absent des deux enums Android (LastMessageSummaryKind et MessageSummaryKind) ; ordre de décision : expiré > flou > vue unique > afterRead > éphémère actif.
- Un seul écrivain du groupe dernier message (moteur de synchro) ; le ViewModel de liste persiste un instantané dépouillé de ces groupes.

Rendu : Ligne « Auteur : message » sur 2 lignes max ; libellés spéciaux (flou, vue unique, expiré, éphémère) à la place du contenu.

Transposition Android : Réducteur pur + Room ; libellés dans res/values.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageFacet.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationListLastMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationListAuthor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/LastMessageSummaryKind.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/RecentMessagePreview.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MessageSummaryKind.kt`

### La liste de conversations décode tout ce que la passerelle sert, avec des champs tolérants

`tpm-conv-list-wire` · Android : **partielle** · P0 · effort M

APIConversation et ses sous-modèles (utilisateur imbriqué avec contour d'avatar, dernier message avec position hissée, sticker hissé de metadata.sticker et sous-groupe NATURE du contrat #7545, compteur de messages) : titre, avatar, bannière + thumbHash, communauté, effectif plafonné (memberCountCapped), chiffrement, auto-traduction.

Écarts :
- ApiConversation Android est mince : manquent communityId, bannerThumbHash, memberCountCapped (« 199+ »), recentMessages, tags.
- ApiConversationLastMessage ne porte ni location (hissée par la passerelle pour un message géolocalisé sans texte) ni sticker hissé (#10752) ni le sous-groupe nature.
- Plafond d'aperçu : tronquer lastMessagePreview et chaque aperçu traduit à LAST_MESSAGE_PREVIEW_MAX_LENGTH en clusters de graphèmes (BreakIterator) pour ne pas affamer le thread UI.
- Décodage tolérant : un champ inconnu ou mal formé ne doit pas jeter la ligne de liste ; contour d'avatar servi (profileDecor) à ignorer proprement.
- Flux conversation:updated à clés plates lastMessage*, lastReaction, activeCall à brancher sur les mêmes types.

Transposition Android : kotlinx.serialization + coerceInputValues ; BreakIterator pour la troncature.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiConversationDetail.kt`

### La ligne d'aperçu d'une conversation dit l'essentiel : appel en cours, frappe, brouillon, réaction ou dernier message selon sa nature

`tpm-conv-preview-composer-law` · Android : **partielle** · P0 · effort M

ConversationPreviewComposer (miroir de composeConversationPreview, packages/shared/utils/conversation-preview.ts, mêmes fixtures conversation-preview-cases.json) renvoie une valeur structurée ConversationPreview (kind, tone, icône, auteur, segments) – l'UI dessine icône, couleur et italique. Priorité : appel en cours (bouton Rejoindre), frappe (1, 2, plusieurs), mon brouillon, réaction plus récente que le dernier message, puis le message selon sa nature : texte servi par le Prisme (segment avec la langue servie), pièces (vocal, audio, vidéo, photo, fichier, contact, lieu, sticker, pluriels, détails durée/pages), appels (manqué, refusé, annulé, sans réponse, échoué), système, effets. Protection : expiré > vue unique > flou > chiffré > flamme après lecture > éphémère, un message protégé ne rend ni texte, ni traduction, ni détail de pièce. 18 icônes (glyphe de mise à plat pour VoiceOver), tons default/accent/success/danger/system, séparateur d'auteur selon la langue. Le SDK ne porte aucun texte : 50+ clés (ConversationPreviewStringKey) prêtées par l'app.

Écarts :
- Android compose une chaîne (typing > brouillon > dernier message) : porter la valeur structurée ConversationPreview et le composeur, et rejouer conversation-preview-cases.json en test JVM.
- Genres manquants : appel en cours (Rejoindre), réaction plus récente que le dernier message, appels terminés (manqué, refusé, annulé, sans réponse, échoué), système, effets, sticker, contact, plusieurs pièces et pluriels, détails (durée, pages).
- Protection complète : ordre expiré > vue unique > flou > chiffré > flamme après lecture > éphémère, et aucune fuite de texte, de traduction ou de détail de pièce (Android n'a pas chiffré ni flamme après lecture).
- Étendre le modèle de ligne ApiConversation : nature du dernier message (messageType, effectFlags, ephemeralDuration, isEncrypted, isForwarded, systemEvent), pièces, lieu, expiresAt, réaction récente, appel actif.
- Indices Prisme par segment (langue servie) via resolvePrismTranslation, jamais une boucle réécrite.
- Catalogue de libellés complet dans les sept langues (ar, de, it manquent) ; séparateur d'auteur « Alice : » en français et « Alice: » ailleurs ; icônes mappées sur l'iconographie Android.
- Mise à plat accessible (contentDescription) auteur : glyphe + segments séparés par ·.

Rendu : Une ligne sous le nom : icône (couleur du ton), préfixe d'auteur, segments séparés par « · » ; brouillon et frappe en couleur d'accent de la conversation, appel en cours en succès avec action Rejoindre, italique pour les protections ; jamais de spinner.

<details><summary>Sources iOS (6)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewComposer.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewValue.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewBody.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewInput.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewInput+Conversation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewStrings.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/LastMessagePreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationRowPreview.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MessageSummaryKind.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LastMessagePreviewResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LastMessageSummaryKind.kt`

### Épingler, mettre en sourdine, archiver, verrouiller ou lire une conversation se fait en un geste, instantanément, et se rejoue hors ligne

`tpm-conv-user-state` · Android : **partielle** · P0 · effort M

ConversationUserState unifie tout ce que la passerelle renvoie sous UserConversationPreferences, les drapeaux locaux (verrou PIN, brouillon) et les métadonnées de synchro. UserStateMutation s'applique de façon optimiste, s'enfile dans l'outbox et part vers PUT /user-preferences/conversations/:id ou les POST dédiés ; ConversationDraft survit à navigation et kill du process.

Écarts :
- Pas de type unifié : les préférences (ApiConversationPreferences) sont séparées du verrou (ConversationLockStore), du brouillon (ConversationDraftStore) et des métadonnées de synchro.
- Champs manquants : lastReadMessageId, lastReadMessageCreatedAt, lastReadAt, lastDeliveredAt, clearHistoryBefore, orderInCategory, sectionId, appearance (accent), hasPendingSync, pendingMutationCount, lastSyncedAt, isVisible.
- UserStateMutation en enum sérialisable avec clé de coalescence (même clé ⇒ dernier écrivain gagne ; deleteForUser et leave jamais fusionnés ; setLocked local) branchée sur OutboxCoalescer.
- Application optimiste + rollback sur échec et résolution contre les diffusions socket (conversation:updated, user:preferences-updated).
- Tri : brouillon significatif remonte la ligne (DraftAwareOrdering existe) ; aperçu de brouillon « Brouillon : … » ; hasDraft/draftPreview dans l'état.

Rendu : Épingle/sourdine/archive par swipe ou long-press ; retour haptique léger ; la ligne se met à jour avant la confirmation réseau.

Transposition Android : Room (ConversationEntity) + OutboxRepository/OutboxFlushWorker (WorkManager) pour le rejeu FIFO.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationUserState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserStateMutation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationDraft.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationDraft.kt`

### Les coches ✓ → ✓✓ → lu reflètent TOUS les destinataires d'un groupe, et un accusé ne promeut que son message

`tpm-delivery-read-receipts` · Android : **partielle** · P0 · effort S

DeliveryStatusResolver : sémantique tout-ou-rien façon WhatsApp (un seul destinataire : le statut stocké fait foi ; en groupe, ✓✓ gris quand chacun a reçu, ✓✓ indigo quand chacun a lu). ReadStatusReceipt : un accusé read-status:updated ne promeut que le message qu'il nomme.

Écarts :
- DeliveryStatusResolver Android existe (avec réciprocité showReadReceipts) : vérifier l'équivalence exacte avec les vecteurs iOS.
- ReadStatusReceipt : appliquer read-status:updated à UN message (summary.messageId ; repli dernier du fil seulement pour une passerelle d'avant #7433), ne jamais promouvoir par horodatage d'événement.
- Cas de non-régression à porter : lecture partielle d'un pair (M1..M5 lus, M1..M20 ne passent pas), dernier message du pair, groupe avec éventail d'un tiers.

Rendu : Coches ✓ gris, ✓✓ gris (livré à tous), ✓✓ couleur d'accent indigo (lu par tous) ; état horloge/échec selon le cycle d'envoi.

Transposition Android : Réducteur pur + DAO Room (UPDATE ciblé sur messageId).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/DeliveryStatusResolver.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReadStatusReceipt.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/DeliveryStatusResolver.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SendLifecycleResolver.kt`

### Une conversation directe porte le nom, l'avatar et la bannière de l'AUTRE, jamais du lecteur

`tpm-direct-interlocutor` · Android : **partielle** · P0 · effort S

Un direct porte le nom, l'avatar et la bannière de l'AUTRE participant, élu CONTRE l'identifiant du lecteur ; un lecteur inconnu n'élit personne (#11164). Nom : interlocuteur élu, sinon expéditeur du dernier message quand il n'est pas le lecteur, sinon nom générique ; jamais le title stocké.

Écarts :
- otherParticipant(currentUserId) élit le premier participant dont userId != currentUserId : avec currentUserId null/vide il élit LE LECTEUR (défaut #11164) ; retourner null pour un lecteur inconnu.
- Repli du nom : expéditeur du dernier message quand il n'est pas le lecteur, puis nom générique ; ne jamais retomber sur title pour un direct.
- Six champs dérivés d'UNE élection (id, username, avatar, bannière, contour, nom) et report depuis le cache Room quand la ligne servie n'a pas élu (participants non servis).
- Libellé générique localisé (« Conversation ») honnête.

Transposition Android : Fonction pure sur ApiConversation + merge avec ConversationEntity.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/DirectInterlocutor.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`

### Un message éphémère décompte depuis la réception et quitte l'écran à la seconde exacte, avec un seul réveil

`tpm-ephemeral-deadline-schedule` · Android : **partielle** · P0 · effort M

EphemeralDeadline : l'échéance d'un éphémère est la plus PROCHE de deux horloges — l'échéance servie par le serveur résolue pour CE lecteur (REST, message:countdown-started) et la réception locale + ephemeralDuration — jamais plus tardive.

Écarts :
- Android calcule le décompte depuis expiresAt seul (EphemeralLifecycle.evaluate) avec un ticker par bulle.
- Registre de réceptions locales (EphemeralReceiptLedger : noteReception idempotent/monotone, destruction(of:)) à créer dans Room/DataStore.
- Socket message:countdown-started absent des événements Android : consommer l'échéance servie par lecteur ; REST ne sert plus expiresAt à l'arrivée d'un éphémère (#7451).
- EphemeralExpirySchedule : plan {expirés, prochain réveil} calculé sur la conversation ; une coroutine unique dans ChatViewModel qui dort jusqu'au nextWake (seuil dernière minute #7467 ou échéance).
- Bit ephemeralAfterRead (flamme-œil, 1<<3) : disparaît quand le lecteur l'a vu puis a quitté la conversation ; aucune durée ; consommation à la sortie.

Rendu : Pastille de flamme (flame.fill → icône flamme du design system) avec décompte compact (15s, 1m 05s, 2h 03m) ; dernière minute : accent chaud.

Transposition Android : Room pour le registre de réceptions ; coroutine delay unique par conversation.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralDeadline.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralExpirySchedule.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyMessage+Protection.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageProtection.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/EphemeralLifecycle.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`

### Les langues se listent avec leur nom écrit dans leur propre langue, drapeau et couleur

`tpm-language-catalog` · Android : **partielle** · P0 · effort S

LanguageData : catalogue des langues cibles de traduction groupées par famille, avec code, nom, nom natif, drapeau et couleur hex. autonym(for:) donne le nom d'une langue écrit dans cette langue (« 한국어 », « العربية ») pour qu'une liste de langues se lise pareil pour tous (catalogue, puis Locale, puis code en capitales).

Écarts :
- Catalogue Android : 78 langues contre 83 sur iOS — manquent ksf (Bafia), nnh (Ngiemboon), ny (Chichewa), om (Oromo), ti (Tigrigna).
- nativeName sans diacritiques (« Francais », « Espanol », « Portugues » au lieu de Français, Español, Português) : restaurer les vraies graphies natives.
- Ajouter autonym(code) avec repli java.util.Locale.getDisplayName(Locale(code)) puis code en capitales, et colorHex(code) neutre pour inconnu ; utiliser l'autonyme dans tous les sélecteurs de langue.
- Parité du drapeau par langue (catalan, langues africaines) et de la couleur par famille.

Rendu : Ligne de sélecteur : drapeau, nom natif en gras, nom anglais en secondaire, pastille de la couleur de langue.

Transposition Android : java.util.Locale pour le repli d'autonyme ; polices Noto pour les écritures non latines.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/LanguageData+Autonym.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt`

### Un message reçu se projette en bulle avec expéditeur, citation, transfert, réactions et statut de remise

`tpm-message-domain-mapping` · Android : **partielle** · P0 · effort M

APIMessage.toMessage(currentUserId, username, displayName, preferredLanguages) construit le message affichable : type et source (user/system/ads/app/agent/authority), pièces jointes avec transcription et traductions audio embarquées.

Écarts :
- Pas de modèle de domaine unique : le mapping vit dans BubbleContentBuilder (sdk-ui) et LocalMessage ; extraire un Message.toDomain(currentUserId, prisme) pur, partagé entre chemin REST.
- MeeshyReaction.reconstructFromSummary absent : Android lit reactionSummary directement ; porter la règle.
- messageSource : seul system est reconnu ; ads/app/agent/authority non mappés (senderHasAccount dérivé de la source, absent).
- Identité d'expéditeur : senderIsAnonymous (glyphe fantôme décidé par type, jamais par le pseudo ano_), senderHasAccount, senderRing, repli sur l'identité de session pour mon propre écho allégé.
- UserDisplayNameCache.track(username, displayName) (noms servis pour les mentions) absent du mapping.

Transposition Android : Mapper pur dans core/model (testable JVM) ; AndroidKeyStore + HmacSHA256 pour l'empreinte de provenance E2EE.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessage+MeeshyMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyReaction.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageContentOrigin.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/LocalMessage.kt`

### Chaque message du serveur s'affiche complet, même quand un champ est malformé ou récent

`tpm-message-wire-decoding` · Android : **partielle** · P0 · effort M

iOS décode APIMessage avec tout ce que la passerelle sert : id ou _id, expéditeur imbriqué, message transféré et conversation d'origine, lieu, sticker (racine ou metadata.sticker), avis système (appel, arrivée, capture, arrivées groupées), liens suivis, chiffrement, accusés, durée éphémère, consommation de la vue unique.

Écarts :
- ApiMessage n'a pas : updatedAt, forwardedFrom (message source avec expéditeur et pièces jointes), location (SharedPlace), sticker (racine + repli metadata.sticker), mentionedUsers, ephemeralDuration, consumedByMe, isEncrypted/encryptionMode.
- Les avis système ne sont pas décodés : callSummary, joinNotice, captureNotice, arrivalsNotice (tous lus depuis metadata) et systemEvent.
- L'expéditeur de ApiMessage est le ApiMessageSender minimal (id/userId/displayName/username/avatar) : manquent type (anonymous/user/bot), firstName/lastName, user imbriqué, et les dérivés name, resolvedAvatar, resolvedUserId, isAnonymous, hasAccount.
- Décodage lossy absent : translations est un List strict, donc une traduction malformée fait échouer tout le message ; porter un serializer tolérant (liste, mêmes règles que decodeLossyArrayIfPresent) pour translations, attachments.
- Repli d'identifiant _id absent ; postReplyTo ne porte ni authorName ni deletedAt ; ApiTextTranslation sans isEncrypted (iOS écarte les traductions chiffrées de la citation).

Rendu : Aucun rendu direct ; conditionne la fidélité de la bulle (transfert, lieu, sticker, avis système, vue unique).

Transposition Android : kotlinx.serialization (@Serializable, @JsonNames pour _id et storyReplyTo, JsonTransformingSerializer pour les listes tolérantes).

<details><summary>Sources iOS (11)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessageSender.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessageSenderUser.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIForwardedFrom.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIForwardedFromConversation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APITextTranslation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessagesAPIMeta.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessagesAPIResponse.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/KeyedDecodingContainer+StoryLossyDecoding.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ThreadModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/SendMessageResponseData.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ApiMessageDetail.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`

### Chaque type de notification est reconnu, décodé et coloré, y compris contacts, jeux et DSA

`tpm-notification-wire-types` · Android : **partielle** · P0 · effort M

APINotification (id, type, priorité, titre, sous-titre, contenu, acteur, contexte, métadonnées, état, livraison) et ses sous-modèles : NotificationActor (nom affiché > pseudo), NotificationContext (conversation, message, appel, demande d'ami, réaction, post, commentaire, premier attachement url/mime/durée, dates du post).

Écarts :
- Types wire manquants dans MeeshyNotificationType Android : contact_joined, contact_recently_active, level_up, report_resolved, content_removed, game_duo_invited, game_duo_accepted, game_league_result, game_season_step, game_mission_window.
- NotificationMetadata incomplet : manquent attachments {count, firstType, firstFilename, firstDurationMs, firstFileSize, firstWidth, firstHeight}, parentCommentPreview, postPreview, excerpt, achievementKey, axisKey, threshold, level, tierRank, value.
- NotificationContext : firstAttachmentDurationMs, postCreatedAt, postExpiresAt absents ; NotificationActor.displayedName ; NotificationData dérivée du contexte (callId = callSessionId).
- NotificationPagination : champ nextCursor absent ; décodage tolérant des types inconnus ⇒ system.
- Icône et couleur d'accent par type (3498DB messages, FF6B6B réactions, 9B59B6 mentions, 4ECDC4 relations, F8B500 groupes, FBBF24 jeux/succès, E91E63 appels, EF4444 sécurité, 08D9D6 traduction, 6366F1 système) à compléter pour les nouveaux types.

Rendu : Couleur d'accent par type listée dans la table iOS ; icône système par type (bulle, cœur, arobase, personne+, cloche…).

Transposition Android : kotlinx.serialization avec enum tolérant (coerceInputValues + valeur par défaut).

<details><summary>Sources iOS (11)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APINotification.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationActor.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationContext.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationData.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationDelivery.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationListResponse.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationMetadata.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationState.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MarkReadResponse.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/UnreadCountResponse.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyNotificationType.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationTypeCatalog.kt`

### Mon appareil s'enregistre pour les push avec son identité, et remplace son ancien jeton

`tpm-push-device-registration` · Android : **partielle** · P0 · effort S

RegisterDeviceTokenRequest (token, platform, type apns/fcm/voip, apnsEnvironment, + identité d'appareil deviceId, deviceName, appVersion, bundleId) : la passerelle désactive les jetons précédents du même (userId, deviceId, type) (#10858) ; absents ⇒ clés omises.

Écarts :
- Le modèle Android porte type = apns par défaut (non encodé, encodeDefaults=false : le serveur déduit fcm hors iOS) : envoyer explicitement type = fcm.
- Aucune identité d'appareil envoyée : ajouter deviceId stable (ANDROID_ID dérivé/UUID persistant), deviceName (Build.MODEL), appVersion (BuildConfig.VERSION_NAME).
- Désenregistrement au logout par deviceId quand le jeton est inconnu.
- Rafraîchissement du jeton FCM (onNewToken) avec ré-enregistrement idempotent.

Transposition Android : FirebaseMessaging.getToken ; Settings.Secure.ANDROID_ID ou UUID DataStore.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/RegisterDeviceTokenRequest.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Notification.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/NotificationRepository.kt`

### « Premier message non lu » exact, lecture comptée après présence continue, rattrapage sans trou

`tpm-read-position-tracking` · Android : **partielle** · P0 · effort M

FirstUnreadBoundary (miroir de first-unread.ts) : jamais un message du lecteur, jamais avant ou AU curseur ; trois rangs de frontière identiques au compte serveur — lastReadMessageCreatedAt (clé chronologique), puis lastReadAt, puis joinedAt ; le curseur lastReadMessageId est exclu des candidats (défense contre la dérive d'horloge).

Écarts :
- UnreadMarker.firstUnreadId devine par comptage depuis la fin (unreadCount) : remplacer par FirstUnreadBoundary avec lastReadMessageId / lastReadMessageCreatedAt / lastReadAt / joinedAt.
- SeenMessageAccumulator absent du chat (le dwell n'existe que pour posts/reels/stories) : porter l'accumulateur pur (dwellMs, seuil de lot, plafond anti-doublon) et brancher les apparitions/disparitions des items LazyColumn.
- SyncWatermark : newestSyncedCreatedAt s'appuie sur un indicateur de synchro ; vérifier qu'aucun message optimiste/en échec n'est jamais le repère, et ajouter la règle pure testée.
- Séparateur « Nouveaux messages » placé sur le résultat de la loi, avec scroll initial vers lui.

Rendu : Séparateur horizontal « Nouveaux messages » avec compteur, accent de la conversation ; défilement initial animé vers lui.

Transposition Android : LazyListState + snapshotFlow pour les apparitions ; Room pour les repères serveur.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SeenMessageAccumulator.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/SyncWatermark.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/FirstUnreadBoundary.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/UnreadMarker.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatListItems.kt`

### Répondre à un message montre une citation fidèle : texte au prisme, média, protection et saut

`tpm-reply-quote-reference` · Android : **partielle** · P0 · effort L

APIMessageReplyTo.toReplyReference compose la citation gravée dans la bulle : média représentatif (ou pièce ancrée par attachmentReplyTo), texte descendu par le Prisme (traductions lisibles seulement), placeholder si protégé (👁️ vue unique, 🌫️ flou, 🔒 chiffré + icône du type 🖼️🎬🎵📍📎💬).

Écarts :
- ReplyReference Android n'a que 12 champs : manquent authorUserId, authorAvatarUrl, authorIsAnonymous, authorRing, attachmentId/attachmentFileUrl/attachmentIsProtected/attachmentFacts, quotedExpiresAt, quotedExitNature, quotedPieceCount, moodEmoji.
- Citation d'une pièce précise : attachmentReplyTo ({attachmentId, kind}) → choisir la pièce citée plutôt que la première non-lieu ; kind dérivé du MIME ; APIQuotedAttachmentReference absent.
- Texte de la citation au Prisme : descendre PrismTranslationResolver sur replyTo.translations (écarter les traductions isEncrypted) ; Android affiche le contenu brut.
- Placeholder de protection (👁️/🌫️/🔒 + icône de type) et masquage de la vignette/url d'un média protégé ; libellé média (carte de contact, photo, vidéo, vocal) quand le texte est vide.
- Suivi du cité : tombstoned(at, expired) pour suppression/expiration (garder auteur + ancre de saut, vider texte et média, garder l'échéance pour dire « expirée »), withPreviewText sur édition du parent.

Rendu : Citation compacte : barre d'accent de l'auteur (couleur déterministe), nom, aperçu 1-2 lignes, vignette carrée à droite, pastille de durée pour audio.

Transposition Android : Compose : bloc cité en tête de bulle (swipe-to-reply existant) ; lecture audio via Media3/ExoPlayer.

<details><summary>Sources iOS (8)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIMessageReplyTo.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIPostReplyTarget.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyContext.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyReference.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyReference+Capture.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyReference+Follow.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyReference+QuotedAudio.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ReplyReference+QuotedMedia.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`

### Un envoi transporte réponse, lieu, sticker, protection et pièces transférées sans doublon

`tpm-send-message-request` · Android : **partielle** · P0 · effort S

SendMessageRequest (corps de POST /messages) génère un clientMessageId cid_<uuid> stable pour la déduplication à l'ACK, et porte : contenu optionnel, langue d'origine, réponse (message, story, pièce citée par attachmentReplyTo), transfert (message, conversation, pièces à copier).

Écarts :
- Champs manquants dans SendMessageRequest Android : location (SharedPlace), copyAttachmentsFromMessageId, sticker, attachmentReplyTo ({attachmentId}), forwardedAttachmentIds, isEncrypted/encryptionMode.
- Sémantique éphémère #7451 : l'échéance naît de la réception de chaque destinataire ; n'envoyer que ephemeralDuration (+ bit ephemeral), jamais un expiresAt local.
- Vérifier le format du clientMessageId (cid_<uuid v4 minuscule>) et la réutilisation à l'identique lors d'un renvoi depuis l'outbox.
- Sérialiser les nouveaux champs dans OutboxModel pour que la file FIFO rejoue un envoi complet après reconnexion.

Transposition Android : Retrofit @Body + kotlinx.serialization ; WorkManager (OutboxFlushWorker) rejoue l'envoi.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SendMessageRequest.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/QuotedAttachmentSend.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Un envoi est une valeur typée : relation exclusive, pièces, protection, lieu, sticker, reçu et échecs expliqués

`tpm-send-outgoing-message-model` · Android : **partielle** · P0 · effort M

OutgoingMessage (conversationId, texte brut, relation, pièces {ids, previews}, protection, langue d'origine, clientMessageId réutilisé, lieu partagé, sticker) + MessageRelation (none \| reply(to, citing pièce) \| storyReply(to, reference) \| forward(of, from)) qui rend irreprésentables les combinaisons que le serveur ne comprend pas. SendAttemptContext fige clientMessageId, startedAt, intention de protection, langue et réutilisation de ligne ; SealedOutgoingPayload porte la requête et l'état de chiffrement. wireRequest construit le corps REST (effets, vue unique, flou, éphémère, chiffrement, lieu, sticker, attachmentReplyTo) ; offlineQueueItem (langue BRUTE) et retryQueueItem (langue RÉSOLUE). SendFailure : ineligible, offlineEnqueueFailed, writeRestricted, slowMode, recipientBlocked, queuedForRetry, retryEnqueueFailed ; SentMessageReceipt : acknowledged(serverId, at, transport) \| queuedOffline.

Écarts :
- SendMessageRequest Android n'a ni location (SharedPlace), ni sticker, ni attachmentReplyTo (QuotedAttachmentSend), ni isEncrypted/encryptionMode ; ajouter ces champs (envoi E2EE optionnel, fail-closed côté clair).
- Pas de type somme MessageRelation : remplacer replyToId/storyReplyToId/forwardedFromId indépendants par none | reply | storyReply | forward (+ citation de pièce, référence de story).
- Introduire OutgoingMessage (ConversationId, MessageId typés), OutgoingAttachments {ids nullable ≠ vide, previews pour la bulle optimiste} et la fabrique wireRequest/offlineQueueItem/retryQueueItem (langue brute vs résolue).
- Taxonomie SendFailure (inéligible, file hors ligne en échec, écriture restreinte, mode lent, destinataire bloqué, mis en file pour réessai) au lieu de messages d'erreur génériques ; SentMessageReceipt (acquitté via transport REST/socket ou mis en file).
- SendAttemptContext figé au début de l'envoi (intention de protection, langue détectée, clientMessageId réutilisé) et lu par chaque étape.

<details><summary>Sources iOS (7)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/OutgoingMessage.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/OutgoingMessage+Wire.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/MessageRelation.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/SendAttemptContext.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/SendFailure.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/SendResult+Acceptance.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/Send/SentMessageReceipt.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Message.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxModel.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxFlushWorker.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/ComposerSendGate.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/composer/SlowModePolicy.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SendLifecycleResolver.kt`

### Une vue unique ne montre rien tant qu'elle n'est pas ouverte, et se consomme à la sortie, pas au toucher

`tpm-view-once-seal` · Android : **partielle** · P0 · effort M

Le sceau (isViewOnceSealed, sealedForDisplay) retire le contenu du rendu (texte, légende, média, libellé d'accessibilité, téléchargement) tant que CE lecteur ne l'a pas ouverte (viewOnceOpenedAt, permanent et par personne). Le toucher RÉVÈLE, c'est la SORTIE qui consomme : fermeture du plein écran pour un média, sortie de la conversation pour un texte.

Écarts :
- Pas de sceau : ajouter holdsViewOnce (message ou pièce), isViewOnceSealed / isViewOnceOpened / sealedForDisplay et appliquer le sceau à TOUS les modes de lecture.
- viewOnceOpenedAt par lecteur (local + serveur) et openableViewOnceMedia (1re image/vidéo) absents.
- Moment de consommation : fermer le plein écran ⇒ consommer (média) ; quitter la conversation / onStop / verrouillage écran ⇒ consommer (texte).
- Affichage de la progression (viewOnceCount/maxViewOnceCount) et état « entièrement consommée » ; protectionFlags qui remonte le bit viewOnce d'une pièce au message.

Rendu : Bulle scellée : placeholder « 1 » cerclé + libellé localisé ; après ouverture : état consommé grisé sans contenu.

Transposition Android : Compose : Modifier retirant le contenu de la composition (pas un simple voile) ; Lifecycle observer (ON_STOP) pour la consommation du texte.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyMessage+ViewOnce.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ViewOnceConsumption.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConsumeViewOnceResponse.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BubbleRenderKind.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/BlurRevealLifecycle.kt`

### Un vocal dont la transcription n'était pas finie se met à jour tout seul

`tpm-audio-transcription-state-retry` · Android : **partielle** · P1 · effort S

extractAttachmentTranscriptions applique (forceOverwrite) transcriptions et pistes traduites des réponses REST par message ET par pièce (AttachmentAudioState) ; adoptAudioMetadata ne republie que les dictionnaires modifiés ; scheduleTranscriptionRetry (TranscriptionRetryScheduler) relance la lecture du message tant que Whisper n'a pas terminé.

Écarts :
- Relance de transcription (planificateur avec backoff borné) absente : un vocal reçu avant la fin de Whisper garde un état vide jusqu'au prochain événement.
- Garantir l'état par pièce jointe en plus de l'état par message (plusieurs vocaux dans un message).
- N'émettre un changement que pour les dictionnaires réellement modifiés (zéro re-render inutile).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Translations.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentTranscriptionMerge.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`

### Le fil de discussion ne montre un spinner bloquant que sur un premier chargement à froid

`tpm-chat-loading-phase` · Android : **partielle** · P1 · effort S

ConversationLoadingPhase (idle, loadingInitial, loadingOlder, loadingNewer, revalidating, loaded) projette les quatre booléens du ViewModel. Seul loadingInitial autorise un spinner bloquant ; loadingOlder/Newer gardent la liste visible derrière l'indicateur ; revalidating (rafraîchissement après un cache périmé) n'a qu'un indice discret (étincelle dans l'en-tête), jamais spinner ni squelette. Priorité en cas de chevauchement : initial > older > newer > revalidating.

Écarts :
- Android dérive l'état de showSkeleton/isLoadingOlder/isSyncing/errorMessage : introduire la phase mutuellement exclusive et la dériver (derive(isLoadingInitial, isLoadingOlder, isLoadingNewer, isRevalidating, hasObservedAnyData)).
- Pagination vers le bas (loadingNewer) lors d'un saut dans l'historique, la liste restant rendue.
- Indicateur discret de revalidation dans l'en-tête (jamais spinner quand le cache a des données).

Rendu : Squelette seulement à froid ; pagination = petit indicateur en haut/bas de liste ; revalidation = étincelle subtile dans l'en-tête.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/ConversationLoadingPhase.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatScreen.kt`

### Une communauté a ses rôles, ses permissions, ses conversations et son lien de partage canonique

`tpm-community-models` · Android : **partielle** · P1 · effort S

CommunityModels : CommunityRole = MemberRole, matrice CommunityPermissions.forRole (permissions par rôle), APICommunityUser (avec contour d'avatar servi, tolérant), APICommunityMember (rôle de communauté), APICommunityCount (champs plats émis par GET /communities car fast-json-stringify retire _count).

Écarts :
- Matrice CommunityPermission / forRole(role) absente ; rôle de membre de communauté (communityRole) et profileDecor des membres non décodés.
- Champs de comptage plats (memberCount, conversationCount) à lire en priorité sur _count ; MeeshyCommunity de domaine (emoji, couleur, thème, langue, bannière + thumbHash).
- CommunityLinkStats et URL de partage canonique /chat/<identifier>.
- Aucun écran communauté côté feature Android (modèles et API seulement) : liste, détail, membres, conversations — hors de cette partie mais bloquant.

Transposition Android : Retrofit/Room déjà en place ; écrans dans une feature à créer.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CommunityLinkModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyCommunity.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Community.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CommunityLink.kt`

### La conversation prend ma couleur d'accent personnelle, déclinée à ±30°, dans la liste et le fil

`tpm-conv-appearance-palette` · Android : **partielle** · P1 · effort S

colorPalette reste la palette CALCULÉE (langue 0,30 x type 0,30 x thème 0,40, secondaire +30°, accent −30°), encodée comme avant pour le cache et les anciens clients. L'accent PERSONNEL du lecteur (userState.appearance.accent, une gamme par schéma clair/sombre) ne s'y écrit jamais : displayPalette(scheme:) le résout à la lecture.

Écarts :
- Accent personnel (userState.appearance.accent par schéma clair/sombre) absent : ajouter AppearanceScheme et displayPalette(scheme) = accent choisi décliné à ±30°, sinon palette calculée.
- Persistance/écriture de l'accent via le user-state (PUT user-preferences) et mise à jour immédiate de la liste et du fil.
- ConversationColorPalette sérialisable (primary/secondary/accent/saturationBoost) lisible par les lignes de cache Room existantes et ignorant les clés inconnues.

Rendu : Toute surface en contexte de conversation utilise accentColor, jamais de couleur codée en dur.

Transposition Android : MeeshyTheme (sdk-ui) + Room ; isSystemInDarkTheme pour le schéma par défaut.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversation+Appearance.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationColorPalette+Codable.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/ConversationAccent.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/theme/DynamicColorGenerator.kt`

### L'index média d'une conversation se parcourt par genre : visuels, audio, documents, liens, contacts, conversations, lieux

`tpm-conv-media-kinds` · Android : **partielle** · P1 · effort M

ConversationMediaKind (visual, audio, document, link, contact, conversation, location) est le miroir de GENRES_DE_MEDIA (passerelle, view=media&kinds=) et de MEDIA_HUB_KINDS (web) : la passerelle sert des MESSAGES, un message peut porter des pièces de genres différents (photo + PDF).

Écarts :
- Galerie Android limitée aux visuels : ajouter les sept genres avec la partition MIME disjointe identique à la clause serveur.
- Requêtes GET /conversations/:id/messages?view=media&kinds=… (non présentes dans l'API Android) avec pagination curseur.
- Index persisté par genre (clé nue pour visuel, suffixée sinon) dans Room ; purge d'un message de tous les genres ; défaut visual.
- Onglets de la galerie (Médias, Audio, Documents, Liens, Contacts, Conversations, Lieux) avec états vide/chargement/erreur/hors ligne.

Rendu : Grille 3 colonnes pour visuels, liste pour les autres genres, onglets sous l'en-tête.

Transposition Android : Paging 3 + Room ; onglets Compose.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationMediaKind.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ConversationMediaGallery.kt`

### La ligne d'un message éphémère se recompose une fois par minute, puis à la seconde dans la dernière minute

`tpm-conv-preview-ephemeral-countdown` · Android : **partielle** · P1 · effort S

ConversationPreviewCountdown.nextChange(after: now, deadline) donne le prochain instant où la ligne change : frontières de minute entamée avant l'échéance (tolérance flottante 1 ms), puis l'échéance elle-même ; nil une fois passée (la ligne expirée ne se recompose plus). showsSeconds : sous le seuil du fil (EphemeralDeadline.countdownThreshold) le décompte se lit à la seconde, rendu par le système.

Écarts :
- Android classe EPHEMERAL_ACTIVE mais n'a pas la loi de réveil : porter nextChange/showsSeconds avec le seuil EphemeralDeadline.
- Planifier un réveil par ligne (au plus un par minute puis un à l'échéance, jamais chaque seconde) et basculer en « Message expiré » à l'échéance.
- Décompte à la seconde dans la dernière minute (ex. Chronometer/produce State borné à la ligne visible).

Rendu : Flamme/minuteur + « 4 min » dans la ligne, décompte à la seconde sous la dernière minute, puis « Message expiré » en italique.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationPreview/ConversationPreviewCountdown.swift`

</details>

Android existant : `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/MessageSummaryKind.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/EphemeralCountdownBadge.kt`

### Les actions d'une conversation (inviter, quitter, renommer, supprimer, appeler) suivent la loi par type et rang

`tpm-conversation-action-policy` · Android : **partielle** · P1 · effort M

ConversationActionPolicy.actions(for:) rend, pour un type de conversation (direct, group, public, global, broadcast) et un profil de lecteur, l'ensemble des actions permises : le direct n'a pas d'autorité, Global ne se renomme ni ne se quitte ni ne se supprime pour tous (seuls ADMIN/BIGBOSS y invitent).

Écarts :
- Android n'a que mayCurrentUserWrite (rang d'écriture + annonce) : porter ConversationActionPolicy (grille type x profil, vecteurs partagés ConversationActionPolicyVectorTests) pour piloter la feuille de réglages.
- viewerWriteRestriction (minor-global) absent du modèle de conversation et de la liste/détail/onboarding ; décodage tolérant d'une valeur inconnue ; détection du 403 GLOBAL_ADULTS_ONLY sur un envoi refusé.
- Composeur : bandeau de lecture seule avec explication quand la restriction ferme l'écriture ; conversation archivée/terminée : même bandeau.
- Rang effectif de ConversationViewerAuthority (casse pliée pour la conversation, lignes CREATOR héritées) réutilisé par les deux lois.

Rendu : Bandeau de lecture seule remplaçant le composeur : icône cadenas, texte court expliquant la raison (18 ans pour Global).

Transposition Android : Logique pure Kotlin + états Compose du composeur.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationActionPolicy.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationWriteRestriction.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationWriteAdmission.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationSettingsForm.kt`

### Répondre à une story ou une humeur ouvre la discussion directe avec son auteur, composer prêt

`tpm-dm-direct-conversation-resolver` · Android : **partielle** · P1 · effort S

DirectConversationResolver : la dernière conversation DIRECTE avec un utilisateur (findDirectWith) sinon une neuve (create type direct) puis getById. Site unique partagé par la réponse amorcée (Router.navigateToStoryReply) et la réponse envoyée depuis la page plein écran d'une humeur (#10814), pour ne jamais choisir deux conversations différentes pour un même auteur.

Écarts :
- Pas de findDirectWith(userId) côté dépôt : chercher d'abord dans le cache Room (type direct, participant) puis via l'API avant de créer.
- Résolveur unique appelé par la réponse à une story, à une humeur et par le bouton Message d'un profil/contact.
- Naviguer vers le chat avec le composer préparé (citation de la story/humeur).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/DirectConversationResolver.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/ConversationRepository.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/NewConversationLogic.kt`

### L'auteur choisit flamme-œil ou une durée, et l'intention voyage jusqu'au bout de l'envoi multi-messages

`tpm-ephemeral-composer-choice` · Android : **partielle** · P1 · effort S

EphemeralDuration (15 s, 30 s, 1 min, 5 min, 1 h, 24 h) et EphemeralChoice (flamme-œil sans durée en tête, puis les durées ; valeur de brouillon 0 = flamme-œil, secondes sinon).

Écarts :
- Choix flamme-œil (afterRead) absent de l'éditeur/sélecteur d'effets Android ; stockage de brouillon 0 = flamme-œil à ajouter à DraftAutosave.
- MessageProtectionIntent : valeur unique armée au tap et transportée à chaque message produit par l'envoi (spec multi-pièces).
- Vocabulaire visuel unique : icônes flamme / 1 cerclé / œil barré (versions pleines pour l'état actif) partagées entre barre du composeur, feuille d'effets.
- Refuser une durée non positive ; plafond de vues optionnel ; l'intention ne porte aucune date.

Rendu : Rangée de puces : œil-flamme, 15 s, 30 s, 1 min, 5 min, 1 h, 24 h.

Transposition Android : Compose : feuille d'effets existante (MessageEffectsPicker) à étendre.

<details><summary>Sources iOS (4)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralDuration.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralChoice.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageProtectionIntent.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageProtection.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsEditor.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectsPicker.kt`

### Demandes d'ami, acceptation et relation s'affichent identiquement partout (profil, mention, découverte)

`tpm-friend-relationship` · Android : **partielle** · P1 · effort S

FriendRequest / FriendRequestUser (cache-first), SendFriendRequest et le corps canonique de PATCH /directory/friend-requests/{id} portant une ACTION (un geste, un verbe). UserRelationshipState : source de vérité unique combinant amitié et blocage (self, blocked, friend, pendingSent, pendingReceived, none).

Écarts :
- Android PATCH friend-requests/{id} (alias legacy) : migrer vers PATCH /directory/friend-requests/{id} avec FriendRequestAction (accepter, refuser, annuler…).
- FriendRequestUser sans profileDecor (contour) ; décodage tolérant de la demande.
- Vérifier l'équivalence de UserRelationshipState (6 cas) et son usage sur toutes les surfaces (Découvrir, contacts, fiche, mentions).

Transposition Android : Retrofit ; resolver synchrone sur caches Room/mémoire.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/FriendModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserRelationshipState.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Friend.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRelationshipState.kt`

### Un invité par lien ne peut joindre que les familles de fichiers autorisées par le lien

`tpm-guest-session-attachment-allowance` · Android : **partielle** · P1 · effort S

AnonymousSessionContext (token de session, participantId, permissions durcies, linkId, conversationId) porte en plus allowedAttachmentKinds (#10001, #10006), optionnel au décodage : nil = le lien ne restreint rien, le serveur reste juge. attachmentAllowance (GuestAttachmentAllowance) pilote ce que le composer d'invité propose. toSessionContext durcit : seules les permissions messages/fichiers/images du serveur sont crues ; vidéos, audios, lieux et liens sont refusés.

Écarts :
- Ajouter allowedAttachmentKinds (nullable, par défaut null pour relire une session enregistrée avant) et GuestAttachmentAllowance (kinds) à AnonymousSessionContext ; le remplir depuis conversation.attachmentAllowance.kinds de la réponse de jonction.
- Le composer d'invité ne propose que les familles autorisées (photo, vidéo, audio, fichier, lieu, lien).
- Persister le champ dans AnonymousSessionStore.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/AnonymousSessionContext.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AnonymousSession.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/session/AnonymousSessionStore.kt`

### Un lien s'affiche comme l'auteur l'a écrit : brut, libellé, ou jeton court m+…

`tpm-link-display-law` · Android : **partielle** · P1 · effort S

LinkDisplayLaw : la forme écrite décide du rendu — [[https://x]] affiché tel quel et ouvert en direct sans suivi pour tous ; [libellé](https://x) affiché libellé, cible /l/<token> si la carte de liens suivis l'a, sinon directe ; https://x brut affiché m+<token> (cible /l/<token>) si la carte l'a, sinon direct ; m+<token> historique.

Écarts :
- MessageTextParser gère m+TOKEN → https://meeshy.me/l/TOKEN mais pas la loi complète : syntaxe [[url]] (direct, sans suivi), [libellé](url), affichage m+token pour une URL brute présente dans trackedLinkMap.
- Décoder trackingLinks / metadata.trackingLinks du message (carte url→token) et la passer au parseur ; l'origine web dépend de l'environnement (prod/staging/local).
- Cas verbatim : e-mails jamais suivis ; cible directe quand la carte n'a pas le jeton.

Rendu : Lien suivi affiché comme jeton court m+abc123 en couleur de lien du thème ; tap ouvre l'aperçu puis le navigateur (Custom Tabs).

Transposition Android : AnnotatedString + ClickableText/LinkAnnotation ; ServerEnvironmentStore déjà présent pour l'origine web.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/LinkDisplayLaw.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageTextParser.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatLinkOpener.kt`

### Les notifications et leurs actions parlent la langue de l'application, pas celle de l'appareil

`tpm-notif-interface-language` · Android : **partielle** · P1 · effort S

L'app publie le code de langue de son interface dans le groupe d'app (clé meeshy.interface.language) pour ses extensions, qui tournent dans un autre processus. InterfaceLanguageResolver.localization choisit : langue publiée si le bundle la porte, sinon langues de l'appareil dans l'ordre, sinon le bundle tel quel (correspondance exacte puis base de langue, « Base » écarté). Une seule fonction pour l'app et ses deux extensions (NSE, contenu).

Écarts :
- La langue d'interface Android ne localise que l'arbre Compose (createConfigurationContext dans MainActivity) : le FirebaseMessagingService, les canaux, les actions de notification et les widgets Glance lisent getString() avec la langue de l'appareil. Fournir un contexte localisé par InterfaceLanguageStore.
- Porter la sélection pure localization(published, available, devicePreferred) (exact puis base de langue) et la rendre disponible sans UI.
- Couvrir les sept langues (ar, de, it manquent ; seuls en/fr/es/pt existent).

Transposition Android : App Group UserDefaults → DataStore lu par le service FCM (même processus) ; ressources Locale via Context.createConfigurationContext.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Notifications/InterfaceLanguageResolver.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/language/InterfaceLanguageStore.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/theme/LanguageViewModel.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/MainActivity.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`

### Seules les notifications que j'ai autorisées sonnent : type, silence, mode Focus et bannière in-app

`tpm-notification-preferences-gating` · Android : **partielle** · P1 · effort S

NotificationPreferences (4 interrupteurs légers) et UserNotificationPreferences+Filter : allowsNotification(type, isDirectConversation, focus, now) = push actif ET hors fenêtre Ne pas déranger (jours + heures, fenêtre qui passe minuit, décalage UTC local) ET type activé ET autorisé par le Focus.

Écarts :
- Préférences manquantes : contactActivityEnabled (contact_recently_active), gameEnabled (jeux), dndUtcOffsetMinutes (fenêtre DND exprimée dans l'heure LOCALE de l'utilisateur, 0 = UTC historique).
- isTypeEnabled à compléter pour contact_joined (⇒ contactRequestEnabled), contact_recently_active, game_*, report_resolved et content_removed (toujours true, DSA).
- allowsNotification : ordre pushEnabled → DND → type → Focus ; fenêtre DND qui franchit minuit et filtre des jours ; allowsInAppBanner séparé (type seul).
- Mapping du Focus iOS vers l'équivalent Android : mode Ne pas déranger / filtre d'interruption (NotificationManager.getCurrentInterruptionFilter) pour FocusFilterSnapshot.isActive.
- NotificationPreferences léger (pushEnabled, messageNotifications, socialNotifications, soundEnabled) : vérifier l'usage ou le retirer.

Transposition Android : NotificationManager.currentInterruptionFilter ; DataStore ; canaux de notification Android par catégorie.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/NotificationPreferences.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserNotificationPreferences+Filter.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/NotificationTypeToggle.kt`

### La fiche d'un membre dit son rôle, ses droits d'entrée et ce qu'il peut voir de l'historique

`tpm-participant-profile-rights` · Android : **partielle** · P1 · effort M

ConversationParticipantProfile (fiche servie à tout membre, champs sensibles seulement à l'hôte) : rôle de conversation, arrivée, présence soumise à la loi de visibilité, nom du lien d'entrée, e-mail/anniversaire fournis ou non.

Écarts :
- Événement socket participant:rights-updated et ses résultats (ParticipantRightsUpdateResult, ParticipantHistoryGrantUpdateResult, updatedBy, carriesHistoryGrant) absents.
- canViewHistory doit rester optionnel (nil ≠ false) : un Bool non optionnel fait échouer le décodage de la charge réduite diffusée à la room.
- Participant paginé : type (user/anonymous/bot) pour distinguer un visiteur sans compte, bannière résolue, totalCountCapped, effectiveRole, contour d'avatar, nilIfEmpty/resolvedAvatar.
- Libellés des refus (Capability.denied/disclosed) dans un ordre stable, historique en tête.
- Lien d'entrée : ParticipantEntryLink complet (requireNickname/Email/Birthday, allowedCountries/Languages).

Rendu : Fiche en bottom sheet : avatar, nom, rôle, droits en puces (refusés d'abord), lien d'entrée en pied.

Transposition Android : Socket.IO + Room ; feuille modale Compose existante.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationParticipantProfile.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/ParticipantModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MemberRole.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationParticipantProfile.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Participant.kt`

### Les préférences de compte, catégories et réglages par conversation se lisent en cache d'abord et se synchronisent

`tpm-preference-service` · Android : **partielle** · P1 · effort M

PreferenceService (cache-first SWR : loadCached/revalidate/persist pour catégories, tags de conversation, toutes les préférences, préférences d'une conversation) : catégories (GET, création, patch isExpanded), préférences par conversation (GET/PUT), réorganisation des conversations (reorder avec orderInCategory), toutes les préférences utilisateur (GET /me/preferences), patch et reset par catégorie (privacy, audio, message, notification, video, document, application) et tags de conversation de l'utilisateur.

Écarts :
- PreferencesApi Android ne couvre que catégories (GET/POST) et notification/privacy : ajouter GET /me/preferences (toutes) et PATCH/DELETE (reset) génériques pour audio, message, video, document, application.
- Patch de catégorie isExpanded (pli persisté) et reorder des conversations (updates [conversationId, orderInCategory]) – Android n'expose aucun geste de réorganisation.
- GET des tags de conversation de l'utilisateur (getMyConversationTags) avec cache-first (SWR) ; préférences d'une conversation en lecture seule (GET) en plus du PUT.
- Schéma cache-first (loadCached/revalidate/persist) pour les quatre ressources, sans spinner quand le cache a des données.

Rendu : Sections de catégories repliables avec état persisté ; réorganisation par glisser.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/PreferenceService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PreferencesApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/preferences/PreferencesSyncCoordinator.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/category/CategoryRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ConversationApi.kt`

### Mes préférences (confidentialité, audio, messages, notifications, vidéo, documents, application) se synchronisent avec le serveur

`tpm-preferences-aggregate` · Android : **partielle** · P1 · effort S

PreferenceModels : agrégat UserPreferences en sept catégories avec enums.

Écarts :
- PrivacyPreferences : utiliser le champ canonique acceptCallsFromNonContacts (Android lit l'alias legacy allowCallsFromNonContacts) et ajouter notifyContactsOnReturn.
- UserNotificationPreferences : ajouter contactActivityEnabled, gameEnabled, dndUtcOffsetMinutes.
- ApplicationPreferences : horodatages de consentement dataProcessingConsentAt, voiceDataConsentAt, voiceProfileConsentAt, voiceCloningConsentAt, voiceCloningEnabledAt.
- Décodage tolérant par champ (défaut statique si absent ou de type inattendu) et conservation des clés inconnues dans extras.
- Vérifier l'égalité des enums et de leurs valeurs par défaut avec packages/shared/types/preferences/*.

Transposition Android : kotlinx.serialization JsonElement pour extras ; DataStore + PreferencesSyncCoordinator existants.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/PreferenceModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Preferences.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/preferences/PreferencesSyncCoordinator.kt`

### Traduire un message (texte ou vocal) à la demande, le chargement survivant à la fermeture de la feuille

`tpm-prism-on-demand-translation` · Android : **partielle** · P1 · effort M

Depuis la vue Langue du menu, requestTextTranslation appelle POST translate-blocking {text, source_language, target_language, message_id} et fusionne MessageTranslation (id « msg-lang », modèle on-demand) puis l'active. requestAudioTranslation appelle POST /attachments/:id/translate (targetLanguages, sourceLanguage, generateVoiceClone), fusionne les pistes traduites et bascule piste, karaoké et drapeau. Les drapeaux en cours vivent dans le ViewModel ; un échec émet translationRequestFailed ; un 403 de consentement (AUDIO_TRANSLATION_NOT_ENABLED) a son message ; fail-closed E2EE via ServerTranslationAdmission.

Écarts :
- TranslateRequest Android n'envoie pas message_id (iOS le transmet pour rattacher la traduction au message).
- Traduction AUDIO à la demande absente : aucun POST /attachments/{id}/translate ni AttachmentTranslateRequest/Response (status, jobId, translations[id, targetLanguage, translatedText, audioUrl, durationMs, voiceCloned]) ; ajouter l'API, le drapeau translatingAudioLanguages, la fusion de pistes et la bascule de piste (canal unique de langue de bulle).
- Erreur de consentement 403 (AttachmentConsentError : code, message, requiredConsents) : message dédié et renvoi vers les réglages de traduction audio.
- Événement d'échec (translationRequestFailed) : snackbar localisée par langue et nature ; aujourd'hui l'échec est silencieux.
- Garde E2EE fail-closed (ServerTranslationAdmission) : jamais de texte clair d'une conversation chiffrée vers le serveur ; proposer la traduction sur l'appareil.
- Id local « messageId-langue » et modèle on-demand pour distinguer d'une traduction serveur.

Rendu : Chip de langue traduisible → indicateur de chargement sur la chip tant que la requête vit, y compris si la feuille est fermée puis rouverte ; à l'arrivée la bulle bascule sur la langue.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/TranslationService.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Translations.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/translation/TranslationRepository.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/TranslationApi.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatViewModel.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AttachmentAudioTranslationMerge.kt`

### Un vocal de post, de commentaire ou de réel se joue dans la piste traduite de la langue du lecteur

`tpm-prism-social-audio-track` · Android : **partielle** · P1 · effort M

SocialAudioTrack projette AudioTrackLanguageResolver (la loi) vers six surfaces sociales listées dans un enum fermé (feedPostCard, postDetail, comment, reel, audioFullscreen, repostLegacyAudio sans piste). Il lit le prisme du lecteur, prend comme langue d'origine celle de la TRANSCRIPTION (Whisper) avant celle du porteur, pose la sentinelle « orig » pour le plein écran et élit la piste à l'ouverture (init, pas onAppear). La piste suit la langue du texte servi.

Écarts :
- Android ne résout la piste que dans la bulle de chat : les modèles feed, commentaire et réel ne portent ni transcription ni translatedAudios (FeedPostMedia n'a aucun média audio).
- Ajouter une projection SocialAudioTrack qui appelle la MÊME fonction que le chat (aucune boucle réécrite).
- Plein écran audio : élire la piste à l'ouverture, avec la sentinelle « orig » pour l'original.
- Langue d'origine = transcription.language prioritaire sur la langue du texte du post ; chaîne vide en dernier ressort.
- Déclarer les surfaces en enum fermé avec garde de test (carriesTranslatedTracks).

Rendu : Puces de langue sous le lecteur audio plein écran ; la piste servie est présélectionnée, pas de saut visible.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/SocialAudioTrack.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContentBuilder.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/audio/AudioTrackSurface.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TranscriptionKaraokeResolver.kt`

### Un message déjà vu s'ouvre directement dans la bonne langue, sans second temps

`tpm-prism-translation-hydration` · Android : **partielle** · P1 · effort S

Les traductions texte arrivent par les réponses REST, le CacheCoordinator et GRDB ; MessageTranslationMerge ne retient que les langues du prisme du lecteur (borne mémoire) et remplace par langue cible. hydratePersistedTranslations pré-hydrate les 80 messages récents AVANT l'affichage du fil. invalidateTranslations évince quatre caches (dictionnaire, résolution, override manuel, ids temporaire et serveur) et purge la base quand le contenu est édité.

Écarts :
- Le fusionneur Android accepte toute langue : ajouter le filtre par prisme du lecteur.
- Convertir les traductions REST avec sourceLanguage = source ?? originalLanguage ?? « auto », en conservant translationModel et confidenceScore (absents du fusionneur Android).
- Éviction à l'édition (message:edited) : supprimer traductions Room, traductions mémoire, résolution en cache et override manuel pour l'id temporaire ET l'id serveur ; servir l'original jusqu'à la prochaine message:translation.
- Lire les traductions des ~80 messages récents en même temps que la page de messages pour que la première image soit déjà traduite (cache-first, aucun clignotement original→traduit).
- Hydrater en deux temps (cache mémoire puis Room) seulement pour les ids non couverts, afin de ne pas ré-injecter un texte périmé.

Rendu : Aucun spinner ni clignotement : le premier rendu applique déjà le prisme.

<details><summary>Sources iOS (3)</summary>

- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/ConversationTranslationSource.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/Conversation/MessageTranslationMerge.swift`
- `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel+Translations.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageTranslationMerge.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageCacheSource.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/conversation/MessageRepository.kt`

### Les corps de requêtes et réponses du SDK (conversation, réaction, post, commentaire, story, recherche, statut de pièce) sont identiques à ceux d'iOS

`tpm-service-wire-models` · Android : **partielle** · P1 · effort S

ServiceModels regroupe les modèles de fil : CreateConversationRequest/Response, AddReactionRequest, MobileTranscriptionSegment/Payload (transcription faite sur l'appareil, Codable pour survivre à la file durable), CreatePostRequest (visibilityUserIds, storyEffects, allowSoundExtraction, mentions PostMentionInput, mediaCaption, discoverabilityPrecision…), UpdatePostRequest avec PostLocationUpdate tri-état, Create/UpdateCommentRequest, LikeRequest, CreateStoryRequest, UpdateConversationPreferencesRequest, ConversationCategory, UserSearchResult, AttachmentStatusUser, TranscribeRequest(force), Attachment translation.

Écarts :
- CreatePostRequest Android n'a pas visibilityUserIds, storyEffects, allowSoundExtraction, mentions (PostMentionInput), mediaCaption ni discoverabilityPrecision.
- UpdatePostRequest : PostLocationUpdate tri-état (inchangé, effacé, défini) absent.
- AttachmentStatusUser (qui a reçu/lu/écouté une pièce) et TranscribeRequest(force) absents.
- Corps de la requête de traduction audio (voir tpm-prism-on-demand-translation) et message_id du TranslateRequest.
- Vérifier les noms de champs contre le gateway (Zod) pour chaque type et garder les corps compatibles avec les anciens clients.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/ServiceModels.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/PostApi.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ReactionApi.kt`, `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/UserApi.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Conversation.kt`

### Éditer mon profil et voir celui d'un autre : langues valides, compteurs de contenu, présence et relation à la demande

`tpm-user-profile-requests` · Android : **partielle** · P1 · effort S

UpdateProfileRequest (PATCH profil) valide les codes de langue (base 2 lettres depuis fr-FR) et distingue « champ inchangé » (nil, omis) de « champ effacé » (chaîne vide, envoyée telle quelle : customDestinationLanguage accepte '' pour effacer), changement d'e-mail/téléphone (demande + vérification + renvoi).

Écarts :
- UserStats Android n'a pas postsCount, reelsCount, storiesCount (bandeau Postes/Réels/Stories du profil) : ajouter les trois compteurs, nil tant que la passerelle ne les sert pas.
- Validation de langue (validateLanguageCode : base 2 lettres) et sémantique nil vs chaîne vide pour customDestinationLanguage dans UpdateProfileRequest ; voicePublic absent.
- ProfileExpansion (stats | presence | relation) sur GET /directory/people/:handle avec ProfilePublic distinct du modèle de domaine (relation/stats calculées par lecteur).
- Présence et compteurs intimes strictement soumis à la loi de visibilité (rien d'affiché si non servi).

Transposition Android : Retrofit @Query expand ; data classes séparées domaine/réponse.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/UserModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/PublicProfileModels.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/StatsModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/UserRequests.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Stats.kt`

### Chaque écriture a une clé d'idempotence valide, jamais un id local envoyé au serveur, et des dates au format du fil

`tpm-util-client-ids-and-wire-dates` · Android : **partielle** · P1 · effort S

ClientMessageId (cid_<uuid v4 minuscule>, regex du gateway) et ClientMutationId (cmid_<uuid>) ; ClientMutationId.derived(from:) dérive une clé STABLE d'une graine (SHA-256, bits version/variante) – une story rejouée depuis sa file rend la même clé (storySlide(queueItemId, slideId)), le MutationLog du gateway reconnaît le doublon (#10321). ObjectID.isValid (24 hex) garde la frontière : un id local (cid_, cmid_, pending_) ne part jamais vers une route qui attend un ObjectId (Prisma P2023 → 500, #4044). WireDate écrit toujours ISO 8601 complet en UTC à millisecondes (arrondi vers le BAS sous la milliseconde) et relit avec ou sans fractions.

Écarts :
- OutboxIds génère cid_/cmid_ mais ne valide pas : ajouter isValid avec les regex exactes (cid ...-4xxx-[89ab]xxx, cmid) et des tests contre le format du gateway.
- Clé d'idempotence DÉRIVÉE (graine → cmid_ stable) pour rejouer une story ou toute publication sans doublon.
- Garde ObjectID.isValid avant d'écrire dans l'outbox : une mutation que le serveur ne peut pas adresser (id local) ne doit pas y pourrir (retentée 5 fois puis épuisée).
- WireDate : sérialisation UTC ms avec arrondi vers le bas pour les watermarks de sync, lecture tolérante avec/sans fractions ; remplacer les usages dispersés de IsoTimestamps.

<details><summary>Sources iOS (5)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMessageId.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMutationId.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/ClientMutationId+Derived.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/ObjectID.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/WireDate.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/outbox/OutboxIds.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/util/IsoTimestamps.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/IsoTime.kt`

### La langue d'origine d'un message est détectée sur l'appareil avant l'envoi

`tpm-util-language-detection` · Android : **partielle** · P1 · effort S

LanguageDetection.detectLanguageCode(for:fallback:) : au moins 4 lettres, NLLanguageRecognizer, confiance minimale 0,65 sur la langue dominante, sinon la langue de repli normalisée ; résultat ISO 639-1 normalisé via MeeshyUser.normalizeLanguageCode. Fixe originalLanguage à l'émission.

Écarts :
- Android utilise une heuristique par regex (script + mots vides) bornée aux langues de LanguageData : remplacer ou compléter par ML Kit Language Identification (on-device, seuil de confiance 0,65) pour détecter toute langue, avec la même garde de 4 lettres.
- Conserver l'heuristique comme repli JVM pur-testable ; retirer les URL avant détection.
- Tests de parité sur des phrases courtes ambiguës (repli sur la langue de l'expéditeur).

Transposition Android : NLLanguageRecognizer → ML Kit LanguageIdentification (confidenceThreshold 0.65).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/LanguageDetection.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/ComposeLanguageDetector.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/lang/LanguageCodeNormalizer.kt`

### Les horodatages relatifs sont identiques partout : court dans les listes, long dans les détails, date et heure en sous-titre de notification

`tpm-util-relative-time-formatters` · Android : **partielle** · P1 · effort S

RelativeTimeFormatter (décision 2026-06-13) : style court (maintenant, 45s, 5 min, 2h, 3j, 2sem, 2 mois) pour listes, long (il y a 45s, hier, il y a 3j…) pour détails, date absolue localisée au-delà de trois mois ; lastSeenString ajoute l'heure HH:mm aux formats absolus > 24 h et dit « En ligne » sous une minute. NotificationDateFormatter (2026-06-23) dit QUAND le contenu lié a été publié dans le sous-titre d'une notification : à l'instant, il y a 6 min, il y a 3 h, hier 14:30, puis date + heure absolues locales (clés notification.date.*).

Écarts :
- NotificationDateFormatter absent : sous-titre de notification (à l'instant / il y a N min / il y a N h / hier HH:mm / date + heure locales) selon le calendrier du lecteur.
- lastSeenString : « En ligne » sous une minute et heure HH:mm ajoutée aux formats absolus > 24 h (contrat web formatPresenceLabel) ; Android porte lastSeenEpochMillis sans ce libellé.
- Vérifier l'équivalence du court/long (seuils RelativeTime.classify) avec iOS sur les vecteurs, et les libellés des sept langues (ar, de, it).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/RelativeTimeFormatter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/NotificationDateFormatter.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/time/RelativeTime.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/time/RelativeTimeLongLabel.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/format/RelativeTimeFormat.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/format/RelativeTimeLongText.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/format/AbsoluteDateFormat.kt`, `apps/android/feature/notifications/src/main/kotlin/me/meeshy/app/notifications/NotificationRowTime.kt`

### On voit qui a l'écran de la conversation ouvert, qui y est actif, et qui est en train d'écrire

`tpm-viewers-typing-presence` · Android : **partielle** · P1 · effort M

ConversationViewers (viewing:start / stop / snapshot / activity) : chaque socket est dans toutes ses rooms, donc la liste sait qui est dans chaque conversation sans l'avoir ouverte ; ConversationHere dit absente / ICI / ICI et actif (défile, écoute, agit) / plein écran sur un élément ; le point pulse quand actif.

Écarts :
- TypingParticipant existe (userId, nom, avatar) : ajouter le contour d'avatar résolu localement et vérifier la résolution d'avatar depuis les messages en mémoire (aucune requête).
- Événements viewing:start, viewing:stop, viewing:snapshot, viewing:activity absents du SocketManager Android : modèle ConversationViewers immuable (état par conversation, isHere, isActive, users(in:)).
- ConversationHere / ConversationHereRoster : état à 3 niveaux et point qui pulse ; affichage dans les lignes de la liste de conversations (avatars « ici ») ; extinction de l'activité quand elle se tait.
- Visibilité de la présence limitée aux amis acceptés/soi/ADMIN : respecter l'absence de donnée (aucun point) sans la fabriquer.

Rendu : Point de présence vert qui pulse quand l'interlocuteur est ICI et actif ; statique s'il est seulement ici.

Transposition Android : Socket.IO client Android (SocketManager) + StateFlow immuable par conversation ; pulse via infiniteTransition.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/ConversationViewers.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/TypingParticipant.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/Typing.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/TypingPresenceFold.kt`

### Mes liens d'affiliation montrent combien de filleuls ont rejoint et qui ils sont

`tpm-affiliate-models` · Android : **partielle** · P2 · effort S

AffiliateToken (jeton, lien, usages max/actuels, actif, expiration, clics, _count.affiliations → referralCount), AffiliateStats (jetons, parrainages, visites, taux de conversion, terminés/en attente, liste des filleuls).

Écarts :
- Affiliate.kt Android ne couvre pas AffiliateReferral, ReferredUser, resolvedName, ni les champs de AffiliateStats (referrals, completedReferrals, pendingReferrals, conversionRate).
- Aucun écran Affiliation (liste de liens, création, onglet Affiliés) ni endpoint dans core/network ; le filtre ContactFilter.Affiliates de la liste de contacts n'est pas branché.
- Partage du lien via Intent ACTION_SEND ; présence du filleul soumise à la loi de visibilité (isOnline seulement si servi).

Transposition Android : Retrofit ; Intent ACTION_SEND.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/AffiliateModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Affiliate.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/friend/ContactList.kt`

### Les résultats de recherche dans une conversation disent pourquoi ils correspondent (contenu ou traduction)

`tpm-chat-search-result-item` · Android : **partielle** · P2 · effort S

SearchResultItem (id, conversationId, content, matchedText, matchType content\|translation, senderName, senderAvatar, createdAt). buildSearchResult privilégie le contenu d'origine, puis montre l'extrait traduit quand seule une traduction correspond (l'utilisateur voit pourquoi même s'il ne parle pas la langue d'origine). Recherche côté serveur paginée par curseur (hasMore) ; un échec transitoire laisse la page en place.

Écarts :
- Android cherche seulement dans les messages en cache (texts[] original + traduction) et renvoie des ids : ajouter la recherche serveur paginée par curseur pour dépasser la fenêtre chargée.
- Modèle de résultat avec matchedText, matchType, expéditeur, avatar, date ; liste de résultats affichant l'extrait traduit.
- Priorité au contenu d'origine puis à la première traduction qui correspond ; repli défensif sur le contenu.

Rendu : Ligne de résultat : avatar, nom, extrait surligné, mention discrète « traduction » quand le match vient d'une traduction.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Models/MessageModels.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ChatSearch.kt`

### Déposer ou coller un fichier, une image ou un texte dans le composer l'ajoute au bon pipeline

`tpm-composer-drop-ingest` · Android : **partielle** · P2 · effort M

ComposerDropResolver résout un NSItemProvider (dépôt ou collage) : 1) représentation fichier copiée synchronement dans la closure (seule fenêtre d'accès) ; 2) données pour une image sans fichier ; 3) texte ou URL (une URL web devient du texte). Refus : dossier, fichier de 0 octet, provider vide. ComposerIngestRouter classe le MIME (image/*, video/*, audio/*, sinon fichier, insensible à la casse, octet-stream compris). ComposerMediaProbe lit la durée réelle (vidéo/audio) pour qu'une vidéo de 10 s qualifie un RÉEL (≥ 3 s) et retombe sur MimeTypeResolver quand le UTType n'a pas de MIME (.caf, .opus). FileURLPasteDetector retire les URLs file:// collées. Le nom d'origine prime sur le nom fabriqué par le système.

Écarts :
- Aucun dépôt glisser-déposer (tablette, multi-fenêtre, ChromeOS) : Modifier.dragAndDropTarget avec lecture du ClipData.
- Aucun contenu riche du clavier (GIF, stickers, images Gboard) : contentReceiver / ReceiveContentListener sur le champ.
- Routeur MIME → pipeline unique image/vidéo/audio/fichier (insensible à la casse, vide ou octet-stream ⇒ fichier) partagé par tous les hôtes du composer.
- Copie immédiate dans le cache applicatif (les permissions URI expirent), nom d'origine via OpenableColumns.DISPLAY_NAME, refus d'un dossier ou d'un fichier de 0 octet, nom et extension rattachés.
- Sonde de durée (MediaMetadataRetriever) pour vidéo/audio, exigée par la règle POST/REEL ≥ 3 s ; MIME de repli par extension.
- Détecteur de collage d'URLs file:// (décodage du pourcentage, faux positifs ignorés, texte nettoyé).

Rendu : Surbrillance de la bande du composer pendant le survol, puces d'aperçu des pièces ajoutées, aucune barrière modale.

Transposition Android : NSItemProvider/onDrop → DragAndDropEvent + ClipData ; Share Extension déjà couverte par ShareTargetActivity (ACTION_SEND).

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Components/ComposerDropResolver.swift`

</details>

Android existant : `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentTray.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ComposerAttachmentLadder.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ClipboardContent.kt`, `apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/LargePasteDetector.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MimeTypeResolver.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/ShareTargetActivity.kt`

### Les effets de message et la combustion d'un éphémère s'animent, et se simplifient en « réduire les animations »

`tpm-message-effects-burn` · Android : **partielle** · P2 · effort S

MessageEffectFlags (cycle de vie, apparition one-shot, persistant) + MessageEffectPlan (reduceMotion : aucun effet d'apparition, seuls glow et rainbow persistants et sans animation). RainbowSweep : comète le long du périmètre. EphemeralBurn : la destruction d'un éphémère se voit, la ligne attend la fin de l'animation.

Écarts :
- Bit ephemeralAfterRead (1<<3) absent de MessageEffectFlags/LIFECYCLE_MASK.
- EphemeralBurn : durée de combustion partagée entre la vue qui anime et l'hôte qui retire la ligne (sinon trou ou disparition à mi-combustion) ; mode reduceMotion = fondu court.
- RainbowSweep : géométrie pure (arc défini en fraction du périmètre, plateau de repos dominant) à vérifier/porter si le rainbow Android tourne en spectre.
- Respecter Settings.Global.ANIMATOR_DURATION_SCALE == 0 comme « réduire les animations » pour tous les effets.

Rendu : Combustion de la bulle ~1 s ; comète arc-en-ciel sur le contour avec longue pause ; reduce-motion : simple fondu court.

Transposition Android : Compose Canvas/graphicsLayer, Animatable ; PathMeasure pour l'arc de périmètre.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MessageEffects.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/RainbowSweep.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/EphemeralBurn.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffects.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MessageEffectRenderPlanner.kt`

### Glisser vers le haut, la gauche ou la droite écarte la bannière de story en attente

`tpm-story-pending-banner-dismiss` · Android : **partielle** · P2 · effort S

PendingBannerDismissResolver décide si un glissement ferme la bannière inline (PendingStoryBannerInline) : écart horizontal > 24 pt ou vertical vers le haut < −24 pt ; le glissement vers le bas est ignoré (réservé).

Écarts :
- Android montre la story en attente comme story optimiste du rail et une bande d'échec, sans bannière écartable par glissement : ajouter la règle pure shouldDismiss(dx, dy, seuil 24dp) et le geste sur la bannière.
- Ignorer explicitement le glissement vers le bas.

Rendu : Bannière inline qui suit le doigt puis s'efface ; seuil 24 pt/dp.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Views/PendingBannerDismissResolver.swift`

</details>

Android existant : `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryTray.kt`, `apps/android/feature/stories/src/main/kotlin/me/meeshy/app/stories/StoryOptimisticTray.kt`

### Les noms trop longs sont coupés à 16 caractères, les pays ont leur drapeau et les durées s'écrivent M:SS

`tpm-util-display-primitives` · Android : **partielle** · P2 · effort S

DisplayName.truncated borne un nom d'utilisateur affiché à 16 graphèmes avec ellipse, espaces de fin retirés avant l'ellipse (directive 2026-07-30, en-tête de story, barre d'identité des bulles) ; CountryFlag.emoji convertit un code ISO-3166-1 alpha-2 en drapeau (indicateurs régionaux) et name(for:) donne le nom localisé ; DurationFormat.wholeSeconds/clock écrit « 2:05 » avec minutes cumulées, chiffres latins, valeurs non finies ou négatives ⇒ 0.

Écarts :
- Aucune borne de 16 graphèmes sur les noms (en-têtes de story, identité de bulle) : ajouter DisplayName.truncated (BreakIterator) à la source.
- CountryFlag.emoji (offset 127397, deux lettres ASCII) et nom localisé via Locale.getDisplayCountry.
- DurationFormat centralisé (wholeSeconds borné Int32, clock M:SS, minutes cumulées) au lieu de formats « %d:%02d » dispersés (BubbleContent, MagicLinkCountdown…).

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/DisplayName.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/CountryFlag.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Utils/DurationFormat.swift`

</details>

Android existant : `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/bubble/BubbleContent.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/LanguageData.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/auth/CountryCatalog.kt`

### Entrer dans Meeshy par World Wide, ou comme invité par un lien de partage

`tpm-world-entry-and-guest-join` · Android : **partielle** · P2 · effort S

WorldService : GET /world rend l'entrée World Wide (WorldEntry) ; joinAsGuest appelle la porte canonique POST /links/:key/members (key accepte l'identifiant lisible) avec {nickname, language} et rend LinkMembershipResponse.

Écarts :
- Aucun client GET /world ni modèle WorldEntry : ajouter WorldApi + WorldEntryProviding et l'entrée « World Wide ».
- L'invité Android passe par l'ancienne route anonymous/join/{linkId} : ajouter la porte canonique POST /links/{key}/members (rétrocompatibilité : conserver l'ancienne tant qu'elle est servie) avec LinkMembershipRequest(nickname, language).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Services/WorldService.swift`

</details>

Android existant : `apps/android/core/network/src/main/kotlin/me/meeshy/sdk/net/api/ShareLinkApi.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/sharelink/ShareLinkJoinRepository.kt`, `apps/android/feature/auth/src/main/kotlin/me/meeshy/app/auth/GuestJoinViewModel.kt`

### Une story ou un post v3 se lit même si l'auteur a une version plus récente, dans la disposition choisie

`tpm-canvas-v3-read` · Android : **complète** · P1 · effort S

CanvasV3 (miroir Swift du Zod canvas-v3.ts) : format de TRANSPORT jamais d'affichage, décodé puis reprojeté sur le modèle v1 déjà peint ; MosaicLayoutMode (vague, héros, défilement horizontal, sinusoïde, image par image = défaut) est une décision d'AUTEUR qui voyage avec la publication.

Transposition Android : kotlinx.serialization JsonObject ; en-tête X-Canvas-Caps: 3 déjà annoncé.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3RenderRules.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/CanvasV3WireSupport.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/CanvasV3Projection.kt`

### La liste se filtre par Tous, Non lus, Personnel, Privé, Ouvertes, Globales, Channels, Favoris, Archives, en sections et en tags

`tpm-conv-filters-sections-tags` · Android : **complète** · P1 · effort S

MeeshyConversationFilter (9 filtres avec couleur de chip), MeeshyConversationSection (sections/catégories repliables) et MeeshyConversationTag (étiquette colorée, Codable).

Rendu : Chips colorées (4ECDC4, FF6B6B, 3498DB, F8B500, 2ECC71, E74C3C, 1ABC9C, F59E0B, 9B59B6).

Transposition Android : FilterChip Compose.

<details><summary>Sources iOS (3)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversationFilter.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversationSection.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/MeeshyConversationTag.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationFilter.kt`, `apps/android/feature/conversations/src/main/kotlin/me/meeshy/app/conversations/ConversationSections.kt`

### Un lieu partagé et une position en direct se posent sur la carte dans message, post, story et commentaire

`tpm-shared-place-live-location` · Android : **complète** · P1 · effort S

SharedPlace est le type unique d'un lieu (lat, lon, nom, adresse, catégorie, id éventuel) pour message, commentaire, post et story. LocationModels : coordonnée, durées de partage en direct, événements location:live-started/updated/stopped, session active.

Transposition Android : FusedLocationProvider + Maps Compose / MapLibre.

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/SharedPlace.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/LocationModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SharedPlace.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Location.kt`

### L'analyse d'agent d'une conversation décrit les traits de chaque participant et leur évolution

`tpm-agent-analysis` · Android : **complète** · P2 · effort S

AgentAnalysisModels : TraitScore (label + score), traits de communication, de personnalité, interpersonnels et émotionnels, ParticipantTraits, RelationshipAttitude.

Transposition Android : Équivalent direct ; feuille d'analyse Compose existante.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/AgentAnalysisModels.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/AgentAnalysis.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/ConversationAnalysisProjection.kt`

### Les mentions et contacts partagés se résolvent en lignes avatar + nom

`tpm-mention-shared-contact` · Android : **complète** · P2 · effort S

MentionCandidate (avatar, pseudo, nom, contour) alimente le panneau d'autocomplétion des mentions ; SharedContact porte un contact partagé (nom, numéros, e-mails).

Transposition Android : Équivalent direct (data class).

<details><summary>Sources iOS (2)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/MentionCandidate.swift`
- `packages/MeeshySDK/Sources/MeeshySDK/Models/SharedContact.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MentionCandidate.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Core.kt`

### Une notification reçue au premier plan n'affiche une bannière que si les préférences et le contexte l'autorisent

`tpm-notif-foreground-presentation` · Android : **complète** · P2 · effort S

NotificationPresentationResolver : conversation ouverte ⇒ badge seul ; socket vivant ⇒ le toast in-app prend le relais (badge seul si activé) ; socket coupé ⇒ bannière + liste seulement si allowsNotification(type, direct, now) (push maître, heures calmes, bascule par catégorie), son seulement si « Sons », badge seulement si « Badges » ; type inconnu ⇒ system.

Transposition Android : willPresent → FirebaseMessagingService.onMessageReceived (message de notification au premier plan) + PushPresentationPolicy.

<details><summary>Sources iOS (1)</summary>

- `apps/ios/Meeshy/Features/Main/Services/NotificationPresentationResolver.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/PushPresentationPolicy.kt`, `apps/android/app/src/main/kotlin/me/meeshy/app/push/MeeshyFcmService.kt`, `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/notification/ActiveConversationStore.kt`

### Les dates relatives (maintenant, 5 min, 2 h, 3 j, 2 sem, 1 mois, date) se disent partout pareil

`tpm-relative-time` · Android : **complète** · P2 · effort S

RelativeTime.classify(date, reference) classe un horodatage sans texte localisé : maintenant (< 30 s), secondes, minutes, heures, jours (< 1 semaine), semaines (< 1 mois), mois (< 3 mois), puis date absolue (≥ 3 mois) ; futur ou dérive d'horloge ⇒ maintenant ; mois = 30 jours.

Transposition Android : Équivalent direct ; libellés dans sdk-ui/format (RelativeTimeStringsCompose).

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/RelativeTime.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/time/RelativeTime.kt`

### Une humeur (statut) apparaît dans la barre de statuts avec son emoji, son audio et son expiration

`tpm-status-mood-entry` · Android : **complète** · P2 · effort S

APIPost.toStatusEntry() : un post de type STATUS avec moodEmoji devient une entrée de barre (id, auteur, nom, couleur d'avatar déterministe, emoji, contenu, audio, création, expiration, via @pseudo pour une republication).

Transposition Android : Équivalent direct.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Models/APIPost+StatusEntry.swift`

</details>

Android existant : `apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/status/StatusMapper.kt`, `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/Story.kt`

### Extension et type MIME se convertissent par une seule table

`tpm-util-mime-type-resolver` · Android : **complète** · P2 · effort S

MimeTypeResolver : mimeType(forExtension/forURL/forFilename) et preferredExtension(for:) – tables aller et retour avec synonymes (jpg/jpeg, mp4/m4v, heic/heif, ogg/oga…), octet-stream pour l'inconnu.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/MimeTypeResolver.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/MimeTypeResolver.kt`

### Les images affichent un flou ThumbHash instantané avant leur chargement

`tpm-util-thumbhash` · Android : **complète** · P2 · effort S

Encodeur et décodeur ThumbHash (rgbaToThumbHash, thumbHashToRGBA, couleur moyenne, ratio approximatif) et pont image (toThumbHash, fromThumbHash, thumbHashAverageColor) pour les placeholders de médias, stories et miniatures composites.

<details><summary>Sources iOS (1)</summary>

- `packages/MeeshySDK/Sources/MeeshySDK/Utils/ThumbHash.swift`

</details>

Android existant : `apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/media/ThumbHash.kt`, `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/media/ThumbHashPainter.kt`

