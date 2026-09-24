# Meeshy — plan de captures App Store & App Preview (brouillon, 2026-09-24)

Base : fiche 2026-08 (§ 3, 4, 6), `fastlane/metadata/*/`, `project.yml` (`TARGETED_DEVICE_FAMILY: "1,2"` ⇒ iPad 13" OBLIGATOIRE).

## 0. Deux écarts à trancher avant de tourner quoi que ce soit

1. **Les 7 `promotional_text.txt` et les `description.txt` disent « 80+ langues »** ; le § 6 l'interdit (#3638) : seul **76** est autorisé. Aucune légende ci-dessous ne cite de chiffre ; corriger la métadonnée d'abord.
2. Le promo FR dit « avec ta voix » ; le § 6 n'autorise que « une voix qui ressemble à la tienne », « uniquement si tu l'actives ». « Ta voix. Leur langue. » (validée § 4) reste, avec un clonage **activé sur consentement** dans une langue du périmètre (~25 ; coréen à vérifier au simulateur).

## 1. Exigences App Store Connect (vérifiées le 2026-09-24)

| Élément | Exigence | Source |
|---|---|---|
| iPhone 6,9" | 1320×2868, 1290×2796 ou 1260×2736 (portrait) | [Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications) |
| iPhone 6,5" | 1284×2778 ou 1242×2688 — « Required if app runs on iPhone and screenshots for 6.9" display aren't provided » | idem |
| iPad 13" | 2064×2752 / 2048×2732 (portrait) ou 2752×2064 / 2732×2048 (paysage) — obligatoire si l'app tourne sur iPad | idem |
| Nombre | 1 à 10 par taille et par locale | idem |
| Format | `.jpeg`, `.jpg`, `.png`, **sans canal alpha** | idem |
| App Preview | 15–30 s, jusqu'à 3 par taille, 30 fps max, H.264 10–12 Mbps ou ProRes 422 HQ, stéréo AAC 256 kbps ; iPhone 6,9"/6,5" : 886×1920 ; iPad 13" : 1200×1600 ; ≤ 500 Mo ; image d'affiche par défaut à 5 s | [App preview specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/app-preview-specifications) |

Décision : **un seul jeu iPhone en 1320×2868** (6,9", le 6,5" est alors dérivé par Apple) — la fiche § 4/§ 7 (« 6.7" 1290×2796 + 6.5" ») est périmée : 1290×2796 est désormais rangé sous 6,9". **iPad en paysage 2752×2064** pour montrer les deux colonnes de `iPadRootView`.

Guideline 2.3 ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)) :
- **2.3.3** : « Screenshots should show the app in use, and not merely the title art, login page, or splash screen. They may also include text and image overlays » ⇒ fond, légende, cadre d'appareil, flèche/halo : oui. Connexion, splash, maquette absente du build : non.
- **2.3.4** : la vidéo = captures d'écran de l'app seulement ; narration et texte en surimpression autorisés.
- **2.3.7** : ni prix, ni marque tierce, ni affirmation invérifiable ⇒ **pas de vrai groupe K-pop, de vrai anime, de vrai jeu** : fandom fictif « Nova Club ».
- **2.3.10** : aucune mention/icône Android — pertinent puisque `apps/web-v2` a une coque Capacitor.

Technique : `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100` ; iPhone 17 Pro Max et iPad Pro 13" (M4) ; capture **dans la locale cible**, jamais une image retournée.

Garde-fous § 6 à l'image : aucun Dynamic Island / Live Activity, aucun mode Focal, aucun agent ✦, aucun cadenas E2EE sur un écran qui montre une traduction (DM chiffré = traduction serveur coupée), aucun « Signal ». Monnaie **Meesh** : elle se **frappe** avec les points (`ProgressionMeeshEntry`), elle ne s'achète pas — ne jamais écrire « gagne de l'argent » ni afficher un prix.

## 2. Séquence iPhone (10 captures, 1320×2868)

Les 3 premières vendent seules (elles sont visibles dans les résultats de recherche) : **vocal traduit → groupe multilingue → Meeshy Global**. Le « lecteur » (compte connecté) est **Léa** en fr-FR ; il change par locale (§ 5).

