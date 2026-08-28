# MeeshyComposer — les vues mobiles cibles

> **Ce fichier est une SOURCE, pas un tableau de bord.** L'état d'implémentation de chaque vue vit
> dans son issue GitHub, jamais ici. Régénéré par `capture-cibles.js` — ne pas éditer à la main.

Le document `MeeshyComposerMobile.dc.html` porte 34 planches : **31 écrans** à implémenter et
**3 planches de doctrine** (pipeline, refus motivés, budgets) qui sont des critères de recette.

```bash
node docs/product/MeeshyComposerDesign/capture-cibles.js
```

Chaque `cible/<id>.png` est la **référence d'implémentation** de sa vue. La conformité se juge sur la
disposition, la hiérarchie, les états et les gestes — polices, couleurs et rayons passent par le design
system Meeshy (`MeeshyColors`, `MeeshyFont`, `accentColor` de conversation).

## Capture — les planches de l'enregistrement, budgets compris

| Vue | Ce que la vue établit | Doctrine |
|---|---|---|
| [`4a`](cible/4a.png) *(planche)* | Le pipeline de capture — six étages, un budget chacun | Le budget est dans la planche, pas dans un ticket. Chaque étage porte le chiffre qui le fait accepter ou refuser en revue — un étage sans budget mesurable n'est pas spécifié. |
| [`4b`](cible/4b.png) | Prise en cours — segments, sans ré-encodage | Chaque segment est déjà un fichier. Supprimer le dernier segment supprime un fichier, il ne rejoue rien ; valider concatène des pistes déjà encodées, ce qui rend la sortie quasi instantanée quelle que soit la durée. |
| [`4c`](cible/4c.png) | La pose — l'objet arrive prêt, la montée a déjà commencé | Rogner n'invalide pas la montée. C'est ce qui autorise à monter le fichier pendant que l'utilisateur compose : les bornes voyagent avec la publication, le fichier reste celui qui est déjà en train de partir. |
| [`4d`](cible/4d.png) *(planche)* | Les solutions à ne jamais retenir — et le coût mesuré | Un refus sans coût n'est pas un refus, c'est un goût. Chaque ligne porte la conséquence mesurable qui la justifie, pour qu'une revue puisse la contester avec un chiffre plutôt qu'un avis. |
| [`4e`](cible/4e.png) *(planche)* | Budgets — ce qui se mesure, et comment | Le budget se compare, il ne s'admire pas. Chaque ligne dit sur quel appareil et dans quel état la mesure vaut, sinon deux revues obtiennent deux chiffres et personne n'a tort. |
| [`4f`](cible/4f.png) | Aperçu de restitution — le même document, quatre profils | Un profil ne se choisit pas à l'aveugle. L'aperçu rend le document dans la surface de lecture réelle du profil et dit en trois lignes ce qu'il garde, change et perd — un profil destructeur est grisé, jamais silencieusement accepté. |

## Les surfaces qui restaient — d'où l'on entre, les outils, ce qui rate

| Vue | Ce que la vue établit | Doctrine |
|---|---|---|
| [`3a`](cible/3a.png) | D'où l'on entre — un seul objet, cinq portes | La porte nomme la durée, pas l'outil. Ce que l'utilisateur choisit, c'est combien de temps ça vit et quelle forme ça prend à la lecture — l'éditeur derrière est le même objet dans les quatre cas. |
| [`3b`](cible/3b.png) | Outils de scène — dessin, sticker, collage, mention, lieu | Chaque outil pose un objet, pas un calque d'image. Dessin, sticker, mention et lieu deviennent des MeeshyObject du plan fg — donc déplaçables, ordonnables et minutables comme le texte. |
| [`3c`](cible/3c.png) | Accessibilité — collecter l'alt et l'annonce | La description est demandée, jamais imposée. Les médias non décrits restent listés avec leur état pour que l'oubli soit visible avant la publication, sans bloquer l'envoi. |
| [`3d`](cible/3d.png) | Envoi durable — hors ligne, puis reprise | L'envoi est un objet du fil, pas une notification. Il occupe la place qu'aura la publication, porte sa propre progression par média, et reste modifiable tant qu'il n'est pas parti. |
| [`3e`](cible/3e.png) | Galerie plein écran — le troisième viewer | Le muet de la galerie est celui du lecteur vidéo, pas celui du fond. Cette surface n'annonce aucun son de fond : elle ne montre que ce qu'elle joue réellement, contrôles compris. |
| [`3f`](cible/3f.png) | Cas d'usage — carrousel Post avec son | Une légende par slide, un son pour la publication. La pagination ne change ni le texte du post ni l'annonce du son : seule la légende suit le média affiché. |
| [`3g`](cible/3g.png) | Après 20 h — l'archive | L'archive est privée par défaut et le reste. Republier depuis l'archive rouvre la même publication dans le composer — la scène et ses objets sont intacts, l'audience est redemandée. |
| [`3h`](cible/3h.png) | Répondre à une story — la conversation | La story répondue reste citée, pas aplatie. La vignette porte la scène telle qu'elle était et le lien vers l'original ; si elle a expiré, la citation subsiste avec sa date au lieu de disparaître. |

## Le reste des vues — entrées, éditeurs, lecture, ruptures

