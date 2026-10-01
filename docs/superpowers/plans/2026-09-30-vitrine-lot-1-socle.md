# Vitrine App Store — lot 1 (socle + Meeshy Global, Progression, lien sans compte) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** capturer les VRAIS écrans iOS de Meeshy Global, de la Progression et de l'accueil d'un lien sans compte, remplis d'un contenu fictif, sans serveur, puis les habiller aux formats App Store (iPhone 1320×2868, iPad 2064×2752) — en français pour ce lot.

**Architecture:** un mode vitrine réservé au DEBUG (`-MeeshyVitrine <scène>`) pose une session fictive dans le trousseau, pointe l'app vers un hôte injoignable, remplit les VRAIES bases (messages et traductions, liste, progression, mode de lecture) depuis un JSON exporté par le kit au format exact de la passerelle, puis ouvre l'écran une fois le voile de lancement parti. Un script Node pilote deux simulateurs dédiés, attend le signal « prêt » et capture ; le kit habille la capture (fond, titre, cadre).

**Tech Stack:** Swift / SwiftUI (SDK iOS 26), XCTest, GRDB ; Node 22 ESM + `bun test` ; Playwright Chromium ; `xcrun simctl`.

**Spec:** `docs/superpowers/specs/2026-09-30-vitrine-app-store-design.md` (issue #8855).

## Global Constraints

- Tout le code du mode vitrine vit sous `apps/ios/Meeshy/Features/Vitrine/`, chaque fichier entièrement entre `#if DEBUG` et `#endif`. Ailleurs, seulement des blocs `#if DEBUG` : `MeeshyApp.swift`, `SyncPill.swift`, `ShareLinkService.swift`, et le fichier SDK `ConversationSyncEngine+Vitrine.swift` (entièrement DEBUG).
- La vitrine ne parle JAMAIS à staging ni à la production : l'origine doit être `127.0.0.1` ou `localhost`, sinon l'app s'arrête. La base des messages est cloisonnée par origine (#8657) : la vitrine ne touche aucune donnée réelle.
- **Isolement Swift.** La cible `Meeshy` compile avec `SWIFT_DEFAULT_ACTOR_ISOLATION: MainActor`, la cible `MeeshyTests` avec `nonisolated`. Chaque type de la vitrine déclare le sien : `nonisolated` pour le pur (scène, lancement, fixtures, session, erreurs), `@MainActor` pour ce qui écrit ou navigue (remplissage, mise en scène). Une classe de test qui les appelle est `@MainActor`.
- **Aucun nouvel écrivain EN BLOC du cache « list »** (`ConversationListCacheWriterGuardTests`) : la liste passe par `saveSorted`, le point d'écriture réconcilié de `ConversationSyncEngine`.
- Formats : iPhone 6,9" 1320×2868 ; iPad 13" 2064×2752 portrait ; PNG RVB sans alpha.
- Langues du kit : `fr`, `en`, `es`, `de`, `it`, `pt` (App Store `pt-BR`), `ar` (de droite à gauche). Ce lot capture le français ; les fixtures couvrent déjà les sept.
- Contenu : une seule source, `scripts/marketing-kit/textes/*.mjs`. Aucune personne réelle ; avatars en initiales.
- Hors champ : ✦ et « Analyse IA », la feuille « Signal », un cadenas de chiffrement sur un écran traduit, un prix ; au plus 25 non-lus par conversation.
- Simulateurs : seulement « Meeshy Vitrine iPhone » (iPhone 17 Pro Max) et « Meeshy Vitrine iPad » (iPad Pro 13" M4), iOS 26.1. Jamais `simctl shutdown all`, jamais le simulateur d'une autre session.
- Builds et tests lourds en série, un à la fois. DerivedData hors du dépôt : `/Users/smpceo/Documents/Build-vitrine`.
- Travail dans le worktree `/Users/smpceo/Documents/v2_meeshy-vitrine` (branche `feat/vitrine-app-store`) ; jamais de `git checkout` dans le dépôt principal.
- Commits : message en français, `(Refs #8855)`, **aucune ligne `Co-Authored-By` ni attribution**. Le `project.pbxproj` (suivi par git, régénéré par `meeshy.sh` sur dérive) part dans le commit qui ajoute ses fichiers.

## Review Focus

1. **Un ordre d'ouverture posté sous le voile de lancement** : la racine ne l'écoute pas encore, l'écran ne s'ouvre jamais, mais « prêt » tomberait quand même et la capture montrerait la liste. La scène attend `LaunchSplashController.phase == .gone`. Témoin : `VitrineStageTests` (Tâche 6).
2. **Un lancement vitrine face à un vrai serveur** (environnement oublié) : l'app refuse la scène, n'écrit aucune session fictive. Témoin : `VitrineSessionTests.test_verifierIsolement_*` (Tâche 4).
3. **Un champ Swift renommé** qui ne décode plus le JSON du kit : l'échantillon exporté par le kit est décodé par le décodeur de production, et le kit vérifie que cet échantillon est à jour. Témoins : Tâche 2 (kit) et `VitrineFixturesTests` (Tâche 3).
4. **Une scène qui ne devient jamais prête** (plantage, fixture absente) : aucune capture d'un écran de chargement, la capture échoue au bout de 60 s en nommant la scène. Témoin : `attendreLeSignal` (Tâche 7).
5. **Meeshy Global ouvert en Résumé ✦ au lieu de Script** : le mode est fixé pour la conversation, et Global n'a aucun non-lu. Témoins : kit (Tâche 2) et `VitrineSeederTests.test_remplir_*_fixeLeModeScript*` (Tâche 5).

## Écarts avec la spec, et pourquoi

- **La liste ne s'écrit pas par `CacheCoordinator.save` (spec § 4)** : le cliquet `ConversationListCacheWriterGuardTests` interdit tout nouvel écrivain en bloc de la clé « list ». Elle passe par `saveSorted`, via une porte DEBUG du SDK (Tâche 5). La ligne `VitrineSeeder` de la spec est corrigée dans le commit de ce plan.
- **La scène « lien » passe par le vrai lien d'invitation (`.joinLink`)** : il n'exige plus le réseau, l'aperçu du lien étant servi par une porte DEBUG de `ShareLinkService` (Tâche 6). La ligne `VitrineStage` de la spec est corrigée de même.
- **Les captures brutes vont sous `out/vitrine/brut/`, les captures habillées sous `out/vitrine/final/`** (la spec ne nommait qu'un dossier).

---

## File Structure

| Fichier | Responsabilité |
|---|---|
| `scripts/marketing-kit/vitrine/simulateurs.mjs` | créer, démarrer et régler la barre d'état des deux simulateurs dédiés |
| `scripts/marketing-kit/vitrine/tests-ios.sh` | lancer des classes de `MeeshyTests` sur le simulateur iPhone dédié |
| `scripts/marketing-kit/vitrine/tests-sdk.sh` | lancer des classes de `MeeshySDKTests` sur le même simulateur |
| `scripts/marketing-kit/vitrine/fixtures.mjs` | exporter le contenu d'une langue au format exact de la passerelle |
| `scripts/marketing-kit/vitrine/exporter.mjs` | CLI : écrire ce JSON dans un fichier |
| `scripts/marketing-kit/vitrine/capturer.mjs` | CLI : construire, installer, lancer chaque scène, attendre « prêt », capturer |
| `scripts/marketing-kit/templates/vitrine/plan.mjs` | les scènes de la vitrine, leurs titres et thèmes, par appareil |
| `scripts/marketing-kit/templates/vitrine/render-vitrine.mjs` | CLI : habiller les vraies captures, planche contact |
| `scripts/marketing-kit/templates/appstore/composition.mjs` (modifié) | `pageCapture` accepte un `plan` et une vraie capture `ecranReel` |
| `scripts/marketing-kit/templates/appstore/render-appstore.mjs` (modifié) | exporte `rendre` ; `corpsDeSerie` accepte un `plan` |
| `apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift` | scènes, argument de lancement, emplacements des fichiers |
| `apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift` | décodage du JSON du kit par le décodeur de production |
| `apps/ios/Meeshy/Features/Vitrine/VitrineSession.swift` | isolement réseau, session fictive posée ou retirée |
| `apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift` | écriture dans les vraies bases, derrière un protocole de cibles |
| `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift` | enchaînement : préparer, remplir, ouvrir, signaler « prêt » |
| `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift` | porte DEBUG : la liste passe par `saveSorted` |
| `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift` (modifié) | porte DEBUG : l'aperçu du lien servi sans passerelle |
| `apps/ios/MeeshyTests/Unit/Vitrine/*.swift` | témoins iOS |
| `apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json` | échantillon exporté par le kit, contrat entre kit et app |

---

### Task 1: Simulateurs dédiés et lanceurs de tests ciblés

**Files:**
- Create: `scripts/marketing-kit/vitrine/simulateurs.mjs`
- Create: `scripts/marketing-kit/vitrine/tests-ios.sh`
- Create: `scripts/marketing-kit/vitrine/tests-sdk.sh`
- Test: `scripts/marketing-kit/test/vitrine-simulateurs.test.mjs`

**Interfaces:**
- Produces: `RUNTIME`, `SIMULATEURS` (`{ iphone: { nom, type }, ipad: { nom, type } }`), `trouverSimulateur(liste, nom) → udid|null`, `assurerSimulateur({ nom, type }) → udid`, `demarrer(udid)`, `barreDEtat(udid)`. CLI : `node simulateurs.mjs --iphone` démarre l'iPhone et imprime son UDID. Scripts : `tests-ios.sh <ClasseDeTest>…`, `tests-sdk.sh <ClasseDeTest>…`.

- [ ] **Step 0: Donner Playwright au worktree**

Le worktree n'a pas de `node_modules` ; le kit n'a qu'une dépendance externe, `@playwright/test`.

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
mkdir -p node_modules/@playwright
ln -sfn /Users/smpceo/Documents/v2_meeshy/node_modules/@playwright/test node_modules/@playwright/test
```

- [ ] **Step 1: Écrire le témoin rouge**

```js
// scripts/marketing-kit/test/vitrine-simulateurs.test.mjs
import { describe, expect, test } from 'bun:test'
import { SIMULATEURS, trouverSimulateur } from '../vitrine/simulateurs.mjs'

const liste = {
  devices: {
    'com.apple.CoreSimulator.SimRuntime.iOS-26-1': [
      { name: 'Meeshy Vitrine iPhone', udid: 'A', isAvailable: true },
      { name: 'Meeshy-iOS26', udid: 'B', isAvailable: true },
      { name: 'Meeshy Vitrine iPad', udid: 'C', isAvailable: false },
    ],
  },
}

describe('simulateurs de la vitrine (#8855)', () => {
  test('deux simulateurs dédiés, jamais celui d’une autre session', () => {
    expect(SIMULATEURS.iphone.nom).toBe('Meeshy Vitrine iPhone')
    expect(SIMULATEURS.ipad.nom).toBe('Meeshy Vitrine iPad')
    expect(SIMULATEURS.iphone.type).toBe('com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max')
    expect(SIMULATEURS.ipad.type).toBe('com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB')
  })

  test('retrouve un simulateur par son nom exact, et ignore un simulateur indisponible', () => {
    expect(trouverSimulateur(liste, 'Meeshy Vitrine iPhone')).toBe('A')
    expect(trouverSimulateur(liste, 'Meeshy Vitrine iPad')).toBeNull()
    expect(trouverSimulateur(liste, 'Meeshy')).toBeNull()
  })
})
```

- [ ] **Step 2: Le voir échouer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-simulateurs.test.mjs`
Expected: FAIL — `Cannot find module '../vitrine/simulateurs.mjs'`.

- [ ] **Step 3: Écrire `simulateurs.mjs`**

```js
// Les deux simulateurs de la vitrine (#8855) — créés au besoin, jamais ceux d'une autre session.
//   node scripts/marketing-kit/vitrine/simulateurs.mjs            # démarre les deux, imprime { iphone, ipad }
//   node scripts/marketing-kit/vitrine/simulateurs.mjs --iphone   # démarre l'iPhone, imprime son UDID
import { execFileSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const RUNTIME = 'com.apple.CoreSimulator.SimRuntime.iOS-26-1'

export const SIMULATEURS = {
  iphone: { nom: 'Meeshy Vitrine iPhone', type: 'com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max' },
  ipad: { nom: 'Meeshy Vitrine iPad', type: 'com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M4-8GB' },
}

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' })

export const trouverSimulateur = (liste, nom) =>
  Object.values(liste.devices).flat().find((d) => d.name === nom && d.isAvailable !== false)?.udid ?? null

export const assurerSimulateur = ({ nom, type }) =>
  trouverSimulateur(JSON.parse(simctl('list', 'devices', '-j')), nom) ?? simctl('create', nom, type, RUNTIME).trim()

export const demarrer = (udid) => {
  try {
    simctl('boot', udid)
  } catch (erreur) {
    if (!String(erreur.stderr ?? erreur).includes('current state: Booted')) throw erreur
  }
  simctl('bootstatus', udid, '-b')
}

export const barreDEtat = (udid) =>
  simctl('status_bar', udid, 'override', '--time', '9:41', '--dataNetwork', 'wifi', '--wifiMode', 'active', '--wifiBars', '3',
    '--cellularMode', 'active', '--cellularBars', '4', '--batteryState', 'charged', '--batteryLevel', '100')

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--iphone')) {
    const udid = assurerSimulateur(SIMULATEURS.iphone)
    demarrer(udid)
    process.stdout.write(`${udid}\n`)
  } else {
    const udids = { iphone: assurerSimulateur(SIMULATEURS.iphone), ipad: assurerSimulateur(SIMULATEURS.ipad) }
    for (const udid of Object.values(udids)) {
      demarrer(udid)
      barreDEtat(udid)
    }
    process.stdout.write(`${JSON.stringify(udids)}\n`)
  }
}
```

- [ ] **Step 4: Écrire les deux lanceurs de tests**

`meeshy.sh build` régénère le projet Xcode quand des fichiers ont été ajoutés : sans lui, un `.swift` neuf ne serait pas compilé.

```bash
#!/usr/bin/env bash
# Lance des classes de MeeshyTests sur le simulateur « Meeshy Vitrine iPhone » (#8855).
#   scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineSessionTests
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
UDID="$(node "$RACINE/scripts/marketing-kit/vitrine/simulateurs.mjs" --iphone)"
DD="${MEESHY_DERIVED_DATA:-/Users/smpceo/Documents/Build-vitrine}"
PKG=()
for cache in "$HOME"/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages; do
  [ -d "$cache/checkouts/GRDB.swift" ] && PKG=(-clonedSourcePackagesDirPath "$cache")
done
ONLY=()
for classe in "$@"; do ONLY+=("-only-testing:MeeshyTests/$classe"); done
cd "$RACINE/apps/ios"
MEESHY_DEVICE_ID="$UDID" MEESHY_DERIVED_DATA="$DD" ./meeshy.sh build > "$DD.build.log" 2>&1 || { tail -40 "$DD.build.log"; exit 1; }
xcodebuild test -project Meeshy.xcodeproj -scheme Meeshy -configuration Debug \
  -destination "platform=iOS Simulator,id=$UDID" -derivedDataPath "$DD" \
  SYMROOT="$DD/Products" OBJROOT="$DD/Intermediates.noindex" \
  ${PKG[@]+"${PKG[@]}"} "${ONLY[@]}" 2>&1 | grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" | tail -60
```

```bash
#!/usr/bin/env bash
# Lance des classes de MeeshySDKTests sur le simulateur « Meeshy Vitrine iPhone » (#8855).
#   scripts/marketing-kit/vitrine/tests-sdk.sh ShareLinkServiceVitrineTests
set -euo pipefail
RACINE="$(cd "$(dirname "$0")/../../.." && pwd)"
UDID="$(node "$RACINE/scripts/marketing-kit/vitrine/simulateurs.mjs" --iphone)"
DD="${MEESHY_DERIVED_DATA:-/Users/smpceo/Documents/Build-vitrine}-sdk"
PKG=()
for cache in "$HOME"/Library/Developer/Xcode/DerivedData/Meeshy-*/SourcePackages; do
  [ -d "$cache/checkouts/GRDB.swift" ] && PKG=(-clonedSourcePackagesDirPath "$cache")
done
ONLY=()
for classe in "$@"; do ONLY+=("-only-testing:MeeshySDKTests/$classe"); done
cd "$RACINE/packages/MeeshySDK"
xcodebuild test -scheme MeeshySDK-Package -destination "platform=iOS Simulator,id=$UDID" \
  -derivedDataPath "$DD" ${PKG[@]+"${PKG[@]}"} "${ONLY[@]}" 2>&1 \
  | grep -E "Test Case|error:|TEST (SUCCEEDED|FAILED)" | tail -60
```

Run: `chmod +x scripts/marketing-kit/vitrine/tests-ios.sh scripts/marketing-kit/vitrine/tests-sdk.sh`

- [ ] **Step 5: Le voir passer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-simulateurs.test.mjs`
Expected: PASS (2 tests).
Run: `node vitrine/simulateurs.mjs` — imprime `{"iphone":"…","ipad":"…"}` ; `xcrun simctl list devices | grep "Meeshy Vitrine"` montre les deux « (Booted) ».

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add scripts/marketing-kit/vitrine/simulateurs.mjs scripts/marketing-kit/vitrine/tests-ios.sh scripts/marketing-kit/vitrine/tests-sdk.sh scripts/marketing-kit/test/vitrine-simulateurs.test.mjs
git commit -m "feat(vitrine): deux simulateurs dédiés et des lanceurs de tests iOS ciblés (Refs #8855)"
```

---

### Task 2: Fixtures du kit au format de la passerelle

**Files:**
- Create: `scripts/marketing-kit/vitrine/fixtures.mjs`
- Create: `scripts/marketing-kit/vitrine/exporter.mjs`
- Create (généré): `apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json`
- Test: `scripts/marketing-kit/test/vitrine-fixtures.test.mjs`

**Interfaces:**
- Consumes: `DEMO`, `lecteurDe`, `partenaireDe`, `profilDe` (`textes/demo.mjs`) ; `KIT_LANGS` (`lib/locales.mjs`).
- Produces: `oid(graine) → string` (24 hexa) ; `ID_GLOBAL` ; `LIEN_LISBOA` (`'lisboa-2026'`) ; `exporterVitrine({ lang, maintenant }) → { version: 1, lang, lecteur, conversations, messages, progression, lienInvitation, modesDeLecture }`. Les clés sont celles des modèles Swift : `MeeshyUser`, `APIConversation` (+ `APIParticipant`, `APIConversationLastMessage`), `APIMessage` (+ `APITextTranslation`, `JoinNoticeMetadata`), `APIEngagementProgress`, `ShareLinkInfo`.

- [ ] **Step 1: Écrire le témoin rouge**

```js
// scripts/marketing-kit/test/vitrine-fixtures.test.mjs
import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { DEMO, lecteurDe } from '../textes/demo.mjs'
import { ID_GLOBAL, LIEN_LISBOA, exporterVitrine, oid } from '../vitrine/fixtures.mjs'

const MAINTENANT = new Date('2026-09-30T12:00:00.000Z')
const ECHANTILLON = resolve(REPO_ROOT, 'apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json')
const HEX24 = /^[0-9a-f]{24}$/
const ISO_MS = /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/
const LANGUE_DE = Object.fromEntries(DEMO.profils.map((p) => [oid(`user:${p.pseudo}`), p.lang]))

describe('fixtures de la vitrine (#8855)', () => {
  test('un identifiant stable au format ObjectId', () => {
    expect(ID_GLOBAL).toMatch(HEX24)
    expect(oid('conv:global')).toBe(ID_GLOBAL)
    expect(oid('conv:drole')).not.toBe(ID_GLOBAL)
  })

  test.each(KIT_LANGS)('%s : le lecteur parle la langue de la vitrine et figure dans chaque conversation directe', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.lecteur.systemLanguage).toBe(lang)
    for (const c of f.conversations.filter((conv) => conv.type === 'direct')) {
      const membres = c.participants.map((p) => p.userId)
      expect(membres).toContain(f.lecteur.id)
      expect(new Set(membres).size).toBe(2)
    }
  })

  test.each(KIT_LANGS)('%s : chaque aperçu de la liste est écrit dans la langue de son expéditeur et se lit dans celle du lecteur', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    for (const c of f.conversations) {
      expect(LANGUE_DE[c.lastMessage.sender.userId]).toBe(c.lastMessageOriginalLanguage)
      if (c.lastMessageOriginalLanguage !== lang) expect(c.lastMessageTranslations[lang]).toBeTruthy()
    }
  })

  test.each(KIT_LANGS)('%s : chaque message de Meeshy Global porte sa traduction dans la langue du lecteur', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    for (const m of f.messages[ID_GLOBAL]) {
      expect(m.id).toMatch(HEX24)
      expect(m.createdAt).toMatch(ISO_MS)
      if (m.messageType === 'system') expect(m.metadata.kind).toBe('member-joined')
      else if (m.originalLanguage !== lang) expect(m.translations.map((t) => t.targetLanguage)).toContain(lang)
    }
  })

  test.each(KIT_LANGS)('%s : le lien de « Lisboa » ne demande pas de compte et dit les langues du groupe, celle du lecteur comprise', (lang) => {
    const { lienInvitation: l } = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(l.linkId).toBe(LIEN_LISBOA)
    expect(l.name).toBe(DEMO.drole.titre)
    expect(l.requireAccount).toBe(false)
    expect(l.stats.spokenLanguages).toContain(lecteurDe(lang).lang)
    expect(l.stats.spokenLanguages.length).toBe(l.stats.languageCount)
  })

  test('Meeshy Global est dans la liste, sans non-lu, en mode Script, avec des arrivées à saluer', () => {
    const f = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    const global = f.conversations.find((c) => c.id === ID_GLOBAL)
    expect(global.type).toBe('global')
    expect(global.unreadCount).toBe(0)
    expect(f.modesDeLecture[ID_GLOBAL]).toBe('script')
    expect(f.messages[ID_GLOBAL].some((m) => m.messageType === 'system')).toBe(true)
    expect(f.conversations.every((c) => c.unreadCount <= 25)).toBe(true)
  })

  test('la progression a la forme de /me/engagement, et chaque badge suit un palier atteint par son compteur', () => {
    const { progression: p } = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    expect(p.streak).toEqual({ currentStreakDays: DEMO.progression.serie, longestStreakDays: DEMO.progression.record })
    expect(p.level.engagementScore).toBe(DEMO.progression.points)
    expect(p.meesh.balance).toBe(DEMO.progression.meesh)
    expect(p.meesh.missingPoints + p.meesh.debitablePoints).toBe(p.meesh.mintCost)
    const compteurs = Object.fromEntries(p.counters.map((c) => [c.axisKey, c.count]))
    for (const m of p.milestones) {
      expect(['badge', 'streak', 'level', 'achievement']).toContain(m.milestoneType)
      if (m.milestoneType !== 'badge') continue
      const [axe, palier] = m.milestoneKey.split(':')
      expect(compteurs[axe]).toBeGreaterThanOrEqual(Number(palier))
    }
  })

  test('deux exports au même instant sont identiques', () => {
    expect(exporterVitrine({ lang: 'de', maintenant: MAINTENANT })).toEqual(exporterVitrine({ lang: 'de', maintenant: MAINTENANT }))
  })

  test('l’échantillon que décode l’app iOS est à jour', () => {
    expect(JSON.parse(readFileSync(ECHANTILLON, 'utf8'))).toEqual(exporterVitrine({ lang: 'fr', maintenant: MAINTENANT }))
  })
})
```

- [ ] **Step 2: Le voir échouer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-fixtures.test.mjs`
Expected: FAIL — `Cannot find module '../vitrine/fixtures.mjs'`.

- [ ] **Step 3: Écrire `fixtures.mjs`**

```js
// Le contenu d'une vitrine (#8855), au format EXACT des réponses de la passerelle : l'app le
// décode avec son décodeur de production (`APIClient.makeAPIPayloadDecoder()`) et le range dans
// ses vraies bases. Une seule source : les textes du kit.
import { createHash } from 'node:crypto'
import { KIT_LANGS } from '../lib/locales.mjs'
import { DEMO, lecteurDe, partenaireDe, profilDe } from '../textes/demo.mjs'

export const VERSION_FIXTURES = 1

// Un identifiant stable au format ObjectId : une même graine donne toujours le même identifiant.
export const oid = (graine) => createHash('sha1').update(graine).digest('hex').slice(0, 24)

export const ID_GLOBAL = oid('conv:global')
export const LIEN_LISBOA = 'lisboa-2026'

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

// L'aperçu d'une conversation directe : la dernière phrase que son correspondant écrit ailleurs
// dans le kit, dans SA langue ; à défaut, sa bio.
const ECRITS = [...DEMO.global, ...DEMO.groupe, ...DEMO.story, ...DEMO.debat.messages].filter((c) => c.id)

const apercuDe = (profil) => {
  const apercu = ECRITS.findLast((c) => c.auteur === profil.pseudo && c.lang === profil.lang) ?? DEMO.bios[profil.pseudo]
  if (!apercu) throw new Error(`aucun aperçu pour ${profil.pseudo}`)
  return apercu
}

const CORRESPONDANTS = ['minjun.p', 'aiko.t', 'lucas.olv', 'sofi.romero', 'giulia.r', 'kwame.m', 'yusuf.h', 'priya.n', 'amara.d']

const conversations = (lang, maintenant) => {
  const lecteur = lecteurDe(lang)
  const partenaire = partenaireDe(lang)
  const taille = (pseudos) => new Set([lecteur.pseudo, ...pseudos]).size
  const direct = (cle, profil, contenu, minutes, unreadCount = 0) => {
    const id = oid(`conv:${cle}`)
    return {
      id,
      type: 'direct',
      memberCount: 2,
      unreadCount,
      isMember: true,
      createdAt: iso(maintenant, 40 * JOUR),
      updatedAt: iso(maintenant, minutes),
      participants: [participant(id, lecteur, maintenant), participant(id, profil, maintenant)],
      ...derniere(id, profil, contenu, maintenant, minutes),
    }
  }
  const groupe = ({ cle, titre, contenu, minutes, memberCount, unreadCount }) => {
    const id = oid(`conv:${cle}`)
    return {
      id,
      type: 'group',
      title: titre,
      memberCount,
      unreadCount,
      isMember: true,
      createdAt: iso(maintenant, 60 * JOUR),
      updatedAt: iso(maintenant, minutes),
      ...derniere(id, profilDe(contenu.auteur), contenu, maintenant, minutes),
    }
  }
  const dernierGlobal = DEMO.global.at(-1)
  return [
    direct(`amour:${lecteur.pseudo}`, partenaire, DEMO.amour.vocalReaction[partenaire.lang], 2, 1),
    groupe({ cle: 'debat', titre: DEMO.debat.titre, contenu: DEMO.debat.messages[0], minutes: 30, memberCount: taille(DEMO.debat.membres), unreadCount: 9 }),
    groupe({ cle: 'drole', titre: DEMO.drole.titre, contenu: DEMO.drole.valise, minutes: 95, memberCount: taille(DEMO.drole.membres), unreadCount: 4 }),
    groupe({ cle: 'nova', titre: DEMO.lienInvitation.groupe, contenu: DEMO.groupe.find((m) => m.id === 'nova.decalage'), minutes: 160, memberCount: 12, unreadCount: 3 }),
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
      return direct(`dm:${[lecteur.pseudo, pseudo].sort().join(':')}`, profil, apercuDe(profil), 200 + i * 45)
    }),
  ]
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
    meesh: { balance: P.meesh, mintedLifetime: P.meeshFrappees, debitablePoints: cout - P.meeshManquants, floorPoints: 0, missingPoints: P.meeshManquants, mintCost: cout },
    elan: { factor: 1.5, activeFamilyCount: P.elan, hasStanding: true, windowDays: P.elanFenetre, activeFamilies: P.elanFamilles },
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

export const exporterVitrine = ({ lang, maintenant }) => {
  if (!KIT_LANGS.includes(lang)) throw new Error(`langue hors kit : ${lang}`)
  return {
    version: VERSION_FIXTURES,
    lang,
    lecteur: utilisateur(lecteurDe(lang), maintenant),
    conversations: conversations(lang, maintenant),
    messages: { [ID_GLOBAL]: messagesGlobal(maintenant) },
    progression: progression(maintenant),
    lienInvitation: lienInvitation(lang, maintenant),
    modesDeLecture: { [ID_GLOBAL]: 'script' },
  }
}
```

- [ ] **Step 4: Écrire `exporter.mjs` et produire l'échantillon**

```js
#!/usr/bin/env node
// Exporte les fixtures d'une langue (#8855).
//   node scripts/marketing-kit/vitrine/exporter.mjs --lang fr --maintenant 2026-09-30T12:00:00.000Z --sortie <fichier>
import { writeFileSync } from 'node:fs'
import { parseArgs } from 'node:util'
import { exporterVitrine } from './fixtures.mjs'

const { values } = parseArgs({
  options: { lang: { type: 'string', default: 'fr' }, maintenant: { type: 'string' }, sortie: { type: 'string' } },
})
const maintenant = values.maintenant ? new Date(values.maintenant) : new Date()
const json = `${JSON.stringify(exporterVitrine({ lang: values.lang, maintenant }), null, 1)}\n`
if (values.sortie) writeFileSync(values.sortie, json)
else process.stdout.write(json)
```

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/vitrine/exporter.mjs --lang fr --maintenant 2026-09-30T12:00:00.000Z --sortie apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json`

- [ ] **Step 5: Le voir passer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-fixtures.test.mjs`
Expected: PASS (33 tests). Si l'aperçu d'une conversation rougit (« écrit dans la langue de son expéditeur »), une phrase du kit n'est pas dans la langue de son auteur : `apercuDe` l'écarte déjà pour les conversations directes, le témoin nomme alors un groupe ou Global.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add scripts/marketing-kit/vitrine/fixtures.mjs scripts/marketing-kit/vitrine/exporter.mjs scripts/marketing-kit/test/vitrine-fixtures.test.mjs apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json
git commit -m "feat(vitrine): le kit exporte le contenu de la vitrine au format exact de la passerelle (Refs #8855)"
```

---

### Task 3: Lancement et fixtures côté iOS

**Files:**
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineLaunch.swift`
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineFixtures.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineFixturesTests.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift`

**Interfaces:**
- Consumes: l'échantillon `apps/ios/MeeshyTests/Resources/VitrineFixtures-fr.json` (Tâche 2).
- Produces: `nonisolated enum VitrineScene: String { case global, progression, lien; var ouvreUneSession: Bool }` ; `nonisolated enum VitrineLaunch` avec `scene(in:) -> VitrineScene?`, `isActive`, `dossier`, `fichierFixtures`, `marqueurPret` ; `nonisolated struct VitrineFixtures: Decodable, Sendable { version, lang, lecteur: MeeshyUser, conversations: [APIConversation], messages: [String: [APIMessage]], progression: APIEngagementProgress, lienInvitation: ShareLinkInfo, modesDeLecture: [String: String] }` avec `decoder(_:)` et `charger(depuis:)` ; `nonisolated enum VitrineFixturesErreur { case versionInconnue(Int) }`.

- [ ] **Step 1: Écrire les témoins rouges**

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineLaunchTests.swift
import XCTest
@testable import Meeshy

final class VitrineLaunchTests: XCTestCase {
    func test_scene_withKnownArgument_returnsTheScene() {
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "global"]), .global)
        XCTAssertEqual(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "lien"]), .lien)
    }

    func test_scene_withMissingOrUnknownValue_returnsNil() {
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy"]))
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine"]))
        XCTAssertNil(VitrineLaunch.scene(in: ["Meeshy", "-MeeshyVitrine", "inconnue"]))
    }

    func test_ouvreUneSession_lienShowsAGuestWithoutAccount() {
        XCTAssertTrue(VitrineScene.global.ouvreUneSession)
        XCTAssertTrue(VitrineScene.progression.ouvreUneSession)
        XCTAssertFalse(VitrineScene.lien.ouvreUneSession)
    }
}
```

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineFixturesTests.swift
import XCTest
import MeeshySDK
@testable import Meeshy

/// Le contrat entre le kit et l'app : l'échantillon EXPORTÉ par le kit se décode avec le
/// décodeur de PRODUCTION. Un champ Swift renommé fait rougir ce témoin, jamais une capture.
final class VitrineFixturesTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    func test_decoder_kitSample_readsEveryDomain() throws {
        let f = try VitrineFixtures.decoder(Data(contentsOf: echantillon))
        XCTAssertEqual(f.version, 1)
        XCTAssertEqual(f.lang, "fr")
        XCTAssertEqual(f.lecteur.username, "lea.mtn")
        XCTAssertEqual(f.lecteur.systemLanguage, "fr")
        let global = try XCTUnwrap(f.conversations.first { $0.type == "global" })
        XCTAssertEqual(global.identifier, "meeshy")
        XCTAssertEqual(f.modesDeLecture[global.id], "script")
        let messages = try XCTUnwrap(f.messages[global.id])
        XCTAssertGreaterThan(messages.count, 5)
        XCTAssertTrue(messages.contains { $0.joinNotice != nil }, "Aucun avis d'arrivée décodé.")
        XCTAssertTrue(messages.contains { ($0.translations ?? []).contains { $0.targetLanguage == "fr" } })
        XCTAssertEqual(f.progression.streak.currentStreakDays, 7)
        XCTAssertEqual(f.lienInvitation.linkId, "lisboa-2026")
        XCTAssertFalse(f.lienInvitation.requireAccount)
    }

    func test_decoder_unknownVersion_throwsVersionInconnue() throws {
        var brut = try XCTUnwrap(JSONSerialization.jsonObject(with: Data(contentsOf: echantillon)) as? [String: Any])
        brut["version"] = 2
        let data = try JSONSerialization.data(withJSONObject: brut)
        XCTAssertThrowsError(try VitrineFixtures.decoder(data)) { erreur in
            XCTAssertEqual(erreur as? VitrineFixturesErreur, .versionInconnue(2))
        }
    }
}
```

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift
import XCTest

