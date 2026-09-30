# Vitrine App Store : les 10 features de Meeshy, sur les vrais écrans de l'app

Date : 2026-09-30 · Issue : #8855 · Milestone : « Lancement : campagne fandom et captures »
Statut : conception validée par le porteur, section par section (storyboard, architecture, déroulé).

## 1. Pourquoi

Le jeu mis en ligne sur la 1.1.2 par #8825 raconte des conversations (amour, rire, débat) avec de vraies photos, mais le porteur l'a jugé ainsi : « Tu ne vends pas toutes les features ! Et les views ne reproduisent pas tant la vue de Meeshy. » Deux défauts :

1. **La vitrine ne vend pas ce qui distingue Meeshy.** L'aperçu de l'appelant, le composeur, les exports traduits et les montages d'appel sont absents ; la voix « qui ressemble à la tienne » n'est jamais dite.
2. **Les écrans sont une imitation périmée.** Le kit (`scripts/marketing-kit`) recompose en HTML l'interface du 24 septembre. L'app a changé depuis : en-tête en pilule unique, barre d'outils du champ de saisie, mode Script par défaut, appel « C adapté », rail d'actions des stories.

Objectif : une vitrine qui vend **une feature distinctive par capture**, montrée sur **le vrai écran de l'app**, dans les 7 langues, aux formats par défaut d'App Store Connect (iPhone 6,9" 1320×2868, iPad 13" 2064×2752, portrait).

## 2. Ce que la vitrine vend

Inventaire croisé le 2026-09-30 entre le code iOS, le serveur et les documents produit. L'ordre ci-dessous est celui que le porteur a validé.

