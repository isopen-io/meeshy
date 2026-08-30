# `@meeshy/icons` — le sprite Phosphor de la v3 web

**UNE** table de glyphes pour `apps/web-v3`. Deux actifs commités, un générateur,
aucun téléchargement au build et aucun `fetch` à l'exécution.

| Fichier | Ce que c'est |
|---|---|
| `sprite.svg` | les **72** `<symbol>` que la v3 réclame — 71 glyphes nus plus le couple `ph-fill ph-play`. Servi **externe**, même origine, **dans la zone** — donc émis par le pipeline webpack (`/__v3/_next/static/media/sprite.<hash>.svg`), **jamais** depuis `public/` (conception § 4.4 et § 8.5) |
| `critical.svg` | le sous-sprite **critique** — les glyphes rendus au-dessus de la ligne de flottaison, **inliné** dans `app/layout.tsx`. Sa composition est déclarée dans `critique.json`, glyphe par glyphe, avec sa raison |
| `critique.json` | la liste critique et **pourquoi** chaque glyphe y est. Elle se révise à la première capture réelle, pas par intuition. **Exportée** (`@meeshy/icons/critique.json`) : le layout de L0 en **dérive** les huit noms qu'il inline, il ne les recopie pas |
| `scripts/build-sprite.ts` | le seul producteur des deux actifs, et le seul lecteur des tracés source |

## Rejouer

```bash
bun install --ignore-scripts                       # @phosphor-icons/core@2.1.1
node packages/icons/scripts/build-sprite.ts        # régénère les deux actifs + écrit la mesure
node packages/icons/scripts/build-sprite.ts --verifie   # ne touche à rien ; rc=1 sur défaut
```

`@phosphor-icons/core` est une **devDependency de la RACINE**, pas de ce paquet :
le générateur est un outil de dépôt (conception § 9.3 le lance depuis la racine),
et l'image de la v3 — qui copie `packages/icons/` — n'a aucune raison d'embarquer
1 512 SVG source. `racineDesTraces()` regarde d'abord l'arbre local : le jour où
le paquet redescend ici, rien à changer.

La génération écrit la mesure dans `apps/web-v3/budgets-mesures.json` →
`sprite_phosphor`. **Le poids ne s'écrit pas à la main** : c'est le script qui le
pose, et le témoin `apps/web-v3/__tests__/sprite.test.ts` recompare les octets du
fichier commité à ceux du fichier de mesures.

## Les plafonds

Ils vivent dans `apps/web-v3/budgets.json` → `actifs.plafonds`, avec le paragraphe
de la conception qui les porte. Ce README ne les redéclare pas.

## Les cinq défauts gardés

1. **manquant** — une classe `ph-*` réclamée sans son `<symbol>` : le `<use>` ne
   rend rien et **rien ne rougit**. C'est la panne muette du § 8.5, et le gate
   anti-panne que l'issue #4442 attend. `glyphesReferences()` en est le site
   unique — un consommateur qui réécrit la regex fabrique la jumelle.
2. **orphelin** — un `<symbol>` que personne ne réclame : des octets servis à
   chaque lecteur du rôle premier pour un glyphe que rien n'affiche.
3. **dérive** — un actif commité qui n'est plus la sortie du script.
4. **dépassement** — le poids gzip du sprite, et le **nombre** de glyphes du
   sous-sprite critique. Le § 8.5 ne donne aucun POIDS au sous-sprite : on ne
   lui en invente pas un, on borne ce qui est écrit et on **mesure** le reste.
5. **hors critique** — une référence **locale** (`<use href="#ph-x">`) à un
   glyphe absent de `critical.svg`. La livraison à DEUX fichiers crée ce
   clivage : un fragment sans hôte ne résout que dans le document courant, donc
   dans le seul sous-sprite inliné. Le symbole existe bien — dans `sprite.svg` —
   et c'est exactement ce qui rend le défaut n° 1 aveugle à ce cas. Même panne
   muette, une couche plus bas.

## Ce qui RÉCLAME, et ce que la mesure vaut encore