/// Le mode vitrine n'existe PAS dans l'app publiée (#8855).
final class VitrineSourceGuardTests: XCTestCase {
    private var depot: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
    }

    func test_everyVitrineSource_isWrappedInDebug() throws {
        let dossier = depot.appendingPathComponent("apps/ios/Meeshy/Features/Vitrine")
        let fichiers = try FileManager.default.contentsOfDirectory(at: dossier, includingPropertiesForKeys: nil)
            .filter { $0.pathExtension == "swift" }
        XCTAssertFalse(fichiers.isEmpty)
        for fichier in fichiers {
            let lignes = try String(contentsOf: fichier, encoding: .utf8)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
                .filter { !$0.isEmpty }
            XCTAssertEqual(lignes.first, "#if DEBUG", "\(fichier.lastPathComponent) ne commence pas par #if DEBUG")
            XCTAssertEqual(lignes.last, "#endif", "\(fichier.lastPathComponent) ne finit pas par #endif")
        }
    }
}
```

- [ ] **Step 2: Les voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineFixturesTests VitrineSourceGuardTests`
Expected: échec de compilation — `cannot find 'VitrineLaunch' in scope`, `cannot find 'VitrineFixtures' in scope`.

- [ ] **Step 3: Écrire `VitrineLaunch.swift`**