| # | Vue iOS | Données de démo | Légende (clé) | Mode |
|---|---|---|---|---|
| 1 | `ConversationView` DM Léa ↔ Min-jun ; bulle audio avec `AudioCarouselView` ouvert, langue « 한국어 » sélectionnée, forme d'onde en lecture | Vocal de Léa 0:12 « On se voit au concert samedi ? » ; transcription coréenne sous la bulle ; drapeaux 🇫🇷→🇰🇷 en surimpression (overlay 2.3.3) | L1 | sombre |
| 2 | `ConversationView` groupe « Nova Club 🌍 » (4 participants), badge de traduction discret par bulle | Min-jun (ko), Sofía (es), Aiko (ja), Léa (fr) : chacun a écrit dans sa langue, tout s'affiche en français ; réactions 🔥 | L2 | clair |
| 3 | `ConversationView` de **Meeshy Global** (`identifier: meeshy`, type `global`) : messages système « X a rejoint » (posés par `ensureGlobalConversationMembership`) suivis de bonjours | « Amara a rejoint », « Yusuf a rejoint » ; « Salut tout le monde 👋 » ×6 langues, toutes lues en français ; compteur de membres en en-tête | L3 | sombre |
| 4 | `FeedView` → `FeedPostCard` (post public d'Aiko, photo Osaka), `TranslationToggle` visible | Légende japonaise lue en français, 24 commentaires multilingues, bouton « Ajouter en ami » | L4 | clair |
| 5 | `PeopleDiscoveryView` (onglet Découvrir de `ContactsHubView`) + bannière `FriendRequestListView` | 5 profils (Kwame, Giulia, Lucas, Priya, Jonas) avec langue et ville ; 1 demande acceptée | L5 | sombre |
| 6 | Viewer de story (`Features/Stories`, `StoryViewerView`) ou `ReelsPlayerView` | Story de Lucas (São Paulo, texte pt-BR affiché en français), barre de progression, réactions | L6 | sombre |
| 7 | `ProgressionView` — `ProgressionFlammeHero` (« Série », 12 jours, record 21) + `ProgressionLevelHero` + `ProgressionElansHero` | Niveau 7, 3 familles tenues (vocaux, stories, conversations) ⇒ multiplicateur actif | L7 | clair |
| 8 | `AchievementRevealView` (succès révélé plein écran) avec le glyphe `MeeshCoin` du solde en haut | Succès « Amitiés nouées » palier 10 ; solde 340 Meesh | L8 | sombre |
| 9 | `CallView` appel vidéo Léa ↔ Min-jun avec sous-titres de `CallTranscriptionService` | Sous-titre coréen traduit en français sous la vignette (VÉRIFIER au simulateur que le sous-titre est bien TRADUIT et pas seulement transcrit — sinon retirer la capture) | L9 | sombre |
| 10 | Fiche de lien d'invitation (`CommunityLinkDetailView`) — rejoindre sans compte | Lien « Nova Club », répartition des langues des arrivants | L10 | clair |

Alternance clair/sombre : S-C-S-C-S-S-C-S-S-C (6 et 9 restent sombres : média plein écran et appel).

## 3. Séquence iPad (7 captures, 2752×2064 paysage)

`iPadRootView` = colonne gauche `ConversationListView` (`leftColumnRatio`) + panneau droit (`FeedView`, `ConversationView` ou `iPadRightPanel`).

| # | Gauche | Droite | Légende | Mode |
|---|---|---|---|---|
| P1 | Liste : Nova Club, Min-jun, Meeshy Global (non lus) | DM Min-jun, vocal traduit en lecture (= iPhone 1) | L1 | sombre |
| P2 | Liste, Meeshy Global sélectionné | Meeshy Global plein panneau, 12 bonjours visibles (le grand écran en montre deux fois plus) | L3 | clair |
| P3 | Liste | `FeedView` : deux posts publics + stories en haut | L4 | sombre |
| P4 | Liste, Nova Club sélectionné | Groupe à 4 langues, un post partagé dans le fil | L2 | clair |
| P5 | Liste | `ProgressionView` (série + badges en grille, qui respire en largeur) | L7 | clair |
| P6 | — (plein écran) | `CallView` à 3 participants, sous-titres | L9 | sombre |
| P7 | Liste | `ReelsPlayerView` en format régulier (`sizeClass == .regular`) | L6 | sombre |

## 4. Légendes (≤ 40 caractères, décompte vérifié par script)

| Clé | fr-FR | en-US | es-ES | de-DE | it | pt-BR | ar-SA |
|---|---|---|---|---|---|---|---|
| L1 | Ta voix. Leur langue. | Your voice. Their language. | Tu voz. Su idioma. | Deine Stimme. Ihre Sprache. | La tua voce. La loro lingua. | Sua voz. A língua deles. | صوتك. بلغتهم. |
| L2 | Chacun sa langue. Tous se comprennent. | Everyone types. Everyone gets it. | Cada uno su idioma. Todos se entienden. | Jeder schreibt. Alle verstehen. | Ognuno la sua lingua. Tutti capiscono. | Cada um na sua língua. Todos entendem. | كل واحد بلغته. والكل يفهم. |
| L3 | Tout le monde arrive. Dis bonjour. | The whole world is here. Say hi. | Todo el mundo está aquí. Saluda. | Die ganze Welt ist hier. Sag Hallo. | Tutto il mondo è qui. Saluta. | O mundo todo está aqui. Diga oi. | العالم كله هنا. قل مرحبًا. |
| L4 | Publie. On te lit dans sa langue. | Post it. They read it in theirs. | Publica. Te leen en su idioma. | Poste es. Jeder liest es in seiner. | Pubblica. Ti leggono nella loro lingua. | Poste. Leem na língua deles. | انشر. ويقرؤونك بلغتهم. |
| L5 | Des amis dans chaque pays. | Friends in every country. | Amigos en cada país. | Freunde in jedem Land. | Amici in ogni paese. | Amigos em cada país. | أصدقاء في كل بلد. |
| L6 | Tes stories font le tour du monde. | Your stories go worldwide. | Tus stories dan la vuelta al mundo. | Deine Stories gehen um die Welt. | Le tue storie fanno il giro del mondo. | Seus stories rodam o mundo. | قصصك تجوب العالم. |
| L7 | Garde ta série. Monte de niveau. | Keep your streak. Level up. | Mantén tu racha. Sube de nivel. | Halte deine Serie. Steig auf. | Tieni la tua serie. Sali di livello. | Mantenha a sequência. Suba de nível. | حافظ على سلسلتك. ارتقِ. |
| L8 | Débloque des succès. Frappe tes Meesh. | Unlock badges. Mint your Meesh. | Desbloquea logros. Acuña tus Meesh. | Schalte Erfolge frei. Präg deine Meesh. | Sblocca traguardi. Conia i tuoi Meesh. | Desbloqueie conquistas. Cunhe Meesh. | افتح الإنجازات. واسكّ عملات Meesh. |
| L9 | Appelle Séoul. Lis chaque mot. | Call Seoul. Read every word. | Llama a Seúl. Lee cada palabra. | Ruf Seoul an. Lies jedes Wort. | Chiama Seul. Leggi ogni parola. | Ligue para Seul. Leia cada palavra. | اتصل بسيول. واقرأ كل كلمة. |
| L10 | Un lien. Sans compte. | One link. No account. | Un enlace. Sin cuenta. | Ein Link. Kein Konto. | Un link. Nessun account. | Um link. Sem conta. | رابط واحد. بلا حساب. |

Notes : L9 remplace « Comprends tout » (§ 4) — affirmation invérifiable au sens de 2.3.7 ; « Lis chaque mot » décrit ce qu'on voit. L8 : le verbe « frapper » est celui de l'app (`progression.meesh.mint`, « frappées depuis toujours »). Le mot « défis » n'est pas employé : aucun écran iOS ne porte ce nom (Série, Élans, Succès, Badges). web-v2 a une page « Défis » (`progression-defis.tsx`), mais ce sont les succès À PALIERS, pas des défis datés — l'employer sur une capture iOS créerait une promesse que le build ne tient pas.

**Arabe (RTL)** : capture faite en locale `ar` (l'app se met en miroir d'elle-même : liste à droite sur iPad, bulles sortantes à gauche) ; la légende est alignée à droite, le cadre d'appareil et les éléments décoratifs du gabarit sont inversés ; les surimpressions de flèche (🇫🇷→🇰🇷) deviennent ←. Police arabe dédiée (pas de repli latin), chiffres occidentaux comme la métadonnée ar-SA actuelle ; « Meesh » reste en latin, isolé par un marqueur LRM pour ne pas casser l'ordre bidi. Faire relire par un locuteur natif (registre jeune, pas classique).

## 5. App Preview 30 s (iPhone 886×1920, décliné iPad 1200×1600)

Image d'affiche = la seconde 5 : la bulle vocale avec « 🇫🇷 → 🇰🇷 ». Uniquement de l'enregistrement d'écran (`xcrun simctl io recordVideo`), musique libre de droits, surimpressions texte localisées.

| Temps | Écran | Surimpression |
|---|---|---|
| 0–3 s | Léa appuie sur le micro, onde qui monte | « Je parle français… » |
| 3–8 s | Côté Min-jun (compte 2, locale ko) : la bulle arrive, lecture en coréen, transcription | « …il m'entend en coréen. » (affiche à 5 s) |
| 8–13 s | Nova Club : 3 messages entrent en ko/es/ja, s'affichent en français, tap long → original | « Chacun sa langue. » |
| 13–17 s | Meeshy Global : « Priya a rejoint », pluie de bonjours | « Tout le monde dit bonjour. » |
| 17–21 s | Fil : scroll, post d'Aiko traduit, « Ajouter en ami » | « Publie. Fais-toi des amis. » |
| 21–26 s | Progression : la série passe à 13, `AchievementRevealView` se déclenche | « Garde ta série. » |
| 26–30 s | Retour liste de conversations pleine, logo en surimpression | « Meeshy — le monde entier dans ton groupe. » |

Un tournage par locale : l'interface ET le contenu doivent arriver dans la langue du spectateur.

## 6. Données de démo pour staging

Règles : personnes **fictives, majeures (18-24 ans)**, aucune marque ni personnalité ; avatars **illustrés maison** ou banque d'images **avec autorisation de modèle** ; comptes `demo+<prénom>@meeshy.me` ; messages envoyés par les comptes eux-mêmes pour que la **vraie** chaîne de traduction les traduise (2.3.3). Vocal de Léa : comédien avec cession de droits, clonage activé par le consentement de l'app.

| Pseudo | Prénom Nom | Ville | `systemLanguage` / `regionalLanguage` | Rôle dans les captures |
|---|---|---|---|---|
| lea.mtn | Léa Martin | Lyon | fr / en | lectrice fr-FR, vocal (1), groupe |
| minjun.p | Min-jun Park | Séoul | ko / en | DM, appel (9), Nova Club |
| sofi.romero | Sofía Romero | Madrid | es / en | Nova Club, lectrice es-ES |
| aiko.t | Aiko Tanaka | Osaka | ja / en | post public (4), Nova Club |
| lucas.olv | Lucas Oliveira | São Paulo | pt / es | story (6), lecteur pt-BR |
| amara.d | Amara Diallo | Dakar | fr / wo | arrivée dans Meeshy Global |
| yusuf.h | Yusuf Haddad | Amman | ar / en | Global, lecteur ar-SA |
| jonas.wb | Jonas Weber | Berlin | de / en | Découvrir (5), lecteur de-DE |
| giulia.r | Giulia Rossi | Bologne | it / fr | Découvrir, lectrice it |
| kwame.m | Kwame Mensah | Accra | en / tw | Découvrir, Global |
| priya.n | Priya Nair | Bangalore | en / hi | Découvrir, arrivée vidéo |
| maya.chen | Maya Chen | Toronto | en / zh | lectrice en-US |

Contenus à semer :
- **Nova Club 🌍** (groupe, 4 membres + 8 lecteurs selon locale) : Min-jun « 내일 콘서트 같이 볼 사람? » ; Sofía « ¡Yo! Llevo la pancarta 🙌 » ; Aiko « 私も！時差は気にしない 😂 » ; Léa « Je fais les stickers pour tout le monde » ; 🔥 ×3.
- **DM Léa ↔ Min-jun** : 6 messages texte + le vocal de 12 s + 1 appel vidéo terminé (bulle d'appel).
- **Meeshy Global** : inscrire Amara, Yusuf, Priya, Kwame APRÈS les autres pour générer les avis « a rejoint » ; chacun poste un bonjour dans sa langue (« Salam ! », « Hello from Accra 👋 », « नमस्ते सबको »…).
- **Fil** : 1 post photo d'Aiko (photo libre de droits, sans personne identifiable), 1 story de Lucas, 1 réel de Sofía ; 20+ commentaires croisés.
- **Progression de Léa** : série de 12 jours (record 21), niveau 7, 3 élans, succès « Amitiés nouées » palier 10 révélable, solde 340 Meesh — à obtenir par activité réelle scriptée sur staging ou par un seed de progression dédié ; ne jamais retoucher l'image.
- Un compte lecteur par locale, ou le `systemLanguage` de Léa basculé avant chaque tournage de locale.

Suites à ouvrir en issues (hors de ce brouillon) : correction « 80+ » → 76 dans les 7 métadonnées ; script de seed de démo staging ; vérification au simulateur des captures 1 (langue de clonage) et 9 (sous-titre traduit) ; mise à jour du § 4/§ 7 de la fiche (tailles périmées).
