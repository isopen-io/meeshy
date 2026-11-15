# Une boutique, des fonds, un accent à soi — spécification (#10631, #10632)

> Date : 2026-10-14 · Issues : #10631 (fonds de conversation + accent personnel), #10632 (boutique unifiée)
> Décisions porteur du 2026-10-14 : elles sont reprises en § 1 et ne se rediscutent pas dans les lots.
> Cette spécification décrit le QUOI et le CONTRAT ; l'état de chaque lot vit dans son issue.

## 0. En une phrase

Le moteur de packs qui sert déjà les stickers et les cadres devient **la** boutique de Meeshy : il gagne trois domaines (`wallpaper`, `avatar-ring`, `banner`), un prix optionnel en Meeshes et une possession lue par le serveur. Chaque surface de l'application restitue ce que l'utilisateur possède, avec un lien vers la vitrine filtrée. Le premier usage de ce socle est le fond de conversation et l'accent PERSONNELS, synchronisés entre les appareils de l'utilisateur.

## 1. Décisions (porteur, 2026-10-14)

| # | Décision | Conséquence de contrat |
|---|---|---|
| D1 | Fond et accent = choix **PERSONNEL**, synchronisé entre MES appareils, jamais partagé avec les autres membres | stocké sur `UserConversationPreferences` (ligne par lecteur), diffusé à `user:{id}` seulement |
| D2 | L'accent personnel s'applique **partout pour moi** : fil, bulles envoyées, composeur, en-tête, ligne de liste, anneau d'avatar de la conversation | UNE fonction de résolution par plateforme, appelée par le site qui calcule déjà l'accent — aucun site d'appel ne choisit lui-même |
| D3 | Le fond actuel (iOS `ConversationAnimatedBackground`, web `.thread-backdrop`) est **PRÉSERVÉ** sous le nom « Signature », et reste le défaut | `appearance` absent ⇔ Signature ; le code Signature n'est pas réécrit |
| D4 | 14 modèles chics, de plusieurs styles (motif vectoriel en tuile, illustration, dégradé) + « couleur unie » (gamme de 16) + « photo » (une image envoyée DANS la conversation, voile et flou réglables) | catalogue § 6, gamme § 7, mode photo § 5.4 |
| D5 | Clair / sombre automatique | chaque modèle et chaque couleur porte ses deux variantes ; aucun réglage utilisateur |
| D6 | Les animations sont une couche **Lottie** facultative, rendue par le moteur PARTAGÉ de la session stickers (#10630) — jamais un second moteur | le contrat porte `lottie?: PackAssetRef` ; tant que le moteur n'est pas sur `dev`, la couche est ignorée (fail-closed visuel : le modèle statique s'affiche) |
| D7 | **UNE SEULE BOUTIQUE**, filtrable par domaine ; chaque surface restitue ce que l'utilisateur possède + un lien vers la boutique filtrée | domaines § 3, vitrine § 4.4, surfaces § 9 |
| D8 | Prix optionnel en **Meeshes** (`MeeshLedger` + `MeeshSpend`, idempotent) ; gratuit = installable directement ; possession lisible par le serveur ; **aucun argent réel** | § 4.2–4.3, modèle `UserPackOwnership` |
| D9 | Vendeurs tiers plus tard, par l'origine `community` et le circuit de soumission existant : la spec le REND POSSIBLE sans le livrer | § 12 |
| D10 | Contours d'avatar = **loi des cadres** (`frame-usage.ts`, `canUseFrame`) avec un usage `avatar` : UN seul système de cadres | § 3.3 |
| D11 | Contour et bannière équipés vivent sur le PROFIL et sont visibles des autres | `User.equippedAvatarRing`, `User.equippedBanner`, § 5.5 |

## 2. Ce qui existe et qu'on réutilise (relevé 2026-10-14 sur `dev`)

| Brique | Où | Rôle ici |
|---|---|---|
| Moteur des packs à domaines | `packages/shared/types/content-pack.ts` (`PACK_DOMAINS`, `PACK_ORIGINS`, `packChoiceKey`, `isPackInstalled`) | gagne trois domaines et deux champs servis |
| Registre officiel/intégré | `packages/shared/types/content-pack-index.ts` (`PackIndexEntrySchema`), `services/gateway/src/services/packs/PackIndex.ts` (`REGISTRY_FILES`) | gagne `price`, trois registres de plus |
| Catalogue et installation | `services/gateway/src/services/packs/PackCatalog.ts` (installation = ligne `UserStickerPack` sous `packChoiceKey`) | gagne la possession et l'achat |
| Fabrique de routes | `services/gateway/src/routes/pack-routes.ts` (`registerPackRoutes`), montages `sticker-packs.ts`, `packs-glory-frame.ts` | montage des trois domaines + route d'achat générique |
| Magasin adressé par contenu | `GET /api/v1/pack-assets/:file` (`routes/pack-assets.ts`), fichiers `services/gateway/assets/packs/<sha16>.<ext>` | couvertures et contrats des nouveaux packs |
| Dépense de Meeshes | `services/gateway/src/services/game/MeeshSpend.ts` (idempotence `(userId, requestId)`, refus `GameRefusal('INSUFFICIENT_MEESHES')`) | `SpendKind` gagne `pack-purchase` |
| Loi des cadres | `packages/shared/types/frame-usage.ts` (`canUseFrame`), miroir `packages/MeeshySDK/Sources/MeeshySDK/Packs/FrameUsage.swift` | surface et contexte `avatar` |
| Préférences par conversation | `UserConversationPreferences` (schema.prisma), écrivain unique `services/gateway/src/services/conversationPreferencesSync.ts` (version + diffusion `user:preferences-updated` sur `user:{id}`) | porte `appearance` |
| Liste des conversations | `conversationUserPreferencesSelect` (`routes/conversations/core-selects.ts`, filtré `where: { userId: viewerId }, take: 1`), wire `packages/shared/types/api-schemas/conversation.ts` | sert `appearance` au lecteur seul |
| Galerie média | `GET /conversations/:id/messages?view=media&kinds=visual` (web `lib/api/conversation-media-hub.ts`, iOS galerie de conversation) | source du mode photo |
| Boutique web générique | `apps/web/src/components/pack-shop.tsx` (`PackShopAdapter`), `frame-pack-shop.tsx`, `routes/settings-packs.tsx` (`?volet=packs&type=cadres`), port générique `lib/api/packs.ts` | devient la vitrine unique |
| Boutique iOS | `PacksSettingsView.swift`, `MeeshyUI/Packs/PackShopView.swift`, `FramePackShelfView.swift`, `MeeshySDK/Packs/PackDomain.swift` | idem |
| Accent | web `apps/web/src/lib/accent.ts` (`accentPaletteOf`, `accentOf`, `withAccent`) ; iOS `MeeshyConversation.accentColor` / `colorPalette` (`CoreModels.swift`), `ColorGeneration.hueShiftedHex` ; TS `conversationAccentPalette` (`packages/shared/utils/conversation-colors.ts`) | résolution personnelle |
| Fond Signature | iOS `ConversationAnimatedBackground.swift` (statique, `animationsEnabled = false`) ; web `lib/view/thread-backdrop.ts` + `.thread-backdrop` (`styles/thread-scene.css`) | conservés tels quels |
| Lecteur de chemins SVG Swift | `packages/MeeshySDK/Sources/MeeshyUI/Game/GameSVGPath.swift` (M L H V C S Q A Z) | extrait en primitive partagée du module `MeeshyUI` |
| Couche Lottie déclarée | `apps/web/src/lib/calls/frames/frame-spec.ts` (`SCENE_LAYER_KINDS` contient `lottie`) | même nom de couche |

## 3. Les trois nouveaux domaines

`PACK_DOMAINS = ['sticker', 'glory-frame', 'capture-frame', 'wallpaper', 'avatar-ring', 'banner']`.

La clé d'installation reste `packChoiceKey(domain, slug)` = `<domaine>.<slug>` (aucun changement de schéma pour l'installation). `parsePackChoiceKey` accepte les nouveaux préfixes sans autre modification.

