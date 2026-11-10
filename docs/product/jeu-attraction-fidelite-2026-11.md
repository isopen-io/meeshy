# Le Jeu Meeshy — plan d'attraction et de fidélité

Arrêté le 2026-11-10. Lecture du dépôt sur `dev` au commit `bc8330d` : règles partagées, écrans iOS, décisions écrites. Rien n'a été mesuré sur des joueurs réels.

Ce document porte la vision et ses raisons. L'état de chaque tâche vit dans les issues des deux milestones :

- « Le Jeu se joue depuis les conversations et donne une raison de revenir chaque jour » ;
- « Chaque moment du Jeu est agréable à regarder, à vivre, à revivre et à servir ».

## 1. En bref

Le Jeu a déjà presque toutes les règles d'un jeu qui fait revenir. Il lui manque d'être vu, d'être joué en deux gestes et de relancer au bon moment. Le plan garde les règles, change d'abord la présentation, puis ajoute neuf mécaniques. Une seule est neuve pour une messagerie : la Flamme d'amitié.

Décisions du porteur, le 2026-11-10 :

| Sujet | Décision | Issue |
| --- | --- | --- |
| Notifications | Deux notifications de jeu par jour, sauf exploit ou action d'autrui | #17368 |
| Bande du jeu | Rien de permanent sur l'écran des conversations : elle dérange l'esthétique et la simplicité | #17365, #17366 |
| Rang | Le Rang passe en tête : l'objet du jeu est de devenir Légende | #17375, #17394 |
| Flamme d'amitié | Oui, comme une série par conversation, après une analyse de conformité | #17377, #17395 |
| Prime de l'Offrande | Entière entre minuit et 8 h, puis décroissante | #17376, #17396 |
| Conversations chiffrées | L'appareil détecte la langue et envoie chaque heure un relevé groupé, sans identifiant de message ni de conversation | #17374 |
| Animations | Agréables à regarder, à vivre, à revivre et à servir | milestone du soin visuel |

## 2. Pour qui

Le public prioritaire est le 16-26 ans : lycéens, étudiants et jeunes actifs qui parlent avec des amis d'autres langues. Deux cercles l'entourent : les familles et les couples entre deux langues, qui jouent pour le rituel plus que pour le classement ; et ceux qui ne veulent pas jouer, pour qui « Jeu masqué » doit rester à un geste.

| Profil | Ce qu'il cherche | Ce qui le sert déjà | Ce qui lui manque |
| --- | --- | --- | --- |
| Le Régulier | Ne pas casser sa série | Flamme, Veilleuse, Rêve du jour | Voir sa Flamme sans chercher, être prévenu avant de la perdre |
| Le Compétiteur | Monter, dépasser | Joute de 30, Rang, Mythe (100 places) | Un classement visible chaque jour |
| Le Styliste | Se montrer, collectionner | Meeshes, cadres, parures, boutique | Des prix lisibles, des pièces rares à durée limitée |
| Le Lié | Faire avec ses amis | Alliance hebdomadaire, Joute des amis | Une série à deux dans la conversation elle-même |

Les textes du jeu sont écrits pour être lus dès 13 ans. Des mineurs jouent : la section 11 en tire les conséquences.

## 3. Ce qui existe et comment c'est présenté

Onze mécaniques sont codées ; presque toutes vivent à trois niveaux de profondeur, derrière le Profil. Sur iOS, la première page du jeu (« Progression ») est une liste de cartes qui ne porte aucun geste.

