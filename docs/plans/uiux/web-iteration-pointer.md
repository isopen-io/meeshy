# Pointeur de continuité — itérations UI/UX **web** (`w`)

> Fichier court et à jour qui dit **d'où part la prochaine itération web** et
> **où elle fusionne**. Il évite la divergence : une seule ligne de travail,
> synchronisée avec le trunk. (Le gros `branch-tracking.md`, 1,2 Mo, est
> l'HISTORIQUE multi-plateforme ; ce pointeur-ci est le plan de bord web.)

## Doctrine de branche (web)

| | |
|---|---|
| **Base de départ** de chaque itération web | `origin/dev` (resync à chaque tour) |
| **Cible de la PR** | `dev` |
| Branche de travail de la session courante | `claude/practical-fermat-6d9m0i` |

**Pourquoi `dev` et non `main`.** La directive porteur (CLAUDE.md §🚦) tranche :
`dev` **est le staging**, et Claude y est autonome sur tout — toute PR vers `dev`
**fusionne automatiquement dès la CI verte** (#9226). `main` est la branche de
**PUBLICATION**, alimentée par `dev` ; la production n'y reçoit que ce que le
staging a validé (#9223). Viser `main` directement contourne le staging et fait
fermer la PR (précédent documenté dans `branch-tracking.md`, correction
2026-09-05). « Fusionner avant la prochaine itération pour éviter la divergence »
se réalise donc **par `dev`** : c'est le trunk unique sur lequel la ligne web
reste synchronisée, et qui remonte vers `main` par le chemin de publication
normal.

## Protocole par itération

1. `git fetch origin dev` puis repartir de `origin/dev`.
2. Balayer l'anti-doublon : `ls docs/analyses/uiux/` (numéros `w` pris) **et**
   `search_pull_requests` sur le **nom du fichier cible** (pas le numéro).
3. Développer en TDD, pousser tôt le squelette, committer sur la branche de travail.
4. Ouvrir la PR vers `dev` ; elle auto-fusionne au vert. Supprimer la branche
   fusionnée ; la session suivante repart de `dev` à jour.
5. Annoter l'analyse `## ✅ Statut : CORRIGÉ (iter-Nw)` et mettre à jour ce pointeur.

## Dernière itération

| itération | date | branche de travail | PR | état |
|---|---|---|---|---|
| **74w** | 2026-10-21 | `claude/practical-fermat-to2xb3` | [#11384](https://github.com/isopen-io/meeshy/pull/11384) → `dev` | ✅ mergé |
| **75w** | 2026-10-24 | `claude/practical-fermat-o9iiqc` | [#12599](https://github.com/isopen-io/meeshy/pull/12599) → `dev` | ✅ mergé |
| **76w** | 2026-10-25 | `claude/practical-fermat-1peq83` | [#12925](https://github.com/isopen-io/meeshy/pull/12925) → `dev` | ✅ mergé |
| **77w** | 2026-10-31 | `claude/practical-fermat-95xnj5` | → `dev` | ✅ mergé |
| **78w** | 2026-11-01 | `claude/practical-fermat-0tzqfi` | [#14198](https://github.com/isopen-io/meeshy/pull/14198) → `dev` | ✅ mergé |
| **79w** | 2026-11-02 | `claude/practical-fermat-js1tyc` | → `dev` | ✅ mergé |
| **80w** | 2026-11-07 | `claude/practical-fermat-k0hf3y` | → `dev` | ✅ mergé |
| **81w** | 2026-11-08 | `claude/practical-fermat-9e6ean` | → `dev` | ✅ mergé |
| **82w** | 2026-11-09 | `claude/practical-fermat-jsk76s` | → `dev` | ✅ mergé |
| **83w** | 2026-11-10 | `claude/practical-fermat-kt6x2g` | → `dev` | ✅ mergé |
| **84w** | 2026-11-11 | `claude/practical-fermat-y94b4f` | → `dev` | ✅ mergé |
| **85w** | 2026-11-12 | `claude/practical-fermat-l2dnwf` | → `dev` | ✅ mergé |
| **86w** | 2026-11-13 | `claude/practical-fermat-u8t5dq` | → `dev` | ✅ mergé |
| **87w** | 2026-11-14 | `claude/practical-fermat-vayul2` | → `dev` | ✅ mergé |
| **88w** | 2026-11-15 | `claude/practical-fermat-dqytex` | [#18635](https://github.com/isopen-io/meeshy/pull/18635) → `dev` | ✅ mergé |
| **89w** | 2026-11-19 | `claude/practical-fermat-6cktea` | → `dev` | ✅ mergé |
| **90w** | 2026-11-20 | `claude/practical-fermat-awbeqk` | → `dev` | ✅ mergé |
| **91w** | 2026-11-21 | `claude/practical-fermat-h5vgy2` | [#20161](https://github.com/isopen-io/meeshy/pull/20161) → `dev` | ✅ mergé |
| **92w** | 2026-11-22 | `claude/practical-fermat-xtlc3p` | [#20325](https://github.com/isopen-io/meeshy/pull/20325) → `dev` | ✅ mergé |
| **93w** | 2026-11-23 | `claude/practical-fermat-10zclt` | [#20472](https://github.com/isopen-io/meeshy/pull/20472) → `dev` | ✅ mergé |
| **94w** | 2026-11-24 | `claude/practical-fermat-stot2z` | [#20515](https://github.com/isopen-io/meeshy/pull/20515) → `dev` | ✅ mergé |
| **95w** | 2026-11-25 | `claude/practical-fermat-o90to9` | → `dev` | ✅ mergé |
| **96w** | 2026-11-26 | `claude/practical-fermat-h4rohp` | [#20607](https://github.com/isopen-io/meeshy/pull/20607) → `dev` | ✅ mergé |
| **97w** | 2026-11-27 | `claude/practical-fermat-3gkfko` | [#20648](https://github.com/isopen-io/meeshy/pull/20648) → `dev` | ✅ mergé |
| **98w** | 2026-11-28 | `claude/practical-fermat-6d9m0i` | → `dev` | ⏳ ouverte |

**98w** — cohérence (dim. 6) / maintenabilité site-unique (dim. 11) / a11y œil↔oreille /
parité iOS (**FIN de la dette #20606**) : le **minuteur d'enregistrement vocal**
(`components/composer-tray.tsx`) arrondissait (`Math.round`) sur ses DEUX surfaces — l'œil
`formatDuration` (`<span aria-hidden>`) et l'oreille `spokenDuration` (`<span sr-only>`,
prononcé) — alors que le socle `formatMediaTime` (`lib/view/seek-track.ts`) et iOS
`MediaFormat.duration` (défaut `rounding: .down`, **œil ET `.spoken`**) planchén. Conséquences :
(1) +1 s à l'œil comme à l'oreille pour toute fraction ≥ .5 s (90 500 ms → « 1:31 » / « 1 min
31 s », partout ailleurs « 1:30 ») ; (2) risque de divergence a11y œil↔oreille (deux `Math.round`
indépendants). Parité iOS confirmée : `MediaFormat+Duration.swift:34,45` plancher le chemin
`wholeSeconds`, partagé par la forme `m:ss` et `.spoken`. Correction (site unique du PLANCHER) :
`floorMediaSeconds(seconds)` extraite dans le socle `seek-track.ts` (plancher + garde
non-fini/négatif), consommée par `formatMediaTime` (sortie **byte-identique**) ; l'œil délègue à
`formatMediaTime(ms/1000)`, l'oreille plancher via `floorMediaSeconds(ms/1000)` — une seule loi,
œil et oreille structurellement verrouillés. Témoin NEUF (axe discriminant : le cas 65 000 ms est
entier, floor==round) `composer-tray.test.tsx` « à la demi-seconde, l'œil et l'oreille planchent
ensemble » (**1 rouge → vert** : « 1:30 »/« 1 min 30 s », jamais « :31 ») ; non-régression
`composer-tray(+heif)` **9/9**, `lib/view` **4380/0**, `lib/export` **547/0** ; `tsc` **0** ; gate
#8879 **0** (remesuré à l'ouverture). Housekeeping : 97w confirmée mergée (#20648) ; appariement
analyses↔plans 1:1 (**77/77** `w` → **78/78** avec 98w, 0 doublon). **#20606 FERMÉE** : les cinq
formateurs `m:ss` du web convergent sur le socle ; reste `talkie-header-law.ts:197` (réimplémente
mais planche déjà — conforme, pas un défaut). Analyse : `docs/analyses/uiux/2026-11-28-iteration-98w.md`.

**97w** — cohérence de positionnement (dim. 6) / maintenabilité site-unique (dim. 11)
/ parité iOS (**suite surgicale de 96w, moitié EXPORT de #20606**) : **jumelle
divergente d'un formateur `m:ss` sur une carte EXPORTÉE**. `formatDuration`
(`lib/export/message-card-media.ts`), source unique de la durée peinte sur les quatre
styles de carte audio (`onde`/`spectre`/`pastille`/`etiquette`), calculait
`Math.max(0, Math.round(ms/1000))` — arrondi + garde négatif SEULE — alors que le
socle `formatMediaTime` (`lib/view/seek-track.ts`), le badge de vignette (#20605), le
lecteur, la citation et les accusés **plancén** et gardent le non-fini en « 0:00 ».
Deux défauts sur un artefact PARTAGÉ hors de l'app : (1) +1 s à l'œil à la fraction
≥ .5 s (`90_500 ms` → carte « 1:31 », partout ailleurs « 1:30 ») ; (2) une durée
indéfinie peignait **« NaN:NaN »** (la garde `Math.max(0,…)` ne couvrait que le
négatif). Parité iOS confirmée et TRANCHÉE (le « à décider » de #20606) :
`MediaFormat.duration` plancher par défaut (`.down`), et l'export iOS
(`MessageCardExcerptStrip.swift:32`) l'appelle sans surcharge — floor. Correction :
`formatDuration = (ms) => formatMediaTime(ms / 1000)` — délégation au socle, plancher +
garde hérités, pas de cycle (`seek-track.ts` n'importe rien ; `lib/export/` importe déjà
de `lib/view/`). La carte étant une IMAGE, la durée n'a pas de jumeau PARLÉ — correction
complète pour l'export. Témoin NEUF (axe discriminant non couvert) `message-card-media.test.ts`
(describe « même horloge plancher que le socle », **3 rouges → 13/13 verts** : 1,5 s → « 0:01 »,
90,5 s → « 1:30 », accord byte-à-byte avec `formatMediaTime`, NaN/∞/négatif/0 → « 0:00 ») ;
`lib/export/` **547/0** ; `tsc` 0 ; gate #8879 **0**. Housekeeping : 96w confirmée mergée
(#20607, #20605 fermée) ; appariement analyses↔plans 1:1 (**76/76** `w` → **77/77** avec 97w,
0 doublon). Dette #20606 reste ouverte pour la moitié `composer-tray` (œil + oreille à
plancher ensemble). Analyse : `docs/analyses/uiux/2026-11-27-iteration-97w.md`.

**96w** — cohérence de positionnement (dim. 6) / maintenabilité (dim. 11) / parité
iOS (**revue FRAÎCHE**, #20326 soldée, gate #8879 à 0) : **jumelle divergente d'un
formateur `m:ss`**. `videoDurationLabel` (`lib/view/media-grid-layout.ts`), le badge
peint sur une vignette vidéo (`video-tile.tsx`, `content-card-visual.tsx`),
calculait `Math.round(durationMs/1000)` **sans garde** — alors que le SOCLE
`formatMediaTime` (`lib/view/seek-track.ts`), lu par le lecteur
(`media-transport.ts`), la citation (`quoted-preview.ts`) et les accusés
(`message-receipts-sheet.tsx`) via `attachmentDurationLabel`, **plancher**
(`Math.floor`) et garde le non-fini en « 0:00 ». Deux défauts : (1) pour toute
fraction ≥ .5 s le badge annonçait **+1 s** par rapport au même fichier partout
ailleurs (1,5 s → badge « 0:02 », lecteur « 0:01 ») ; (2) une durée indéfinie
peignait **« NaN:NaN »**. Parité iOS confirmée : le badge `MeeshyVideoThumbnail
.swift:53` appelle `MediaFormat.duration` dont le défaut est `rounding: .down`
(plancher) — le web arrondissait, le correctif le RAPPROCHE d'iOS. Correction :
`videoDurationLabel = (ms) => formatMediaTime(ms / 1000)` — site unique, plancher +
garde hérités (pas de cycle : `seek-track.ts` n'importe rien). Témoin NEUF
(couverture inexistante) `media-grid-layout.test.ts` (describe « même horloge
plancher que le socle », **4 rouges → 27/27 verts** : 1,5 s → « 0:01 », 90,5 s →
« 1:30 », accord byte-à-byte avec `formatMediaTime`, NaN/∞/négatif/0 → « 0:00 ») +
`video-tile.test.tsx` 17/17 + `lib/view` **4378/0** ; `tsc` 0 ; gate #8879 **0**.
Housekeeping : 95w confirmée mergée (#20326 soldée sur `dev`) ; appariement
analyses↔plans 1:1 revérifié (**75/75** `w` → **76/76** avec 96w, 0 doublon).
**#20605 fermée** ; dette #20606 (composer-tray + export arrondissent encore).
Analyse : `docs/analyses/uiux/2026-11-26-iteration-96w.md`.

**95w** — a11y / i18n / maintenabilité (**FIN du filon #20326**, suite de 92w→94w) :
les DEUX derniers segments à PLURIEL de `composeMessageLabel`
(`lib/view/message-a11y-label.ts`, SITE UNIQUE du nom accessible d'une rangée)
restaient EN DUR EN FRANÇAIS — les comptes de pièces jointes (`attachmentSegments` :
`image/images`, `vidéo/vidéos`, `audio/audios`, `fichier/fichiers`, `contact/contacts`
via `pluralize`) et le préfixe des réactions (`reactionsSegment` : « réactions : »).
Même défaut : invisible pour un francophone, entendu en français par un lecteur
EN/ES/PT/DE/IT/AR sur SES messages. Correction : **11 clés** ajoutées aux sept
`catalog-{lang}-shell-labels.ts` (`message.attachment.{image,video,audio,file,contact}
.{one,other}` + `message.reactions.a11y`), **FR byte-identique**, modèle de pluriel
`{count} <nom>` repris de `message.reaction.count` (Arabe binaire compris) ; noms
portés d'iOS (`a11y.message.{images,videos,audios,reactions}`) et du catalogue web
existant pour fichier/contact (absents d'iOS). `attachmentSegments(attachments,
language)` devient la SOURCE traduite ; `pluralize` **supprimée** (plus aucun
consommateur). **Les TROIS surfaces servies par cette source unique suivent** :
`composeMessageLabel` (oreille), `protected-content.tsx` (constat de retenue admin,
`currentInterfaceLanguage()` déjà en portée) et `quoted-preview.ts` (inventaire de
citation, `interfaceLanguage` déjà paramètre) — « qui AFFICHE ce qu'élit le résolveur »
(Prisme, cycle 122). Témoins : `message-a11y-label.test.ts` (51→57 : EN « 2 videos,
1 audio »/« reactions: 👍 2 », AR « 1 صورة »/« التفاعلات: », FR byte-identique « 2
images, 1 audio, réactions : 👍 2 », fichier/contact one/other) + `i18n-catalog.test.ts`
12/12 (49 883 `expect`) + `contact-card/label`/`quoted-preview`/`protection-notice`/
`message-blocks` verts + `lib/view` **4402/0** ; `tsc` 0 ; harmonie **0** (remesuré à
l'ouverture). Housekeeping : 94w confirmée mergée (#20515) ; appariement analyses↔plans
1:1 revérifié (**74/74** `w` → **75/75** avec 95w, 0 doublon). **#20326 FERMÉE** : plus
un segment de `composeMessageLabel` en dur en français. Analyse :
`docs/analyses/uiux/2026-11-25-iteration-95w.md`.

**94w** — a11y / i18n / maintenabilité (suite de 93w, issue #20326) : **les trois
segments SANS pluriel restants** du libellé d'accessibilité d'un message restaient
EN DUR EN FRANÇAIS — « Sans compte » (marqueur anonyme), « sticker », « Position :
{lieu} »/« lieu partagé » — dans `composeMessageLabel` (`lib/view/message-a11y-label.ts`,
SITE UNIQUE). Même défaut que 92w/93w : invisible pour un francophone, entendu en
français par un lecteur EN/ES/PT/DE/IT/AR sur SES messages. Correction : quatre clés
ajoutées aux sept `catalog-{lang}-shell-labels.ts` (`message.anonymous.a11y`,
`message.sticker.a11y`, `message.location.named.a11y` {place}, `message.location.shared.a11y`),
**FR byte-identique**, l'anonyme repris de `linkDetail.stats.anonymous` (déjà traduit),
le lieu de l'étiquette iOS `a11y.message.location` (**seul PT inventé**, absent iOS) ;
« sticker » identique sauf de/ar. **L'info-bulle du fantôme** (`focal-row.tsx:803`,
`title` en dur) descend la MÊME clé — œil et oreille unifiés. Témoins :
`message-a11y-label.test.ts` (45→49 : EN « Without an account » pas « Sans compte » ;
AR « ملصق » pas « sticker » ; EN « shared location: … » pas « Position » ; lieu sans
nom → repli, couvrant null/undefined/'') + `i18n-catalog.test.ts` 12/12 (49 610 `expect`)
+ `message-blocks`/`detail-sheet` 32/32 + `focal-row` 69/69 ; `tsc` 0 ; harmonie **0**.
Housekeeping : 93w confirmée mergée (#20472) ; appariement analyses↔plans 1:1
revérifié (**48/48** `w`, 0 doublon → **49/49** avec 94w). **Dette 95w+** : ne restent
QUE les segments à PLURIEL — comptes de pièces jointes (`attachmentSegments`, aussi
consommé par `ProtectionNotice`) et réactions (`reactionsSegment`) —, issue **#20326**
toujours ouverte. Analyse : `docs/analyses/uiux/2026-11-24-iteration-94w.md`.

**93w** — a11y / i18n / maintenabilité (suite de 92w, issue #20326) : **trois
segments du libellé d'accessibilité d'un message restaient EN DUR EN FRANÇAIS** —
« réponse à {auteur} », « modifié », « épinglé » — dans `composeMessageLabel`
(`lib/view/message-a11y-label.ts`, SITE UNIQUE du nom accessible). Même défaut que
l'accusé de 92w : invisible pour un francophone, entendu en français par un lecteur
EN/ES/PT/DE/IT/AR sur SES messages. Correction : trois clés ajoutées aux sept
`catalog-{lang}-shell-labels.ts` (`message.edited.a11y`, `message.pinned.a11y`,
`message.replyTo.a11y`), **FR byte-identique**, les six autres langues **portées de
l'iOS déjà relu** (`a11y.message.edited` / `a11y.message.pinned`) — aucune traduction
inventée ; l'auteur de citation inconnu réutilise `quote.sender.unknown` (= « l'expéditeur »,
le MÊME que le pied de citation `message-blocks.tsx:744`), seul effet FR « réponse à
expéditeur inconnu » → « réponse à l'expéditeur ». Témoins : `message-a11y-label.test.ts`
(42→45, EN « replying to/edited/pinned » pas le français, auteur inconnu « l'expéditeur »,
modérateur inchangé) + `i18n-catalog.test.ts` 12/12 (parité des 7 catalogues) +
consommateurs 32/32 ; `tsc` 0 ; harmonie **46/46, 0**. Housekeeping : 92w confirmée
mergée (#20325, `message-status-label.ts` sur `dev`, `deliveryWord` supprimé) ;
appariement analyses↔plans 1:1 revérifié 74w→92w (**47/47**), **0 vrai doublon** `w`.
**Dette 94w+** : le reste de `composeMessageLabel` garde « Sans compte », « Position »,
« sticker » (sans pluriel), puis les comptes de pièces jointes et réactions (pluriel)
— issue **#20326** toujours ouverte. Analyse : `docs/analyses/uiux/2026-11-23-iteration-93w.md`.

**92w** — a11y / i18n / maintenabilité (PREMIER tour de l'axe optimisation, le gate
d'harmonie étant clos) : **le libellé d'accessibilité d'un message annonçait son
ACCUSÉ en français en dur** pour tous les lecteurs d'écran. `composeMessageLabel`
(`lib/view/message-a11y-label.ts`) descend bien le catalogue pour la protection, le
transfert et la modération, mais la fonction locale `deliveryWord` rendait
`pending/sent/delivered/read` → « en cours d'envoi »/« envoyé »/« distribué »/« lu »
EN DUR — un lecteur EN/ES/PT/DE/IT/AR entendait « lu » sur SES messages. **Jumelle
divergente** : le pied de rangée (`message-blocks.tsx`) dit déjà l'accusé via
`statusLabel` + les clés traduites ×7 `message.status.*`, et `deliveryWord` avait
même divergé EN français (« distribué » contre le « remis » du pied). Correction :
`STATUS_KEY`+`statusLabel` extraits vers un module PUR `lib/view/message-status-label.ts`
(réexporté par `message-blocks`, ses 12 consommateurs inchangés), `deliveryWord`
supprimée, l'accusé descend `statusLabel(delivery, language)`. **Aucune nouvelle
traduction** (clés déjà présentes). FR pending/sent/read byte-identiques ;
`delivered` « distribué » → « remis » (unification avec le pied, cohérence). Témoins :
`message-a11y-label.test.ts` (38→41, EN « read » pas « lu », FR « remis » pas
« distribué », non-régression) + consommateurs `statusLabel` 72/72 ; `tsc` 0 ;
harmonie **0**. Housekeeping : 91w confirmée mergée (#20161) ; appariement
analyses↔plans 1:1 revérifié 74w→91w (18/18), **0 doublon** `w`. **Écarté, ne pas
reproposer** : le lead E2EE de l'écran Sécurité (`settings-security.tsx:225`) est un
repère règle 7 GOUVERNÉ (`settings-reperes.test.tsx:272`, #17594), pas un défaut
d'épure. **Dette 93w+** : le reste de `composeMessageLabel` garde d'autres segments
en dur en français (« Sans compte », comptes de pièces, « modifié », « épinglé »,
« réponse à », « Position », « sticker », « réactions ») — clés neuves ×7 requises,
issue **#20326** ouverte. Analyse : `docs/analyses/uiux/2026-11-22-iteration-92w.md`.

**91w** — maintenabilité / cohérence : **le gate d'harmonie #8879 passe à 0** (5 →
0, liste entièrement vidée). Ses 4 derniers cas étaient tous calculés ou de
masque, aucun chrome brut. **Un seul est une vraie correction** : le letterbox de
l'aperçu de scène admin (`routes/admin-post-preview.tsx:246`) passe de `'#000'` au
jeton `var(--color-media-backdrop)` (= `#000000` byte-identique, dérivé de
`MeeshyColors.swift`), le **même** que les visionneuses plein écran
`media-viewer.tsx:550` / `viewer-scene-page.tsx:94` peignent déjà — une jumelle en
dur unifiée sur son rôle (cohérence de positionnement). Les trois autres sont des
**exemptions motivées à la ligne** : masque de luminance de la troncature d'aperçu
(`message-menu.tsx:830,831`, `black` = opaque, cf. edgeFadeMask 85w), voile
dynamique composé (`conversation-backdrop.tsx:68`, `rgba(${veilColor}, ${veil})`,
`veilColor` scheme-aware `9,9,11`/`255,255,255`), et couleur calculée depuis la roue
du prisme (`rank-blason.tsx:115`, `hsl()`, repli jeton `var(--game-prism-k)`, famille
`lib/accent`). **Aucun pixel ne change** (un `#000000` byte-identique + des
commentaires). Témoins : `check-design-harmony.test.ts` (describe « les quatre
derniers cas du gate (91w) », 44→46) + les 4 composants (98/98, non-régression).
Gate **5 → 0** ; `tsc` 0. Housekeeping : 90w confirmée mergée (famille des replis
sur `dev`, gate mesuré 5/4 à l'ouverture, inchangé) ; appariement analyses↔plans
1:1 revérifié (45w→90w, **70/70**), **0 vrai doublon** de numéro `w`. Analyse :
`docs/analyses/uiux/2026-11-21-iteration-91w.md`.

**90w** — maintenabilité / cohérence de thème : quatre styles inline écrivaient
`var(--jeton, littéral)` et le gate prenait le littéral pour du chrome en dur —
`battery-panel.tsx:312` (`var(--color-ios-on-brand, #fff)`),
`shared-location-card.tsx:34` (`var(--color-on-brand, #fff)`),
`profile-relation-face.tsx:112` et `vitrine-preview.tsx:71`
(`var(--color-ios-fill, rgba(127,127,127,.14))`) — **4 des 9** violations. Les trois
jetons sont déclarés sans condition (`@theme inline` → `:root`, `ios.css:56,63` /
`app.css:59`, garde `declared-tokens.test.ts`), donc le littéral n'est **jamais
rendu** ; mais on le GARDE — pour les deux boutons de marque, une encre absente sur
aplat saturé rendrait le texte illisible (contraste défensif, pas du chrome).
**Exemption motivée à la ligne** (`/* harmony-exempt: repli d'un jeton de charte
défini (--color-…), jamais rendu … */` dans l'objet `style`), pas un retrait (le
filet de contraste reste), pas un chemin exempté — les fichiers restent scannés.
Même régime que `face-rig` (89w) et le masque de luminance appel (85w). **Aucun
pixel ne change** (commentaires seuls). Témoins : `check-design-harmony.test.ts`
(describe « les replis d'un jeton de charte défini », 42→44) + les 4 composants et
voisins (59/59, non-régression). Gate **9 → 5 violations** (−4, exactement la
famille des replis), **8 → 4 fichiers** ; `tsc` 0. Housekeeping : 89w confirmée
mergée (`face-rig` hors liste sur `dev`, gate mesuré 9/8 à l'ouverture) ;
appariement analyses↔plans 1:1 revérifié (74w→89w, 16/16), **0 vrai doublon** de
numéro `w` (regex complète `iteration-[0-9]+w[a-z]?` → vide). Analyse :
`docs/analyses/uiux/2026-11-20-iteration-90w.md`.

**89w** — maintenabilité / cohérence de thème : le gréement de visage des effets
d'appel (`lib/calls/face-rig.ts`, #19779) peint dans `paintMask` un dégradé radial
`rgba(0,0,0,1) → rgba(0,0,0,1) → rgba(0,0,0,0)` sur un canvas HORS DOM — **3 des 12**
violations du gate (remonté de 5/4 à **12/9** à l'ouverture, `dev` ayant reçu
plusieurs poches neuves). Ce n'est **pas une couleur** : le canvas sert UNIQUEMENT de
**masque alpha**, composé en `globalCompositeOperation = 'destination-in'` (ligne 112)
où seule l'ALPHA découpe l'œil agrandi — le noir n'est jamais rendu comme teinte. La
charte ne nomme aucun jeton pour une rampe d'alpha de compositing : même régime que le
masque de luminance de la famille appel (85w) et l'onde canvas (84w). **Exemption
motivée à la ligne** (`// harmony-exempt: alpha de masque (destination-in), pas une
couleur` ×3 + commentaire d'en-tête), pas un jeton, pas un chemin exempté — le fichier
reste scanné. **Aucun pixel ne change** (commentaires seuls). Témoins :
`check-design-harmony.test.ts` (describe « le masque de l'œil (face-rig) », 40→42) +
`face-rig.test.ts` (10/10, non-régression). Gate **12 → 9 violations** (−3, exactement
`face-rig`), **9 → 8 fichiers** ; `tsc` 0. Housekeeping : 88w confirmée mergée (#18635,
`text-on-media` sur `dev`) ; appariement analyses↔plans 1:1 revérifié (45w→88w), 0
doublon de numéro `w`. Analyse : `docs/analyses/uiux/2026-11-19-iteration-89w.md`.

**88w** — cohérence de thème / maintenabilité : la barre de composition d'un
commentaire d'export (`routes/comment-compose-bar.tsx:100`) peignait le ▶
(indicateur vidéo) **posé SUR la vignette vidéo** (`<img object-cover>`) en littéral
`text-white` — 1 des 6 violations du gate. La charte nomme déjà cette encre : un
glyphe blanc SUR un média est `text-on-media` (= `--color-on-media` = `--ios-on-media`
= `#ffffff`, byte-identique, CONSTANT clair/sombre), le même jeton que le voisin
direct `components/comment-media.tsx:92` sur le même motif (glyphe en surimpression
de vignette). L'encre passe donc à `text-on-media` ; `drop-shadow` conservé. Pas une
exemption : un jeton partagé. Témoins : `check-design-harmony.test.ts` (describe « le
▶ d'une vignette vidéo », 38→40) + `comment-media` (6/6, non-régression). Gate **6 → 5
violations** (−1, exactement `comment-compose-bar`), **5 → 4 fichiers** ; `tsc` 0.
Housekeeping : 87w confirmée mergée (`var(--color-ios-on-brand)` sur les deux pastilles
d'en-tête sur `dev`, gate mesuré 6/5 à l'ouverture) ; appariement analyses↔plans 1:1
revérifié (45w→87w), 0 doublon de numéro `w` (suffixes `wb`/`wc`/… de juin = sous-
itérations LEGACY intentionnelles). Analyse :
`docs/analyses/uiux/2026-11-15-iteration-88w.md`.

**87w** — cohérence de thème / maintenabilité : deux pastilles d'action de l'en-tête
d'un fil peignaient le glyphe de leur état **actif** en littéral `'#fff'`, chacune sur
un **aplat saturé** — `thread-header-bring.tsx:80` (cloche qui sonne, fond
`var(--color-error)`) et `thread-header-talkie.tsx:129` (talkie pressé, fond
`linear-gradient(135deg, var(--accent), …)`) : 2 des 8 violations du gate. La charte
nomme déjà cette encre (blanc sur aplat marque/accent/erreur → `var(--color-ios-on-brand)`,
`#fff` byte-identique, ligne 40) — même rôle que l'encre du bouton d'envoi de 86w.
L'encre active des deux pastilles passe donc à `var(--color-ios-on-brand)` ; les fonds
d'aplat étaient déjà des jetons (non touchés). Pas une exemption : un jeton partagé.
Témoins : `check-design-harmony.test.ts` (describe « la pastille d'action d'en-tête »,
36→38) + `thread-header-bring`/`thread-header-talkie`/`thread-header-talkie-band`/
`talkie-host` (28/28, non-régression). Gate **8 → 6 violations** (−2, exactement les
deux pastilles), **7 → 5 fichiers** ; `tsc` 0. Housekeeping : 86w confirmée mergée
(`--send-accent-fill` sur `dev`, gate mesuré 8/7 à l'ouverture) ; appariement
analyses↔plans 1:1 revérifié (45w→86w), 0 doublon de numéro `w`. Analyse :
`docs/analyses/uiux/2026-11-14-iteration-87w.md`.

**86w** — cohérence de positionnement / maintenabilité : le bouton d'envoi de marque
était recopié en **trois jumelles divergentes** — `composer.tsx` (envoi),
`composer-tray.tsx` (envoi vocal) et `message-edit-composer.tsx` (soumission d'édition) :
même fond `linear-gradient(135deg, var(--accent), color-mix(…, white))` et même encre
`text-white`. Les deux premiers sont hors périmètre du gate (`composer*`), le troisième
est scanné (2 des 10 violations). Source unique désormais : le jeton composé
`--send-accent-fill` (`styles/app.css`, `:root`, dérivé de `var(--accent)`, voisin des
`--recording-*`), consommé par `background: var(--send-accent-fill)` ; l'encre passée à
`text-ios-on-brand` (= `--ios-on-brand` = `#fff`, byte-identique, nommée par son rôle).
Le CSS n'étant pas scanné, le littéral `white` quitte entièrement la surface au lieu
d'être exempté. Témoins : `check-design-harmony.test.ts` (describe « le bouton d'envoi »,
33→36) + `message-edit-composer`/`composer`/`composer-tray`/`-heif`/`declared-tokens`
(52/52, non-régression). Gate **10 → 8 violations** (−2, exactement
`message-edit-composer`), **8 → 7 fichiers** ; `tsc` 0. Housekeeping : 85w confirmée
mergée (`edgeFadeMask` sur `dev`, gate mesuré 10/8 à l'ouverture) ; appariement
analyses↔plans 1:1 revérifié (45w→85w). Analyse :
`docs/analyses/uiux/2026-11-13-iteration-86w.md`.

**85w** — cohérence / maintenabilité (famille appel) : le même fondu de bord
(`linear-gradient(…, #000 8px, #000 calc(100% - 8px), transparent)`, masque de
LUMINANCE) était écrit en **trois jumelles divergentes** — `RAIL_FADE`
(`call-control-actions.tsx`), `ROW_EDGE_FADE` (`call-row-keys.ts`), `fade` de
`stripBox` (`call-grid.tsx`) — 6 des 17 violations du gate. Source unique désormais :
`edgeFadeMask(axis)` dans `call-row-keys.ts`, exemptée UNE fois à la ligne
(luminance, hors couleur) ; les trois sites en dérivent, sortie **byte-identique**
(témoin `call-rails.test.tsx:171` inchangé). Et le verre de la pastille d'appel
(`call-floating-pill.tsx`, `color-mix(in srgb, white 22%, transparent)`) ramené à
`var(--color-media-hairline)` — filet blanc 20 %, parité talkie 84w. Témoins :
`check-design-harmony.test.ts` (describe « la famille appel », 29→33) +
`call-rails/bubble/row-keys` (31/31). Gate **17 → 10 violations** (−7, exactement
la famille appel), **12 → 8 fichiers** ; `tsc` 0. Housekeeping : 84w confirmée
mergée (`talkie-header-band` porte `var(--ios-error-strong)` sur `dev`) ; mesure
d'ouverture **remontée 13/10 → 17/12** (poche appel neuve sur `dev`) ; appariement
analyses↔plans 1:1 revérifié (45w→84w). Analyse :
`docs/analyses/uiux/2026-11-12-iteration-85w.md`.

**84w** — cohérence de thème / maintenabilité : le talkie élargi sur la barre
d'en-tête (`components/talkie-header-band.tsx`, transposition de
`TalkieHeaderLiveBar.swift`, #17338) peignait son chrome en **15 littéraux bruts**
(blanc/noir rgba, `#fff`, `#000`) — **15 des 28 violations du gate (54 %)**, la plus
grosse poche de chrome du web, apparue sur `dev` APRÈS 83w. Encre, voiles, filets et
halos ramenés à l'échelle `on-media`/`scrim-soft`/`media-fill`/`media-hairline` (ou
`color-mix` de `var(--color-on-media)` pour les alphas hors dosage canonique), et le
rouge d'enregistrement passé de `var(--color-error)` (illisible sur verre sombre en
thème clair) à `var(--ios-error-strong)` — parité iOS (`errorStrong`) et avec les
autres chromes d'appel. Seules exemptions, déclarées à la ligne : l'onde en CANVAS
(hors du DOM) et le masque de luminance (`#000` = opaque). Témoins :
`check-design-harmony.test.ts` (describe « la barre de talkie élargie », `scanSource`
→ `[]`, 25→29) + `thread-header-talkie.test.tsx` (voile hors ligne re-jetonné
`var(--color-scrim-soft)`). Gate **28 → 13 violations** (−15, exactement
`talkie-header-band.tsx`), **11 → 10 fichiers** ; `tsc` 0. Housekeeping : 83w
confirmée mergée (`lens-preview-line` dérive de `RAINBOW_SPECTRUM` sur `dev`) ;
appariement analyses↔plans 1:1 revérifié (45w→83w). Analyse :
`docs/analyses/uiux/2026-11-11-iteration-84w.md`.

**83w** — cohérence de positionnement / maintenabilité : l'aperçu de liste
(`components/lens-preview-line.tsx`) peignait le fini « rainbow » d'un message avec
un dégradé codé en dur (`#f43f5e, #f59e0b, #22c55e, #3b82f6, #a855f7`) — une
JUMELLE DIVERGENTE du spectre de la maison `RAINBOW_SPECTRUM`
(`@/lib/effects-playback`, miroir iOS `houseSpectrum`), que la bulle
(`effects-runner`) et iOS jouent déjà. Même message « rainbow » ⇒ trois
arcs-en-ciel différents (liste / bulle / iOS), et les 5 dernières hex de la plus
grosse poche du gate. L'aperçu dérive désormais de `RAINBOW_SPECTRUM`
(`linear-gradient(90deg, …join)`) — source unique, pas exemption. Témoins :
`check-design-harmony.test.ts` (describe « le fini arc-en-ciel d'un aperçu »,
`scanSource` → `[]`, 23→25) + `lens-row-preview.test.tsx` (parité : style ⊇
`RAINBOW_SPECTRUM`, ⊄ jumelle). Gate **14 → 9 violations** (−5, exactement
`lens-preview-line.tsx`), **8 → 7 fichiers** ; `tsc` 0. Housekeeping : 82w
confirmée mergée (`mood-page` tokens sur `dev`) ; appariement analyses↔plans 1:1
revérifié (45w→82w). Analyse : `docs/analyses/uiux/2026-11-10-iteration-83w.md`.

**82w** — cohérence de thème / maintenabilité : l'écran d'une humeur reçue
(`components/mood-page.tsx`) peignait son chrome immersif en littéraux bruts —
`text-white` ×4, `rgb(0 0 0 / …)` ×6, `rgb(255 255 255 / .85)`, `black` ×2, `'white'`
— soit **13 des 27 violations du gate d'harmonie (48 %)**, la plus grosse poche de
chrome du produit web. Chacune a pourtant un rôle que la charte nomme : encre sur
média (`text-on-media`), encre sur aplat de marque (`text-ios-on-brand`), voiles
(`var(--color-scrim-soft)` / `var(--color-scrim)`), halo blanc (`var(--color-on-media-2)`),
assombrissement vers le fond média (`var(--color-media-backdrop)`). Les 13 littéraux
remplacés par leur jeton (aucune couleur de tiers ici — que du chrome, donc aucune
exemption). Témoins : `check-design-harmony.test.ts` describe « l'écran d'humeur »
(`scanSource` → `[]`, RED→GREEN, 21→23) + `mood-page.test.tsx` (branche de repli par
marqueur `data-mood-backdrop-fill`, happy-dom ne parsant pas `color-mix(…, var(…))`).
Gate **27 → 14 violations** (−13, exactement `mood-page.tsx`), **9 → 8 fichiers** ;
`tsc` 0. Housekeeping : 81w confirmée mergée (`screen-wait-art` dans `EXEMPT_PATHS`
sur `dev`) ; appariement analyses↔plans 1:1 revérifié (45w→81w). Analyse :
`docs/analyses/uiux/2026-11-09-iteration-82w.md`.

**81w** — maintenabilité / cohérence (périmètre du gate d'harmonie) : l'art GÉNÉRÉ
`components/screen-wait-art.ts` (SVG baké du sticker Mee/Meo « On danse », byte-identique
à sa source `lib/mee/screen-wait-art-source` DÉJÀ exemptée) était compté comme du chrome —
**70 des 92 violations du gate (76 %), tous des faux positifs** noyant les 22 vraies cibles.
Nouvelle entrée `EXEMPT_PATHS` (préfixe serré `components/screen-wait-art`, raison motivée),
posée à côté de l'entrée `lib/mee/` dont elle est le prolongement ; le composant hôte
`screen-wait.tsx` reste du chrome scanné. Témoin : `check-design-harmony.test.ts` describe
« l'art d'attente baké » (RED→GREEN), 20→21. Gate **92 → 22 violations**, **9 → 8 fichiers**.
Housekeeping : 80w confirmée mergée (`DEFAULT_AUTHOR_ACCENT` sur `dev`) ; appariement
analyses↔plans 1:1 revérifié (45w→80w). Analyse : `docs/analyses/uiux/2026-11-08-iteration-81w.md`.

**80w** — cohérence / maintenabilité (classe harmonie, héritée 76w→79w) : l'indigo de
marque `#6366F1` était réécrit EN DUR sur TROIS surfaces web comme accent de repli de
`authorAccentColor()` — `routes/profile-sections.tsx` (`DECOR_ACCENT`),
`components/decor-preview.tsx` et `components/pack-sheet.tsx` (`FALLBACK_ACCENT`) —
trois jumelles divergeant en silence si la marque changeait. Source unique désormais :
`DEFAULT_AUTHOR_ACCENT` (`@meeshy/shared/utils/conversation-colors`, à côté de
`authorAccentColor` et de la palette dont elle est la première entrée indigo). Témoins :
`conversation-colors.test.ts` (parité palette, shared) + `decor-accent-single-source.test.ts`
(re-export + propreté au gate d'harmonie, web), RED→GREEN. Gate d'harmonie 94 → 91 (−3),
11 → 8 fichiers. Housekeeping : 79w confirmée mergée (`media.video.paused` sur `dev`) ;
appariement analyses↔plans 1:1 revérifié (45w→79w) ; sweep i18n texte figé média/overlay
épuisé. Analyse : `docs/analyses/uiux/2026-11-07-iteration-80w.md`.

**79w** — i18n / Prisme UI : la pastille d'état « En pause » de la visionneuse vidéo
(`components/viewer-video-page.tsx`) était écrite EN DUR en français — un texte VISIBLE
À L'ÉCRAN dans toutes les langues sauf le français, alors que le bouton central voisin
du même composant servait déjà `translate(language, 'media.video.pause')`. Site unique
désormais : la clé `media.video.paused` ×7 langues (voisine de `media.video.pause`) +
`translate` + marqueur `data-viewer-paused-badge` ; témoin `viewer-video-paused-i18n.test.tsx`
(RED→GREEN). Housekeeping : 78w confirmée mergée (#14198) ; appariement analyses↔plans
1:1 revérifié (45w→78w). Analyse : `docs/analyses/uiux/2026-11-02-iteration-79w.md`.

**78w** — a11y / i18n : les noms accessibles des pastilles de palier (`TierDots`,
`routes/progression-parts.tsx`) étaient écrits EN DUR en français — un lecteur d'écran
EN/ES/PT/DE/IT/AR entendait un `aria-label` mi-anglais mi-français (« Palier 50 atteint
— earned on september 3, 2026 »). Site unique désormais : `tierListLabel` /
`tierDotLabel` (`lib/view/progression.ts`) + 4 clés `game.progression.tier.*` (partie
`concept`) ×7 langues ; témoin `progression-tier-dots-i18n.test.tsx` (RED→GREEN) +
regex `FRENCH` durcie. Housekeeping : 77w confirmée mergée ; appariement analyses↔plans
1:1 revérifié. Analyse : `docs/analyses/uiux/2026-11-01-iteration-78w.md`.

**77w** — i18n / Prisme UI : la bande « Hors ligne » de la zone Progression (hub +
pages dédiées Badges/Défis/Succès) écrivait son texte EN DUR en français — la SEULE
bande hors-ligne non traduite du produit (le primitif partagé `OfflineNotice` prend
`children`, pas `language`). Site unique désormais : `ProgressionOfflineNotice({scope})`
(`progression-shell.tsx`) + 2 clés `game.page.offline_notice[_brief]` en partie `core`
×7 langues ; témoin `progression-offline-notice.test.tsx` (RED→GREEN). Housekeeping :
76w confirmée mergée. Analyse : `docs/analyses/uiux/2026-10-31-iteration-77w.md`.

**76w** — cohérence du thème : deux littéraux que le gate d'harmonie (#8879) prenait
pour du chrome n'en sont pas — le code QR du lien de parrainage
(`lib/game-photo/referral-qr.ts`, noir-sur-blanc lu par une caméra) et la luminance
d'un masque SVG (`components/game/author-plate.tsx`, blanc = visible / noir = masqué).
Marqués `harmony-exempt` motivés ; gate 96 → 92 ; témoin
`harmony-nonpaint-literals.test.ts`. Housekeeping : 14 analyses web legacy de juin
2026 annotées CLOS — LEGACY. Analyse : `docs/analyses/uiux/2026-10-25-iteration-76w.md`.

**75w** — cohérence du thème clair/sombre : la vignette « Signature » du sélecteur
d'apparence (`appearance-picker-sections.tsx`) DÉRIVE désormais des cotes canoniques
du fond (`backdropStyleVars()` + `withAccent`, dégradé partagé
`styles/appearance-picker.css`) au lieu d'un dégradé jumeau codé en dur qui restait
sombre en thème clair. 3 littéraux de couleur retirés, jumelle divergente supprimée.
Analyse : `docs/analyses/uiux/2026-10-24-iteration-75w.md`.

**74w** — i18n du flux de connexion par lien magique (`magic-link-{validation,
panel,flow}.tsx`) : 11 clés `magicLink.*` ×7 langues + câblage `translate` +
témoin `magic-link-i18n.test.tsx`. Analyse : `docs/analyses/uiux/2026-10-21-iteration-74w.md`.

## Note sur les analyses historiques 60w → 73w

Elles portaient sur le **legacy** Next.js (`apps/web` d'avant #7668, routes `app/`).
Ce code a quitté le dépôt le 2026-09-24. **Leurs pistes « différées 74w+ » pointent
du code supprimé et ne se rejouent pas.** La routine repart d'une revue fraîche de
l'`apps/web` actuel (Vite + Preact). Toutes sont annotées `CORRIGÉ` et closes pour
leur époque.

## Prochaine itération : **99w** — revue fraîche de l'`apps/web`

**Filons SOLDÉS : a11y/i18n `composeMessageLabel` (#20326), harmonie (#8879), ET
les cinq formateurs `m:ss` (#20605 badge vidéo, #20606 export + composer-tray).**
99w repart d'une **revue fraîche** de l'`apps/web` actuel (Vite + Preact), dans
l'esprit de la routine : épuration (dim. 12, « logique épurée »), optimisation
(performance/fluidité), cohérence de thème/positionnement, accessibilité, i18n
(texte visible ou lu encore en dur), navigation/gestes. Mesurer contre iOS
(`apps/ios` + MeeshySDK, **jamais modifiés**) pour la parité, jamais pour reviser iOS.

**Méthode confirmée par 96w→98w** : la revue fraîche la plus rentable est la chasse
aux JUMELLES DIVERGENTES (un concept réimplémenté en N sites qui dérivent). La
famille `m:ss` est épuisée (tout converge sur `formatMediaTime` / `floorMediaSeconds`,
socle `lib/view/seek-track.ts`). **Chercher d'autres familles de même forme** avant
de conclure à une surface propre :
- autres **formateurs recopiés** (tailles de fichier `o/Ko/Mo`, dates/heures relatives,
  pourcentages, comptes abrégés `1,2 k`) ;
- **résolveurs de couleur / d'accent** réimplémentés hors de `lib/accent` / `conversation-colors` ;
- **calculs d'état** (présence, lecture/non-lu, progression) recopiés côté client au lieu
  de dériver de la source servie.
Partir d'`grep` sur `Math.round(`, `toFixed(`, `Intl.NumberFormat`, et sur les littéraux
de couleur hors gate (`composer*`, hors périmètre #8879).

**Toujours REMESURER le gate d'harmonie #8879 à l'ouverture** (`node scripts/check-design-harmony.mjs`) :
0 après 91w→98w, mais il remonte dès que `dev` reçoit une poche de chrome neuve. S'il est
remonté, le vider reste prioritaire (une famille par tour) avant l'épuration.

**Écarté, ne pas reproposer** : le lead E2EE de l'écran Sécurité
(`settings-security.tsx`) est un repère règle 7 GOUVERNÉ (#17594), pas un défaut
d'épure. i18n des attributs/texte visible : propre (balayé 96w). a11y des boutons :
tous nommés. Gestes dismiss/show/back : `useBackDismiss` + `<dialog>` couvrent tout.
`talkie-header-law.ts:197` : réimplémente `m:ss` mais planche déjà — conforme.

**Écarté, ne pas reproposer** : le lead E2EE de l'écran Sécurité
(`settings-security.tsx`) est un repère règle 7 GOUVERNÉ (#17594), pas un défaut
d'épure. i18n des attributs/texte visible : propre (balayé 96w). a11y des boutons
(948 scannés) : tous nommés. Gestes dismiss/show/back : `useBackDismiss` +
`<dialog>` couvrent tout.

**Toujours REMESURER le gate d'harmonie #8879 à l'ouverture** : 0 après 91w→95w,
mais il remonte dès que `dev` reçoit une poche de chrome neuve (historique : 9/7 →
28/11 entre 83w et 84w ; 13/10 → 17/12 entre 84w et 85w ; 8/7 → 6/5 entre 86w et
87w ; 5/4 → 12/9 entre 88w et 89w ; **5/4 → 0 après 91w, stable 0 jusqu'à 95w**).
S'il est remonté, le vider reste prioritaire (une seule famille par tour) avant
l'épuration.
