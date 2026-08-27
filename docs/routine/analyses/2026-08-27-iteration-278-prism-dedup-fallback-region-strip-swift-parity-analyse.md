# Itération 278 — Le REPLI de la clé de dedup strippe enfin la région sur iOS (parité des 3 miroirs)

## État actuel

La résolution du Prisme sur l'aperçu de dernier message compare TROIS jeux de
jetons de langue — langues du lecteur, langue d'origine, clés de la carte de
traductions — après les avoir canonicalisés par un couple
`normalize + repli`, chacun nommé source de vérité par `CLAUDE.md` :

| plateforme | fonction de dedup | repli quand `normalize` rend rien |
|---|---|---|
| TypeScript (SSOT) | `normalizeLanguageForDedup` (`language-normalize.ts`) | **sous-tag primaire** lowercased (`code.split(/[-_]/)[0]`) |
| Kotlin (Android) | `LanguageCodeNormalizer.normalizeForDedup` | **sous-tag primaire** lowercased (`split('-','_').firstOrNull()`) |
| Swift (iOS/SDK) | *aucune — inline* `MeeshyUser.normalizeLanguageCode($0) ?? $0.lowercased()` | **chaîne ENTIÈRE** lowercased |

## Problèmes identifiés

Le résolveur iOS `MeeshyConversation.resolvedLastMessagePreview` (`CoreModels.swift`)
ne disposait d'AUCUN miroir de `normalizeLanguageForDedup` : il canonicalisait
en ligne par `MeeshyUser.normalizeLanguageCode($0) ?? $0.lowercased()`. Le repli
`?? $0.lowercased()` conserve la chaîne ENTIÈRE quand `normalizeLanguageCode`
rejette un code (irréductible), là où TS et Kotlin retombent sur le **sous-tag
primaire** (région strippée).

Pour un code HORS CATALOGUE tagué région — `yue-HK` (Cantonais, absent du
catalogue Meeshy) — les trois miroirs divergeaient :

- TS / Kotlin : `yue-HK` → `yue` (région strippée) ⇒ matche un lecteur `yue`.
- iOS : `yue-HK` → `yue-hk` (chaîne entière) ⇒ **ne matche pas** `yue`.

C'était le suivi explicitement laissé « à instruire en issue » par le plan de
l'itération 277 (« Divergence de REPLI sur les codes IRRÉDUCTIBLES tagués
région »).

De plus, Swift portait QUATRE réimplémentations du même repli, dont une
DIVERGENTE : `resolvedLastMessagePreview` (buggée, chaîne entière),
`StoryPrismeMatch.base` (correcte, sous-tag), `normalisedWritingLanguage` et
`normalisedCode` (correctes, sous-tag). Des « jumelles » que le Prisme interdit
(une règle, un site) — et dont une avait déjà dérivé.

## Causes racines

`normalizeLanguageCode` (les trois plateformes) rejette un code qu'il ne sait
pas réduire ; le repli du couple de dedup existe précisément pour ces codes.
TS/Kotlin l'ont extrait en fonction dédiée qui strippe la région ; Swift ne
l'avait jamais fait — chaque site le ré-inlinait à la main, et le site du
résolveur d'aperçu a ré-inliné une variante `.lowercased()` verbatim au lieu du
strip de sous-tag, sans témoin pour l'attraper (les vecteurs cross-plateforme
n'exerçaient que des codes CATALOGUÉS ou RÉDUCTIBLES — jamais un irréductible
tagué région, seul cas où le repli est atteint ET où le strip compte).

## Impact métier

L'égalité de la ligne de liste entre web/iOS/Android est une garantie produit :
un même compte lit le MÊME texte sur les trois apps. Pour un message dont la
clé de traduction, la langue de lecteur ou la langue d'origine arrive sous une
forme hors catalogue taguée région (langue régionale non encore cataloguée, ou
ligne héritée à `originalLanguage` région-tagué), iOS servait l'aperçu ORIGINAL
là où web/Android servaient la traduction — divergence silencieuse, classe
exacte du bug Android du cycle 118.

## Impact technique

