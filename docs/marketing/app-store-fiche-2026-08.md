# Meeshy — Positionnement App Store & fiche complète (août 2026)

> Livrable : `apps/ios/fastlane/metadata/{fr-FR,en-US}/` (branché sur la lane
> `release`, vérifié par `check_metadata.sh`). Ce document est l'argumentaire
> qui justifie chaque champ, le plan de captures d'écran et les angles de
> campagne. Basé sur deux études : inventaire factuel du code (2026-08-25) et
> étude concurrence/besoins 16-25 ans (App Store US/FR, août 2026).

---

## 1. L'angle retenu : « Le monde entier devient ton groupe »

**On ne vend NI un traducteur, NI une messagerie sécurisée. On vend des
amitiés sans frontières.** La traduction est le moyen, invisible — exactement
la philosophie produit du Prisme Linguistique (le contenu traduit s'affiche
comme du contenu natif).

Pourquoi cet angle gagne :

1. **Le territoire est vacant.** Ablo — qui vendait exactement « chat mondial
   + traduction temps réel » — est mort en 2022. Depuis, PERSONNE n'occupe
   « se faire des amis partout dans le monde, sans barrière de langue » sur
   l'App Store. Azar a la traduction vocale en direct mais ne la met même pas
   dans son sous-titre. Tandem/HelloTalk sont enfermés dans « apprendre »
   (catégorie Éducation, image effort).