### 3.1 `wallpaper` — fonds de conversation

Un pack de fonds porte une liste de **modèles** (`AppearanceDesign`, § 5.1). Aucun usage de cadre (`usage` absent, comme les stickers). Origines : `builtin` (embarqué dans les clients) et `official` en v1 ; `community` plus tard (§ 12).

### 3.2 `banner` — bannières de profil

Un pack de bannières porte des `AppearanceDesign` — **le même schéma que les fonds** (mutualisation : un motif ou un dégradé se peint de la même façon dans un fil 9:19 et dans une bannière 3:1). Seul le cadrage change (`fit` § 5.1). Aucun usage de cadre.

### 3.3 `avatar-ring` — contours d'avatar

Un pack de contours porte des `AvatarRingDesign` (§ 5.2). C'est un **cadre** au sens de la loi : son entrée de registre porte `usage: { kind: 'free', surfaces: ['avatar'] }`.

Changements de la loi des cadres (`packages/shared/types/frame-usage.ts`) :

- `FREE_FRAME_SURFACES = ['call', 'photo', 'video', 'avatar']` ;
- `FrameUseContext` gagne `{ kind: 'avatar' }` ;
- `freeServes` : `context.kind === 'avatar' ⇒ surfaces.includes('avatar')`. Un cadre d'appel ne sert PAS l'avatar (et inversement) : l'avatar est une surface à part entière, déclarée explicitement ;
- `usageFitsDomain` (`content-pack-index.ts`) : un pack `avatar-ring` porte un usage `free` dont les surfaces sont exactement `['avatar']` ; un pack `capture-frame` ne peut PAS déclarer `avatar` (les anciens clients iOS décodent les packs de capture et rejetteraient une surface inconnue) ;
- les vecteurs croisés de l'avatar vivent dans un fichier NEUF `packages/shared/design/packs/frame-usage-avatar-vectors.json`, rejoué par vitest dès le lot fondation et par le miroir Swift au lot iOS « profil ». On n'ajoute RIEN à `frame-usage-vectors.json` tant que le miroir Swift ne sait pas lire `avatar` : la suite iOS de `dev` rougirait pour toutes les sessions.

`describeFrameUsage` gagne le libellé « Contour de profil » (7 langues).

## 4. Prix, possession, achat, vitrine

### 4.1 Le prix

`PackIndexEntrySchema` gagne `price: z.optional(z.int().check(z.minimum(1), z.maximum(10_000)))` — en Meeshes. Absent = gratuit. Jamais `0` (un pack gratuit n'a pas de prix, il n'a pas un prix nul : un seul état pour une seule réalité). Un pack `builtin` n'a jamais de prix (refine).

Le résumé servi (`PackSummary`) gagne deux champs **optionnels** (additifs, ignorés par les anciens clients) :

```ts
readonly price?: number | null;   // null = gratuit
readonly owned?: boolean;         // gratuit ⇒ true ; payant ⇒ ligne UserPackOwnership
```

### 4.2 La possession

**Règle unique** (`packages/shared/types/content-pack.ts`, `isPackOwned`) : un pack gratuit est possédé par tout compte inscrit ; un pack payant est possédé si et seulement si une ligne `UserPackOwnership` existe pour `(userId, packChoiceKey(domain, slug))`.

```prisma
/// LA POSSESSION d'un pack payant (#10632). Écrite dans la MÊME transaction que la
/// ligne `spend` du registre `MeeshLedger` (MeeshSpend.apply) : ni achat sans
/// possession, ni possession sans achat. Les packs gratuits n'ont pas de ligne.
model UserPackOwnership {
  id           String   @id @default(auto()) @map("_id") @db.ObjectId
  userId       String   @db.ObjectId
  /// `packChoiceKey(domaine, slug)` — même clé que `UserStickerPack.packSlug`.
  packKey      String
  /// Le prix PAYÉ, figé à l'achat (le prix servi peut changer ensuite).
  priceMeeshes Int
  /// Le `requestId` de la dépense — relie la possession à sa ligne de registre.
  requestId    String
  acquiredAt   DateTime @default(now())

  @@unique([userId, packKey])
  @@index([userId])
}
```

