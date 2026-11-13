# Un éphémère qui expire BRÛLE sous les yeux du lecteur — conception

Date : 2026-11-13 · Directive porteur du jour · Pilotage : issue « Un éphémère
qui expire brûle lettre par lettre, avec étincelles, flammes et un vent qui suit
l'appareil » et son milestone.

## Intention

> « Je veux une animation de message qui s'enflamme lorsque les messages
> éphémères disparaissent après un compteur ! Un vrai effet en utilisant la
> carte graphique si disponible pour brûler les lettres ! Faire disparaître
> comme des étincelles et les flammes autour et un vent qui fait disparaître à
> gauche ou à droite selon la direction de mouvement de l'appareil ! Un outil
> optimisé, en commençant par iOS puis Android et la webapp. »

La destruction d'un éphémère se voit déjà (#7467, #7468) : la bulle se dore,
rétrécit et s'efface en 0,6 s sur iOS, se replie en 700 ms sur le web, s'efface
en fondu sur Android. C'est une ANNONCE, pas une combustion. Le porteur veut que
le message brûle : les lettres se consument depuis un bord, le front laisse une
lisière de braise, des étincelles et des flammes s'élèvent au-dessus, et le vent
emporte le tout vers la gauche ou la droite selon le mouvement du téléphone.

## Ce qu'on garde de l'existant

- **La fenêtre est tenue par l'hôte, l'effet par le modificateur** — la
  séparation du #7467 reste. `EphemeralBurn.duration(reduceMotion:)` (SDK Swift),
  `DESTRUCTION_MS` (web) et le miroir Kotlin disent la MÊME durée à la vue qui
  anime et à l'hôte qui retire la ligne.
- **Les cinq peaux iOS gardent `.ephemeralBurn(isBurning:)`**. La signature ne
  change pas : ce qui change est ce que le modificateur peint.
- **« Réduire les animations » = un simple fondu**, plus court. Verbatim #7468.
- **Le motif des shaders du jeu** (#9381) : Metal `.layerEffect` iOS 17+ avec un
  repli sans shader iOS 16 ; AGSL API 33+ avec un repli dégradé ; WebGL2 avec un
  repli CSS. Un shader est PUR : le temps, le vent et la graine viennent de l'hôte.
- **Le capteur vit dans l'APP, jamais dans le SDK** (SDK Purity ; `GameTiltSource`).

## Décisions (les miennes, dites pour pouvoir être refusées)

1. **La combustion dure 1,2 s** (était 0,6 s iOS / 700 ms web). Un front qui
   traverse une bulle, des flammes qui s'élèvent et des étincelles qui
   s'éloignent ne se lisent pas en 600 ms. Le fondu « Réduire les animations »
   reste à 250 ms. Les trois plateformes prennent la même valeur.
2. **Le vent se lit de deux choses, sommées et bornées à ±1** : l'inclinaison
   latérale (roulis) et l'accélération latérale filtrée de l'appareil. Un
   téléphone qu'on penche ou qu'on déplace vers la gauche souffle vers la
   gauche. Au repos et sans capteur (simulateur, bureau, navigateur sans
   `deviceorientation`), le vent souffle **vers le bord extérieur de la bulle**
   (vers la droite pour mes messages, vers la gauche pour ceux des autres) :
   le message quitte l'écran par son côté. La valeur est lue au DÉBUT de la
   combustion puis suivie pendant son cours ; elle n'est jamais nulle.
3. **UNE loi partagée, trois miroirs** : `packages/shared/utils/ephemeral-burn.ts`
   (source), `EphemeralBurnLaw` Swift (SDK) et Kotlin (`core/model`). Elle rend la
   durée, le vent effectif (bornes, somme, défaut par côté), et les trois temps
   de la courbe : ignition (0 → 0,15), propagation (0,15 → 0,8), cendres
   (0,8 → 1). Les témoins de parité sont les mêmes vecteurs sur les trois.
4. **Tout l'effet tient dans UN shader de calque** par plateforme — brûlure des
   lettres, lisière de braise, flammes et étincelles procédurales (hachage par
   particule, sans état CPU) — plutôt qu'un système de particules à côté. Une
   passe GPU, pas de `Canvas` par image, pas de `CAEmitterLayer`. Le shader
   reçoit `size`, `progress`, `wind`, `seed`, `overhang` et `reduce` (= 0).
5. **Le calque est AGRANDI avant l'effet** (marge transparente de 48 pt en haut,
   24 pt sur les côtés, puis marge négative) pour que flammes et étincelles
   sortent de la bulle sans changer la mise en page.
6. **Le front part du côté SOUS le vent et avance avec lui** : le vent dit où
   le feu va. Les cendres et les étincelles dérivent dans le même sens, les
   flammes s'inclinent.
7. **Le capteur ne tourne qu'entre la dernière minute d'un éphémère et la fin
   de sa combustion** (iOS : l'état `.imminent` existe déjà ; Android et web :
   même seuil). Jamais en permanence dans un fil.
8. **iOS d'abord**, puis Android, puis web, chacun livré par son lot ; la loi
   partagée part avec le lot iOS pour que les suivants la consomment.

## Ce que l'utilisateur voit

| temps (sur 1,2 s) | ce qui se passe |
|---|---|
| 0 → 0,15 | une braise s'allume au bord sous le vent ; les premières lettres rougissent |
| 0,15 → 0,8 | le front traverse la bulle, découpé par un bruit à l'échelle d'une lettre : les lettres partent une à une, lisière noire puis orange puis jaune ; au-dessus du front, des flammes montent et se couchent dans le vent ; des étincelles s'échappent, emportées, et s'éteignent |
| 0,8 → 1 | ce qui reste tombe en cendres grises qui dérivent et s'effacent ; la ligne se replie (l'hôte) |

