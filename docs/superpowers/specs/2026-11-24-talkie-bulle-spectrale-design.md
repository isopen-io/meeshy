# Le talkie en bulle spectrale autour de l'avatar du hero (#20531)

Décisions du porteur du 2026-11-24. Milestone : « La fiche d'un Sang dit tout de lui, et sa voix vit autour de son avatar ».

## Pourquoi

Aujourd'hui, le talkie montre la voix dans la barre d'en-tête (`TalkieHeaderLiveBar`). C'est un spectre LINÉAIRE en miroir, tiré d'un seul niveau de volume (`TalkieLevelMeter`, une moyenne quadratique par tampon). Il ne dit rien des fréquences, et il ne vit pas là où l'œil regarde : sur la personne à qui l'on parle. La voix part de plus brute, sans gain. Le porteur veut que la voix se VOIE autour de l'avatar, comme sur le cadran du plein écran audio, et qu'elle s'entende à un volume normal.

## Ce qui est attendu

1. **Où.** Autour de l'avatar du hero de l'écran d'où l'on parle :
   - sur le profil, le grand avatar de la personne (hôte : `ProfileTalkieRow`, dans les Actions) ;
   - en conversation, l'avatar de l'en-tête (hôte : `ConversationHeaderTalkieButton`).

   À la réception, le même dessin entoure l'avatar de celui qui parle, aux mêmes endroits.
2. **La bulle.**
   - 120 bandes de fréquence, sur une échelle logarithmique de 80 Hz à 8 kHz.
   - Les pointes des 120 rayons sont reliées par UNE ligne fermée et lisse (spline de Catmull-Rom fermée) : le contour d'une bulle.
   - Au silence, la bulle est un cercle parfait, posé à un écart fixe du bord de l'avatar. Quand la voix monte, chaque angle se gonfle selon l'énergie de sa bande, et la bulle oscille entre le cercle et une ellipse déformée.
   - Aucun rayon ne dépasse le contour : la ligne EST la limite, et les rayons sont dessinés à l'intérieur, du bord de l'avatar jusqu'à elle.
   - L'amplitude maximale est bornée (par exemple 35 % du rayon de l'avatar), pour que la bulle ne sorte jamais du hero.
3. **Les couleurs.**
   - Un dégradé angulaire (`AngularGradient`) qui suit l'angle de la bande : les graves en chaud (rouge, orange), les aigus en froid (cyan, bleu).
   - Il colore le trait du contour, et la bulle est remplie de ce dégradé à faible opacité.
   - Les couleurs viennent de jetons de `MeeshyColors`, jamais d'un hexa local.
4. **L'analyse en temps réel.**
   - Une FFT `vDSP` (Accelerate) sur chaque tampon du micro, déjà capté par `TalkieMicCapture` (1 024 échantillons par tampon).
   - Une fenêtre de Hann est appliquée avant la FFT. Les magnitudes sont passées en dB, puis regroupées en 120 bandes logarithmiques.
   - Le lissage est le même que celui de `TalkieWaveLaw` (attaque 0,55, retombée 0,12), appliqué bande par bande.
   - Le calcul se fait sur le fil audio et publie un tableau de 120 `Float` dans un compteur sans publication SwiftUI, comme `TalkieLevelMeter` aujourd'hui. La vue le lit à chaque image (`TimelineView(.animation)` + `Canvas`).
   - À la réception, la même analyse se fait sur la prise déjà posée sur `voicesMixer` (`TalkieVoicePlayer`).
5. **Le volume.**
   - Sur le tampon du micro, AVANT l'encodage AAC : un gain automatique vise un niveau de parole d'environ −16 dBFS en moyenne quadratique.
   - Le gain monte lentement (environ 300 ms) et redescend vite (environ 20 ms). Il est plafonné à +18 dB, pour ne pas amplifier un silence en souffle.
   - Il est suivi d'un limiteur doux à −1 dBFS, de sorte que rien n'écrête.
   - Le tout est calculé avec `vDSP`.
   - L'analyse de la bulle lit le signal APRÈS le gain : ce qu'on voit est ce qui part.
