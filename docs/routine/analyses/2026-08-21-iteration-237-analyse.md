# Iteration 237 — `removingHandle` retirait un `@handle` collé à un e-mail : frontière gauche manquante (drift du SSOT `NAME_BOUNDARY_LEFT`)

## Protocole (démarrage)
`main` @ `6b3fc59e` (dernier commit : `feat(android): live feed comment-count sync`). Branche
`claude/brave-archimedes-s2mzxg` alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3863 paquets), puis
`npx prisma generate --generator client` + `bun run build` dans `packages/shared`. Suite
`packages/shared/__tests__/utils/composer-references.test.ts` verte au départ (9 tests) ;
suites mention (`mention-parser` + `mention-extract`) vertes au départ (69 tests).

**Audit anti-doublon** (11 PRs ouvertes au départ, toutes de `jcnm` : #3261, #3259, #3257,
#3255, #3253, #3250, #3249, #3247, #3245, #3243, #3242). Aucune ne touche
`packages/shared/utils/composer-references.ts` ni `packages/shared/utils/mention-parser.ts` ni
`packages/MeeshySDK/Sources/MeeshyUI/Story/ComposerMentionQuery.swift` — zéro chevauchement de
fichier. Les grosses PRs feature (#3261 = 4325 lignes) sont laissées à la revue humaine : les
merger de façon autonome sortirait du périmètre sûr d'une itération de hardening.

## Sélection : **Priorité 1 — feature récente (composeur de références/mentions) portant une divergence de contrat**

Le module `mention-parser.ts` a été durci de façon répétée pour qu'un `@` précédé d'un
caractère de nom (adresse e-mail `contact@marie.com`) ne soit JAMAIS pris pour une mention. La
frontière gauche `NAME_BOUNDARY_LEFT` (`(?<![\p{L}\p{N}_-])`) y est **exportée explicitement**
« pour éviter tout drift » et appliquée aux trois chemins de détection (`parseMentions`
@DisplayName, `parseMentions` @username, `hasMentions`) ainsi qu'aux helpers de `types/mention.ts`.

`removingHandle` (`composer-references.ts`), qui RETIRE un `@handle` du texte lors de la
transition INLINE → note/silence, **n'appliquait aucune frontière gauche**. Il portait la
frontière droite (`(?![\p{L}\p{N}_.-])`, pour ne pas emporter `@alicia`) mais pas la gauche.
# Iteration 237 — `formatTimeRemaining` fuyait `"NaNm"`/`"Infinityh"` à l'écran sur un `expiresAt` absent (garde `Number.isFinite` manquante)

## Protocole (démarrage)
`main` @ `ea1c4263` (dernier commit : `test(web): le montage du test Prisme origin-locale devient
relatif…`). Branche `claude/brave-archimedes-l8w8oo` alignée sur `origin/main` (0 avance / 0 retard)
au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité : `bun install --ignore-scripts` (3861 paquets), puis
`npx prisma generate --generator client` dans `packages/shared`. Suite
`packages/shared/__tests__/utils/time-remaining.test.ts` verte au départ (6 tests).

**Audit anti-doublon** (10 PRs ouvertes au départ, toutes jcnm : #3242→#3258 — invariants
`endMs≥startMs`, `chunk()`, `MyMentionsQuerySchema`, primitives de rôle, Focal grouping, converter
v1→v3, iOS pickers/VoiceOver, Android lock). **Aucune PR ouverte ne touche
`packages/shared/utils/time-remaining.ts`** — zéro chevauchement de fichier. Cible non listée dans
les « améliorations futures » des itérations récentes : c'est une découverte de cette passe.

## Sélection : **Priorité 1 — durcissement de contrat sur une loi partagée récente (rendu client d'un compte à rebours)**

`formatTimeRemaining` (introduite iter 59) est la source UNIQUE du formatage « temps restant avant
expiration » consommée par trois sites web de production : `v2/StatusBar.tsx` (badge d'expiration de
statut), `v2/StoryViewer.tsx` (overlay story), `lib/story-transforms.ts`. C'est du code récent, à
une frontière de rendu où l'entrée vient d'un timestamp potentiellement absent — exactement la classe
« feature récemment développée » que la stratégie priorise.
# Iteration 237 — `normalizeLanguageForDedup` fuyait le tag région/script des codes irréductibles

## Protocole (démarrage)
`main` @ `f935f91b` (dernier commit : `Merge feat/ios-list-scroll-fluidity`). Branche
`claude/brave-archimedes-3hrs02` réalignée sur `origin/main` (0 avance / 0 retard au départ).

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript.
La suite **web (jest)** ne résout PAS `@meeshy/shared/*` dans ce sandbox : `next/jest` ne
régénère pas le `moduleNameMapper` depuis les `paths` tsconfig sous jest v30 + install bun
isolé (`jest.mock('@meeshy/shared/…')` lève « Cannot find module » avant tout test) — surface
testable réelle limitée à **shared (vitest)** et **gateway (bun)**, celles que les itérations
précédentes validaient déjà. Setup parité : `bun install --ignore-scripts` (ok), puis pour la
validation cross-package `npx prisma generate --generator client` + `bun run build` dans
`packages/shared`.

**Audit anti-doublon** (15 PRs ouvertes au départ, toutes de `jcnm`) : #3275 (formatFileSize),
#3270 (resolveRiverLaneAt), #3266 (SignalSchemas.iv), #3263 (RTCPeerConnection), #3262
(removingHandle), #3259 (formatTime expiresAt), #3257 (VoiceOver), #3255 (MyMentionsQuerySchema),
#3253 (chunk size<1), #3250 (iOS CTA), #3249 (role casefold), #3247 (Focal grouping), #3245
(convertisseur v1→v3 timing), **#3243 (source unique `endMs>=startMs` — le `timeRangeMsSchema`
que les itérations 234→236 réservaient aux « améliorations futures » est DÉJÀ en vol)**, #3242
(écoute continue endMs≤startMs). **Aucune PR ouverte ne touche
`packages/shared/utils/language-normalize.ts` ni son test.** Zéro chevauchement de fichier.

## Sélection : **Priorité 2 — feature modernisée dont un chemin du contrat porte encore un défaut**

Le candidat « future » récurrent (extraction `timeRangeMsSchema`) étant pris par #3243, et la
surface des micro-fix shared-util étant saturée par les PRs `jcnm` en vol, une revue fraîche des
utilitaires shared consommant de la donnée utilisateur a révélé une **fuite de déduplication**
dans `normalizeLanguageForDedup` — SSOT du couple « normalise-ou-replie » utilisé pour agréger et
dédupliquer des codes de langue verbatim.

## Current state (avant correctif)

```ts
export function removingHandle(username: string, text: string): string {
  const escaped = username.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&');
  const pattern = new RegExp(`\\s*@${escaped}(?![\\p{L}\\p{N}_.-])`, 'giu');
  return text.replace(pattern, '').trim();
}
```

Le `\s*@handle` sans lookbehind gauche matche `@alice` même quand une lettre le précède.
Jumeau Swift identique (`ComposerMentionQuery.removingHandle`, `pattern: "\\s*@\(escaped)(?![...])"`).

## Problems identified

1. **Suppression d'un span jamais détecté comme mention.** `parseMentions`/`hasMentions`
   n'identifient PAS `@alice` dans `bob@alice` (frontière gauche). Mais `removingHandle('alice', …)`
   le RETIRE — la suppression frappe un texte que la détection n'a jamais reconnu. Concrètement :
   `removingHandle('alice', 'écris à bob@alice stp')` renvoyait `écris à bob stp` (l'e-mail est
   amputé de `@alice`), alors qu'aucune mention n'existait dans cette phrase.
2. **Drift du SSOT `NAME_BOUNDARY_LEFT`.** Le module qui l'exporte proclame la frontière gauche
   « source de vérité unique pour TOUS les chemins de mention … pour éviter tout drift » ;
   `removingHandle` est un chemin de mention (il opère sur les mêmes `@handle`) qui ne la
   consommait pas. Détection et suppression divergeaient sur la définition d'« une mention ».
3. **Divergence détection ⇄ suppression, invisible au type.** Le contrat vécu par
   `parseMentions` (ce `@alice` n'est pas une mention) et par `removingHandle` (ce `@alice` est
   retirable) était contradictoire sans qu'aucun `tsc` ne le signale.

## Root causes
- La frontière droite a été jugée suffisante à l'écriture initiale de `removingHandle` (le souci
  cité était `@alice` vs `@alicia`, une collision par la DROITE). Le cas e-mail — collision par
  la GAUCHE — n'a pas été reporté depuis `mention-parser.ts`, alors même que ce module l'avait
  déjà résolu et exporté la brique réutilisable. Deux fonctions écrites séparément sur le même
  concept (« qu'est-ce qu'un `@handle` ? ») ont divergé faute d'héritage de la constante.

