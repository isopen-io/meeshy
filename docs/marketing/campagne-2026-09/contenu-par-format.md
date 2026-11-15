# Meeshy — Plan de contenu par format (lancement, 2026-09)

Angle : **« Le monde entier devient ton groupe »** · hook : **« Ta voix. Leur langue. »** · cible 16-25 ans, 7 langues (fr, en, es, de, it, pt, ar).
Nature des visuels : **[R]** capture réelle de l'app · **[MS]** capture réelle mise en scène (vrais écrans, comptes de démo, contenus écrits pour le tournage) · **[F]** maquette fictive (graphisme, jamais présenté comme un écran).

**Garde-fous (§ 6 de la fiche, non négociables)** : « 76 langues traduisibles », jamais 200 ni « 80+ ». « Une voix qui ressemble à la tienne », « si tu l'actives » — jamais « ta voix exacte ». Pas de « protocole Signal », pas de « tout est chiffré », pas de « chiffré ET traduit ». Aucun Dynamic Island, aucun mode Focal, aucun agent ✦ à l'écran. Les **Meeshes** sont une monnaie interne (frappée avec les points gagnés dans l'app) : jamais de valeur en argent réel, jamais « gagne de l'argent ».

Faits vérifiés dans le code : conversation **Meeshy Global** (`identifier: 'meeshy'`, rejointe automatiquement par chaque compte) ; écran **Progression** (séries « N jours d'affilée » + record, succès révélés par `EngagementRevealHost`, badges) ; **Meeshes** frappées avec les points (1 221 points l'unité, `MEESH_MINT_COST`), avec journal ; le DON entre amis est prévu au schéma (`transfer_in/out`) mais n'est implémenté nulle part — ne jamais le promettre. Les « défis » n'existent pas comme feature dédiée : ce sont des **défis de campagne** (UGC) qui s'appuient sur les séries et les succès réels.

---

## 1. Vidéos 9:16 (TikTok, Reels, Shorts, stories Meeshy) — 8 concepts

Tous : 12-25 s, sous-titres incrustés, logo à la fin seulement, tournés sur device réel.

**V1 — « Ta voix. Leur langue. » (le hero)**
- Hook (0-2 s) : « Je parle français. Elle m'entend en coréen. »
- Plans : face cam, j'enregistre un vocal [MS] → split screen, l'amie à Séoul lance le lecteur audio, sélecteur de langue visible sur 🇰🇷 [MS] → sa réaction → elle répond en coréen, je l'écoute en français [MS].
- Son : voix originale (le son EST la démo), lit discret lo-fi dessous.
- CTA : « Ta voix parle 76 langues. Meeshy. »
- Fandoms : K-pop (fan FR ↔ fan à Séoul qui parle du comeback), anime (fan BR ↔ fan à Tokyo), foot (supporter ES ↔ supporter IT la veille du match).

**V2 — « Bonjour au monde entier » (Meeshy Global)**
- Hook : « J'ai dit bonjour à tout le monde. En même temps. »
- Plans : création de compte, arrivée dans Meeshy Global [R] → j'écris « salut, je viens de Lyon 👋 » [MS] → réponses qui tombent en arabe, portugais, allemand, toutes affichées en français avec le badge de traduction discret [MS] → tap sur une bulle pour voir l'original [R].
- Son : trend « POV: first day » ou sound « hello in every language ».
- CTA : « Ton premier bonjour t'attend dans Global. »
- Fandoms : texte d'intro adapté (« qui stream ce soir ? », « team Luffy ou team Zoro ? »).

**V3 — La série (gamification)**
- Hook : « Jour 30 à parler à des inconnus du monde entier. »
- Plans : écran Progression, flamme « 30 jours d'affilée » [R] → montage rapide des 30 jours (drapeaux des gens rencontrés) [MS] → succès qui se révèle à l'écran [R] → compteur de Meeshes [R].
- Son : trend « day 1 vs day 30 ».
- CTA : « Commence ta série aujourd'hui. »
- Fandoms : « 30 jours à parler K-pop avec Séoul », « 30 jours de squad internationale ».

**V4 — « Le groupe impossible »**
- Hook : « 4 pays. 4 langues. 0 traducteur ouvert. »
- Plans : groupe à 4 drapeaux, chacun tape dans sa langue [MS] → même conversation vue depuis 4 téléphones, chacun la lit dans la sienne (4 écrans côte à côte) [MS].
- Son : trend « the group chat » / transition sur le beat à chaque téléphone.
- CTA : « Chacun sa langue. Tout le monde se comprend. »
- Fandoms : squad gaming (FR/DE/BR/MA), fan club (FR/ES/IT/KR).

**V5 — Se faire des amis en publiant (post/story/reel public)**
- Hook : « J'ai posté ma ville. 12 personnes de 9 pays m'ont écrit. »
- Plans : je publie une story de mon quartier [MS] → commentaires en plusieurs langues, lus en français [MS] → une personne passe en DM, première conversation [MS]. Le chiffre affiché doit être le vrai chiffre du tournage.
- Son : trend « show me your city ».
- CTA : « Poste. Le monde répond. Dans ta langue. »
- Fandoms : « mon setup gaming », « mon coin K-pop », « mon spot manga ».

**V6 — L'appel sous-titré**
- Hook : « On s'appelle. On ne parle pas la même langue. Aucun souci. »
- Plans : appel vidéo, sous-titres traduits en direct [MS] → fou rire partagé sur une blague comprise.
- Son : audio d'appel réel.
- CTA : « Appelle Séoul. Lis chaque mot. »
- Fandoms : « appel avec une fan au Brésil pendant le concert ».

**V7 — Stitch / réponse aux sceptiques**
- Hook (stitch d'un commentaire) : « "Ça va sonner robot." Écoute. »
- Plans : vocal original, puis version traduite, sans coupe [MS] → texte « une voix qui ressemble à la tienne, seulement si tu l'actives » → écran d'activation/consentement [R].
- Son : voix originale.
- CTA : « Teste avec ta propre voix. »

**V8 — Défi UGC #DisBonjourAuMonde**
- Hook : « Défi : dis bonjour dans Global et montre qui te répond. »
- Plans : créateur ouvre Global [R] → poste son bonjour → capture des réponses reçues [MS] → le succès qui se débloque au premier contact [R].
- Son : son original de marque (8 s, « bonjour » dit dans 7 langues) à pousser comme trend.
- CTA : « Ton tour. #DisBonjourAuMonde »
- Fandoms : déclinaison #BonjourARMY-style interdite (pas de nom de groupe/marque tierce dans nos hashtags) ; on laisse les fans l'apporter eux-mêmes.

Stories Meeshy : V2, V3 et V8 recoupés en 3 × 8 s pour le compte officiel.

---

## 2. Carrousels Instagram 4:5 — 4 × 5-7 slides

**C1 — « Comment Meeshy marche en 6 slides »**
1. « Tu écris dans ta langue. » — bulle FR [R]
2. « Elle lit dans la sienne. » — même bulle chez l'amie, en espagnol [MS]
3. « Tu parles. Elle t'entend dans sa langue. » — lecteur audio + sélecteur [MS]
4. « Avec une voix qui ressemble à la tienne (si tu l'actives). » — écran d'activation [R]
5. « 76 langues traduisibles. » — [F] mur de drapeaux/langues
6. « Le monde entier devient ton groupe. » — logo + App Store [F]

**C2 — « Ton premier jour sur Meeshy »**
1. « Jour 1. Tu arrives dans Meeshy Global. » [R]
2. « Tu dis bonjour. Sans pression. » — composer dans Global [MS]
3. « Le monde répond. Dans ta langue. » [MS]
4. « Ton premier succès se révèle. » [R]
5. « Ta série commence. » — flamme 1 jour [R]
6. « À demain ? » — CTA [F]

**C3 — « 5 façons de se faire des amis à l'étranger »**
1. Titre [F]
2. « Dire bonjour dans Global » [R]
3. « Poster une story de ta ville » [MS]
4. « Commenter en vocal » [MS]
5. « Rejoindre une communauté de ton fandom » [MS]
6. « Partager ton lien : pas besoin de compte pour entrer » — écran de lien [R]
7. CTA [F]

**C4 — « Ce que tes Meeshes racontent » (gamification)**
1. « Chaque conversation compte. » [F]
2. « Séries : combien de jours d'affilée ? » [R]
3. « Badges : vocaux, stories, amitiés nouées. » [R]
4. « Succès cachés : ils se révèlent quand tu les atteins. » [R]
5. « Meeshes : frappe-les avec tes points. » [R] (aucune mention de valeur monétaire ni de don)
6. CTA « Montre ta série en story » [F]

---

## 3. X / Threads — 6 visuels d'annonce (1:1 ou 16:9)

1. **1:1 [F]** — typo pleine page « Ta voix. Leur langue. »
   Post : « Tu envoies un vocal en français. Ton ami à Séoul l'écoute en coréen, avec une voix qui ressemble à la tienne. Meeshy est disponible. »
2. **16:9 [MS]** — 4 téléphones, même groupe, 4 langues.
   Post : « 4 pays, 4 langues, un seul groupe. Chacun écrit dans la sienne, tout le monde se comprend. »
3. **1:1 [R]** — capture de Meeshy Global.
   Post : « Chaque nouveau compte arrive dans Meeshy Global. Dis bonjour au monde entier, il te répond dans ta langue. »
4. **16:9 [F]** — carte du monde + « 76 langues traduisibles ».
   Post : « 76 langues traduisibles, dont lingala, wolof, bambara, twi, swahili. Ta langue compte. »
5. **1:1 [R]** — flamme de série + badge.
   Post : « Jour 1 ou jour 100 ? Montre ta série en réponse. »
6. **16:9 [MS]** — appel sous-titré.
   Post : « Appelle quelqu'un qui ne parle pas ta langue. Les sous-titres traduits suivent en direct. »

Format X : 1 visuel + 1 phrase + lien. Threads : même texte + question ouverte en réponse (« Tu parlerais à qui en premier ? »).

---

## 4. YouTube long 16:9 — 2 concepts

**Y1 — « 7 jours à ne parler QUE français à des Coréens »**
- Structure : règle du jeu (0-1 min) → J1 bonjour dans Global → J2-3 fans K-pop, vocaux traduits → J4 appel sous-titré → J5 story de Paris, questions en coréen → J6 raté honnête (une expression mal passée, on la montre) → J7 bilan : amis gardés, série de 7 jours, succès débloqués. Chapitres YouTube par jour.
- Plans : tous [MS] sur vrais échanges, consentement écrit des participants filmés.
- Miniature [F] : visage surpris à gauche, bulle « 안녕! » → « Salut ! » au centre, « 7 JOURS » en gros, drapeaux FR/KR.

**Y2 — « Un groupe de 6 pays organise un voyage sans langue commune »**
- Structure : 6 inconnus trouvés via Global, un groupe, une mission (planifier un week-end), vocaux et appel, rencontre finale (ou appel final si pas de budget).
- Miniature [F] : 6 visages en mosaïque, une seule bulle de groupe, titre « 6 PAYS. 0 LANGUE COMMUNE. »

---

## 5. Publications à poster DANS Meeshy au lancement (10)

Écrites par le compte officiel ou l'équipe, en français (servies traduites par le Prisme) :

1. **Global** — « Bienvenue à tous ceux qui arrivent aujourd'hui ! Dites-nous d'où vous écrivez 🌍 »
2. **Global** — « Question du jour : quel mot de ta langue n'existe dans aucune autre ? »
3. **Global** — « Premier vocal ? Envoie juste "salut" ici, le monde l'entendra dans sa langue. »
4. **Story** — « Il est quelle heure chez toi ? Ici 21 h à Paris 🌙 » (sticker question)
5. **Story** — « Jour 1 de ma série. Qui me suit jusqu'à 7 ? »
6. **Post** — « Montrez votre vue depuis la fenêtre. On fait le tour du monde en photos. »
7. **Post** — « Recommande une chanson dans ta langue. Les autres l'écouteront, toi tu liras leurs avis dans la tienne. »
8. **Reel** — le hero V1 posté natif, légende « Ta voix. Leur langue. »
9. **Global** — « Petit rappel : ici on est gentils. Personne ne juge ton niveau, tout le monde écrit dans sa langue. »
10. **Post** — « Défi de la semaine : #DisBonjourAuMonde. Poste ton bonjour et fais-toi un ami dans un pays où tu n'es jamais allé. »

Modération renforcée sur Global dès J1 (c'est le premier écran social des nouveaux comptes, souvent mineurs).

---

## 6. Règles de localisation (7 langues)

**Se traduit tel quel** : les textes d'interface montrés à l'écran (l'app est déjà localisée — tourner chaque version avec l'app dans la langue cible), les CTA, les légendes de carrousel, les textes des posts dans Meeshy (servis par le Prisme de toute façon), les chiffres (« 76 langues traduisibles » identique partout).

**S'adapte par pays** :
- Le hook : « Ta voix. Leur langue. » / "Your voice. Their language." / « Tu voz. Su idioma. » — réécrit par un natif pour le rythme, pas traduit mot à mot.
- Les paires de langues de la démo : fr↔ko en France, es↔ja au Mexique/Espagne, pt↔ko au Brésil, de↔es en Allemagne, it↔pt en Italie, ar↔en/fr au Maghreb et Golfe.
- Les fandoms : K-pop et anime partout ; foot fort en es/it/pt/ar ; gaming fort en de ; séries turques et coréennes en ar.
- Les sons TikTok : trend locale du pays au moment de la publication.
- L'arabe : visuels en miroir (RTL), vérifier que les captures sont faites avec l'app en arabe.
- Pratiques locales : pas de contenu mixte garçon/fille à connotation « rencontre » sur les marchés où c'est sensible ; l'angle reste « amitié ».

**Reste en VO** : les voix des vocaux démo (c'est la preuve), les noms propres (Meeshy, Meeshy Global, Meeshes), le hashtag de campagne #DisBonjourAuMonde décliné UNE fois par langue puis figé (#SayHiToTheWorld, #SaludaAlMundo…), les répliques originales à l'écran avant leur version traduite.

**Interdit dans toutes les langues** : noms d'artistes, de groupes, de clubs ou de jeux dans nos textes et hashtags (droits de marque) ; les fans les apportent eux-mêmes dans l'UGC.