`sourcesQuiReclament()` rend la **planche** *et* l'arbre de sources de la v3
(`app/`, `components/`, `lib/`). Les deux, jamais l'une : la planche seule
laisserait le gate du § 8.5 **vide** quoi qu'écrive la v3, et obligerait à
éditer une maquette de **design** pour débloquer un actif de **production** dès
qu'un écran réclame un glyphe de plus.

> **Ce qui n'est PAS encore gardé.** Le défaut *orphelin* est mesuré contre
> l'UNION — donc, tant que la v3 est vide, contre la planche. Quand la v3
> n'utilisera réellement que ~20 des 72 symboles, les 52 autres seront toujours
> servis à chaque lecteur du rôle premier et l'audit les déclarera légitimes. Ça
> se solde en retirant la planche de `sourcesQuiReclament()` une fois les 44
> lignes de la matrice livrées — **issue #4469**, pas une ligne de ce README.

Un nom réclamé sans tracé Phosphor (faute de frappe dans du vrai code) est
écarté par `tracesExistantes()` et retombe en **manquant** : un défaut nommé, pas
un `ENOENT` sur une pile d'appels.

## La graisse `ph-fill` n'est pas du bruit

La planche écrit `class="ph-fill ph-play"` sur les **quatre** surfaces du bouton
LECTURE (cercle de reel 68 px, lecteur audio 44 px, story 56 px, bulle vocale
38 px). Le couple graisse+glyphe se **résout** en `<symbol id="ph-fill-play">`,
tracé pris dans `assets/fill/play-fill.svg` ; `ph-play` nu n'étant réclamé nulle
part, le triangle **creux** n'est pas servi du tout. Servir le creux à sa place
mettrait un triangle évidé au centre d'un disque plein — un écart de
**disposition**, hors de l'écart typographique que la v3 assume.

## Pourquoi un sprite, et pas la fonte

`@phosphor-icons/web` pèse **224 Ko** pour une seule graisse (mesuré : 144 Ko
woff2 + 80 Ko css) et bloque le premier pixel. La v3 interdit son import, comme
celui de `lucide-react` : `apps/web-v3/eslint.config.mjs`, témoin
`apps/web-v3/__tests__/zone-lint.test.ts`.

## Où vit le témoin, et pourquoi pas ici

`apps/web-v3/__tests__/sprite.test.ts`. `packages/` n'a aucun harnais de test et
n'entre dans aucune ligne de la matrice `test` de `ci.yml` ; `apps/web-v3` y
entre nommément. C'est le précédent de `check-jetons.mjs`, qui garde le contenu
de `packages/design-tokens` depuis `apps/web-v3`, et l'inverse de l'erreur
corrigée par `scripts/check-lockfile-alignment.mjs` — **un garde hébergé ailleurs
que là où il tourne ne garde rien**.

## D'où viennent les tracés

`@phosphor-icons/core@2.1.1`, `assets/<graisse>/<nom>.svg` (`cheminDuGlyphe()`).
Le nom de fichier est la classe **sans** le préfixe `ph-` ; l'identifiant du
`<symbol>` est la classe **entière**, pour que `<use href="…#ph-house">` et
`class="ph ph-house"` nomment la même chose. Un glyphe graissé compose les deux
classes (`ph-fill ph-play` → `ph-fill-play` → `assets/fill/play-fill.svg`) : la
collision est impossible, aucun nom d'`assets/regular/` ne commence par `fill-`.

Rien de `@phosphor-icons/core` n'est expédié au navigateur : seuls les deux SVG
commités le sont. Et rien ne l'y expédiera par accident — le paquet est une
devDependency de la **racine**, donc **résolvable** depuis `apps/web-v3` (là où
`lucide-react`, déclaré nulle part, rend `MODULE_NOT_FOUND`). C'est l'absence de
protection que l'isolation de bun ne donne pas : `@phosphor-icons/core` et
`@phosphor-icons/react` sont donc barrés nommément dans
`apps/web-v3/eslint.config.mjs`, témoin `apps/web-v3/__tests__/zone-lint.test.ts`.