## Business impact
- **Corruption silencieuse de texte au composeur.** Une story/publication dont le texte contient
  un couple `user@host` (mention d'un contact whose pseudo est aussi un host token, ou simple
  `bob@alice` collé) voyait son fragment `@host` disparaître dès qu'on posait la référence
  homonyme en note/silence. Aucun message, aucune trace ; l'auteur perd un morceau de sa phrase.
  Fréquence faible (il faut que le token collé au `@` soit exactement le pseudo transitionné),
  mais dégât direct et non réversible sur le contenu que la personne est en train d'écrire.

## Technical impact
- **Comportement de suppression :** un `@handle` précédé d'un caractère de nom (lettre, chiffre,
  `_`, `-`) n'est plus retiré. Un `@handle` séparé (espace, ponctuation, début de texte) l'est
  toujours — les 9 tests existants restent verts (`Soirée avec @alice hier` → `Soirée avec hier`,
  `@alice` → ``, `bravo @Alice !` → `bravo !`, `@alice et @alicia` → `et @alicia`).
- **Placement du lookbehind :** `\s*(?<![\p{L}\p{N}_-])@handle`. Le lookbehind est à hauteur du
  `@` (après le `\s*`) : espace présente ⇒ le caractère testé est l'espace (frontière propre,
  match conservé) ; espace absente ⇒ c'est le caractère réellement collé au `@` (lettre d'e-mail
  ⇒ pas de match). Parité stricte avec les trois chemins de `parseMentions`.