```swift
#if DEBUG
import Foundation

/// Mode vitrine App Store (#8855) : `-MeeshyVitrine <scène>` ouvre un VRAI écran de l'app,
/// rempli d'un contenu fictif, sans serveur. Absent de l'app publiée.
///
/// ```
/// xcrun simctl launch <udid> me.meeshy.app -MeeshyVitrine global \
///     -AppleLanguages "(fr)" -AppleLocale fr_FR \
///     -meeshy_selected_environment custom -meeshy_custom_host http://127.0.0.1:9
/// ```
nonisolated enum VitrineScene: String, CaseIterable, Sendable {
    case global
    case progression
    case lien

    /// La scène « lien » montre ce que voit un invité SANS compte.
    var ouvreUneSession: Bool { self != .lien }
}

nonisolated enum VitrineLaunch {
    static let argument = "-MeeshyVitrine"

    static func scene(in arguments: [String] = ProcessInfo.processInfo.arguments) -> VitrineScene? {
        guard let index = arguments.firstIndex(of: argument), arguments.indices.contains(index + 1) else { return nil }
        return VitrineScene(rawValue: arguments[index + 1])
    }

    static var isActive: Bool { scene() != nil }

    /// Là où le script de capture dépose les fixtures et attend le signal « prêt ».
    static var dossier: URL {
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
            .appendingPathComponent("vitrine", isDirectory: true)
    }

    static var fichierFixtures: URL { dossier.appendingPathComponent("fixtures.json") }

    static var marqueurPret: URL { dossier.appendingPathComponent("pret.txt") }
}
#endif
```

- [ ] **Step 4: Écrire `VitrineFixtures.swift`**

Le `Decodable` reste synthétisé : dans une cible isolée `MainActor` par défaut, des `CodingKeys` écrites à la main hériteraient de cet isolement.

```swift
#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineFixturesErreur: Error, Equatable {
    case versionInconnue(Int)
}

