# Le contrat de la visionneuse plein écran

> Issue isopen-io/meeshy#8879 — directive porteur du 2026-09-30 : « lorsqu'on a une image ou une scène en plein écran, que ce soit l'image d'un commentaire, d'une publication, d'une conversation, une story ou un réel, avoir une manière similaire de répondre, de réagir au contenu, d'afficher les contrôles, sauf si les visions diffèrent vraiment ».
>
> Portée : `apps/web` (web, PWA, coque Android). Le Kotlin natif est gelé et n'est pas concerné. L'état d'avancement de l'adoption est suivi dans les issues, pas dans ce document.
>
> Primitives : `apps/web/src/components/viewer-chrome.tsx`, `viewer-chrome-menu.tsx`, `viewer-chrome-gestures.ts`, `apps/web/src/styles/viewer-chrome.css`.

## 1. Ce qui existait (relevé du 2026-09-30)

Quatre plein écrans, et donc quatre façons de faire la même chose.

| | Média de conversation, scène de publication, pièce citée, écran « Médias » (`MediaViewer`) | Story (`routes/story.tsx`) | Réel (`routes/reels.tsx` + `reel-page.tsx`) |
|---|---|---|---|
| Sortie | ✕ en haut à **gauche**, disque blanc 15 %, 40 px | ✕ en haut à **droite**, disque noir 20 %, 44 px | ‹ en haut à **gauche**, disque noir 42 %, 44 px |
| Identité | en **bas** : avatar 24, nom, date, cotes et poids | en **haut** : avatar 32, nom, heure sur une ligne | en **bas** : avatar 36, nom, heure |
| Menu « … » | aucun (« Enregistrer » est un bouton direct) | oui : « Enregistrer » | aucun |
| Actions | colonne à droite du cadre : Réagir (ouvre une traînée d'émojis), Répondre, Créer avec ce média. Disque noir 55 %, 40 px dans 44, écart 8 | rail en bas à droite : son, réagir (❤︎), répondre, transférer, vues, partager, enregistrer, commentaires. Disque noir 35 %, 44 px, écart 12 | rail en bas à droite : j'aime, commenter, enregistrer, repartager, partager, son. Disque noir 38 %, 44 px, écart 12 |
| Répondre | bouton de colonne : ferme la visionneuse et arme la citation dans le composeur du fil | bouton de rail : ouvre la feuille de commentaires | bouton « commenter » : ouvre la feuille de commentaires |
| Légende | `text-title`, sans limite | `text-body`, 4 lignes | `text-check`, 3 lignes |
| Glisser vers le bas | ferme (≥ 150 px, la scène suit le doigt) | **rien** | page suivante (défilement vertical) |
| Glisser à l'horizontale | page suivante ou précédente (≥ 60 px) | rien (navigation par toucher des bords) | rien |
| Toucher | bascule chrome ⇄ plein cadre | tiers gauche : précédente, tiers droit : suivante | lecture ⇄ pause |
| Appui long | plein cadre et pause (500 ms) | pause et chrome masqué (450 ms) | rien |
| Clavier | Échap, ← →, Espace, piège de Tab | Échap, ← →, Espace, M | Échap, ↑ ↓ |
| Annonces | une région vivante **par bouton** (`Notice`) | une région vivante à la racine | une région vivante à la racine |

iOS lui-même n'est pas homogène : la galerie (`ConversationMediaGalleryView`) pose la croix à gauche et le menu « … » à droite ; le lecteur de stories (`StoryViewerView+Header.swift`) pose l'identité à gauche, puis le menu et la croix à droite ; le lecteur de réels (`ReelsPlayerView.swift`) pose un chevron de retour à gauche. La directive du 2026-09-30 est postérieure à ces trois choix et les arbitre.

Deux entrées de la liste de départ ne sont **pas** des visionneuses :
- `comment-image-sheet*.tsx` est l'atelier « Imager un commentaire » (une feuille d'export), pas un plein écran d'image. Il n'entre pas dans ce contrat.
- `story-rail*.tsx`, `stories*.tsx`, `stories-mine.tsx` et `reel-offer-dialog.tsx` sont des écrans de **liste** ou des dialogues qui **ouvrent** une visionneuse. Ils n'ont pas de chrome plein écran à aligner.

## 2. L'anatomie commune

Un plein écran, c'est une **scène** toujours sombre, avec trois zones de chrome posées dessus. Le chrome ne suit pas le schéma clair ou sombre de l'application : il suit la photo d'en dessous, qui n'a aucune raison de suivre ce schéma.