- **Réutilisation du SSOT :** `removingHandle` importe désormais `NAME_BOUNDARY_LEFT` depuis
  `mention-parser.ts` — plus de copie locale, plus de drift possible.
- **`tsc` :** 0 nouvelle erreur ; build `dist/` OK (nouvel import interne au package résolu).
- **Coverage :** +2 tests (frontière gauche e-mail préservée ; frontière gauche propre toujours
  retirée), 11/11 verts.
- **Miroir Swift :** `ComposerMentionQuery.removingHandle` reçoit le même lookbehind
  `(?<![\p{L}\p{N}_-])` (ICU/NSRegularExpression le supporte). Non build-testable dans cet
  environnement (pas de toolchain Swift) — modification textuelle jumelle, tests XCTest existants
  (`ComposerMentionQueryTests`, `ReferenceDeclarableModesTests`) inchangés dans leur sémantique.

## Risk assessment
- **Régression fonctionnelle :** nulle attendue. Le seul comportement modifié est le NON-retrait
  d'un `@handle` collé à un caractère de nom — précisément le cas que la détection considérait
  déjà comme un non-mention. Aucun émetteur légitime ne dépend de l'ancien comportement (retirer
  un fragment d'e-mail était le bug).
- **Blast radius :** `removingHandle` n'est appelé qu'au composeur (transition INLINE → autre
  mode) côté web et iOS. Pas de chemin serveur.

## Proposed improvements (livrées)
1. Frontière gauche `NAME_BOUNDARY_LEFT` importée du SSOT et appliquée à `removingHandle` (TS).
2. Lookbehind jumeau dans le miroir Swift.
3. +2 tests de régression.

## Validation criteria
- `composer-references.test.ts` : 11/11.
- `mention-parser.test.ts` + `mention-extract.test.ts` : 69/69 (non régressés).
- `tsc --noEmit` + build `dist/` : verts.

## Améliorations futures (non retenues cette itération)
- Auditer les autres consommateurs de `@handle` (`ReferenceComposerEntries`, `StoryTextEditorView`
  côté iOS) pour vérifier qu'aucun ne réimplémente une extraction/suppression sans la frontière.
- Envisager une brique partagée `mentionSpanPattern(handle)` unique, consommée par détection ET
  suppression, pour rendre le drift structurellement impossible (au-delà du partage de la seule
  constante de frontière).
# Iteration 237 — `chunk(items, size)` trahissait son contrat documenté pour tout `size` fini < 1

## Protocole (démarrage)
`main` @ `3e64afaa` (dernier commit : `fix(ios): la fiche conversation collait un « s » latin
sur toutes les langues au chapeau « Membres » (#3241)`). Branche
`claude/brave-archimedes-oj0vgv` réalignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable = TypeScript
(web/shared/gateway). Setup parité CI : `bun install --ignore-scripts` (le postinstall `grpc-tools`
échoue derrière le proxy sortant, cf. CLAUDE.md), puis `cd packages/shared && npx prisma generate
--generator client && bun run build`.

**Audit anti-doublon** (8 PRs jcnm ouvertes au départ : #3242, #3243, #3245 — invariant temporel
`endMs >= startMs` ; #3251 — compteur de membres iOS ; #3249 — casse des primitives de rôle ;
#3247 — groupement de bulle Focal ; #3250/#3252 — CTA inscription iOS / brouillon effets Android).
Le présent constat ne touche AUCUN de ces domaines : il porte sur `packages/shared/utils/concurrency.ts`,
un module de découpage/ordonnancement pur, absent de toutes les PR en vol.

Baselines vertes au départ : `packages/shared` `tsc --noEmit` (0 erreur), `services/gateway`
`tsc --noEmit` (0 erreur), suite `concurrency.test.ts` (20 tests hors nouveau constat).

## Current state
`chunk<T>(items, size)` (`packages/shared/utils/concurrency.ts:80`) découpe une liste en tranches
de `size` éléments. Son docstring (ligne 77-78) énonce un contrat explicite :

> `size` non finie **ou < 1** produit une tranche unique.

L'implémentation :
```ts
const step = Number.isFinite(size) ? Math.max(1, Math.floor(size)) : items.length;
```

## Problems identified
Pour un `size` **fini et < 1** (`0`, négatif, ou fractionnaire comme `0.5`), `Number.isFinite(size)`
vaut `true`, donc `step = Math.max(1, Math.floor(size)) = 1`. Résultat : `chunk([1,2,3], 0)` rend
`[[1],[2],[3]]` (trois singletons) au lieu de la **tranche unique** `[[1,2,3]]` promise. Seul le
chemin non fini (`NaN`/`Infinity`) tombe correctement sur `items.length` (tranche unique). Le code
et son docstring divergent.

Le test existant (`__tests__/utils/concurrency.test.ts:180`) n'attrapait pas le drift : il
n'assertait que `result.flat()`, jamais la **structure** — `[[1],[2],[3]]` et `[[1,2,3]]` ont le
même `.flat()`, donc les deux passaient.

## Root causes
Le finite-branch clone accidentellement la logique de clamp-à-1 de son voisin `mapWithConcurrency`,
dont le docstring documente l'intention **opposée** pour une entrée absurde (« une valeur nulle,
négative ou non finie vaut 1 (séquentiel) », ligne 20-21). Deux fonctions du même fichier, deux
contrats distincts pour l'entrée absurde ; `chunk` a hérité du mauvais. Le **code** est fautif, pas
le docstring : le chemin non fini honore déjà « tranche unique ».

