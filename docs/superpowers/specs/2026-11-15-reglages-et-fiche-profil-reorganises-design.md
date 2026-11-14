# Réglages réorganisés et fiche de profil qui porte mes cercles — design

Directive porteur du 2026-11-15 : « mettre à jour la fiche de Réglages pour une meilleure organisation, ne pas répéter les informations, rendre les éléments de la vie de Meeshy accessibles rapidement et les éléments annexes accessibles en annexe ; enlever les stats inutiles et mettre les éléments d'information dans la page profil, accessible uniquement à l'utilisateur lui-même ; revoir la fiche de profil pour mieux intégrer les cercles ; workflow SWE complet, autonome, qui s'auto-évalue et teste. »

iOS d'abord (`apps/ios` + `packages/MeeshySDK` sont la référence des deux autres clients) ; le web et Android reçoivent une issue jumelle chacun, qui cite ce document.

## 0. Ce que les écrans font aujourd'hui, mesuré (2026-11-15, `origin/dev` 3779469f60)

`SettingsView.swift` (951 lignes) empile onze blocs : carte profil · Compte (Confidentialité, Sécurité, Bloqués, **Supprimer le compte**) · Apparence (thème, langue d'interface, trois interrupteurs Lentille / modes de lecture / Rivière) · Voix · Transcription · Notifications (feuille + **Sons** + **Vibrations** + « plus d'options ») · Données (stockage, téléchargement des médias, Boutique, Mes packs, export) · **Outils Meeshy** (favoris, publications enregistrées, **Statistiques**, **Ma Légende**, parrainage) · Aide · À propos (À propos, CGU, confidentialité, licences, **version**) · Changer de compte · Se déconnecter.

`ProfileView.swift` (953 lignes), ma propre fiche : bannière + avatar + nom · raccourcis packs · Identité · Contact (e-mail, téléphone, lus seulement) · Langues du Prisme · **Statistiques** (3 cartes : messages, conversations, et `friendRequestsReceived` étiqueté « amis ») + entrée Ma Légende + décor · **Demandes d'amis** (compteur) · **Membre depuis**.

`UserStatsView.swift` : six cartes (messages, conversations, traductions, langues, « membre Nj », demandes), frise d'activité 30 jours, badges.