```
┌─────────────────────────────────────────────┐
│ [au-dessus : progression de la story]       │  ViewerTopBar
│ (‹)  ◉ Noa Berger · 2 h           (…)  (✕)  │  voile haut
│                                             │
│                                             │
│                SCÈNE (média)                │
│                                             │
│                                       (♥)12 │
│ Légende servie par le Prisme,         (💬)3 │  ViewerBottomBar
│ quatre lignes au plus                 (↗)   │  rangée : légende | rail
│ ╭─────────────────────────────────────────╮ │
│ │ Écrire un commentaire…                  │ │  capsule « Répondre… »
│ ╰─────────────────────────────────────────╯ │
│ [transport vidéo] [pellicule]               │  ce qui PARCOURT le média
└─────────────────────────────────────────────┘  voile bas + encoche basse
```

### 2.1 La barre haute — `ViewerTopBar`

- **Sortie.** `kind: 'close'` (✕, **en fin de barre**) pour une visionneuse posée **par-dessus** ce qu'on regardait : média, scène, pièce citée, story. `kind: 'back'` (‹, **en tête**, retourné en écriture de droite à gauche) pour un écran qu'on a **poussé** et qui a sa propre adresse de liste : les réels. La sortie est **toujours montée**, y compris pendant le chargement et sur l'état d'erreur : c'est la seule porte quand rien d'autre ne marche.
- **Identité.** Avatar 32, nom, heure, sur **une** ligne : l'heure qualifie l'auteur, elle n'est pas un sous-titre. L'avatar et le nom mènent au profil, sauf sur son propre contenu (`profileUsername` absent). Même avatar que la tuile qui a ouvert la visionneuse : passer d'un visage à des initiales en ouvrant serait un changement d'identité en plein geste.
- **Menu « … »** (`ViewerMenu`), entre l'identité et la croix. Il porte ce qui n'est pas un geste du pouce : Enregistrer, Partager hors de Meeshy, Signaler. Une entrée sans effet n'existe pas ; un menu sans entrée n'existe pas.
- **Au-dessus** (`above`) : ce qui se pose au-dessus de la ligne. Aujourd'hui, seuls les segments de progression d'une story.
- **Placement.** `overlay` : posée sur la scène, avec le voile haut. `corridor` : dans le couloir noir au-dessus d'un plateau (la visionneuse de médias en mode « carte »).

### 2.2 Le rail — `ViewerActionRail`

