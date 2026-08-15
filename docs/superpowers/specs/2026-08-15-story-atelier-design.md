# Story Atelier — Design de refonte de la publication (stories · posts · réels)

Date : 2026-08-15
Statut : spec de design validée en revue produit (session Claude)
Artifact visuel (12 maquettes) : `./2026-08-15-story-atelier-design.html`
Spec technique d'implémentation : `./2026-08-15-story-atelier-implementation.md`

## 1. Constat (audit du code)

Il n'existe aucun modèle `Story` en base : une story est un `Post` de type `STORY`
portant un blob JSON `storyEffects` validé en `passthrough()` (seule limite : 256 Ko,
`services/gateway/src/routes/posts/types.ts:159-176`). Le serveur n'ayant jamais
refusé un blob mal formé, les clients ont divergé sans erreur :

| Surface | État |
|---|---|
| Web | **1 vue** (`StoryComposer.tsx`, 571 l.) — upload via `/attachments/upload` (crée des `MessageAttachment`) alors que `PostService.createPost` réclame des `PostMedia` → **médias jamais rattachés** ; écrit la clé legacy `backgroundColor` ; TTL optimiste 24 h vs 20 h serveur |
| iOS | **≈ 85 vues, 48 908 lignes** (`MeeshyUI/Story`) — 32 vues timeline, 4 vues par outil (texte et dessin miroirs), 15 modales, outil `filters` inatteignable, cascade morte dans `UnifiedPostComposer` |
| Gateway | Routes sans client web : `GET /posts/stories/mine`, `PUT /posts/:id`, `POST /posts/:id/republish` |
| Composeurs | 4 parallèles par client : `StoryComposer`, `PostComposer`, `AudioPostComposer`, `UnifiedPostComposer` (mort) |

Causes racines : (1) chaque capacité a engendré ses propres écrans ; (2) le serveur
accepte tout, donc rien ne converge ; (3) deux contrats de publication asymétriques
et 7+ portes d'entrée.

## 2. Principes

1. **Tout est un `StoryElement`** — `{ kind, transform, timing, payload }` pour
   média / texte / sticker / audio / lieu / dessin, rendu par un registre unique.
2. **Le lecteur EST l'aperçu** — composer et reader partagent le registre de rendu.
   WYSIWYG par construction, zéro vue d'aperçu dédiée.
3. **Panneaux générés, pas dessinés** — un `ToolDescriptor { icône, contrôles[] }`
   par outil ; le Dock génère l'UI. Un outil ne peut plus être « déclaré mais
   inatteignable ».
4. **Piloté par l'usage réel** — le chemin photo/vidéo + texte + audio tient sur le
   canvas seul, sans modale. Timeline/keyframes restent disponibles, repliés dans
   le Dock comme inspecteur avancé.
5. **Une porte, un contrat** — un seul point de montage, une intention typée
   `(create | edit | draft)`, une seule file offline (création ET édition).
6. **Le format est une propriété** — `type` change la destination, le TTL et
   l'endroit où vit le texte. Jamais l'outil.
7. **Le schéma est le produit** — `CanvasV2` strict dans `packages/shared`, Swift
   généré depuis la même source. Le serveur refuse l'inconnu.

## 3. Architecture cible : 5 vues, identiques web & iOS

| Vue | Responsabilité | Remplace |
|---|---|---|
| **Canvas** | Surface unique d'édition ET de lecture, registre d'éléments, gestes de manipulation directe, slides en pagination | 21 fichiers canvas + 6 layers + SlideStrip + aperçu dédié |
| **Dock** | Unique panneau contextuel (machine à états, cf. §4), contenu généré depuis les descripteurs | ~48 vues : timeline (32), quatuors texte/dessin (8), rail FAB, panneaux |
| **Amorce** | État vide du Canvas : caméra, galerie, texte, dernière capture. Un état, pas un écran | amorces page blanche + 4 modales d'entrée |
| **Barre de publication** | Format (Story · Post · Réel), audience (EXCEPT/ONLY inline), aperçu (= Reader en mode preview), publier → file offline | TopBar + menu visibilité + sheet audience + contrat asymétrique |
| **Étagère** | Une liste d'états : publiées, brouillons, file d'envoi, archive. Tap = reprendre | MyStoriesView (1 041 l.) + 5 cellules + 7 sites d'ouverture |