| Mécanique | La règle | Où le joueur la rencontre | Ce qui freine |
| --- | --- | --- | --- |
| Entrée du jeu | Une page « Progression » | Profil (« Badges, niveau et série »), Réglages, notification | Le mot annonce un bilan, pas un jeu |
| Bandeau du joueur | Niveau, rang, Flamme, Meeshes en une ligne | En haut, 30 secondes à l'ouverture de l'app | Il ne se joue pas |
| Flamme | Un geste par jour ; +2 % par jour sur les rêves, jusqu'à +50 % | Fiche Flamme | L'alerte « Fais un geste avant minuit » n'est lue que dans la fiche |
| Veilleuse | 1 Meesh, 2 en réserve au plus | Fiche Flamme | S'achète avant le risque |
| Rallumage | 3 Meeshes, sous 48 h, une fois par mois | Fiche Flamme | Aucun compte à rebours hors de la fiche |
| Rêve (3 actes) | S'ouvre au niveau 5 ; calibré sur les habitudes du compte | Fiche Rêve | Fermé les premiers jours ; progrès invisible pendant qu'on écrit |
| Offrande | 500 à 10 000 étincelles, gloire, parfois un fragment ou une Veilleuse | Fiche Rêve, après les 3 actes | Trois écrans pour l'ouvrir |
| Heure du Prisme | Une heure par jour, entre 9 h et 21 h : les actes comptent double | Fiche Rêve | Aucun rappel |
| Frappe d'une Meesh | Fige des étincelles (1 221 au plein tarif) ; le niveau baisse d'autant | Fiche Héritage, cérémonie | Dépenser fait reculer le chiffre le plus visible |
| Boutique | Packs payés en Meeshes, gagnés par le rang ou à fenêtre | Profil, Réglages, feuille des stickers | L'aperçu « ce qui reste à débloquer » n'est pas affiché |
| Joute, Alliance, Voyage | Ligue au niveau 10, duo au niveau 20, Voyage 1 le 2026-12-21 | Fiches de concept | Le social arrive après des semaines de jeu solitaire |

Deux absences : le widget iOS ne montre rien du jeu, et aucune notification ne prévient qu'une Flamme est à risque.

Le point fort est le fond : une seule source de règles partagée, un récit unique (Mee, Meo, les aïeux), une cérémonie de frappe, aucun argent réel.

## 4. La boucle cible

Une journée de jeu tient en quatre temps, et chaque jour nourrit le suivant.

1. **Le Rêve arrive** : trois actes tirés selon les habitudes du compte.
2. **Le joueur discute** : ses gestes font avancer un acte.
3. **L'Offrande s'ouvre** : étincelles, gloire, parfois un fragment.
4. **La Flamme tient** un jour de plus, et les rêves de demain rapportent 2 % de plus.

Trois horizons portent la suite : chaque semaine, la Joute (7 montent, 5 descendent) et l'Alliance ; toutes les huit semaines, le Voyage en terre de langue (40 haltes, une coupe) ; sur des années, le Rang de Murmure à Légende, la Renaissance et le Mythe.

Le joueur doit boucler sa journée sans quitter ses conversations, et sans rien d'installé à demeure sur l'écran. Le bandeau reste un passage : il paraît à l'ouverture, devient jouable (toucher l'Offrande prête l'ouvre), revient quelques secondes quand quelque chose change, et se rappelle d'un geste.

## 5. Présenter autrement

Ces changements ne touchent à aucun nombre de règle. Ils passent avant toute mécanique neuve.

| Sujet | Aujourd'hui | Autrement | Ce que le joueur perçoit |
| --- | --- | --- | --- |
| Le nom de l'entrée | « Progression », dans le Profil | « Le Jeu », avec Mee et Meo | Un endroit où jouer |
| La journée | Trois fiches séparées | Un bandeau de passage jouable : Flamme, 3 actes, Offrande | Une tâche courte et finie |
| Le progrès d'un acte | Un compteur dans la fiche Rêve | Une pastille après l'envoi : « Acte II · 3 sur 5 » | Le jeu vient à l'usage |
| La Veilleuse | Un achat à prévoir | Une proposition quand la Flamme est à risque | Une protection, au moment où la perte est concrète |
| Le rallumage | Un prix | « Tes aïeux gardent ta Flamme encore N heures » | Une seconde chance, pas une amende |
| La frappe | Le niveau recule | Le Rang en tête ; le niveau devient « ta lumière » | Dépenser est un choix |
| Le prix d'un pack | Un nombre de Meeshes | Le prix, ce qui manque, le chemin pour l'obtenir | Un but proche |
| L'Heure du Prisme | Une ligne dans la fiche Rêve | Un événement annoncé, avec compte à rebours | Un rendez-vous qu'on attend |
| Les verrous de niveau | « Niveau 5 requis » | « Ton premier rêve complet arrive dans N étincelles » | Une promesse proche |

## 6. Ce qu'il faut ajouter