/// Le contenu d'une vitrine, exporté par le kit (`scripts/marketing-kit/vitrine/fixtures.mjs`)
/// au format EXACT des réponses de la passerelle, et lu par le décodeur de PRODUCTION.
nonisolated struct VitrineFixtures: Decodable, Sendable {
    static let versionAttendue = 1

    let version: Int
    let lang: String
    let lecteur: MeeshyUser
    let conversations: [APIConversation]
    let messages: [String: [APIMessage]]
    let progression: APIEngagementProgress
    let lienInvitation: ShareLinkInfo
    let modesDeLecture: [String: String]

    static func decoder(_ data: Data) throws -> VitrineFixtures {
        let fixtures = try APIClient.makeAPIPayloadDecoder().decode(VitrineFixtures.self, from: data)
        guard fixtures.version == versionAttendue else { throw VitrineFixturesErreur.versionInconnue(fixtures.version) }
        return fixtures
    }

    static func charger(depuis url: URL = VitrineLaunch.fichierFixtures) throws -> VitrineFixtures {
        try decoder(Data(contentsOf: url))
    }
}
#endif
```

- [ ] **Step 5: Les voir passer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineFixturesTests VitrineSourceGuardTests`
Expected: `TEST SUCCEEDED`, 6 tests. `meeshy.sh build` a régénéré `apps/ios/Meeshy.xcodeproj/project.pbxproj` (fichiers neufs).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add apps/ios/Meeshy/Features/Vitrine apps/ios/MeeshyTests/Unit/Vitrine apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(vitrine): l'app lit la scène demandée et décode les fixtures du kit avec son décodeur de production (Refs #8855)"
```

---

### Task 4: Session fictive et isolement réseau

**Files:**
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineSession.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSessionTests.swift`

**Interfaces:**
- Consumes: `KeychainStoring`, `KeychainManager.shared`, `AuthManager.isTokenExpired(_:now:)` (`MeeshySDK`). `restoreStoredSession(for:)` lit dans le trousseau `meeshy_active_user_id` (le getter d'`activeUserId`, malgré le suffixe `UDKey` de sa constante), `meeshy_token_<id>` et `meeshy_user_<id>` (décodé par un `JSONDecoder()` simple).
- Produces: `nonisolated enum VitrineSession` avec `verifierIsolement(origine:) throws`, `poser(_:keychain:) throws`, `retirer(keychain:)`, `jetonFictif`, `cleUtilisateurActif` ; `nonisolated enum VitrineSessionRefus { case serveurReel(String) }`.

- [ ] **Step 1: Écrire le témoin rouge**

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineSessionTests.swift
import XCTest
import MeeshySDK
@testable import Meeshy

final class VitrineSessionTests: XCTestCase {
    func test_verifierIsolement_loopback_isAccepted() {
        XCTAssertNoThrow(try VitrineSession.verifierIsolement(origine: "http://127.0.0.1:9"))
        XCTAssertNoThrow(try VitrineSession.verifierIsolement(origine: "http://localhost:9"))
    }

    func test_verifierIsolement_realServers_areRefused() {
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "https://gate.meeshy.me")) { erreur in
            XCTAssertEqual(erreur as? VitrineSessionRefus, .serveurReel("https://gate.meeshy.me"))
        }
        XCTAssertThrowsError(try VitrineSession.verifierIsolement(origine: "https://gate.staging.meeshy.me"))
    }

    func test_poser_writesTheThreeKeysRestoreStoredSessionReads() throws {
        let keychain = VitrineKeychain()
        let lecteur = MeeshyUser(id: "68f0000000000000000000aa", username: "lea.mtn", displayName: "Léa Martin")
        try VitrineSession.poser(lecteur, keychain: keychain)
        XCTAssertEqual(keychain.load(forKey: "meeshy_active_user_id", account: nil), lecteur.id)
        XCTAssertEqual(keychain.load(forKey: "meeshy_token_\(lecteur.id)", account: nil), VitrineSession.jetonFictif)
        let json = try XCTUnwrap(keychain.load(forKey: "meeshy_user_\(lecteur.id)", account: nil))
        XCTAssertEqual(try JSONDecoder().decode(MeeshyUser.self, from: Data(json.utf8)).username, "lea.mtn")
    }

    func test_retirer_forgetsTheActiveUser() throws {
        let keychain = VitrineKeychain()
        try VitrineSession.poser(MeeshyUser(id: "68f0000000000000000000aa", username: "lea.mtn"), keychain: keychain)
        VitrineSession.retirer(keychain: keychain)
        XCTAssertNil(keychain.load(forKey: "meeshy_active_user_id", account: nil))
    }

    func test_jetonFictif_isAStructurallyValidJwtThatNeverExpires() {
        XCTAssertFalse(AuthManager.isTokenExpired(VitrineSession.jetonFictif, now: Date()))
    }
}

private final class VitrineKeychain: KeychainStoring, @unchecked Sendable {
    private let lock = NSLock()
    private var store: [String: String] = [:]

    func save(_ value: String, forKey key: String, account: String?) throws { lock.withLock { store[key] = value } }
    func load(forKey key: String, account: String?) -> String? { lock.withLock { store[key] } }
    func delete(forKey key: String, account: String?) { lock.withLock { _ = store.removeValue(forKey: key) } }
    func saveAsync(_ value: String, forKey key: String, account: String?) async throws { try save(value, forKey: key, account: account) }
    func loadAsync(forKey key: String, account: String?) async -> String? { load(forKey: key, account: account) }
}
```

- [ ] **Step 2: Le voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSessionTests`
Expected: échec de compilation — `cannot find 'VitrineSession' in scope`.

- [ ] **Step 3: Écrire `VitrineSession.swift`**

```swift
#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSessionRefus: Error, Equatable {
    case serveurReel(String)
}

/// Pose (ou retire) la session du lecteur de la vitrine AVANT `checkExistingSession()` —
/// les trois clés que `restoreStoredSession(for:)` lit dans le trousseau.
nonisolated enum VitrineSession {
    static let cleUtilisateurActif = "meeshy_active_user_id"

    /// Un JWT inerte (`alg: none`) qui expire le 1er janvier 2100 : la vérification locale ne
    /// tente aucun rafraîchissement, et aucun serveur ne le reçoit jamais.
    static let jetonFictif = "eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJzdWIiOiJ2aXRyaW5lIiwiZXhwIjo0MTAyNDQ0ODAwfQ.dml0cmluZQ"

    /// La vitrine ne tourne JAMAIS face à un vrai serveur : le faux jeton y serait révoqué (401),
    /// et un 403 ferait effacer les messages (`handleAccessRevoked`).
    static func verifierIsolement(origine: String) throws {
        guard let host = URL(string: origine)?.host, host == "127.0.0.1" || host == "localhost" else {
            throw VitrineSessionRefus.serveurReel(origine)
        }
    }

    static func poser(_ lecteur: MeeshyUser, keychain: any KeychainStoring = KeychainManager.shared) throws {
        let json = String(decoding: try JSONEncoder().encode(lecteur), as: UTF8.self)
        try keychain.save(jetonFictif, forKey: "meeshy_token_\(lecteur.id)", account: nil)
        try keychain.save(json, forKey: "meeshy_user_\(lecteur.id)", account: nil)
        try keychain.save(lecteur.id, forKey: cleUtilisateurActif, account: nil)
    }

    static func retirer(keychain: any KeychainStoring = KeychainManager.shared) {
        keychain.delete(forKey: cleUtilisateurActif, account: nil)
    }
}
#endif
```

- [ ] **Step 4: Le voir passer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSessionTests VitrineSourceGuardTests`
Expected: `TEST SUCCEEDED`, 6 tests.

- [ ] **Step 5: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add apps/ios/Meeshy/Features/Vitrine/VitrineSession.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSessionTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(vitrine): session fictive posée ou retirée, et refus de tout vrai serveur (Refs #8855)"
```

---

### Task 5: Remplissage des vraies bases, liste comprise par le point réconcilié

**Files:**
- Create: `packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineVitrineTests.swift`
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift`

**Interfaces:**
- Consumes: `VitrineFixtures` (Tâche 3) ; `APIConversation.toConversation(currentUserId:)` ; `ConversationSyncEngine.saveSorted(_:to:baseline:)` (interne au SDK, le seul écrivain réconcilié de la liste) ; `MessagePersistenceActor.upsertFromAPIMessages(_:preferredLanguages:)` (écrit aussi les `TranslationRecord`) ; `DependencyContainer.shared.messagePersistence` ; `CacheCoordinator.shared.engagementProgress` (clé `engagement:<userId>`, celle de `ProgressionViewModel`) ; `ReadingModePreferenceStore().setMode(_:for:scope:)`, `ReadingModePreferenceScope.registered(userId:)`, `ReadingModeOrchestrator.ConversationReadingMode`.
- Produces: `ConversationSyncEngine.debugVitrineSaveList(_:) async -> Bool` (SDK, DEBUG) ; `@MainActor protocol VitrineSeedTargets` (4 méthodes ci-dessous) ; `VitrineSeedTargetsReels` ; `@MainActor enum VitrineSeeder` avec `remplir(_:dans:) async throws` ; `nonisolated enum VitrineSeederErreur { case listeRefusee }`.

- [ ] **Step 1: Écrire le témoin rouge du SDK**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineVitrineTests.swift
import XCTest
import GRDB
@testable import MeeshySDK

/// La vitrine (#8855) range sa liste par le point d'écriture RÉCONCILIÉ `saveSorted`, jamais par
/// une écriture en bloc de plus (`ConversationListCacheWriterGuardTests`).
final class ConversationSyncEngineVitrineTests: XCTestCase {
    func test_debugVitrineSaveList_writesTheListThroughTheReconciledChokepoint() async throws {
        let db = try DatabaseQueue()
        try AppDatabase.runMigrations(on: db)
        let cache = CacheCoordinator(messageSocket: MockMessageSocket(), socialSocket: MockSocialSocket(), db: db)
        let engine = ConversationSyncEngine(
            cache: cache,
            conversationService: MockConversationService(),
            messageService: MockMessageService(),
            messageSocket: MockMessageSocket(),
            socialSocket: MockSocialSocket(),
            api: MockAPIClient(),
            syncDelta: MockSyncDeltaMuet()
        )
        let liste = [
            TestFactories.makeConversation(id: "c1", unreadCount: 2),
            TestFactories.makeConversation(id: "c2"),
        ]

        let ecrit = await engine.debugVitrineSaveList(liste)

        XCTAssertTrue(ecrit)
        let lue = await cache.conversations.load(for: "list").snapshot() ?? []
        XCTAssertEqual(Set(lue.map(\.id)), ["c1", "c2"])
        XCTAssertEqual(lue.first { $0.id == "c1" }?.unreadCount, 2, "Le non-lu servi par la fixture survit à la réconciliation.")
    }
}
```

- [ ] **Step 2: Le voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ConversationSyncEngineVitrineTests`
Expected: `error: value of type 'ConversationSyncEngine' has no member 'debugVitrineSaveList'`.

- [ ] **Step 3: Écrire la porte du SDK**

La ligne d'appel ne contient pas `conversations.save` : le cliquet ne la compte pas, et c'est voulu — elle emprunte l'écrivain qu'il protège.

```swift
#if DEBUG
import Foundation

