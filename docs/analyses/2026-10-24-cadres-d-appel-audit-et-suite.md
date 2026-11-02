# Cadres d'appel : audit, tri et suite (2026-10-24)

Issue : #12683 (milestone « Pendant un appel, on capture l'instant dans un cadre signé Meeshy adapté au nombre de participants »).
Relevé en lecture seule sur `dev` au commit `5911cb26`, puis décisions du porteur le même jour.

## 1. Ce qui existe

Meeshy livre 404 décors (306 en comptant chaque motif d'appel une fois), tous gratuits. 17 bougent ; aucun des 48 cadres d'appel.

| Système | Items | Rendu iOS | Animés | Vu par les autres |
|---|---|---|---|---|
| Cadres d'appel (12 ambiances) | 48 motifs, 146 variantes par taille de groupe | CoreGraphics (CPU) ; en direct, Core Image sur une `MTKView` à 30 i/s | 0 | Proposé à l'autre en duo vidéo, jamais incrusté dans la vidéo envoyée |
| Montages « Classiques » | 13 | CoreGraphics | 0 | Non |
| Contours d'avatar | 21 (9 packs) | SwiftUI `Canvas` + chemins SVG, Core Animation | 8 | Oui |
| Cadres de bannière | 14 (7 packs) | Chemins SVG → `CAShapeLayer` | 7 | Oui |
| Fonds de bannière | 7 | Dégradés, motifs, 1 Lottie | 1 | Oui |
| Fonds de conversation | 15 | Même moteur | 1 | Non |
| Cadres de gloire (jeu) | 188 (10 packs) | Couches WebP ; iOS n'affiche que des vignettes | 0 | Photo exportée |

- **Source unique** des cadres d'appel : `packages/shared/design/call-capture-frames/<ambiance>.json`, déplié en Swift par `packages/shared/scripts/generate-call-frames-swift.ts`, lu tel quel par le web, miroir Android par Gradle.
- **Moteur d'animation existant** : `FrameMotionPlan` / `FrameMotionLayers` (5 mouvements : `rotate`, `pulse`, `twinkle`, `skew`, `sweep`), Core Animation, coupé sous « Réduire les animations », en économie d'énergie et en surchauffe. Branché sur les contours et bannières seulement.
- **Format déjà prêt pour l'animation** (`CallFrameFormatExtension.swift`, `frame-spec.ts`) : `ornaments[].motion` (`still | loop | onAppear`), couches de scène (`image`, `lottie`, `sprite`, `video-loop`, `particles`, `light`), déclencheurs (`onTap`, `onShake`, `onTilt`, `onSmile`, `onEmotion`, `onTime`, `onSpeaking`, `onCallEvent`), replis, crédits, coût. Aucun motif ne s'en sert et le renderer les ignore.
- **Anomalies** : « Nº 42 / 100 » figé sur 21 plaques de gloire ; exposants perdus sur 11 cadres de gloire ; textes de gloire en français seulement ; marque écrite « meeshy », « Meeshy » et « MEESHY » ; 9 motifs n'existent qu'en duo, un groupe de 7 à 12 n'en voit que 24.

## 2. Benchmark

- **Snapchat** tient appel + Lens par discipline de budget, pas par puissance : cible 30 fps (plancher 15), sortie 2D ≤ 720×1280, RAM < 150 Mo, Lens < 8 Mo, un seul modèle ML, scripts événementiels ([guide Lens Studio](https://developers.snap.com/lens-studio/publishing/optimization/performance-optimization-guide)).
- **Discord** vend ses décorations d'avatar animées comme des objets de collection : drops saisonniers, collabs (My Hero Academia, mai 2025), propriété permanente, prix d'un skin de jeu.
- **Esthétiques 16-26 ans en 2026** : Y2K léger, coquette / soft girl, techwear, quiet luxury, dark academia.
- **Décision porteur** : pas de Snap Camera Kit. On construit sur les technologies Apple (Vision, Core Image, Metal, Core Animation, CoreMotion, AVFoundation).

## 3. Décisions du porteur (2026-10-24)

1. **Rien n'est supprimé.** Le registre choc est assumé comme levier marketing ; on retirera seulement ce qui dérange vraiment, à l'usage. On peut même aller plus loin dans le même registre (Prison, Tombe…).
2. **7 ambiances ouvertes par défaut** : Signature, Jovial, Féerique, Futuriste, Hors norme, Glauque, Morbide. Les 5 autres (Distingué, Élégant, Déconnecté, Corporate, Fantastique) restent dans l'app derrière « Plus d'ambiances ».
3. **3 à 5 cadres vedettes par ambiance**, retravaillés pour être très attractifs ; les autres motifs de l'ambiance restent un tap plus loin.
4. **Noms d'ambiance inchangés.**
5. **iOS d'abord**, les autres plateformes ensuite.

## 4. Performance : appel + cadre + filtre sans surchauffe

Le pipeline est sain (WebRTC 146, H.264 matériel, 720p30, un `CIContext` Metal réutilisé, Vision hors du thread de capture) mais fait du travail inutile, puis coupe tout d'un coup à la chaleur. Aucun coût n'est mesuré sur appareil dans le dépôt.

| # | Point chaud | Où | Correctif |
|---|---|---|---|
| 1 | « Teint naturel » actif par défaut : détection de visage à 15 Hz sans visage + rendu GPU plein cadre | `VideoFilterPipeline.swift:38`, `CallFaceTracker.swift:115` | Sous budget du contrôleur ; 2 Hz sans visage |
| 2 | La surface du cadre redessine à 30 i/s même sans image neuve, au-dessus d'une vue distante en double | `CallLiveFrameSurface.swift:80-82`, `CallView+Connected.swift:536-541` | Dessin à la demande ; retirer le doublon |
| 3 | Filtres en 720p plein débit même quand l'encodeur envoie 360p/20 ; rendu synchrone sur le thread de capture | `P2PWebRTCClient+CaptureFormat.swift:106-111`, `VideoFilterPipeline.swift:389` | Réduire avant de filtrer ; rendu asynchrone |
| 4 | Segmentation sur l'image 720p entière à 15 Hz | `CallBackgroundBlur.swift:48-52` | Image réduite, une requête Vision par image |
| 5 | Capture/Montage relit les images GPU sur le CPU (5 à 15 i/s) | `CallFrameGrabber.swift:88`, `CallFrameRenderer.swift:81-92` | Composition 100 % GPU |
| 6 | Réponse thermique tout-ou-rien, sans retour | `CallManager+Thermal.swift:24-95` | Contrôleur de qualité gradué et réversible |
| 7 | Verre flouté et ombres sur la vidéo ; clip arrondi inutile | `CallView+SelfView.swift:86`, `CallView.swift:250` | Fonds opaques pendant la vidéo |
| 8 | `CallView` observe tout `CallManager` (32 propriétés) et les sous-titres partiels | `CallTranscriptionService.swift:787,807` | Observation découpée par sous-vue |

Contrôleur de qualité proposé (valeurs à calibrer sur appareil) : niveau 0 nominal 720p30 tout actif ; 1 vigilance (« fair ») 720p24, teint naturel coupé, segmentation `fast` 10 Hz, particules ÷ 2 ; 2 économie (Low Power) 540p20, mouvements Core Animation seuls ; 3 protection (« serious ») 480p15, filtres couleur seuls, cadre fixe ; 4 plancher (« critical ») 360p15, vidéo jamais coupée. On remonte d'un niveau après 60 s stables ; les réglages de l'utilisateur sont conservés à part.

## 5. Suite : des cadres de vendeurs aux animations remarquables, sans code

Aujourd'hui un cadre d'appel ne peut venir que du dépôt (JSON compilé dans l'app). La cible : un **vendeur** (créateur, marque, partenaire d'événement) publie un cadre animé et réactif **sans écrire de code et sans déploiement de l'app**.

### 5.1 Ce qui existe déjà et qu'on réutilise

- Le **format** des cadres déclare déjà scène, déclencheurs, replis, crédits et coût : c'est un document déclaratif, sans code.
- Le **contrat Lens v1** (`docs/product/meeshy-lens-v1.md`, `packages/shared/types/lens-format.ts`) a résolu les questions de confiance : refus en bloc des shaders, scripts, URL, réseau et 3D ; fichiers adressés par leur contenu ; ancres sur 13 points nommés du visage ; lecture tolérante d'une primitive inconnue ; `update-required` quand le schéma dépasse le client.
- La **chaîne de packs** : soumission communautaire modérée (`services/gateway/src/routes/packs-appearance-community.ts`), fichiers servis par contenu (`pack-assets.ts`), boutique (`packs-shop.ts`), octroi par le jeu (`PackGrants`).

### 5.2 Le pack de cadres d'appel vendeur

Un pack = un ou plusieurs motifs au format actuel + leurs fichiers (WebP, Lottie JSON, planches de sprites), soumis, validé par le même schéma zod, modéré, puis servi par contenu. Le client le lit comme un motif du catalogue embarqué.

| Brique | Ce que le vendeur déclare | Comment iOS le rend (technologies Apple) |
|---|---|---|
| Ornements animés | `motion: loop | onAppear` | `FrameMotionLayers` sur les `CGPath` d'ornement |
| Particules | couche `particles` + `preset`, `max` ≤ 150 | `CAEmitterLayer` (GPU, zéro CPU par image) |
| Illustration animée | couche `lottie` | Lottie moteur `.coreAnimation`, sous `LottieLiveBudget` |
| Sprite | couche `sprite` (planche + cadence) | `CALayer.contentsRect` animé par `CAKeyframeAnimation` |
| Lumière | couche `light` + couleur | `CAGradientLayer` radial animé, mode de fusion |
| Boucle vidéo | couche `video-loop` (≤ 2) | `AVPlayerLayer` en boucle, coupée dès le niveau 2 |
| Réaction au visage | `onSmile`, `onEmotion` | Vision : points du visage déjà suivis (`CallFaceTracker`), sourire = écart des commissures |
| Réaction au geste | `onShake`, `onTilt`, `onTap` | CoreMotion, `UITapGestureRecognizer` |
| Réaction à la voix | `onSpeaking` | Niveau audio WebRTC local |
| Sticker au visage | ancre `face` du contrat Lens | Position suivie par Vision, couche Core Animation |
| Dégradation | `fallbacks.reduced / minimal` | Appliquée par le contrôleur de qualité (§ 4) |

Garde-fous : coût déclaré (`light / standard / rich`) vérifié contre le budget du niveau courant ; plafonds de scène du format (12 couches, 2 boucles vidéo, 2 lumières, 150 particules) ; crédits affichés à l'appui long ; mêmes refus que Lens v1.

### 5.3 Les déclinaisons, au glissement vertical dans la vignette

Un même cadre propose plusieurs **déclinaisons** (palette, ornements, scène) ; dans le carrousel, un **glissement haut/bas à l'intérieur de la vignette** passe de l'une à l'autre, un glissement gauche/droite change de cadre comme aujourd'hui. Des points verticaux sur le bord de la vignette disent combien il y en a.

- **Format** : clé facultative de motif `styles: [{ id, name, look }]` (6 au plus), où `look` surcharge la base clé par clé, comme les variantes de taille de groupe. Le mot `variants` est déjà pris par les tailles de groupe.
- **Identité** : un cadre choisi devient `ambiance.motif.tranche` + `style`. En direct, l'événement `call:frame-select` porte un champ facultatif `style` ; un ancien client l'ignore et rend la base (rétrocompatible).
- **Vendeur** : une déclinaison est l'unité de vente naturelle (la base gratuite, la déclinaison « néon » en Meeshes ou par le jeu).

## 6. Feuille de route

| Phase | Contenu | Porte |
|---|---|---|
| 0 | 7 ambiances par défaut, vedettes retravaillées, Prison et Tombe, ornements animés des vedettes (#12683) | Aperçus validés, CI verte |
| 1 | Mesure (MetricKit, analytics i/s, ms, thermique, endurance 30 min) + contrôleur de qualité + points chauds 1 à 4 | 30 min d'appel + flou ≥ 28 i/s, jamais « serious » avant 20 min |
| 2 | Couches de scène et déclencheurs dans le renderer iOS ; déclinaisons au glissement vertical | Un cadre animé ajoute au plus 2 ms GPU par image |
| 3 | Pack de cadres vendeur : soumission, modération, service par contenu, boutique | Un vendeur publie un cadre animé sans déploiement |
| 4 | Web puis Android sur le même format | Parité visuelle des vedettes |