| Vue | Ce que la vue établit | Doctrine |
|---|---|---|
| [`2a`](cible/2a.png) | Entrée externe — publier une pièce jointe | Le format se choisit là où la pièce arrive. Un profil que la pièce ne peut pas tenir est montré désactivé avec sa raison, jamais masqué : l'utilisateur apprend la règle au lieu de la deviner. |
| [`2b`](cible/2b.png) | Capture — l'appui long ouvre la caméra | La caméra est une entrée, pas un mode. Ce qu'elle rend est posé dans la scène courante selon la même règle que la galerie : pas de fond ⇒ il devient le fond, sinon un objet de premier plan. |
| [`2c`](cible/2c.png) | Étagère des sons — emprunter, ou enregistrer | La provenance gouverne l'affichage. La note vocale est rangée à part et le dit : elle n'est pas un fond audio, donc elle n'allumera jamais le badge de son ni le bouton 🔇 des surfaces de lecture. |
| [`2d`](cible/2d.png) | Éditeurs — rogner · recadrer · couper | Un seul écran pour les trois gestes. Le cadre porte le recadrage, la bande porte le rognage, la coupe scinde à la tête de lecture — l'ordre des rangées suit l'ordre des décisions, pas trois écrans successifs. |
| [`2e`](cible/2e.png) | Spécimen des styles de texte | Le spécimen se lit sur le fond réel. L'aperçu en haut applique le style sélectionné au vrai texte de la scène ; la grille ne montre que Aa pour rester comparable d'un style à l'autre. |
| [`2f`](cible/2f.png) | Viewer Story — le rail latéral | Le crédit du son est dans l'en-tête, le muet dans le rail. Le muet reste local à la surface : le couper ici ne coupe rien dans le fil, et l'annonce ne disparaît jamais parce qu'on a coupé le son. |
| [`2g`](cible/2g.png) | Réel plein écran | Deux sons, un seul bouton. Le 🔇 du rail ne pilote que la piste de fond empruntée ; l'audio natif du réel reste actif par design, et le bouton ne se monte que s'il existe réellement un lecteur local à piloter. |
| [`2h`](cible/2h.png) | Détail du post — le muet câblé | Le bouton n'existe que si un canvas est réellement rendu. Un post sans scène ne montre ni muet ni badge — la porte du bouton est le même prédicat que celui du rendu, jamais une seconde condition recopiée. |
| [`2i`](cible/2i.png) | Continuité — brouillon repris, PiP | Rien ne se perd en quittant. Le brouillon revient en tête du fil avec ce qu'il contient déjà ; la lecture quittée continue en vignette, avec son propre muet et sa position. |
| [`2j`](cible/2j.png) | Rupture vécue — la sentinelle | Une rupture se raconte, elle ne se subit pas. Jamais un écran noir ni un fond par défaut à la place de la scène : la sentinelle dit ce qui manque, ce qui est intact, et le seul geste utile. |
| [`2k`](cible/2k.png) | Mood — texte seul, une heure | Le profil retire, il n'ajoute pas. Les entrées absentes restent visibles et grisées avec leur raison, pour que passer de Mood à Story se comprenne d'un coup d'œil. |
| [`2l`](cible/2l.png) | Audience — qui verra | Un seul niveau porte l'audience. Les listes nommées affichent leur effectif pour que « amis proches » ne soit jamais une abstraction au moment d'appuyer sur Publier. |

## MeeshyComposer — vues mobiles, du document à la lecture

| Vue | Ce que la vue établit | Doctrine |
|---|---|---|
| [`1a`](cible/1a.png) | Amorce — document sans scène | Le clavier d'abord. Rien ne préjuge du format : le texte est content, la rangée d'entrées est la seule porte vers une scène. Le socle porte déjà le son de fond, l'audience et l'envoi. |
| [`1b`](cible/1b.png) | Naissance de la scène — le fond est choisi | La scène est incrustée, pas plein écran. Elle naît en haut du document ; le texte glisse dessous et devient sa description. Le son posé s'annonce par son crédit, jamais par une note générique. |
| [`1c`](cible/1c.png) | Éditeur de scène — objet sélectionné | Trois plans, un seul objet à la fois. L'inspecteur est une rangée de jetons au-dessus du socle : il change de contenu selon le kind, jamais de place. Le cadre reste 9:16, le porteur y est letterboxé. |
| [`1d`](cible/1d.png) | Appui long sur un objet | Quatre actions, jamais cinq. « Sortir de la scène » est la seule destructrice et porte la couleur d'alerte ; l'ordre suit l'empilement (monter/reculer) avant l'édition. |
| [`1e`](cible/1e.png) | Plan 2D — pistes, images-clés, tête de lecture | Le temps se lit en pistes, groupées par plan. La piste de son est en pointillé : elle existe pour le cadrage, pas pour l'édition. Aperçu figé au-dessus de la tête de lecture, jamais un aperçu qui joue tout seul. |
| [`1f`](cible/1f.png) | Socle déployé — ce qui part | Le profil se change jusqu'au dernier geste. Une seule feuille porte tout ce qui décide de l'envoi ; le bouton nomme ce qui part et combien de slides, pour qu'aucune publication ne soit une surprise. |
| [`1g`](cible/1g.png) | Rail des slides — en Post, une slide est UN média | Le rail dit ce qu'une slide signifie. En Post il compte des médias et le texte sous l'aperçu est une légende ; en Story ou Réel le même rail compte des publications entières et ce texte EST le contenu. |
| [`1h`](cible/1h.png) | Lecture — la carte du fil | L'icône est le verbe. ↻ @lume sans « republié de », le crédit du son sur la même ligne, la scène muette et en pause dans la carte : le mouvement vit dans la destination du tap. |
