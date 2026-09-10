# apps/web-v2 — POC : une application TypeScript unique, web + Android + iOS

> **Statut : PROTOTYPE À ARBITRER.** Rien ici n'est en production, rien ne
> remplace `apps/web-v2`, `apps/android` ni `apps/ios`. Le POC répond à une
> question et à une seule : *peut-on avoir une application unique en TypeScript,
> stylée par Tailwind, qui reprenne l'interface iOS, reste installable en PWA,
> s'empaquette pour les stores — et tienne le coût data d'une zone rurale ?*

## Ce qui a été mesuré

Profil réseau : **Fast 3G** (188 743 bps, 562,5 ms de latence) — le même que
`apps/web-v2/budgets.json`, pour que la comparaison v3/v4 ait un sens.

### Le runtime : Preact contre React, code source identique

| | **Preact** (retenu) | React 19 |
|---|---|---|
| avant le premier pixel | **24,53 Ko** gzip | 74,90 Ko gzip |
| téléchargement seul sur Fast 3G | **1,06 s** | 3,25 s |
| requêtes avant le premier pixel | 6 | 7 |

Le code applicatif est le **même** : `preact/compat` est activé par un alias
Vite (`MEESHY_RUNTIME=react` construit l'autre). L'écart — **50,4 Ko gzip** —
est du runtime seul. Pour référence, le plancher mesuré de Next 15 App Router
sur ce dépôt est de **99,6 Ko / 6 requêtes** pour une page *vide* : la v4 rend
deux écrans complets pour le quart de ce prix.

### Le routeur (#5447)

TanStack Router pesait **25,13 Ko gzip — 49 % de la première peinture**, plus
de trois fois le runtime Preact entier. Ce poids s'est révélé
**incompressible** : retirer toutes ses options rend un chunk au **hash
identique** — on ne paie pas ce qu'on utilise, on paie le moteur.

Il est remplacé par `src/lib/router.tsx`, taillé pour ce que Meeshy demande
(paramètres de chemin typés depuis le motif, paramètres de recherche,
découpage par route, préchargement à l'intention, restauration du défilement) :
**~1,4 Ko gzip**. La première peinture passe de **50,85 à 24,53 Ko** et de
**2,21 s à 1,06 s** sur Fast 3G — soit **−52 %**.

Ce qui est perdu, et qu'il faut savoir : chargeurs de route, états « pending »
de navigation, validation des paramètres de recherche, routes imbriquées
au-delà d'un niveau. Les trois premiers sont couverts par TanStack Query, qui
reste ; le quatrième est une limite réelle, à lever le jour où un écran la
rencontre.

### Les deux variantes

| | **A — PWA seule** | **B — Capacitor 8** |
|---|---|---|
| avant le premier pixel | 24,53 Ko · 6 requêtes | 24,36 Ko · 5 requêtes |
| service worker | oui (Workbox) | non (la coque gère son cycle) |
| **2ᵉ visite** | **0 requête réseau · 0 octet** — vérifié | sans objet (embarqué) |
| ouverture **hors ligne** | **oui**, navigation comprise — vérifié | oui |
| pipeline | `vite build` | `vite build && cap sync` — **86 ms** |

Les deux se construisent depuis **le même `dist/`** ; seul `MEESHY_TARGET`
change (base relative, service worker retiré). C'est la condition pour que
« transformable sans friction » soit une mesure et non une promesse.

Rejouer : `bun run gate`, `node scripts/check-offline.mjs`,
`node scripts/capture.mjs` (captures dans `render/`, non versionnées).

Mesuré au 2026-09-10 (`node scripts/check-offline.mjs` contre `vite preview`) :

| visite | réseau | cache SW |
|---|---|---|
| 1 (froide) | 11 req · 125,3 Ko | 0 req · 0 octet |
| 2 (SW installé) | 0 req · 0 octet | 11 req · 127,8 Ko |
| 3 (hors ligne) | — | fil ouvert, titre « Meeshy Chats » |

Precache PWA (variante A, `dist/`) : **50 entrées, 720,96 KiB** — mesuré par
le même gate, jamais un chiffre du manifest Workbox lu à l'œil.

Les captures figent l'horloge de la page (`page.clock.setFixedTime`) : sans
ça, deux captures du même code diffèrent par leurs horodatages et comparer un
rendu avant/après devient impossible.

Les fixtures sont **ancrées sur maintenant** (`aM(90)` = il y a 90 minutes) et
non sur des dates écrites en dur : une fixture du 6 septembre affichait
« Aujourd'hui » le 6 et « Hier » le 7, donc les captures changeaient de sens
pendant la nuit et un témoin qui cherchait « Aujourd'hui » tombait sans qu'une
ligne de code ait bougé. Ce qui doit être fixe, c'est la **forme** du jeu de
données, pas l'instant où on le regarde.

### Les coques (#5604, #5815) — mesuré au 2026-09-09

Les coques `android/` et `ios/` sont générées, versionnées (D-18) et **SE
CONNECTENT AU STAGING** — sur l'AVD `Meeshy_Poc_Web-v31` et le simulateur
`Meeshy Poc-Web-V31` (54438823-4ADC-4536-88D2-FC441395FA04).

| | Android | iOS |
|---|---|---|
| construction | `assembleDebug` : **19 s** à froid, **1 s** incrémental | `xcodebuild` : **7 s** à froid |
| artefact | `app-debug.apk` : **4 828 917 octets** (≈4,6 Mio) | `App.app` sous `ios/App/Build/Products/Debug-iphonesimulator/` |
| démarrage | liste rendue ; splash `#0b0c14` mesuré au pixel, système en mode clair compris | liste rendue, les deux schémas |
| retour matériel (défaut 3b) | **corrigé** — fil → liste → sortie (`MainActivity.java`, D-18) | sans objet |
| bascule clair/sombre à chaud (défaut 3c) | sans objet (suit `uimode night`, natif) | **corrigé et vérifié** — `simctl ui … appearance dark/light` répercuté SANS relancer l'app |
| safe-area (défaut 3a) | non concerné (la WebView est posée dans les barres système) | **corrigé et MESURÉ** — `scrollHeight` passe de 936 à 874 pour `innerHeight` 874 : le débord de 62 px qui coupait la barre de recherche a disparu (D-18) |
| connexion réelle (#5815) | compte `cible-web-trois` : Lentille avec « Voyage Lisbonne » épinglée et le Salon Rivière — capture `render/shell.android.png` | idem, `render/shell.ios.png` |
| origine de la WebView (CORS) | `https://localhost` (`CapConfig.java:38-39`) | `capacitor://localhost` (`CAPInstanceDescriptor.m:10-11`) |

**Le piège de `cap sync`, à connaître avant toute recette.** `bun run gate`
reconstruit `dist/` en variante **A** (base absolue, service worker) : un
`cap sync` lancé juste après pousserait CE dist dans les coques, qui
n'afficheraient plus rien. Toute recette de coque recommence donc par
`MEESHY_TARGET=capacitor bunx vite build`, puis `bunx cap sync`. Le gate
`check-shell-dist.mjs` construit, lui, dans son propre `dist-capacitor/` et
l'efface derrière lui — il ne touche jamais `dist/`, et n'est donc pas une
protection contre ce piège.

**La commande de construction (#5815).** `scripts/build-shells.mjs` est le
site UNIQUE qui construit une coque de RECETTE contre une passerelle réelle —
il refuse plus qu'il ne construit :

```bash
MEESHY_TARGET=capacitor VITE_API_BASE=https://gate.staging.meeshy.me VITE_DATA_SOURCE=gateway \
  node scripts/build-shells.mjs --target android|ios|both [--no-native]
```

Il REFUSE, avant tout coût (`resolveShellBuildEnv`) : une base d'API RELATIVE
(la coque ne la résout nulle part — `config.ts::resolveBase` retomberait, lui,
sur la production en SILENCE) ; `VITE_DATA_SOURCE` autre que `gateway` (une
coque de recette sur `fixtures` montrerait Amina Diallo, Kwame Mensah et Fatou
Bâ au lieu du compte semé) ; `MEESHY_SHELL_START_PATH` posé (un chemin de
RECETTE, jamais dans une coque livrée) ; le simulateur de RÉFÉRENCE
(`3E761BC1-…`, où vit l'app NATIVE iOS — la coque n'y entre JAMAIS, leçon
554). Il AUDITE, après chaque étape coûteuse : `auditShellBundle` (aucun
marqueur de fixture dans les fichiers embarqués, la base d'API demandée est
bien celle qui a été inlinée) et `auditSyncedShellConfig` (aucune coque
SYNCHRONISÉE ne porte `server.appStartPath` — fuite mesurée le 2026-09-09 sur
`android/app/src/main/assets/capacitor.config.json`, reste d'une recette de
lien profond antérieure).

**Pourquoi la passerelle laisse entrer ces deux origines.** Une WebView
Capacitor envoie un en-tête `Origin`, contrairement à une app native — les
deux origines VIRTUELLES ci-dessus sont déclarées dans `CORS_ORIGINS` /
`ALLOWED_ORIGINS` du staging (`infrastructure/docker/compose/docker-compose.staging.yml`),
gardées par `services/gateway/src/__tests__/unit/config/cors-origins.test.ts`
et portées sur l'hôte à la main (patch chirurgical `sed` sur les deux lignes,
jamais `deploy-staging.sh`). La production n'ouvre rien tant que l'APK n'est
pas livré aux utilisateurs (#5651 reste ouverte pour cette étape).

**Le chemin CI (`docker.yml` job `deploy-staging`) ne recopie JAMAIS ce
fichier sur l'hôte** — il ne fait que `pull` + `up -d --no-deps` depuis le
compose déjà présent là-bas ; seul `infrastructure/scripts/deploy-staging.sh`
(non appelé par la CI) synchronise le fichier du dépôt. Une future
modification de `CORS_ORIGINS`/`ALLOWED_ORIGINS` dans le dépôt passerait donc
tous les gates (ils gardent le DÉPÔT, `cors-origins.test.ts`) sans jamais
atteindre l'hôte — dérive silencieuse. Suivi ouvert : #5877 (choisir entre
recopier le compose en CI, ou une vérification de recette datée). En
attendant, vérifier après tout déploiement de staging touchant le gateway :

```bash
for O in https://localhost capacitor://localhost https://etranger.example https://staging.meeshy.me; do
  printf '%s → ' "$O"
  curl -s -D - -o /dev/null -X OPTIONS -H "Origin: $O" \
    -H 'Access-Control-Request-Method: POST' \
    https://gate.staging.meeshy.me/api/v1/auth/login | grep -i '^access-control-allow-origin' || echo 'refusé'
done
```
Les deux origines de coque doivent revenir dans `access-control-allow-origin`,
`https://etranger.example` doit être « refusé ».

**Le temps de démarrage à froid CHRONOMÉTRÉ sur un appareil réel d'entrée de
gamme, et la fluidité de défilement réelle qui va avec, restent « à mesurer »**
— aucun appareil physique n'est disponible ici ; c'est le seul point que cette
passe n'a pas pu clore.

### Le lien profond dans une coque (#5812) — `MEESHY_SHELL_START_PATH`

La coque et le web partagent la MÊME base : la racine (`base: '/'`,
`vite.config.ts`). Un chargement DIRECT de `/c/<id>` (lien profond,
restauration, App Link) résout donc ses actifs contre l'ORIGINE — html5mode
Android sert déjà `index.html` pour tout chemin sans extension, le routeur iOS
aussi, inconditionnellement. `scripts/check-shell-dist.mjs` (dans
`bun run gate`) le prouve avec un navigateur réel sur le dist capacitor, et
REFUSE deux formes : des actifs relatifs (`./assets/…`, le défaut d'origine)
et une balise `<base>` (le premier correctif, retiré en revue — elle réparait
les actifs et cassait toutes les URL réduites à un fragment : depuis
`/c/<id>`, le lien d'évitement `<a href="#contenu">` quittait le fil).
Détail : `decisions.md` § D-27.

Pour PROUVER la même chose sur un appareil/simulateur réel sans attendre
l'entrée système (Universal Links / App Links, issue compagnon séparée),
`capacitor.config.ts` lit `MEESHY_SHELL_START_PATH` — un paramètre de
RECETTE, jamais posé au déploiement — et le porte sur `server.appStartPath`
(Capacitor ≥ 7.3) : la coque synchronisée démarre alors directement sur ce
chemin. Recette :

```bash
MEESHY_TARGET=capacitor bunx vite build && bunx cap sync
MEESHY_SHELL_START_PATH=/c/c-deploiement MEESHY_SHELL_SYNC_TARGET=android bunx cap sync android
```

`resolveCapacitorConfig` refuse (lève) deux FORMES, chacune tirée d'une
source lue : une valeur sans `/` initial (Android, `Bridge.java`, concatène le
chemin SANS séparateur — elle fusionnerait avec l'hôte) et une valeur qui
porte une extension de fichier (iOS ne réécrit vers `index.html` que les
chemins SANS extension, `CapacitorRouter.route(for:)` — elle serait servie
littéralement, donc 404). Une TROISIÈME garde (revue #5774) exige
`MEESHY_SHELL_SYNC_TARGET` (`"android"` ou `"ios"`) dès que
`MEESHY_SHELL_START_PATH` est posé — la plateforme visée se DÉCLARE,
jamais déduite d'un fichier voisin (`ios/App/App.xcodeproj` existant ou non) :
une version antérieure sondait le disque et bloquait `cap sync android` dès
que le dossier `ios/` existait, quelle que soit la plateforme réellement
synchronisée. `MEESHY_SHELL_SYNC_TARGET=ios` lève TOUJOURS (§ ci-dessous) ;
`MEESHY_SHELL_SYNC_TARGET=android` est TOUJOURS accepté. Les gardes portent
sur la forme et la cible, jamais sur une route : les surfaces à venir
emploieront la même recette sans modifier ce fichier livré. Voir
`capacitor.config.test.ts`, `scripts/check-capacitor-config.mjs` (le VRAI
chargeur CJS de la CLI, `bunx cap ls`) et `scripts/shell-deeplink-probe.mjs`
(CDP BRUT sur la cible `page` de la WebView — `connectOverCDP` de Playwright
échoue contre une WebView, qui n'expose aucun navigateur complet).

**Asymétrie mesurée entre les deux coques (#5812).** Sur Android, la recette
ci-dessus suffit seule. **Sur iOS, `appStartPath` seul CRASHE la coque**
(`⚡️ ERROR: Unable to load …/App.app/public//c/c-deploiement`, arrêt propre,
`exit(1)`, aucun rapport dans `CrashReporter`) : `CAPBridgeViewController.loadWebView()`
(`@capacitor/ios` 8.5.1) exige qu'un FICHIER LITTÉRAL existe à ce chemin
sous `public/` avant même de charger l'URL — une garde qui précède
`Router.swift` (son repli SPA ne s'applique qu'aux navigations qui suivent
CE premier chargement, jamais à lui). Pour la recette iOS, poser un
placeholder AVANT de construire dans Xcode (jamais commité — `public/` est
exclu par `ios/.gitignore` généré et réécrit à chaque `cap sync`) :

```bash
mkdir -p ios/App/App/public/c && : > ios/App/App/public/c/c-deploiement
xcodebuild -project ios/App/App.xcodeproj -scheme App -destination 'id=<udid>' build
```

`Router.swift` réécrit ensuite ce chemin vers `/index.html` sans jamais LIRE
le placeholder — sa présence suffit à passer la garde. Détail :
`decisions.md` § D-27 « Complément 2026-09-09 ».

### Les paramètres de construction (`VITE_*`)

Trois variables lues UNIQUEMENT par `src/lib/api/config.ts`
(`resolveApiConfig`), jamais relues ailleurs — personne d'autre n'importe
`import.meta.env` dans ce dépôt :

| Variable | Valeurs | Défaut | Effet |
|---|---|---|---|
| `VITE_API_BASE` | une origine absolue (`https://…`) | production (`https://gate.meeshy.me`), ou base relative en dehors d'une coque | la base des requêtes API |
| `VITE_DATA_SOURCE` | `gateway` | `fixtures` | source des données servies aux écrans — la liste et le fil LISENT la passerelle (`lib/api/query.ts`, #5650) ; `bun test` et tous les gates restent sur `fixtures` |
| `VITE_READING_MODES` | `on`, `off` | `on` | les MODES DE LECTURE du fil (D-20) : `on` ⇒ le fil s'ouvre en Focal, l'utilisateur choisit Script ou Bulles par la puce ; `off` ⇒ le fil s'ouvre en bulles, sans puce (`bubbles`/`flag-disabled`, prioritaire sur tout choix collant — `resolveOrchestratorDecision`, `packages/shared/utils/reading-modes.ts`). Paramètre de CONSTRUCTION, figé au déploiement — la v3.1 n'a ni toggle utilisateur ni programme bêta, contrairement à iOS ; miroir de `MEESHY_FLAG_READING_MODES` (`LentilleFeatureFlag.swift:82-90`). La liste Lentille n'en dépend pas (D-9) |

`VITE_READING_MODES` ET `VITE_DATA_SOURCE` sont gardées à la CONSTRUCTION
(`vite.config.ts`) : une valeur ni admise ni absente fait échouer
`vite build` plutôt que de laisser passer une faute de frappe en silence.
Depuis #5650, `gateway` est une valeur ADMISE (elle est câblée aux écrans) —
mais une valeur inconnue reste refusée, parce que `resolveSource` la
traiterait comme `fixtures` : `VITE_DATA_SOURCE=gatway` construirait, en
silence, un déploiement de production servant des fixtures.
`scripts/check-gateway-build.mjs` (dans `bun run gate`) vérifie la
construction `gateway` dans un navigateur réel : garde de session, squelette
sans saut de géométrie, corpus vide sans bande morte, échec annoncé comme
une alerte.

### La source `gateway` — poids et délai réels mesurés (#5650)

| | `fixtures` | `gateway` |
|---|---|---|
| avant le premier pixel | 24,53 Ko gzip | **34,87 Ko gzip** — cache TanStack persisté (`dehydrate`/`hydrate`) + garde de session |
| présence de données de fixture dans le bundle | — | **aucune, dans AUCUN fichier** — tenu par un gate (`check-gateway-build.mjs`), plus par un `grep` à la main |

**Ce que la mesure d'hier ne voyait pas, et comment c'est fermé (revue
#5815).** La ligne ci-dessus disait « aucune » sur la foi d'un `grep` de
`dist/assets/{index,core}-*.js` : les fixtures ne vivaient pas là. Elles
vivaient dans `use-reader-*.js`, le morceau que la liste ET le fil chargent —
`conversations.ts`, `messages.ts`, `reactions.ts`, `viewer.ts` et
`routes/thread.tsx` importent `src/lib/api/fixtures*.ts` STATIQUEMENT et ne
gardent que l'APPEL (`if (source === 'fixtures')`, une valeur d'EXÉCUTION) :
aucun bundler ne peut élaguer un module dont un export reste référencé.
Deux leviers, tous deux des LITTÉRAUX de construction :

- `__FIXTURES__` (`vite.config.ts` § `define`, `false` sous
  `VITE_DATA_SOURCE=gateway`) rend les branches MORTES à la construction —
  `__FIXTURES__ && source === 'fixtures'` rend exactement ce que rendait
  `source === 'fixtures'`, `apiConfig.source` reste la source de vérité du
  comportement ;
- la règle d'élagage (`build.rollupOptions.treeshake.moduleSideEffects`)
  DÉCLARE les six `fixtures*.ts` sans effet de bord, sans quoi le bundler
  garde des modules dont les exports ne servent plus (ils bâtissent leurs
  données par des `.map(…)` au niveau module).

Mesuré, variante B `gateway` : `use-reader-*.js` passe de **46,53 à 26,21 Ko**
(**16,53 → 10,03 Ko gzip**), et le à-la-demande du dist `gateway` tombe à
**109,06 Ko** contre 115,33 Ko en `fixtures`. La première peinture ne bouge
pas (35,79 Ko : les fixtures n'y étaient pas). Le gate qui le TIENT est
`check-gateway-build.mjs`, qui balaie TOUT le dist — jamais un motif de nom :
un morceau neuf s'appellerait autrement, et c'est lui qu'il faut attraper.

Le délai de garde (`http.ts::DEFAULT_TIMEOUT_MS`) a été mesuré, pas deviné,
contre `gate.staging.meeshy.me` (compte de recette, 5 tirs) : `GET
/conversations` p95 **1,52 s** (pire cas 1,86 s), `GET /conversations/:id`
**0,30 s**, `GET …/messages?limit=50` **0,66 s**. Règle retenue : `p95 × 3 <
15 000 ms` ⇒ le timeout de 15 s garde 5,6 s de marge sur le pire cas observé.

Rejouer : `VITE_DATA_SOURCE=gateway bun run build && node
scripts/check-gateway-build.mjs` pour le poids et la garde de session ; le
délai se rejoue à la main (`curl -w '%{time_total}'`) contre un compte de
recette staging — aucun gate n'y dépend, voir `decisions.md` § D-26.

**Poids par morceau, mesuré au 2026-09-10** (`dist-gateway/`, construction
`gateway` réelle, après D-33/D-34) :

| morceau | brut | gzip |
|---|---|---|
| `index-*.js` | 17,35 Ko | 6,85 Ko |
| `core-*.js` | 60,47 Ko | 19,65 Ko |
| `use-reader-*.js` | 37,67 Ko | 13,97 Ko |
| `conversations-*.js` | 32,78 Ko | 12,00 Ko |
| `thread-*.js` | 108,44 Ko | 34,87 Ko |

`thread-*.js` porte tout le lot chrome (D-33) et badges/corps de message
(D-34) — sa croissance depuis la mesure `#5650` ci-dessus est attendue et
reste dans le chunk du fil, jamais dans `core`/`index` (vérifié par `grep`
des marqueurs `data-elected`/`data-identity`/`badges-of` dans chaque morceau).

## L'interface

Reprise de l'app iOS, relevée dans `apps/ios` et `packages/MeeshySDK` — pas des
maquettes web. Ce qui en découle et qu'on rate en regardant vite :

- **Aucune barre d'onglets, aucune barre de navigation** : l'app iOS pose
  `.navigationBarHidden(true)` partout, chaque écran dessine son en-tête
  flottant. La coquille de la v4 est donc volontairement mince.
- **Bulle à rayon uniforme 18 px** : ni queue, ni coin asymétrique, ni ombre,
  ni dégradé — les ombres ont été retirées côté iOS pour la fluidité du
  défilement, les reposer coûterait des passes hors-écran sur l'appareil visé.
- **La bulle envoyée est l'indigo de marque**, la même dans toutes les
  conversations. La bulle **reçue** porte la couleur de son **expéditeur**,
  mêlée à 70 % d'indigo (`ThemedMessageBubble.swift:383-390` :
  `blend(senderColor × 0,30, indigo500 × 0,70)`) — l'accent de la conversation
  n'est que le repli quand le message ne porte pas de couleur d'expéditeur.
  Vérifié le 2026-09-08 (`targets/bulle.md` § 10) ; la directive du 2026-09-04
  disait « l'accent de la conversation » — question produit ouverte, voir
  `targets/README.md`.
- **L'avatar et le nom vivent DANS le pied de la bulle**, et seulement sur le
  **dernier** message d'une suite (jamais le premier), en groupe, en réception.
- **Regroupement** : même auteur + même jour, **sans fenêtre temporelle**
  (`src/lib/grouping.ts`, témoins compris) — et, troisième critère de la loi
  iOS (`MessageDayGrouping.swift:97`), **jamais à travers un message système** :
  un avis d'arrivée et le premier message de l'arrivant sont deux groupes.
  Le web ne porte pas encore ce troisième critère (`targets/bulle.md` § 9.12).
- **Prisme Linguistique** : le contenu affiché EST déjà la traduction préférée,
  rendu comme du contenu natif ; la seule marque est la pastille `translate` et
  la bande de drapeaux du pied. La descente est dans `src/lib/api/prism.ts`,
  avec le témoin qui compte — celui qui s'écrit sur un **rang autre que le
  premier**, sinon le court-circuit interdit et la règle juste rendent le même
  verdict.
- **La barre de recherche de la liste est EN BAS** : à portée du pouce.

## Ce que le POC ne fait pas

Réseau réel (fixtures figées), temps réel, en-tête repliable au défilement,
gestes de balayage sur les lignes et les bulles, menu au appui long, rail de
stories complet, listes virtualisées. Aucun n'était bloquant pour l'arbitrage du
POC ; depuis la cible du 2026-09-08 (D-20, `targets/`), le menu d'appui long
d'une bulle et les gestes de fil sont des écarts à combler, pas des options —
sans eux une bulle n'a aucune action (`targets/bulle.md` § 9.3) ;
la virtualisation, en revanche, est **obligatoire** avant toute mesure de
fluidité sérieuse sur Android d'entrée de gamme.

## Les jetons — d'où viennent les valeurs (#5445)

**Aucune valeur de couleur ou de géométrie iOS n'est écrite à la main ici.**
`packages/design-tokens/ios.css` est **généré** depuis `MeeshyColors.swift` et
`DesignTokens.swift` par `packages/design-tokens/scripts/generate-from-ios.mjs`.
`src/styles/ios.css` ne fait plus que **nommer** ces jetons en utilitaires
Tailwind.

Deux gates, qui vérifient deux choses différentes :

| gate | ce qu'il prouve |
|---|---|
| `bun run check:tokens` | le CSS généré n'a pas dérivé de ses sources Swift |
| `bun run check:tokens-resolved` | **le navigateur peint bien ces valeurs-là**, dans les deux schémas |

Le second n'est pas redondant : entre le fichier généré et le pixel il y a un
import, un `@theme inline`, la cascade et deux classes de schéma, et n'importe
lequel peut avaler un jeton sans rien casser de visible — un nom mal
orthographié rend une couleur **vide**, pas une erreur. Les deux gates ont été
vus rougir sur une valeur falsifiée.

### Ce que la fusion a révélé, et qui reste ouvert

1. **Les deux tables n'ont jamais divergé sur les couleurs, mais sur les
   RÔLES.** `design-tokens` fait de `indigo400` sa primaire, iOS de
   `indigo500` ; les neutres de la v3 sont violacés (`#b9bcd0`), ceux d'iOS
   sont des gris vrais (`#9CA3AF`). Les unifier changerait le rendu de
   `web-v3`, une application en service : c'est une décision du porteur, pas un
   refactor. `tokens.css` est donc **intact** — vérifié.
2. **iOS porte lui-même des valeurs hors de ses propres tables.** Le rayon 18
   de la bulle n'est ni `MeeshyRadius.md` (14) ni `.lg` (16) ; le champ du
   composeur pose 22 ; l'heure d'une bulle emploie `.caption` de SwiftUI et non
   `MeeshyFont`. Elles ne sont **pas générables** — elles ne sont déclarées
   nulle part. Le tableau `HORS_TABLE_IOS` du générateur les déclare, chacune
   avec son site Swift, et vaut inventaire de ce que iOS doit remonter chez
   lui.
3. **La géométrie iOS emploie des demi-pas** (10, 14, 18, 22 px) que l'échelle
   fermée de la charte v3 (4, 8, 12, 16, 24…) ne contient pas. Soit l'échelle
   s'ouvre à ces pas, soit la fidélité cède d'un pixel par endroit.

## Le pont Tailwind ↔ design-tokens

`src/styles/app.css`. Deux choses à savoir avant d'y toucher :

- `@theme inline` fait émettre `var(--color-surface)` **dans** l'utilitaire au
  lieu d'en recopier la valeur : le basculement clair/sombre continue de passer
  par la classe `.light` de la table, et **aucune variante `dark:` n'est
  nécessaire**.
- **Un alias qui porte le nom de son jeton s'auto-référence**
  (`--color-danger: var(--color-danger)`) et devient invalide au calcul — sans
  erreur de build, sans avertissement, avec juste une couleur qui disparaît.
  D'où `erreur`, `anneau`, `av-N`, `pile`.

Les noms d'utilitaires sont les **rôles** de la charte, pas des tailles :
`rounded-card`, `text-body`, `bg-panel`. Un mésusage se voit en revue.
