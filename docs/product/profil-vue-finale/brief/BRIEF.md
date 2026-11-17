# Profil Meeshy — vue cible · BRIEF commun à toutes les planches

Tu écris UNE planche (artboard) d'un canevas de design. Chaque planche est un fichier SOURCE `.dc.html`
dans `docs/product/profil-vue-finale/src/`
(JAMAIS dans `project/`, que le montage fabrique). Trois jetons sont remplacés au montage :
`[[kit]]` (tout le CSS du kit), `[[map]]` (le SVG du fond de carte), `[[ic:nom]]` (une icône).
La planche de référence, à LIRE EN ENTIER avant d'écrire, est `src/Main.dc.html` :
elle fixe le ton, la densité, la structure des fichiers et le niveau de finition. Ta planche doit avoir
l'air d'avoir été dessinée par la même main.

Toute la copie est en FRANÇAIS, tutoiement, phrases courtes, zéro jargon. Jamais d'émoji. Jamais de lorem ipsum.

---------------------------------------------------------------------------------------------------

## 1. La doctrine : un profil a TROIS FACES

Aujourd'hui tout est mélangé dans une longue fiche à onglets. La vue cible sépare trois choses que
l'utilisateur confondait, et les rend reconnaissables au premier regard par leur FORME, pas seulement
par leur titre :

| Face | Ce que c'est | Signature visuelle (à respecter partout) |
|---|---|---|
| **Vitrine** | QUI je suis, ce que les autres voient de moi. La page publique `meeshy.me/u/pseudo` en est la version « cercle Public ». | Immersif, plein cadre : bannière vivante (deux orbes qui flottent), avatar à anneau, couleur d'ACCENT de la personne (`--accent`), titres Nunito. Aucune carte « formulaire ». |
| **Liens** | Tout ce qui AMÈNE des gens vers moi : lien de profil, QR, mes adresses (site, réseaux), liens de partage de conversation, liens de suivi `/l/…`, liens de communauté, parrainage. | Des **billets** (`.ticket` : carte à encoches + pointillé), adresses en `JetBrains Mono` (`.mono`), indigo de marque, un code couleur par famille : partage `--l-share`, suivi `--l-track`, communauté `--l-comm`, parrainage `--l-aff`. Chiffres de clics en gros. |
| **Actions** | Ce que je peux FAIRE avec cette personne ou sur ma fiche : écrire, appeler, talkie, regarder ensemble, bring, la voir sur la CARTE, partager ma position, envoyer le profil, bloquer, signaler. | Des **boutons ronds de verre** (`.ib.g`, 56–64 px) rangés en grille, libellé dessous ; les actions destructives en bas, séparées, en `--err`. Le plus tactile des trois. |

