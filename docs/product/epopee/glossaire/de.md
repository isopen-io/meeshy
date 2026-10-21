# Glossaire de l'épopée — allemand (Deutsch)

> Traduit, terme pour terme, de `fr.md` (la source), pour le lot B (#11174). En cas d'écart, la conception `docs/superpowers/specs/2026-10-20-epopee-du-jeu-design.md` a raison, puis `fr.md`, puis ce fichier. Les explications sont en français ; chaque mot du jeu est en allemand.
>
> **Ein Wort, ein Sinn** vaut en allemand comme en français : un terme par concept, le même sur le web, sur iOS et dans la passerelle.
>
> Sa projection vérifiable est `packages/shared/design/game-epic-vocabulary/de.json` (mots bannis et noms canoniques), que la garde web `apps/web/src/lib/game/epic-vocabulary.test.ts` applique à chaque valeur des catalogues allemands du jeu. Une règle qui entre ici entre là, dans le même commit. Format : `README.md`.

## Ce qui ne change jamais

- **Les règles du jeu** : seuils, prix, gains, plafonds. Aucun nombre ne bouge.
- **Les clés du fil** : `etincelle`, `lumiere`, les clés de rang, de ligue, de forme de Flamme, les champs servis. Seul le TEXTE affiché change.
- Les paramètres (`{count}`, `{level}`…) et les familles plurielles (`.one`, `.other`) de chaque clé.
- Une espace insécable (U+00A0) précède tout « +N » au milieu d'une phrase (`i18n-game-catalog.test.ts`).

## Le récit en une page (die Geschichte)

Der angemeldete Spieler ist **der Held**. Sein Ziel: eine **Legende** werden. Darüber wartet der **Mythos** auf nur hundert Auserwählte, „die, denen der Gott ihrer Ahnen vorausgeht“.

Jeder echte Austausch lässt **Funken sprühen**. Zusammen bilden sie **dein Licht**. Deine **Ahnen** wachen über dich: Jede Nacht schicken sie dir einen **Traum**, den du erfüllen sollst; bei jeder Entwicklung **zeigen sie sich**. Ab Botschafter offenbaren sie sich: Du erkennst ihr Land unter sieben.

**Mee und Meo**, zwei Kolibris, tragen die Botschaften zwischen den beiden Welten. Sie handeln oder sprechen: nie bloße Dekoration.

**Der Gott der Ahnen** wird nie genannt und nie gezeichnet. Er spricht nur einmal, an der Schwelle des Mythos.

## Les deux voix

| Voix | Où | Forme | Exemple |
|---|---|---|---|
| **A, la synthèse** | bandeau, pastilles, blason, cadres de la vue principale | un nom court et son chiffre | « Brückenbauer IV », « 12 Meeshes · Beutel », « Jade-Turnier · Platz 4 » |
| **B, le récit d'abord** | page Progression détaillée, fiches, cartes de Mee et Meo, signes des aïeux, feuilles, carnet des règles | la phrase mène, le chiffre suit en petit | « Dein Beutel hält 12 Meeshes », puis en petit « die Schatulle ab 50 » |

Le ton : on **tutoie** (`du`, `dein`), jamais `Sie`/`Ihr` ; on écrit pour un enfant de 13 ans, une idée par phrase. Le Ruhm se compte sans préposition : « +250 Ruhm », « Ruhm 44.600 » (voix A), « 44.600 Ruhm » (voix B). Le « geste » français est une **Aktion** (le mot que le jeu allemand emploie partout : « jede Aktion », « Aktionsfamilie »).

## Les mots bannis (überall)

| Mot banni (motif) | Ce qui le remplace |
|---|---|
| erhöhen, steigern (une valeur) | wachsen, nähren, erwachen, heller strahlen |
| Zähler | le nom du concept (« dein Ruhm », « deine Flamme ») |
| Wert, Gesamtwert, tatsächlicher Wert (le nom) | « dein Licht » ; l'adjectif « wert » reste (« ist 250 Ruhm wert ») |
| umwandelbar, in der Tasche | « dein Licht », « in deinem Licht » |
| Potenzial | rien : on dit ce qu'on possède |
| Schuld, Funkenschuld | « ein Schatten verhüllt N Funken deines Lichts » (der **Schatten**) |
| Rekord (Funken-Rekord, Level-Rekord, Meesh-Rekord…) | « seit jeher empfangen », « dein hellstes Licht », « deine längste Flamme », « seit jeher geprägt » |
| noch N bis X | en petit, « N bis X » |
| kostet, Kosten | une phrase : « sie bannt N Funken deines Lichts » ; le calcul va dans les règles |
| übrig, verbleibend | rien : aucune soustraction sur une fiche |
| Tabelle, Schema (le barème) | « jede Aktion lässt ihre eigenen Funken sprühen » |
| Grundpreis, Prozentsatz, Faktor (sur une fiche) | rien : le calcul vit dans les règles (`game.rules.*` les garde) |

## Un mot, un sens (ein Wort, ein Sinn)

| Mot | Il désigne désormais | Il ne désigne plus |
|---|---|---|
| Glut | la première forme de la Flamme | le premier état du niveau (→ **Funke**) |
| Licht | dein Licht, le fil entier | un état du niveau (→ **Klarheit**) |
| Truhe | la quatrième réserve de l'Erbe | la Truhe des Tages (→ **die Gabe**) |
| Schatz | la cinquième réserve de l'Erbe | le concept entier (→ **das Erbe**) |
| Stern | le ciel : l'état Stern, le Himmel der Ahnen, les Sternfragmente, les sept étoiles d'une médaille | la Wiedergeburt (→ **Zeitalter**), la Reise (→ **Schritte**), le libellé des paliers d'une médaille (→ **Stufen**) |
| Etappe | les étapes de l'accueil seulement (`game.guide.step_of`, `game.rules.section_steps`) | le seuil des dix niveaux (→ **Prüfung**), la Reise (→ **Rast**) |
| Schritt | les pas du Voyage | une épreuve (→ **Prüfung**), une étape de l'accueil (→ **Etappe**) |
| Stufe | un palier de médaille ou de défi, une marche du rang (V à I) | un état de la lumière (→ **Gestalt**), un contenant de l'Erbe (→ **Behältnis**) |
| Rang | le nom que le monde donne au héros | la place dans le Turnier (→ **Platz**) |
| Rekord | plus rien | voir « seit jeher », « dein hellstes Licht », « deine längste Flamme » |

Le compte de l'assistant d'inscription (`onboarding.progress`, « Schritt {current} von {total} ») n'est pas un texte du jeu : il garde « Schritt ».

## Les concepts

### Das Licht (le niveau — `game.level.*`, `game.tier.*`)

- **Ce que c'est** : la lumière du héros, qui traverse vingt **Gestalten** (états). Son niveau (**Level**) est le chiffre de l'anneau (**Ring**).
- **Les vingt Gestalten** : **Funke** (clé `etincelle`, jamais « Glut »), Schimmer, **Klarheit** (clé `lumiere`, jamais « Licht »), Glanz, Strahl, Morgenrot, Komet, Stern, Sternbild, Galaxie, puis Nebel, Pulsar, Quasar, Supernova, Magnetar, Sternhaufen, Superhaufen, Kosmos, Unendlichkeit, Singularität.
- **Die Prüfung** : tous les dix niveaux, de 10 à 100, les Ahnen demandent une épreuve. Tant qu'elle n'est pas bestanden, dein Licht wartet.
- **Le rang ouvre la lumière** : sous Botschafter, Level 499 au plus ; Botschafter ouvre jusqu'à 1000 ; Orakel lève toute limite.
- **A** : « Level 34 », anneau « 34 » · Glanz.
- **B** : « Dein Licht strahlt als Glanz », puis en petit « Level 34 · 3.200 bis Level 35 ».
- **Bannis** : « Noch N bis Level X » → « N bis Level X » ; « Level-Rekord » → « dein hellstes Licht » ; « Stufe » (pour un état) → « Gestalt ».

### Die Funken (`game.sparks.*`, `game.points.*`)

- **Ce que c'est** : l'unité (der Funke, die Funken). Chaque vrai échange en fait **sprühen** ; ensemble, ils forment **dein Licht**.
- **Les noms** : la poche = « dein Licht » / « in deinem Licht » ; le cycle = « in diesem Zeitalter » ; le total à vie = « seit jeher empfangen » ; la dette = **der Schatten**.
- **A** : « 108.233 Funken ».
- **B** : « Dein Licht zählt 108.233 », puis en petit « 377.752 seit jeher empfangen ».
- **Der Schatten** : « Ein Schatten verhüllt N Funken deines Lichts: Deine nächsten Funken werden ihn vertreiben. Solange er da ist, wird nicht geprägt. »
- Le singulier : « 1 Funke » ; à l'accusatif, « 1 Funken » (« hat {count} Funken sprühen lassen »).

### Der Rang (le Ruhm — `game.glory.*`, `game.rank.*`)

- **Ce que c'est** : le nom que le monde donne au héros. Le **Ruhm** le donne, et il ne recule jamais (« weicht nie zurück »).
- **Les rangs** : Flüstern, Echo, Stimme, Erzähler, Brückenbauer, Polyglott, Botschafter, Redner, Orakel, Legende, puis der **Mythos** (cent élus).
- **Les marches** : cinq **Stufen** par rang, de V à I.
- **A** : « Brückenbauer IV » ; « Ruhm 44.600 ».
- **B** : « Man nennt dich Brückenbauer », puis en petit « zweite Stufe · 44.600 Ruhm ».
- **Bannis** : « Noch N Ruhm bis X » → « N Ruhm bis X » ; « Zähler » → « dein Ruhm ».

### Das Erbe (`game.treasury.*`, `game.meesh.*`, `game.mint.*`)

- **Ce que c'est** : les pièces gardées pour la lignée (**deine Linie**). **Eine Meesh zu prägen bannt einen Teil deines Lichts in eine nummerierte Münze** : dein Licht, donc dein Level, sinkt um ebenso viel ; was du empfangen hast, bleibt empfangen.
- **Le verbe** : **prägen** (frapper) ; **bannen** (figer) — « Gebanntes Licht » (la ligne de la frappe), « sie bannt N deines Lichts ».
- **La fiche des Meeshes** s'appelle « Das Erbe ».
- **Les Behältnisse** (contenants, inchangés) : Börse (1), Beutel (10), Schatulle (50), Truhe (100, Stimme I), Schatz (500, Polyglott III), Reserve (1 000, Botschafter III).
- **Les éditions** : Silber ; Gold (jede hundertste) ; Prisma (jede tausendste).
- **A** : « 88 Meeshes · Schatulle ».
- **B** : « Deine Schatulle », **88 Meeshes** en grand, « die Truhe ab 100 », « 91 seit jeher geprägt ».
- **Bannis** : « kostet », « übrig », « Grundpreis … % » → rien sur la fiche ; « Meesh-Rekord » → « seit jeher geprägt » ; « dein Schatz » (le concept) → « dein Erbe ».

### Der Traum und die Gabe (`game.mission.*`, `game.chest.*`)

- **Ce que c'est** : chaque nuit, les Ahnen envoient un **Traum** en drei **Akte**, de plus en plus riches en Ruhm.
- **Les noms** : **Akt I**, **Akt II**, **Akt III**, parfois le **Goldener Akt**. Un acte s'**erfüllt** (« Erfüllt »). Les trois actes erfüllt font apparaître **die Gabe**, un présent verhüllt (fermée, elle ne dévoile rien). La **Prisma-Stunde** : une heure où chaque acte compte double. Changer un acte (« einen Akt tauschen ») demande une Meesh.
- **A** : « Traum: 2 von 3 ».
- **B** : « Der Traum dieser Nacht: 2 von 3 Akten », puis en petit « Akt III ist 250 Ruhm wert ».
- **Bannis** : « Mission », « Tagesmission » → « Traum », « Akt » ; « Truhe des Tages » → « die Gabe ».

### Die Flamme (`game.flame.*`)

- **Ce que c'est** : le feu que les Ahnen confient au héros. Une action par jour l'entretient.
- **Les formes** : Glut (1 Tag), Flamme (7), Feuersbrunst (30), Gestirn (100), Sonne (365).
- **Die Hüterin** (die Hüterinnen) garde la Flamme allumée un jour d'absence (deux au plus, une Meesh chacune) : « eine Hüterin rufen ». Erloschen, la Flamme se rallume dans les 48 heures.
- **Elle nährt deine Träume** : chaque jour ajoute 2 % de Funken à chaque acte, jusqu'à 50 %.
- **A** : « Flamme seit 23 Tagen ».
- **B** : « Deine Flamme brennt schon 23 Tage lang », puis en petit « +46 % auf deine Träume ».
- **Bannis** : « Eis », « Frost » → « Hüterin » ; « Serie », « Serientag » → « Flamme » ; « Rekord » → « deine längste Flamme ».

### Das Turnier und das Bündnis (`game.league.*`, `game.duo.*`)

- **Ce que c'est** : chaque semaine, trente héros (**Helden**) de lumière semblable se mesurent sous leur **Turniername**.
- **Les Kreise** (cercles, inchangés) : Quarz, Bernstein, Jade, Saphir, Rubin, Amethyst, Diamant, Prisma. Le nom d'une joute se compose : « Jade-Turnier », « {league}-Turnier ».
- Les sept premiers **steigen in den nächsten Kreis auf**, les cinq derniers **steigen ab**, les trois premiers reçoivent un **Pokal**. Le **Turnier der Freunde** reste toujours ouvert.
- **Das Bündnis** : une fois par semaine, avec un ami ; si chacun erfüllt seinen Teil, la récompense double.
- **A** : « Jade-Turnier · Platz 4 ».
- **B** : « Jade-Turnier: Platz 4 von 30 », puis en petit « die ersten 7 steigen zum Saphir auf ».
- **Bannis** : « Liga », « Freundesliga » → « Turnier » ; « Rang », « Rangliste » dans le Turnier → « Platz », « die Plätze » ; « Pseudonym » → « Turniername » ; « Duo », « Duo-Mission » → « Bündnis ».

### Die Reise (`game.season.*`)

- **Ce que c'est** : toutes les huit semaines, les Ahnen envoient le héros en voyage dans un **Sprachland** (une terre de langue).
- **Les Schritte** : chaque acte erfüllt fait avancer de quelques pas (« ein paar Schritte voran »). Vier Schritte mènent à la **Rast** suivante ; vierzig Rasten font la Reise. Au bout, le **Reisepokal**.
- **Das Siegel der Reise** (10 Meeshes) ajoute des objets à collectionner, sans avantage.
- La Reise « bricht auf » (part), « ist unterwegs » (en cours), « ruht » (en pause), « ist vollbracht » (accomplie).
- **A** : « Reise 1 · Rast 9 von 40 ».
- **B** : « Im Sprachland · 9. Rast », puis en petit « 2 bis zur nächsten Rast ».
- **Bannis** : « Saison » → « Reise » ; « Sterne » de saison → « Schritte » ; « Etappe » → « Rast ».

### Die Wiedergeburt (`game.prestige.*`)

- **Ce que c'est** : au Level 100, quand dein Licht est devenu Galaxie, le héros peut **wiedergeboren werden**. Sein Licht wird wieder zum Funken, et sa légende entre dans un nouvel **Zeitalter**. Les Ahnen lui offrent une trophée et beaucoup de Ruhm. Rien d'autre ne se perd.
- **Les Zeitalter** : Erstes Zeitalter (avant toute renaissance) … Sechstes Zeitalter (cinq renaissances au plus).
- **A** : « Zeitalter II », « Wiedergeburt 1 ».
- **B** : « Deine Legende lebt ihr Zweites Zeitalter ».
- **Bannis** : « Prestige » → « Wiedergeburt » ; « Sterne » de prestige → « Zeitalter ».

### Les traces de la légende

| Avant | Dans l'épopée | Précisions |
|---|---|---|
| Feiern, Fotomomente | **Zeichen der Ahnen** | « Deine Ahnen zeigen sich » : une animation, un cadre, une photo à **verewigen** avec Mee et Meo |
| Fortschrittsheft | **die Chronik** | le livre de la légende ; une photo y est « bewahrt » |
| Erfolge | **die Heldentaten** | une Heldentat se « vollbringt » ; raretés inchangées |
| Vitrine, Trophäenvitrine | **die Trophäen** | Turnierpokal, Reisepokal, Trophäe der Wiedergeburt, Trophäen der Flamme ; « dein Regal » |
| Abzeichen | **die Medaillen** | matières : Kupfer, Bronze, Silber, Gold, Platin, Obsidian, Prisma |
| Atlas | **der Atlas** | un tampon (Stempel) par langue vraiment échangée |
| Sternbild (le concept) | **der Himmel der Ahnen** | zehn Sternfragmente lassen einen Stern aufleuchten ; chaque étoile offre un **Schmuck** (parure) |

- **Bannis** : « Erfolg(e) » → « Heldentaten » ; « Abzeichen » → « Medaillen » ; « Heft » → « Chronik » ; « Sternbild » (le concept, hors `game.tier.constellation`) → « Himmel der Ahnen » ; « Feier(n) » (le nom) → « Zeichen der Ahnen » — le verbe « feiern » reste.

### Schwung und Herausforderungen

Inchangés. « Schwung vervielfacht die Funken, die sprühen. »

## Les noms des cadres de Progression (voix A)

Das Licht · Funken · Das Erbe · Der Rang · Die Flamme · Der Traum · Das Turnier · Die Reise · Die Wiedergeburt · Schwung · Medaillen · Herausforderungen · Heldentaten · Trophäen · Der Atlas.

Dans le carnet des règles, deux noms diffèrent : « Die Meesh » (la pièce) et « Das Erbe » (les contenants) ; s'y ajoutent « Die Gabe », « Die Prüfungen », « Das Bündnis ».
