# Vitrine App Store — lot 2 (les conversations : vocal traduit, Prisme dans le groupe, Imagine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** capturer trois VRAIS écrans de conversation — le vocal du partenaire joué dans la langue du lecteur (Bulles), « Pizza Night » lu dans la langue du lecteur avec un message rouvert sur son original (Script), l'atelier Imagine sur un message du couple —, lier le signal « prêt » au rendu de chaque scène (#8921) et remplir le fil de l'iPad (#8922).

**Architecture:** le kit exporte des fixtures v2 : conversation du couple avec photos et vocal traduit, « Pizza Night », posts du fil, manifeste des médias, destination de chaque scène. Le script de capture synthétise les vocaux (`say`), mesure leur durée, puis dépose médias et fixtures dans le conteneur de l'app. L'app range médias et fil AVANT la restauration de la session (les racines les lisent dès leur montage), le reste après. Les écrans annoncent leur rendu à un relais DEBUG (`VitrineRendu`) ; la scène l'attend, fait le geste du lecteur (lancer le vocal, rouvrir l'original, ouvrir Imagine), puis dépose « prêt ».

**Tech Stack:** Swift / SwiftUI (SDK iOS 26), XCTest, GRDB ; Node 22 ESM + `bun test` ; Playwright Chromium ; `xcrun simctl` ; `say`, `afconvert`, `afinfo` (macOS).

**Spec:** `docs/superpowers/specs/2026-09-30-vitrine-app-store-design.md` (issue #8855) ; suivis #8921 (« prêt » lié au rendu) et #8922 (le fil de l'iPad). Le lot 1 (`docs/superpowers/plans/2026-09-30-vitrine-lot-1-socle.md`) a posé le socle que ce plan étend.

## Global Constraints

- Tout le code du mode vitrine vit sous `apps/ios/Meeshy/Features/Vitrine/`, chaque fichier entièrement entre `#if DEBUG` et `#endif`. Ailleurs, seulement des blocs `#if DEBUG`, dans les fichiers que liste `VitrineSourceGuardTests` : `MeeshyApp.swift`, `SyncPill.swift`, `ConversationViewModel.swift`, `ProgressionView.swift`, `FeedPostCard.swift`, `MessageCardExportSheet.swift` ; côté SDK `ShareLinkService.swift`, `ConversationSyncEngine+Vitrine.swift`, `MeeshyConfig.swift`, `JoinFlowViewModel.swift`.
- La vitrine ne parle JAMAIS à staging ni à la production : l'origine est `http://127.0.0.1:9` ou `http://localhost:9`, sinon l'app s'arrête (`VitrineSession.verifierIsolement`). Face à cet hôte, `MeeshyConfig.resolveMediaURL` ne résout rien (`127.x` est privé) : la clé de cache d'un média est son URL relative, et aucun média ne part vers le réseau.
- **Isolement Swift.** La cible `Meeshy` compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`, la cible `MeeshyTests` avec `nonisolated`. Types purs de la vitrine : `nonisolated` ; ce qui écrit, navigue ou relaie les rendus : `@MainActor`. Une classe de test qui les appelle est `@MainActor` ; une classe de test du SDK qui surcharge `tearDown` reste `nonisolated` et marque ses méthodes `@MainActor`.
- **Aucun nouvel écrivain EN BLOC du cache « list »** (`ConversationListCacheWriterGuardTests`) : la liste passe par `saveSorted` (`ConversationSyncEngine.debugVitrineSaveList`).
- **Budget de taille** : 1 200 lignes par fichier. `ConversationView.swift`, `MessageListViewController.swift`, `FeedView.swift`, `FeedViewModel.swift` et `RootView.swift` ne prennent AUCUNE ligne nette : ce plan n'y touche pas. Mesurés avant ce lot : `MeeshyApp.swift` 1 176, `FeedPostCard.swift` 1 163, `ConversationViewModel.swift` 1 158.
- Formats : iPhone 6,9" 1320×2868 ; iPad 13" 2064×2752 portrait ; PNG RVB sans alpha.
- Langues du kit : `fr`, `en`, `es`, `de`, `it`, `pt` (App Store `pt-BR`), `ar` (de droite à gauche). Ce lot capture le français, plus la Progression de l'iPad dans les sept langues (#8922) ; les fixtures couvrent les sept.
- Contenu : une seule source, `scripts/marketing-kit/textes/*.mjs`. Personnes fictives, avatars en initiales. Photos : celles du kit (`scripts/marketing-kit/photos/`, Pexels, sans personne).
- Hors champ : ✦ et « Analyse IA », la feuille « Signal », **tout cadenas de chiffrement** (la traduction serveur est coupée en E2EE — `docs/marketing/app-store-fiche-2026-08.md` § 6), un prix ; au plus 25 non-lus par conversation.
- Simulateurs : seulement « Meeshy Vitrine iPhone » et « Meeshy Vitrine iPad » (iOS 26.1). Jamais `simctl shutdown all`, jamais le simulateur d'une autre session.
- Builds et tests lourds en série, un à la fois. DerivedData hors du dépôt : `/Users/smpceo/Documents/Build-vitrine` (et `-sdk` pour le paquet).
- Travail dans le worktree `/Users/smpceo/Documents/v2_meeshy-vitrine`, branche `feat/vitrine-lot-2` partie de `origin/dev` une fois le lot 1 fusionné (Tâche 1, étape 0) ; jamais de `git checkout` dans le dépôt principal `/Users/smpceo/Documents/v2_meeshy`.
- Commits : message en français, `(Refs #8855)` et le numéro du suivi qu'ils servent (#8921, #8922), **aucune ligne `Co-Authored-By` ni attribution**, pas plus dans la PR. Le `project.pbxproj` (régénéré par `meeshy.sh` quand un fichier Swift apparaît) part dans le commit qui ajoute ses fichiers.
- Commandes de test : kit `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test <fichier>` ; iOS `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh <Classe>…` ; SDK `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh <Classe ou Cible/Classe>…`.

## Review Focus

1. **Une scène photographiée avant que son geste ait pris** — vocal pas encore lancé (karaoké éteint), carte Imagine encore grise, fil de l'iPad en erreur. « prêt » attend un état OBSERVABLE : la conversation a des bulles visibles, le vocal a passé 1 s de lecture, la carte est peinte médias compris, une carte du fil est apparue. Témoins : `VitrineRenduTests` (Tâches 5 et 7), capture de la Tâche 9.
2. **Un média désigné mais non livré** : l'app irait le chercher sur l'hôte mort et l'écran montrerait une vignette vide. Chaque URL portée par un message, une piste ou un post figure au manifeste, et l'app refuse de démarrer si un fichier manque. Témoins : kit (Tâche 3), `VitrineSeederTests.test_remplirLesCaches_missingMedia_failsNamingIt` (Tâche 4).
3. **Un cadenas sur une conversation traduite** : `toConversation` pose `e2ee` sur toute conversation directe. La vitrine sert ses conversations sans mode de chiffrement. Témoins : `VitrineFixturesTests.test_conversationsServies_carryNoEncryptionLock` (Tâche 3), `VitrineSeederTests.test_remplir_noConversationCarriesAnEncryptionLock` (Tâche 4).
4. **Un lecteur membre de « Pizza Night »** (Giulia en italien, Lucas en portugais, Jonas en allemand) : le message rouvert sur l'original doit venir d'un AUTRE membre, dans une AUTRE langue. Témoin : kit, sur les sept langues (Tâche 3).
5. **Le fil de l'iPad lu avant d'être rangé** : `FeedView` se monte dès la restauration de la session et lit « main-feed » une seule fois. Le fil est rangé avant cette restauration, et la Progression de l'iPad exige une carte du fil peinte. Témoins : `VitrineRenduTests.test_rendusAttendus_progressionOnIPad_alsoWaitsForTheFeed` (Tâche 5), capture iPad dans les sept langues (Tâche 9).

## Écarts avec la spec, et pourquoi

- **Scène 9 : Imagine part du message `amour.vue`** (la photo de la ville du partenaire et « La vue ce soir… il ne manque que toi ❤️ »). « Loin des yeux… » est la légende L11, pas un message : la scène montre ce que fait l'app d'un vrai message, photo comprise.
- **Aucun cadenas dans la vitrine** : les conversations sont servies sans `encryptionMode`, y compris les conversations directes que `toConversation` passe par défaut en `e2ee` (spec § 2, hors champ ; claims § 6 de la fiche).
- **Les deux conversations que les scènes ouvrent n'ont aucun non-lu** (plus de séparateur « nouveaux messages » à l'image) : « Pizza Night » passe de 9 à 0, le couple de 1 à 0. Les autres lignes gardent leurs pastilles.
- **« prêt » = rendu observé + 800 ms de pose** (le temps d'un ressort), puis les 1,5 s du script de capture. Plus aucune minuterie comptée depuis la navigation (#8921).
- **Le fil et les médias se rangent AVANT la restauration de la session**, juste après `CacheCoordinator.shared.start()` : le cache est déjà lié au compte du lecteur (`activeUserId` relit le trousseau que `VitrineSession.poser` vient d'écrire), et `FeedView` lit « main-feed » dès son montage (#8922).
- **L'ordre du storyboard** (spec § 3) s'applique désormais au jeu de captures : amour, groupe, Global, lien, Progression, Imagine. Le lot 1 mettait la Progression avant le lien.
- **Les vocaux sont synthétisés par les voix de macOS** (`say`), pas par Chatterbox : une capture ne fait pas entendre le son. La forme d'onde, la durée et le karaoké sont ceux de vraies pistes mesurées.

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `scripts/marketing-kit/textes/amour.mjs` (modifié) | le vocal que reçoit le lecteur (`vocalRecu`) |
| `scripts/marketing-kit/textes/legendes.mjs` (modifié) | la légende d'Imagine (`L13`) |
| `scripts/marketing-kit/vitrine/medias.mjs` | photos mesurées, vocaux synthétisés, découpage du karaoké |
| `scripts/marketing-kit/vitrine/fixtures.mjs` (modifié) | fixtures v2 : couple, « Pizza Night », fil, médias, destinations |
| `scripts/marketing-kit/vitrine/capturer.mjs` (modifié) | synthétise et mesure les vocaux, dépose médias et fixtures |
| `scripts/marketing-kit/vitrine/tests-sdk.sh` (modifié) | accepte `Cible/Classe` (témoins de `MeeshyUITests`) |
| `scripts/marketing-kit/templates/vitrine/plan.mjs` (modifié) | les six scènes, dans l'ordre du storyboard |
| `apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift` (modifié) | contrat v2 : médias, posts, destinations, conversations servies |
| `apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift` (modifié) | médias et fil avant la session ; liste sans cadenas |
| `apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift` | ce que les écrans annoncent, ce que chaque scène attend |
| `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift` (modifié) | ouvrir, attendre le rendu, faire le geste, annoncer « prêt » |
| `apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift` (modifié) | trois scènes de plus, dossier des médias |
| `apps/ios/Meeshy/Features/Main/Export/MessageCardExportMenu.swift` (modifié) | la demande Imagine d'un message : site unique de la conversation et de la vitrine |
| `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageExport.swift` (modifié) | appelle ce site unique |
| `apps/ios/Meeshy/MeeshyApp.swift`, `ConversationViewModel.swift`, `ProgressionView.swift`, `FeedPostCard.swift`, `MessageCardExportSheet.swift` (modifiés) | crochets `#if DEBUG` |
| `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift` (modifié) | porte DEBUG : l'aperçu du lien est servi |
| `apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift` | témoins du signal « prêt » |
| `packages/MeeshySDK/Tests/MeeshyUITests/JoinFlowViewModelVitrineTests.swift` | témoin de la porte du lien |
| `apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json` (régénéré) | échantillon v2 exporté par le kit |

---

### Task 1: Le contenu du lot 2 dans le kit

**Files:**
- Modify: `scripts/marketing-kit/textes/amour.mjs`
- Modify: `scripts/marketing-kit/textes/legendes.mjs`
- Test: `scripts/marketing-kit/test/textes.test.mjs`

**Interfaces:**
- Produces: `AMOUR.vocalRecu` (forme de `replique` : `{ id: 'amour.vocal.recu', ko: { id, lang: 'ko', text, translations }, ja: {…} }`, les `translations` dans les sept langues du kit), rangé dans `AMOUR.repliques` ; `LEGENDES.L13` dans les sept langues.

- [ ] **Step 0: La branche et le pilotage**

Une fois le lot 1 fusionné dans dev :

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git fetch origin dev
git checkout -b feat/vitrine-lot-2 origin/dev
git add docs/superpowers/plans/2026-09-30-vitrine-lot-2-conversations.md
git commit -m "docs(vitrine): plan du lot 2 — vocal traduit, Prisme dans le groupe, Imagine (Refs #8855)"
git push -u origin feat/vitrine-lot-2
```

Poser `Status = In Progress` sur #8921 et #8922 dans le projet « Meeshy — pilotage » :

```bash
gh project field-list 1 --owner isopen-io --format json --jq '.fields[] | select(.name=="Status") | {id, options}'
gh issue view 8921 -R isopen-io/meeshy --json projectItems --jq '.projectItems'
gh issue view 8922 -R isopen-io/meeshy --json projectItems --jq '.projectItems'
```

Puis, avec les identifiants que rendent ces trois commandes (projet, élément, champ, option « In Progress ») : `gh project item-edit --project-id … --id … --field-id … --single-select-option-id …`, une fois par issue.

- [ ] **Step 1: Write the failing test**

Dans `scripts/marketing-kit/test/textes.test.mjs`, ajouter l'import et remplacer le premier test des légendes :

```js
import { AMOUR } from '../textes/amour.mjs'
```

```js
  test('treize légendes, chacune dans les sept langues du kit', () => {
    expect(Object.keys(LEGENDES)).toEqual(['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11', 'L12', 'L13'])
    for (const legende of Object.values(LEGENDES)) {
      expect(Object.keys(legende).sort()).toEqual([...KIT_LANGS].sort())
    }
  })
```

Et, en fin de fichier :

```js
describe('vitrine #8855, lot 2 — le vocal reçu et la légende d’Imagine', () => {
  test('le vocal que reçoit le lecteur existe dans les deux langues du partenaire, traduit dans les sept', () => {
    expect(AMOUR.repliques).toContain(AMOUR.vocalRecu)
    for (const lang of ['ko', 'ja']) {
      expect(AMOUR.vocalRecu[lang].lang).toBe(lang)
      expect(Object.keys(AMOUR.vocalRecu[lang].translations).sort()).toEqual([...KIT_LANGS].sort())
    }
  })

  test('Imagine a sa légende', () => {
    expect(LEGENDES.L13.fr).toBe('Un message. Une image. Sa langue.')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/textes.test.mjs`
Expected: FAIL — les clés s'arrêtent à `L12`, `AMOUR.vocalRecu` est `undefined`.

- [ ] **Step 3: Write minimal implementation**

Dans `scripts/marketing-kit/textes/amour.mjs`, après la réplique `appel` :

```js
// Le vocal que le partenaire envoie au lecteur (vitrine #8855, scène 1) : joué dans la langue du
// lecteur, sa transcription défile. Sans marque de genre, comme les autres répliques.
const vocalRecu = replique('amour.vocal.recu', { ko: '하루 종일 네 목소리가 듣고 싶었어. 12일 뒤에 공항에서 기다릴게.', ja: '一日中、君の声が聞きたかった。12日後、空港で待ってるね。' }, {
  fr: 'Toute la journée, j’avais envie d’entendre ta voix. Dans 12 jours, je t’attends à l’aéroport.',
  en: 'All day long, I wanted to hear your voice. In 12 days, I’ll be waiting for you at the airport.',
  es: 'Todo el día quise oír tu voz. En 12 días te espero en el aeropuerto.',
  de: 'Den ganzen Tag wollte ich deine Stimme hören. In 12 Tagen warte ich am Flughafen auf dich.',
  it: 'Tutto il giorno ho voluto sentire la tua voce. Tra 12 giorni ti aspetto all’aeroporto.',
  pt: 'O dia todo eu quis ouvir a sua voz. Daqui a 12 dias te espero no aeroporto.',
  ar: 'طوال اليوم أردت أن أسمع صوتك. بعد 12 يومًا سأنتظرك في المطار.',
})
```

Et dans l'export `AMOUR` :

```js
export const AMOUR = {
  repliques: [pense, vue, jours, vocalReaction, grandJour, minutes, table, appel, vocalRecu],
  pense,
  vue,
  jours,
  vocalReaction,
  grandJour,
  minutes,
  table,
  appel,
  vocalRecu,
  miens,
```

(le reste de l'objet — `vocal`, `photos` — est inchangé).

Dans `scripts/marketing-kit/textes/legendes.mjs`, après `L12` :

```js
  // #8855 — Imagine : un message devient une image, lue dans la langue de qui la reçoit.
  L13: {
    fr: 'Un message. Une image. Sa langue.',
    en: 'One message. One image. Their language.',
    es: 'Un mensaje. Una imagen. Su idioma.',
    de: 'Eine Nachricht. Ein Bild. Ihre Sprache.',
    it: 'Un messaggio. Una foto. La loro lingua.',
    pt: 'Mensagem vira imagem. Na língua deles.',
    ar: 'رسالة واحدة. صورة واحدة. بلغتهم.',
  },
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/textes.test.mjs test/scenes-reelles.test.mjs test/prism.test.mjs`
Expected: PASS — y compris « aucune légende ne dépasse 40 caractères », les claims interdits sur tout texte du kit, et « chaque texte montré porte une traduction pour chacune des sept langues ».

- [ ] **Step 5: Commit**

```bash
git add scripts/marketing-kit/textes/amour.mjs scripts/marketing-kit/textes/legendes.mjs scripts/marketing-kit/test/textes.test.mjs
git commit -m "feat(kit): le vocal que reçoit le lecteur et la légende d'Imagine (Refs #8855)"
```

---

### Task 2: Les médias de la vitrine — photos mesurées, vocaux synthétisés, karaoké

**Files:**
- Create: `scripts/marketing-kit/vitrine/medias.mjs`
- Test: `scripts/marketing-kit/test/vitrine-medias.test.mjs`

**Interfaces:**
- Produces: `RACINE_MEDIAS` (`'/api/v1/attachments/file/vitrine'`), `DOSSIER_PHOTOS`, `CACHE_VOIX`, `urlMedia(fichier) → string`, `dimensionsJpeg(Buffer) → { width, height }`, `photoMedia(nom) → { url, fichier, genre: 'image', photo, taille, width, height }`, `vocalMedia({ cle, texte, lang }) → { url, fichier, genre: 'audio', texte, lang }`, `segmenter(texte, dureeMs) → [{ text, startMs, endMs }]`, `lireVoix(sortieDeSay) → [{ nom, locale }]`, `choisirVoix(lang, voix) → nom`, `dureeDepuisAfinfo(sortie) → ms`, `fichierVoix({ texte, lang }) → chemin .m4a`, `synthetiser(media, voix) → { dureeMs, taille }`.

- [ ] **Step 1: Write the failing test**

```js
// scripts/marketing-kit/test/vitrine-medias.test.mjs
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  DOSSIER_PHOTOS, RACINE_MEDIAS, choisirVoix, dimensionsJpeg, dureeDepuisAfinfo, fichierVoix, lireVoix, photoMedia, segmenter, vocalMedia,
} from '../vitrine/medias.mjs'

describe('médias de la vitrine (#8855)', () => {
  test('les dimensions d’un JPEG sont lues dans son en-tête', () => {
    expect(dimensionsJpeg(readFileSync(resolve(DOSSIER_PHOTOS, 'pizza-ananas.jpg')))).toEqual({ width: 900, height: 1200 })
    expect(dimensionsJpeg(readFileSync(resolve(DOSSIER_PHOTOS, 'pizza-chocolat.jpg')))).toEqual({ width: 1200, height: 800 })
  })

  test('un fichier qui n’est pas un JPEG est refusé', () => {
    expect(() => dimensionsJpeg(Buffer.from('pas une image, vraiment pas'))).toThrow('JPEG sans dimensions')
  })

  test('une photo du kit devient un média relatif, à ses vraies dimensions', () => {
    const m = photoMedia('seoul-crepuscule')
    expect(m).toMatchObject({ url: `${RACINE_MEDIAS}/seoul-crepuscule.jpg`, fichier: 'seoul-crepuscule.jpg', genre: 'image', photo: 'seoul-crepuscule', width: 800, height: 1200 })
    expect(m.url.startsWith('/')).toBe(true)
    expect(m.taille).toBeGreaterThan(0)
  })

  test('un vocal est un média relatif qui dit ce qu’il faut synthétiser', () => {
    expect(vocalMedia({ cle: 'vocal-minjun.p-fr', texte: 'Bonjour', lang: 'fr' })).toEqual({
      url: `${RACINE_MEDIAS}/vocal-minjun.p-fr.m4a`, fichier: 'vocal-minjun.p-fr.m4a', genre: 'audio', texte: 'Bonjour', lang: 'fr',
    })
  })

  test('le karaoké suit chaque mot, bout à bout, du début à la fin de la piste', () => {
    const segments = segmenter('Plus que 12 jours', 4000)
    expect(segments.map((s) => s.text)).toEqual(['Plus', 'que', '12', 'jours'])
    expect(segments[0].startMs).toBe(0)
    expect(segments.at(-1).endMs).toBe(4000)
    segments.slice(1).forEach((s, i) => expect(s.startMs).toBe(segments[i].endMs))
  })

  test('le japonais, qui n’espace pas ses mots, se découpe par membre de phrase', () => {
    expect(segmenter('一日中、君の声が聞きたかった。', 1000).map((s) => s.text)).toEqual(['一日中、', '君の声が聞きたかった。'])
  })

  test('la voix d’une langue : la préférée si elle est installée, sinon la première de sa région', () => {
    const voix = lireVoix(['Yuna                ko_KR    # 안녕하세요.', 'Eddy (French (France)) fr_FR    # Bonjour.', 'Majed               ar_001   # مرحبًا!'].join('\n'))
    expect(voix).toEqual([{ nom: 'Yuna', locale: 'ko_KR' }, { nom: 'Eddy (French (France))', locale: 'fr_FR' }, { nom: 'Majed', locale: 'ar_001' }])
    expect(choisirVoix('ko', voix)).toBe('Yuna')
    expect(choisirVoix('fr', voix)).toBe('Eddy (French (France))')
    expect(choisirVoix('ar', voix)).toBe('Majed')
    expect(() => choisirVoix('ja', voix)).toThrow('aucune voix ja_JP')
  })

  test('la durée d’une piste se lit dans afinfo', () => {
    expect(dureeDepuisAfinfo('File: x.m4a\nFile type ID: m4af\nestimated duration: 7.345261 sec\n')).toBe(7345)
    expect(() => dureeDepuisAfinfo('rien')).toThrow('afinfo ne donne aucune durée')
  })

  test('un vocal se synthétise une fois : son fichier se nomme par sa langue et son texte', () => {
    const a = fichierVoix({ texte: 'Bonjour', lang: 'fr' })
    expect(a).toMatch(/out\/vitrine\/voix\/[0-9a-f]{16}\.m4a$/)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'fr' })).toBe(a)
    expect(fichierVoix({ texte: 'Bonjour', lang: 'it' })).not.toBe(a)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-medias.test.mjs`
Expected: FAIL — `Cannot find module '../vitrine/medias.mjs'`.

- [ ] **Step 3: Write minimal implementation**

```js
// scripts/marketing-kit/vitrine/medias.mjs
// Les médias de la vitrine (#8855) : les photos du kit et des vocaux synthétisés. L'app les range
// dans ses caches sous l'URL EXACTE que portent leurs messages et leurs posts : face à l'hôte
// injoignable (127.0.0.1), `MeeshyConfig.resolveMediaURL` ne résout rien, et cette URL relative
// est la clé que lisent les vues. Aucun média ne part vers le réseau.
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { CREDITS } from '../lib/photos.mjs'

export const RACINE_MEDIAS = '/api/v1/attachments/file/vitrine'
export const DOSSIER_PHOTOS = resolve(REPO_ROOT, 'scripts/marketing-kit/photos')
export const CACHE_VOIX = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/voix')

export const urlMedia = (fichier) => `${RACINE_MEDIAS}/${fichier}`

// Largeur et hauteur d'un JPEG, lues dans son segment SOF (0xC0–0xCF, hors DHT, JPG et DAC).
export const dimensionsJpeg = (octets) => {
  const lire = (i) => {
    if (i + 9 > octets.length || octets[i] !== 0xff) throw new Error('JPEG sans dimensions')
    const marqueur = octets[i + 1]
    if (marqueur >= 0xc0 && marqueur <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marqueur)) {
      return { width: octets.readUInt16BE(i + 7), height: octets.readUInt16BE(i + 5) }
    }
    return lire(i + 2 + octets.readUInt16BE(i + 2))
  }
  return lire(2)
}

export const photoMedia = (photo) => {
  const credit = CREDITS[photo]
  if (!credit) throw new Error(`photo inconnue : ${photo}`)
  const octets = readFileSync(resolve(DOSSIER_PHOTOS, credit.fichier))
  return { url: urlMedia(credit.fichier), fichier: credit.fichier, genre: 'image', photo, taille: octets.length, ...dimensionsJpeg(octets) }
}

export const vocalMedia = ({ cle, texte, lang }) => ({ url: urlMedia(`${cle}.m4a`), fichier: `${cle}.m4a`, genre: 'audio', texte, lang })

// Le karaoké d'une piste : un segment par mot (par membre de phrase pour le japonais, qui
// n'espace pas), réparti au prorata de sa longueur sur la durée mesurée.
const morceaux = (texte) => (/\s/.test(texte.trim()) ? texte.trim().split(/\s+/) : (texte.match(/[^、。！？]+[、。！？]*/gu) ?? [texte]))