**Installer ≠ posséder.** L'installation (ligne `UserStickerPack`) dit seulement « ce pack apparaît dans MES listes » (sélecteur de fond, sélecteur de contour…). Le **rendu** d'un choix exige la possession, jamais l'installation : retirer un pack de fonds ne fait pas disparaître le fond d'une conversation qui l'utilise, et il n'y a donc aucune garde de retrait nouvelle. Installer un pack payant non possédé répond **403 `PACK_NOT_OWNED`** (`PackCatalog.setInstalled` gagne l'issue `not-owned`).

### 4.3 L'achat

`POST /api/v1/packs/<domaine>/:slug/purchase` — monté par la fabrique (`registerPackPurchaseRoute`, `pack-routes.ts`) pour les domaines dont le registre peut porter un prix (`wallpaper`, `avatar-ring`, `banner` ; les stickers et les cadres le recevront quand un pack payant existera — aucune réponse figée ne change).

- Corps : `{ requestId: string }` (8–64 caractères `[A-Za-z0-9_-]`), généré par le client AU GESTE et réutilisé pour tout nouvel essai du même geste.
- Comptes inscrits seulement (403 `REGISTERED_USER_REQUIRED`, garde existante `packRouteGuard`).
- `MeeshSpend.spend({ kind: 'pack-purchase', price, requestId, meta: { domain, slug, version }, guard, apply })` :
  - `guard` : pack inconnu/masqué ⇒ 404 `PACK_NOT_FOUND` ; pack gratuit ⇒ 409 `PACK_IS_FREE` ; déjà possédé (autre `requestId`) ⇒ 409 `PACK_ALREADY_OWNED` ;
  - `apply(tx)` : crée `UserPackOwnership` ET installe le pack (`UserStickerPack` sous `packChoiceKey`, compteur atomique), dans la même transaction ;
  - `insufficient` ⇒ 409 `INSUFFICIENT_MEESHES` avec `balance` (même code que les dépenses du jeu, `GameRefusal`) ;
  - `already-spent` (rejeu du même `requestId`) ⇒ 200 avec le même résumé : un double toucher, un retry réseau ou une reprise d'application n'achètent qu'une fois.
- Réponse 200 : `{ pack: PackSummary (owned: true, installed: true), balance: number }`.
- Diffusion : `pack:installation-updated` sur `user:{id}`, payload additif `owned?: boolean`.
- Seau de débit propre (10 / minute / compte).

Le prix débité est celui du REGISTRE au moment de la transaction, jamais celui envoyé par le client (le client n'envoie pas de prix).

### 4.4 La vitrine unique

`GET /api/v1/packs/shop?domains=wallpaper,banner` (paramètre optionnel ; absent = tous les domaines servis) — comptes inscrits, `Cache-Control: private, no-cache`.

```ts
type PackShopResponse = {
  readonly domains: readonly { readonly domain: PackDomain; readonly packs: readonly PackSummary[] }[];
  readonly balance: number;   // solde de Meeshes lu au registre (Σ delta), pour afficher « 12 Meeshes » sans second appel
};
```

Elle AGRÈGE les `catalog.catalogue(userId)` des domaines montés, dans l'ordre `PACK_DOMAINS`, sans logique propre. Un domaine inconnu dans `domains` est ignoré (jamais 400 : un client plus récent ne casse pas un serveur plus ancien). Un ANCIEN serveur répond 404 sur `/packs/shop` : les clients retombent alors sur les boutiques par domaine existantes.

Les routes par domaine restent la source pour l'installation et le détail : `/sticker-packs`, `/packs/glory-frame`, `/packs/wallpaper`, `/packs/avatar-ring`, `/packs/banner` (`GET /`, `GET /installed`, `GET /:slug`, `PUT|DELETE /:slug/install`, `POST /:slug/purchase`).

**Adresse de la vitrine filtrée** (contrat entre lots, identique sur les deux plateformes) :

- web : `/settings?volet=packs&domaine=<domaine>` (`type=cadres` reste lu, alias de `domaine=glory-frame`) ;
- iOS : `PacksSettingsView(initialDomain:)` et le lien profond `meeshy://settings/packs?domaine=<domaine>`.

## 5. Contrats (Zod, `packages/shared`)

Tous les schémas sont en `zod/mini` (convention des packs), fail-closed, et exportent un `parseX(input): X | null`.

### 5.1 `AppearanceDesign` — `packages/shared/types/appearance-design.ts`

La donnée vectorielle UNIQUE dont les deux plateformes peignent le même dessin. Ce sont des DONNÉES : aucun client n'injecte jamais de SVG brut reçu ; il construit son dessin depuis ces champs validés.

```ts
const HEX = /^#[0-9A-F]{6}$/;                              // majuscules, sans alpha
const PATH_D = /^[MmLlHhVvCcSsQqTtAaZz0-9eE.,\s-]{1,4000}$/; // commandes SVG seules, jamais d'autre caractère

type PaintRole = 'ink' | 'accent' | 'soft' | 'base';       // résolus par la palette du schéma (clair/sombre) ; 'accent' = l'accent EFFECTIF du lecteur

type DesignPalette = { base: Hex; ink: Hex; soft: Hex; accent?: Hex };  // accent absent ⇒ l'accent effectif
type DesignStroke = { d: PathD; role: PaintRole; opacity: number /*0..1*/; width?: number /*>0 ⇒ trait, absent ⇒ remplissage*/ };

type AppearanceDesign = {
  key: Slug;                                  // unique dans son pack
  style: 'pattern' | 'illustration' | 'gradient';
  palettes: { light: DesignPalette; dark: DesignPalette };
  // style === 'pattern' : une tuile répétée
  tile?: { width: number; height: number; scale: number /*0.5..3*/; rotation: number /*-45..45*/; paths: DesignStroke[] /*1..24*/ };
  // style === 'illustration' : un dessin unique posé sur la base
  scene?: { viewBox: [0, 0, number, number]; anchor: 'bottom' | 'center' | 'bottom-end'; paths: DesignStroke[] /*1..48*/ };
  // style === 'gradient' : un fond linéaire + des taches floues (aurore, maillé)
  gradient?: { angle: number /*0..360*/; stops: { role: PaintRole; at: number }[] /*2..4*/; blobs: { x: number; y: number; r: number; role: PaintRole; opacity: number }[] /*0..5, coordonnées 0..1*/ };
  fit: 'fill';                                // fil (9:19) et bannière (3:1) : couvrir, la tuile se répète, l'illustration s'ancre
  lottie?: PackAssetRef;                      // couche animée facultative, D6
};
```

Refines : la clé de forme correspond au `style` (exactement un des trois blocs) ; chaque `PathD` respecte la regex et sa longueur ; la somme des longueurs de chemins d'un modèle ≤ 24 000 caractères ; les couleurs sont des hex majuscules.

**Rendu de référence** — `packages/shared/utils/appearance-svg.ts` : `designToSvg({ design, scheme, accent, width, height }): string` et `designTileSvg({ design, scheme, accent }): string`. Fonction PURE, sans DOM. C'est la référence visuelle : la passerelle s'en sert pour rasteriser les couvertures (sharp), le web pour peindre, et iOS la reproduit en `Canvas` depuis la même donnée (§ 8). Les nombres sont arrondis à 2 décimales (sortie stable, testable par égalité).

### 5.2 `AvatarRingDesign` — `packages/shared/types/avatar-ring-design.ts`

```ts
type AvatarRingDesign = {
  key: Slug;
  stroke: { style: 'solid' | 'double' | 'dotted' | 'dashed' | 'gradient'; width: number /*0.02..0.12, fraction du diamètre*/; colors: Hex[] /*1..4*/ };
  ornament?: { paths: DesignStroke[] /*viewBox 0 0 100 100, autour d'un cercle de rayon 42*/ };
  lottie?: PackAssetRef;
};
```

Les couleurs d'un contour sont FIXES (pas de rôle `accent`) : un contour se voit des autres, il doit avoir la même couleur pour tous. `avatarRingSvg({ ring, size })` dans `appearance-svg.ts`.

### 5.3 Les contrats de pack

`AppearancePackContract` (`contractSchema: 1`) — servi en `<sha16>.json` par `/pack-assets` :

```ts
{ domain: 'wallpaper' | 'banner'; designs: AppearanceDesign[] }   // 1..32
{ domain: 'avatar-ring'; rings: AvatarRingDesign[] }              // 1..32
```

Les noms (7 langues) suivent le régime des cadres : `strings: { [lang]: PackAssetRef }` → `{ "<clé>": "Nom affiché" }`.

### 5.4 `ConversationAppearance` — `packages/shared/types/conversation-appearance.ts`

```ts
export const APPEARANCE_VERSION = 1;

type ConversationBackground =
  | { kind: 'signature' }
  | { kind: 'design'; pack: Slug; design: Slug }                // un AppearanceDesign d'un pack `wallpaper`
  | { kind: 'solid'; color: GamutKey }                          // § 7
  | { kind: 'photo'; attachmentId: ObjectId; veil: number /*0..0.8, pas 0.05*/; blur: number /*0..24, entier*/ };

type ConversationAppearance = {
  v: 1;
  background: ConversationBackground;
  accent: GamutKey | null;     // null = l'accent calculé de la conversation (loi actuelle)
  animate: boolean;            // couche Lottie ; défaut true ; ignorée sous « Réduire les animations »
};
```

Fonctions exportées :

- `parseConversationAppearance(input: unknown): ConversationAppearance | null` — strict, utilisé par la passerelle à l'écriture ;
- `readConversationAppearance(input: unknown): ConversationAppearance` — **tolérant par champ**, utilisé par les clients : un `background` illisible (un `kind` d'une passerelle plus récente) retombe sur Signature SANS perdre l'accent, et inversement ; absent ⇒ `DEFAULT_APPEARANCE` (`{ v: 1, background: { kind: 'signature' }, accent: null, animate: true }`) ;
- `appearanceFromPreferences(userPreferences: unknown): ConversationAppearance` — la projection depuis le tableau `userPreferences` du wire (entrée unique, `take: 1`), même narrowing fail-closed que `apps/web/src/lib/api/preferences.ts` ;
- `resolveAppearanceAccent({ computedPrimary, appearance, scheme }): ConversationAccentPalette` — l'accent EFFECTIF : `appearance.accent` présent ⇒ `conversationAccentPaletteFromPrimary(GAMUT[key][scheme].accent)` ; sinon la palette calculée inchangée.

`packages/shared/utils/conversation-colors.ts` gagne `conversationAccentPaletteFromPrimary(primaryHex)` : secondaire = teinte +30°, accent = −30° — la MÊME dérivation que `conversationAccentPalette` (miroir de `ColorGeneration.hueShiftedHex` iOS).

### 5.5 `ProfileDecor` — `packages/shared/types/profile-decor.ts`

```ts
type ProfileDecorRef = { pack: Slug; item: Slug };                 // stocké `"<pack>/<item>"`
type ServedProfileDecorItem = ProfileDecorRef & { origin: 'builtin' | 'official' | 'community'; contract: string | null /* src <sha16>.json, null pour un builtin embarqué */ };
type ServedProfileDecor = { avatarRing: ServedProfileDecorItem | null; banner: ServedProfileDecorItem | null };
```

Prisma, sur `User` (optionnels, aucun backfill) :

```prisma
/// Le contour d'avatar ÉQUIPÉ (#10632) : `"<pack>/<item>"` d'un pack `avatar-ring` possédé. Visible des autres.
equippedAvatarRing String?
/// La bannière de design ÉQUIPÉE (#10632) : `"<pack>/<item>"` d'un pack `banner` possédé. Non nulle, elle
/// prime sur l'image `banner` ; nulle, l'image `banner` (ou le défaut) s'affiche.
equippedBanner     String?
```

### 5.6 Le stockage du choix de conversation

```prisma
// UserConversationPreferences
/// L'apparence PERSONNELLE de la conversation (#10631) : `ConversationAppearance`
/// (packages/shared/types/conversation-appearance.ts), validée par Zod à l'écriture.
/// Absente = Signature + accent calculé. Jamais servie à un autre membre.
appearance Json?
```

## 6. Le catalogue des 14 modèles

Quatre packs. Tous GRATUITS en v1 (Meeshy est gratuit) ; le mécanisme de prix est exercé par un pack d'exemple payant sous `PACK_SAMPLES=1` (staging seulement), comme les packs d'exemple des cadres.

| Pack (slug) | Origine | Installé par défaut | Retirable |
|---|---|---|---|
| `essentiels` — « Essentiels » | `builtin` (embarqué) | oui | non |
| `heritages` — « Héritages » | `builtin` (embarqué) | non | oui |
| `nature-et-ciel` — « Nature et ciel » | `builtin` (embarqué) | non | oui |
| `illustrations` — « Illustrations » | `builtin` (embarqué) | non | oui |

Les quatre packs sont `builtin` : leurs données (quelques Ko) sont EMBARQUÉES dans les clients, installer n'en télécharge aucun octet, et le premier rendu ne dépend jamais du réseau. Ce qui distingue « Essentiels » des trois autres est l'installation par défaut (ce qui apparaît d'emblée dans le sélecteur), pas l'origine. Un pack `official` futur (non embarqué) passera par le contrat servi.

Signature, couleur unie et photo ne sont PAS des modèles d'un pack : ce sont des MODES du sélecteur, toujours présents.

Les couleurs ci-dessous sont celles du contrat (`palettes.light` / `palettes.dark`) ; « accent » = l'accent EFFECTIF du lecteur (personnel ou calculé). Le lot fondation peut AJUSTER une valeur hex pour tenir les témoins de contraste (§ 10) — jamais la clé ni l'esprit.

| # | Clé | Nom (fr) | Pack | Style | Description visuelle | Clair base / ink / soft | Sombre base / ink / soft |
|---|---|---|---|---|---|---|---|
| 1 | `monogramme` | Monogramme | essentiels | motif | Le « M » de Meeshy au trait fin, entrelacé dans un treillis de losanges ; tuile 48×48, encre à 7 % et le M à l'accent à 10 % | `#F7F7FB` / `#1E1B4B` / `#E4E4F0` | `#0F0E1A` / `#C7C5F0` / `#1B1A2E` |
| 2 | `chevrons` | Chevrons | essentiels | motif | Chevrons fins en épi (herringbone), trait 1 px, rythme serré ; tuile 24×24, encre à 6 % | `#FAF8F5` / `#3F3A33` / `#ECE7DF` | `#121110` / `#D9D2C7` / `#1D1B19` |
| 3 | `aurore` | Aurore | essentiels | dégradé | Aurore boréale : trois taches floues (vert d'eau, violet, accent) en haut d'un fond nuit, qui s'éteignent vers le bas | `#F2F6FA` / `#5EEAD4` / `#C4B5FD` | `#0B1020` / `#2DD4BF` / `#7C3AED` |
| 4 | `maille` | Maillé | essentiels | dégradé | Dégradé maillé à quatre points, dérivé de l'accent (accent, +30°, −30°, base) : il SUIT la couleur choisie | `#FBFAFF` / accent / `#EEF0FF` | `#0E0D16` / accent / `#191827` |
| 5 | `art-deco` | Art déco | heritages | motif | Éventails Art déco (rayons en soleil) en rangées décalées, filets dorés ; tuile 64×32 | `#F7F3EA` / `#B08D57` / `#EDE5D3` | `#14161C` / `#C9A86A` / `#1E2029` |
| 6 | `seigaiha` | Seigaiha | heritages | motif | Vagues japonaises en arcs concentriques imbriqués ; tuile 40×20, indigo et accent | `#F4F6FB` / `#2E3A6E` / `#DFE4F2` | `#0D1120` / `#8EA2E8` / `#161B30` |
| 7 | `zellige` | Zellige | heritages | motif | Étoile marocaine à huit branches et croisillons, deux tons (vert céramique + accent) ; tuile 56×56 | `#F3F7F5` / `#0F6B5C` / `#DCEBE5` | `#0B1513` / `#5FC2A8` / `#13221F` |
| 8 | `bogolan` | Bogolan | heritages | motif | Motifs du Mali en terre : croix, points, zigzags et bandes, sur toile écrue ; tuile 72×72 | `#EFE4D2` / `#5B3A29` / `#E2D2B8` | `#1E1712` / `#C9A27E` / `#2A2018` |
| 9 | `topographie` | Topographie | nature-et-ciel | motif | Courbes de niveau d'une carte, lignes fines continues ; tuile 160×160 sans couture | `#F6F7F4` / `#4B5D4A` / `#E6EAE2` | `#0F120F` / `#9DB59A` / `#181D18` |
| 10 | `feuillage` | Feuillage | nature-et-ciel | motif | Feuilles et tiges au trait monoline, disposées en semis ; tuile 96×96 | `#F4F8F2` / `#2F5D3A` / `#E0EBDB` | `#0D140F` / `#8CC79A` / `#152018` |
| 11 | `treillis` | Treillis | nature-et-ciel | motif | Treillis de jardin en diagonale, petite rosace à chaque croisement ; tuile 32×32 | `#FAF7F4` / `#6B4E3D` / `#EFE7DF` | `#15110E` / `#D2B8A3` / `#201A16` |
| 12 | `constellation` | Constellation | nature-et-ciel | motif | Étoiles fines reliées par des traits ténus, quelques étoiles à l'accent ; tuile 120×120 irrégulière | `#F3F4FA` / `#3B4270` / `#E1E3F2` | `#070A18` / `#C9D2FF` / `#10142A` |
| 13 | `horizon` | Horizon | illustrations | illustration | Dunes au trait qui se superposent en bas d'écran, soleil bas en cercle plein à l'accent ; ancré en bas | `#FBF6EF` / `#8A5A3B` / `#F1E4D2` | `#140F0B` / `#E0B48C` / `#21180F` |
| 14 | `baobab` | Baobab | illustrations | illustration | Silhouette d'un baobab au crépuscule et un croissant de lune, ligne d'horizon basse ; ancré en bas à droite (miroir en RTL) | `#F8F2EC` / `#3E2C22` / `#EBDCCD` | `#100C0A` / `#E3C9AE` / `#1C1511` |

**Lisibilité** : tout motif reste DISCRET — l'opacité cumulée de l'encre ne dépasse pas 12 % (clair) / 14 % (sombre), mesurée par le témoin § 10 ; les bulles restent opaques et la date-puce garde son fond.

**Bannières (v1)** — pack `builtin` `bannieres-essentielles` (installé, non retirable) : `aurore`, `maille`, `constellation`, `art-deco`, `bogolan`, `topographie` repris À L'IDENTIQUE (même `AppearanceDesign`, autre pack, autre domaine — le contrat est copié par le générateur, jamais réécrit).

**Contours d'avatar (v1)** — pack `builtin` `contours-essentiels` (installé, non retirable), `usage: { kind: 'free', surfaces: ['avatar'] }` :

| Clé | Nom | Dessin | Couleurs |
|---|---|---|---|
| `filet` | Filet | trait plein fin (0,03) | `#6366F1` |
| `double-filet` | Double filet | deux traits fins séparés | `#1E1B4B`, `#C9A86A` |
| `perle` | Perles | points réguliers | `#F5F5F4` |
| `aurore` | Aurore | trait dégradé conique | `#2DD4BF`, `#7C3AED`, `#6366F1` |
| `deco` | Déco | segments Art déco + filet | `#C9A86A` |
| `laurier` | Laurier | deux branches de laurier en ornement | `#B08D57` |

## 7. La gamme de couleurs (16)

Une entrée = une clé stable + trois hex : `surface.light` (fond uni en clair), `surface.dark` (fond uni en sombre) et `accent` (pour l'accent personnel, identique en clair et sombre sauf colonne `accent.dark`). Source : `packages/shared/design/appearance/gamut.ts` (`APPEARANCE_GAMUT`, `GamutKey`).

| Clé | Nom (fr) | surface clair | surface sombre | accent | accent sombre |
|---|---|---|---|---|---|
| `indigo` | Indigo Meeshy | `#EEF0FF` | `#14152E` | `#6366F1` | `#818CF8` |
| `bleu-nuit` | Bleu nuit | `#E6ECF4` | `#0E1A2B` | `#1E3A5F` | `#5B8BC4` |
| `azur` | Azur | `#E5F2FC` | `#0C1C2A` | `#2F8FD8` | `#5AAEEB` |
| `lagon` | Lagon | `#E2F6F5` | `#0A1D1D` | `#0E9594` | `#2CC3C1` |
| `emeraude` | Émeraude | `#E3F5EE` | `#0A1C15` | `#0F8A63` | `#34C38F` |
| `olive` | Olive | `#EFF1E4` | `#16180F` | `#6B7A3A` | `#A3B46A` |
| `moutarde` | Moutarde | `#FBF3DC` | `#1F1A0B` | `#B7860B` | `#E0B43A` |
| `sable` | Sable | `#F6EFE2` | `#1E1A14` | `#A47E4F` | `#D2AE7E` |
| `terracotta` | Terracotta | `#F9E9E1` | `#22140F` | `#C0582F` | `#E58560` |
| `corail` | Corail | `#FDECE9` | `#24120F` | `#E0604E` | `#F38B7B` |
| `rose-poudre` | Rose poudré | `#FAEDEF` | `#22151A` | `#C76B7E` | `#E79AAB` |
| `framboise` | Framboise | `#FBE7EF` | `#250D18` | `#C2185B` | `#EC5C91` |
| `prune` | Prune | `#F3E9F3` | `#1D1220` | `#7B3F7D` | `#B97DBB` |
| `lavande` | Lavande | `#F0EDFA` | `#17142A` | `#7C6CC4` | `#A99BE8` |
| `ardoise` | Ardoise | `#EEF0F3` | `#14171C` | `#4B5563` | `#9CA3AF` |
| `graphite` | Graphite | `#F2F2F2` | `#0E0E0F` | `#27272A` | `#D4D4D8` |

Témoins (§ 10) : `accent` sur `surface.light` ≥ 3:1 et `accent sombre` sur `surface.dark` ≥ 3:1 (objets graphiques, WCAG 1.4.11) ; l'encre servie sur l'accent est `inkOnAccent` (noir ou blanc, le plus contrasté) ; une valeur qui échoue se corrige dans `gamut.ts`, jamais en baissant le seuil.

## 8. Rendu par plateforme

**Règle** : UNE donnée (le contrat § 5) → deux peintres. Le web (qui sert aussi Android par la coque Capacitor) peint en SVG/CSS depuis `appearance-svg.ts` ; iOS peint en `Canvas`/`Path` depuis la MÊME donnée, décodée par le SDK. Les dessins `builtin` — 14 fonds, 6 bannières (copies de 6 fonds) et 6 contours — sont EMBARQUÉS dans les deux clients : premier rendu sans réseau. Un pack `official` (non embarqué) se peint depuis son contrat servi, mis en cache par adresse de contenu.

### 8.1 Web / Android

- Motif : `designTileSvg` → `url("data:image/svg+xml;utf8,…")` mémoïsé par `(pack, design, scheme, accent)` dans un cache borné (32 entrées), posé en `background-image` + `background-size` = tuile × `scale` sur une couche `position: absolute; inset: 0` derrière le fil, `contain: strict`, aucune animation CSS ; rotation par `transform` de la couche.
- Illustration : `designToSvg` en SVG inline (`aria-hidden`), `preserveAspectRatio` selon `anchor`, miroir en RTL pour `bottom-end`.
- Dégradé : CSS pur (un `linear-gradient` + `radial-gradient` par tache), sans SVG.
- Couleur unie : `background-color` = `surface[scheme]`.
- Photo : l'image de la pièce jointe (vignette d'abord, pleine définition ensuite) en `background-image: cover`, `filter: blur(<blur>px)` sur une couche dédiée, voile = couche `rgba(base, veil)` au-dessus. E2EE : l'octet déchiffré par le chemin de lecture existant de la galerie, servi en `blob:` révoqué au démontage.
- Clair/sombre : suit la classe `:root.light` existante ; aucun réglage.
- Lottie : couche montée par le moteur partagé de #10630 quand il existe ET `animate` ET pas `prefers-reduced-motion` ; sinon rien.

### 8.2 iOS

- Le SDK (`MeeshySDK/Appearance/`) porte les modèles Swift (`AppearanceDesign`, `AvatarRingDesign`, `ConversationAppearance`, `AppearanceGamut`) décodés depuis le JSON du catalogue — une copie `Resources/appearance-catalog.json` OCTET POUR OCTET de la source partagée, gardée par un témoin vitest (`packages/shared/__tests__/appearance-catalog-ios-copy.test.ts`) : le Swift ne peut pas dériver de la donnée en silence.
- `MeeshyUI/Appearance/AppearanceDesignView` : un building block agnostique (prend `design`, `colorScheme`, `accentHex`), qui rend une TUILE une fois en `UIImage` (ImageRenderer, cache borné `NSCache` par clé `(pack, design, scheme, accent, scale)`), puis `Image(uiImage:).resizable(resizingMode: .tile)` ; illustration et dégradé en `Canvas`. `Equatable` + `.equatable()`, aucune `@ObservedObject` de singleton.
- Le lecteur de chemins `GameSVGPath` est EXTRAIT en `MeeshyUI/Primitives/SVGPathData.swift` (interne au module) ; le jeu garde son nom par un alias — aucun dessin du jeu ne change.
- `ConversationBackgroundView` (app) choisit : Signature ⇒ `ConversationAnimatedBackground` INCHANGÉ ; sinon `AppearanceDesignView` / couleur / photo.
- Photo : `CachedAsyncImage`/cache média existant (`CacheCoordinator`), vignette d'abord ; E2EE déchiffré par le chemin de la galerie ; `.blur(radius:)` + voile ; « Réduire la transparence » force un voile ≥ 0,6.
- Lottie : moteur partagé de #10630, coupé si `accessibilityReduceMotion` ou `meeshyForceReduceMotion`.

### 8.3 Accent personnel — où il s'applique

UNE fonction de résolution par plateforme ; les sites d'appel ne changent pas de forme :

- web : `accentPaletteOf(conversation)` (`apps/web/src/lib/accent.ts`) lit `appearanceFromPreferences(conversation.userPreferences)` (+ l'état optimiste local) et appelle `resolveAppearanceAccent`. Comme l'accent descend par `--accent` depuis `withAccent` (racine du fil, ligne de liste), le fil, les bulles envoyées, le composeur et l'en-tête le suivent sans modification ; la ligne de liste (`lens-row.tsx`) et son anneau d'avatar aussi. `starred-row.ts` et `call-montage-circle.ts` passent par `accentPaletteOf` au lieu d'appeler `conversationAccentPalette` en direct.
- iOS : `MeeshyConversation.displayPalette` (`colorPalette` stocké reste la palette CALCULÉE, encodée comme aujourd'hui) ; `accentColor` devient `displayPalette.primary` ; les 14 lecteurs de `.colorPalette` de l'app passent à `displayPalette`. La dérivation passe par `ColorGeneration.hueShiftedHex`, miroir de `conversationAccentPaletteFromPrimary`.

## 9. Restitution par surface

Chaque surface montre CE QUE L'UTILISATEUR POSSÈDE ET A INSTALLÉ pour SON domaine, puis une dernière tuile « Plus dans la boutique » qui ouvre la vitrine FILTRÉE (§ 4.4). Aucune surface ne montre un pack non possédé.

| Surface | Domaine | Web | iOS |
|---|---|---|---|
| Réglages de conversation → « Fond et couleur » | `wallpaper` | entrée dans `conversation-details-sheet.tsx` → feuille `conversation-appearance-sheet.tsx` | entrée dans `ConversationPreferencesTab.swift` → `ConversationAppearanceSheet.swift` |
| Profil (le mien) → « Bannière » et « Contour » | `banner`, `avatar-ring` | `profile.tsx` / `profile-sections.tsx` → `profile-decor-sheet.tsx` | `ProfileView.swift` (entrée seule) → `ProfileDecorSheet.swift` |
| Composeur → stickers | `sticker` | existant (`composer-sticker-sheet.tsx`, dernier onglet = boutique) ; gagne prix/possession | existant (`StickerPackShopView`) ; idem |
| Appel / capture → cadres | `capture-frame`, `glory-frame` | existant | existant |
| Réglages → « Boutique » (ex « Packs et téléchargements ») | tous | `settings-packs.tsx` = vitrine unique, filtre par domaine | `PacksSettingsView.swift` = vitrine unique |

**Le sélecteur de fond** (une feuille, chemin nominal = 2 gestes : ouvrir « Fond et couleur », toucher un modèle) :

1. une rangée d'aperçu en direct (le fil réel, en miniature, avec le fond et l'accent choisis) ;
2. « Signature » (en tête, coché par défaut), puis les modèles des packs `wallpaper` possédés et installés, groupés par pack ;
3. « Couleur unie » : les 16 pastilles de la gamme ;
4. « Photo de la conversation » : la galerie `?view=media&kinds=visual` de CETTE conversation (cache-first) ; après choix, deux curseurs « Voile » et « Flou » ;
5. « Accent » : « Automatique » (l'accent calculé) + les 16 pastilles ;
6. « Animations » (interrupteur, visible seulement si le modèle choisi a une couche Lottie) ;
7. « Plus dans la boutique » → `domaine=wallpaper`.

Chaque toucher s'applique IMMÉDIATEMENT (optimiste) et part en `PUT` ; un refus rétablit l'état d'avant et le DIT (toast).

## 10. Écriture, validation, synchronisation

### 10.1 Fond et accent

`PUT /api/v1/user-preferences/conversations/:id` — le corps gagne `appearance: ConversationAppearance | null` (optionnel ; `null` = remise à Signature + accent calculé). La validation est un module unique `services/gateway/src/services/appearance/conversationAppearanceGuard.ts`, appelé par la route AVANT `writeConversationPreferences` :

1. `parseConversationAppearance` — sinon 400 `INVALID_APPEARANCE` ;
2. `design` : le pack existe dans le registre `wallpaper` (non masqué), le modèle existe dans son contrat, et l'utilisateur le POSSÈDE (`isPackOwned`) — sinon 403 `PACK_NOT_OWNED` (un pack inconnu répond 403 aussi : on ne confirme pas l'existence) ;
3. `photo` : la pièce jointe existe, son message appartient à CETTE conversation (`message.conversationId === conversationId`), n'est pas supprimé, n'est pas éphémère (`expiresAt` nul), et la pièce jointe est une image (`mimeType` `image/*`) qui n'est ni `isViewOnce` ni `isBlurred` — sinon 404 `ATTACHMENT_NOT_AVAILABLE`, sans distinguer les causes (aucune confirmation d'existence d'une pièce d'une autre conversation). Conversation E2EE : la pièce peut être `isEncrypted` ; le serveur ne stocke QUE l'identifiant ;
4. l'appartenance à la conversation est déjà vérifiée par `writeConversationPreferences` (`not-a-participant`).

`writeConversationPreferences` (écrivain unique) gagne la colonne `appearance` : persistée, `version` incrémentée, instantané diffusé sur `user:{id}` (`user:preferences-updated`). `ConversationPreferencesPayload` gagne `appearance?: ConversationAppearance | null` (additif). `conversationUserPreferencesSelect` gagne `appearance: true` et le wire `userPreferences` (`api-schemas/conversation.ts`) le DÉCLARE (`{ type: 'object', nullable: true, additionalProperties: true }`) — sinon fast-json-stringify le retire en silence (même piège que `reaction`, documenté dans `core-selects.ts`). `GET /user-preferences/conversations/:id` le sert aussi. `DELETE` (remise à zéro) l'efface comme le reste.

### 10.2 Contour et bannière

`PUT /api/v1/me/profile-decor` — `{ avatarRing?: ProfileDecorRef | null; banner?: ProfileDecorRef | null }` (champ absent = inchangé, `null` = retiré). Validation : pack du bon domaine, item existant, possédé (403 `PACK_NOT_OWNED`) ; pour le contour, `canUseFrame(frameUsageOf(entry), { kind: 'avatar' })` doit être vrai (403 `FRAME_USAGE_MISMATCH`). Réponse : `ServedProfileDecor`. Diffusion : `profile:decor-updated` (`PROFILE_DECOR_UPDATED`, nouvel événement, payload `{ userId, decor: ServedProfileDecor, at }`) sur `user:{id}` (mes autres appareils).

Lecture : `GET /me` et le profil public (`routes/users/public-profile.ts`) servent `profileDecor: ServedProfileDecor` (additif). Les autres le voient à l'ouverture d'un profil (cache SWR) ; les contours sur les avatars HORS profil (auteurs de messages, participants) sont un suivi (§ 13).

## 11. Rétrocompatibilité

| Cas | Comportement |
|---|---|
| Ancien client ⇄ nouveau serveur | `appearance`, `price`, `owned`, `profileDecor` sont des champs NOUVEAUX ignorés par les décodeurs (Codable et TS tolèrent les clés en trop). Un ancien client qui fait `PUT` sans `appearance` ne l'écrase pas (écriture partielle existante). Il voit Signature et l'accent calculé — exactement aujourd'hui. |
| Nouveau client ⇄ ancien serveur | `/packs/wallpaper|avatar-ring|banner|shop` répondent 404 ⇒ boutique vide pour ces domaines (`absentMeansEmpty`, port web existant ; même règle côté iOS), sélecteur réduit à Signature + gamme + photo — mais le `PUT appearance` serait ignoré par un ancien serveur : le client n'affiche le sélecteur que si la liste des conversations a servi la clé `appearance` sur au moins une ligne OU si `GET /packs/wallpaper` répond (sonde mise en cache pour la session). |
| Nouveaux domaines dans `pack:installation-updated` | aucun client iOS n'écoute cet événement aujourd'hui (relevé 2026-10-14) ; le web non plus. Le SDK qui l'écoutera décode `PackDomain` avec un cas `unknown` (lot iOS boutique). |
| `PackDomain` iOS (`sticker`, `gloryFrame`) | gagne `wallpaper`, `avatarRing`, `banner` et un décodage tolérant (`unknown`) — jamais utilisé pour router une requête d'un domaine inconnu. |
| Loi des cadres | `avatar` n'apparaît que dans les packs `avatar-ring`, servis par une route neuve : un ancien client ne le décode jamais. |
| `appearance.kind` futur | `readConversationAppearance` retombe sur Signature par champ ; jamais une conversation illisible. |
| Pièce jointe supprimée après choix | le client ne trouve plus l'image ⇒ Signature (sans spinner, sans erreur) ; la préférence reste jusqu'au prochain choix. |
| Retrait d'un pack installé | le fond continue de s'afficher (rendu = possession, § 4.2). |

Aucune migration de données : tous les champs sont optionnels, absents se lisent comme le défaut. Index : `UserPackOwnership` est une collection neuve (index créés par la migration idempotente du dépôt, jamais `prisma db push` en prod/staging).

## 12. Vendeurs tiers (livré côté passerelle, #10709)

- Origine `community` pour `wallpaper`, `banner` et `avatar-ring` : le circuit `PackSubmissions` (proposition → modération → `approved`) s'étend par domaine ; le contenu soumis est un `AppearancePackContract` — des DONNÉES validées par le même Zod (aucun SVG brut, regex de chemins, plafonds), donc sans surface d'injection.
- Prix d'un pack communautaire : la ligne `spend` de l'acheteur porte `meta.sellerId` ; un `transfer_in` vers le vendeur (moins une part plateforme) s'écrit dans la même transaction. Non livré : issue de suivi.
- La possession (`UserPackOwnership`) ne dépend pas de l'origine : rien à migrer le jour venu.
- **Livré (#10709)** : `POST /packs/<domaine>/submissions` (corps JSON, `validateCommunityAppearanceManifest`), `GET /submissions`, `GET /pending` et `POST /:slug/review` (`canModerateContent`) ; table `CommunityAppearancePack` ; le prix est fixé par le MODÉRATEUR à la publication, jamais proposé ; aucune couche `lottie` ni fichier téléversé pour un tiers ; le contrat est servi par `/pack-assets/<sha16>.json` après `approved` seulement ; export et purge RGPD (`PackPrivacy`). **Relecture** : `GET /:slug/contract` rend le contrat (JSON sérialisé + `sha256`) d'un pack en attente à son auteur et aux modérateurs — la modération voit ce qu'elle publie ; un modérateur ne tranche jamais sa propre proposition (403 `APPEARANCE_PACK_SELF_REVIEW`) ; lister, détailler, installer et acheter ne chargent jamais `contractJson`. Index à poser en production par la migration idempotente `2026-10-01-schema-indexes.mongodb.js` (feu vert porteur).

## 13. Sécurité, performance, accessibilité

**Sécurité (dimension 1)**
- Possession vérifiée SERVEUR à chaque écriture qui en dépend (installer un payant, choisir un fond, équiper un contour/une bannière) ; le prix est lu au registre, jamais reçu du client.
- Dépense idempotente (`MeeshSpend`, `(userId, requestId)` unique) et atomique avec la possession.
- `appearance` est per-lecteur : servi par `userPreferences` filtré `where: { userId: viewerId }`, diffusé sur `user:{id}` seulement ; jamais dans un instantané de conversation partagé.
- Mode photo : la pièce doit appartenir à la conversation, ne pas être protégée (vue unique, floutée, éphémère) ; l'image se lit par la route de téléchargement EXISTANTE, qui vérifie l'appartenance à chaque lecture — un ancien membre ne la voit plus (retour à Signature). En E2EE, le serveur ne voit que l'identifiant.
- Données vectorielles : regex et plafonds de longueur sur chaque chemin ; les clients construisent le dessin depuis les champs, n'interprètent aucun balisage reçu.
- Couvertures et contrats servis par `/pack-assets` (liste blanche par empreinte existante) ; aucune nouvelle extension (`webp`, `json` suffisent).

**Performance et fluidité (2, 3, 4)**
- Cache-first : `appearance` voyage avec la liste des conversations (déjà en cache sur les deux plateformes) ; les modèles `builtin` sont embarqués ⇒ le PREMIER rendu du fil a déjà son fond, sans réseau ni spinner. Un modèle `official` non encore en cache : Signature, puis fondu de 180 ms quand le contrat (adressé par contenu, immuable) arrive. Photo : Signature, puis vignette, puis pleine définition.
- Zéro re-rendu inutile : le fond est une couche isolée (`contain: strict` web, vue `Equatable` iOS) qui ne dépend que de `(appearance, scheme, accent)` ; la frappe et le défilement ne la touchent pas. Tuile rendue une fois et répétée par le moteur graphique.
- Mémoire : caches bornés (32 tuiles web, `NSCache` iOS avec `countLimit`), `blob:` révoqués au démontage, aucune image pleine définition gardée hors de l'écran.
- Optimiste : chaque choix s'applique au toucher, le réseau confirme, un refus rétablit.

**Accessibilité (5)**
- Sélecteurs : `radiogroup` / `.accessibilityElement` avec nom localisé de chaque modèle et couleur, état « sélectionné », cibles ≥ 44 pt, navigation clavier (flèches dans le groupe), RTL (illustrations `bottom-end` en miroir).
- Contraste : témoins de la gamme (§ 7) ; opacité plafonnée des motifs ; « Réduire la transparence » ⇒ voile photo ≥ 0,6 ; « Réduire les animations » ⇒ aucune couche Lottie.
- Dynamic Type : les libellés du sélecteur s'adaptent ; l'aperçu reste une image décorative (`aria-hidden`, `accessibilityHidden`).

**Compatibilité (9)** : iOS 16→26 (aucune API > iOS 16 sans garde de disponibilité ; ImageRenderer est iOS 16), web courant, coque Android, clair/sombre, 7 langues (noms des modèles, packs, couleurs, libellés).

## 14. Tests (témoins de comportement)

| Lot | Témoins |
|---|---|
| fondation shared | `parseConversationAppearance` refuse chaque forme invalide (kind inconnu, veil > 0,8, accent hors gamme) ; `readConversationAppearance` garde l'accent quand le fond est illisible ; `resolveAppearanceAccent` = palette calculée sans accent, dérivée ±30° avec ; `isPackOwned` ; `canUseFrame` sur `frame-usage-avatar-vectors.json` (un cadre d'appel ne sert pas l'avatar, un contour ne sert pas l'appel) ; `PackIndexEntrySchema` refuse un `price` sur un builtin, un `avatar-ring` sans usage `avatar` ; les 14 modèles se parsent, ont des clés uniques et respectent le plafond d'opacité ; `designToSvg` est stable (instantané textuel) et ne contient que des éléments attendus ; la gamme tient ses contrastes |
| fondation gateway | achat : débit unique sous rejeu, 409 solde insuffisant sans effet, possession + installation dans la même transaction, prix lu au registre ; installer un payant non possédé = 403 ; `/packs/shop` agrège et ignore un domaine inconnu ; `PUT appearance` : design non possédé 403, photo d'une autre conversation 404, photo vue unique 404, membre non participant refusé, version incrémentée + diffusion `user:{id}` seulement ; `GET /conversations` sert `appearance` au lecteur et à lui seul ; `PUT /me/profile-decor` : contour possédé OK, item d'un autre domaine refusé ; profil public sert `profileDecor` ; réponses figées des stickers INCHANGÉES |
| web | le fond suit le choix sans réseau (builtin) ; Signature par défaut ; refus réseau ⇒ retour arrière + message ; accent personnel visible sur la ligne de liste, l'en-tête, la bulle envoyée et le composeur (lecture de `--accent`) ; événement `user:preferences-updated` d'un autre appareil appliqué ; vitrine filtrée par `domaine=` ; achat optimiste avec retour arrière sur 409 ; un domaine 404 = vitrine vide ; contour rendu sur le profil d'un autre |
| iOS | décodage tolérant (`unknown`) ; `displayPalette` = calculée sans accent ; `AppearanceDesignView` rend la même tuile pour la même clé (cache) ; sélecteur optimiste + retour arrière ; SDK : copie du catalogue identique à la source |

## 15. Découpage en lots

Zones DISJOINTES ; la fondation est séquentielle et précède tout ; les lots web sont parallèles entre eux ; les lots iOS s'exécutent l'un après l'autre. Chaque lot pousse sur `dev` (fusion sous verrou), TDD, gates légers locaux, la CI fait foi.

| Lot | Plateforme | Issue | Zone principale |
|---|---|---|---|
| F1 `apparence-socle-partage` | gateway (shared) | #10632 | `packages/shared/types/{content-pack,content-pack-index,frame-usage,appearance-design,avatar-ring-design,conversation-appearance,profile-decor}.ts`, `packages/shared/types/socketio-events/{preferences,pack,event-names}.ts` (+ profil), `packages/shared/utils/{appearance-svg,conversation-colors}.ts`, `packages/shared/design/appearance/**`, `packages/shared/design/packs/frame-usage-avatar-vectors.json`, `schema.prisma` (3 changements), tests shared |
| F2 `apparence-passerelle` | gateway | #10632 | `services/gateway/src/services/packs/**`, `services/gateway/src/services/game/MeeshSpend.ts`, `services/gateway/src/services/appearance/**` (neuf), `services/gateway/src/routes/{pack-routes,packs-appearance,packs-shop,conversation-preferences}.ts`, `services/gateway/src/services/conversationPreferencesSync.ts`, `routes/conversations/core-selects.ts`, `packages/shared/types/api-schemas/conversation.ts`, `routes/me/profile-decor.ts` (neuf) + montage, `routes/users/public-profile.ts`, `routes/me/get-me.ts`, `services/gateway/scripts/generate-appearance-packs.ts` (neuf) + `assets/packs/*` générés + `packages/shared/design/appearance/*/packs.json` |
| W1 `web-fond-et-accent` | web | #10631 | fond, sélecteur, photo, accent partout, synchro socket |
| W2 `web-vitrine-unique` | web | #10632 | vitrine filtrable, prix, achat, possession |
| W3 `web-contours-bannieres` | web | #10632 | contours d'avatar, bannières, sélecteur de profil |
| I1 `ios-fond` | ios | #10631 | modèles SDK, peintre, fond, sélecteur, synchro |
| I2 `ios-accent-personnel` | ios | #10631 | `displayPalette` partout |
| I3 `ios-vitrine-unique` | ios | #10632 | vitrine, prix, achat, `PackDomain` tolérant |
| I4 `ios-contours-bannieres` | ios | #10632 | contours, bannières, miroir `avatar` de la loi des cadres |

Le détail (chemins exacts, critère de fin) est porté par chaque lot à son lancement et par son issue. **Fichiers en cours d'édition par d'autres sessions au 2026-10-14** (`apps/web/src/routes/thread.tsx`, `apps/web/src/main.tsx`, `apps/web/src/lib/shell-widgets/**`) : un lot qui doit y toucher attend que `git diff -- <fichier>` soit vide et ne commite que SES lignes ; `thread.tsx` (1 000 lignes) ne reçoit qu'un ÉCHANGE d'une ligne (`<div className="thread-backdrop" />` → `<ConversationBackdrop … />`), jamais un ajout.

## 16. Suivis (issues à ouvrir à la clôture, jamais une ligne ici)

- Couche Lottie des fonds, bannières et contours : brancher le moteur de #10630 dès qu'il est sur `dev`, et publier un pack animé.
- Contours visibles sur les avatars HORS profil (auteurs, participants, liste) : servir `profileDecor` dans les projections publiques d'utilisateur.
- Vendeurs tiers (`community`) pour les trois domaines + partage de recette en Meeshes.
- Miroir Kotlin : rien (gel Android natif, directive 2026-09-16) — consigné, non soldé.
