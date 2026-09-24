# Meeshy — Campagne virale de lancement (septembre 2026)

> Prolonge `docs/marketing/app-store-fiche-2026-08.md` (angle, cibles, claims § 6 — qui restent la loi) avec ce que l'étude d'août ne couvrait pas : la gamification, le canal Meeshy Global, « se faire des amis en publiant », les 7 langues, l'iPad, YouTube et l'onboarding. Pilotage : #7726 (ce document), #7727 (captures App Store), #7728 (kit social), #7729 (onboarding). Annexes détaillées, vérifiées dans le code le 2026-09-24, dans `docs/marketing/campagne-2026-09/`.

## 0. Décisions du porteur (2026-09-24)

| Sujet | Décision |
|---|---|
| Cible | 16-25 ans, international, ton décomplexé |
| Langues | les 7 langues de l'app (fr, en, es, de, it, pt, ar) — visuels générés par script, jamais posés à la main |
| Diffusion | TikTok / Reels / Shorts (9:16), Instagram (4:5), X / Threads (1:1, 16:9), YouTube, stories et canal Meeshy Global, App Store iPhone ET iPad |
| Fabrication des images | hybride : captures RÉELLES du simulateur iOS/iPad sur comptes de démo, mises en scène (fond, légende, cadre) ; le social peut ajouter des maquettes étiquetées |
| Onboarding | court et interactif, APRÈS l'inscription, 4-5 cartes passables, chacune finie par une action réelle |
| Parrainage | on ne promet QUE l'existant : « ton pote arrive, vous êtes amis d'office et tu montes de niveau » ; toute récompense supplémentaire = issue `décision-produit` |
| 16-17 ans | régime protégé : mineur OU âge inconnu ⇒ story « amis » par défaut, aucune suggestion croisée mineur/adulte, rappels de série sur accord et coupés la nuit, jamais de message de perte |
| Étape « langues » de l'onboarding | récompense visuelle, aucun crédit de points ajouté |

## 1. La promesse

**« Le monde entier devient ton groupe »** — hook : **« Ta voix. Leur langue. »** (inchangés). Trois piliers s'y ajoutent, chacun démontrable dans le build actuel :

1. **Dis bonjour au monde** — chaque nouveau compte arrive dans Meeshy Global (`ensureGlobalConversationMembership`) ; son bonjour est lu dans toutes les langues.
2. **Publie, le monde répond dans ta langue** — posts, stories, reels publics ⇒ commentaires traduits ⇒ demande d'ami.
3. **Garde ta série, monte de niveau** — séries, niveaux, élans (×1 à ×5), badges, succès révélés, Meesh frappées avec les points.

## 2. Vocabulaire et claims — ce qu'on dit, ce qu'on ne dit pas

Le § 6 de la fiche d'août reste la référence. Ajouts de cette campagne :

