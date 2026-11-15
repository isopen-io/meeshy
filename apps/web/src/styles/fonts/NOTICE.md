# Les treize polices d'un texte de story — provenance et licences

Ces fichiers sont REDISTRIBUÉS par Meeshy : leur licence l'autorise, et cette
page est la condition de cette autorisation. Ne rien ajouter ici sans y écrire
la même chose.

La table qui les relie aux familles d'iOS, leur poids mesuré et leur cliquet
vivent dans `src/lib/canvas/story-fonts.ts` ; les `@font-face`, dans
`../story-fonts.css`.

## Pourquoi des SUBSTITUTS, et pas les polices d'iOS

`StoryTextStyle.swift` nomme, pour treize de ses dix-huit familles, une police
**embarquée dans l'application iOS** — Zapfino, Snell Roundhand, Papyrus,
Marker Felt, American Typewriter, Bradley Hand, Didot, Futura Condensed,
Avenir Next Condensed, Arial Rounded MT, Chalkboard SE, Noteworthy, Savoye LET.

**Les treize sont propriétaires** (Linotype, Monotype, ITC, Letraset, Apple).
Une application iOS a le droit de les UTILISER, parce qu'elles sont installées
sur l'appareil ; un serveur web n'a le droit de les SERVIR à personne. Ce n'est
pas une question de budget — aucun budget ne l'autoriserait.

Chaque famille reçoit donc, sur le web, un substitut de même CARACTÈRE, publié
sous une licence qui permet la redistribution. Ce n'est pas la police d'iOS :
c'est sa famille. L'auteur qui écrit en `calligraphy` voulait une
calligraphie, et le web en rend une.

## La table

| famille | police iOS (propriétaire) | substitut servi | fichier | licence |
|---|---|---|---|---|
| `handwriting` | SnellRoundhand | Parisienne 400 | `parisienne-latin.woff2` | OFL 1.1 |
| `calligraphy` | Zapfino | Italianno 400 | `italianno-latin.woff2` | OFL 1.1 |
| `cartoon` | ChalkboardSE-Bold | Comic Neue 700 | `comic-neue-700-latin.woff2` | OFL 1.1 |
| `futuristic` | Futura-CondensedExtraBold | Saira Condensed 800 | `saira-condensed-800-latin.woff2` | OFL 1.1 |
| `fantasy` | Papyrus | Metamorphous 400 | `metamorphous-latin.woff2` | OFL 1.1 |
| `curve` | SavoyeLetPlain | Tangerine 400 | `tangerine-latin.woff2` | Apache 2.0 |
| `tag` | MarkerFelt-Wide | Permanent Marker 400 | `permanent-marker-latin.woff2` | Apache 2.0 |
| `retro` | AmericanTypewriter | Cutive 400 | `cutive-latin.woff2` | OFL 1.1 |
| `elegant` | Didot | Prata 400 | `prata-latin.woff2` | OFL 1.1 |
| `poster` | AvenirNextCondensed-Heavy | Anton 400 | `anton-latin.woff2` | OFL 1.1 |
| `bubble` | ArialRoundedMTBold | Fredoka 600 | `fredoka-600-latin.woff2` | OFL 1.1 |
| `note` | Noteworthy-Bold | Patrick Hand 400 | `patrick-hand-latin.woff2` | OFL 1.1 |
| `brush` | BradleyHandITCTT-Bold | Caveat 700 | `caveat-700-latin.woff2` | OFL 1.1 |

## Provenance exacte

Chaque fichier est le sous-ensemble **`latin`** que Google Fonts publie, pris
tel quel — aucun re-sous-ensemblage, aucune réécriture de table. Il se
retrouve, et se vérifie, par l'API CSS :

```
https://fonts.googleapis.com/css2?family=<Famille>[:wght@<graisse>]&display=swap
```

servie avec un `User-Agent` de navigateur récent, puis en suivant l'`url()` du
bloc dont l'`unicode-range` commence par `U+0000-00FF`. Les licences sont
celles que Google Fonts publie pour chaque famille (`OFL.txt` ou `LICENSE.txt`
dans son dépôt).

## Ce que ces licences demandent

**OFL 1.1** — redistribution libre, y compris commerciale, à trois conditions :
ne pas vendre la police seule, conserver l'avis de licence (cette page), et ne
pas réutiliser le nom réservé de la fonte pour une version modifiée. Les
fichiers ici ne sont pas modifiés et ne sont pas vendus.

**Apache 2.0** (Tangerine, Permanent Marker) — redistribution libre, avis de
licence conservé, modifications à signaler. Aucune modification ici.

# Les polices des cadres de gloire — provenance et licences (#10158)

La liste FERMÉE `GLORY_FRAME_FONTS` (`packages/shared/types/glory-frame-format.ts`) :
un pack de cadres RÉFÉRENCE ces familles, il ne les transporte jamais. La table,
les poids mesurés et le choix d'écriture vivent dans
`src/lib/game-photo/glory-fonts.ts` ; les `@font-face`, dans `../glory-fonts.css`.

| famille | graisses servies | fichier | licence | octets |
|---|---|---|---|---|
| Cinzel | 400 à 900 (variable) | `glory-cinzel-latin.woff2` | OFL 1.1 | 25 888 |
| Cinzel Decorative | 700 | `glory-cinzel-decorative-700-latin.woff2` | OFL 1.1 | 15 428 |
| Cinzel Decorative | 900 | `glory-cinzel-decorative-900-latin.woff2` | OFL 1.1 | 14 540 |
| Cormorant Garamond | 300 à 700 (variable) | `glory-cormorant-garamond-latin.woff2` | OFL 1.1 | 37 776 |
| Fraunces | 100 à 900 (variable, axe `wght` seul) | `glory-fraunces-latin.woff2` | OFL 1.1 | 36 560 |
| Manrope | 200 à 800 (variable) | `glory-manrope-latin.woff2` | OFL 1.1 | 24 576 |
| Caveat | 700 | `caveat-700-latin.woff2` (le fichier de `brush`, ci-dessus) | OFL 1.1 | — |

**Provenance** : le sous-ensemble `latin` publié par Google Fonts le 2026-10-12,
pris tel quel (même méthode que ci-dessus), par
`https://fonts.googleapis.com/css2?family=Cinzel:wght@400..900&family=Cinzel+Decorative:wght@700;900&family=Cormorant+Garamond:wght@300..700&family=Fraunces:wght@100..900&family=Manrope:wght@200..800&display=swap`.
Fraunces est demandée sans son axe optique (`opsz`) : 36 560 octets au lieu de
67 388, pour une plaque dont la taille ne varie pas assez pour en tirer parti.

**Le nom réservé.** L'avis de Cinzel Decorative porte « Copyright (c) 2012
Natanael Gama, with Reserved Font Name 'Cinzel' ». Sous l'OFL 1.1, une version
MODIFIÉE ne peut plus porter ce nom. Meeshy ne modifie pas ces fichiers : ni
re-sous-ensemblage, ni conversion, ni réécriture de table — ils sont servis
octet pour octet tels que Google Fonts les distribue (le témoin
`glory-fonts.test.ts` en fige la taille). Cinzel (2020, « The Cinzel Project
Authors »), Cormorant Garamond, Fraunces et Manrope ne déclarent pas de nom
réservé. L'avis `conformite-juridique` demandé par le lot (#10158) reste à
consigner sur l'issue : cette page dit les faits, elle n'est pas un avis.