| Mécanique | La règle proposée | S'appuie sur |
| --- | --- | --- |
| Flamme d'amitié | Une série par conversation à deux : un jour compte quand chacun a répondu à l'autre. Visible dès le 3e jour. Une Veilleuse commune la protège | La Flamme, l'Alliance, les cercles d'amis |
| Premier rêve dès le premier jour | Sous le niveau 5, un rêve d'un seul acte simple et une Offrande garantie | Le Rêve |
| Veilleuse offerte, puis en étincelles | Offerte au 3e jour de Flamme ; achetable en étincelles tant que le joueur n'a frappé aucune Meesh | La Veilleuse |
| Rallumage par l'effort | Dans les 48 h, deux rêves complets rallument la Flamme sans payer | Le rallumage |
| Objectif de Flamme choisi | 7, 14 ou 30 jours ; l'objectif atteint donne un signe des aïeux | Les formes de la Flamme |
| Retour du joueur | Après 7 jours d'absence, une Offrande gardée et trois jours de rêves allégés | L'Offrande, les rêves calibrés |
| Boutique de la semaine | Une vitrine de 3 à 5 packs à fenêtre, dont un à petit prix | Les packs à fenêtre et leur aperçu |
| Mise en veille | Une pause annoncée de 7 jours au plus, une fois par trimestre | La Veilleuse |
| Défi de groupe | Un but commun pour la semaine ; tous reçoivent le même signe | Rien : le jeu n'a aucun but collectif |

Le rallumage par l'effort répond à la demande de maintenir une série en échange d'étincelles ou de Meeshes : le joueur choisit entre payer et jouer.

## 7. L'économie

La boutique se paie déjà en Meeshes. Ce qui manque, c'est de quoi acheter et l'envie de frapper.

| Dépense | Prix | Limite |
| --- | --- | --- |
| Frapper la première Meesh | 1 221 étincelles au plein tarif, moitié prix au niveau 0 | +30 % toutes les 10 pièces, jusqu'à 16 556 |
| Veilleuse | 1 Meesh | 2 en réserve |
| Changer un acte du rêve | 1 Meesh | 1 fois par jour |
| Rallumer la Flamme | 3 Meeshes | Sous 48 h, 1 fois par mois |
| Sceau du voyage | 10 Meeshes | Cosmétique |
| Pack de la boutique | Jusqu'à 10 000 Meeshes | Fixé par pack |

Propositions, sans changer le prix de la frappe :

1. Une échelle de prix à trois marches : 1 à 3 Meeshes pour un plaisir du jour, 5 à 10 pour une pièce d'identité, 25 et plus pour une rareté à fenêtre.
2. Une première Meesh qui achète quelque chose tout de suite : trois packs à 1 Meesh à la fin de la cérémonie.
3. Des pièces qui se montrent, dans la conversation et sur le profil.
4. Des raretés gagnées, affichées verrouillées avec le chemin pour les obtenir.

Question ouverte : combien d'étincelles un joueur régulier gagne par jour. Sans cette mesure, les prix se fixent à l'aveugle.

## 8. Les rappels et la présence hors de l'app