extension ConversationSyncEngine {
    /// Vitrine App Store (#8855, DEBUG uniquement) : range une liste fixée par le point
    /// d'écriture RÉCONCILIÉ de la liste, comme le ferait `fullSync` — jamais par une écriture
    /// en bloc de plus (`ConversationListCacheWriterGuardTests`).
    @discardableResult
    public func debugVitrineSaveList(_ conversations: [MeeshyConversation]) async -> Bool {
        await saveSorted(conversations, to: "list")
    }
}
#endif
```

- [ ] **Step 4: Le voir passer, cliquet compris**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ConversationSyncEngineVitrineTests ConversationListCacheWriterGuardTests`
Expected: `TEST SUCCEEDED`.

- [ ] **Step 5: Écrire le témoin rouge de l'app**

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift
import XCTest
import GRDB
import MeeshySDK
@testable import Meeshy

@MainActor
final class VitrineSeederTests: XCTestCase {
    private var echantillon: URL {
        URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()
            .appendingPathComponent("Resources/VitrineFixtures-fr.json")
    }

    private func fixtures() throws -> VitrineFixtures {
        try VitrineFixtures.decoder(Data(contentsOf: echantillon))
    }

    func test_remplir_kitSample_writesEveryDomainForTheCurrentReader() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(f, dans: cibles)

        XCTAssertEqual(cibles.conversations.count, f.conversations.count)
        XCTAssertTrue(cibles.conversations.contains { $0.type == .global })
        XCTAssertEqual(cibles.languesParLot, Array(repeating: ["fr"], count: f.messages.count))
        XCTAssertEqual(cibles.cleProgression, "engagement:\(f.lecteur.id)")
    }

    func test_remplir_kitSample_fixeLeModeScriptPourMeeshyGlobal() async throws {
        let f = try fixtures()
        let cibles = CiblesEnregistreuses()
        try await VitrineSeeder.remplir(f, dans: cibles)
        let global = try XCTUnwrap(f.conversations.first { $0.type == "global" })
        XCTAssertEqual(cibles.modes[global.id], .script)
        XCTAssertEqual(cibles.modesUserId, f.lecteur.id)
    }

    /// Relu par les VRAIS chemins de lecture : `MessageRecord.toMessage` et les traductions que
    /// le Prisme sert au lecteur.
    func test_remplir_messagesAndTranslations_areReadBackByTheRealReadPaths() async throws {
        let f = try fixtures()
        let base = try DatabaseQueue()
        try MessageDatabaseMigrations.runAll(on: base)
        try await VitrineSeeder.remplir(f, dans: CiblesMessagesReels(persistence: MessagePersistenceActor(dbWriter: base)))

        let attendus = f.messages.values.flatMap { $0 }
        let lus = try await base.read { db in try MessageRecord.fetchAll(db) }.map { $0.toMessage(currentUserId: f.lecteur.id) }
        XCTAssertEqual(Set(lus.map(\.content)), Set(attendus.compactMap(\.content)))
        let traductions = try await base.read { db in try TranslationRecord.fetchAll(db) }
        for message in attendus where message.messageType == "text" && message.originalLanguage != f.lang {
            let servie = traductions.first { $0.messageServerId == message.id && $0.targetLanguage == f.lang }
            XCTAssertEqual(servie?.translatedContent, message.translations?.first { $0.targetLanguage == f.lang }?.translatedContent,
                           "Le Prisme n'aurait rien à servir au lecteur pour \(message.id).")
        }
    }
}

@MainActor
private final class CiblesEnregistreuses: VitrineSeedTargets {
    nonisolated deinit {}

    private(set) var conversations: [MeeshyConversation] = []
    private(set) var languesParLot: [[String]] = []
    private(set) var cleProgression: String?
    private(set) var modes: [String: ReadingModeOrchestrator.ConversationReadingMode] = [:]
    private(set) var modesUserId: String?

    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws { self.conversations = conversations }
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws { languesParLot.append(langues) }
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws { cleProgression = cle }
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String) {
        modes[conversationId] = mode
        modesUserId = userId
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
}
```

- [ ] **Step 6: Le voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSeederTests`
Expected: échec de compilation — `cannot find type 'VitrineSeedTargets' in scope`.

- [ ] **Step 7: Écrire `VitrineSeeder.swift`**

```swift
#if DEBUG
import Foundation
import MeeshySDK

nonisolated enum VitrineSeederErreur: Error, Equatable {
    case listeRefusee
}

/// Là où la vitrine écrit : les VRAIES bases de l'app en direct, des doublures en test.
@MainActor
protocol VitrineSeedTargets {
    func enregistrerConversations(_ conversations: [MeeshyConversation]) async throws
    func enregistrerMessages(_ messages: [APIMessage], langues: [String]) async throws
    func enregistrerProgression(_ progression: APIEngagementProgress, cle: String) async throws
    func fixerModeDeLecture(_ mode: ReadingModeOrchestrator.ConversationReadingMode, conversationId: String, userId: String)
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
}

@MainActor
enum VitrineSeeder {
    static func remplir(_ fixtures: VitrineFixtures, dans cibles: some VitrineSeedTargets) async throws {
        let userId = fixtures.lecteur.id
        try await cibles.enregistrerConversations(fixtures.conversations.map { $0.toConversation(currentUserId: userId) })
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

- [ ] **Step 8: Le voir passer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineSeederTests VitrineSourceGuardTests`
Expected: `TEST SUCCEEDED`, 4 tests.