export const segmenter = (texte, dureeMs) => {
  const parts = morceaux(texte)
  const bornes = parts.reduce((acc, part) => [...acc, acc.at(-1) + [...part].length], [0])
  const total = bornes.at(-1)
  return parts.map((text, i) => ({
    text,
    startMs: Math.round((bornes[i] / total) * dureeMs),
    endMs: Math.round((bornes[i + 1] / total) * dureeMs),
  }))
}

const LOCALES_VOIX = { ko: 'ko_KR', ja: 'ja_JP', fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', pt: 'pt_BR', ar: 'ar_001' }
const VOIX_PREFEREES = { ko: 'Yuna', ja: 'Kyoko', fr: 'Thomas', en: 'Samantha', es: 'Mónica', de: 'Anna', it: 'Alice', pt: 'Luciana', ar: 'Majed' }

// `say -v '?'` : « Nom (variante)   fr_FR    # phrase d'exemple ».
export const lireVoix = (sortie) =>
  sortie.split('\n').flatMap((ligne) => {
    const m = ligne.match(/^(.+?)\s+([a-z]{2,3}_[A-Z0-9]{2,3})\s+#/)
    return m ? [{ nom: m[1].trim(), locale: m[2] }] : []
  })

export const choisirVoix = (lang, voix) => {
  const locale = LOCALES_VOIX[lang]
  const candidates = voix.filter((v) => v.locale === locale)
  const choisie = candidates.find((v) => v.nom === VOIX_PREFEREES[lang]) ?? candidates[0]
  if (!choisie) throw new Error(`aucune voix ${locale ?? lang} installée (Réglages › Accessibilité › Contenu énoncé)`)
  return choisie.nom
}

export const dureeDepuisAfinfo = (sortie) => {
  const m = sortie.match(/estimated duration: ([\d.]+) sec/)
  if (!m) throw new Error('afinfo ne donne aucune durée')
  return Math.round(Number(m[1]) * 1000)
}

// Un vocal synthétisé une fois pour toutes : le cache se nomme par la langue et le texte.
export const fichierVoix = ({ texte, lang }) =>
  resolve(CACHE_VOIX, `${createHash('sha1').update(`${lang}\n${texte}`).digest('hex').slice(0, 16)}.m4a`)

export const synthetiser = (media, voix) => {
  const sortie = fichierVoix(media)
  if (!existsSync(sortie)) {
    mkdirSync(dirname(sortie), { recursive: true })
    const aiff = `${sortie}.aiff`
    execFileSync('say', ['-v', choisirVoix(media.lang, voix), '-o', aiff, media.texte])
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', aiff, sortie])
    rmSync(aiff)
  }
  return { dureeMs: dureeDepuisAfinfo(execFileSync('afinfo', [sortie], { encoding: 'utf8' })), taille: statSync(sortie).size }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-medias.test.mjs`
Expected: PASS (9 tests).

Vérification manuelle, une fois (la synthèse n'a pas de témoin : elle exige macOS et ses voix) :

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && node -e "import('./vitrine/medias.mjs').then(async (m) => { const { execFileSync } = await import('node:child_process'); const voix = m.lireVoix(execFileSync('say', ['-v', '?'], { encoding: 'utf8' })); console.log(m.synthetiser({ texte: 'Toute la journée, j’avais envie d’entendre ta voix.', lang: 'fr' }, voix)) })"`
Expected: `{ dureeMs: <entre 2500 et 6000>, taille: <> 0> }`, et le fichier `.m4a` se lit (`afplay`).

- [ ] **Step 5: Commit**

```bash
git add scripts/marketing-kit/vitrine/medias.mjs scripts/marketing-kit/test/vitrine-medias.test.mjs
git commit -m "feat(kit): médias de la vitrine — photos mesurées, vocaux synthétisés, karaoké (Refs #8855)"
```

---

### Task 3: Le contrat v2 — fixtures du kit et décodage iOS

**Files:**
- Modify: `scripts/marketing-kit/vitrine/fixtures.mjs`
- Modify: `scripts/marketing-kit/test/vitrine-fixtures.test.mjs`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift`
- Modify: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineFixturesTests.swift`
- Regenerate: `apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json`

**Interfaces:**
- Consumes: `AMOUR.vocalRecu` (Tâche 1) ; `photoMedia`, `vocalMedia`, `segmenter` (Tâche 2).
- Produces (kit) : `VERSION_FIXTURES = 2`, `ID_DEBAT`, `idAmour(lang)`, `MESURE_PAR_DEFAUT = { dureeMs: 9000, taille: 36000 }`, `exporterVitrine({ lang, maintenant, mesures = {} })`. Le JSON gagne `medias: [{ url, fichier, genre, … }]`, `posts: [APIPost]`, `scenes: { global: { conversationId }, amour: { conversationId, messageId, attachmentId }, groupe: { conversationId, messageId }, imagine: { conversationId, messageId } }` ; `messages` porte trois conversations ; `modesDeLecture` fixe Bulles pour le couple, Script pour « Pizza Night » et Global.
- Produces (iOS) : `VitrineFixtures.versionAttendue = 2`, `VitrineFixtures.Media { url, fichier, genre: Genre (.image | .audio) }`, `VitrineFixtures.Destination { conversationId, messageId?, attachmentId? }`, propriétés `medias`, `posts: [APIPost]`, `scenes: [String: Destination]`, `destination(_ scene: VitrineScene) -> Destination?`, `conversationsServies() -> [MeeshyConversation]` (sans `encryptionMode`).

- [ ] **Step 1: Write the failing kit tests**

Dans `scripts/marketing-kit/test/vitrine-fixtures.test.mjs`, remplacer les imports du kit :

```js
import { DEMO, lecteurDe, partenaireDe } from '../textes/demo.mjs'
import { ID_DEBAT, ID_GLOBAL, LIEN_LISBOA, MESURE_PAR_DEFAUT, exporterVitrine, idAmour, oid } from '../vitrine/fixtures.mjs'
import { RACINE_MEDIAS } from '../vitrine/medias.mjs'
```

Remplacer les deux tests de liste du lot 1 — un vocal n'a pas de texte à traduire :

```js
  test.each(KIT_LANGS)('%s : chaque aperçu de la liste est écrit dans la langue de son expéditeur et se lit dans celle du lecteur — un vocal n’a pas de texte', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    for (const c of f.conversations) {
      expect(LANGUE_DE[c.lastMessage.sender.userId]).toBe(c.lastMessageOriginalLanguage)
      if (c.lastMessage.messageType !== 'audio' && c.lastMessageOriginalLanguage !== lang) expect(c.lastMessageTranslations[lang]).toBeTruthy()
    }
  })

  test.each(KIT_LANGS)('%s : une conversation directe se lit en tête-à-tête — ni salut « à tous », ni aperçu repris d’une autre ligne, ni bio', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const francais = (c) => (c.lastMessageOriginalLanguage === 'fr' ? c.lastMessage.content : c.lastMessageTranslations.fr)
    const bios = new Set(Object.values(DEMO.bios).map((b) => b.text))
    const directes = f.conversations.filter((c) => c.type === 'direct' && c.lastMessage.messageType !== 'audio')
    const autres = new Set(f.conversations.filter((c) => c.type !== 'direct').map((c) => c.lastMessage.content))
    for (const c of directes) {
      expect(francais(c)).not.toMatch(/groupe|à tous|tout le monde/i)
      expect(autres.has(c.lastMessage.content)).toBe(false)
      expect(bios.has(c.lastMessage.content)).toBe(false)
    }
  })
```

Et ajouter, en fin de fichier :

```js
describe('fixtures de la vitrine, lot 2 : les conversations (#8855)', () => {
  const urlsDesignees = (f) => [
    ...Object.values(f.messages).flat().flatMap((m) => (m.attachments ?? []).flatMap((a) => [a.fileUrl, ...Object.values(a.translations ?? {}).map((t) => t.url)])),
    ...f.posts.flatMap((p) => p.media.map((m) => m.fileUrl)),
  ]

  test.each(KIT_LANGS)('%s : chaque média qu’un message ou un post désigne est livré — aucune URL ne part vers le réseau', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const livres = new Set(f.medias.map((m) => m.url))
    expect(urlsDesignees(f).filter((url) => !livres.has(url))).toEqual([])
    for (const m of f.medias) expect(m.url.startsWith(`${RACINE_MEDIAS}/`)).toBe(true)
  })

  test.each(KIT_LANGS)('%s : le vocal du partenaire se joue dans la langue du lecteur, karaoké compris', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const partenaire = partenaireDe(lang)
    const { conversationId, messageId, attachmentId } = f.scenes.amour
    expect(conversationId).toBe(idAmour(lang))
    const vocal = f.messages[conversationId].find((m) => m.id === messageId)
    expect(vocal.messageType).toBe('audio')
    expect(vocal.originalLanguage).toBe(partenaire.lang)
    const piece = vocal.attachments.find((a) => a.id === attachmentId)
    expect(piece.transcription.text).toBe(DEMO.amour.vocalRecu[partenaire.lang].text)
    const piste = piece.translations[lang]
    expect(piste.transcription).toBe(DEMO.amour.vocalRecu[partenaire.lang].translations[lang])
    expect(piste.segments[0].startMs).toBe(0)
    expect(piste.segments.at(-1).endMs).toBe(piste.durationMs)
    expect(f.messages[conversationId].at(-1).id).toBe(messageId)
  })

  test.each(KIT_LANGS)('%s : dans Pizza Night, le message rouvert sur son original est d’un autre membre, dans une autre langue', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const message = f.messages[ID_DEBAT].find((m) => m.id === f.scenes.groupe.messageId)
    expect(message.sender.userId).not.toBe(f.lecteur.id)
    expect(message.originalLanguage).not.toBe(lang)
    expect(message.translations.map((t) => t.targetLanguage)).toContain(lang)
  })

  test.each(KIT_LANGS)('%s : Imagine part d’un message du couple qui porte sa photo et se lit dans la langue du lecteur', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const { conversationId, messageId } = f.scenes.imagine
    const message = f.messages[conversationId].find((m) => m.id === messageId)
    expect(message.attachments.some((a) => a.mimeType === 'image/jpeg')).toBe(true)
    expect(message.translations.map((t) => t.targetLanguage)).toContain(lang)
  })

  test.each(KIT_LANGS)('%s : le fil porte les posts du kit, du plus récent au plus ancien, traduits pour le lecteur', (lang) => {
    const { posts } = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(posts.map((p) => p.content)).toEqual(DEMO.posts.map((p) => p.text))
    expect(posts[0].createdAt > posts[1].createdAt).toBe(true)
    for (const p of posts.filter((post) => post.originalLanguage !== lang)) expect(p.translations[lang].text).toBeTruthy()
  })

  test('les deux conversations que les scènes ouvrent n’ont aucun non-lu, et chacune a son mode', () => {
    const f = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    for (const id of [idAmour('fr'), ID_DEBAT]) expect(f.conversations.find((c) => c.id === id).unreadCount).toBe(0)
    expect(f.modesDeLecture).toEqual({ [ID_GLOBAL]: 'script', [ID_DEBAT]: 'script', [idAmour('fr')]: 'bubbles' })
    expect(f.scenes.global).toEqual({ conversationId: ID_GLOBAL })
  })

  test('la ligne du couple montre le vocal, dernier message de la conversation', () => {
    const f = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    const ligne = f.conversations.find((c) => c.id === idAmour('fr'))
    expect(ligne.lastMessage.id).toBe(f.scenes.amour.messageId)
    expect(ligne.lastMessage.messageType).toBe('audio')
    expect(ligne.lastMessage.attachments[0].transcription).toBeUndefined()
  })

  test('les photos portent leurs vraies dimensions', () => {
    const f = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    expect(f.medias.find((m) => m.fichier === 'pizza-ananas.jpg')).toMatchObject({ genre: 'image', width: 900, height: 1200 })
  })

  test('une mesure remplace la durée par défaut d’un vocal', () => {
    const provisoire = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    const url = provisoire.medias.find((m) => m.genre === 'audio' && m.lang === 'fr').url
    const f = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT, mesures: { [url]: { dureeMs: 5000, taille: 20_000 } } })
    const piece = f.messages[idAmour('fr')].at(-1).attachments[0]
    expect(piece.translations.fr.durationMs).toBe(5000)
    expect(piece.translations.fr.segments.at(-1).endMs).toBe(5000)
    expect(piece.duration).toBe(MESURE_PAR_DEFAUT.dureeMs)
  })
})
```

- [ ] **Step 2: Run the kit tests to verify they fail**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-fixtures.test.mjs`
Expected: FAIL — `ID_DEBAT`, `idAmour` et `MESURE_PAR_DEFAUT` n'existent pas.

- [ ] **Step 3: Write the kit implementation**

Remplacer `scripts/marketing-kit/vitrine/fixtures.mjs` par :

```js
// Le contenu d'une vitrine (#8855), au format EXACT des réponses de la passerelle : l'app le
// décode avec son décodeur de production (`APIClient.makeAPIPayloadDecoder()`) et le range dans
// ses vraies bases. Une seule source : les textes du kit.
import { createHash } from 'node:crypto'
import { KIT_LANGS } from '../lib/locales.mjs'
import { CREDITS } from '../lib/photos.mjs'
import { DEMO, lecteurDe, partenaireDe, profilDe } from '../textes/demo.mjs'
import { photoMedia, segmenter, vocalMedia } from './medias.mjs'

export const VERSION_FIXTURES = 2

// Un identifiant stable au format ObjectId : une même graine donne toujours le même identifiant.
export const oid = (graine) => createHash('sha1').update(graine).digest('hex').slice(0, 24)

export const ID_GLOBAL = oid('conv:global')
export const ID_DEBAT = oid('conv:debat')
export const LIEN_LISBOA = 'lisboa-2026'
export const idAmour = (lang) => oid(`conv:amour:${lecteurDe(lang).pseudo}`)

// Faute de mesure (témoins, échantillon iOS), un vocal dure 9 s.
export const MESURE_PAR_DEFAUT = { dureeMs: 9000, taille: 36_000 }

// Les paliers du catalogue d'engagement (`EngagementCatalog.swift`, miroir de `packages/shared/types/engagement.ts`).
const PALIERS = { badge: [1, 10, 50, 100, 500], streak: [3, 7, 14, 30, 60, 100], level: [10, 50, 150, 400, 1000, 2500] }

const JOUR = 60 * 24
const iso = (maintenant, minutesAvant) => new Date(maintenant.getTime() - minutesAvant * 60_000).toISOString()

const nomComplet = (profil) => `${profil.prenom} ${profil.nom}`
const idUtilisateur = (profil) => oid(`user:${profil.pseudo}`)
const idParticipant = (conversationId, profil) => oid(`part:${conversationId}:${profil.pseudo}`)

const identite = (profil) => ({
  id: idUtilisateur(profil),
  username: profil.pseudo,
  displayName: nomComplet(profil),
  firstName: profil.prenom,
  lastName: profil.nom,
})

const utilisateur = (profil, maintenant) => ({
  ...identite(profil),
  systemLanguage: profil.lang,
  regionalLanguage: profil.regional,
  role: 'USER',
  createdAt: iso(maintenant, 90 * JOUR),
})

const participant = (conversationId, profil, maintenant) => ({
  id: idParticipant(conversationId, profil),
  conversationId,
  type: 'user',
  userId: idUtilisateur(profil),
  displayName: nomComplet(profil),
  language: profil.lang,
  role: 'USER',
  isActive: true,
  joinedAt: iso(maintenant, 30 * JOUR),
  user: identite(profil),
})

// L'expéditeur d'un message (`APIMessageSender`, `APIConversationUser`) : son identifiant est celui du participant.
const expediteur = (conversationId, profil) => ({
  ...identite(profil),
  id: idParticipant(conversationId, profil),
  userId: idUtilisateur(profil),
  type: 'user',
})

const traductions = (messageId, contenu) =>
  Object.entries(contenu.translations).map(([cible, texte]) => ({
    id: oid(`tr:${messageId}:${cible}`),
    messageId,
    targetLanguage: cible,
    translatedContent: texte,
    sourceLanguage: contenu.lang,
  }))

const arrivee = (profil, commun) => ({
  ...commun,
  content: `${profil.prenom} a rejoint la conversation`,
  originalLanguage: 'fr',
  messageType: 'system',
  metadata: {
    kind: 'member-joined',
    participantId: commun.senderId,
    displayName: nomComplet(profil),
    username: profil.pseudo,
    givenName: profil.prenom,
    isAnonymous: false,
    viaShareLink: false,
  },
})

const messagesGlobal = (maintenant) =>
  DEMO.global.map((ligne, i) => {
    const id = oid(`msg:global:${i}`)
    const profil = profilDe(ligne.auteur)
    const commun = {
      id,
      conversationId: ID_GLOBAL,
      senderId: idParticipant(ID_GLOBAL, profil),
      createdAt: iso(maintenant, (DEMO.global.length - i) * 3),
      sender: expediteur(ID_GLOBAL, profil),
    }
    if (ligne.type === 'arrivee') return arrivee(profil, commun)
    return { ...commun, content: ligne.text, originalLanguage: ligne.lang, messageType: 'text', translations: traductions(id, ligne) }
  })

// Une pièce jointe telle que la passerelle la sert, sous l'URL relative de son média.
const piece = ({ media, messageId, auteur, maintenant, minutes }) => ({
  id: oid(`att:${messageId}:${media.fichier}`),
  messageId,
  fileName: media.fichier,
  originalName: media.fichier,
  mimeType: media.genre === 'image' ? 'image/jpeg' : 'audio/mp4',
  fileSize: media.taille,
  fileUrl: media.url,
  ...(media.genre === 'image' ? { width: media.width, height: media.height } : {}),
  uploadedBy: idUtilisateur(auteur),
  createdAt: iso(maintenant, minutes),
})

// « 🔥 8 » (kit) → le résumé de réactions que sert la passerelle.
const reactionsDe = (texte) => {
  if (!texte) return {}
  const [emoji, nombre] = texte.split(' ')
  return { reactionSummary: { [emoji]: Number(nombre) }, reactionCount: Number(nombre) }
}

// Un message écrit — texte, photos, réactions —, par un membre dans SA langue.
const ecrit = ({ conversationId, graine, profil, maintenant, minutes, contenu, photos = [], reactions }) => {
  const id = oid(`msg:${conversationId}:${graine}`)
  const pieces = photos.map((photo) => piece({ media: photoMedia(photo), messageId: id, auteur: profil, maintenant, minutes }))
  return {
    id,
    conversationId,
    senderId: idParticipant(conversationId, profil),
    createdAt: iso(maintenant, minutes),
    sender: expediteur(conversationId, profil),
    content: contenu.text,
    originalLanguage: contenu.lang,
    messageType: pieces.length ? 'image' : 'text',
    translations: traductions(id, contenu),
    ...(pieces.length ? { attachments: pieces } : {}),
    ...reactionsDe(reactions),
  }
}

const mien = (parLangue, lang) => ({ lang, text: parLangue[lang], translations: {} })

// Les langues vers lesquelles la passerelle traduit pour le lecteur : la sienne, puis sa langue
// régionale quand le kit la parle.
const languesDuLecteur = (lecteur) => [...new Set([lecteur.lang, lecteur.regional])].filter((l) => KIT_LANGS.includes(l))

// Le vocal du partenaire : l'original, et une piste par langue du lecteur.
const mediasDuVocal = (lang) => {
  const partenaire = partenaireDe(lang)
  const original = DEMO.amour.vocalRecu[partenaire.lang]
  const cle = (l) => `vocal-${partenaire.pseudo}-${l}`
  return {
    original: vocalMedia({ cle: cle(original.lang), texte: original.text, lang: original.lang }),
    pistes: languesDuLecteur(lecteurDe(lang))
      .filter((l) => l !== original.lang)
      .map((l) => vocalMedia({ cle: cle(l), texte: original.translations[l], lang: l })),
  }
}

const vocal = ({ lang, maintenant, mesures, minutes }) => {
  const conversationId = idAmour(lang)
  const partenaire = partenaireDe(lang)
  const original = DEMO.amour.vocalRecu[partenaire.lang]
  const id = oid(`msg:${conversationId}:amour.vocal.recu`)
  const { original: son, pistes } = mediasDuVocal(lang)
  const mesure = (media) => mesures[media.url] ?? MESURE_PAR_DEFAUT
  const duree = mesure(son).dureeMs
  return {
    id,
    conversationId,
    senderId: idParticipant(conversationId, partenaire),
    createdAt: iso(maintenant, minutes),
    sender: expediteur(conversationId, partenaire),
    content: '',
    originalLanguage: original.lang,
    messageType: 'audio',
    attachments: [{
      ...piece({ media: { ...son, taille: mesure(son).taille }, messageId: id, auteur: partenaire, maintenant, minutes }),
      duration: duree,
      transcription: { text: original.text, language: original.lang, confidence: 0.97, durationMs: duree, segments: segmenter(original.text, duree) },
      translations: Object.fromEntries(pistes.map((p) => {
        const d = mesure(p).dureeMs
        return [p.lang, { type: 'audio', url: p.url, transcription: p.texte, durationMs: d, format: 'm4a', cloned: true, quality: 0.93, ttsModel: 'chatterbox', segments: segmenter(p.texte, d) }]
      })),
    }],
  }
}

// La conversation du couple (scènes 1 et 9), en Bulles : deux photos, et le vocal qui vient d'arriver.
const messagesAmour = (lang, maintenant, mesures) => {
  const conversationId = idAmour(lang)
  const lecteur = lecteurDe(lang)
  const partenaire = partenaireDe(lang)
  const A = DEMO.amour
  const lui = (replique, graine, minutes, photos) => ecrit({ conversationId, graine, profil: partenaire, maintenant, minutes, contenu: replique[partenaire.lang], photos })
  const moi = (parLangue, graine, minutes) => ecrit({ conversationId, graine, profil: lecteur, maintenant, minutes, contenu: mien(parLangue, lang) })
  return [
    lui(A.pense, 'amour.pense', 185, [A.photos.dejeuner]),
    moi(A.miens.vueDemandee, 'amour.vue-demandee', 180),
    lui(A.vue, 'amour.vue', 42, [A.photos.vue[partenaire.lang]]),
    moi(A.miens.manque, 'amour.manque', 40),
    lui(A.jours, 'amour.jours', 38),
    vocal({ lang, maintenant, mesures, minutes: 2 }),
  ]
}

const repliquesDebat = () => [...DEMO.debat.messages, DEMO.debat.patateDouce]

// « Pizza Night » (scène 2), en Script : chacun écrit dans sa langue ; un lecteur hors du groupe y prend parti.
const messagesDebat = (lang, maintenant) => {
  const lecteur = lecteurDe(lang)
  const ecrits = repliquesDebat().map((m, i) => ecrit({
    conversationId: ID_DEBAT, graine: m.id, profil: profilDe(m.auteur), maintenant, minutes: 70 - i * 9,
    contenu: m, photos: [...(m.photos ?? []), ...(m.photosLong ?? [])], reactions: m.reactions,
  }))
  if (DEMO.debat.membres.includes(lecteur.pseudo)) return ecrits
  return [...ecrits, ecrit({ conversationId: ID_DEBAT, graine: 'debat.mien', profil: lecteur, maintenant, minutes: 12, contenu: mien(DEMO.debat.mien, lang) })]
}

// Le message que la scène 2 rouvre sur son original : celui d'un AUTRE membre, dans une AUTRE langue.
const CANDIDATS_ORIGINAL = ['debat.crime', 'debat.chocolat', 'debat.popcorn', 'debat.diner']

const messageOriginal = (lang) => {
  const lecteur = lecteurDe(lang)
  const replique = CANDIDATS_ORIGINAL.map((id) => repliquesDebat().find((m) => m.id === id))
    .find((m) => m.auteur !== lecteur.pseudo && m.lang !== lang)
  return oid(`msg:${ID_DEBAT}:${replique.id}`)
}

// Le dernier message d'une ligne de liste, servi par le Prisme (`lastMessageTranslations`).
const derniere = (conversationId, profil, contenu, maintenant, minutes) => ({
  lastMessage: {
    id: oid(`last:${conversationId}`),
    content: contenu.text,
    senderId: idParticipant(conversationId, profil),
    createdAt: iso(maintenant, minutes),
    messageType: 'text',
    sender: expediteur(conversationId, profil),
  },
  lastMessageTranslations: contenu.translations,
  lastMessageOriginalLanguage: contenu.lang,
  lastMessageAt: iso(maintenant, minutes),
})

// La ligne d'une conversation dont le fil est exporté : son DERNIER message, tel qu'il est servi.
const ligneDe = (message) => ({
  lastMessage: {
    id: message.id,
    content: message.content,
    senderId: message.senderId,
    createdAt: message.createdAt,
    messageType: message.messageType,
    sender: message.sender,
    ...(message.attachments ? { attachments: message.attachments.map(({ transcription, translations, ...reste }) => reste) } : {}),
  },
  lastMessageTranslations: Object.fromEntries((message.translations ?? []).map((t) => [t.targetLanguage, t.translatedContent])),
  lastMessageOriginalLanguage: message.originalLanguage,
  lastMessageAt: message.createdAt,
})

// L'aperçu d'une conversation directe : une réplique du kit qui se lit en tête-à-tête — jamais un
// salut lancé « à tous » —, écrite par son correspondant dans SA langue.
const APERCUS_DIRECTS = {
  'minjun.p': 'nova.rdv',
  'aiko.t': 'nova.aiko2',
  'lucas.olv': 'story.lucas',
  'sofi.romero': 'story.sofia',
  'giulia.r': 'post.aiko.c2',
  'kwame.m': 'post.kwame',
}

const ECRITS = [...DEMO.global, ...DEMO.groupe, ...DEMO.story, ...DEMO.debat.messages, ...DEMO.posts.flatMap((p) => [p, ...(p.apercu ?? [])])]

const apercuDe = (profil) => {
  const apercu = ECRITS.find((c) => c.id === APERCUS_DIRECTS[profil.pseudo] && c.auteur === profil.pseudo)
  if (!apercu) throw new Error(`aucun aperçu pour ${profil.pseudo}`)
  return apercu
}

const CORRESPONDANTS = Object.keys(APERCUS_DIRECTS)

const conversations = (lang, maintenant, fils) => {
  const lecteur = lecteurDe(lang)
  const partenaire = partenaireDe(lang)
  const taille = (pseudos) => new Set([lecteur.pseudo, ...pseudos]).size
  const direct = ({ id, profil, ligne, unreadCount = 0 }) => ({
    id,
    type: 'direct',
    memberCount: 2,
    unreadCount,
    isMember: true,
    createdAt: iso(maintenant, 40 * JOUR),
    updatedAt: ligne.lastMessageAt,
    participants: [participant(id, lecteur, maintenant), participant(id, profil, maintenant)],
    ...ligne,
  })
  const groupe = ({ id, titre, ligne, memberCount, unreadCount }) => ({
    id,
    type: 'group',
    title: titre,
    memberCount,
    unreadCount,
    isMember: true,
    createdAt: iso(maintenant, 60 * JOUR),
    updatedAt: ligne.lastMessageAt,
    ...ligne,
  })
  const idDrole = oid('conv:drole')
  const idNova = oid('conv:nova')
  const decalage = DEMO.groupe.find((m) => m.id === 'nova.decalage')
  const dernierGlobal = DEMO.global.at(-1)
  return [
    direct({ id: idAmour(lang), profil: partenaire, ligne: ligneDe(fils[idAmour(lang)].at(-1)) }),
    groupe({ id: ID_DEBAT, titre: DEMO.debat.titre, ligne: ligneDe(fils[ID_DEBAT].at(-1)), memberCount: taille(DEMO.debat.membres), unreadCount: 0 }),
    groupe({ id: idDrole, titre: DEMO.drole.titre, ligne: derniere(idDrole, profilDe(DEMO.drole.valise.auteur), DEMO.drole.valise, maintenant, 95), memberCount: taille(DEMO.drole.membres), unreadCount: 4 }),
    groupe({ id: idNova, titre: DEMO.lienInvitation.groupe, ligne: derniere(idNova, profilDe(decalage.auteur), decalage, maintenant, 160), memberCount: 12, unreadCount: 3 }),
    {
      id: ID_GLOBAL,
      type: 'global',
      identifier: 'meeshy',
      title: 'Meeshy Global',
      memberCount: 2481,
      unreadCount: 0,
      isMember: true,
      createdAt: iso(maintenant, 365 * JOUR),
      updatedAt: iso(maintenant, 3),
      ...derniere(ID_GLOBAL, profilDe(dernierGlobal.auteur), dernierGlobal, maintenant, 3),
    },
    ...CORRESPONDANTS.filter((pseudo) => pseudo !== lecteur.pseudo && pseudo !== partenaire.pseudo).map((pseudo, i) => {
      const profil = profilDe(pseudo)
      const id = oid(`conv:dm:${[lecteur.pseudo, pseudo].sort().join(':')}`)
      return direct({ id, profil, ligne: derniere(id, profil, apercuDe(profil), maintenant, 200 + i * 45) })
    }),
  ]
}

// Le fil (`GET /posts/feed`, #8922) : les posts du kit, du plus récent au plus ancien.
const posts = (maintenant) =>
  DEMO.posts.map((p, i) => {
    const media = p.photo ? [photoMedia(p.photo)] : []
    return {
      id: oid(`post:${p.id}`),
      type: 'POST',
      visibility: 'PUBLIC',
      content: p.text,
      originalLanguage: p.lang,
      createdAt: iso(maintenant, 55 + i * 130),
      updatedAt: iso(maintenant, 55 + i * 130),
      author: identite(profilDe(p.auteur)),
      likeCount: p.likes,
      commentCount: p.commentaires,
      repostCount: 0,
      viewCount: p.likes * 8,
      bookmarkCount: 0,
      shareCount: 0,
      reactionSummary: { '❤️': p.likes },
      media: media.map((m, j) => ({
        id: oid(`post-media:${p.id}:${j}`), fileName: m.fichier, originalName: m.fichier, mimeType: 'image/jpeg',
        fileSize: m.taille, fileUrl: m.url, width: m.width, height: m.height, order: j,
      })),
      translations: Object.fromEntries(Object.entries(p.translations).map(([cible, text]) => [cible, { text }])),
    }
  })

const photoDuFichier = (fichier) => Object.keys(CREDITS).find((nom) => CREDITS[nom].fichier === fichier)

// Tout ce que les messages et les posts désignent : le script de capture le dépose, l'app le range.
const mediasDe = ({ lang, fils, lesPosts }) => {
  const images = [
    ...Object.values(fils).flat().flatMap((m) => m.attachments ?? []).filter((a) => a.mimeType === 'image/jpeg'),
    ...lesPosts.flatMap((p) => p.media),
  ]
  const { original, pistes } = mediasDuVocal(lang)
  return [...new Set(images.map((a) => a.fileName))].map((fichier) => photoMedia(photoDuFichier(fichier))).concat([original, ...pistes])
}

// Ce que chaque scène ouvre (spec § 3) : sa conversation, et le message ou la pièce qu'elle met en avant.
const scenes = (lang, fils) => {
  const leVocal = fils[idAmour(lang)].at(-1)
  return {
    global: { conversationId: ID_GLOBAL },
    amour: { conversationId: idAmour(lang), messageId: leVocal.id, attachmentId: leVocal.attachments[0].id },
    groupe: { conversationId: ID_DEBAT, messageId: messageOriginal(lang) },
    imagine: { conversationId: idAmour(lang), messageId: oid(`msg:${idAmour(lang)}:amour.vue`) },
  }
}

const COMPTEURS = [
  ['content.text_message', 64],
  ['content.audio_message', 12],
  ['content.story', 7],
  ['conversation.private', 5],
  ['conversation.public', 23],
  ['conversation.community', 2],
  ['social.friendship', 10],
]

const SUCCES = ['achievement.first_content', 'achievement.first_voice', `achievement.${DEMO.progression.dernierSucces.cle}`]

const atteints = (paliers, valeur) => paliers.filter((palier) => palier <= valeur)

const progression = (maintenant) => {
  const P = DEMO.progression
  const cout = 100
  const jalon = (milestoneType, milestoneKey, joursAvant) => ({ milestoneType, milestoneKey, reachedAt: iso(maintenant, joursAvant * JOUR) })
  return {
    counters: COMPTEURS.map(([axisKey, count]) => ({ axisKey, count })),
    milestones: [
      ...COMPTEURS.flatMap(([axe, count]) => atteints(PALIERS.badge, count).map((palier, i) => jalon('badge', `${axe}:${palier}`, 20 - i * 6))),
      ...atteints(PALIERS.streak, P.serie).map((palier) => jalon('streak', `streak:${palier}`, P.serie - palier)),
      ...atteints(PALIERS.level, P.points).map((palier, i) => jalon('level', `level:${palier}`, 30 - i * 6)),
      ...SUCCES.map((cle, i) => jalon('achievement', cle, i === SUCCES.length - 1 ? 7 : 25 - i * 5)),
    ],
    streak: { currentStreakDays: P.serie, longestStreakDays: P.record },
    level: { engagementScore: P.points },
    meesh: {
      balance: P.meesh,
      mintedLifetime: P.meeshFrappees,
      debitablePoints: cout - P.meeshManquants,
      floorPoints: 0,
      missingPoints: P.meeshManquants,
      mintCost: cout,
      firstMintedAt: iso(maintenant, 60 * JOUR),
      lastMintedAt: iso(maintenant, JOUR),
    },
    // `packages/shared/utils/engagement-elan.ts` : 1 + (familles actives − 1) + 1 si l'assise est acquise
    // (10 succès ou 5 badges hauts), que ce profil n'a pas.
    elan: { factor: 1 + (P.elanFamilles.length - 1), activeFamilyCount: P.elanFamilles.length, hasStanding: false, windowDays: P.elanFenetre, activeFamilies: P.elanFamilles },
  }
}

// L'invitation au groupe « Lisboa » (spec § 3, scène 6), telle que `GET /links/:id` la sert à un invité.
const lienInvitation = (lang, maintenant) => {
  const membres = [...new Set([lecteurDe(lang).pseudo, ...DEMO.drole.membres])].map(profilDe)
  const langues = [...new Set(membres.map((p) => p.lang))]
  return {
    id: oid('link:lisboa'),
    linkId: LIEN_LISBOA,
    name: DEMO.drole.titre,
    currentUses: membres.length - 1,
    currentConcurrentUsers: 2,
    requireAccount: false,
    requireNickname: false,
    requireEmail: false,
    requireBirthday: false,
    allowedLanguages: [],
    allowAnonymousMessages: true,
    allowAnonymousImages: true,
    allowAnonymousFiles: false,
    allowViewHistory: true,
    conversation: { id: oid('conv:drole'), title: DEMO.drole.titre, type: 'group', createdAt: iso(maintenant, 60 * JOUR) },
    creator: identite(profilDe('aiko.t')),
    stats: { totalParticipants: membres.length, memberCount: membres.length, anonymousCount: 0, languageCount: langues.length, spokenLanguages: langues },
  }
}

export const exporterVitrine = ({ lang, maintenant, mesures = {} }) => {
  if (!KIT_LANGS.includes(lang)) throw new Error(`langue hors kit : ${lang}`)
  const fils = {
    [ID_GLOBAL]: messagesGlobal(maintenant),
    [idAmour(lang)]: messagesAmour(lang, maintenant, mesures),
    [ID_DEBAT]: messagesDebat(lang, maintenant),
  }
  const lesPosts = posts(maintenant)
  return {
    version: VERSION_FIXTURES,
    lang,
    lecteur: utilisateur(lecteurDe(lang), maintenant),
    conversations: conversations(lang, maintenant, fils),
    messages: fils,
    progression: progression(maintenant),
    lienInvitation: lienInvitation(lang, maintenant),
    modesDeLecture: { [ID_GLOBAL]: 'script', [ID_DEBAT]: 'script', [idAmour(lang)]: 'bubbles' },
    medias: mediasDe({ lang, fils, lesPosts }),
    posts: lesPosts,
    scenes: scenes(lang, fils),
  }
}
```

- [ ] **Step 4: Run the kit tests — only the sample is stale**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-fixtures.test.mjs`
Expected: tous PASS sauf « l’échantillon que décode l’app iOS est à jour » (l'échantillon est encore v1).

- [ ] **Step 5: Regenerate the sample**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/vitrine/exporter.mjs --lang fr --maintenant 2026-09-30T12:00:00.000Z --sortie apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json`

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-fixtures.test.mjs`
Expected: PASS.

- [ ] **Step 6: Write the failing iOS tests**

Dans `apps/ios/MeeshyTests/Unit/Vitrine/VitrineFixturesTests.swift` :

- dans `test_decoder_kitSample_readsEveryDomain`, remplacer `XCTAssertEqual(f.version, 1)` par `XCTAssertEqual(f.version, 2)` ;
- dans `test_decoder_kitSample_keepsTheOptionalFieldsTheScenesShow`, remplacer la ligne `Pizza Night 🍕` par :

```swift
        XCTAssertEqual(f.conversations.first { $0.title == "Lisboa ✈️" }?.unreadCount, 4)
```

- remplacer `test_decoder_unknownVersion_throwsVersionInconnue` par :

```swift
    /// Des fixtures du lot 1 oubliées dans le conteneur : la vitrine refuse plutôt que d'ouvrir un écran vide.
    func test_decoder_previousVersion_throwsVersionInconnue() throws {
        var brut = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: echantillon)) as? [String: Any])
        brut["version"] = 1
        let data = try JSONSerialization.data(withJSONObject: brut)
        XCTAssertThrowsError(try VitrineFixtures.decoder(data)) { erreur in
            XCTAssertEqual(erreur as? VitrineFixturesErreur, .versionInconnue(1))
        }
    }
```

- ajouter :

```swift
    /// Le lot 2 : le vocal et sa piste dans la langue du lecteur, les destinations, le fil et les médias.
    func test_decoder_kitSample_readsTheConversationsOfLot2() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        let amour = try XCTUnwrap(f.scenes["amour"])
        let vocal = try XCTUnwrap(f.messages[amour.conversationId]?.first { $0.id == amour.messageId })
        let piece = try XCTUnwrap(vocal.attachments?.first { $0.id == amour.attachmentId })
        XCTAssertEqual(piece.transcription?.language, "ko")
        let piste = try XCTUnwrap(piece.translations?["fr"], "Vocal sans piste dans la langue de la lectrice.")
        XCTAssertGreaterThan(piste.segments?.count ?? 0, 3, "Piste sans karaoké.")
        XCTAssertTrue(f.medias.contains { $0.genre == .audio && $0.url == piste.url })
        XCTAssertEqual(f.modesDeLecture[amour.conversationId], "bubbles")
        XCTAssertNotNil(f.scenes["groupe"]?.messageId)
        XCTAssertNotNil(f.scenes["imagine"]?.messageId)
        XCTAssertEqual(f.destination(.global)?.conversationId, f.conversations.first { $0.type == "global" }?.id)
        XCTAssertEqual(f.posts.count, 2)
        XCTAssertTrue(f.medias.contains { $0.genre == .image && $0.fichier == "osaka-coucher.jpg" })
    }

    /// `toConversation` pose `e2ee` sur toute conversation directe : un cadenas sur un écran traduit
    /// est hors champ (spec § 2), la vitrine sert ses conversations sans mode de chiffrement.
    func test_conversationsServies_carryNoEncryptionLock() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        let servies = f.conversationsServies()
        XCTAssertEqual(servies.count, f.conversations.count)
        XCTAssertTrue(servies.contains { $0.type == .direct })
        XCTAssertTrue(servies.allSatisfy { $0.encryptionMode == nil })
    }
```

- [ ] **Step 7: Run the iOS tests to verify they fail**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineFixturesTests`
Expected: échec de compilation — `medias`, `scenes`, `posts`, `destination` et `conversationsServies` n'existent pas.

- [ ] **Step 8: Write the iOS implementation**

Remplacer le corps de `VitrineFixtures` dans `apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift` :

```swift
/// Le contenu d'une vitrine, exporté par le kit (`scripts/marketing-kit/vitrine/fixtures.mjs`)
/// au format EXACT des réponses de la passerelle, et lu par le décodeur de PRODUCTION.
nonisolated struct VitrineFixtures: Decodable, Sendable {
    static let versionAttendue = 2

    /// Un média que le script de capture dépose dans `Documents/vitrine/medias/`, et que l'app range
    /// sous l'URL que portent ses messages et ses posts.
    nonisolated struct Media: Decodable, Sendable, Equatable {
        nonisolated enum Genre: String, Decodable, Sendable {
            case image
            case audio
        }

        let url: String
        let fichier: String
        let genre: Genre
    }

    /// Ce qu'une scène ouvre : sa conversation, et le message ou la pièce qu'elle met en avant.
    nonisolated struct Destination: Decodable, Sendable, Equatable {
        let conversationId: String
        let messageId: String?
        let attachmentId: String?
    }

    let version: Int
    let lang: String
    let lecteur: MeeshyUser
    let conversations: [APIConversation]
    let messages: [String: [APIMessage]]
    let progression: APIEngagementProgress
    let lienInvitation: ShareLinkInfo
    let modesDeLecture: [String: String]
    let medias: [Media]
    let posts: [APIPost]
    let scenes: [String: Destination]

    func destination(_ scene: VitrineScene) -> Destination? {
        scenes[scene.rawValue]
    }

    /// Les conversations telles que la vitrine les range et les ouvre : sans mode de chiffrement.
    /// `toConversation` en pose un sur toute conversation directe ; la traduction serveur est coupée
    /// en E2EE, et un cadenas sur un écran traduit est hors champ (spec § 2).
    func conversationsServies() -> [MeeshyConversation] {
        conversations.map { api in
            var conversation = api.toConversation(currentUserId: lecteur.id)
            conversation.encryptionMode = nil
            return conversation
        }
    }

    static func decoder(_ data: Data) throws -> VitrineFixtures {
        let fixtures = try APIClient.makeAPIPayloadDecoder().decode(VitrineFixtures.self, from: data)
        guard fixtures.version == versionAttendue else { throw VitrineFixturesErreur.versionInconnue(fixtures.version) }
        return fixtures
    }

    static func charger(depuis url: URL = VitrineLaunch.fichierFixtures) throws -> VitrineFixtures {
        try decoder(Data(contentsOf: url))
    }
}
```

- [ ] **Step 9: Run the iOS tests to verify they pass**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineFixturesTests VitrineSeederTests VitrineSourceGuardTests`
Expected: `TEST SUCCEEDED` — `VitrineSeederTests` décode le nouvel échantillon (trois fils de messages au lieu d'un : ses témoins lisent `f.messages.count`, pas un nombre écrit en dur).

- [ ] **Step 10: Commit**

```bash
git add scripts/marketing-kit/vitrine/fixtures.mjs scripts/marketing-kit/test/vitrine-fixtures.test.mjs apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineFixturesTests.swift apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json
git commit -m "feat(vitrine): fixtures v2 — le couple et son vocal traduit, Pizza Night, le fil, les médias, sans cadenas (Refs #8855, #8922)"
```

---

### Task 4: Le fil et les médias rangés avant le montage des racines

**Files:**
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift`
- Modify: `apps/ios/Meeshy/MeeshyApp.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift`, `apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift`

**Interfaces:**
- Consumes: `VitrineFixtures.medias`, `.posts`, `.conversationsServies()` (Tâche 3).
- Produces: `VitrineSeederErreur.mediaAbsent(String)` ; `VitrineSeedTargets.enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async`, `.enregistrerFil(_ posts: [FeedPost], cle: String) async throws` ; `VitrineSeeder.cleDuFil` (`"main-feed"`), `VitrineSeeder.cleDeCache(_ url: String) -> String`, `VitrineSeeder.remplirLesCaches(_:medias:dans:)` ; `VitrineLaunch.dossierMedias` ; `VitrineStage.remplirLesCaches()`, appelé par `MeeshyApp` juste après `CacheCoordinator.shared.start()`.

- [ ] **Step 1: Write the failing tests**

Dans `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift`, ajouter à `VitrineSeederTests` :

```swift
    /// Chaque média sous la clé que lisent les vues — celle de l'atelier Imagine, comme celle
    /// des bulles (`MeeshyConfig.resolveMediaURL`, relative face à l'hôte mort).
    func test_remplirLesCaches_storesEveryMediaUnderTheKeyTheViewsRead() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplirLesCaches(f, medias: try Self.dossierDeMedias(f), dans: cibles)
        XCTAssertEqual(cibles.medias.map(\.cle), f.medias.map { MessageCardMediaLoader.resolved($0.url) })
        XCTAssertEqual(cibles.medias.map(\.genre), f.medias.map(\.genre))
        XCTAssertTrue(cibles.medias.contains { $0.genre == .audio })
    }

    func test_remplirLesCaches_missingMedia_failsNamingIt() async throws {
        let f = try fixtures()
        let vide = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        do {
            try await VitrineSeeder.remplirLesCaches(f, medias: vide, dans: CiblesEnregistreuses())
            XCTFail("Un média absent aurait dû arrêter la vitrine.")
        } catch {
            XCTAssertEqual(error as? VitrineSeederErreur, .mediaAbsent(f.medias[0].fichier))
        }
    }

    /// Le fil de l'iPad (#8922) : les posts du kit, servis par le Prisme dans la langue du lecteur.
    func test_remplirLesCaches_feedServesTheKitPostsInTheReadersLanguage() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplirLesCaches(f, medias: try Self.dossierDeMedias(f), dans: cibles)
        XCTAssertEqual(cibles.cleDuFil, "main-feed")
        XCTAssertEqual(cibles.fil.map(\.id), f.posts.map(\.id))
        let japonais = try XCTUnwrap(cibles.fil.first { $0.originalLanguage == "ja" })
        XCTAssertEqual(japonais.displayContent, f.posts.first { $0.id == japonais.id }?.translations?["fr"]?.text)
    }

    func test_remplir_noConversationCarriesAnEncryptionLock() async throws {
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(try fixtures(), dans: cibles)
        XCTAssertTrue(cibles.conversations.contains { $0.type == .direct })
        XCTAssertTrue(cibles.conversations.allSatisfy { $0.encryptionMode == nil })
    }

    /// Le vocal de la scène 1 relu par les VRAIS chemins : sa transcription et la piste que le
    /// Prisme sert à la lectrice, karaoké compris.
    func test_remplir_voiceNoteAndItsTrack_areReadBackByTheRealReadPaths() async throws {
        let f = try fixtures()
        let amour = try XCTUnwrap(f.scenes["amour"])
        let attendue = try XCTUnwrap(f.messages[amour.conversationId]?.first { $0.id == amour.messageId }?.attachments?.first?.translations?["fr"])
        let base = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: base)
        try await VitrineSeeder.remplir(f, dans: CiblesMessagesReels(persistence: MessagePersistenceActor(dbWriter: base)))

        let lus = try await base.read { db in try MessageRecord.fetchAll(db) }.map { $0.toMessage(currentUserId: f.lecteur.id) }
        let piece = try XCTUnwrap(lus.flatMap(\.attachments).first { $0.id == amour.attachmentId })
        XCTAssertEqual(piece.transcription?.language, "ko")
        XCTAssertEqual(piece.audioTranslations?["fr"]?.url, attendue.url)
        XCTAssertEqual(piece.audioTranslations?["fr"]?.segments?.count, attendue.segments?.count)
    }

    /// Un dossier où chaque média des fixtures existe — le script de capture y dépose les vrais.
    private static func dossierDeMedias(_ f: VitrineFixtures) throws -> URL {
        let dossier = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString, isDirectory: true)
        try FileManager.default.createDirectory(at: dossier, withIntermediateDirectories: true)
        for media in f.medias { try Data([0]).write(to: dossier.appendingPathComponent(media.fichier)) }
        return dossier
    }
```

Compléter les deux doublures du même fichier :

```swift
@MainActor
private final class CiblesEnregistreuses: VitrineSeedTargets {
    nonisolated deinit {}

    struct MediaRange: Equatable {
        let cle: String
        let genre: VitrineFixtures.Media.Genre
    }

    private(set) var conversations: [MeeshyConversation] = []
    private(set) var languesParLot: [[String]] = []
    private(set) var cleProgression: String?
    private(set) var modes: [String: ReadingModeOrchestrator.ConversationReadingMode] = [:]
    private(set) var modesUserId: String?
    private(set) var medias: [MediaRange] = []
    private(set) var fil: [FeedPost] = []
    private(set) var cleDuFil: String?

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws { self.conversations = conversations }
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws { languesParLot.append(langues) }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws { cleProgression = cle }
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        modes[conversationId] = mode
        modesUserId = userId
    }
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async { medias.append(MediaRange(cle: cle, genre: genre)) }
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {
        fil = posts
        cleDuFil = cle
    }
}