Le sélecteur de face est **en bas**, dans la zone du pouce : une pilule de verre flottante
`Vitrine · Liens · Actions` (`.seg`), la face active en plein (`.on`). À sa droite, un bouton rond
contextuel (Vitrine d'un autre → Écrire ; Liens → + créer ; Actions → rien).
- iOS : verre liquide (flou + reflet), la pilule active GLISSE et se déforme d'une face à l'autre.
- Android : même place, mais « barre flottante » Material 3 Expressive : surface TONALE opaque
  (`--field`), pas de flou, FAB carré-arrondi (rayon 18) à droite, formes qui se métamorphosent.
- Web large : les trois faces sont TROIS COLONNES visibles ensemble ; le sélecteur n'existe qu'en mobile.

« Voir comme » : sur ma propre Vitrine, une pilule « Vue par : Public ▾ » fait défiler ma fiche telle
que la voit chaque cercle (Public < Communauté < Connaissance < Ami < Proche < Sang). C'est ce qui rend
la page publique tangible : ce n'est pas une autre page, c'est ma Vitrine au niveau Public.

La CARTE est une action, pas un onglet : l'avatar se détache de la fiche, rétrécit et devient
l'épingle sur la carte (morphing) ; la fiche devient une feuille basse.

---------------------------------------------------------------------------------------------------

## 2. Ce que le produit porte déjà (ne rien inventer en dehors de ça et de la liste « Nouveau »)

Cercles (loi `relation-access.ts`) — ce que chaque niveau voit EN PLUS :
- **Public** : profil public (bannière, avatar, nom, pseudo, bio, décor, publications publiques,
  échantillon de voix si public), demande de message, sonnerie d'appel. Jamais la présence.
- **Communauté** : identité dans « qui a vu ».
- **Connaissance** : message direct, accusés de lecture, frappe, stories « Connaissances ».
- **Ami** : présence BINAIRE (« en ligne » ou rien), jeu de base (niveau, titres, rang), Bring 1/jour,
  position temporaire (1 h / 8 h ; ville / quartier / exact).
- **Proche** : présence détaillée (en ligne / absent / « vu il y a… »), étincelles et gloire, Talkie
  (« Maintenir pour parler »), Ensemble (regarder / écouter ensemble), batterie, téléphone
  injoignable, Bring 3/jour, stories « Proches ».
- **Sang** : position continue, historique 30 jours, proximité, relevé de batterie à la demande,
  Bring 30/jour, audience Sang.
Présence : vert `#34D399` (pulse) en ligne · orange `#FBBF24` absent · gris `#9CA3AF` inactif ·
hors ligne = AUCUN point.

Ma fiche (existe) : bannière + avatar (photo, décor de packs : contour d'avatar, bannière, cadre),
badge de jeu sur la bannière (niveau, étincelles, rang), nom, @pseudo, « Sur Meeshy depuis mars 2026 »,
Mes cercles (5 pastilles avec compte + « N demandes à répondre » + Inviter), Identité (prénom, nom,
nom affiché, bio 500 c.), Contact (e-mail, téléphone, pastille Vérifié / Non vérifié), Langues du
Prisme (principale, 2e choix, 3e choix), Mon activité (Messages · Conversations · Traductions),
Ma Légende (progression), Décor, Partager ma batterie, Prévenir mes Proches si mon téléphone est
injoignable, Mes contenus (Messages favoris · Publications enregistrées · Mes packs).

Fiche d'un autre (existe) : anneau de story, humeur (statut 1 h), présence, écoute en cours, bio,
langues, fuseau, pays, chiffrement de bout en bout, voix (échantillon du clone vocal si public),
statistiques (Membre depuis, Messages, Traductions, Langues, Jours), conversations en commun,
publications. Actions : appel vocal, appel vidéo, message, demande de connexion (Envoyer / Annuler /
Renvoyer / Accepter / Refuser / « Connectés »), cercle (« Soyons proches », « Restons amis »,
« Annuler le lien »), Talkie, Bring, Ensemble, Partager ma position, Batterie, Téléphone injoignable,
Bloquer / Débloquer, Signaler (8 motifs : spam, inapproprié, harcèlement, violence, haine, faux
profil, usurpation, autre).

Liens (existe) : hub « Mes liens » en 4 familles — partage de conversation (quotas, expiration,
invités anonymes, champs requis, pays/langues autorisés, arrivées avec pays), suivi `/l/jeton`
(cible : publication, réel, story, statut, conversation, PROFIL, adresse externe ; UTM ; clics avec
pays, ville, appareil, navigateur, source), communauté, parrainage (code, QR, filleuls).

Carte (existe) : positions partagées avec moi (épingles, cercle de flou selon la précision), partager
ma position depuis la fiche. Côté serveur seulement : position Sang continue + historique + mode fantôme.

**Nouveau** (proposé par cette planche — à signaler par l'étiquette `.new` « Nouveau » quand le
composant apparaît pour la première fois sur ta planche, une seule fois) :
lien et QR de profil sur iOS et web · adresse courte `meeshy.me/@pseudo` · « Mes adresses » (liens
personnels : site, réseaux) · aperçu de lien riche par personne · « Voir comme » par cercle · amis en
commun · communautés en commun · médias partagés sur la fiche · couleur d'accent CHOISIE · ville
affichée · carte des visiteurs d'un lien · carte de tous mes proches · position Sang et mode fantôme
côté client · envoyer le profil depuis iOS · partage par contact (NFC / rapprochement).

---------------------------------------------------------------------------------------------------

## 3. Personnages et données (les MÊMES sur toutes les planches)

- **Moi** : Aïssa Ndiaye · `@aissa` · accent `#A855F7` (clair sur sombre : `#D8B4FE`) · Dakar ·
  bio « Designer sonore à Dakar. Je parle wolof, j'écris en français, je rêve en anglais. » ·
  langues : Français (principale), Wolof (2e), Anglais (3e) · sur Meeshy depuis mars 2026 ·
  cercles : Communauté 128 · Connaissance 46 · Ami 31 · Proche 9 · Sang 3 · 2 demandes à répondre ·
  activité : 12 480 messages · 86 conversations · 9 310 traductions · jeu : niveau 24, 1 860
  étincelles, rang Or III · e-mail vérifié, téléphone non vérifié.
  Lien de profil `meeshy.me/@aissa` (canonique `meeshy.me/u/aissa`). Code de parrainage `AISSA-7K2`, 14 filleuls.
  Mes adresses : `aissandiaye.studio` (Site), `soundcloud.com/aissa` (Musique), `instagram.com/aissa.snd` (Photos).
  Liens : partage « Studio — invités » `meeshy.me/chat/studio-invites` (23 arrivées / 50, expire dans 6 j) ;
  suivi « Réel Dakar la nuit » `meeshy.me/l/dkr-nuit` (1 284 clics, 31 pays) ;
  suivi « Mon profil » `meeshy.me/l/aissa` (412 clics) ; communauté « Beatmakers Dakar » `meeshy.me/c/beatmakers` (342 membres).
- **L'autre** : Léo Marchetti · `@leo.m` · accent `#4ECDC4` · Lisbonne · bio « Photographe de rue.
  Lyon ⇄ Lisbonne. » · langues Italien, Français, Portugais · membre depuis janvier 2026 ·
  relation avec moi : **Proche** · en ligne · humeur « En vadrouille » · écoute en cours ·
  position partagée : quartier d'Alfama, précision « quartier », encore 42 min · batterie 64 % ·
  6 conversations, 3 communautés, 12 amis en commun.
- Figurants : Mina Okafor (`#FF6B6B`), Tomás Ribeiro (`#F8B500`), Yuki Tanaka (`#3498DB`),
  Sofia Benali (`#2ECC71`), Kwame Mensah (`#9B59B6`).

Pas de photo réelle : un avatar = pastille ronde à la couleur d'accent de la personne avec ses
INITIALES (c'est le vrai repli de l'app). Une image = `.ph` (emplacement hachuré) avec un libellé
court (« photo », « réel 0:24 »). Une bannière = dégradé de l'accent + deux orbes animées (`.orb`).

---------------------------------------------------------------------------------------------------

## 4. Format `.dc.html` — règles qui cassent en silence si on les rate

Squelette EXACT (copie celui de `Main.dc.html`) :

```
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>…nom de l'écran…</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="https://fonts.googleapis.com/css2?family=Nunito:wght@700;800;900&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap" rel="stylesheet">
<style>
[[kit]]
…puis, au besoin, quelques règles propres à la planche…
</style>
</helmet>
<div class="mx" style="width: 390px; min-height: 844px; …">
…
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{"$preview":{"width":390,"height":844}}'>
class Component extends DCLogic {
renderVals() {
return {};
}
}
</script>
</body>
</html>
```

- La ligne `<script src="./support.js"></script>` reste EXACTE. Le bloc `<script type="text/x-dc" …>` final est obligatoire.
- UNE seule racine dans `<x-dc>` après `<helmet>` : `<div class="mx" …>` (ajoute `data-theme="light"` pour le thème clair).
- Ferme TOUS les éléments non vides, mets TOUS les attributs entre guillemets doubles. Pas de balise auto-fermante hors éléments vides HTML (`<img>`, `<br>`, `<input>`) ; dans un `<svg>`, écris `<path d="…"></path>`, `<circle …></circle>`.
- N'écris JAMAIS `{{` ou `}}` dans le balisage (c'est la syntaxe des trous). Tout est du balisage LITTÉRAL : pas de `<sc-for>`, pas de `<sc-if>`, pas de script qui fabrique du DOM. (Seule la planche Prototype utilise état et événements.)
- La mise en page est en `style="…"` EN LIGNE (flex ou grid + `gap`) ; les classes du kit ne portent que l'apparence des composants. N'invente pas de nouvelles classes de mise en page ; quelques règles propres à la planche sont admises dans le `<style>` (animations, pseudo-éléments).
- Largeur de la racine FIXE (390 téléphone iOS, 412 Android, 1440 planche système) ; hauteur NATURELLE (`min-height` seulement, pas de `height` fixe ni d'`overflow:hidden` sur la racine) : je mesure et je cadre ensuite. Rien en `position:fixed`. La barre du bas est `position: sticky; bottom: 0` ou simplement le dernier bloc.
- Planches PAGE web (1440) : racine fluide `width:100%` avec conteneur `max-width`, grilles en `repeat(auto-fit, minmax(min(320px,100%),1fr))`, lisible à 390 px.
- AUCUNE fausse barre d'état (pas d'heure, de batterie, de réseau en haut), aucun faux clavier, aucun cadre de téléphone dessiné. Laisse 54 px vides en haut (zone sûre) et 24 px en bas.
- Vrais éléments : `<button>` pour toute commande, `<a href="#">` pour un lien, `<input>` + `<label>`. Jamais de `onclick` sur un `div`. `aria-label` sur tout bouton à icône seule. SVG décoratif : `aria-hidden="true"`.
- Cibles tactiles ≥ 44 px. Texte : contraste ≥ 4.5:1 (n'utilise pour le texte que `--ink`, `--ink2`, `--ink3`, et sur un aplat d'accent du texte SOMBRE `#0B0B12`). Blanc autorisé seulement sur `--brand-fill`.
- Réseau : rien d'autre que le `<link>` Google Fonts ci-dessus. Pas d'`<img>` externe, pas d'`<iframe>`.

### Icônes — jeton `[[ic:nom]]`, jeu Phosphor du dépôt (celui de `apps/web`)
Écris `[[ic:map-pin]]` là où tu veux l'icône : le montage le remplace par
`<svg class="ic" viewBox="0 0 256 256" aria-hidden="true"><path …></path></svg>`.
Taille en second mot : `[[ic:map-pin s]]` 16 px · (rien) 22 px · `[[ic:map-pin l]]` 28 px · `[[ic:map-pin xl]]` 36 px.
La couleur est celle du texte du parent (`color:` en ligne). N'écris JAMAIS un `<svg>` d'icône à la main.
Noms disponibles : la première colonne de `brief/ICONS.txt` (lis-la avec `cut -d'|' -f1 brief/ICONS.txt`),
et tout nom du jeu complet (`ls /home/user/meeshy/node_modules/@phosphor-icons/core/assets/regular/`,
sans `.svg`). Variante pleine : suffixe `-fill` (état ACTIF : face sélectionnée, cœur aimé, lecture en cours).
Jamais d'émoji, jamais de caractère Unicode décoratif à la place d'une icône.
Vocabulaire FIXE (même idée ⇒ même icône partout) :
Vitrine `user-focus` · Liens `link` · Actions `lightning` · message `chat-circle` · appel `phone` ·
vidéo `video-camera` · talkie `radio` · ensemble `monitor-play` · bring `hand-waving` ·
carte `map-trifold` · position `map-pin` · itinéraire `navigation-arrow` · fantôme `ghost` ·
QR `qr-code` · scanner `scan` · partager `export` · envoyer le profil `paper-plane-tilt` · copier `copy` ·
sans contact `contactless-payment` · modifier `pencil-simple` · voir comme `eye` · batterie `battery-medium` ·
injoignable `phone-slash` · traduction `translate` · voix `waveform` · jeu `trophy` · étincelles `sparkle` ·
cercles `circles-three` · Public `globe` · Communauté `users-three` · Connaissance `hand-waving` ·
Ami `handshake` · Proche `fire` · Sang `drop` · bloquer `prohibit` · signaler `flag` ·
chiffré `lock-key` · vérifié `seal-check` · lien de partage `chats-circle` · lien de suivi `cursor-click` ·
lien de communauté `users-four` · parrainage `gift` · adresse perso `globe-hemisphere-west` ·
clics `chart-line-up` · réglages `gear-six` · plus `dots-three` · fermer `x` · retour `caret-left`.

---------------------------------------------------------------------------------------------------

## 5. Le kit (`brief/kit.css`, lis-le) — inséré par le jeton `[[kit]]` en tête du `<style>` du `<helmet>`

Jetons : `--ground --raised --field --deep --line --ink --ink2 --ink3 --brand --brand-fill --brand-soft
--ok --warn --err --info --accent --accent-ink --glass --glass-line --l-share --l-track --l-comm --l-aff`.
Pour une fiche de Léo, pose `style="--accent:#4ECDC4;--accent-ink:#7FE3DC"` sur la racine.

Classes : `.d` titre Nunito · `.mono` adresse · `.tag` sur-titre 11 px · `.new` étiquette « Nouveau » ·
`.ic` icône · `.glass` verre liquide · `.tonal` surface tonale Android · `.card` carte · `.ticket` billet
(+ `.cut` pour le pointillé) · `.btn` (+ `.p` primaire indigo, `.a` accent, `.g` verre, `.q` contour,
`.x` danger, `.sm` petit) · `.ib` bouton rond 44 (+ `.g` verre, `.lg` 60) · `.chip` puce (+ `.on`) ·
`.row` ligne de liste · `.sep` filet · `.av` avatar à initiales · `.ring` anneau de story (tourne) ·
`.dot` présence (`.on` vert pulsé, `.aw` orange, `.id` gris) · `.seg` sélecteur de faces (enfant `.on`) ·
`.ph` emplacement d'image · `.sk` squelette · `.orb` orbe de bannière · `.sw` interrupteur (+ `.on`) ·
`.bar` jauge (enfant `i`) · `.wave` forme d'onde · `.pin` épingle de carte (onde radar) ·
`.rise` entrée animée (décale avec `style="animation-delay:.1s"`).

Mouvement : le canevas est vivant. Utilise les animations du kit avec retenue et sens (les orbes de
la bannière flottent, l'anneau de story tourne, le point de présence pulse, l'épingle émet une onde,
les sections entrent en cascade `.rise`). Tu peux ajouter 1 ou 2 animations propres à ta planche si
elles EXPLIQUENT quelque chose. Tout est coupé sous `prefers-reduced-motion`.

---------------------------------------------------------------------------------------------------

## 6. Carte — fond commun (`brief/map.svg.txt`)

Toute carte utilise le fond commun (sombre, abstrait : fleuve, parcs, îlots, voies) : écris le jeton
`[[map]]` comme PREMIER enfant d'un conteneur `position:relative; overflow:hidden` et pose par-dessus les
épingles (`.pin` + avatar), les cercles de flou (disque `--accent` à 18 % d'opacité, bord 1.5 px) et
les commandes de verre. Le SVG s'étire (`preserveAspectRatio="xMidYMid slice"`).

---------------------------------------------------------------------------------------------------

## 7. Ce qu'on attend de ta planche

- Complète : tous les états et toutes les commandes que la spécification de ta planche énumère sont DESSINÉS, avec leur icône et leur libellé.
- Jeune, moderne, aérée : grands titres Nunito, beaucoup d'air, verre et profondeur, pas de mur de cartes grises.
- Fidèle aux trois signatures (Vitrine immersive · Liens en billets mono · Actions en boutons ronds de verre).
- Aucune explication de design écrite DANS l'écran : un écran d'app ne contient que ce que l'utilisateur lirait. (Les planches « système » 1440 px, elles, sont des documents : légendes brèves admises.)
- Avant de rendre la main, lance `node brief/build.mjs <TonFichier.dc.html>` depuis le dossier `profil/` : il monte ta planche et liste les jetons inconnus et les fautes de format ; corrige jusqu'à « OK ».
- À la fin, ta réponse est UNE ligne : le chemin du fichier écrit, et rien d'autre à signaler sauf un vrai blocage.

---------------------------------------------------------------------------------------------------

## 8. Décisions de cohérence (tour 2) — elles PRIMENT sur tout ce qui précède et sur ce qui est déjà dessiné

Date du jour sur toutes les planches : **16 novembre 2026**. Aucune date postérieure n'apparaît (un graphe de 30 jours va du 18 oct. au 16 nov.).

**Qui est qui** (cercle avec Aïssa — ne jamais en changer d'une planche à l'autre) :
| Personne | Pseudo | Cercle | Rôle fixe |
|---|---|---|---|
| Léo Marchetti | `@leo.m` | Proche | partage sa position avec moi (Alfama, quartier, encore 42 min), en ligne |
| Mina Okafor | `@mina.o` | **Sang** | position continue, à 300 m ; sur Meeshy depuis longtemps (jamais « a rejoint il y a 3 j ») |
| Kwame Mensah | `@kwame.m` | Proche | en **mode fantôme** quand il faut un fantôme |
| Tomás Ribeiro | `@tomas.r` | Ami | partage sa position (Cascais, précision ville) |
| Yuki Tanaka | `@yuki.t` | Ami | partage terminé il y a 1 h |
| Sofia Benali | `@sofia.b` | Connaissance | celle des demandes de connexion ; JAMAIS sur une carte ni dans un widget « Proches » |
| **Rui Santos** | `@rui.s` | aucun (inconnu) | LE compte bloqué et signalé (Etat-Bloque, Signaler). Avatar gris, initiales RS. Tomás n'est jamais bloqué. |
Aucun autre figurant nommé (pas d'« Awa Diop »). Les filleuls récents du parrainage sont des pseudos d'inconnus (`@koffi_beats`, `@nadia.snd`, `@samba.k`) plus Yuki ; ni Mina ni Léo.

**Où est Aïssa** : elle VIT à Dakar (sa vitrine dit « Dakar ») et elle est **de passage à Lisbonne** cette semaine : toute carte où elle apparaît près de Léo ou de Mina porte une petite pilule « De passage à Lisbonne ».
**Ma position** : aujourd'hui Aïssa ne partage PAS sa position. Partout : « Ma position — non partagée », « Tu n'es visible par personne », et « Partager ma position avec Léo » reste une proposition. C'est LÉO qui partage (42 min).

**Chiffres** : `meeshy.me/@aissa` (lien nu) = « 1 719 visites ce mois », « 57 visites aujourd'hui » — jamais « clics ». « 412 clics » n'appartient qu'au lien de suivi `meeshy.me/l/aissa`. « Réel Dakar la nuit » : 1 284 clics AU TOTAL (30 jours, pic 214 le 3 nov., 31 pays). Bring avec Léo : « 2 / 3 aujourd'hui ». Communauté « Photo de rue » : 1 204 membres.
**Adresses** : celles d'Aïssa sont toutes trois « Public ». Celles de Léo : `leomarchetti.photo` (Portfolio), `leomarchetti.photo/boutique` (Tirages), Newsletter — jamais d'adresse Instagram pour Léo.
**Adresse canonique** : `meeshy.me/u/aissa` ; `meeshy.me/@aissa` en est le raccourci (redirection).

**Icônes — précisions au vocabulaire fixe** :
humeur / statut `smiley` (toujours, y compris « En studio » d'Aïssa) · écoute en cours `music-notes` · écouter ensemble `headphones` · regarder ensemble `monitor-play` · adresse « Musique » `vinyl-record` · envoyer le profil `paper-plane-tilt` (jamais `export`, qui reste « partager vers l'extérieur ») · lien sortant `arrow-square-out` (jamais `arrow-up-right`) · bloquer `prohibit` (réservé) · motif « Haine » `hand-fist` · motif « Faux profil » `mask-happy` · profil introuvable `user-circle-dashed` (`user-focus` est RÉSERVÉ à la face Vitrine).

**Mots** : le bouton s'appelle « Demander à être amis » ; l'état accepté affiche le badge « Connectés ». Le réglage s'appelle « Recevoir des demandes d'amis ».

**Quand montrer le sélecteur de faces** : sur les écrans de FACE (Vitrine, Liens, Actions et leurs suites défilées : publications, en commun) → oui, avec la bonne face active. Sur une FEUILLE basse, un écran POUSSÉ (détail d'un lien, mes adresses, parrainage, signaler, notre cercle), un écran PLEIN CARTE ou un état sans fiche (bloqué, introuvable) → non. Etat-Demande est une Vitrine : face Vitrine active.

**États à ne jamais oublier** : vide · chargement (squelette seulement si le cache est vide) · erreur (avec « Réessayer ») · hors ligne (le cache répond).

---------------------------------------------------------------------------------------------------

## 9. L'approche KIT (directive porteur du 2026-11-16) — le profil est FAIT DU KIT, et ce qu'il invente y ENTRE

Meeshy a déjà un kit de composants réutilisables, né de la planche du composer (chantier #17312) :
fiches `/home/user/meeshy/docs/product/kit/K00…K25-*.md`, code iOS `/home/user/meeshy/packages/MeeshySDK/Sources/MeeshyUI/Kit/`,
Android `apps/android/sdk-ui/src/main/kotlin/me/meeshy/ui/component/kit/`, web `apps/web/src/components/kit/`.
Règles du kit, à tenir sur chaque fiche :
- un composant du kit est un **atome agnostique** : paramètres opaques, aucun type « profil », aucun singleton Meeshy ; l'orchestration reste côté app ;
- **on extrait avant de créer** : le jumeau le plus complet déjà dans le code DEVIENT le composant ;
- **mêmes noms d'API sur les trois plateformes** (iOS SwiftUI · Android Compose · Web Preact) ;
- le verre a UNE entrée (K01 `MeeshyGlassTone`) : Liquid Glass du système sur iOS 26+, verre dessiné ailleurs, surface tonale sur Android ;
- chaque composant a une **recette en valeurs** (`…Recipe`), des **jetons**, et ses **témoins**.

### Ce que le profil RÉEMPLOIE tel quel (ne rien redessiner)
| Besoin du profil | Composant existant |
|---|---|
| verre de toute commande flottante | K01 `MeeshyGlassTone` |
| bouton rond de verre (44 / 48) | K02 `MeeshyGlassButton` |
| sélecteur des trois faces (2 à 4 options, pastille qui glisse) | K03 `MeeshySegmented` posé dans K10 `MeeshyGlassPill` |
| puces (langues, filtres de famille, cercles d'audience) | K04 `MeeshyChipRow` |
| rangée à bascule (batterie, injoignable, fantôme) | K06 `MeeshyToggleRow` |
| pastilles de couleur d'accent | K07 `MeeshyColorDots` |
| champs (bio, adresse, UTM) | K08 `MeeshyField` |
| anneau de progression (temps restant, complétion) | K09 `MeeshyProgressRing` |
| pilule du bas et bouton contextuel | K10 `MeeshyGlassPill` + K13 `MeeshySplitActionButton` |
| pilule « hors ligne », refus, échec, activité en direct | K14 `MeeshyStatusCapsule` |
| feuilles basses (carte, cercle, signaler, créer un lien) | K15 `MeeshyAnchoredSheet` |
| menu (…) d'une fiche ou d'un billet | K18 `MeeshyObjectMenu` |
| rail de vignettes (stories à la une, médias partagés) | K20 `MeeshyThumbnailRow` |

### Ce que le profil APPORTE au kit (numéros PROPOSÉS, à confirmer à l'ouverture des lots)
| N° | Nom (identique sur les trois plateformes) | En une phrase (le résultat) |
|---|---|---|
| K26 | `MeeshyMotion` | Tout mouvement de l'app sort d'une seule table de ressorts, de durées et de retours haptiques |
| K27 | `MeeshyLivingBanner` | Une bannière vit (orbes, parallaxe, couleur d'accent) partout où une entité se présente |
| K28 | `MeeshyCollapsingHero` | Un en-tête immersif se replie en barre de verre au défilement, sans image perdue |
| K29 | `MeeshyAvatarMorph` | Un avatar VOYAGE d'un écran à l'autre (liste → fiche → épingle de carte) au lieu de réapparaître |
| K30 | `MeeshyTicket` | Tout ce qui se partage par une adresse se montre en billet à encoches, qui se retourne |
| K31 | `MeeshyCodeCard` | Un QR se présente sur une carte de verre qui suit l'inclinaison du téléphone |
| K32 | `MeeshyLabeledAction` | Une grille d'actions est faite de boutons ronds de verre libellés, partout la même |
| K33 | `MeeshyCircleScale` | Un niveau de proximité se lit par l'intensité : pastilles, pilule de relation, anneaux concentriques |
| K34 | `MeeshyFigures` | Un chiffre se montre en grand avec sa courbe ou ses barres, sans tableau de bord |
| K35 | `MeeshyWavePlayer` | Un son court se joue sur une seule forme d'onde vivante |
| K36 | `MeeshyMapPin` | Une personne sur une carte est son avatar, son disque de flou et son onde |
| K37 | `MeeshyLockedRow` | Ce qui est fermé à mon niveau se voit, verrouillé, avec ce qui l'ouvre |
| K38 | `MeeshyStateBlock` | Vide, erreur, refus et chargement ont une seule forme : une image fantôme, une phrase, une sortie |
| K39 | `MeeshyPersonRow` | Une personne dans une liste est toujours la même rangée : avatar, présence, cercle, accessoire |

### Gabarit d'une PLANCHE-FICHE de kit (1440 px, document)
Racine : `<div class="mx" style="width: 1440px; padding: 72px; display: flex; flex-direction: column; gap: 56px">`.
1. **En-tête** : pastille `.knum` (« K30 · proposé ») + nom du composant en `.mono` 20 px `--accent-ink` ; titre Nunito 56 px = la phrase-résultat ; chapeau 18 px `--ink2` de 1–2 phrases ; à droite, trois puces « iOS », « Android », « Web ».
2. **Rôle** (sur-titre `.tag`) : deux colonnes — « Il fait » (3–4 lignes) · « Il ne fait pas » (3–4 lignes, avec le composant qui s'en charge : « le verre : K01 »).
3. **Anatomie** : le composant dessiné EN GRAND (≈ 2× sa taille réelle) dans une `.kcell`, avec des pastilles numérotées `.kan` posées sur ses parties et la légende numérotée à côté (nom de la partie, mesure en px, jeton).
4. **Variantes et états** : grille de `.kcell`, une par variante / état, chacune avec le composant à taille réelle et une légende `.kcap` (repos · pressé · actif · désactivé · chargement · thème clair quand c'est pertinent — un sous-conteneur `<div class="mx" data-theme="light" style="…">` fait hériter les jetons clairs).
5. **Mouvement** : le composant ANIMÉ pour de vrai en CSS (boucle 3–5 s avec pause), à côté d'un storyboard de 3 vignettes, et la ligne de spec `.spec` : `durée · courbe · déclencheur · haptique · mouvement réduit`. Référence les jetons de K26 par leur nom (`motion.morph`, `motion.flip`, `motion.rise`, `motion.float`, `motion.pulse`, `motion.collapse`, `motion.travel`).
6. **API** : tableau `.kapi` à 4 colonnes (`grid-template-columns: 1.1fr 1.3fr 1.3fr 1.3fr`) : élément · iOS `MeeshyUI/Kit/<Nom>.swift` · Android `me.meeshy.ui.component.kit` · Web `components/kit/<nom-en-kebab>.tsx` ; lignes : composant, variantes (`enum`), tailles, emplacements (`slot`), recette (`<Nom>Recipe.resolve(…)`). Puis la liste des paramètres OPAQUES avec leurs défauts. Jamais de type « profil », « lien » ou « cercle » du domaine dans une signature : `title`, `value`, `tint`, `leading`, `trailing`, `level: Int`…
7. **Par plateforme** : trois cartes — iOS (API système employée : `glassEffect`, `matchedGeometryEffect`, `CoreMotion`, `sensoryFeedback`…), Android (Compose : `SharedTransitionLayout`, `MaterialShapes`/`Morph`, `HapticFeedback`…), Web (`View Transitions`, `animation-timeline: scroll()`, `backdrop-filter`, `:active`…) — et le REPLI quand la capacité manque.
8. **Jumeaux à extraire** : ce qui existe DÉJÀ dans le code et deviendrait le composant. Cherche réellement (Grep dans `/home/user/meeshy/apps/ios/Meeshy`, `/home/user/meeshy/packages/MeeshySDK/Sources/MeeshyUI`, `/home/user/meeshy/apps/web/src`, `/home/user/meeshy/apps/android`) et cite 3 à 8 fichiers réels par leur chemin court en `.mono`, en disant lequel « DEVIENT le composant ». N'invente aucun chemin : si tu ne trouves rien sur une plateforme, écris « aucun jumeau — à créer ».
9. **Il sert aussi ailleurs** : 3 ou 4 `.kcell` montrant le MÊME composant hors du profil (conversation, communauté, réglages, stories, jeu, appels) — c'est la preuve qu'il est réutilisable ; légende d'une ligne chacune.
10. **Témoins** : 5–7 puces de ce que les tests doivent prouver (comportement, accessibilité : nom / rôle / valeur, cible 44 pt, contraste, mouvement réduit, RTL, aucune re-peinture des voisins).
Accessibilité et performance tiennent en deux lignes sous les témoins. Le ton est celui d'une fiche de contrat : phrases courtes, mesurées, rien de vague.


---------------------------------------------------------------------------------------------------

## 10. Le kit COMPLET (inventaire des 54 planches d'écran, 2026-11-16) — clôt la liste

L'inventaire de chaque composant dessiné a ajouté seize composants, trente-trois évolutions de composants
existants et une liste de ce qui reste HORS kit. Le détail (parties, variantes, évolutions, hors kit) est
dans `brief/plan-kit.json` (clés `nouveaux`, `evolutions`, `hors_kit`). La liste est CLOSE à K55.

| N° | Nom | En une phrase |
|---|---|---|
| K40 | `MeeshyButton` | Toute action nommée est une capsule libellée, pleine, de verre, à contour ou en texte, partout la même |
| K41 | `MeeshyBadge` | Une information courte posée sur ou à côté d'autre chose est une seule pastille : glyphe, valeur, teinte |
| K42 | `MeeshyMeter` | Une mesure fixe se lit sur une jauge linéaire qui dit sa valeur, sa teinte et ce qu'il reste |
| K43 | `MeeshyGroupCard` | Ce qui va ensemble tient dans une seule surface arrondie, avec ses filets en retrait, son en-tête et son pied |
| K44 | `MeeshySectionHeader` | Une section s'annonce toujours de la même façon : un titre, ce qu'elle compte, et ce qu'on peut y faire |
| K45 | `MeeshyMedallion` | Un glyphe qui nomme une chose sans se toucher est un médaillon teinté, d'une seule recette |
| K46 | `MeeshyNote` | Ce que l'écran doit dire sans qu'on l'ait demandé tient en une note en ligne : un glyphe, une phrase, un ton |
| K47 | `MeeshyChoiceTiles` | Choisir parmi quelques options qui méritent d'être expliquées se fait sur des tuiles, une ou plusieurs à la fois |
| K48 | `MeeshyAvatarGroup` | Plusieurs personnes ensemble se montrent d'une seule façon : en pile, en duo, en rangée nommée ou en grille |
| K49 | `MeeshyMediaGrid` | Des médias en lecture seule se rangent dans une grille à colonnes, chaque tuile disant son type |
| K50 | `MeeshyChart` | Une série de valeurs se lit sur un graphique sobre qui nomme son pic, ses bornes et ce qu'on y choisit |
| K51 | `MeeshyTranslationMark` | Tout contenu traduit porte la même marque discrète, qui dit d'où il vient et rend l'original d'un geste |
| K52 | `MeeshyReorderList` | Un ordre qui compte se règle en glissant des rangées pleines, avec leur rang et une alternative sans geste |
| K53 | `MeeshyStepper` | Une valeur qui avance par crans se règle ou se suit sur une seule échelle discrète |
| K54 | `MeeshyMapTrace` | Un chemin sur une carte est un seul tracé : il avance vers quelqu'un ou raconte d'où l'on vient |
| K55 | `MeeshyKeyHint` | Un raccourci clavier se montre partout par la même touche, seule, dans un bouton ou en légende |

Le kit compte donc : 13 composants existants réemployés (K01–K25) · 14 proposés par le profil (K26–K39) ·
16 ajoutés par l'inventaire (K40–K55) = **30 composants nouveaux, 43 employés**.

### Décisions de nommage (elles PRIMENT sur ce que les fiches écrivent)
- **Le sens** d'un composant (neutre, accent, réussite, alerte, erreur, destructif) s'appelle `kind`, comme dans le kit réel (K02, K14). `tone` est RÉSERVÉ au ton du verre de K01 (`MeeshyGlassTone`). Donc `MeeshyBadgeKind`, `MeeshyMeterKind`, `MeeshyMedallionKind`, `MeeshyNoteKind`, `MeeshyButtonKind` — jamais `…Tone`.
- **La teinte libre** se passe par `tint: Color? = nil` à côté de `kind` — jamais par un cas `.custom(Color)`.
- **Le glyphe** : paramètre `systemImage` sur iOS, `icon` sur Android, `glyph` sur le web (comme K02) ; l'EMPLACEMENT libre s'appelle `glyph` sur les trois.
- **L'attente** d'une réponse s'appelle `isPending` partout (jamais `isBusy`, `busy`, `pending`).
- **Chiffres contre graphiques** : K34 `MeeshyFigures` garde le chiffre, la bande et `MeeshySpark` (mini-courbe sans axe) ; les barres et toute série à axe, pic ou sélection sont à K50 `MeeshyChart` (`MeeshyBars` quitte K34).
- **Plusieurs personnes** : la pile d'avatars est à K48 `MeeshyAvatarGroup` ; K39 ne garde que la rangée.
- **Choisir un motif expliqué** (les huit motifs de « Signaler ») : K47 `MeeshyChoiceTiles` en forme `wide`, pas K06.
- **La jauge** : K42 pour une mesure fixe (quota, complétion, batterie) ; K09 pour une opération en vol et le décompte (mode `countdown`).
- **Le squelette** est l'atome `MeeshySkeleton` exposé par K38 ; aucun autre composant n'en redessine.
- **Les touches de raccourci** : K55 `MeeshyKeyHint`, que K40, K32 et K44 reçoivent dans leur emplacement de fin.
- K38 est un ASSEMBLAGE (vague 3) ; son atome squelette est en vague 2.