- [ ] **Step 9: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift packages/MeeshySDK/Tests/MeeshySDKTests/Sync/ConversationSyncEngineVitrineTests.swift apps/ios/Meeshy/Features/Vitrine/VitrineSeeder.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSeederTests.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(vitrine): les fixtures remplissent les vraies bases — liste par le point réconcilié, messages et traductions, progression, mode de lecture (Refs #8855)"
```

---

### Task 6: Mise en scène — lien servi sans passerelle, ouverture après le voile, signal « prêt »

**Files:**
- Modify: `packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift:24` et `:72-77`
- Test: `packages/MeeshySDK/Tests/MeeshySDKTests/Services/ShareLinkServiceVitrineTests.swift`
- Create: `apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift`
- Test: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineStageTests.swift`
- Modify: `apps/ios/Meeshy/MeeshyApp.swift` (après `MeeshyConfig.shared.restoreEnvironment()` ; après `Task { await SessionManager.shared.migrateKeychainIfNeeded() }`)
- Modify: `apps/ios/Meeshy/Features/Main/Components/SyncPill.swift:127-132`
- Modify: `apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift`

**Interfaces:**
- Consumes: Tâches 3 à 5 ; `LaunchSplashController.Phase` (`.covering` → `.fading` → `.gone`) et `launchSplash.$phase` ; `Notification.Name.navigateToConversation` (objet : `Conversation`) ; `Notification.Name("pushNavigateToRoute")` (objet : `"progression"`, géré par `RootView` ET `iPadRootView`) ; `DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier:)`, consommé par `handleGuestDeepLink` quand aucune session n'est restaurée ; `MeeshyConfig.shared.persistedServerOrigin`.
- Produces: `ShareLinkService.debugLinkInfoOverride: (@Sendable (String) -> ShareLinkInfo?)?` (SDK, DEBUG) ; `@MainActor enum VitrineStage` avec `preparer()`, `remplir() async`, `ouvrir(apres:)`, `attendreLaRacine(_:) async -> Bool`.

- [ ] **Step 1: Écrire le témoin rouge du SDK**

```swift
// packages/MeeshySDK/Tests/MeeshySDKTests/Services/ShareLinkServiceVitrineTests.swift
import XCTest
@testable import MeeshySDK

/// La vitrine (#8855) affiche le VRAI accueil d'un lien sans passerelle : l'aperçu fixé est
/// servi à la place de la requête, et seulement pour son propre identifiant.
final class ShareLinkServiceVitrineTests: XCTestCase {
    override func tearDown() {
        ShareLinkService.debugLinkInfoOverride = nil
        super.tearDown()
    }

    func test_getLinkInfo_withVitrineOverride_servesTheFixtureWithoutNetwork() async throws {
        let mock = MockAPIClient()
        let service = ShareLinkService(api: mock)
        let fixture = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? fixture : nil }

        let info = try await service.getLinkInfo(identifier: "lisboa-2026")

        XCTAssertEqual(info.linkId, "lisboa-2026")
        XCTAssertEqual(mock.requestCount, 0)
    }

    func test_getLinkInfo_overrideForAnotherLink_stillCallsTheGateway() async throws {
        let mock = MockAPIClient()
        let service = ShareLinkService(api: mock)
        let fixture = try Self.info(linkId: "lisboa-2026")
        ShareLinkService.debugLinkInfoOverride = { $0 == "lisboa-2026" ? fixture : nil }

        _ = try? await service.getLinkInfo(identifier: "autre-lien")

        XCTAssertEqual(mock.requestCount, 1)
    }

    private static func info(linkId: String) throws -> ShareLinkInfo {
        let json = #"{"id":"l1","linkId":"LINK","conversation":{"id":"c1","type":"group","createdAt":"2026-09-30T12:00:00.000Z"},"creator":{"id":"u1","username":"aiko.t"},"stats":{"totalParticipants":6,"memberCount":6,"anonymousCount":0,"languageCount":5,"spokenLanguages":["ja","pt","en","ko","es"]}}"#
            .replacingOccurrences(of: "LINK", with: linkId)
        return try APIClient.makeAPIPayloadDecoder().decode(ShareLinkInfo.self, from: Data(json.utf8))
    }
}
```

- [ ] **Step 2: Le voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ShareLinkServiceVitrineTests`
Expected: `error: type 'ShareLinkService' has no member 'debugLinkInfoOverride'`.

- [ ] **Step 3: Ajouter la porte du lien**

Dans `ShareLinkService.swift`, juste après `public static let shared = ShareLinkService()` :

```swift
    #if DEBUG
    /// Vitrine App Store (#8855, DEBUG uniquement) : un aperçu de lien fixé, servi sans
    /// passerelle, pour capturer le VRAI accueil d'un invité. `nil` hors vitrine.
    nonisolated(unsafe) public static var debugLinkInfoOverride: (@Sendable (String) -> ShareLinkInfo?)?
    #endif
```

Et `getLinkInfo(identifier:)` devient :

```swift
    public func getLinkInfo(identifier: String) async throws -> ShareLinkInfo {
        #if DEBUG
        if let info = Self.debugLinkInfoOverride?(identifier) { return info }
        #endif
        let response: APIResponse<ShareLinkInfo> = try await api.request(
            AnonymousEndpoint.linkByIdentifier(identifier: identifier)
        )
        return response.data
    }
```

- [ ] **Step 4: Le voir passer, sans régression du service**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ShareLinkServiceVitrineTests ShareLinkServiceTests`
Expected: `TEST SUCCEEDED`.

- [ ] **Step 5: Écrire le témoin rouge de la mise en scène**

```swift
// apps/ios/MeeshyTests/Unit/Vitrine/VitrineStageTests.swift
import XCTest
import Combine
@testable import Meeshy

/// La scène de vitrine (#8855) ne s'ouvre qu'une fois la racine découverte : posté sous le voile
/// du lancement, l'ordre d'ouverture n'aurait encore aucun abonné, et « prêt » tomberait sur la
/// liste.
@MainActor
final class VitrineStageTests: XCTestCase {
    func test_attendreLaRacine_returnsOnlyOnceTheLaunchVeilIsGone() async {
        let voile = LaunchSplashController(elapsed: { .seconds(10) }, sleep: { _ in })
        let attente = Task { @MainActor in
            let ouvert = await VitrineStage.attendreLaRacine(voile.$phase.values)
            return (ouvert, voile.phase)
        }
        for _ in 0..<5 { await Task.yield() }
        XCTAssertEqual(voile.phase, .covering)

        await voile.markReady()

        let (ouvert, phaseALOuverture) = await attente.value
        XCTAssertTrue(ouvert)
        XCTAssertEqual(phaseALOuverture, .gone)
    }
}
```

Et, dans `VitrineSourceGuardTests`, la seconde garde :

```swift
    /// Hors de son dossier, la vitrine ne vit que dans des blocs `#if DEBUG`.
    func test_everyVitrineReference_outsideItsFolder_isInsideADebugBlock() throws {
        let fichiers = [
            "apps/ios/Meeshy/MeeshyApp.swift",
            "apps/ios/Meeshy/Features/Main/Components/SyncPill.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift",
            "packages/MeeshySDK/Sources/MeeshySDK/Sync/ConversationSyncEngine+Vitrine.swift",
        ]
        for chemin in fichiers {
            var pile: [Bool] = []
            var references = 0
            let lignes = try String(contentsOf: depot.appendingPathComponent(chemin), encoding: .utf8)
                .components(separatedBy: .newlines)
                .map { $0.trimmingCharacters(in: .whitespaces) }
            for ligne in lignes {
                if ligne.hasPrefix("#if") { pile.append(ligne == "#if DEBUG"); continue }
                if ligne.hasPrefix("#else") || ligne.hasPrefix("#elseif") { if !pile.isEmpty { pile[pile.count - 1] = false }; continue }
                if ligne.hasPrefix("#endif") { _ = pile.popLast(); continue }
                guard ligne.contains("Vitrine") || ligne.contains("debugLinkInfoOverride") else { continue }
                references += 1
                XCTAssertTrue(pile.contains(true), "\(chemin) : « \(ligne) » vit hors d'un bloc #if DEBUG")
            }
            XCTAssertGreaterThan(references, 0, "\(chemin) ne mentionne plus la vitrine : retirer ce fichier de la garde.")
        }
    }
```

- [ ] **Step 6: Les voir échouer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineStageTests VitrineSourceGuardTests`
Expected: échec de compilation — `cannot find 'VitrineStage' in scope`.

- [ ] **Step 7: Écrire `VitrineStage.swift`**

```swift
#if DEBUG
import Combine
import Foundation
import MeeshySDK

/// Déroule une scène de vitrine (#8855) : prépare la session AVANT `checkExistingSession()`,
/// remplit les vraies bases APRÈS, ouvre l'écran une fois la racine découverte, puis dépose le
/// marqueur « prêt » que le script de capture attend.
@MainActor
enum VitrineStage {
    private static var fixtures: VitrineFixtures?

    /// Juste après `MeeshyConfig.shared.restoreEnvironment()`.
    static func preparer() {
        guard let scene = VitrineLaunch.scene() else { return }
        do {
            try VitrineSession.verifierIsolement(origine: MeeshyConfig.shared.persistedServerOrigin)
            let f = try VitrineFixtures.charger()
            fixtures = f
            try? FileManager.default.removeItem(at: VitrineLaunch.marqueurPret)
            servir(f.lienInvitation, pour: scene)
            if scene.ouvreUneSession {
                try VitrineSession.poser(f.lecteur)
            } else {
                VitrineSession.retirer()
                DeepLinkRouter.shared.pendingDeepLink = .joinLink(identifier: f.lienInvitation.linkId)
            }
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » impossible à préparer : \(error)")
        }
    }

    /// Une fois la session restaurée, avant le préchargement de la liste.
    static func remplir() async {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        do {
            try await VitrineSeeder.remplir(f, dans: VitrineSeedTargetsReels())
        } catch {
            fatalError("Vitrine « \(scene.rawValue) » : remplissage impossible — \(error)")
        }
    }

    /// Posté sous le voile du lancement, un ordre d'ouverture n'aurait encore aucun abonné :
    /// l'écran de la scène s'ouvre une fois le voile parti.
    static func ouvrir(apres voile: Published<LaunchSplashController.Phase>.Publisher) {
        guard let scene = VitrineLaunch.scene(), scene.ouvreUneSession, let f = fixtures else { return }
        Task {
            guard await attendreLaRacine(voile.values) else { return }
            montrer(scene, f)
            marquerPret(scene, apres: .seconds(3))
        }
    }

    static func attendreLaRacine(_ phases: AsyncPublisher<Published<LaunchSplashController.Phase>.Publisher>) async -> Bool {
        for await phase in phases where phase == .gone {
            return true
        }
        return false
    }

    /// Sur la scène « lien », l'accueil a demandé l'aperçu du lien : il est rendu deux secondes après.
    private static func servir(_ lien: ShareLinkInfo, pour scene: VitrineScene) {
        ShareLinkService.debugLinkInfoOverride = { identifiant in
            guard identifiant == lien.linkId else { return nil }
            if scene == .lien {
                Task { @MainActor in marquerPret(scene, apres: .seconds(2)) }
            }
            return lien
        }
    }

    private static func montrer(_ scene: VitrineScene, _ f: VitrineFixtures) {
        switch scene {
        case .global:
            guard let global = f.conversations.first(where: { $0.type == "global" }) else { return }
            NotificationCenter.default.post(name: .navigateToConversation, object: global.toConversation(currentUserId: f.lecteur.id))
        case .progression:
            NotificationCenter.default.post(name: Notification.Name("pushNavigateToRoute"), object: "progression")
        case .lien:
            break
        }
    }

    private static func marquerPret(_ scene: VitrineScene, apres delai: Duration) {
        Task {
            try? await Task.sleep(for: delai)
            try? FileManager.default.createDirectory(at: VitrineLaunch.dossier, withIntermediateDirectories: true)
            try? Data(scene.rawValue.utf8).write(to: VitrineLaunch.marqueurPret)
        }
    }
}
#endif
```

- [ ] **Step 8: Brancher dans `MeeshyApp.swift` et masquer le bandeau réseau**

Dans le `.task` de `MeeshyApp.swift`, juste après `MeeshyConfig.shared.restoreEnvironment()` (20 espaces d'indentation) :

```swift
                    #if DEBUG
                    // Vitrine App Store (#8855) : session fictive et lien fixé AVANT la
                    // restauration de session — voir `VitrineStage`.
                    VitrineStage.preparer()
                    #endif
```

Dans le bloc `if authManager.isAuthenticated {` qui suit `checkExistingSession()`, juste après `Task { await SessionManager.shared.migrateKeychainIfNeeded() }` (24 espaces) :

```swift
                        #if DEBUG
                        // Vitrine (#8855) : les vraies bases se remplissent avant le
                        // préchargement de la liste ; l'écran de la scène s'ouvre une fois
                        // le voile du lancement parti.
                        await VitrineStage.remplir()
                        VitrineStage.ouvrir(apres: launchSplash.$phase)
                        #endif
```

Dans `SyncPill.swift`, `SyncPillVisibility.isVisible` devient :

```swift
nonisolated enum SyncPillVisibility {
    static func isVisible(storyViewerPresenting: Bool,
                          inAppNoticePresenting: Bool) -> Bool {
        #if DEBUG
        // Vitrine (#8855) : le serveur injoignable est voulu, son bandeau hors champ.
        if VitrineLaunch.isActive { return false }
        #endif
        return !storyViewerPresenting && !inAppNoticePresenting
    }
}
```

La demande d'autorisation des notifications ne s'affiche pas : sans serveur, `OnboardingPushPermissionGate` la retient (`fetchState` échoue ⇒ il retient), et le script la reporte en plus (Tâche 7).

- [ ] **Step 9: Tout relancer**

Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineFixturesTests VitrineSessionTests VitrineSeederTests VitrineStageTests VitrineSourceGuardTests SyncPillTimerStateTests`
Expected: `TEST SUCCEEDED` (l'app compile avec `VitrineStage` branché ; la vitrine seule compte 16 tests).

- [ ] **Step 10: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add packages/MeeshySDK/Sources/MeeshySDK/Services/ShareLinkService.swift packages/MeeshySDK/Tests/MeeshySDKTests/Services/ShareLinkServiceVitrineTests.swift apps/ios/Meeshy/Features/Vitrine/VitrineStage.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineStageTests.swift apps/ios/MeeshyTests/Unit/Vitrine/VitrineSourceGuardTests.swift apps/ios/Meeshy/MeeshyApp.swift apps/ios/Meeshy/Features/Main/Components/SyncPill.swift apps/ios/Meeshy.xcodeproj/project.pbxproj
git commit -m "feat(vitrine): la scène se prépare, se remplit, s'ouvre après le voile et signale qu'elle est prête — lien servi sans passerelle, bandeau réseau hors champ (Refs #8855)"
```

---

### Task 7: Script de capture

**Files:**
- Create: `scripts/marketing-kit/templates/vitrine/plan.mjs`
- Create: `scripts/marketing-kit/vitrine/capturer.mjs`
- Test: `scripts/marketing-kit/test/vitrine-capture.test.mjs`

**Interfaces:**
- Consumes: `exporterVitrine` (Tâche 2) ; `SIMULATEURS`, `assurerSimulateur`, `demarrer`, `barreDEtat` (Tâche 1) ; `APPAREILS` (`templates/appstore/plan.mjs`, champs `width`, `height`, `scale`, `prefixe`) ; `pngInfo` (`lib/png.mjs`) ; `LEGENDES` (L3 « Tout le monde arrive. Dis bonjour. », L7 « Garde ta série. Monte de niveau. », L10 « Un lien. Sans compte. »).
- Produces: `VITRINE` (`{ iphone|ipad: { width, height, scale, prefixe, captures: [{ scene, legende, theme, decor? }] } }`) ; `BUNDLE`, `HOTE_INJOIGNABLE`, `TAILLES_NATIVES`, `argumentsDeLancement({ scene, lang }) → string[]`, `cheminBrut({ appareil, lang, scene }) → string`, `attendreLeSignal({ existe, delaiMs, pasMs, maintenant, dormir, etiquette })` ; CLI `capturer.mjs --lang … --appareil … [--scene …] [--construire]`.

- [ ] **Step 1: Écrire le témoin rouge**

```js
// scripts/marketing-kit/test/vitrine-capture.test.mjs
import { describe, expect, test } from 'bun:test'
import { LEGENDES } from '../textes/legendes.mjs'
import { VITRINE } from '../templates/vitrine/plan.mjs'
import { HOTE_INJOIGNABLE, TAILLES_NATIVES, argumentsDeLancement, attendreLeSignal, cheminBrut } from '../vitrine/capturer.mjs'

describe('capture des vrais écrans (#8855)', () => {
  test('lot 1 : Global, Progression et le lien, sur iPhone et iPad', () => {
    for (const appareil of ['iphone', 'ipad']) {
      expect(VITRINE[appareil].captures.map((c) => c.scene)).toEqual(['global', 'progression', 'lien'])
      for (const c of VITRINE[appareil].captures) expect(LEGENDES[c.legende]).toBeDefined()
    }
    expect([VITRINE.iphone.width, VITRINE.iphone.height]).toEqual([1320, 2868])
    expect([VITRINE.ipad.width, VITRINE.ipad.height]).toEqual([2064, 2752])
  })

  test('les captures natives ont déjà la taille App Store', () => {
    expect(TAILLES_NATIVES).toEqual({ iphone: [1320, 2868], ipad: [2064, 2752] })
  })

  test('le lancement vise un hôte injoignable, jamais un vrai serveur, et reporte l’alerte des notifications', () => {
    const args = argumentsDeLancement({ scene: 'global', lang: 'fr' })
    expect(args.slice(0, 2)).toEqual(['-MeeshyVitrine', 'global'])
    expect(args).toContain(HOTE_INJOIGNABLE)
    expect(HOTE_INJOIGNABLE).toBe('http://127.0.0.1:9')
    expect(args.join(' ')).not.toMatch(/meeshy\.me/)
    expect(args).toEqual(expect.arrayContaining(['-auth.signup.deferPushPermissionUntilFirstMessage', 'YES']))
  })

  test('le portugais du Brésil et l’arabe d’Arabie saoudite', () => {
    expect(argumentsDeLancement({ scene: 'lien', lang: 'pt' })).toEqual(expect.arrayContaining(['(pt-BR)', 'pt_BR']))
    expect(argumentsDeLancement({ scene: 'lien', lang: 'ar' })).toEqual(expect.arrayContaining(['(ar)', 'ar_SA']))
  })

  test('une capture brute par appareil, langue et scène', () => {
    expect(cheminBrut({ appareil: 'ipad', lang: 'de', scene: 'progression' })).toMatch(/out\/vitrine\/brut\/ipad\/de\/progression\.png$/)
  })

  test('une scène qui ne signale jamais « prêt » fait échouer la capture en la nommant', async () => {
    let horloge = 0
    const attente = attendreLeSignal({
      existe: () => false,
      delaiMs: 1000,
      pasMs: 500,
      maintenant: () => horloge,
      dormir: async (ms) => { horloge += ms },
      etiquette: 'iphone/fr/global',
    })
    await expect(attente).rejects.toThrow('iphone/fr/global : aucun signal « prêt »')
  })

  test('le signal « prêt » libère la capture dès qu’il paraît', async () => {
    let regards = 0
    await attendreLeSignal({ existe: () => ++regards > 2, maintenant: () => 0, dormir: async () => {}, etiquette: 'x' })
    expect(regards).toBe(3)
  })
})
```

- [ ] **Step 2: Le voir échouer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-capture.test.mjs`
Expected: FAIL — `Cannot find module '../templates/vitrine/plan.mjs'`.

- [ ] **Step 3: Écrire `templates/vitrine/plan.mjs`**

```js
// La vitrine #8855 sur les VRAIS écrans. Lot 1 : trois scènes ; les lots suivants ajoutent les
// sept autres features, dans l'ordre validé par le porteur (spec § 2-3).
import { APPAREILS } from '../appstore/plan.mjs'

const dimensions = ({ width, height, scale, prefixe }) => ({ width, height, scale, prefixe })

const LOT_1 = [
  { scene: 'global', legende: 'L3', theme: 'light', decor: 'bonjours' },
  { scene: 'progression', legende: 'L7', theme: 'light' },
  { scene: 'lien', legende: 'L10', theme: 'light' },
]

export const VITRINE = {
  iphone: { ...dimensions(APPAREILS.iphone), captures: LOT_1 },
  ipad: { ...dimensions(APPAREILS.ipad), captures: LOT_1 },
}
```

- [ ] **Step 4: Écrire `vitrine/capturer.mjs`**

```js
#!/usr/bin/env node
// Capture des VRAIS écrans en mode vitrine (#8855) — simulateurs dédiés, serveur injoignable.
//   node scripts/marketing-kit/vitrine/capturer.mjs --lang fr --appareil iphone,ipad --construire
//   node scripts/marketing-kit/vitrine/capturer.mjs --lang all --scene global
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { pngInfo } from '../lib/png.mjs'
import { VITRINE } from '../templates/vitrine/plan.mjs'
import { exporterVitrine } from './fixtures.mjs'
import { SIMULATEURS, assurerSimulateur, barreDEtat, demarrer } from './simulateurs.mjs'

export const BUNDLE = 'me.meeshy.app'
export const HOTE_INJOIGNABLE = 'http://127.0.0.1:9'
export const DERIVED_DATA = '/Users/smpceo/Documents/Build-vitrine'
export const SORTIE_BRUTE = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/brut')
export const TAILLES_NATIVES = { iphone: [1320, 2868], ipad: [2064, 2752] }

const LOCALES = { fr: 'fr_FR', en: 'en_US', es: 'es_ES', de: 'de_DE', it: 'it_IT', pt: 'pt_BR', ar: 'ar_SA' }
const LANGUES_APPLE = { pt: 'pt-BR' }

export const argumentsDeLancement = ({ scene, lang }) => [
  '-MeeshyVitrine', scene,
  '-AppleLanguages', `(${LANGUES_APPLE[lang] ?? lang})`,
  '-AppleLocale', LOCALES[lang],
  '-meeshy_selected_environment', 'custom',
  '-meeshy_custom_host', HOTE_INJOIGNABLE,
  // La demande d'autorisation des notifications attend le premier message envoyé : aucune alerte système à l'image.
  '-auth.signup.deferPushPermissionUntilFirstMessage', 'YES',
]

export const cheminBrut = ({ appareil, lang, scene }) => resolve(SORTIE_BRUTE, appareil, lang, `${scene}.png`)

const pause = (ms) => new Promise((r) => setTimeout(r, ms))

export const attendreLeSignal = async ({ existe, delaiMs = 60_000, pasMs = 500, maintenant = Date.now, dormir = pause, etiquette }) => {
  const limite = maintenant() + delaiMs
  while (!existe()) {
    if (maintenant() > limite) throw new Error(`${etiquette} : aucun signal « prêt » en ${delaiMs / 1000} s — l’app a-t-elle planté ?`)
    await dormir(pasMs)
  }
}

const simctl = (...args) => execFileSync('xcrun', ['simctl', ...args], { encoding: 'utf8' })

const arreter = (udid) => {
  try {
    simctl('terminate', udid, BUNDLE)
  } catch {
    // l'app ne tournait pas
  }
}

const construire = (udid) => {
  const r = spawnSync('./meeshy.sh', ['build'], {
    cwd: resolve(REPO_ROOT, 'apps/ios'),
    env: { ...process.env, MEESHY_DEVICE_ID: udid, MEESHY_DERIVED_DATA: DERIVED_DATA },
    stdio: 'inherit',
  })
  if (r.status !== 0) throw new Error('la construction de l’app a échoué')
  return resolve(DERIVED_DATA, 'Products/Debug-iphonesimulator/Meeshy.app')
}

const capturer = async ({ udid, appareil, lang, capture }) => {
  const { scene, theme } = capture
  const etiquette = `${appareil}/${lang}/${scene}`
  simctl('ui', udid, 'appearance', theme === 'dark' ? 'dark' : 'light')
  arreter(udid)
  const dossier = resolve(simctl('get_app_container', udid, BUNDLE, 'data').trim(), 'Documents/vitrine')
  mkdirSync(dossier, { recursive: true })
  rmSync(resolve(dossier, 'pret.txt'), { force: true })
  writeFileSync(resolve(dossier, 'fixtures.json'), JSON.stringify(exporterVitrine({ lang, maintenant: new Date() })))
  simctl('launch', udid, BUNDLE, ...argumentsDeLancement({ scene, lang }))
  await attendreLeSignal({ existe: () => existsSync(resolve(dossier, 'pret.txt')), etiquette })
  await pause(1500)
  const sortie = cheminBrut({ appareil, lang, scene })
  mkdirSync(dirname(sortie), { recursive: true })
  simctl('io', udid, 'screenshot', '--type=png', sortie)
  arreter(udid)
  const { width, height } = pngInfo(readFileSync(sortie))
  const [w, h] = TAILLES_NATIVES[appareil]
  if (width !== w || height !== h) throw new Error(`${etiquette} : ${width}×${height}, attendu ${w}×${h}`)
  return sortie
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'fr' },
      appareil: { type: 'string', default: 'iphone,ipad' },
      scene: { type: 'string' },
      construire: { type: 'boolean', default: false },
    },
  })
  const langs = values.lang === 'all' ? KIT_LANGS : values.lang.split(',')
  const appareils = values.appareil.split(',')
  const udids = Object.fromEntries(appareils.map((a) => [a, assurerSimulateur(SIMULATEURS[a])]))
  for (const udid of Object.values(udids)) {
    demarrer(udid)
    barreDEtat(udid)
  }
  if (values.construire) {
    const app = construire(Object.values(udids)[0])
    for (const udid of Object.values(udids)) simctl('install', udid, app)
  }
  const scenes = values.scene?.split(',')
  for (const appareil of appareils) {
    for (const lang of langs) {
      for (const capture of VITRINE[appareil].captures.filter((c) => !scenes || scenes.includes(c.scene))) {
        console.log(`✓ ${await capturer({ udid: udids[appareil], appareil, lang, capture })}`)
      }
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
```

- [ ] **Step 5: Le voir passer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test test/vitrine-capture.test.mjs`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add scripts/marketing-kit/templates/vitrine/plan.mjs scripts/marketing-kit/vitrine/capturer.mjs scripts/marketing-kit/test/vitrine-capture.test.mjs
git commit -m "feat(vitrine): le script capture chaque scène sur les simulateurs dédiés, serveur injoignable, après le signal « prêt » (Refs #8855)"
```

---

### Task 8: Habillage des vraies captures

**Files:**
- Modify: `scripts/marketing-kit/templates/appstore/composition.mjs` (`scene`, `panorama`, `captureDe`, `pageCapture`)
- Modify: `scripts/marketing-kit/templates/appstore/render-appstore.mjs` (`export const rendre`, `corpsDeSerie` avec `plan`)
- Modify: `scripts/marketing-kit/templates/appstore/appstore.css` (règle `.ecran-reel`)
- Create: `scripts/marketing-kit/templates/vitrine/render-vitrine.mjs`
- Test: `scripts/marketing-kit/templates/vitrine/vitrine.test.mjs`

**Interfaces:**
- Consumes: `VITRINE`, `cheminBrut` (Tâche 7) ; `cadre(appareil, contenu)` (`lib/cadres.mjs`, écran iPhone 440×956, iPad 1032×1376, contenu dans `.device-screen`) ; `window.asVerifier()` (débordement de page, texte hors de l'image, légende qui déborde).
- Produces: `pageCapture({ appareil, lang, rang, corps, plan = APPAREILS, ecranReel })` ; `rendre(browser, { html, width, height, scale }) → { png, mesure }` exporté ; `corpsDeSerie(browser, { appareil, lang, plan = APPAREILS })` ; CLI `render-vitrine.mjs --lang … --appareil … [--planche]` → `out/vitrine/final/<locale>/<prefixe>_NN_<scène>.png` et `out/vitrine/planches/<locale>.png`.

- [ ] **Step 1: Écrire le témoin rouge**

```js
// scripts/marketing-kit/templates/vitrine/vitrine.test.mjs
import { describe, expect, test } from 'bun:test'
import { chromium } from '@playwright/test'
import { pngInfo } from '../../lib/png.mjs'
import { pageCapture } from '../appstore/composition.mjs'
import { rendre } from '../appstore/render-appstore.mjs'
import { VITRINE } from './plan.mjs'

// Un PNG RVB 1×1 : on teste l'HABILLAGE, pas l'écran.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4z8AAAAMBAQDJ/pLvAAAAAElFTkSuQmCC', 'base64')

describe('habillage des vraies captures (#8855)', () => {
  test('la vraie capture remplit l’écran du cadre, sous le titre de sa scène', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 2, plan: VITRINE, ecranReel: PNG })
    expect(html).toContain(`<img class="ecran-reel" src="data:image/png;base64,${PNG.toString('base64')}"`)
    expect(html).toMatch(/class="device-screen"[\s\S]*class="ecran-reel"/)
    expect(html).toContain('Garde ta série')
  })

  test('sans capture (mesure du corps de titre), la page se compose sans écran', () => {
    const html = pageCapture({ appareil: 'ipad', lang: 'ar', rang: 1, plan: VITRINE })
    expect(html).toContain('class="as-caption')
    expect(html).not.toContain('ecran-reel')
  })

  test('le panorama suit la longueur de la vitrine, pas celle de l’ancien plan', () => {
    const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 3, plan: VITRINE, ecranReel: PNG })
    expect(html).toContain('--pano-x:-880px')
    expect(html).toContain(`width:${440 * VITRINE.iphone.captures.length}px`)
  })

  test('une vraie capture habillée sort à la taille App Store, en RVB sans alpha', async () => {
    const browser = await chromium.launch()
    try {
      const a = VITRINE.iphone
      const html = pageCapture({ appareil: 'iphone', lang: 'fr', rang: 1, plan: VITRINE, ecranReel: PNG })
      const { png, mesure } = await rendre(browser, { html, width: a.width, height: a.height, scale: a.scale })
      expect(mesure.erreurs).toEqual([])
      expect(pngInfo(png)).toEqual({ width: 1320, height: 2868, colorType: 2, bitDepth: 8 })
    } finally {
      await browser.close()
    }
  }, 30_000)
})
```

- [ ] **Step 2: Le voir échouer**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test templates/vitrine/vitrine.test.mjs`
Expected: FAIL — l'import de `rendre` échoue (`Export named 'rendre' not found in module …render-appstore.mjs`).