- iOS : `resolvedLastMessagePreview` route désormais par le SSOT
  `MeeshyUser.normalizeLanguageForDedup` (public, ajouté). Trois autres sites
  Swift (`StoryPrismeMatch.base`, `normalisedWritingLanguage`, `normalisedCode`)
  délèguent au même SSOT — quatre jumelles réduites à une.
- Aucune ligne de production TS/Kotlin touchée : le contrat de vecteurs partagé
  (`prism-preview.vectors.json`) gagne 3 cas (30 → 33) exerçant le repli
  région-strippé, déjà VERTS sur TS et Android (leurs replis strippent la
  région), désormais VERTS sur iOS après le correctif.

## Évaluation du risque

- **Correctif iOS** : FAIBLE. Le nouveau `normalizeLanguageForDedup` reproduit
  fidèlement l'idiome déjà compilé (`StoryPrismeMatch.base`) et TS/Kotlin ;
  sur tous les codes RÉALISTES (catalogués, réductibles, tagués région
  catalogués) il est idempotent avec l'ancien inline. Seul change le cas
  irréductible-tagué-région (`yue-HK`), précisément le défaut corrigé.
- **Contrat de vecteurs** : NUL sur la production. 3 cas ajoutés, valeur
  attendue confirmée EMPIRIQUEMENT contre le SSOT TS (33/33 verts) et par
  contre-épreuve (voir critères).
- Non validable localement (pas de toolchain Swift/Xcode ni Gradle dans le
  conteneur) : la CI iOS + Android est le gate autoritatif. Revue de source
  adverse effectuée sur chaque edit Swift.

## Améliorations proposées

1. Ajouter `MeeshyUser.normalizeLanguageForDedup(_:)` (public) — miroir fidèle
   de `normalizeLanguageForDedup` (TS) / `normalizeForDedup` (Kotlin).
2. Router `resolvedLastMessagePreview` (le site buggé) par ce SSOT.
3. Unifier les trois autres réimplémentations Swift (`StoryPrismeMatch.base`,
   `normalisedWritingLanguage`, `normalisedCode`) sur le même SSOT.
4. Ajouter 3 vecteurs cross-plateforme (`yue-HK` en CLÉ / LECTEUR / ORIGINE)
   exerçant le repli région-strippé.
5. Tests SDK dédiés + mise à jour des compteurs de vecteurs (iOS 30→33,
   Android 22→33 — ce dernier soldant aussi le compteur périmé de `main`).

## Bénéfices attendus

- La divergence iOS de l'itération 277 est fermée : les trois miroirs servent
  la MÊME ligne pour un code hors catalogue tagué région.
- Le repli de dedup a UN site par plateforme ; toute future dérive d'un client
  (repliage sans strip, strip appliqué à un jeu de jetons mais pas aux autres)
  fait rougir le contrat de vecteurs OU la suite SDK.
- Quatre jumelles Swift réduites à une (dimension 11, maintenabilité).

## Complexité d'implémentation

Faible : +1 fonction Swift, 4 sites délégués, +3 vecteurs JSON, +1 section de
tests SDK, 2 compteurs ajustés.

## Critères de validation

- 33/33 vecteurs TS verts ; suite `packages/shared` complète verte (113
  fichiers / 2702 tests). ✅ MESURÉ.
- Contre-épreuve (PROUVÉE) : sous le repli buggé (`normalizeLanguageCode(x) ??
  x.toLowerCase()`, chaîne entière) rejoué en TS, les 3 nouveaux vecteurs
  rendent `"Hello"` au lieu de `"你哋好"` — le défaut exact, attrapé. ✅ MESURÉ.
- CI iOS + Android autoritatives sur les cibles Swift/Kotlin (non compilables
  dans ce conteneur).

## Suivi / améliorations futures

- **Divergence `normalizeLanguageCode` sur le sous-tag primaire VIDE** (`"-US"`).
  Swift `split(whereSeparator:)` omet par défaut les sous-séquences vides et
  rendrait `"us"` là où TS/Kotlin rendent `undefined`/le sous-tag vide. Cas
  malformé, non atteint par les vecteurs ; à instruire séparément — non encodé
  ici. Le nouveau `normalizeLanguageForDedup` utilise `omittingEmptySubsequences:
  false` pour rester fidèle au repli TS/Kotlin sur ce point.