| # | Feature | Pourquoi elle distingue Meeshy | Preuve (livrée) |
|---|---|---|---|
| 1 | Vocal traduit, redit avec une voix qui ressemble à celle de l'expéditeur, jusque dans la notification | aucune messagerie ne double un vocal | `packages/MeeshySDK/Sources/MeeshyUI/Media/AudioPlayerView.swift`, clonage consenti sur 23 langues (`services/translator/src/services/tts/backends/chatterbox_backend.py:64`) |
| 2 | Le Prisme : messages, groupes, posts, commentaires, stories, notifications dans la langue du lecteur (76 langues), original à un tap | les autres traduisent à la demande, peu de langues | `apps/ios/Meeshy/Features/Main/Views/Bubble/BubbleFooter.swift`, `apps/ios/Meeshy/Features/Main/Components/MessageDetail/MessageLanguageDetailView.swift` |
| 3 | Appels (jusqu'à 6) sous-titrés dans la langue de chacun, transcription relisible après | absent de WhatsApp et Telegram | `apps/ios/Meeshy/Features/Main/Services/CallTranscriptionService.swift` |
| 4 | Voir et entendre l'appelant avant de décrocher (1:1) | inédit | `apps/ios/Meeshy/Features/Main/Views/CallPreviewViews.swift` — **dans dev, pas dans le build 1863** |
| 5 | Meeshy Global, rejoint à l'inscription | aucun salon mondial ailleurs | `services/gateway/src/services/conversations/ensureGlobalConversationMembership.ts` |
| 6 | Rejoindre par lien sans compte, dans sa langue | les autres exigent un compte | `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/` |
| 7 | Progression : série, niveaux, élans, badges, succès, Meesh frappés | absente des messageries | `apps/ios/Meeshy/Features/Main/Views/ProgressionHub.swift` |
| 8 | Composeur à scènes et timeline ; stories, posts et réels traduits | un outil de création type TikTok dans une messagerie | `apps/ios/Meeshy/Features/Main/Composer/MeeshyComposerHost.swift` |
| 9 | Exports traduits : « Imagine » (message → image, GIF, vidéo) | boucle virale multilingue | `apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift` |
| 10 | Capture d'appel en montages (Polaroïd, BD…) | un photomaton d'appel | `apps/ios/Meeshy/Features/Main/Services/CallMontageRecorder.swift` |

**Hors champ à l'image** (règles de `docs/marketing/app-store-fiche-2026-08.md` § 6 et constats de l'inventaire) : le glyphe ✦ et « Analyse IA » (rangées de liste, résumé au-delà de 25 non-lus, indicateur de rafraîchissement de l'en-tête), la feuille de chiffrement qui nomme « Signal » (#8853), un cadenas de chiffrement sur un écran traduit, un prix ou un achat de Meesh, une marque tierce, une personne réelle identifiable.

## 3. Storyboard

Le contenu reprend les histoires de #8825 pour garder l'émotion : le couple à distance (une lectrice écrit à Min-jun à Séoul, un lecteur à Aiko à Osaka — `partenaireDe()`), le groupe « Lisboa », le débat « Pizza Night ». Les photos restent les photos Pexels du kit, sans personne à l'image.

| # | Vrai écran | Mode | Contenu | Titre (fr) |
|---|---|---|---|---|
| 1 | Conversation à deux : vocal reçu joué dans la langue du lecteur, transcription qui défile | Bulles | le couple | Ta voix. Leur langue. |
| 2 | Groupe : chacun écrit dans sa langue, tout arrive traduit ; un message ouvert sur son original | Script | « Pizza Night » | Chacun sa langue. Tous se comprennent. |
| 3 | Appel de groupe, sous-titres traduits pour le lecteur | — | « Lisboa » | Appelle le monde. Lis chaque mot. |
| 4 | Appel entrant : la vidéo de l'appelante avant de décrocher, « Activer le son » | — | Aiko montre son chat dans la valise | Vois qui t'appelle. Avant de décrocher. |
| 5 | Meeshy Global : « X vient d'arriver — dis-lui salut », bonjours en 8 langues | Script | — | Tout le monde arrive. Dis bonjour. |
| 6 | L'écran qu'ouvre le lien : prénom, langue, « Rejoindre » | — | invitation à « Lisboa » | Un lien. Sans compte. |
| 7 | Progression : série, niveau, badges, Meesh | — | — | Garde ta série. Monte de niveau. |
| 8 | Composeur de story : scènes, timeline, texte stylé sur une vraie photo | — | coucher de soleil | Crée. Le monde te lit. |
| 9 | Feuille d'export Imagine : le message devient une image dans la langue choisie | Bulles | « Loin des yeux… » du couple | Un message. Une image. Sa langue. |
| 10 | Capture d'appel en Polaroïd ou en BD | — | l'appel du couple | Tes appels en souvenirs. |

L'iPad montre les mêmes 10 scènes : colonne des conversations (38 %) pour les écrans de discussion, plein écran pour les appels et le composeur. Les titres des 6 autres langues reprennent les clés existantes (L1, L2, L3, L7, L10) ; les nouveaux titres (3, 4, 6, 8, 9, 10) s'écrivent dans le kit, tenus à 40 caractères par ses témoins, et passent à la relecture native de #8838.

## 4. Le mode vitrine (DEBUG uniquement)

Principe : **les vrais écrans, remplis d'un contenu fictif, sans serveur.** Tout le code vit sous `apps/ios/Meeshy/Features/Vitrine/`, compilé seulement en DEBUG, sur le modèle des aperçus existants (`ConversationLinkCardPreviewLaunch`, `OnboardingPreviewLaunch`, `-MeeshyBannerPreview`).

```
kit (textes 7 langues)  ──►  fixtures JSON + photos  ──►  conteneur de l'app (simulateur)
                                                              │
   -MeeshyVitrine <scène> ──► session fictive ──► remplissage des vraies bases ──► vrai écran
                                                              │
                          capture simctl (9:41) ◄── signal « prêt »
                                   │
                     kit : fond + titre + cadre ──► 1320×2868 / 2064×2752 ──► ANDP
```

| Composant | Rôle | Point d'accroche dans l'app |
|---|---|---|
| `VitrineLaunch` | lit `-MeeshyVitrine <scène>` ; inactif sinon | `ProcessInfo.processInfo.arguments` |
| `VitrineSession` | pose le lecteur de la langue dans le trousseau avant la restauration de session | `KeychainManager.shared.save(_:forKey:)` (`meeshy_active_user_id`, `meeshy_token_<id>`, `meeshy_user_<id>`), appelé dans `MeeshyApp.task` avant `checkExistingSession()` |
| isolement réseau | l'app pointe vers un hôte injoignable ; le mode refuse de démarrer si l'environnement choisi est staging ou la production | `-meeshy_selected_environment custom -meeshy_custom_host 127.0.0.1:9` |
| `VitrineSeeder` | écrit les fixtures dans les VRAIES bases, avec des dates relatives à maintenant | messages, traductions, pistes et transcriptions : `MessagePersistenceActor.upsertFromAPIMessages(_:preferredLanguages:)` ; liste des conversations : `ConversationSyncEngine.saveSorted`, le point d'écriture réconcilié, par une porte DEBUG (le cliquet `ConversationListCacheWriterGuardTests` interdit tout autre écrivain en bloc de la clé « list ») ; fil, stories, progression : `CacheCoordinator.save(_:for:)` ; aperçu d'un lien : porte DEBUG de `ShareLinkService` ; médias : `CacheCoordinator.shared.images/audio.seed(copyingLocalFile:for:)` ; mode de lecture : `meeshy_readmode_u_<userId>_<conversationId>` |
| `VitrineStage` | ouvre la scène demandée une fois le voile de lancement parti, par les notifications que les racines écoutent ; le lien sans compte passe par le vrai lien d'invitation, servi sans réseau | conversation, Global, lien, progression, composeur (`MeeshyComposerHost(hydration: .editingStory(...))`), Imagine (`MessageCardExportPresenter.present(_:)`) ; appels : méthode `#if DEBUG` de `CallManager` qui établit l'appel, sous-titres via `CallTranscriptionService.receiveTranslatedSegment(_:)` ; appel entrant via `CallDebugIncomingTrigger` |
| `VitrineCamera` | source vidéo DEBUG qui diffuse une photo comme flux du correspondant | `RTCVideoTrack` du correspondant (aperçu de l'appelant, tuiles d'appel, montage) |
| hors champ | bandeau réseau masqué, ni rangée ✦ ni résumé ✦ (au plus 25 non-lus, `bridge` absent) | `ConnectionBanner`, fixtures |
| signal « prêt » | la scène annonce qu'elle est rendue, médias chargés | marqueur écrit dans le conteneur, lu par le script |

Garde-fous : un faux jeton face à un vrai serveur provoquerait une déconnexion (401) ou l'effacement des messages (403, `handleAccessRevoked`) — d'où l'isolement réseau obligatoire. Une scène qui ne signale pas « prêt » à temps fait échouer la capture ; aucun écran de chargement n'est capturé.

## 5. La chaîne de capture

Scripts sous `scripts/marketing-kit/vitrine/` :

1. **Fixtures.** Exporte du kit (`textes/*.mjs`) un JSON par langue au format `APIMessage` et prépare les photos. Le contenu n'existe qu'à un seul endroit : le kit, déjà gardé par ses témoins (traductions présentes, promesses interdites exclues).
2. **Simulateurs dédiés.** Crée au besoin « Meeshy Vitrine iPhone » (iPhone 17 Pro Max) et « Meeshy Vitrine iPad » (iPad Pro 13" M4), iOS 26.1. Ne touche jamais aux simulateurs des autres sessions.
3. **Barre d'état.** `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100`.
4. **Capture.** Pour chaque langue et chaque scène : dépose fixtures et médias dans le conteneur de l'app, lance avec `-AppleLanguages`, `-AppleLocale` et `-MeeshyVitrine <scène>`, attend le signal « prêt », puis `xcrun simctl io <udid> screenshot`. Sortie : `scripts/marketing-kit/out/vitrine/<appareil>/<langue>/<scène>.png`, à la résolution native.
5. **Habillage.** Le kit pose fond, titre, surimpressions et cadre d'appareil autour de la VRAIE capture, et rend 1320×2868 et 2064×2752 en RVB sans alpha.
6. **Vérification et envoi.** Tailles, titres, planches par langue ; envoi par ANDP (sauvegarde, retrait, publication langue par langue), comme pour #8825.

## 6. Tests

- **Swift.** L'argument de lancement ; le remplissage relu par les vrais chemins de lecture (messages, traductions, pistes vocales) ; une garde qui vérifie que tout fichier de `Features/Vitrine/` est entièrement sous `#if DEBUG`.
- **Kit.** Les fixtures exportées sont complètes dans les 7 langues et décodables en `APIMessage` ; l'habillage d'une vraie capture respecte tailles et titres.
- **Visuel.** Planches par langue relues aux points d'étape ; chaque capture comparée à l'écran réel correspondant.

## 7. Déroulé

Chaque lot fait une PR dans dev.

1. **Socle et première preuve** : mode vitrine, session, isolement, remplissage, export des fixtures, capture, habillage. Validé sur Meeshy Global, Progression et le lien sans compte, en français, iPhone et iPad. **Point d'étape avec le porteur.**
2. **Conversations** : vocal traduit (Bulles), Prisme dans le groupe (Script), Imagine.
3. **Création** : le composeur, scènes et timeline.
4. **Appels** : appel de groupe sous-titré, aperçu de l'appelant, montage — avec `VitrineCamera`.
5. **Les 7 langues, iPhone et iPad** : rendu complet et planches. **Point d'étape avec le porteur.**
6. **Mise en ligne sur la 1.1.2**, sans soumission, une fois réunis : un build issu de main qui contient l'aperçu de l'appelant (#8800), la fiche corrigée (#8852), l'envoi par ANDP.

## 8. Risques

| Risque | Parade |
|---|---|
| `VitrineCamera` plus coûteuse que prévu | capturer les scènes 4 et 10 sur un vrai iPhone |
| les statistiques du lien ne sont pas en cache | la scène 6 montre l'écran d'accueil du lien, pas ses statistiques |
| la timeline du composeur s'ouvre par un geste | un tap piloté par la cible `MeeshyUIDeviceTests`, ou un paramètre DEBUG d'ouverture |
| une scène affiche un élément hors champ (✦, bandeau) | relecture des planches aux deux points d'étape |
| l'aperçu de l'appelant absent du build publié | pas de mise en ligne de la capture 4 sans le nouveau build |

## 9. Critère de fin

Le porteur valide le jeu des 10 captures dans les 7 langues, iPhone et iPad, et il est en ligne sur la version en préparation, sans soumission. #8855 se ferme avec la preuve.