## 4. Mécanique du Dock

Le Dock ne présente **jamais** une sheet : il change de hauteur. Quatre états,
trois hauteurs fixes, une règle de sortie (tap fond = repos). Le clavier est la
seule chose qui monte par-dessus (texte, panneau de style accroché).

1. **Rangée** (repos, ~72 pt) — rangée d'outils générée depuis `composerOrder`.
2. **Panneau** (création, ~220 pt) — contrôles de l'outil actif.
3. **Inspecteur** (sélection, ~220 pt) — mêmes contrôles préremplis + **barre
   d'élément** commune : dupliquer · ordre z · timing · supprimer.
4. **Déplié** (immersif, ~55 %) — grille stickers, carte lieu, timeline. Le canvas
   reste visible et vivant au-dessus.

Moments d'apparition :

| Configuration | Moment | État Dock | Remplace |
|---|---|---|---|
| Texte nouveau | tap `Aa` → élément au centre, clavier levé, édition inline | Panneau (sur clavier), **sous-onglets Style · Police & graisse · Cadre & bordure · Langue** — réglages appliqués en direct ; l'onglet Langue déclare la langue d'ORIGINE de l'objet (préremplie par détection), qui alimente les traductions audience-driven | StoryTextEditorView + toolbar + topbar |
| Texte existant | tap = sélection ; double-tap = ré-édition inline | Inspecteur (mêmes sous-onglets préremplis) | TextEditFloatingBubbles + ToolOptions |
| Dessin | tap `✏️` → canvas en capture de traits ; le panneau reste ouvert tant que le mode est actif, chaque réglage (pinceau · épaisseur avec aperçu de pointe · couleur) s'applique au PROCHAIN trait | Panneau | StoryDrawingToolbar + bulles + options |
| Traits existants | tap un trait | Inspecteur (contrôle `list`) | DrawingStrokeList |
| Stickers | tap `☺` → Dock déplié mi-hauteur ; choix = posé au centre, repli | Déplié | StickerPickerView (sheet) |
| Son de fond | tap `♫` → onglets Bibliothèque / Fichier / Micro | Panneau | SoundLibraryPicker + fileImporter |
| Enregistreur | onglet Micro | Panneau | UnifiedAudioRecorderSheet |
| Média | tap photo/vidéo → trim, volume, fondus | Inspecteur | Video/ImageEditor (cas courant) |
| Lieu | tap `📍` (provider app-side conservé) | Déplié | LocationPicker (sheet) |
| Timeline | poignée ↑ ou `⏱` | Déplié (grand) | 32 vues Timeline |

Les 15 modales actuelles se réduisent aux 3 imposées par le système : caméra,
galerie, pickers système.

## 5. Un seul atelier — le format est un champ

La base l'affirme déjà (`PostType {POST, REEL, STORY, STATUS}` sur un seul `Post`).
Deux règles produit tiennent l'unification :

1. **Le texte du post EST le content.** En mode Post, le texte principal voyage en
   `Post.content` — indexé, traduit par `translatePost`, affiché natif dans le feed
   avec l'indicateur du Prisme. Les textes posés SUR le canvas restent des éléments.
2. **Le canvas voyage avec le post.** Tous les éléments partent dans le même blob
   v2 ; le feed les rend via le **CanvasPlayer** (le registre du Reader embarqué
   dans la carte) : autoplay en sourdine, boucle, tap = plein écran immersif.
   Composer un post riche = composer une story qui ne s'efface pas.

Réels : le même canvas en vidéo-first ; qualification serveur inchangée
(dégradation REEL → POST, `PostService.ts:203-225`).

## 6. L'acquis préservé (la rupture porte sur les vues, jamais sur les fondations)