@MainActor
private struct CiblesMessagesReels: VitrineSeedTargets {
    let persistence: MessagePersistenceActor

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws {}
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws {
        try await persistence.upsertFromAPIMessages(messages, preferredLanguages: langues)
    }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws {}
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {}
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async {}
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {}
}
```

Dans `apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift` :

```swift
    func test_dossierMedias_livesInTheVitrineFolder() {
        XCTAssertEqual(VitrineLaunch.dossierMedias.lastPathComponent, "medias")
        XCTAssertEqual(VitrineLaunch.dossierMedias.deletingLastPathComponent().standardizedFileURL, VitrineLaunch.dossier.standardizedFileURL)
    }
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSeederTests VitrineLaunchTests`
Expected: échec de compilation — `remplirLesCaches`, `enregistrerMedia`, `enregistrerFil`, `mediaAbsent`, `dossierMedias` n'existent pas.

- [ ] **Step 3: Write minimal implementation**

Dans `VitrineLaunch.swift`, après `fichierFixtures` :

```swift
    /// Là où le script de capture dépose les photos et les vocaux.
    static var dossierMedias: URL { dossier.appendingPathComponent("medias", isDirectory: true) }
```

Remplacer `apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift` par :

```swift
#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSeederErreur: Error, Equatable {
    case listeRefusee
    case mediaAbsent(String)
}

