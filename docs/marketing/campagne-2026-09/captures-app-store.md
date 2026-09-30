# Meeshy — plan de captures App Store & App Preview (brouillon, 2026-09-24)

> **Refonte du 2026-09-30 (#8825), en ligne sur la 1.1.2.** À la demande du porteur, la vitrine
> garde son esprit (fonds violets en panorama, légende en deux tons, cadre d'appareil, 7 langues)
> mais ouvre sur des CONVERSATIONS aux photos RÉELLES : une conversation amoureuse à distance
> (vocal entendu dans la langue de l'autre, photos échangées, appel sous-titré), un groupe drôle et
> un débat acharné. L'iPad passe en PORTRAIT 2064×2752. Les § 2, 3, 4 et 6 ci-dessous sont à jour ;
> le reste du document garde l'état du 2026-09-24.

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

Décision : **un seul jeu iPhone en 1320×2868** (6,9", le 6,5" est alors dérivé par Apple) — la fiche § 4/§ 7 (« 6.7" 1290×2796 + 6.5" ») est périmée : 1290×2796 est désormais rangé sous 6,9". **iPad en portrait 2064×2752** depuis #8825 (le format par défaut d'App Store Connect pour le 13") ; les deux colonnes de `iPadRootView` y tiennent (38 % / 62 %, `leftColumnRatio`). Le jeu paysage 2752×2064 de la 1.1.0 est sauvegardé hors dépôt.

Guideline 2.3 ([App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)) :
- **2.3.3** : « Screenshots should show the app in use, and not merely the title art, login page, or splash screen. They may also include text and image overlays » ⇒ fond, légende, cadre d'appareil, flèche/halo : oui. Connexion, splash, maquette absente du build : non.
- **2.3.4** : la vidéo = captures d'écran de l'app seulement ; narration et texte en surimpression autorisés.
- **2.3.7** : ni prix, ni marque tierce, ni affirmation invérifiable ⇒ **pas de vrai groupe K-pop, de vrai anime, de vrai jeu** : fandom fictif « Nova Club ».
- **2.3.10** : aucune mention/icône Android — pertinent puisque `apps/web-v2` a une coque Capacitor.

Technique : `xcrun simctl status_bar <udid> override --time 9:41 --batteryState charged --batteryLevel 100` ; iPhone 17 Pro Max et iPad Pro 13" (M4) ; capture **dans la locale cible**, jamais une image retournée.

Garde-fous § 6 à l'image : aucun Dynamic Island / Live Activity, aucun mode Focal, aucun agent ✦, aucun cadenas E2EE sur un écran qui montre une traduction (DM chiffré = traduction serveur coupée), aucun « Signal ». Monnaie **Meesh** : elle se **frappe** avec les points (`ProgressionMeeshEntry`), elle ne s'achète pas — ne jamais écrire « gagne de l'argent » ni afficher un prix.

## 2. Séquence iPhone (10 captures, 1320×2868) — refonte #8825

Les 3 premières vendent seules (visibles dans les résultats de recherche) : **le vocal amoureux traduit → les photos échangées → le fou rire de groupe**. Le « lecteur » (compte connecté) change par locale (§ 6) ; son **partenaire** aussi : Min-jun (Séoul, coréen) pour une lectrice (fr, en, es, it), Aiko (Osaka, japonais) pour un lecteur (de, pt, ar) — `partenaireDe()`.

| # | Écran du kit | Contenu | Légende | Mode |
|---|---|---|---|---|
| 1 | `amour` | La vue du soir envoyée par le partenaire (photo de Séoul ou d'Osaka), « tu me manques », le **vocal du lecteur joué dans la langue du partenaire** (transcription 한국어 / 日本語), sa réaction ; flèche 🇫🇷 → 🇰🇷 ancrée au vocal | L1 | sombre |
| 2 | `amour-photos` | Le jour du départ : photo du hublot, puis la table aux chandelles et le bouquet (grille de deux photos), « tu es parfait » ; surimpression 🇫🇷 ❤️ 🇰🇷 | L11 | clair |
| 3 | `drole` | Groupe « Lisboa ✈️ » : le chat dans la valise, les rires en plusieurs langues, un **vocal coréen servi dans la langue du lecteur** | L2 | sombre |
| 4 | `debat` | Groupe « Pizza Night 🍕 » : la pizza à l'ananas, l'Italie s'embrase, le Brésil défend le chocolat, Giulia quitte le groupe | L12 | clair |
| 5 | `appel-amour` | Appel vidéo : la caméra du partenaire filme la pluie sur sa vitre, sous-titre traduit, original en rappel | L9 | sombre |
| 6 | `global` | Meeshy Global (inchangé) | L3 | clair |
| 7 | `fil` | Post d'Aiko, photo réelle d'Osaka au couchant | L4 | sombre |
| 8 | `story` | Story de Lucas (São Paulo au couchant) ; celle de Sofía (Madrid) pour le lecteur Lucas | L6 | sombre |
| 9 | `progression` | Progression (inchangé) | L7 | clair |
| 10 | `invitation` | Lien d'invitation (inchangé) | L10 | clair |

Alternance : S-C-S-C-S-C-S-S-C-C. Sortis de la vitrine : Découvrir (L5) et le badge révélé (L8) — leurs légendes restent au catalogue.

## 3. Séquence iPad (9 captures, 2064×2752 portrait) — refonte #8825

Le même récit que l'iPhone (`ipad-amour`, `ipad-amour-photos`, `ipad-drole`, `ipad-debat`, `ipad-appel-amour`, `ipad-global`, `ipad-fil`, `ipad-story`, `ipad-progression`), colonne des conversations à gauche. La hauteur du portrait montre un historique plus long : le déjeuner du partenaire (ramen) avant la vue du soir, le café du matin du départ, le chien de Lucas dans son sac, la pizza au chocolat du Brésil. Alternance S-C-S-C-S-C-S-S-C.

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
| L11 | Loin des yeux. Près du cœur. | Out of sight. Never out of mind. | Lejos de los ojos. Cerca del corazón. | Aus den Augen. Nie aus dem Sinn. | Lontano dagli occhi. Vicino al cuore. | Longe dos olhos. Perto do coração. | بعيد عن العين. قريب من القلب. |
| L12 | Ça chauffe. Tout le monde suit. | Things heat up. Everyone keeps up. | Se arma el debate. Todos lo siguen. | Es wird hitzig. Alle reden mit. | Si accende il dibattito. Tutti seguono. | O debate esquenta. Todo mundo acompanha. | النقاش يحتدم. والكل يتابع. |

Depuis #8825, **L9 nomme la ville du partenaire** : Séoul pour fr, en, es, it ; **Osaka** pour de (« Ruf Osaka an. Lies jedes Wort. »), pt (« Ligue para Osaka. Leia cada palavra. ») et ar (« اتصل بأوساكا. واقرأ كل كلمة. »). L11 détourne dans chaque langue le proverbe « loin des yeux, loin du cœur ».

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

**Photos réelles (#8825).** Les médias des scènes sont quinze photos Pexels (licence libre pour un usage commercial, attribution non requise), **sans aucune personne à l'image** : villes au crépuscule, table aux chandelles, bouquet, hublot, pluie sur une vitre, chat dans une valise, chien dans un sac, pizzas, ramen, café. Elles sont versionnées dans `scripts/marketing-kit/photos/`, chacune avec son auteur, sa page source et la licence dans `credits.json`, et incrustées hors réseau au rendu. Les avatars restent des initiales illustrées.

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