Deux notifications de jeu par jour au plus. Passent hors plafond : un exploit (rang, haut fait, palier de Flamme, coupe ou promotion de Joute) et l'action d'un autre (Alliance, Flamme d'amitié).

| Canal | Ce qui existe | Ce qui est proposé |
| --- | --- | --- |
| Notification du jour | Une mission personnelle annoncée au début de sa plage | Y dire la Flamme |
| Rappel du soir | Rien | Une fois, si la Flamme a 3 jours ou plus et qu'aucun geste n'a été fait. Jamais après 21 h |
| Widget | Activités en direct pour les appels et la voix | La Flamme et « n actes sur 3 » |
| Dans l'app | Bandeau de 30 secondes à l'ouverture | Le bandeau de passage, jouable, qui revient quand quelque chose change |
| App Store | Événements de saison et de ligue déclarés | Une fiche par Voyage |

## 9. Faire venir

Le jeu fait venir par ce que les joueurs montrent, pas par ce qu'on leur paie pour inviter : un partage ne rapporte rien de plus qu'un partage ordinaire (revue de conformité du 2026-10-05, § H).

| Levier | Ce qui existe | Ce qu'il faut |
| --- | --- | --- |
| La carte de moment | Une photo avec Mee et Meo dans un cadre de gloire, avec le lien de parrainage | La proposer aux pics ; ajouter « Partager sans mon lien » |
| L'invitation par la Flamme | Rien | « Allume une flamme avec moi » : un lien qui ouvre la conversation dès l'inscription |
| L'arrivée d'un contact | « X a rejoint Meeshy », et l'acte « Dis-lui salut » | En faire le premier acte des deux côtés |
| Le retour d'un contact | « X était sur Meeshy récemment » | Le moment de rallumer une Flamme d'amitié |
| La promesse de Meeshy | Les actes de langue et l'Atlas | Les mettre devant : aucune autre messagerie ne peut les offrir |

## 10. L'esthétique

Le jeu a ses grandes scènes ; il lui manque la beauté des petits moments, ceux qui reviennent vingt fois par jour.

Quatre exigences :

- **Regarder** : un rythme et des courbes soignés, jamais un effet brusque.
- **Vivre** : l'animation répond au doigt, avec sa vibration et son son.
- **Revivre** : chaque grand moment se rejoue depuis la Chronique.
- **Servir** : une seule bibliothèque de mouvements pour iOS, le web et Android, où chaque animation explique ce qui vient d'arriver.

| Moment | Ce que le joueur voit, sent, entend |
| --- | --- |
| Chaque message qui compte | Une étincelle quitte la bulle et rejoint le bandeau ; vibration légère |
| La Flamme selon son état | Vive, vacillante à risque, sous verre avec une Veilleuse, braise froide éteinte |
| La fin du jour de jeu | Deux secondes : l'Offrande s'ouvre, la Flamme monte, Mee ou Meo dit une phrase |
| Les sons | Quatre sons courts : étincelle, acte, Offrande, Flamme. Muets en mode silencieux |
| Ce qu'on porte | Le blason de rang et la parure près du nom |
| La Flamme d'amitié | Une petite flamme près du nom de l'ami ; un sablier quand elle est à risque |
| L'icône de l'app | Une icône à la forme de sa Flamme, au choix du joueur |
| Le Voyage en cours | La terre de langue teinte le bandeau |

Trois règles tiennent l'ensemble : le jeu ne recouvre jamais la couleur d'accent d'une conversation ; chaque effet a sa version sobre sous « Réduire les animations » ; une animation qui fait perdre une image ou chauffer le téléphone est un défaut à corriger avant d'en ajouter une autre.

## 11. Les limites

- Deux notifications de jeu par jour au plus, et rien sous « Jeu masqué ».
- Aucun argent réel : une Meesh ne se donne ni ne se vend.
- L'Offrande est gratuite ; on ne vend jamais un tirage.
- La Joute se joue sous un nom de joute, sans heure d'activité d'autrui, et jamais de « X t'a dépassé ».
- Toute perte se rattrape : une Flamme éteinte a une issue pendant 48 heures.
- Mee et Meo encouragent ; aucun texte ne reproche une absence.
- Aucun rappel après 21 h.
- Chaque mécanique de série a son interrupteur, au défaut réglable par âge.

Quatre techniques courantes sont écartées : l'énergie qui s'épuise, le tirage payant, le compte à rebours d'achat et la honte publique.

Le projet européen « Digital Fairness Act » était attendu autour du 2026-11-11. Les fonctions addictives, les coffres aléatoires, les monnaies de jeu et la protection des mineurs font partie des sujets probables. La Flamme d'amitié passe par l'agent `conformite-juridique` avant tout code ; cela ne remplace pas un avis juridique signé.

## 12. La panoplie

| Technique | Ce qui la porte dans Meeshy | État au 2026-11-10 |
| --- | --- | --- |
| Série quotidienne | La Flamme | À montrer |
| Assurance de série | La Veilleuse | En place |
| Seconde chance | Le rallumage ; par l'effort | En place ; à créer |
| Pause annoncée | La mise en veille | À créer |
| Récompense variable | L'Offrande | En place |
| Rendez-vous à heure fixe | L'Heure du Prisme, la mission personnelle | À montrer |
| Tâche inachevée | « 2 actes sur 3 » | À montrer |
| But qui se rapproche | Les jauges vers le niveau, la halte, le rang | À montrer |
| Premier succès rapide | L'intégration en sept cartes ; le premier rêve | En place ; à créer |
| Engagement choisi | L'objectif de Flamme | À créer |
| Compétition à sa taille | La Joute de 30, la Joute des amis | En place |
| Coopération à deux | L'Alliance ; la Flamme d'amitié | En place ; à créer |
| But collectif | Le défi de groupe | À créer |
| Statut visible | Le Rang, le blason, les parures | À montrer |
| Collection | L'Atlas, les médailles, le ciel des aïeux, la Chronique | En place |
| Rareté et fenêtre | Pièces d'or et de prisme, packs à fenêtre, cent places du Mythe | En place |
| Saison et nouveau départ | Le Voyage, la Joute hebdomadaire | En place |
| Remise à zéro honorée | La Renaissance et ses Âges | En place |
| Personnalisation | Les rêves calibrés, les atmosphères | En place |
| Récit et mascottes | Mee, Meo, les aïeux | En place |
| Cérémonie | La frappe, les signes des aïeux | En place |
| Sens | Les actes de langue, l'Atlas | À montrer |
| Partage et preuve sociale | La carte de moment | En place, sans récompense |
| Présence hors de l'app | Notifications, App Store ; widget, icône | En place ; à créer |
| Retour après absence | L'Offrande gardée | À créer |

## 13. Les risques

| Risque | Ce qui peut arriver | Garde |
| --- | --- | --- |
| Messages vides | La Flamme d'amitié pousse à envoyer « . » chaque jour | Un jour ne compte que si chacun a répondu ; les gardes contre l'entre-soi s'appliquent |
| Trop de notifications | Deux par jour, plus les exploits, plus les amis | Exploits groupés ; suivre la part des comptes qui coupent le jeu |
| Le non-joueur agacé | Le jeu encombre l'écran de quelqu'un qui veut seulement écrire | Rien de permanent ; « Jeu masqué » à un geste |
| Le chiffrement pénalisé | Quatre signaux de langue ne sont pas comptés en conversation chiffrée | Le relevé horaire de l'appareil ; relecture `crypto-e2ee` et `auditeur-adversarial` |
| La Meesh dévaluée | Veilleuse en étincelles et rallumage par l'effort retirent deux raisons de dépenser | La boutique arrive en même temps ; suivre les Meeshes dépensées par Meesh frappée |
| Le Rang trop lent | Il bouge en semaines | Garder une jauge du jour à côté |
| La boutique vide | Une vitrine par semaine demande des packs chaque semaine | Compter les packs prêts avant de promettre un rythme |
| Aucune mesure | Le retour à 1, 7 et 30 jours n'est pas suivi par cohorte | Le poser avant tout le reste |
| La loi | Le texte européen peut viser les séries entre amis pour les mineurs | Interrupteurs séparés, défaut réglable par âge |
| La charge | Chaque ligne vaut pour trois plateformes, sept langues et treize dimensions | Un lot à la fois |

## 14. Ce qu'on mesure

- Le retour au 1er, au 7e et au 30e jour, par semaine d'inscription.
- La part des joueurs actifs qui ouvrent l'Offrande chaque jour.
- La part des joueurs avec une Flamme de 7 jours ou plus.
- Les étincelles gagnées par joueur actif et par jour.
- Les Meeshes dépensées par Meesh frappée.
- Deux mesures de garde : la part des comptes en « Jeu masqué » et celle qui coupent les notifications de jeu. Si elles montent, on a trop poussé.

## Sources

- Règles et écrans : `packages/shared/utils/game/`, `services/gateway/src/services/game/`, `apps/ios/Meeshy/Features/Game/`, `docs/product/etincelles-economie.md`, `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md`, `docs/product/jeu-meeshy-conformite-2026-10-05.md`, `services/gateway/decisions/`.
- Duolingo, leçons produit sur la série d'amis : <https://blog.duolingo.com/product-lessons-friend-streak/> (22 % de leçons du jour en plus avec une série d'amis ; plafond de 5).
- CMS, le Digital Fairness Act en préparation : <https://cms.law/en/aut/legal-updates/inside-the-eu-s-planned-digital-fairness-act-digital-design-subscription-traps-and-influencer-marketing>.
- Les rapprochements avec d'autres applications (Snapchat, Duolingo, Fortnite) viennent d'une connaissance générale, sans vérification en ligne, sauf les chiffres cités ci-dessus.