/// Là où la vitrine écrit : les VRAIES bases de l'app en direct, des doublures en test.
@MainActor
protocol VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String)
    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async
    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws
}

/// Les écritures EXISTANTES de l'app — celles qu'emprunte le réseau réel. La liste passe par le
/// point d'écriture réconcilié du moteur de synchronisation, comme après un `fullSync`.
@MainActor
struct VitrineSeedTargetsReels: VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws {
        guard await ConversationSyncEngine.shared.debugVitrineSaveList(conversations) else {
            throw VitrineSeederErreur.listeRefusee
        }
    }

    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws {
        try await DependencyContainer.shared.messagePersistence.upsertFromAPIMessages(messages, preferredLanguages: langues)
    }

    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws {
        try await CacheCoordinator.shared.engagementProgress.save([progression], for: cle)
    }

    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        ReadingModePreferenceStore().setMode(mode, for: conversationId, scope: .registered(userId: userId))
    }

    func enregistrerMedia(_ fichier: URL, genre: VitrineFixtures.Media.Genre, cle: String) async {
        switch genre {
        case .image: await CacheCoordinator.shared.images.seed(copyingLocalFile: fichier, for: cle)
        case .audio: await CacheCoordinator.shared.audio.seed(copyingLocalFile: fichier, for: cle)
        }
    }

    func enregistrerFil(_ posts: [FeedPost], cle: String) async throws {
        try await CacheCoordinator.shared.feed.save(posts, for: cle)
    }
}