Les répétitions : Statistiques (Réglages › Outils ET Profil ET feuille), Ma Légende (Réglages ET Profil), Boutique/Mes packs (Réglages › Données ET raccourcis du Profil), Sons/Vibrations (rangées rapides ET dans la feuille Notifications), Membre depuis (section du Profil ET carte « Membre Nj » des stats), Langues (section du Profil ET carte « Langues » des stats), Demandes (section du Profil ET carte des stats ET « amis » de la bande). Le Profil ne dit rien de mes cercles, alors que « Mes cercles » (#13938) et le cercle sur la fiche d'autrui (#13940) existent.

## 1. Intentions

- **Deux strates dans les Réglages.** En haut, ce qui se touche souvent dans la vie de Meeshy ; en bas, derrière un seul pli « Annexes », ce qu'on ouvre une fois par an. Jamais plus d'un geste pour l'usuel, jamais plus de deux pour l'annexe.
- **Une information vit à UN endroit.** Les Réglages règlent ; le Profil renseigne (et ne renseigne que moi). Ce qui décrit mon compte (statistiques, ancienneté, mes contenus, mes cercles) part au Profil.
- **Les cercles sont la structure sociale de Meeshy** (Public < Communauté < Connaissance < Ami < Proche < Sang, spec du 2026-10-31) : ma fiche les montre au premier regard, les demandes en attente y sont, et « Mes cercles » s'ouvre de là.
- **Une statistique utile dit quelque chose de Meeshy** : messages, conversations, traductions, et l'activité des trente derniers jours. Un compteur de demandes n'est pas une statistique, l'ancienneté se lit en un mot sous mon nom, le nombre de langues est déjà la section Langues, les badges sont à Ma Légende.

## 2. Les Réglages cibles (iOS)

Ordre des blocs, du haut vers le bas :

| strate | bloc | rangées | d'où ça vient |
|---|---|---|---|
| tête | **Carte profil** | avatar, nom, @pseudo → Profil | inchangé |
| vie | **Compte** | Confidentialité · Sécurité · Personnes bloquées | Compte, sans « Supprimer le compte » |
| vie | **Notifications** | une seule rangée → feuille Notifications (Sons et Vibrations y sont déjà) | les trois rangées rapides et « plus d'options » fusionnent |
| vie | **Apparence** | Thème · Langue de l'interface · Boutique et mes packs | Boutique/Mes packs quittent « Données » (un pack décore, il n'est pas une donnée) ; la rangée ouvre la Boutique, « Mes packs » reste joignable par le Profil (#16433 : les deux portes existent, l'une règle, l'autre montre) |
| vie | **Voix** | Mon profil vocal (créer ou gérer : UNE rangée dont le libellé dépend de l'état) | deux rangées devenaient une |
| vie | **Transcription** | Mes messages vocaux · Transcription automatique | inchangé |
| vie | **Médias** | Téléchargement automatique | sortie de « Données » |
| annexe | **Fonctions de l'interface** | Lentille · Modes de lecture · Mode Rivière | quittent « Apparence » (interrupteurs d'expérimentation) |
| annexe | **Données et stockage** | Stockage · Exporter mes données | — |
| annexe | **Aide** | Centre d'aide · Noter l'app (déjà dans Aide) | — |
| annexe | **À propos** | À propos de Meeshy (la version s'y lit, la rangée « version » disparaît) · CGU · Politique de confidentialité · Licences | — |
| pied | **Session** | Changer de compte · Se déconnecter | inchangé |
| pied | **Supprimer le compte** | seule, rouge, en dernier | quitte « Compte » |

Disparaît des Réglages : la section **Outils Meeshy** entière. Favoris et Publications enregistrées → Profil (« Mes contenus ») ; Statistiques → Profil ; Ma Légende → Profil (déjà là) ; Parrainage → Profil (section Cercles, « Inviter »).

**Le pli « Annexes »** : les quatre blocs annexes se montrent repliés sous UNE rangée « Annexes » (chevron), dépliée par un toucher, animation respectueuse de « réduire les animations », état mémorisé pendant la session seulement (une annexe revient repliée à la prochaine ouverture). Un `SettingsFocus` qui désigne un réglage d'une annexe la déplie avant de défiler.

**Loi pure, testée** : `SettingsLayout` (app, `Features/Settings/Views/SettingsLayout.swift`) déclare les strates, blocs et destinations comme VALEURS (`enum SettingsDestination`, `struct SettingsBlock { strate, destinations }`). Témoins : chaque destination apparaît une seule fois ; la strate « vie » précède « annexe » ; la suppression du compte est la dernière destination ; aucune destination ne vise une statistique ni Ma Légende ; toute destination a un site de présentation (feuille, route ou action) — « un contrôle existe s'il a un effet ». `SettingsView` se compose depuis cette loi, par sous-vues qui reçoivent des valeurs (`SettingsBlockView`, `SettingsAnnexFold`) ; `SettingsView.swift` redescend sous 600 lignes.

**Constats d'audit de la session 66 repris au passage** (lot #18315, `scratchpad/reglages-profil/ios_reglages.json`, seulement ceux de `Features/Settings/**`) : voile « Déconnexion en cours » animé, segments de thème et défilement vers un réglage désigné avec `reduceMotion`, « Mode Rivière » qui apparaît/disparaît en transition, note du (i) qui se déplie en transition, boutons « Vérifier » (e-mail, téléphone) protégés du double toucher, assistant vocal rechargé à la fermeture (`onDismiss`), « Réessayer » de « Qui est prévenu » avec effet, « Noter l'app » avec effet, étapes 2FA et de l'assistant vocal en transition, confirmation du mot de passe et de la suppression de compte animées, sessions déconnectées retirées en transition, QR de l'appareil chiffré en transition, repos → édition → code des sections Téléphone/E-mail en transition.

## 3. La fiche de profil cible (iOS, ma propre fiche — `ProfileView`)

Ordre :

1. **Bannière, avatar, nom, @pseudo, et une ligne d'ancienneté** « Sur Meeshy depuis mars 2026 » (la section « Membre depuis » disparaît ; la carte « Membre Nj » aussi).
2. **Mes cercles** (nouveau, `ProfileCirclesSection`) : une rangée de cinq pastilles — Communauté · Connaissance · Ami · Proche · Sang — chacune avec son icône (`CirclesPresentation.icon(of:)`), son nom (`title(of:)`) et le nombre de personnes à ce niveau effectif ; toucher une pastille ouvre « Mes cercles » (`router.push(.contacts(.circles))` ou l'onglet équivalent) ; sous la rangée, s'il y en a, « N demandes à répondre » (les `incomingRaises` + demandes d'amis en attente, source `FriendshipCache.pendingReceivedCount` et `CirclesViewModel.incomingRaises`) → `.peopleDiscovery(.requests)` ; et « Inviter » → `AffiliateView` (le parrainage y gagne sa place : inviter, c'est agrandir ses cercles). Les comptes viennent du cache des liens (`RelationsService`, cache d'abord, zéro réseau au premier rendu si le cache a des liens) puis du réseau en silence. Sans aucun lien : la rangée garde ses cinq pastilles à zéro et une phrase « Tes cercles se remplissent à mesure que tu échanges » ; jamais de squelette sur un cache vide quand l'utilisateur est connu (la fiche se peint, la rangée se complète). Ce que la pastille montre n'est jamais fabriqué : zéro tant que le serveur n'a pas servi.
   La section **Demandes d'amis** actuelle disparaît (absorbée). `ProfileCirclesViewModel` (app, `Features/Profile/ViewModels/`) est injectable (protocole `RelationLinksProviding` existant ou équivalent, mock dans les tests) et dérive une valeur pure `ProfileCirclesSummary.make(links:pendingCount:)` testée sans vue.
3. **Identité** (prénom, nom, pseudo, nom affiché, bio) — inchangé.
4. **Contact** (e-mail, téléphone, badges de vérification) — inchangé, plus une affordance : toucher une rangée ouvre Sécurité sur sa section (`SettingsFocus` existant si disponible, sinon `router.push(.settings)` + focus `.securityEmail`/`.securityPhone` à ajouter à `SettingsFocus`).
5. **Langues** (Prisme) — inchangé.
6. **Mon activité** (ex-Statistiques, `ProfileActivityBand`) : trois nombres — Messages · Conversations · Traductions — toucher → `UserStatsView` ; dessous, l'entrée Ma Légende (existante) et le décor (existant).
7. **Mes contenus** (nouveau, `ProfileSavedContentRows`) : Messages favoris → `.starredMessages` · Publications enregistrées → `.bookmarks` · Mes packs → `router.openMyPacks()` (les raccourcis packs actuels se fondent ici ; `ProfilePackShortcuts` est retiré de la tête).

`ProfileView.swift` redescend sous 700 lignes : les sections nouvelles vivent chacune dans leur fichier et reçoivent des valeurs et des closures.

**Constats d'audit repris** (lot #18312, `ios_profil.json`, seulement `Features/Profile/**`) : bandeau d'erreur en transition, bascule Modifier/Enregistrer animée, plein écran de la photo/bannière avec transition et `reduceMotion`, erreur de la feuille Décor en transition, ouverture d'une publication depuis la liste avec effet d'appui.

## 4. L'écran des statistiques (`UserStatsView`)

Garde : Messages · Conversations · Traductions (trois cartes), la frise d'activité 30 jours. Retire : « Langues », « Membre Nj », « Demandes », et le bloc Badges (Ma Légende les porte). Le titre devient « Mon activité ». `UserStatsViewModel` inchangé (le modèle `UserStats` garde ses champs : le gateway les sert à Android et au web).

## 5. Ce qui ne change pas

- Les feuilles elles-mêmes (Confidentialité, Sécurité, Notifications, Stockage, Export, Boutique, Licences…) : seule leur porte bouge.
- Les routes du `Router`, les clés d'analytics, les préférences serveur. Aucune migration, aucune route nouvelle : rétrocompatible par construction.
- Le web et Android : jumelles ouvertes, non livrées ici.

## 6. Localisation

Sept langues (`fr` source, `en`, `es`, `pt`, `de`, `zh`, `ja` — celles du catalogue). Les clés neuves portent `defaultValue:` et s'écrivent dans `Localizable.xcstrings` en fin de chantier, dans UN commit dédié, APRÈS que la session bb a poussé ses huit valeurs (#18490) : le fichier est modifié dans l'arbre partagé. Les clés retirées des Réglages (section Outils, rangée version, Sons/Vibrations rapides, « plus d'options », « Membre depuis » du profil, cartes Langues/Membre/Demandes, Badges) sont supprimées du catalogue dans ce même commit ; `check-swift-catalog-dead-entries.mjs` l'exige.

## 7. Preuve et clôture

Par lot : tests rouges puis verts (XCTest, `test_{method}_{condition}_{expectedResult}`), `check_cohesion_budget.sh`, `check_house_rules.sh`, `check_test_registration.sh`, build Debug, suites ciblées sur le simulateur `Meeshy-Recette-18201`. En fin de chantier : les cinq tests d'épure qui lisent ces écrans (Reperes, Liens, Fiches, ProfilBring, CerclesProfilVues) relus et verts ; recette au simulateur par un agent (captures des Réglages pliés/dépliés, du Profil avec cercles, de Mon activité) ; verdict CI de dev sur une branche figée `ci/verdict-<sha>` si la file est saturée. Les issues se ferment à la CI de dev verte, avec les dimensions mûres et restantes.

## 8. Choix faits sans le porteur (à contester s'il le souhaite)

1. Le pli « Annexes » plutôt qu'un second écran : un geste de moins, et la recherche visuelle reste possible.
2. Boutique reste dans les Réglages (Apparence) ET Mes packs dans le Profil : une porte règle, l'autre montre ; #16433 demandait les deux.
3. Parrainage dans la section Cercles du Profil : inviter agrandit ses cercles.
4. Les trois statistiques gardées : messages, conversations, traductions ; la frise d'activité gardée.
5. Les langues du Prisme restent dans le Profil : ce sont des attributs du compte (`PATCH /users/profile`), lus par les trois clients.