Sous « Réduire les animations » : fondu de 250 ms, rien d'autre. Sans GPU
récent (iOS 16, Android API < 33, pas de WebGL2) : l'effet actuel (lueur +
rétrécissement + fondu), à la nouvelle durée.

## Architecture par plateforme

### iOS (lot 1)

- `packages/shared/utils/ephemeral-burn.ts` + témoins (la loi, source).
- `MeeshySDK/Models/EphemeralBurn.swift` : `fullDuration = 1.2`, et la loi
  (`EphemeralBurnLaw` : `wind(roll:lateral:fallbackSide:)`, `phase(progress)`).
- `MeeshyUI/Resources/Shaders/EphemeralBurnShaders.metal` : `meeshyEphemeralBurn`
  (`[[stitchable]]`, `SwiftUI::Layer`). Compilé dans `default.metallib` avec les
  shaders du jeu (même ressource).
- `MeeshyUI/Conversation/EphemeralBurnEffect.swift` : garde l'API ; devient
  `Animatable` sur `progress` (0 → 1 en `fullDuration` quand `isBurning` passe à
  vrai) ; iOS 17+ ⇒ `visualEffect { layerEffect(...) }` sur le calque agrandi ;
  iOS 16 ou Reduce Motion ⇒ chemins actuels. Lit le vent dans l'environnement
  (`\.ephemeralBurnWind: Double`, défaut `nil` ⇒ loi du côté).
- `EphemeralBurnShaders.precompile()` appelé à l'ouverture d'une conversation
  qui contient un éphémère (iOS 18+ ; sans quoi la première combustion paie la
  compilation).
- App : `EphemeralBurnWindSource` (CoreMotion, `@MainActor`, 30 Hz, démarre à
  `.imminent`, s'arrête quand plus rien n'est imminent ni en combustion) posé
  par le fil (`ConversationView`) dans l'environnement. `retire(...)` attend
  la nouvelle durée (déjà le cas : il lit `EphemeralBurn.duration`).
- Témoins : loi (parité TS ↔ Swift), `default.metallib` porte la fonction,
  `progress` 0 et 1 = identité, `progress` 0,5 ≠ identité, Reduce Motion =
  fondu, vent borné, capteur démarre/arrête aux bons états, hôte attend la durée.

### Android (lot 2)

- `core/model/.../EphemeralBurnLaw.kt` (miroir, JVM, `jvm-check`).
- `sdk-ui/.../bubble/EphemeralBurnShaderSources.kt` (AGSL, mêmes uniforms),
  `Modifier.ephemeralBurn(progress, wind)` : API 33+ ⇒ `RuntimeShader` en
  `graphicsLayer.renderEffect` ; sinon repli dégradé + fondu.
- `MessageBubble` : remplace `fadeOut + scaleOut` par une phase « en
  combustion » de la même durée que la loi, puis le repli.
- App : `EphemeralBurnWindSource` (rotation vector + accélération linéaire),
  même cycle de vie que `GameTiltSource`.

### Web (lot 3)

- Consomme `@meeshy/shared/utils/ephemeral-burn` ; `DESTRUCTION_MS` en devient
  une projection.
- `lib/view/ephemeral-burn/` : fragment WebGL2 (même algorithme), moteur
  réutilisé de `lib/game/gl/` (env, raf, visibilité, orientation).
- Le texte de la bulle est REDESSINÉ dans un canvas 2D (police, couleur et
  boîtes de ligne lues de `Range.getClientRects()` et des styles calculés) qui
  devient la texture du shader ; la rangée DOM passe `visibility: hidden` pendant
  la combustion. Un DOM ne se lit pas en texture autrement sans tainter le canvas.
- Repli : pas de WebGL2 ⇒ les keyframes CSS actuelles, à la nouvelle durée ;
  `prefers-reduced-motion` ⇒ fondu.

## Non-objectifs

- Pas de son, pas d'haptique (une destruction est silencieuse — un éphémère
  détruit ne doit pas se signaler aux voisins).
- Pas de combustion des médias image/vidéo au pixel : la bulle média brûle comme
  un bloc (son calque entier), les lettres seules se découpent au bruit fin.
- Pas de rejeu : « on n'assiste pas à une destruction passée » (web, verbatim).
- Pas de changement de ce QUI expire ni QUAND : seulement ce qu'on voit.

## Treize dimensions visées à la clôture

Performance et fluidité (une passe GPU, aucun `Timer`, aucune allocation par
image ; mesure Instruments sur appareil), mémoire (le capteur s'arrête, le
shader est une ressource du module), accessibilité (Reduce Motion, VoiceOver
masqué pendant la combustion), cohérence (trois plateformes, même loi, même
courbe, même durée), compatibilité (iOS 16 / API < 33 / sans WebGL2 ont un
repli), maintenabilité (une loi, trois miroirs, parité testée), complétude
(cinq peaux iOS, bulle et rangée plate Android et web).

## Ce qui est laissé au constructeur

Les constantes du bruit (échelle des cellules ≈ une lettre, octaves), la
palette exacte de la braise (`MeeshyColors.warning` → `error` → noir), le
nombre d'étincelles (≈ 24) et la hauteur des flammes — à régler à l'œil sur
appareil, bornés par le budget d'une passe à 120 fps sur un iPhone 12.