@MainActor
enum VitrineSeeder {
    static let cleDuFil = "main-feed"

    /// La clé sous laquelle les vues lisent un média (`CachedAsyncImage`, `AudioPlaybackManager`,
    /// l'atelier Imagine) : face à l'hôte mort, l'URL relative elle-même.
    static func cleDeCache(_ url: String) -> String {
        MeeshyConfig.resolveMediaURL(url)?.absoluteString ?? url
    }

    /// AVANT la restauration de la session : ce que les racines lisent dès leur montage — les
    /// médias et le fil de l'iPad (#8922). Un média manquant arrête la vitrine : l'écran irait le
    /// chercher sur l'hôte mort et montrerait une vignette vide.
    static func remplirLesCaches(_ fixtures: VitrineFixtures, medias dossier: URL, dans cibles: some VitrineSeedTargets) async throws {
        for media in fixtures.medias {
            let fichier = dossier.appendingPathComponent(media.fichier)
            guard FileManager.default.fileExists(atPath: fichier.path) else { throw VitrineSeederErreur.mediaAbsent(media.fichier) }
            await cibles.enregistrerMedia(fichier, genre: media.genre, cle: cleDeCache(media.url))
        }
        let langues = [fixtures.lang]
        try await cibles.enregistrerFil(fixtures.posts.map { $0.toFeedPost(preferredLanguages: langues) }, cle: cleDuFil)
    }