- Colonne verticale au **bord de fin**, en bas, dans la même rangée que la légende : la légende ne peut donc **jamais** passer dessous (défaut mesuré sur la story, où il fallait un couloir de 60 px recopié chez l'hôte).
- Chaque action : un **disque de verre de 40 dans une cible de 44** (`MediaStageActionColumn`, iOS : « le verre fait 40, la cible fait 44 »), écart **8** entre deux actions. Le compteur, quand il est non nul, s'écrit sous le disque et **entre dans le nom accessible** (« Réagir 12 »).
- Le rail porte **ce qu'on fait au contenu** : réagir, commentaires (lire le fil, avec son compteur), repartager, enregistrer dans ses favoris, partager, enregistrer sur l'appareil, créer avec ce média, son, vues, traductions. L'ordre est celui que la loi de chaque visionneuse déclare (`lib/stories/action-rail.ts`, `ReelActionRail`, `mediaPageOffers`) : le rail parcourt une liste, il n'en décide pas.
- **Réagir.** Sur une publication (story, réel), un toucher pose ou retire le cœur, et l'état se lit par `aria-pressed` et l'encre `--ios-error`. Sur une pièce de message, un toucher ouvre la traînée d'émojis (`ViewerReactionTray`), ancrée à gauche du bouton : les messages portent des réactions multiples, les publications un seul « j'aime ». C'est la même place et le même geste d'entrée ; seule la charge diffère, parce que les deux objets diffèrent.
- **Son.** Bouton bascule en tête du rail : le son décrit ce qui **se passe**, les autres décrivent ce qu'on peut **faire** (arbitrage #4508).

### 2.3 La barre basse — `ViewerBottomBar`

- **Rangée** : la légende à gauche (servie par le Prisme, avec son `lang=`, `text-body`, quatre lignes au plus), le rail à droite.
- **La capsule « Répondre… »** (`ViewerReplyCapsule`) : l'**entrée unique** de la réponse, au même endroit sur tous les plein écrans, en verre, pleine largeur, 44 de haut. Elle existe si l'hôte sait répondre, et seulement alors :
  - story et réel : elle ouvre la feuille de commentaires, composeur prêt ;
  - pièce d'une conversation : elle ferme la visionneuse et arme la citation de la pièce dans le composeur du fil (`MediaViewerPage.onReply`) ;
  - écran « Médias, liens et documents » : pas de capsule, cet écran ne sait pas répondre (`reply: false`).
  Le rail ne répète **pas** « Répondre » : un contrôle par effet (D-11). « Commentaires » reste dans le rail, parce que lire le fil et y écrire sont deux intentions.
- **Sous la capsule** : ce qui parcourt le média, la barre de lecture d'une vidéo et la pellicule.
- **Encoche** : `var(--safe-top)` et `var(--safe-bottom)`, jamais `env()` recopié écran par écran.

### 2.4 La matière

- Disques, capsule, traînée d'émojis : `VIEWER_GLASS` (= `glass-call`, `styles/glass.css`), le verre sombre déjà mesuré AA contre le pire cas, du blanc pur passant dessous. Encre blanche. On ne réécrit jamais un fond de verre (`scripts/lib/glass-site.mjs`).
- Voiles : `.viewer-scrim-top` et `.viewer-scrim-bottom` (`styles/viewer-chrome.css`), en `mediaBackdrop` du SDK (`--ios-media-backdrop`) à 55 % puis 28 %, les valeurs que `check-story-scene.mjs` mesure déjà.
- Couleurs d'état : celles du SDK et de leur sens, sans exception. Cœur posé : `--ios-error` (le rouge HORS SCHÉMA du SDK : `--color-error` suit le schéma et tombe sous 3:1 sur le verre sombre en clair). Repartage posé : `--color-ok` (même défaut en clair, gardé tant que `check-reels.mjs` l’exige — suivi #8879). Badge de langue : `--ios-indigo-500`. Menu : `--color-ios-card`, `--color-edge`, `--color-ios-ink`.
- Couleurs laissées libres : le fond et le texte d'une story (choisis par l'auteur), les couleurs d'une scène, l'accent d'une conversation qui teinte un avatar. Le chrome ne les recopie pas, il se pose dessus.

## 3. Les gestes

| Geste | Effet commun | Primitive |
|---|---|---|
| Glisser vers le bas ≥ 150 px | **ferme**, la scène suit le doigt pendant la descente | `useViewerSwipe({ onDismiss, follow })` |
| Glisser à l'horizontale ≥ 60 px | élément **suivant** (vers le début de ligne) ou **précédent**, retourné en droite à gauche | `useViewerSwipe({ onNext, onPrevious, rtl })` |
| Glisser vers le haut ≥ 150 px | remis à l'hôte (`onUp`) : plein cadre pour la visionneuse de médias, rien ailleurs | `useViewerSwipe({ onUp })` |
| Appui long | **tenir** : pause et chrome masqué, tant que le doigt reste posé | chez l'hôte (`useLongPress`, loi de la story) |
| Échap | ferme le menu ou la feuille ouverte s'il y en a une, sinon la visionneuse | `ViewerMenu` consomme Échap en capture |
| ← → | élément précédent ou suivant | chez l'hôte |
| Espace | lecture ⇄ pause d'un média qui se lit | chez l'hôte |
| Retour du navigateur ou du téléphone | ferme, sans entrée d'historique fantôme | `useBackDismiss` |

- Un toucher qui a bougé de plus de 10 px n'est pas un toucher (`wasDrag()`, lisible dans le `click` qui suit).
- Un second doigt (pincement) n'arme aucun glissé.
- Une feuille ouverte par-dessus, ou une image zoomée, désactive les glissés (`enabled: false`).
- Toucher un contrôle ne remonte jamais au plateau : toutes les primitives coupent `pointerdown`, `pointerup` et `click`.

## 4. Les états