- [ ] **Step 3: Rendre `composition.mjs` sensible au plan et à la capture réelle**

Remplacer `scene` :

```js
const scene = (appareil, plan = APPAREILS) => {
  const a = plan[appareil]
  return { width: a.width / a.scale, height: a.height / a.scale }
}
```

Dans `panorama`, la signature devient `const panorama = (appareil, plan = APPAREILS) => {` et ses deux premières lignes :

```js
  const { width, height } = scene(appareil, plan)
  const n = plan[appareil].captures.length
```

Remplacer `captureDe` et `pageCapture` :

```js
export const captureDe = ({ appareil, rang, plan = APPAREILS }) => {
  const capture = plan[appareil]?.captures[rang - 1]
  if (!capture) throw new Error(`capture inconnue : ${appareil} n°${rang}`)
  return capture
}

// La VRAIE capture d'un écran (#8855) : un PNG natif, posé dans le cadre à la place de l'écran recomposé.
const imageEcran = (png) => raw(`<img class="ecran-reel" src="data:image/png;base64,${png.toString('base64')}" alt="">`)

export const pageCapture = ({ appareil, lang, rang, corps, plan = APPAREILS, ecranReel }) => {
  const capture = captureDe({ appareil, rang, plan })
  const ctx = contexte({ lang, theme: capture.theme })
  const { width, height } = scene(appareil, plan)
  const { echelle } = SCENES[appareil]
  const deviceTop = capture.deviceTop ?? SCENES[appareil].deviceTop
  const device = tailleCadre(appareil)
  const decor = capture.decor ? DECORS[capture.decor](ctx, appareil) : ''
  const ton = capture.theme === 'dark' ? 'as-sombre' : 'as-clair'
  const contenuEcran = ecranReel ? imageEcran(ecranReel) : capture.ecran ? ecran(capture.ecran, ctx) : ''
  const contenu = html`<div class="as-canvas as-${appareil} ${ton}" dir="${ctx.dir}" lang="${lang}" style="width:${width}px;height:${height}px;--pano-x:${-(rang - 1) * width}px;--device-top:${deviceTop}px">
    ${panorama(appareil, plan)}
    <header class="as-head">
      ${rang === 1 ? html`<div class="as-brand">${logo(appareil === 'iphone' ? 30 : 36)}<span>Meeshy</span></div>` : ''}
      ${legende({ lang, cle: capture.legende, corps })}
      ${rangeeDecor(capture.decor) ? decor : ''}
    </header>
    <div class="as-device" style="width:${device.width}px;height:${device.height}px;transform:translateX(-50%) scale(${echelle})">
      ${cadre(appareil, contenuEcran)}
    </div>
    ${rangeeDecor(capture.decor) ? '' : decor}
  </div>`
  return documentHtml({ lang, corps: contenu, largeur: width, hauteur: height })
}
```