    static func remplir(_ fixtures: VitrineFixtures, dans cibles: some VitrineSeedTargets) async throws {
        let userId = fixtures.lecteur.id
        try await cibles.enregistrerConversations(fixtures.conversationsServies())
        for conversationId in fixtures.messages.keys.sorted() {
            try await cibles.enregistrerMessages(fixtures.messages[conversationId] ?? [], langues: [fixtures.lang])
        }
        try await cibles.enregistrerProgression(fixtures.progression, cle: "engagement:\(userId)")
        for (conversationId, brut) in fixtures.modesDeLecture.sorted(by: { $0.key < $1.key }) {
            guard let mode = ReadingModeOrchestrator.ConversationReadingMode(rawValue: brut) else { continue }
            cibles.fixerModeDeLecture(mode, conversationId: conversationId, userId: userId)
        }
    }
}
#endif
```

Dans `VitrineStage.swift`, après `preparer()` :

```swift
    /// Juste après `CacheCoordinator.shared.start()`, AVANT la restauration de la session : le cache
    /// est déjà lié au compte du lecteur (`activeUserId` relit le trousseau que `preparer` vient
    /// d'écrire), et les racines lisent le fil et les médias dès leur montage (#8922).
    static func remplirLesCaches() async {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        do {
            try await VitrineSeeder.remplirLesCaches(f, medias: VitrineLaunch.dossierMedias, dans: VitrineSeedTargetsReels())
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » : fil et médias impossibles à ranger — \(error)")
        }
    }
```

Dans `apps/ios/Meeshy/MeeshyApp.swift`, juste après `await CacheCoordinator.shared.start()` :

```swift
                    #if DEBUG
                    // Vitrine (#8855, #8922) : le fil et les médias sont rangés AVANT que la
                    // restauration de la session ne monte les racines qui les lisent.
                    await VitrineStage.remplirLesCaches()
                    #endif
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSeederTests VitrineLaunchTests VitrineFixturesTests VitrineSourceGuardTests FileSizeBudgetGuardTests`
Expected: `TEST SUCCEEDED`. Si `test_remplir_voiceNoteAndItsTrack_areReadBackByTheRealReadPaths` échoue, la persistance jette une partie de la pièce : c'est un défaut de la vitrine ou de l'app, à suivre par superpowers:systematic-debugging, jamais en affaiblissant le témoin.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift apps/ios/Meeshy/MeeshyApp.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift
git commit -m "feat(vitrine): le fil et les médias rangés avant le montage des racines, la liste sans cadenas (Refs #8855, #8922)"
```

---

### Task 5: « prêt » ne tombe que sur un écran rendu (#8921)

**Files:**
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift`
- Modify: `apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift` (`markAsRead`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/ProgressionView.swift` (`.task`)
- Modify: `apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift` (fin de `body`)
- Modify: `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift`
- Modify: `scripts/marketing-kit/vitrine/tests-sdk.sh`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift`, `packages/MeeshySDK/Tests/MeeshyUITests/JoinFlowViewModelVitrineTests.swift`, `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift`

**Interfaces:**
- Consumes: `VitrineFixtures.destination(_:)`, `.conversationsServies()` (Tâche 3).
- Produces: `VitrineEvenement` (`.conversation(String)`, `.progression`, `.lien`, `.fil`), `VitrineAppareil` (`.iphone`, `.ipad`), `VitrineScene.rendusAttendus(conversationId: String?, appareil: VitrineAppareil) -> Set<VitrineEvenement>`, `VitrineRendu(actif: Bool)` et `VitrineRendu.shared` avec `signaler(_:)`, `conversationAffichee(_:visibles:)`, `attendre(_:) async`, `observes`, `conversation` (le `ConversationViewModel` affiché, faible) ; `VitrineStage.pose` (800 ms), `VitrineStage.appareil` ; `JoinFlowViewModel.debugOnPreviewShown: (@MainActor @Sendable () -> Void)?`.

- [ ] **Step 1: Write the failing tests**

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift
import XCTest
@testable import Meeshy

/// « prêt » ne part qu'une fois la destination RENDUE (#8921), jamais au bout d'une minuterie.
@MainActor
final class VitrineRenduTests: XCTestCase {
    func test_attendre_returnsOnlyOnceTheAwaitedRenderIsObserved() async {
        let rendu = VitrineRendu(actif: true)
        let drapeau = Drapeau()
        let attente = Task { await rendu.attendre([.progression]); drapeau.leve = true }
        await laisserTourner()
        XCTAssertFalse(drapeau.leve)
        rendu.signaler(.fil)
        await laisserTourner()
        XCTAssertFalse(drapeau.leve, "Un autre écran rendu ne libère pas la scène.")
        rendu.signaler(.progression)
        await attente.value
        XCTAssertTrue(drapeau.leve)
    }

    func test_attendre_aRenderAlreadyObserved_returnsAtOnce() async {
        let rendu = VitrineRendu(actif: true)
        rendu.signaler(.fil)
        await rendu.attendre([.fil])
        XCTAssertEqual(rendu.observes, [.fil])
    }

    func test_signaler_outsideTheVitrine_observesNothing() {
        let rendu = VitrineRendu(actif: false)
        rendu.signaler(.progression)
        XCTAssertTrue(rendu.observes.isEmpty)
    }

    /// Sur iPad, sans conversation ouverte, la racine montre le fil à gauche (#8922).
    func test_rendusAttendus_progressionOnIPad_alsoWaitsForTheFeed() {
        XCTAssertEqual(VitrineScene.progression.rendusAttendus(conversationId: nil, appareil: .iphone), [.progression])
        XCTAssertEqual(VitrineScene.progression.rendusAttendus(conversationId: nil, appareil: .ipad), [.progression, .fil])
    }

    func test_rendusAttendus_globalWaitsForItsConversation_lienForItsPreview() {
        XCTAssertEqual(VitrineScene.global.rendusAttendus(conversationId: "c1", appareil: .iphone), [.conversation("c1")])
        XCTAssertEqual(VitrineScene.lien.rendusAttendus(conversationId: nil, appareil: .ipad), [.lien])
    }

    /// Sans conversation connue, la scène attend un rendu qui ne viendra jamais : la capture échoue
    /// en la nommant plutôt que de photographier autre chose.
    func test_rendusAttendus_unknownConversation_isNeverSatisfied() {
        XCTAssertEqual(VitrineScene.global.rendusAttendus(conversationId: nil, appareil: .iphone), [.conversation("")])
    }

    private func laisserTourner() async {
        for _ in 0..<10 { await Task.yield() }
    }
}

@MainActor
private final class Drapeau {
    var leve = false
}
```

```swift
// packages/MeeshySDK/Tests/MeeshyUITests/JoinFlowViewModelVitrineTests.swift
import XCTest
@testable import MeeshySDK
@testable import MeeshyUI

/// La vitrine (#8855) capture l'accueil d'un lien une fois son aperçu SERVI (#8921).
final class JoinFlowViewModelVitrineTests: XCTestCase {
    override func tearDown() {
        JoinFlowViewModel.debugOnPreviewShown = nil
        ShareLinkService.debugLinkInfoOverride = nil
        super.tearDown()
    }

    @MainActor
    func test_loadLinkInfo_announcesThePreviewOnceTheLinkIsServed() async throws {
        let info = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? info : nil }
        let annonces = Annonces()
        JoinFlowViewModel.debugOnPreviewShown = { annonces.nombre += 1 }

        let viewModel = JoinFlowViewModel(identifier: "lisboa-2026")
        await viewModel.loadLinkInfo()

        XCTAssertEqual(viewModel.phase, .preview)
        XCTAssertEqual(annonces.nombre, 1)
    }

    @MainActor
    func test_loadLinkInfo_straightToTheForm_announcesNoPreview() async throws {
        let info = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? info : nil }
        let annonces = Annonces()
        JoinFlowViewModel.debugOnPreviewShown = { annonces.nombre += 1 }

        let viewModel = JoinFlowViewModel(identifier: "lisboa-2026", entry: .anonymousForm)
        await viewModel.loadLinkInfo()

        XCTAssertEqual(annonces.nombre, 0)
    }

    private static func info(linkId: String) throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"LINK","conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
            .replacingOccurrences(of: "LINK", with: linkId)
        return try APIClient.makeAPIPayloadDecoder().decode(ShareLinkInfo.self, from: Data(json.utf8))
    }
}

@MainActor
private final class Annonces {
    var nombre = 0
}
```

Dans `VitrineSourceGuardTests.test_everyVitrineReference_outsideItsFolder_isInsideADebugBlock`, étendre la liste et les motifs :

```swift
        let fichiers = [
            "apps/ios/Meeshy/MeeshyApp.swift",
            "apps/ios/Meeshy/Features/Main/Components/SyncPill.swift",
            "apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift",
            "apps/ios/Meeshy/Features/Main/Views/ProgressionView.swift",
            "apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Configuration/MeeshyConfig.swift",
            "packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift",
        ]
```

```swift
                guard ["Vitrine", "debugLinkInfoOverride", "debugWebOriginOverride", "debugOnPreviewShown"].contains(where: { ligne.contains($0) }) else { continue }
```

Dans `scripts/marketing-kit/vitrine/tests-sdk.sh`, remplacer la boucle `ONLY` pour accepter `Cible/Classe` :

```bash
ONLY=()
for classe in "$@"; do
  case "$classe" in
    */*) ONLY+=("-only-testing:$classe") ;;
    *) ONLY+=("-only-testing:MeeshySDKTests/$classe") ;;
  esac
done
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh MeeshyUITests/JoinFlowViewModelVitrineTests`
Expected: échec de compilation — `debugOnPreviewShown` n'existe pas.

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineRenduTests VitrineSourceGuardTests`
Expected: échec de compilation — `VitrineRendu` n'existe pas (la garde, elle, rougirait sur les fichiers nouvellement listés qui ne mentionnent pas encore la vitrine).

- [ ] **Step 3: Write minimal implementation**

```swift
// apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift
#if DEBUG
import Foundation

/// Ce qu'un écran annonce une fois RENDU (#8921) : « prêt » n'en part qu'après l'avoir observé.
nonisolated enum VitrineEvenement: Hashable, Sendable {
    /// Une conversation dont `markAsRead` a reçu des bulles VISIBLES.
    case conversation(String)
    case progression
    case lien
    case fil
}

nonisolated enum VitrineAppareil: Sendable {
    case iphone
    case ipad
}

extension VitrineScene {
    /// Les rendus qui prouvent la scène. Sur iPad, sans conversation ouverte, la racine montre le
    /// fil à gauche (#8922) : il doit être peint lui aussi. Une conversation inconnue n'est jamais
    /// observée : la capture échoue en nommant la scène plutôt que de photographier autre chose.
    nonisolated func rendusAttendus(conversationId: String?, appareil: VitrineAppareil) -> Set<VitrineEvenement> {
        switch self {
        case .global: return [.conversation(conversationId ?? "")]
        case .progression: return appareil == .ipad ? [.progression, .fil] : [.progression]
        case .lien: return [.lien]
        }
    }
}

/// Le relais entre les écrans et la scène : les écrans SIGNALENT, la scène ATTEND.
@MainActor
final class VitrineRendu {
    static let shared = VitrineRendu(actif: VitrineLaunch.isActive)

    private let actif: Bool
    private(set) var observes: Set<VitrineEvenement> = []
    /// La conversation affichée : la scène y fait le geste du lecteur.
    private(set) weak var conversation: ConversationViewModel?
    private var attentes: [(attendus: Set<VitrineEvenement>, suite: CheckedContinuation<Void, Never>)] = []

    init(actif: Bool) {
        self.actif = actif
    }

    func signaler(_ evenement: VitrineEvenement) {
        guard actif, observes.insert(evenement).inserted else { return }
        let comblees = attentes.filter { $0.attendus.isSubset(of: observes) }
        attentes.removeAll { $0.attendus.isSubset(of: observes) }
        comblees.forEach { $0.suite.resume() }
    }

    func conversationAffichee(_ viewModel: ConversationViewModel, visibles: [String]) {
        guard actif, !visibles.isEmpty else { return }
        conversation = viewModel
        signaler(.conversation(viewModel.conversationId))
    }

    func attendre(_ attendus: Set<VitrineEvenement>) async {
        guard !attendus.isSubset(of: observes) else { return }
        await withCheckedContinuation { attentes.append((attendus, $0)) }
    }
}
#endif
```

Dans `VitrineStage.swift` :

- ajouter `import MeeshyUI` et `import UIKit` aux imports ;
- ajouter, sous `originePublique` :

```swift
    /// Le temps qu'une transition ou un ressort se pose, une fois le rendu observé.
    static let pose: Duration = .milliseconds(800)

    static var appareil: VitrineAppareil { UIDevice.current.userInterfaceIdiom == .pad ? .ipad : .iphone }