| On dit | On ne dit JAMAIS | Pourquoi |
|---|---|---|
| « 76 langues traduisibles » | « 80+ », « 200 » | seul chiffre prouvé (#3638) |
| « une voix qui ressemble à la tienne, si tu l'actives » | « avec ta voix », « ta voix exacte » | clonage ≈ 25 langues, sur consentement |
| « Appelle Séoul. Lis chaque mot. » | « Comprends tout » | invérifiable (App Review 2.3.7) |
| « frappe tes Meesh avec tes points » | « offre tes Meesh », « gagne de l'argent », tout prix | le don est au schéma (`transfer_in/out`) mais implémenté nulle part ; aucune valeur monétaire |
| « succès », « série », « badges », « niveau » | « défis » sur un visuel iOS | iOS ne nomme pas de défis ; la page « Défis » de web-v2 = succès à paliers, pas des défis datés |
| « vous êtes amis d'office » (parrainage) | « Meesh offerts au parrain et au filleul » | seule récompense réelle : ~7 points au parrain + amitié automatique |
| #DisBonjourAuMonde = défi de CAMPAGNE | « défi dans l'app » | aucun défi daté n'existe dans le produit |
| fandom fictif « Nova Club » | nom d'artiste, de groupe, de club, de jeu | marques tierces (2.3.7) ; les fans les apportent dans l'UGC |

## 3. Boucles virales (détail : `campagne-2026-09/boucles-virales.md`)

| Boucle | Moteur existant | Manque |
|---|---|---|
| A. Global, la place du village — défi de bienvenue épinglé, aucun premier message sans réponse (roulement équipe + ambassadeurs, 3 semaines) | Global auto-rejoint, `recordActivity`, révélation de succès | anti-spam Global ; crédit `conversation.global` |
| B. Publication publique → demande d'ami — la présence ne se voit qu'entre amis : une vraie raison de devenir amis | posts/stories/reels publics, `/u/<pseudo>`, demandes d'ami | partage IG/TikTok avec watermark (#3692), suggestions (#3687) |
| C. Carte de succès partageable (9:16, série + lien de parrainage) | vue de révélation, axe `social.share` | le bouton « Partager ma carte » (à construire) |
| D. Parrainage — y compris entrer SANS compte par `/chat/<lien>` | `AffiliateTrackingService`, liens tracés | attribution iOS/Android (#3689), K-factor (#3693) |
| E. Amorçage dans Meeshy — défi quotidien dans Global en 7 langues, communautés fandom peuplées, reels démo, stories quotidiennes, watch parties par lien | tout existe | — |

## 4. Production

### 4.1 App Store (détail : `campagne-2026-09/captures-app-store.md`)
- Exigences vérifiées le 2026-09-24 : iPhone 6,9" **1320×2868** (dispense du 6,5") ; iPad 13" **obligatoire**, en paysage **2752×2064** ; ≤ 10 par taille et par langue ; PNG/JPEG sans alpha ; App Preview 15-30 s. Les tailles « 6.7" + 6.5" » de la fiche d'août sont périmées.
- iPhone, 10 captures — les trois premières vendent seules : **vocal traduit → groupe à 4 langues → Meeshy Global**, puis fil public, découverte, stories/reels, série, succès et Meesh, appel sous-titré, lien sans compte.
- iPad, 7 captures en deux colonnes (`iPadRootView`).
- 10 légendes × 7 langues, ≤ 40 caractères ; arabe capturé en locale `ar` (miroir natif), relu par un natif.
- 12 profils fictifs de 18-24 ans ; les messages partent des comptes eux-mêmes pour que la vraie chaîne de traduction les traduise.
- À vérifier au simulateur AVANT de tourner : le coréen est-il une langue de clonage (capture 1) ? le sous-titre d'appel est-il TRADUIT et pas seulement transcrit (capture 9) ?

### 4.2 Kit social (détail : `campagne-2026-09/contenu-par-format.md`)
- 9:16 : 8 concepts (V1 hero vocal, V2 Global, V3 série de 30 jours, V4 groupe impossible, V5 « j'ai posté ma ville », V6 appel sous-titré, V7 stitch anti-sceptiques, V8 UGC #DisBonjourAuMonde), chacun décliné par fandom.
- 4:5 : 4 carrousels (comment ça marche, ton premier jour, 5 façons de se faire des amis, ta progression).
- X / Threads : 6 visuels 1:1 et 16:9 avec leur texte.
- YouTube : « 7 jours à ne parler QUE français à des Coréens », « 6 pays, 0 langue commune » (+ miniatures).
- Dans Meeshy : 10 publications de lancement (Global, stories, posts).
- Chaque visuel est étiqueté **[R]** réel, **[MS]** mis en scène ou **[F]** maquette.

### 4.3 Système visuel commun
Une seule direction artistique pour 4.1 et 4.2 : palette dérivée de `MeeshyColors.swift` (`brandPrimary` indigo500 `#6366F1`), logo `apps/ios/logo_*.svg`, un compositeur HTML qui pose capture + fond + légende + cadre par format et par langue. Spécifié et piloté dans #7727.

## 5. Onboarding (détail : `campagne-2026-09/onboarding-parcours.md`)

Cinq cartes, moins de 90 s, « Passer tout » visible dès la première :

| # | Carte | Action (≤ 2 gestes) | Récompense |
|---|---|---|---|
| 1 | Ta langue, ton monde | langue pré-remplie (locale appareil), 1 tap ; seconde langue en puces | visuelle : la jauge s'allume, « 0 / 10 pts pour ton niveau 1 » |
| 2 | Dis salut au monde (Global) | composer pré-rempli parmi ~20 gabarits à trou personnel, envoi en 1 tap (ou vocal) | 9 + 5 pts, niveau 1, série 1 jour, succès révélé |
| 3 | Montre-toi | première story, légende pré-remplie ; « amis » par défaut en régime protégé | 9 + 1 pts, badge |
| 4 | Trouve ta bande | « Ajouter » sur 3 profils ; aucune suggestion croisée mineur/adulte | annoncée : « +7 chacun quand elle accepte » |
| 5 | On te prévient quand ça bouge | seulement si 2, 3 ou 4 a produit quelque chose ; la fenêtre système n'est ouverte que sur « Oui » | aucune (on ne paie pas une permission) ; récapitulatif + « C'est bon pour aujourd'hui » |

État tenu **côté serveur** (`onboardingCompletedAt DateTime?` + étapes vues), repris à la première étape manquante, pré-coché d'après l'engagement, abandonné après 7 jours. Comptes existants : une carte dans Progression si leur score est < 10. Invités : « crée ton compte pour garder tes points ». Funnel : extension des événements de #5220.

## 6. Préalables bloquants (vérifiés dans le code le 2026-09-24)

1. **Fiche App Store** : les textes promo et descriptions disent « Plus de 80 langues » / « 80+ » (fr, en, de…) et le promo français « avec ta voix » — à corriger avant toute soumission.
2. **Crédit du canal Global** : `messagePostSaveEffects.ts` ne connaît que `public` ; un message dans Global (type `global`) crédite `conversation.private`.
3. **Anti-spam Global** : aucun plafond par compte (seulement 300 req/min par IP). Avant le lancement doux : mode lent (1 message / 30 s les 24 premières heures), arrivées regroupées en une ligne système par fenêtre de 10 min, aucun point pour un texte identique à un récent.
4. **Régime protégé des mineurs** : défauts de visibilité et filtrage des suggestions.

## 7. Calendrier (6 semaines)

| Semaine | Focus | Condition d'entrée |
|---|---|---|
| S1 — 29/09 | Pré-amorçage : communautés fandom, contenus du compte officiel, ambassadeurs | préalables 2 et 3 livrés |
| S2 — 06/10 | Lancement doux : vagues d'invitations (campus, Discords), défi de bienvenue dans Global, accueil en roulement | modération par langue en place |
| S3 — 13/10 | Hook vocal : reels démo (nano-créateurs par fandom), promo App Store | captures et fiche corrigées (#7727, préalable 1) |
| S4 — 20/10 | Partage : carte de succès, défi « série de 7 jours » | #3692 |
| S5 — 27/10 | Parrainage : course entre campus (classement privé des ambassadeurs) | #3689, #3693 |
| S6 — 03/11 | Bilan : on coupe les boucles à K < 0,2, on double la meilleure | — |

Les dates glissent avec leurs conditions d'entrée : une semaine ne démarre jamais sur un préalable absent.

## 8. Indicateurs

1. **Activation J1** — nouveaux comptes ayant envoyé ≥ 1 message avant J+1 00:00 UTC ÷ inscrits du jour (cible ≥ 60 %).
2. **Premier lien social** — comptes avec ≥ 1 amitié acceptée avant J+7, amitié automatique du parrain EXCLUE ÷ cohorte.
3. **K-factor 7 jours** — invitations par utilisateur actif × taux de conversion des invitations (suppose #3693, #3689).
4. **Rétention J7 / J30** — part de la cohorte avec une activité qualifiante (`recordActivity`) ces jours-là (cibles 40 % / 20 %).
5. **Série médiane à J14** et **taux de partage des révélations** (cartes partagées ÷ succès révélés).

Onboarding : taux de fin par carte, part des « salut » MODIFIÉS (proxy d'authenticité), p95 du premier message après inscription (< 3 min, #5220).

## 9. Risques

- **Spam et modération de Global** — préalable 3, modérateurs humains par langue, signalement en un geste, SLA 1 h en S2-S3 ; les réponses de l'équipe ne doivent jamais ressembler à de faux comptes.
- **Mineurs** — régime protégé ; aucune incitation financière à inviter ; pas de classement public (le produit n'en a pas, on n'en crée pas) ; fiche App Store sans `ageAssurance`.
- **Fraude au parrainage** — sans objet tant qu'aucune récompense forte n'existe ; si elle est créée : conversion comptée à l'activation, plafond `maxUses`, détection de fermes.
- **Claims** — tout visuel est relu contre le § 2 de ce document et le § 6 de la fiche d'août avant publication.