Conservés tels quels : traduction pilotée par l'audience
(`triggerStoryTextTranslation`, `story:translation-updated`) · pipeline audio
Whisper → NLLB → TTS · `StoryPublishQueue` (778 l.) et `StoryDraftStore` (1 024 l.)
comme moteurs de l'Étagère · visibilité 6 niveaux + broadcast filtré · éphémère
sans destruction (20 h → archive, republish) · `contentEditedAt` → reset
d'engagement · TUS + `claimableMediaWhere` (généralisé au web) · moteur de gestes
du canvas UIKit (replié derrière l'API du Canvas, pas réécrit) ·
`clientMutationId` · capture de sons.

### Conventions d'affichage (audit lecteur iOS)

**Préservées** : `computedTotalDuration()` unique autorité de durée ·
`AudioChipDisplay.resolve` (soundId = emprunt → marquee « titre · @pseudo · M:SS » ;
piste propre → sinusoïde) · rail droit au plan figé à l'entrée du slide (aucun
bouton n'apparaît en cours de lecture) · barre de langues isomorphe à la barre de
réactions · traduction invisible (rendu natif + badge discret) · atomes animés
autonomes (marquee, décompte, sinusoïde en TimelineView interne) · hold 0,45 s +
slop 24 px · barres segmentées 3 pt · horodatage compact « 2h / 3j ».

**Ruptures assumées** : le réel refabrique son crédit sonore
(`borrowedSoundLabel`, pill statique) → l'atome partagé partout, décompte compris
(« Aïcha · ♫ Nuits d'été · 0:15 ») · le crédit d'en-tête ignore les sons
foreground → le résolveur considère toutes les pistes · deux échelles temporelles
→ la compacte partout · retour à l'original seulement via le picker → geste
« maintenir le texte » · badge langue à l'opposé du contenu → rejoint l'en-tête ·
rail à 8 entrées au bord du scroll → la feuille d'engagement absorbe le détail.

## 7. Une story = un réel temporaire

Une story publiée porte TOUTE la surface sociale d'un réel, servie par les mêmes
endpoints (c'est le même `Post`) : commentaires (thread commun aux 3 formats,
traduits par le Prisme), réactions comptées (`story:reacted`), réponse privée →
conversation, transfert & repost, traductions multi-langues + exploration de
l'original, liste des vues (`storyViews`), édition avec reset d'engagement.
**Unique écart : la fenêtre de visibilité (20 h, puis archive où l'engagement
reste consultable).**

## 8. Contrat partagé

- `CanvasV2` (Zod strict, versionné `v: 2`, stocké dans `Post.storyEffects`) —
  `packages/shared/schemas/canvas.ts`, source unique ; Swift généré.
- `PublishIntent { type, content?, canvas?, audience }` — un seul verbe de
  publication. STORY : content composé depuis les textes (index). POST : content
  = texte du post. REEL : canvas vidéo-first.
- Clé `background` canonique (mort de l'alias `backgroundColor`).

## 9. Impact

| Surface | Avant | Après |
|---|---|---|
| Vues composition iOS | ≈ 85 | 5 + 6 renderers + descripteurs (−87 %) |
| Vues composition web | 1 (incomplète) | les 5 mêmes (parité) |
| Composeurs parallèles | 4 | 1 |
| Modales depuis le composer | 15 | 3 |
| Contrats de publication | 2 asymétriques | 1 (file offline partout) |
| Validation serveur | passthrough 256 Ko | Zod strict versionné |
| Portes d'entrée | 7+ | 1 intention typée |
| Aperçu | vue dédiée (iOS) / absent (web) | le Reader en mode preview |
| Surface sociale des stories | partielle, divergente | identique aux réels (écart : 20 h) |

## 10. Migration en 6 phases (chacune livrable seule)

1. **Contrat** — CanvasV2 strict (v1 accepté en transition) + correctifs web
   (TUS, `background`, TTL 20 h). Corrige les bugs de production.
2. **Noyau** — registre d'éléments + Canvas, branché côté lecture d'abord.
3. **Dock** — descripteurs, migration outil par outil, timeline repliée.
4. **Étagère & publication** — fusion tray/archive/brouillons, porte unique,
   file offline pour l'édition ; feuille d'engagement commune aux 3 formats.
5. **Un seul atelier** — sélecteur de format, `content` mappé, CanvasPlayer
   dans le feed, réels.
6. **Démolition** — code mort, composeurs legacy, support v1, doc Prisma.

## 11. Carte d'intégration des features existantes (addendum 2026-08-15)

Inventaire exhaustif des six surfaces de création (StoryComposer, PostComposer,
AudioPostComposer, FeedComposerSheet, composer inline, StatusComposer) :
**39 features recensées**, chacune reçoit UNE destination. Bugs supplémentaires
découverts et corrigés par le passage au contrat :
- médias des posts web jamais rattachés (`/attachments/upload` → `MessageAttachment`
  vs claim `postMedia`) ⇒ **aucun réel web n'a jamais existé** (dégradation
  systématique faute de médias) ;
- chemins iOS inline qui perdent `visibility` et `location`
  (`FeedView+Attachments.swift:369-378`) ;
- `PostMedia.order` jamais écrit (tri de lecture sur une constante 0) ;
- `originalLanguage` jamais envoyée par le web pour un post ordinaire ;
- `visibilityUserIds` jamais transmis par `PostService.swift` iOS ;
- `RepostSchema.visibility` rempli par aucun chemin feed ;
- `allowSoundExtraction` déclaré, jamais envoyé.

| Destination | Features intégrées |
|---|---|
| **Barre de publication** | visibilité 6 niveaux + EXCEPT/ONLY (iOS transmet enfin) · langue de publication (héritée par les textes) · qualification réel affichée · repost/quote (`repostOfId` au create, audience comprise) · lieu-métadonnée + découvrabilité (`discoverabilityPrecision`, premier client) · communauté |
| **Dock** | texte content + compteur 5 000 partagé (iOS sans limite aujourd'hui) · mentions @/# autocomplétées (contrôleur des commentaires réutilisé) · médias TUS + éditeurs via Inspecteur · audio 3 onglets (micro/fichier/bibliothèque) · transcription live · `allowSoundExtraction` en toggle |
| **Canvas** | slides ↔ carrousel (`PostMedia.order` écrit à l'index) · son emprunté = élément audio standard · tous les objets story servent post/réel |
| **Amorce** | caméra/galerie/texte/dernière capture · audio express (raccourci publiant direct, même PublishIntent) · humeur STATUS (raccourci distinct) |
| **Étagère** | brouillons + outbox durable généralisés au web · offline pour l'audio aussi · édition = intent `edit` (atelier complet, `UpdatePost.mediaIds` vivant) |
| **Serveur (auto)** | extraction mentions/hashtags · liens tracés · Whisper · `hasAnyContentCarrier` · idempotence · rate limit · dégradation REEL→POST — inchangés |

Inexistantes partout (hors périmètre, accueillies plus tard comme contrôle/champ,
jamais comme vue) : sondages, programmation, alt text, désactivation des
commentaires.

### Cas complexes — deux options, recommandation

| Cas | Option A | Option B | Reco |
|---|---|---|---|
| C1 Mentions/# | autocomplétion champ content seul | élément « mention » tappable du canvas | **A** (phase 5), B ensuite (extension kind sticker) |
| C2 Audio express | tout par le canvas (audio-first) | raccourci micro d'Amorce → publier direct, même PublishIntent | **B par-dessus A** (les 3 chemins iOS divergents meurent) |
| C3 Carrousel | 1 slide = 1 carte, order écrit | pas de slides en Post, grille de médias | **A** (un seul modèle mental) |
| C4 Repost | repostOfId dans PublishIntent (audience comprise) | garder /repost + envoyer enfin visibility | **A** ; B = correctif d'attente |
| C5 Lieu | pastille et métadonnée indépendantes | une source, deux rendus (+ toggle découvrabilité) | **B** (fuite iOS impossible) |
| C6 Langue | par objet seulement | langue de publication héritée + surcharge par objet | **B** (Prisme fiable partout) |
| C7 Édition | intent edit = atelier complet | inline léger + escalade atelier | **A** socle, B raccourci contextuel |