```

- dans `preparer()`, remplacer `servir(f.lienInvitation, pour: scene)` par `servir(f.lienInvitation)`, et la branche sans session par :

```swift
            } else {
                VitrineSession.retirer()
                JoinFlowViewModel.debugOnPreviewShown = { VitrineRendu.shared.signaler(.lien) }
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: f.lienInvitation.linkId)
                Task {
                    await VitrineRendu.shared.attendre(scene.rendusAttendus(conversationId: nil, appareil: appareil))
                    await annoncer(scene)
                }
            }
```

- remplacer `ouvrir(apres:)`, `servir`, `montrer` et `marquerPret` par :

```swift
    /// Posté sous le voile du lancement, un ordre d'ouverture n'aurait encore aucun abonné :
    /// l'écran de la scène s'ouvre une fois le voile parti, et « prêt » attend son rendu.
    static func ouvrir(apres voile: Published<LaunchSplashController.Phase>.Publisher) {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        Task {
            guard await attendreLaRacine(voile.values) else { return }
            let destination = f.destination(scene)
            montrer(scene, destination, f)
            await VitrineRendu.shared.attendre(scene.rendusAttendus(conversationId: destination?.conversationId, appareil: appareil))
            await annoncer(scene)
        }
    }

    private static func servir(_ lien: ShareLinkInfo) {
        ShareLinkService.debugLinkInfoOverride = { identifiant in identifiant == lien.linkId ? lien : nil }
    }

    private static func montrer(_ scene: VitrineScene, _ destination: VitrineFixtures.Destination?, _ f: VitrineFixtures) {
        switch scene {
        case .global:
            guard let conversation = f.conversationsServies().first(where: { $0.id == destination?.conversationId }) else {
                fatalError("Vitrine « \(scene.rawValue) » : sa conversation manque aux fixtures")
            }
            NotificationCenter.default.post(name: .navigateToConversation, object: conversation)
        case .progression:
            NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "progression")
        case .lien:
            break
        }
    }

    /// Le rendu est observé ; « prêt » tombe une fois la pose passée.
    private static func annoncer(_ scene: VitrineScene) async {
        try? await Task.sleep(for: pose)
        try? FileManager.default.createDirectory(at: VitrineLaunch.dossier, withIntermediateDirectories: true)
        try? Data(scene.rawValue.utf8).write(to: VitrineLaunch.marqueurPret)
    }
```

Dans `ConversationViewModel.swift`, en tête de `markAsRead(messageIds:visibleIds:)` :

```swift
    func markAsRead(messageIds: [String]? = nil, visibleIds: [String] = []) {
        #if DEBUG
        VitrineRendu.shared.conversationAffichee(self, visibles: visibleIds)
        #endif
        afterReadVisit.note(displayed: (messageIds ?? []) + visibleIds, among: messages)
```

Dans `ProgressionView.swift`, remplacer `.task { await viewModel.load() }` par :

```swift
        .task {
            await viewModel.load()
            #if DEBUG
            if viewModel.progress != nil { VitrineRendu.shared.signaler(.progression) }
            #endif
        }
```

Dans `FeedPostCard.swift`, à la fin de la chaîne de `body` :

```swift
        .audioFullscreenCover($audioFullscreen, accentColor: accentColor)
        .mediaSaveFlow(mediaSaveCoordinator)
        #if DEBUG
        .onAppear { VitrineRendu.shared.signaler(.fil) }
        #endif
    }
```

Dans `packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift`, sous `private let shareLinkService = ShareLinkService.shared` :

```swift
    #if DEBUG
    /// Vitrine App Store (#8855, DEBUG uniquement) : prévenue quand l'aperçu d'un lien est servi,
    /// pour que la capture attende l'accueil RENDU (#8921). `nil` hors vitrine.
    nonisolated(unsafe) public static var debugOnPreviewShown: (@MainActor @Sendable () -> Void)?
    #endif