- **Chargement.** Cache d'abord : l'affiche, la vignette ou le ThumbHash s'affiche tout de suite. Un squelette n'apparaît que sur un cache vide, jamais un indicateur de chargement par-dessus un contenu déjà là. La sortie reste montée.
- **Média introuvable ou illisible.** `MediaUnavailable` (le même état dessiné pour les trois surfaces, #7022), avec « Réessayer » seulement si l'échec est transitoire. Jamais l'icône brisée du navigateur.
- **Hors ligne.** Ce qui est en cache se lit. Une action qui échoue hors ligne le dit dans la région vivante (« Hors ligne — réessayez une fois connecté »).
- **Média protégé** (vue unique, flou, chiffré, éphémère — au niveau du message comme de la pièce). Page masquée, sans URL ni vignette. **Aucune** action : ni rail, ni capsule, ni entrée de menu, ni partage. La garde vit à l'existence du bouton (`mediaPageOffers`), jamais d'un bouton qui refuserait après le toucher.
- **Chrome qui cède.** Une feuille ouverte (commentaires, vues) ou un appui long masque la barre haute, le rail et la barre basse **ensemble** (`chromeYields`). Masqué veut dire inerte : ni doigt, ni clavier, ni lecteur d'écran (D-90). La scène et la feuille restent.
- **Annonces.** **Une** région vivante par visionneuse, montée à sa racine : l'issue d'un geste (réaction refusée, enregistré, hors ligne) s'y dit, et nulle part ailleurs.

## 5. L'accessibilité

- Une visionneuse posée par-dessus est un `dialog` modal nommé (« Média 2 sur 5 », « Story de Noa »). Le focus entre sur la sortie, reste piégé dans le dialogue (Tab), et revient à ce qui l'a ouvert à la fermeture. Le reste de l'application est `inert`.
- Chaque bouton à glyphe seul a un nom. Un compteur entre dans le nom. Une bascule (cœur, muet) dit son état par `aria-pressed`, jamais par un libellé qui change.
- Le rail est une `toolbar` verticale nommée ; la traînée d'émojis un `group` nommé ; le menu un `menu` de `menuitem`.
- Cibles de 44 × 44 au moins, partout, y compris la capsule.
- Contraste AA sur la pire image, garanti par le verre et les voiles ci-dessus, pas par l'image.
- Mouvement réduit : les fondus du chrome tombent à zéro.
- Écriture de droite à gauche : le rail est au bord de **fin**, le chevron de retour se retourne, le glissé horizontal se retourne.

## 6. Les divergences assumées

Une divergence n'est admise que si la **vision** du contenu diffère, jamais par habitude. Chacune est nommée ici ; toute autre différence entre les plein écrans est un défaut à corriger.

1. **La story avance seule, et se lit par segments.** Segments de progression en haut, avance automatique, toucher des tiers gauche et droit pour changer de story. Une story est une **séquence minutée** : son toucher navigue là où celui d'une photo bascule le chrome. Le glissé horizontal et le glissé vers le bas du contrat s'y ajoutent.
2. **Le réel est un fil vertical.** Glisser verticalement passe au réel suivant ; on en sort par le chevron ‹, Échap ou le retour, jamais en glissant vers le bas. Le toucher y met en pause. Sa progression est un filet de 3 px en bas.
3. **L'identité du réel est en bas, avec sa légende.** Dans un fil vertical, l'identité appartient au bloc de contenu de la page et défile avec elle ; la barre haute, fixe, ne porte que la sortie. C'est la disposition d'iOS (`ReelPageView`).
4. **La visionneuse de médias a une pellicule et un plateau.** Pellicule dans le couloir bas quand il y a plus d'une pièce ; le toucher bascule entre la « carte » (média entre deux couloirs noirs) et le plein cadre ; double toucher : zoom d'une image, ±10 s sur les bords d'une vidéo. Une conversation se **parcourt**, une story se **regarde**.
5. **Réagir n'a pas la même charge.** Un toucher pose le cœur d'une publication ; il ouvre la traînée d'émojis d'une pièce de message (voir § 2.2).
6. **La visionneuse de médias se pose dans une feuille** quand elle en part (`container`, #8103) : la couche supérieure du navigateur l'impose, pas une vision.

## 7. Ce qui reste à faire

Suivi dans les issues ouvertes avec #8879 : l'adoption par chaque visionneuse (plan dans la sortie du lot et dans l'issue), les clés de catalogue manquantes (`viewer.close`, `viewer.options`, `viewer.reply_placeholder`), un alias neutre du verre sombre (`glass-call` porte le nom de l'appel), le plein écran des médias d'une publication et d'un commentaire (iOS : `CommentMediaGallery.swift`, que le web n'ouvre pas encore), et la barre de réponse en place d'iOS (`MediaReplyComposerBar`, répondre sans quitter le plein écran).