6. **Le partage de l'anneau.** Pendant qu'on parle ou qu'on écoute un talkie, la bulle prend la place de la bande d'écoute de l'avatar (`AvatarListeningBand`), et la rend à la fin. Les badges de l'avatar restent posés hors de la bulle (lot #20532).
7. **Réduire les animations.** La bulle reste un cercle dont seule l'épaisseur du trait suit le volume, rafraîchi au plus toutes les 100 ms (même règle que `TalkieLiveSpectrum`).

## Objectifs, et ce qui n'en est pas

- **Objectifs :** voir sa voix et celle de l'autre sur la personne, à 60 i/s au moins (120 sur ProMotion), sans saccade sur le reste de l'écran ; une voix envoyée audible sans que l'autre monte le son.
- **Hors périmètre :**
  - le cadran plein écran des vocaux enregistrés (`AudioFullscreenDial`), qui garde ses 72 barres ;
  - les vocaux classiques ;
  - les miroirs web et Android, qui font chacun l'objet d'une issue si ce lot ne les livre pas.
- **Ce qui serait un échec, même si ça marche :**
  - la vue qui se re-rend pour chaque tampon (re-rendu de tout l'en-tête) ;
  - un calcul de FFT sur le fil principal ;
  - un gain qui fait entendre le souffle du silence ;
  - une bulle qui recouvre les badges ou sort du hero.

## Contraintes

- iOS 16 à 26 : un seul dessin, `Canvas`.
- Pas de nouveau singleton nommé Meeshy dans le SDK. L'analyseur (FFT + bandes) et la forme (bandes vers contour) sont des briques pures. Elles vivent côté app, à côté de `TalkieWaveLaw`. Si le lot web en a besoin, c'est une transposition, pas un partage de code.
- Fichiers de 1 200 lignes au plus, fonctions de 80 lignes au plus. Les gardes iOS doivent passer : house_rules, cohesion, test_registration, accent-color.
- Aucune allocation sur le fil audio en régime établi : les tampons de FFT sont préparés une fois, à l'ouverture.

## Approches considérées

| | Approche | Pour | Contre |
|---|---|---|---|
| **A (retenue par le porteur)** | FFT `vDSP` sur le fil audio, dessin `Canvas` + `TimelineView` | une seule voie iOS 16 à 26, forme testable sans vue, `vDSP` exploite l'accélération matérielle | le chemin `Canvas` doit être mesuré sur appareil à 120 i/s |
| B | même FFT, dessin par un shader Metal (`.layerEffect`) | le plus fluide | iOS 17 minimum : deux dessins à maintenir |
| Gain écarté | `setVoiceProcessingEnabled` d'iOS | réduction de bruit et annulation d'écho gratuites | change le format du micro, baisse les autres sons de l'iPhone, comportement opaque |

## Ce qui est décidé, et ce qui reste au constructeur

- **Décidé (porteur) :** l'emplacement (le hero où l'on parle), plus de barres (120), une analyse en temps réel accélérée par le matériel, des couleurs du grave au aigu, une bulle bornée par une ligne morphe, un volume normalisé avant l'envoi, le même dessin à la réception.
- **Mes choix (à corriger si besoin) :**
  - 80 Hz à 8 kHz ;
  - la cible de −16 dBFS ;
  - le plafond de +18 dB ;
  - l'amplitude de 35 % ;
  - le remplissage à faible opacité ;
  - l'abandon de la barre linéaire de l'en-tête, qui ne garde que la pastille « En direct » ou « Enregistré » et le chrono.
- **Au constructeur :**
  - la taille de la FFT (1 024 par défaut, ou 2 048 si le micro livre de plus grands tampons) ;
  - la tension de la spline ;
  - le nom des types ;
  - la façon dont le hero du profil reçoit l'état du talkie (préférence ou environnement, sur le modèle de `TalkieHeaderLiveKey`).

## Décisions du porteur après relecture (2026-11-24, elles priment sur ce qui précède)

- **Profil.** La bulle entoure le grand avatar du hero. SOUS l'avatar s'affichent le point rouge et le compteur (« ● 0:04 »), à la place de la pastille de la barre d'en-tête.
- **Conversation : on reste sur place.** L'en-tête ne s'étend plus et ne se déploie pas. Une ORBE naît à l'endroit même où le doigt appuie, c'est-à-dire le bouton talkie de l'en-tête. Elle ne prend pas toute la place et vit au rythme de ce que l'utilisateur dit dans le micro : c'est la même bulle spectrale, à l'échelle du bouton, avec l'amplitude que permet la rangée. La barre linéaire `TalkieHeaderLiveBar` (spectre miroir, bande qui défile) est retirée de ce chemin. Le nom, le retour et les actions de l'en-tête restent visibles pendant le talkie.
- À la réception, en conversation, l'orbe vit sur le même bouton, à l'échelle de la voix du pair.

## Réponses à la relecture du constructeur (mes choix, à corriger)

- **Anneau de story et cadre équipé.** La bulle part de leur bord EXTÉRIEUR (`AvatarRingGeometry.spill`) et ne les recouvre jamais. Les badges restent hors de la bulle, sur son pourtour au repos (#20532).
- **Amplitude selon l'hôte.** L'amplitude maximale est un paramètre de l'hôte, jamais une constante. Sur le profil, c'est 35 % du rayon. Dans l'en-tête de conversation, c'est la place libre de la rangée, que la bulle ne dépasse pas.
- **Plusieurs voix à la fois.** L'analyse se fait PAR VOIX : un tap sur le nœud de chaque pair, et des bandes indexées par interlocuteur. La bulle de A ne montre jamais la voix de B. Le compteur `incoming` unique est remplacé.
- **Hero replié.** Si le profil est replié, la bulle se dessine autour du mini-avatar de la barre de verre, avec l'amplitude de cet hôte. L'en-tête ne se redéplie pas sous le doigt. Le hero vivant dans le SDK (`UserProfileSheet+Header`), il reçoit la bulle comme une décoration opaque fournie par l'app (une vue injectée), sans rien savoir du talkie.
- **Souffle.** Sous −50 dBFS (le plancher de `TalkieWaveLaw`), le gain est GELÉ à sa dernière valeur, puis redescend vers 0 dB en 1 s. Le silence n'est jamais remonté.
- **Volume à la réception.** Le +6 dB fixe du haut-parleur (`TalkieOutputPlan`) est remplacé par le même gain automatique, appliqué à la réception. Une voix venue d'un ancien client, du web ou d'Android (brute) est donc normalisée aussi, et une voix déjà normalisée n'est pas poussée à l'écrêtage. Rétrocompatible : rien ne change sur le fil.
- **Bandes graves.** Les bandes plus étroites qu'une case de FFT sont interpolées entre les cases voisines. Le test devient : « une sinusoïde à 200 Hz donne son MAXIMUM dans la bande qui la contient ».

## Preuve attendue

- **Tests de forme :** silence donne un cercle exact ; énergie seulement dans les graves donne des angles gonflés seulement de leur côté ; aucun point au-delà de l'amplitude maximale.
- **Tests de bandes :** une sinusoïde à 200 Hz allume la bande qui la contient ; une sinusoïde à 4 kHz allume la sienne.
- **Tests de gain :** un signal à −40 dBFS remonte vers la cible sans dépasser +18 dB ; un signal plein écrête à −1 dBFS au plus.
- **Mesure sur iPhone réel :** images par seconde pendant 10 s de parole, et temps de calcul par tampon sur le fil audio, consignés dans l'issue.

## Décisions du porteur du 2026-11-25 (elles priment sur ce qui précède)

1. **L'orbe se voit.** Sur le bouton « Maintenir pour parler » de la fiche, l'orbe sortait à peine du bouton. Elle prend désormais la place libre de la carte, jusqu'à environ 70 % du rayon du bouton, sans jamais sortir de la carte. Les bandes passent par une courbe de réponse qui amène une voix normale vers la moitié de l'amplitude. Le cercle de repos reste.
2. **L'orbe remplace l'anneau.** Pendant que l'orbe vit, le reflet blanc et l'anneau du décompte autour du bouton de la fiche disparaissent. Le nombre de secondes reste.
3. **L'en-tête de conversation reste sur place.** Le petit bouton talkie de l'en-tête porte la même orbe, amplifiée selon la même règle et bornée à la rangée. Aucune barre ni aucun bandeau ne recouvre l'en-tête pendant un talkie, à l'envoi comme à la réception. En particulier, le bandeau du talkie reçu ne se pose pas quand l'en-tête de ce correspondant est à l'écran.
4. **Le bandeau du talkie reçu.** Un spectre HORIZONTAL remplace l'icône d'onde fixe. Il reprend les mêmes 120 bandes de la voix reçue et le même dégradé (orange, ambre, bleu clair, bleu), miroir de part et d'autre d'une ligne médiane, entre le libellé et les boutons. Le bouton micro du bandeau porte l'orbe CIRCULAIRE de ma voix quand je le maintiens pour répondre. « Réduire les animations » est respecté. La mise en page ne bouge pas pendant l'animation, les dessins ne prennent pas le doigt, et VoiceOver ne change pas.