```

et dans `loadLinkInfo()` :

```swift
            linkInfo = info
            phase = entry == .anonymousForm ? .form : .preview
            #if DEBUG
            if phase == .preview { Self.debugOnPreviewShown?() }
            #endif
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh MeeshyUITests/JoinFlowViewModelVitrineTests ShareLinkServiceVitrineTests`
Expected: `TEST SUCCEEDED`.

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineRenduTests VitrineStageTests VitrineSourceGuardTests FileSizeBudgetGuardTests`
Expected: `TEST SUCCEEDED`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift apps/ios/Meeshy/Features/Main/ViewModels/ConversationViewModel.swift apps/ios/Meeshy/Features/Main/Views/ProgressionView.swift apps/ios/Meeshy/Features/Main/Views/FeedPostCard.swift packages/MeeshySDK/Sources/MeeshyUI/JoinFlow/JoinFlowViewModel.swift packages/MeeshySDK/Tests/MeeshyUITests/JoinFlowViewModelVitrineTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift scripts/marketing-kit/vitrine/tests-sdk.sh apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(vitrine): « prêt » ne tombe que sur un écran rendu — conversation affichée, progression chargée, aperçu du lien servi, fil peint (Refs #8855, #8921)"
```

---

### Task 6: La demande Imagine d'un message a un site unique

**Files:**
- Modify: `apps/ios/Meeshy/Features/Main/Export/MessageCardExportMenu.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageExport.swift`
- Test: `apps/ios/MeeshyTests/Unit/Components/ImagerAccessTests.swift`

**Interfaces:**
- Produces: `MessageCardExportMenu.request(message: Message, translations: [MessageTranslation], servedText: String?, viewer: MessageCardSubject.Viewer, handle: String?, quotedMessage: Message?, conversationTitle: String?, accentColor: String, quick: Bool) -> MessageCardExportRequest?` — la conversation et la vitrine (Tâche 7) construisent la même carte.

- [ ] **Step 1: Write the failing test**

Dans `ImagerAccessTests.swift`, avant `test_comment_imagesTheServedText` :

```swift
    func test_message_imagesTheTextThePrismServes_andOffersItsOriginal() throws {
        let message = MeeshyMessage(id: "m1", conversationId: "c1", senderId: "u-giulia", content: "Ciao a tutti", originalLanguage: "it", senderName: "Giulia", senderUsername: "giulia.r")
        let francais = MessageTranslation(id: "t1", messageId: "m1", sourceLanguage: "it", targetLanguage: "FR", translatedContent: "Salut tout le monde", translationModel: nil, confidenceScore: nil)
        let request = try XCTUnwrap(MessageCardExportMenu.request(
            message: message, translations: [francais], servedText: "Salut tout le monde", viewer: viewer(), handle: "moi",
            quotedMessage: nil, conversationTitle: "Pizza Night 🍕", accentColor: "#6366F1", quick: false
        ))
        XCTAssertEqual(request.subject.reply.text, "Salut tout le monde")
        XCTAssertEqual(request.languages.first, "it")
        XCTAssertTrue(request.languages.contains("fr"), "La traduction se range sous son code en minuscules.")
        XCTAssertEqual(request.subjectIn("it")?.reply.text, "Ciao a tutti")
        XCTAssertEqual(request.conversationTitle, "Pizza Night 🍕")
        XCTAssertEqual(request.handle, "moi")
        XCTAssertFalse(request.quick)
    }

    func test_message_withNothingToPaint_isNeverImaged() {
        let vide = MeeshyMessage(id: "m2", conversationId: "c1", senderId: "u-x", content: "", originalLanguage: "fr")
        XCTAssertNil(MessageCardExportMenu.request(
            message: vide, translations: [], servedText: nil, viewer: viewer(), handle: nil,
            quotedMessage: nil, conversationTitle: nil, accentColor: "#6366F1", quick: false
        ))
    }
```

- [ ] **Step 2: Run test to verify it fails**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh ImagerAccessTests`
Expected: échec de compilation — `request(message:…)` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

Dans `MessageCardExportMenu.swift`, avant `request(comment:…)` :

```swift
    /// **Un message devient une carte** (#8692) : le texte que le Prisme sert au lecteur, ou
    /// l'original, ses médias — et ceux du message cité quand il est en mémoire (#8901) — puis la
    /// carte de chaque langue où il existe. `nil` pour un message que rien ne peint. Site unique
    /// de la conversation et de la vitrine (#8855).
    static func request(message: Message, translations: [MessageTranslation], servedText: String?, viewer: MessageCardSubject.Viewer, handle: String?, quotedMessage: Message?, conversationTitle: String?, accentColor: String, quick: Bool) -> MessageCardExportRequest? {
        let texts = Dictionary(translations.map { ($0.targetLanguage.lowercased(), $0.translatedContent) }, uniquingKeysWith: { first, _ in first })
        let quotedAt = quotedMessage?.createdAt
        guard let subject = MessageCardSubject.of(
            message: message, servedText: servedText, translations: texts, viewer: viewer,
            quotedAt: quotedAt, quotedMessage: quotedMessage, now: Date()
        ) else { return nil }
        return MessageCardExportRequest(
            subject: subject,
            languages: MessageCardSubject.languages(of: message, translations: texts),
            subjectIn: { language in
                MessageCardSubject.of(
                    message: message, servedText: servedText, translations: texts,
                    viewer: viewer, language: language, quotedAt: quotedAt, quotedMessage: quotedMessage, now: Date()
                )
            },
            handle: handle,
            conversationTitle: conversationTitle,
            accentColor: accentColor,
            quick: quick
        )
    }
```

Remplacer le corps de `beginMessageExport(_:quick:)` dans `ConversationView+MessageExport.swift` :

```swift
    func beginMessageExport(_ message: Message, quick: Bool) {
        let user = AuthManager.shared.currentUser
        guard let request = MessageCardExportMenu.request(
            message: message,
            translations: viewModel.messageTranslations[message.id] ?? [],
            servedText: viewModel.preferredTranslation(for: message.id)?.translatedContent,
            viewer: MessageCardSubject.Viewer(id: user?.id ?? "", displayName: user?.displayName, username: user?.username),
            handle: user?.username,
            quotedMessage: message.replyTo.flatMap { reference in viewModel.messages.first { $0.id == reference.messageId } },
            conversationTitle: conversation?.title,
            accentColor: accentColor,
            quick: quick
        ) else {
            FeedbackToastManager.shared.showError(
                String(localized: "export.announce.failed", defaultValue: "Impossible de créer l’image", bundle: .main)
            )
            return
        }
        MessageCardExportPresenter.present(request)
    }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh ImagerAccessTests ImagineWorkshopTests`
Expected: `TEST SUCCEEDED`. Si `test_message_withNothingToPaint_isNeverImaged` échoue, `MessageCardSubject.of` peint un message vide : c'est ce que faisait déjà `beginMessageExport`, et le témoin se relit contre `MessageCardImagineTests` avant toute décision (ruling au registre).

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Main/Export/MessageCardExportMenu.swift apps/ios/Meeshy/Features/Main/Views/ConversationView+MessageExport.swift apps/ios/MeeshyTests/Unit/Components/ImagerAccessTests.swift
git commit -m "refactor(imagine): la demande d'un message a un site unique, que la vitrine emprunte (Refs #8855)"
```

---

### Task 7: Les trois scènes — le vocal, l'original, Imagine

**Files:**
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift`
- Modify: `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift`
- Modify: `apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift`, `apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift`, `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift`

**Interfaces:**
- Consumes: `VitrineRendu.shared.conversation` et `.attendre(_:)` (Tâche 5) ; `MessageCardExportMenu.request(message:…)` (Tâche 6) ; `VitrineFixtures.destination(_:)` et `.conversationsServies()` (Tâche 3) ; `ConversationViewModel.playAudio(attachmentId:)`, `.setBubbleActiveDisplayLanguage(_:for:)`, `.messages`, `.messageTranslations`, `.preferredTranslation(for:)` ; `ConversationAudioCoordinator.shared.$currentTime`.
- Produces: `VitrineScene.amour`, `.groupe`, `.imagine` ; `VitrineEvenement.imagine` ; `MessageCardExportSheet.mediaArePainted`.

- [ ] **Step 1: Write the failing tests**

Dans `VitrineLaunchTests.swift` :

```swift
    func test_scene_lot2Scenes_openASession() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "amour"]), .amour)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "groupe"]), .groupe)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "imagine"]), .imagine)
        XCTAssertTrue([VitrineScene.amour, .groupe, .imagine].allSatisfy(\.ouvreUneSession))
    }
```

Dans `VitrineRenduTests.swift` :

```swift
    func test_rendusAttendus_conversationScenesWaitForTheirConversation() {
        for scene in [VitrineScene.amour, .groupe, .imagine] {
            XCTAssertEqual(scene.rendusAttendus(conversationId: "c2", appareil: .ipad), [.conversation("c2")], "\(scene)")
        }
    }
```

Dans `VitrineSourceGuardTests`, ajouter à la liste des fichiers :

```swift
            "apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift",
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineRenduTests VitrineSourceGuardTests`
Expected: échec de compilation — `.amour`, `.groupe`, `.imagine` n'existent pas.

- [ ] **Step 3: Write minimal implementation**

Dans `VitrineLaunch.swift` :

```swift
nonisolated enum VitrineScene: String, CaseIterable, Sendable {
    case amour
    case groupe
    case global
    case lien
    case progression
    case imagine

    /// La scène « lien » montre ce que voit un invité SANS compte.
    var ouvreUneSession: Bool { self != .lien }
}
```

Dans `VitrineRendu.swift`, ajouter `case imagine` à `VitrineEvenement` (commentaire : `/// La carte d'Imagine peinte, médias compris.`), et dans `rendusAttendus` :

```swift
        case .global, .amour, .groupe, .imagine: return [.conversation(conversationId ?? "")]
```

(en remplacement de la ligne `case .global:`).

Dans `MessageCardExportSheet.swift`, près de `render()` :

```swift
    /// Les pixels des médias sont là, et aucun n'a échoué : la carte montre ce qui partira.
    private var mediaArePainted: Bool {
        request.subject.media.isEmpty || (mediaVersion > 0 && loadedMedia.failed.isEmpty)
    }
```

et, dans `render()`, remplacer le bloc de l'export rapide par :

```swift
        // L'export rapide attend les pixels des médias : il ne part jamais
        // avec leurs couleurs d'attente.
        // Un média en échec retient l'export rapide : l'atelier le dit et attend « Réessayer ».
        if request.quick && !quickSent && mediaArePainted {
            quickSent = true
            save()
        }
        #if DEBUG
        if mediaArePainted { VitrineRendu.shared.signaler(.imagine) }
        #endif
```

Dans `VitrineStage.swift`, `montrer` ouvre la conversation de chaque scène de conversation — le bloc `case .global:` de la Tâche 5 devient :

```swift
        case .global, .amour, .groupe, .imagine:
            guard let conversation = f.conversationsServies().first(where: { $0.id == destination?.conversationId }) else {
                fatalError("Vitrine « \(scene.rawValue) » : sa conversation manque aux fixtures")
            }
            NotificationCenter.default.post(name: .navigateToConversation, object: conversation)
```

`ouvrir(apres:)` fait le geste de la scène entre le rendu et l'annonce — ses trois dernières lignes deviennent :

```swift
            await VitrineRendu.shared.attendre(scene.rendusAttendus(conversationId: destination?.conversationId, appareil: appareil))
            await achever(scene, destination, f)
            await annoncer(scene)
```

et le geste lui-même :

```swift
    /// Ce que la scène FAIT une fois sa conversation affichée — le geste qu'y ferait le lecteur.
    private static func achever(_ scene: VitrineScene, _ destination: VitrineFixtures.Destination?, _ f: VitrineFixtures) async {
        switch scene {
        case .amour: await faireEntendre(destination)
        case .groupe: rouvrirSurLOriginal(destination)
        case .imagine: await imaginer(destination, f)
        case .global, .progression, .lien: break
        }
    }

    /// Le vocal part comme sous le doigt du lecteur (`playAudio` : la piste que sert le Prisme) ;
    /// la scène est prête quand le karaoké a quitté le premier mot.
    private static func faireEntendre(_ destination: VitrineFixtures.Destination?) async {
        guard let conversation = VitrineRendu.shared.conversation, let attachmentId = destination?.attachmentId else {
            fatalError("Vitrine « amour » : aucun vocal à faire entendre")
        }
        conversation.playAudio(attachmentId: attachmentId)
        for await instant in ConversationAudioCoordinator.shared.$currentTime.values where instant >= 1 { break }
    }

    /// Le Prisme à un tap : ce message-là se relit dans la langue où il a été écrit.
    private static func rouvrirSurLOriginal(_ destination: VitrineFixtures.Destination?) {
        guard let conversation = VitrineRendu.shared.conversation, let messageId = destination?.messageId,
              let message = conversation.messages.first(where: { $0.id == messageId }) else {
            fatalError("Vitrine « groupe » : le message à rouvrir sur son original manque")
        }
        conversation.setBubbleActiveDisplayLanguage(message.originalLanguage, for: messageId)
    }

    /// L'atelier Imagine sur le message, tel que la conversation l'ouvre ; prête quand la carte est peinte.
    private static func imaginer(_ destination: VitrineFixtures.Destination?, _ f: VitrineFixtures) async {
        guard let vue = VitrineRendu.shared.conversation, let messageId = destination?.messageId,
              let message = vue.messages.first(where: { $0.id == messageId }),
              let conversation = f.conversationsServies().first(where: { $0.id == destination?.conversationId }),
              let request = MessageCardExportMenu.request(
                  message: message,
                  translations: vue.messageTranslations[messageId] ?? [],
                  servedText: vue.preferredTranslation(for: messageId)?.translatedContent,
                  viewer: MessageCardSubject.Viewer(id: f.lecteur.id, displayName: f.lecteur.displayName, username: f.lecteur.username),
                  handle: f.lecteur.username,
                  quotedMessage: nil,
                  conversationTitle: conversation.title,
                  accentColor: conversation.accentColor,
                  quick: false
              ) else {
            fatalError("Vitrine « imagine » : le message à imaginer manque")
        }
        MessageCardExportPresenter.present(request)
        await VitrineRendu.shared.attendre([.imagine])
    }
```

Ces trois gestes pilotent des singletons réels (coordinateur audio, présentateur, modèle de conversation) : leur témoin est la capture de la Tâche 9, où chaque scène doit devenir prête et montrer l'état attendu.

- [ ] **Step 4: Run tests to verify they pass**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineRenduTests VitrineStageTests VitrineSourceGuardTests ImagineWorkshopTests FileSizeBudgetGuardTests`
Expected: `TEST SUCCEEDED`.

- [ ] **Step 5: Commit**

```bash
git add apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift apps/ios/Meeshy/Features/Vitrine/VitrineRendu.swift apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift apps/ios/Meeshy/Features/Main/Export/MessageCardExportSheet.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineRenduTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift
git commit -m "feat(vitrine): trois scènes — le vocal joué dans la langue du lecteur, un message rouvert sur son original, Imagine (Refs #8855)"
```

---

### Task 8: La capture dépose les médias ; le jeu suit le storyboard

**Files:**
- Modify: `scripts/marketing-kit/vitrine/capturer.mjs`
- Modify: `scripts/marketing-kit/templates/vitrine/plan.mjs`
- Test: `scripts/marketing-kit/test/vitrine-capture.test.mjs`, `scripts/marketing-kit/templates/vitrine/vitrine.test.mjs`

**Interfaces:**
- Consumes: `exporterVitrine({ lang, maintenant, mesures })` (Tâche 3) ; `synthetiser`, `lireVoix`, `fichierVoix`, `DOSSIER_PHOTOS` (Tâche 2).
- Produces: `fixturesMesurees({ lang, maintenant, mesurer }) → fixtures` ; `sourceDuMedia(media) → chemin`. `VITRINE.<appareil>.captures` = amour (L1), groupe (L2), global (L3), lien (L10), progression (L7), imagine (L13).

- [ ] **Step 1: Write the failing tests**

Dans `scripts/marketing-kit/test/vitrine-capture.test.mjs`, ajouter aux imports :

```js
import { existsSync } from 'node:fs'
import { exporterVitrine } from '../vitrine/fixtures.mjs'
```

et étendre l'import de `capturer.mjs` à `fixturesMesurees` et `sourceDuMedia`. Remplacer le premier test :

```js
  test('lot 2 : six scènes, dans l’ordre du storyboard, sur iPhone et iPad', () => {
    for (const appareil of ['iphone', 'ipad']) {
      expect(VITRINE[appareil].captures.map((c) => c.scene)).toEqual(['amour', 'groupe', 'global', 'lien', 'progression', 'imagine'])
      expect(VITRINE[appareil].captures.map((c) => c.legende)).toEqual(['L1', 'L2', 'L3', 'L10', 'L7', 'L13'])
      for (const c of VITRINE[appareil].captures) expect(LEGENDES[c.legende]).toBeDefined()
    }
    expect([VITRINE.iphone.width, VITRINE.iphone.height]).toEqual([1320, 2868])
    expect([VITRINE.ipad.width, VITRINE.ipad.height]).toEqual([2064, 2752])
  })
```

Et ajouter :

```js
  test('les vocaux portent la durée MESURÉE de leur piste, karaoké compris', () => {
    const f = fixturesMesurees({ lang: 'fr', maintenant: new Date('2026-09-30T12:00:00.000Z'), mesurer: () => ({ dureeMs: 4321, taille: 999 }) })
    const vocal = f.messages[f.scenes.amour.conversationId].find((m) => m.id === f.scenes.amour.messageId)
    const piece = vocal.attachments[0]
    expect(piece.duration).toBe(4321)
    expect(piece.fileSize).toBe(999)
    expect(piece.translations.fr.durationMs).toBe(4321)
    expect(piece.translations.fr.segments.at(-1).endMs).toBe(4321)
  })

  test('chaque média a sa source sur le Mac : la photo du kit ou le vocal synthétisé', () => {
    const f = exporterVitrine({ lang: 'fr', maintenant: new Date('2026-09-30T12:00:00.000Z') })
    for (const media of f.medias.filter((m) => m.genre === 'image')) expect(existsSync(sourceDuMedia(media))).toBe(true)
    for (const media of f.medias.filter((m) => m.genre === 'audio')) expect(sourceDuMedia(media)).toMatch(/out\/vitrine\/voix\/[0-9a-f]{16}\.m4a$/)
  })
```

Dans `scripts/marketing-kit/templates/vitrine/vitrine.test.mjs`, la Progression est désormais cinquième :

```js
  test('la vraie capture remplit l’écran du cadre, sous le titre de sa scène', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 5, plan: VITRINE, ecranReel: PNG })
    expect(html).toContain(`<img class="ecran-reel" src="data:image/png;base64,${PNG.toString('base64')}"`)
    expect(html).toMatch(/class="device-screen"[\s\S]*class="ecran-reel"/)
    expect(html).toContain('Garde ta série')
  })

  test('Imagine a son titre', () => {
    expect(pageCapture({ appareil: 'iphone', lang: 'fr', rang: 6, plan: VITRINE, ecranReel: PNG })).toContain('Un message. Une image.')
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-capture.test.mjs templates/vitrine/vitrine.test.mjs`
Expected: FAIL — trois scènes au lieu de six, `fixturesMesurees` n'existe pas.

- [ ] **Step 3: Write minimal implementation**

`scripts/marketing-kit/templates/vitrine/plan.mjs` :

```js
// La vitrine #8855 sur les VRAIS écrans, dans l'ordre du storyboard validé (spec § 3). Lot 2 :
// six scènes ; les appels (3, 4, 10) et le composeur (8) arrivent aux lots suivants.
import { APPAREILS } from '../appstore/plan.mjs'

const dimensions = ({ width, height, scale, prefixe }) => ({ width, height, scale, prefixe })

const CAPTURES = [
  { scene: 'amour', legende: 'L1', theme: 'light' },
  { scene: 'groupe', legende: 'L2', theme: 'light' },
  { scene: 'global', legende: 'L3', theme: 'light', decor: 'bonjours' },
  { scene: 'lien', legende: 'L10', theme: 'light' },
  { scene: 'progression', legende: 'L7', theme: 'light' },
  { scene: 'imagine', legende: 'L13', theme: 'light' },
]

export const VITRINE = {
  iphone: { ...dimensions(APPAREILS.iphone), captures: CAPTURES },
  ipad: { ...dimensions(APPAREILS.ipad), captures: CAPTURES },
}
```

Dans `scripts/marketing-kit/vitrine/capturer.mjs`, étendre les imports :

```js
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { CREDITS } from '../lib/photos.mjs'
import { DOSSIER_PHOTOS, fichierVoix, lireVoix, synthetiser } from './medias.mjs'
```

Ajouter, après `cheminBrut` :

```js
// Les fixtures d'une langue, chaque vocal portant la durée et la taille MESURÉES de sa piste.
export const fixturesMesurees = ({ lang, maintenant, mesurer }) => {
  const provisoires = exporterVitrine({ lang, maintenant })
  const mesures = Object.fromEntries(provisoires.medias.filter((m) => m.genre === 'audio').map((m) => [m.url, mesurer(m)]))
  return exporterVitrine({ lang, maintenant, mesures })
}

// La source d'un média sur le Mac : la photo du kit, ou le vocal synthétisé.
export const sourceDuMedia = (media) => (media.genre === 'image' ? resolve(DOSSIER_PHOTOS, CREDITS[media.photo].fichier) : fichierVoix(media))

const deposer = (fixtures, dossier) => {
  const medias = resolve(dossier, 'medias')
  rmSync(medias, { recursive: true, force: true })
  mkdirSync(medias, { recursive: true })
  for (const media of fixtures.medias) copyFileSync(sourceDuMedia(media), resolve(medias, media.fichier))
  writeFileSync(resolve(dossier, 'fixtures.json'), JSON.stringify(fixtures))
}
```

Dans `capturer`, recevoir `voix` et remplacer l'écriture des fixtures :

```js
const capturer = async ({ udid, appareil, lang, capture, voix }) => {
```

```js
  rmSync(resolve(dossier, 'pret.txt'), { force: true })
  deposer(fixturesMesurees({ lang, maintenant: new Date(), mesurer: (media) => synthetiser(media, voix) }), dossier)
  simctl('launch', udid, BUNDLE, ...argumentsDeLancement({ scene, lang }))
```

Dans `main`, lire les voix une fois, avant la boucle, et les passer :

```js
  const voix = lireVoix(execFileSync('say', ['-v', '?'], { encoding: 'utf8' }))
```

```js
        console.log(`✓ ${await capturer({ udid: udids[appareil], appareil, lang, capture, voix })}`)
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-capture.test.mjs templates/vitrine/vitrine.test.mjs test/vitrine-fixtures.test.mjs test/vitrine-medias.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/marketing-kit/vitrine/capturer.mjs scripts/marketing-kit/templates/vitrine/plan.mjs scripts/marketing-kit/test/vitrine-capture.test.mjs scripts/marketing-kit/templates/vitrine/vitrine.test.mjs
git commit -m "feat(kit): la capture synthétise et dépose les médias ; six scènes dans l'ordre du storyboard (Refs #8855)"
```

---

### Task 9: Première preuve en français, fil de l'iPad dans les sept langues

**Files:**
- Aucun fichier source, sauf correctifs trouvés à la relecture (chacun avec son témoin, sa ligne au registre).

**Interfaces:**
- Consumes: tout ce qui précède.

- [ ] **Step 1: Les suites, en série**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test --timeout 30000`
Expected: PASS (relancer seul un fichier Playwright qui échoue au lancement de Chromium sous charge, et le noter).

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineFixturesTests VitrineSessionTests VitrineSeederTests VitrineStageTests VitrineRenduTests VitrineSourceGuardTests SyncPillTimerStateTests ImagerAccessTests ImagineWorkshopTests FileSizeBudgetGuardTests`
Expected: `TEST SUCCEEDED`.

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ConversationSyncEngineVitrineTests ConversationListCacheWriterGuardTests ShareLinkServiceVitrineTests ShareLinkServiceTests MeeshyConfigVitrineTests MeeshyUITests/JoinFlowViewModelVitrineTests`
Expected: `TEST SUCCEEDED`.

- [ ] **Step 2: Capturer le français, iPhone et iPad**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/vitrine/capturer.mjs --lang fr --appareil iphone,ipad --construire`
Expected: douze lignes `✓ …/out/vitrine/brut/<appareil>/fr/<scène>.png`, aucune « aucun signal « prêt » ».

- [ ] **Step 3: Relire chaque capture brute (outil Read sur chaque PNG)**

| Scène | Ce qui doit se voir | Ce qui ne doit PAS se voir |
|---|---|---|
| amour | Bulles ; conversation avec Min-jun ; les deux photos peintes ; le vocal en bas, transcription française, un mot du karaoké allumé, barre de lecture entamée | cadenas, vignette vide, séparateur « nouveaux messages », bandeau réseau |
| groupe | Script ; « Pizza Night 🍕 » ; tout en français sauf la réplique de Giulia, rouverte en italien avec sa langue signalée ; photos ; « 🔥 8 » | ✦, résumé, pastille de non-lus |
| global | comme au lot 1 | idem |
| lien | l'accueil de « Lisboa », prénom et « Rejoindre » | écran de chargement |
| progression | iPad : le fil à gauche (post d'Aiko en français, photo d'Osaka peinte) | « Impossible de charger le fil » |
| imagine | l'atelier, la carte peinte : photo de Séoul et « La vue ce soir… » en français | carte grise, média en échec |

Tout écart devient un correctif avec son témoin (superpowers:systematic-debugging), ou une issue du milestone « Lancement : campagne fandom et captures » quand il sort du périmètre du lot.

- [ ] **Step 4: Habiller et planche**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/templates/vitrine/render-vitrine.mjs --lang fr --appareil iphone,ipad --planche`
Expected: douze PNG sous `scripts/marketing-kit/out/vitrine/final/fr-FR/`, et `scripts/marketing-kit/out/vitrine/planches/fr-FR.png`.

- [ ] **Step 5: La Progression de l'iPad dans les sept langues (#8922)**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/vitrine/capturer.mjs --lang all --appareil ipad --scene progression`
Expected: sept captures ; chacune montre le fil à gauche dans la langue de son lecteur (relire les sept).

- [ ] **Step 6: Compte rendu et suivis**

Poster sur #8855 un commentaire daté : ce qui est livré par le lot 2, la planche `fr-FR` (chemin), les écarts trouvés et les issues ouvertes. Commenter #8921 et #8922 avec leur preuve (témoins, captures). Leur fermeture vient de la PR du lot (`Closes #8921`, `Closes #8922`), ouverte vers `dev` après la revue finale (superpowers:finishing-a-development-branch) ; la PR ne porte aucune attribution.