## Business impact
Latent aujourd'hui. Le seul appelant de production, `apps/web/hooks/composer/useAttachmentUpload.ts:329`
(`chunk(files, batchSize)`), passe `batchSize` = 10 par défaut (entier positif) et calcule
`start = batchIndex * batchSize` en supposant des tranches d'exactement `batchSize` éléments — il ne
déclenche jamais `size < 1`. Le gateway (`MessageProcessor.ts`) n'utilise que `mapWithConcurrency`,
pas `chunk`. Aucune régression utilisateur en vol.

## Technical impact
Dette de contrat : une SSOT de concurrence (partagée gateway + web, cf. docstring d'en-tête) dont le
comportement contredit sa propre documentation. Tout futur appelant lisant le docstring et passant
un `size` calculé pouvant descendre sous 1 (borne dynamique, `Math.floor` d'un ratio) recevrait un
fragment en singletons — l'inverse de « ne pas découper ». Le test vert masquait le défaut.

## Risk assessment
- **Fix : très faible.** Un seul opérateur ajouté (`&& size >= 1`). Comportement inchangé pour tout
  `size >= 1` (`Math.floor(size)` identique à `Math.max(1, Math.floor(size))` quand `size >= 1`) et
  pour tout `size` non fini (déjà `items.length`). Seul le finite-`< 1` bascule de singletons vers
  tranche unique — précisément le contrat documenté.
- **Rollback :** retirer `&& size >= 1` et restaurer l'assertion `.flat()` du test.

## Proposed improvements
1. **GREEN.** `const step = Number.isFinite(size) && size >= 1 ? Math.floor(size) : items.length;`
   — un `size` fini < 1 rejoint le chemin « tranche unique » des entrées non finies.
2. **Test durci.** Remplacer l'assertion `.flat()` par une assertion de **structure**
   (`toEqual([[1, 2, 3]])`), étendue à `0.5` (fractionnaire) et `Number.POSITIVE_INFINITY`, épinglant
   uniformément le contrat « toute taille absurde ⇒ une seule tranche ».

## Expected benefits
- Le code honore son docstring : zéro drift contrat/implémentation.
- Le voisin `mapWithConcurrency` (clamp-à-1) et `chunk` (tranche unique) ont chacun un contrat
  d'entrée-absurde explicite ET testé — plus de confusion entre les deux.
- Durcissement préventif : un futur appelant à borne dynamique est protégé.

## Implementation complexity
Triviale. 1 ligne de production, 1 bloc de test réécrit.

## Validation criteria
- [x] Baseline `concurrency.test.ts` verte au départ (20 tests).
- [x] RED prouvé : structure `[[1,2,3]]` échoue sur `0`, `-1`, `0.5` (3 fails), passe sur `NaN`/`Infinity`.
- [x] GREEN : `concurrency.test.ts` 23/23.
- [x] Suite `packages/shared` complète : 96 fichiers / 2330 tests verts.
- [x] `tsc --noEmit` (shared) : 0 erreur. `bun run build` (shared) : OK.
- [x] `tsc --noEmit` (gateway) : 0 erreur (baseline confirmée).
- [x] Appelants audités : `useAttachmentUpload.ts` (`chunk`, batchSize positif) et
      `MessageProcessor.ts` (`mapWithConcurrency` seul) inchangés.
export function formatTimeRemaining(targetMs: number, nowMs: number): string | null {
  const diffMs = targetMs - nowMs;
  if (diffMs <= 0) return null;
  const minutes = Math.floor(diffMs / 60_000);
  const hours = Math.floor(minutes / 60);
  if (hours >= 1) return `${hours}h${minutes % 60 > 0 ? `${minutes % 60}m` : ''}`;
  return `${Math.max(1, minutes)}m`;
}
```

Les trois appelants passent `new Date(x.expiresAt).getTime()` comme `targetMs`. Or :

- `new Date(undefined).getTime()` → **`NaN`** (champ `expiresAt` absent / payload partiel).
- `new Date('malformé').getTime()` → **`NaN`**.

Avec `targetMs = NaN` : `diffMs = NaN`, `NaN <= 0` est **`false`** (la garde de sortie ne se
déclenche PAS), `minutes = Math.floor(NaN) = NaN`, `hours >= 1` est `false`, la fonction retourne
`` `${Math.max(1, NaN)}m` `` = **`"NaNm"`**. Sur `targetMs = Infinity` → **`"Infinityh"`**.

Reproduction (avant correctif) :
```
formatTimeRemaining(new Date('nope').getTime(), now) => "NaNm"
formatTimeRemaining(Infinity, now)                    => "Infinityh"
```

## Problems identified

1. **Chaîne visible à l'écran (`"NaNm"` / `"Infinityh"`).** `StatusBar.tsx:40` fait
   `formatTimeRemaining(...) ?? 'Expire'` — mais comme la fonction retourne une CHAÎNE (non `null`),
   le repli `?? 'Expire'` est court-circuité et l'utilisateur voit littéralement `NaNm`. Idem sur
   l'overlay `StoryViewer` et `story-transforms`.
2. **Incohérence avec ses deux jumelles.** `formatClock` (`duration-format.ts`) ramène tout non-fini
   à `0` (`Number.isFinite ? … : 0`) ; `isExpired` (`apps/web/utils/time-remaining.ts`) documente
   « une date invalide (`NaN`) → `false` ». Seule `formatTimeRemaining`, la troisième loi du même
   domaine `expiresAt`, ne portait aucune garde de finitude.

## Root causes
- La garde de sortie `diffMs <= 0` a été pensée comme couvrant « le zéro et le passé », mais `NaN`
  n'est ni `<= 0` ni `> 0` : il traverse toute comparaison en `false`. L'arithmétique en aval
  propage alors le `NaN`/`Infinity` jusqu'au template littéral, sans jamais retomber sur le repli
  `null` prévu pour « pas de compte à rebours ».

## Business impact
- **Visible utilisateur.** Un statut ou une story dont le `expiresAt` est absent (payload partiel,
  entité sans expiration, réponse tronquée) affiche `NaNm` dans le badge d'expiration au lieu du
  repli propre `Expire` / rien — un artefact de développeur qui fuit en production.

## Technical impact
- Nul en runtime hors chemin d'entrée invalide. Le correctif est purement additif (une garde en
  tête), le type de retour `string | null` est inchangé, les 6 comportements existants intacts.

## Risk assessment
- **Très faible.** Un `if` en tête qui n'intercepte QUE les entrées non finies (aujourd'hui rendues
  en `"NaNm"`, un état déjà cassé). Aucun chemin fini n'est modifié. Rollback = revert d'un commit.

## Proposed improvements
- Ajouter `if (!Number.isFinite(targetMs) || !Number.isFinite(nowMs)) return null;` en tête de
  `formatTimeRemaining`, alignant la loi sur la garde `Number.isFinite` de `formatClock` et sur la
  sémantique « date invalide → pas de compte à rebours » de `isExpired`.

## Expected benefits
- Un `expiresAt` absent/malformé retombe silencieusement sur le repli des appelants (`Expire` pour
  `StatusBar`, rien pour `StoryViewer`/`story-transforms`) — jamais `"NaNm"`.
- Trois lois du domaine `expiresAt` désormais cohérentes sur le traitement du non-fini.

## Implementation complexity
- **Triviale.** 1 ligne de garde + doc, 1 test (4 assertions non finies). 2 fichiers.

## Validation criteria
- [x] RED prouvé : `formatTimeRemaining(NaN, NOW)` renvoyait `"NaNm"` (test rouge confirmé).
- [x] GREEN : `time-remaining.test.ts` 7/7 (6 existants + 1 non-fini à 4 assertions).
- [x] Suite shared vitest : **2329/2329** verts (96 fichiers) — aucune régression.
- [x] `tsc --noEmit` propre sur `packages/shared`.
- [x] `bun run build` (shared) propre.
- [ ] CI verte sur la branche (gate lint/bun réel).
# Iteration 237 — `formatFileSize` rendait « 512 undefined » / « NaN undefined » sur les entrées sous-octet, négatives ou non finies

## Protocole (démarrage)
`main` @ `ddffa665` (dernier commit : `Merge pull request #3272 from
isopen-io/claude/keen-hamilton-k0hlhu`). Branche `claude/brave-archimedes-1wk6ow`
alignée sur `origin/main` (0 avance / 0 retard) au départ.

Environnement : Linux, aucune toolchain Swift/Xcode/Android → surface testable =
TypeScript (web/shared/gateway). Setup parité : `bun install --ignore-scripts`
(3861 paquets), puis `npx prisma generate --generator client` + `bun run build`
dans `packages/shared`. Baseline vérifiée verte : `services/gateway`
`call-schemas.test.ts` (78/78), `packages/shared` suite complète (98 fichiers /
2358 tests) au départ.

**Audit anti-doublon** (16 PRs ouvertes au départ, toutes de `jcnm` — itérations
antérieures). Fichiers couverts par les PRs ouvertes : call-schemas /
transcription segments / invariant `endMs>=startMs` (#3242/#3243/#3245),
présence, contrats de canaux Socket.IO, primitives de rôle, `MyMentions`,
`chunk()`, formatage `expiresAt` « NaNm » (#3259), parsing `@handle` (#3262),
`encryptedMessage.iv` (#3266), `resolveRiverLaneAt` (#3270), web `VideoStream`
remove-participant (#3274), mode Focal, `createPeerConnection`, convertisseur
v1→v3. **Aucune PR ouverte ne touche `packages/shared/types/attachment.ts`**
(dernier commit dessus : `ecb1638b`, sans rapport) — zéro chevauchement de
fichier.

## Sélection : **Priorité 2 — helper SSOT déclaré dont un cas-limite d'entrée n'est pas gardé**

Sweep systématique de la surface TS (helpers purs de `packages/shared`, schémas
Zod du gateway, utils/hooks web) à la recherche d'un défaut de justesse net,
vérifiable, hors des 16 zones en vol. La surface est exceptionnellement
entretenue — presque chaque helper pur est une SSOT documentée avec un test
miroir et un garde d'entrée défensif. Le seul défaut de code non ambigu trouvé :
`formatFileSize`.

## Current state (avant correctif)

`formatFileSize` (`packages/shared/types/attachment.ts:794`) est déclarée
« Source unique de vérité pour la conversion octets → chaîne lisible
(B/KB/MB/GB/TB) dans tout le monorepo ». Forme avant correctif :

```ts
export function formatFileSize(bytes: number, options?: FormatFileSizeOptions): string {
  if (bytes === 0) return '0 B';
  const decimals = options?.decimals ?? 2;
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  const sizeIndex = Math.min(i, FILE_SIZE_UNITS.length - 1);   // borne HAUTE seulement
  return `${parseFloat((bytes / Math.pow(k, sizeIndex)).toFixed(decimals))} ${FILE_SIZE_UNITS[sizeIndex]}`;
}
```

`FILE_SIZE_UNITS = ['B','KB','MB','GB','TB']`. Le `Math.min(i, len-1)` plafonne
l'index par le haut (correctement : au-delà de 1024 TB, l'unité reste TB — testé)
mais **jamais par le bas**. Deux classes d'entrées cassent :

1. **Sous-octet positif** (`0 < bytes < 1`). `Math.log(0.5)/Math.log(1024) ≈
   -0.099` → `i = Math.floor(...) = -1` → `sizeIndex = min(-1, 4) = -1`.
   `FILE_SIZE_UNITS[-1] === undefined` et `Math.pow(1024, -1) = 1/1024` GONFLE la
   valeur : `0.5 / (1/1024) = 512`. Résultat : **`"512 undefined"`**.

2. **Négatif / non fini** (`bytes < 0`, `NaN`, `±Infinity`). `Math.log` d'un
   négatif ou de `NaN` vaut `NaN` → `i = NaN` → `sizeIndex = min(NaN, 4) = NaN` →
   `FILE_SIZE_UNITS[NaN] === undefined`, `bytes / Math.pow(k, NaN) = NaN`.
   Résultat : **`"NaN undefined"`**.

Seul `bytes === 0` était gardé.

## Problems identified
- La chaîne littérale `"512 undefined"` / `"NaN undefined"` peut s'afficher
  telle quelle à l'écran (le mot anglais `undefined` visible dans une UI FR).
- Une SSOT dont un pan de son domaine d'entrée n'est pas défini n'est pas une
  vraie source de vérité : chaque appelant devrait se demander s'il doit
  pré-garder, exactement la duplication que la SSOT existe pour supprimer.

## Root causes
Le clamp d'index n'a jamais borné le bas de la plage (`Math.max(i, 0)` absent) et
aucun garde ne rejetait les entrées hors domaine (`< 0`, non finies), alors que
le formatteur JUMEAU `formatClock` (`packages/shared/utils/duration-format.ts`)
documente et applique déjà exactement ce contrat : *« Les entrées négatives ou
non finies sont ramenées à zéro »* (`Number.isFinite(totalSeconds) ?
Math.max(0, totalSeconds) : 0`). Divergence de robustesse entre deux formatteurs
sœurs du même package.

## Business impact
**Faible aujourd'hui, latent.** Traçage des 30+ appelants (`grep formatFileSize(`
sur `apps/web` + `services`) : tous passent un décompte d'octets ENTIER réel
(`attachment.fileSize`, `file.size`, `audioBlob.size`), et `0` est court-circuité
en amont. Aucun chemin utilisateur ne produit `0 < bytes < 1` ni un négatif
aujourd'hui. Le défaut est un durcissement de SSOT, pas un symptôme live — mais
une future source d'octets fractionnaires (débit moyen, estimation, delta) ou une
valeur corrompue afficherait `undefined` sans filet.

## Technical impact
Correction purement locale (une fonction, 2 lignes de logique), zéro changement
d'API, zéro impact sur les 30+ sites d'appel (mêmes sorties pour toute entrée
entière ≥ 1 et pour `0`). Aligne la robustesse sur le formatteur jumeau
`formatClock`.

## Risk assessment
**Très faible.** Aucune signature modifiée. Les 13 assertions existantes de
`formatFileSize` (0, 1, 512, 1023, 1024, 1536, 1 Mo…1024 To, décimales) restent
vertes à l'identique. Le garde `bytes <= 0` préserve `formatFileSize(0) === '0 B'`
(0 ≤ 0). Couverture globale `packages/shared` inchangée au-dessus des seuils.

## Proposed improvements (implémenté)
1. Garde d'entrée en tête : `if (!Number.isFinite(bytes) || bytes <= 0) return
   '0 B';` — remplace le `bytes === 0` seul, absorbe 0/négatif/non-fini.
2. Clamp d'index BAS + haut : `Math.min(Math.max(i, 0), FILE_SIZE_UNITS.length - 1)`.

## Expected benefits
- Plus jamais de littéral `undefined`/`NaN` rendu à l'écran depuis cette SSOT.
- Contrat de robustesse homogène entre `formatFileSize` et `formatClock`.

## Implementation complexity
Triviale — 2 lignes de logique + 2 cas de test (TDD RED→GREEN vérifié).

## Validation criteria
- RED confirmé : `formatFileSize(0.5)` → `"512 undefined"`, `formatFileSize(-1)`
  → `"NaN undefined"` avant correctif.
- GREEN : `formatFileSize(0.5) === '0.5 B'`, `formatFileSize(0.001) === '0 B'`,
  `formatFileSize(-1|-1024|NaN|±Infinity) === '0 B'`.
- `packages/shared` suite complète verte (98 fichiers / 2360 tests après ajout).
- `bun run build` (tsc) vert ; `vitest run --coverage` au-dessus des seuils
  (branches 95.23 ≥ 94, functions 98.59 ≥ 93, lines 99.19 ≥ 98, statements
  98.76 ≥ 98).

## Améliorations futures (hors périmètre)
- **Parité `formatFileSizeI18n`** (`utils/notification-strings.ts:585`) : divergence
  DÉLIBÉRÉE de règles (tiers compacts localisés, décimales KB à 0) — documentée,
  PAS un bug. À NE PAS toucher sauf décision produit d'unifier.
- **`playbackStretch` Zod** (`services/gateway/src/validation/messages-schemas.ts:33`)
  sans invariant `endMs > startMs` — sans impact (le consommateur
  `playback-trace.ts::isUsable()` le garde déjà) ET famille `endMs>=startMs` sur
  liste d'évitement (PRs #3242/#3243 en vol). À NE PAS reprendre.
- Candidats des itérations 233→236 non retenus (inchangés) : markdown attachments
  vers le viewer texte (arbitrage produit) ; dépouillement des 24 fabriques
  `jest.mock('@meeshy/shared', …)` mortes ; `timeRangeMsSchema` partagé (couvert
  par PR #3243 en vol).
export function normalizeLanguageForDedup(code: string): string {
  return normalizeLanguageCode(code) ?? code.toLowerCase();
}
```

Le repli `code.toLowerCase()` conserve la chaîne ENTIÈRE — tags région/script inclus — dès que
`normalizeLanguageCode` retourne `undefined`, c'est-à-dire pour tout code irréductible inconnu.

- `'en-US'` → `normalizeLanguageCode` réduit à `'en'` (région strippée) ✅
- `'xyz'`  → repli `'xyz'` (irréductible, pas de région) ✅
- `'xyz-AB'` → repli **`'xyz-ab'`** ❌ (tag région conservé)
- `'yue-HK'` (Cantonais, hors catalogue) → repli **`'yue-hk'`** ❌

## Problems identified

1. **Contrat de dedup incohérent.** La docstring promet « collapses casing **and region tags**
   to one canonical dedup key ». Cette garantie ne tenait QUE pour les codes que
   `normalizeLanguageCode` sait réduire. Un code irréductible tagué région échappait au strip.
2. **Fuite de comptage dans deux consommateurs.**
   - `services/gateway/src/routes/anonymous.ts` — agrégat `spokenLanguages` : `'yue'` et
     `'yue-HK'` déclarés par deux participants comptent pour DEUX langues parlées distinctes.
   - `packages/shared/utils/conversation-helpers.ts` — dedup des préférences de langue in-app :
     une préférence héritée `'yue-HK'` ne collapse pas avec `'yue'`.
   C'est exactement la fuite que le cas `'en'`/`'en-US'` interdit, appliquée aux codes hors
   catalogue (Cantonais et autres langues réelles non encore ajoutées à `languages.ts`).

## Root causes
- Le repli a été écrit comme un simple `.toLowerCase()` défensif « ne jamais perdre la donnée ».
  Correct sur l'axe « ne pas dropper », mais il omet le second axe du contrat de dedup :
  « région-aveugle ». Les codes réductibles masquaient le trou (leur strip venait de
  `normalizeLanguageCode`, pas du repli), si bien que le seul test d'irréductible existant
  (`'xyz'`) ne portait pas de tag région et ne révélait rien.

## Business impact
- **Faible mais réel et croissant.** Aujourd'hui la plupart des locales fréquentes sont dans le
  catalogue et donc réductibles. La fuite ne se manifeste que pour les langues hors catalogue
  taguées région (Cantonais `yue-*`, et toute langue future avant son ajout). Impact : compteurs
  et listes de langues légèrement sur-comptés, badges « langues parlées » dupliqués. Aucun crash,
  aucune corruption — un défaut de justesse d'agrégation.

## Technical impact
- **Aucun changement pour les codes réductibles** (chemin `normalizeLanguageCode`, inchangé) ni
  pour les irréductibles sans région (`'xyz'` reste `'xyz'`). Seul le repli des irréductibles
  TAGUÉS région change (`'xyz-AB'` → `'xyz'`).
- **Garde « ne jamais perdre la donnée » préservée** : quand le sous-tag primaire est vide
  (`'-US'`) ou non-alphabétique (`'@@@'`), le repli retombe sur la chaîne entière lowercased,
  jamais sur `''`.
- **`normalizeLanguageCode` non touché** → la parité Swift (`language-normalize-swift-parity.test.ts`)
  est intacte (le helper de dedup est TS-only, sans miroir Swift).
- **Types inchangés.**

## Risk assessment
- **Négligeable.** Recherche exhaustive : aucun test (shared ou gateway) n'assertait le
  comportement région-fuyant d'un code IRRÉDUCTIBLE (les assertions `'zh-Hant-HK' → 'zh'`
  existantes portent sur un code RÉDUCTIBLE, hors du chemin modifié). Les deux consommateurs
  ne gagnent qu'un dedup plus correct.
- **Rollback :** revert du commit unique (2 fichiers).

## Proposed improvements
1. **RED** : 2 nouveaux tests dans `packages/shared/__tests__/language-normalize.test.ts` —
   (a) `strips region/script tags from irreducible unknown codes too` (`'xyz-AB'`, `'xyz_CD'`,
   `'yue-HK'`, `'YUE-Hant-HK'`) → primaire nu ; (b) `never drops a datum when the primary subtag
   is empty or malformed` (`'-US'`, `'@@@'`, `''`) → chaîne entière préservée (garde de
   non-régression, verte avant fix).
2. **GREEN** : le repli extrait le sous-tag primaire (`code.trim().split(/[-_]/)[0]?.toLowerCase()`)
   quand `normalizeLanguageCode` retourne `undefined`, avec retour à la chaîne entière si le
   primaire est vide. Docstring mise à jour (cas `'yue-HK'` documenté + garde).

## Expected benefits
- Contrat de dedup **cohérent sur TOUS les codes** (réductibles ET irréductibles) : région-aveugle
  partout, gelé par test.
- Compteurs `spokenLanguages` et dedup de préférences corrects pour les langues hors catalogue.

## Implementation complexity
- **Triviale.** 1 fichier de production (repli + docstring), 1 fichier de test (+2 cas).

## Validation criteria
- [x] RED prouvé (`'xyz-AB'` attendait `'xyz'`, recevait `'xyz-ab'`).
- [x] GREEN : `language-normalize.test.ts` + parité Swift → 29/29.
- [x] Suite shared vitest complète : **2358/2358** (98 fichiers).
- [x] `tsc --noEmit` (shared) : 0 erreur.
- [x] Consommateurs gateway (`anonymous`, `links-admin`, `links/types`, `viewed-languages`) sous
      bun après `bun run build` shared : **215/215** (14 suites).
- [ ] CI verte sur la PR.

## Améliorations futures (hors périmètre)
- **Dépouillement des 24 fabriques `jest.mock('@meeshy/shared/…')` mortes** (doc `apps/web/CLAUDE.md`) :
  toutes des mocks de SOUS-CHEMIN (aucune racine `@meeshy/shared`), donc inertes ; certaines
  recopient un contrat partagé (catalogue de langues, socketio-events, email-validator) qui dérive
  en silence. Cleanup réel mais **non validable dans ce sandbox** : la suite web (jest) n'y résout
  pas `@meeshy/shared/*`. À reprendre dans un contexte web-ready.
- **Miroir Swift du dedup région-aveugle** : si un jour iOS agrège des `spokenLanguages` verbatim,
  il devra strip la région des codes irréductibles de la même façon.