2. **C'est l'angle des gagnants Gen Z.** Wizz (#29 Social, 15M+), Yubo (20M+),
   Litmatch (19M+) vendent tous « make new friends » + immédiateté. La Gen Z
   quitte les dating apps pour les apps d'amitié ; les fandoms internationaux
   (K-pop : 86 % de l'intérêt US pour le coréen vient de la Gen Z) et la
   tendance pen pals (Pinterest Predicts 2026, Slowly 10M+) tirent la demande.
3. **On a la feature-signature qu'aucun concurrent n'a.** 84 % de la Gen Z
   envoie des vocaux ; Meeshy est la seule app sociale où le vocal arrive
   dans la langue du destinataire, avec une voix qui ressemble à celle de
   l'expéditeur. C'est le « moment TikTok » démontrable en 10 secondes.

**Pitch une ligne** : *Chacun parle sa langue. Tout le monde se comprend.*

**Hiérarchie des angles** (du store à la campagne) :
| Angle | Usage |
|---|---|
| 1. Amis sans frontières, zéro barrière de langue | Fiche App Store (nom, sous-titre, description) |
| 2. « Ta voix parle 80+ langues » (vocal cloné) | Hook viral : promo text, 1re capture, TikTok/UGC |
| 3. Fandom en VO (K-pop, anime, gaming) | Acquisition ciblée (mots-clés, campagnes segmentées) |
| 4. « Apprends sans t'en rendre compte » + privé | Réassurance (fin de description, presse, parents) |

**Ce qui ne marche PAS (validé par l'étude)** : « translator app » = utilitaire
commoditisé, absorbé par l'OS, zéro boucle sociale — l'intention « traduire »
ne convertit pas en réseau social (Ablo n'a pas survécu en le vendant ainsi).
« Messagerie chiffrée » = aucun besoin perçu chez les jeunes, effets de réseau
verrouillés par WhatsApp ; même Telegram/WhatsApp n'en font qu'une réassurance.

## 2. Cibles d'acquisition

1. **La fan (16-22)** — K-pop, anime, séries : veut parler aux fans du pays
   d'origine. Meeshy = accès direct, dans sa langue.
2. **Le chercheur d'amis / correspondant (16-25)** — tendance pen pals,
   Slowly/Wizz/Yubo. Meeshy = de vrais échanges profonds, pas un swipe.
3. **Le gamer** — squad internationale, Discord en anglais approximatif.
   Meeshy = le groupe où chacun écrit dans sa langue.
4. **La diaspora / famille multiculturelle** (cible d'expansion, pas Gen Z
   mais très fidèle) — couverture africaine unique : lingala, wolof, douala,
   ewondo, bassa, bambara, peul, twi, swahili… qu'aucun grand concurrent n'a.

## 3. La fiche, champ par champ (fr-FR / en-US)

| Champ | fr-FR | en-US | Justification |
|---|---|---|---|
| **Nom** (30) | `Meeshy : amis du monde entier` (29) | `Meeshy: Make Friends Worldwide` (30) | Se place sur « make friends », le champ de bataille des gagnants Gen Z, différencié par « worldwide » (longue traîne quasi vide depuis Ablo) |
| **Sous-titre** (30) | `Chat et vocaux, toutes langues` (30) | `Chat & Voice in Any Language` (28) | Complète le nom sans répéter ses mots (ASO) : chat + voix + langues |
| **Promo** (170) | vocal cloné + 80 langues + « ton groupe » | idem | Champ modifiable SANS re-review → à faire tourner au rythme des campagnes (fandom, rentrée, etc.) |
| **Mots-clés** (100) | `correspondant,rencontre,amis,traduction,vocal,coreen,japonais,kpop,anime,parler,etranger,groupe` | `penpal,meet,people,translate,korean,japanese,kpop,anime,talk,strangers,global,abroad,notes` | Longue traîne fandom + pen pal (Pinterest 2026) ; pas de doublon avec nom/sous-titre ; `correspondant`/`penpal` = équivalent culturel à faible concurrence |
| **Description** (4000) | ~2 570 | ~2 342 | Émotion d'abord (« un meilleur ami qui ne parle pas ta langue. Pas encore. »), features en bénéfices, privacy en réassurance, CTA final |
| **Nouveautés** | style lancement | idem | Reprend les 3 signatures : vocaux traduits, sous-titres d'appel, entrée par lien |
| **Catégorie 1** | `SOCIAL_NETWORKING` | — | L'angle est social ; c'est là que jouent Wizz/Yubo/Discord |
| **Catégorie 2** | `EDUCATION` | — | Capte la navigation Tandem/HelloTalk (« échange linguistique ») sans en faire l'image de marque |
| **URLs** | meeshy.me · /contact · /privacy | idem | Pages déjà en ligne dans apps/web |
| **Copyright** | `2026 Meeshy` | — | |

Les 7 langues du bundle (`CFBundleLocalizations` : fr, en, de, es, pt-BR, it,
ar) devront à terme avoir chacune leur dossier metadata — fr/en d'abord, les
5 autres par traduction de ces deux sources.

## 4. Plan de captures d'écran (3 à 10, iPhone 6.7" 1290×2796 + 6.5")

Règle : chaque capture = UNE promesse, légende courte au-dessus du device,
vraies conversations (anonymisées), couleurs d'accent Meeshy, mode sombre ET
clair alternés.

1. **Le vocal qui change de langue** — lecteur audio avec sélecteur de langue
   visible, bulle « envoyé en français 🇫🇷 → écouté en coréen 🇰🇷 ».
   Légende FR : « Ta voix. Leur langue. » / EN : "Your voice. Their language."
2. **La conversation impossible ailleurs** — groupe à 4 drapeaux, chacun écrit
   dans sa langue, tout le monde lit la sienne (badge de traduction discret).
   « Chacun sa langue. Tout le monde se comprend. » / "Everyone speaks their
   own language. Everyone understands."
3. **L'appel sous-titré** — appel vidéo avec sous-titres traduits en direct.
   « Appelle Séoul. Comprends tout. » / "Call Seoul. Understand everything."
4. **Le fil mondial** — feed stories/reels/posts, contenus multiculturels.
   « Ton monde, dans ta langue. » / "Your world, in your language."
5. **L'entrée par lien** — écran « rejoindre sans compte », stats de langues
   du lien. « Invite. Sans compte. Sans friction. » / "One link. No account."
6. **Communautés/fandom** — communauté K-pop ou gaming multilingue.
   « Trouve les tiens. Partout. » / "Find your people. Anywhere."
7. *(optionnel)* Privacy — verrou Face ID + « transcription sur l'appareil ».

App Preview vidéo (30 s, prioritaire si budget) : le hook n°2 filmé — on
enregistre un vocal en français, l'ami le joue en coréen avec la même voix.

## 5. Campagne (playbook validé par les précédents)

- **TikTok/UGC d'abord** (playbook Wizz : In-Feed 18-24 puis nano-créateurs) :
  la démo « je lui parle en français, il m'entend dans SA langue avec MA
  voix » est un format natif à décliner par fandom (K-pop, anime, foot).
- **Segments fandom** : « parle à des fans coréens de ton groupe, dans ta
  langue » — CAC faible, volume Duolingo-prouvé.
- **Campus/parrainage** (playbook BeReal) via les liens tracés + affiliation
  DÉJÀ implémentés dans l'app (`TrackingLinksView`, `AffiliateView`).
- Le champ promo (170) se met à jour sans re-review : synchroniser son texte
  avec la campagne du moment.

## 6. Claims — ce qu'on dit, ce qu'on ne dit JAMAIS

**Autorisé (prouvé dans le code)** :
- « Plus de 80 langues » (81 sur iOS, 83 serveur) — JAMAIS « 200 langues »
  (capacité brute NLLB-200, pas le catalogue ; la landing web doit être
  corrigée sur ce point).
- « une voix qui ressemble à la tienne », « uniquement si tu l'actives »
  (clonage : ~25 langues, consentement + vérification d'âge implémentés) —
  JAMAIS « ta voix exacte dans toutes les langues » ni « gère tes
  échantillons vocaux » (un seul profil vocal côté serveur).
- « Messages directs chiffrés de bout en bout » — JAMAIS « protocole
  Signal » (ECDH statique + AES-256-GCM maison, pas de double ratchet),
  jamais « toutes les conversations chiffrées » (DM uniquement), jamais
  « E2EE + traduction en même temps » (la traduction serveur est coupée en
  mode E2EE).
- « Transcriptions d'appel jamais envoyées sur nos serveurs » (local-only,
  vérifié) ; « la transcription vocale peut se faire sur ton appareil »
  (EdgeTranscriptionService).
- JAMAIS : Dynamic Island / Live Activities (stub), modes de lecture Focal
  (bêta off par défaut), agent ✦ (off).

**Cohérences à corriger avant soumission** (hors périmètre de cette passe) :
- Landing web : « over 200 languages » et « 100% Private — server-side
  translation » à reformuler pour coller aux claims ci-dessus.
- `ITSAppUsesNonExemptEncryption = false` dans Info.plist à faire arbitrer
  (l'app embarque un E2EE maison CryptoKit).

## 7. Checklist de soumission (rappels durement acquis)

- [ ] Notes de review : DEUX comptes démo (rejet 2.5.4 build 1269 — le
      reviewer doit pouvoir passer un appel) + captures vidéo VoIP et audio
      arrière-plan. Les notes prêtes sont dans `Fastfile` →
      `default_review_notes`.
- [ ] Age rating SANS `ageAssurance=true` (rejet 1.0.0) tant qu'aucun
      mécanisme de vérification d'âge n'est branché à la fiche.
- [ ] Privacy Nutrition Labels alignés sur `PrivacyInfo.xcprivacy`.
- [ ] Icône 1024 sans alpha ; captures 6.7" et 6.5".
- [ ] `./check_metadata.sh` vert (appelé automatiquement par la lane
      `release` avant `upload_to_app_store`).