Dans `appstore.css`, après la règle `.as-device` :

```css
/* La VRAIE capture d'un écran (#8855) remplit l'écran du cadre, à sa résolution native. */
.device-screen .ecran-reel { display: block; width: 100%; height: 100%; object-fit: cover; }
```

Dans `render-appstore.mjs` : `const rendre = async` devient `export const rendre = async`, et `corpsDeSerie` prend le plan :

```js
export const corpsDeSerie = async (browser, { appareil, lang, plan = APPAREILS }) => {
  const a = plan[appareil]
  const page = await browser.newPage({ viewport: { width: a.width / a.scale, height: a.height / a.scale } })
  try {
    const tailles = []
    for (const [i] of a.captures.entries()) {
      await page.setContent(pageCapture({ appareil, lang, rang: i + 1, plan }), { waitUntil: 'load' })
      await page.evaluate(() => document.fonts.ready)
      tailles.push(await page.evaluate(() => {
        window.asMiseEnPage()
        return parseFloat(getComputedStyle(document.querySelector('.as-caption')).fontSize)
      }))
    }
    return Math.floor(Math.min(...tailles) * 2) / 2
  } finally {
    await page.close()
  }
}
```

- [ ] **Step 4: Écrire `render-vitrine.mjs`**

```js
#!/usr/bin/env node
// Habille les VRAIES captures de la vitrine (#8855) : fond, titre, cadre — et la planche contact.
//   node scripts/marketing-kit/templates/vitrine/render-vitrine.mjs --lang fr --appareil iphone,ipad --planche
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { parseArgs } from 'node:util'
import { pathToFileURL } from 'node:url'
import { chromium } from '@playwright/test'
import { REPO_ROOT } from '../../lib/catalog.mjs'
import { KIT_LANGS, appStoreLocale } from '../../lib/locales.mjs'
import { pngInfo, stripAlpha } from '../../lib/png.mjs'
import { pageCapture } from '../appstore/composition.mjs'
import { corpsDeSerie, rendre } from '../appstore/render-appstore.mjs'
import { cheminBrut } from '../../vitrine/capturer.mjs'
import { VITRINE } from './plan.mjs'

export const SORTIE_FINALE = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/final')

export const cheminFinal = ({ appareil, lang, rang }) => {
  const a = VITRINE[appareil]
  return resolve(SORTIE_FINALE, appStoreLocale(lang), `${a.prefixe}_${String(rang).padStart(2, '0')}_${a.captures[rang - 1].scene}.png`)
}

const habiller = async (browser, { lang, appareil }) => {
  const a = VITRINE[appareil]
  const corps = await corpsDeSerie(browser, { appareil, lang, plan: VITRINE })
  for (const [i, capture] of a.captures.entries()) {
    const brut = cheminBrut({ appareil, lang, scene: capture.scene })
    if (!existsSync(brut)) throw new Error(`capture brute absente : ${brut} — lancer vitrine/capturer.mjs`)
    const html = pageCapture({ appareil, lang, rang: i + 1, corps, plan: VITRINE, ecranReel: readFileSync(brut) })
    const { png, mesure } = await rendre(browser, { html, width: a.width, height: a.height, scale: a.scale })
    if (mesure.erreurs.length) throw new Error(`${appareil}/${lang}/${capture.scene} : ${mesure.erreurs.join(' ; ')}`)
    const info = pngInfo(png)
    if (info.width !== a.width || info.height !== a.height || info.colorType !== 2) {
      throw new Error(`${appareil}/${lang}/${capture.scene} : ${info.width}×${info.height} (type ${info.colorType}), attendu ${a.width}×${a.height} RVB`)
    }
    const sortie = cheminFinal({ appareil, lang, rang: i + 1 })
    mkdirSync(dirname(sortie), { recursive: true })
    writeFileSync(sortie, png)
    console.log(`✓ ${sortie}`)
  }
}

const planche = async (browser, lang) => {
  const cellules = Object.entries(VITRINE)
    .flatMap(([appareil, a]) => a.captures.map((_, i) => cheminFinal({ appareil, lang, rang: i + 1 })))
    .filter(existsSync)
    .map((chemin) => `<img src="${pathToFileURL(chemin).href}">`)
    .join('')
  const tmp = resolve(REPO_ROOT, 'scripts/marketing-kit/out/vitrine/planches', `.${appStoreLocale(lang)}.html`)
  mkdirSync(dirname(tmp), { recursive: true })
  writeFileSync(tmp, `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:24px;background:#0f0c29;display:flex;gap:16px;align-items:flex-start}img{height:900px;border-radius:12px}</style>${cellules}`)
  const page = await browser.newPage({ viewport: { width: 2400, height: 950 } })
  await page.goto(pathToFileURL(tmp).href, { waitUntil: 'load' })
  const sortie = resolve(dirname(tmp), `${appStoreLocale(lang)}.png`)
  writeFileSync(sortie, stripAlpha(await page.screenshot({ type: 'png', fullPage: true })))
  await page.close()
  console.log(`▦ ${sortie}`)
}

const main = async () => {
  const { values } = parseArgs({
    options: {
      lang: { type: 'string', default: 'fr' },
      appareil: { type: 'string', default: 'iphone,ipad' },
      planche: { type: 'boolean', default: false },
    },
  })
  const langs = values.lang === 'all' ? KIT_LANGS : values.lang.split(',')
  const browser = await chromium.launch()
  try {
    for (const lang of langs) {
      for (const appareil of values.appareil.split(',')) await habiller(browser, { lang, appareil })
      if (values.planche) await planche(browser, lang)
    }
  } finally {
    await browser.close()
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erreur) => {
    console.error(`✗ ${erreur.message}`)
    process.exit(1)
  })
}
```

- [ ] **Step 5: Le voir passer, sans casser l'ancien jeu**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test --timeout 30000`
Expected: PASS — toute la suite du kit ; `pageCapture` sans `plan` rend l'ancien jeu à l'identique.

- [ ] **Step 6: Commit**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine
git add scripts/marketing-kit/templates/appstore/composition.mjs scripts/marketing-kit/templates/appstore/render-appstore.mjs scripts/marketing-kit/templates/appstore/appstore.css scripts/marketing-kit/templates/vitrine/render-vitrine.mjs scripts/marketing-kit/templates/vitrine/vitrine.test.mjs
git commit -m "feat(vitrine): le kit habille les vraies captures — fond, titre, cadre — et dresse la planche contact (Refs #8855)"
```

---

### Task 9: Première preuve en français, iPhone et iPad — point d'étape

**Files:** aucun fichier source ; les sorties vont sous `scripts/marketing-kit/out/vitrine/` (ignoré par git).

- [ ] **Step 1: Construire, installer et capturer les trois scènes**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine && node scripts/marketing-kit/vitrine/capturer.mjs --lang fr --appareil iphone,ipad --construire`
Expected: six lignes `✓ …/out/vitrine/brut/<appareil>/fr/<scène>.png`, sans erreur de taille ni de délai.

- [ ] **Step 2: Regarder chaque capture brute**

Ouvrir les six PNG (outil Read). Critères :
- **Global** en mode Script : avis d'arrivée à saluer, bonjours traduits en français.
- **Progression** : série de 7 jours, niveau, badges, Meesh.
- **Lien** : accueil d'invité « Lisboa ✈️ », avec le choix de rejoindre sans compte.
- **iPad** : la liste à gauche montre ses aperçus en français.
- Aucun bandeau « hors ligne », aucun ✦, aucune alerte système, aucun calque d'onboarding, aucun écran de chargement.

Un écart se corrige dans la tâche fautive (fixture, remplissage, ouverture), puis on relance l'étape 1.

- [ ] **Step 3: Habiller et dresser la planche**

Run: `node scripts/marketing-kit/templates/vitrine/render-vitrine.mjs --lang fr --appareil iphone,ipad --planche`
Expected: six PNG sous `out/vitrine/final/fr-FR/` (`iphone69_01_global.png` … `ipad13_03_lien.png`) et la planche `out/vitrine/planches/fr-FR.png`.

- [ ] **Step 4: Relancer toute la suite du kit, puis les témoins iOS et SDK de la vitrine**

Run: `cd /Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit && bun test --timeout 30000` → PASS.
Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-ios.sh VitrineLaunchTests VitrineFixturesTests VitrineSessionTests VitrineSeederTests VitrineStageTests VitrineSourceGuardTests` → `TEST SUCCEEDED`.
Run: `/Users/smpceo/Documents/v2_meeshy-vitrine/scripts/marketing-kit/vitrine/tests-sdk.sh ConversationSyncEngineVitrineTests ConversationListCacheWriterGuardTests ShareLinkServiceVitrineTests ShareLinkServiceTests` → `TEST SUCCEEDED`.

- [ ] **Step 5: Pousser et faire valider**

```bash
cd /Users/smpceo/Documents/v2_meeshy-vitrine && git push -q
```

Montrer la planche au porteur et poser UNE question : le rendu des vrais écrans lui convient-il pour poursuivre avec le lot 2 (conversations) ? Ne rien fusionner ni mettre en ligne avant sa réponse.

---

## Lots suivants

Chaque lot reçoit son propre plan, écrit après le point d'étape du lot précédent (spec § 7) :
- lot 2 : les conversations (vocal traduit en Bulles, Prisme dans le groupe en Script, Imagine) ;
- lot 3 : le composeur ;
- lot 4 : les appels, avec `VitrineCamera` ;
- lot 5 : les 7 langues, iPhone et iPad, et le second point d'étape ;
- lot 6 : la mise en ligne sur la version en préparation, une fois réunis le nouveau build, la fiche corrigée (#8852) et l'envoi par ANDP.
