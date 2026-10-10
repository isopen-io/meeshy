import { describe, expect, test } from 'bun:test'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { SPECS } from '../lib/conformite.mjs'
import { KIT_LANGS, appStoreLocale } from '../lib/locales.mjs'
import { REELS_DROLES } from '../textes/reels.mjs'
import { TEXTES_ENTETE } from '../textes/entete-epique.mjs'
import { tailleDeLoupe } from '../vitrine/entete-epique-page.mjs'
import {
  DUREE_S, FPS, HAUTEUR, IMAGES, LARGEUR, MUSIQUE, PLANS, REPERES, SONS, TEMPS_S, CIBLE_LUFS, CRETE_DBTP,
  argumentsDeMixage, entreeDuPlan, enSecondes, fenetre, filtreDeMixage, filtreDeSonie, legendeDuReel, lireMesure, modeleDeLaPage,
  planDeLEntete, recaler, titreDeSignature,
} from '../vitrine/entete-epique-plan.mjs'
import { ANCIENS_ENTETES, deposerLEntete, nomDuFichier, sourceVerifiee } from '../vitrine/entete-epique.mjs'
import { empreinte } from '../vitrine/medias.mjs'

const METADATA = resolve(REPO_ROOT, 'apps/ios/fastlane/metadata')

// Des prises synthétiques, au format des rapports de filmer.mjs.
const rapport = (etapes = {}) => ({ bornes: { action: { debutS: 2.5, finS: 6 }, rognage: { debutS: 1.9, finS: 7 } }, etapes })
const prises = () => ({
  'interaction-defilement': { clip: '/c/defilement.mp4', rapport: rapport({ 'reel-1': 0, 'reel-2': 2200, 'reel-3': 4500, 'reel-4': 6800 }) },
  'interaction-story': { clip: '/c/story.mp4', rapport: rapport({ ouverture: 0, story: 950 }) },
  'interaction-vocal': { clip: '/c/vocal.mp4', rapport: rapport({ original: 0, traduction: 2730 }), repereY: 1562 },
  'jeu-frappe': { clip: '/c/frappe.mp4', rapport: rapport(), mouvementMs: 40 },
  'jeu-coffre': { clip: '/c/coffre.mp4', rapport: rapport(), mouvementMs: 30 },
  'jeu-niveau': { clip: '/c/niveau.mp4', rapport: rapport(), mouvementMs: 20 },
  'jeu-rang': { clip: '/c/rang.mp4', rapport: rapport(), mouvementMs: 20 },
})
const nomDeFiche = (lang) => readFileSync(resolve(METADATA, appStoreLocale(lang), 'name.txt'), 'utf8')
const plan = (lang) => planDeLEntete({ lang, prises: prises(), nomDeFiche: nomDeFiche(lang) })

describe('l’en-tête épique : la forme exigée par Apple (#9904)', () => {
  test('3840×1646, 30 i/s, 23 s : dans la plage de 20 à 25 s voulue et dans celle de 5 à 30 s d’Apple', () => {
    expect([LARGEUR, HAUTEUR]).toEqual(SPECS['entete-video'].tailles[0])
    expect(SPECS['entete-video'].cadences.exactes).toContain(FPS)
    expect(DUREE_S).toBeGreaterThanOrEqual(20)
    expect(DUREE_S).toBeLessThanOrEqual(25)
    expect(IMAGES).toBe(DUREE_S * FPS)
  })

  test('le nom déposé est unique par langue et ne tombe pas sous la racine que monter-depot.mjs gère', () => {
    const noms = KIT_LANGS.map(nomDuFichier)
    expect(new Set(noms).size).toBe(KIT_LANGS.length)
    expect(noms.every((n) => !n.startsWith('01-entete-'))).toBe(true)
    expect(ANCIENS_ENTETES.test('01-entete-fr-FR.mp4')).toBe(true)
    expect(ANCIENS_ENTETES.test(nomDuFichier('fr'))).toBe(true)
    expect(ANCIENS_ENTETES.test('01-jeu-fr-FR-iphone.mp4')).toBe(false)
  })
})

describe('l’en-tête épique : le montage suit la musique (#9904)', () => {
  test('les plans se suivent sans trou, chaque coupe tombe sur un temps, chaque acte sur une mesure', () => {
    PLANS.slice(0, -1).forEach((p, i) => expect(PLANS[i + 1].de).toBe(p.a))
    for (const p of PLANS) expect(Number.isInteger(p.de)).toBe(true)
    const actes = [...new Set(PLANS.map((p) => p.acte))]
    expect(actes).toEqual(['reels', 'story', 'vocal', 'jeu', 'signature'])
    for (const acte of actes) expect(PLANS.find((p) => p.acte === acte).de % 4).toBe(0)
    expect(enSecondes(PLANS.at(-1).de)).toBeLessThan(DUREE_S - 1.5)
  })

  test('quatre réels, puis la story, le vocal, et le jeu dans l’ordre frappe → coffre → niveau → rang', () => {
    expect(PLANS.map((p) => p.id)).toEqual(['reel-1', 'reel-2', 'reel-3', 'reel-4', 'story', 'vocal', 'frappe', 'coffre', 'niveau', 'rang', 'signature'])
  })

  test('l’extrait part sur un premier temps et le jeu entre sur le sommet du morceau (69,7 s)', () => {
    const jeu = PLANS.find((p) => p.acte === 'jeu')
    expect(MUSIQUE.debutS + enSecondes(jeu.de)).toBeCloseTo(69.69, 1)
    expect(MUSIQUE.debutS + DUREE_S).toBeLessThan(118)
    expect(TEMPS_S).toBeCloseTo(60 / 139, 6)
  })

  test('chaque repère sonore tombe dans la vidéo, sur un son déclaré, sous sa licence', () => {
    const p = plan('fr')
    for (const r of p.reperes) {
      expect(SONS[r.son]).toBeDefined()
      expect(r.instantS).toBeGreaterThanOrEqual(0)
      expect(r.instantS).toBeLessThan(DUREE_S)
      expect(r.departS).toBeGreaterThanOrEqual(0)
    }
    for (const s of Object.values(SONS)) expect(s.licence).toBe('https://mixkit.co/license/#sfxFree')
    expect(MUSIQUE.licence).toBe('https://mixkit.co/license/#musicFree')
    expect(REPERES.filter((r) => r.son === 'impact').map((r) => r.temps)).toEqual([0, 48])
  })

  test('le coup du marteau tombe sur l’instant où la prise le montre', () => {
    const p = plan('fr')
    const frappe = p.plans.find((x) => x.id === 'frappe')
    const coup = p.reperes.find((r) => r.son === 'frappe')
    // l'entrée dans le clip précède le premier mouvement de 0,25 s : le coup, 0,41 s après ce mouvement, tombe 0,66 s
    // après le début du plan.
    expect(coup.instantS).toBeCloseTo(frappe.debutS + 0.66, 3)
    expect(frappe.entreeS).toBeCloseTo(0.6 + 0.04 - 0.25, 3)
  })

  test('la bascule du vocal vers la langue du lecteur se lit dans la prise, et son éclat sonore tombe dessus', () => {
    const p = plan('fr')
    const vocal = p.plans.find((x) => x.id === 'vocal')
    expect(vocal.basculeS).toBeCloseTo(2.73 + 0.3, 3)
    expect(p.reperes.find((r) => r.plan === 'vocal').instantS).toBeCloseTo(vocal.debutS + vocal.basculeS, 3)
  })

  test('une étape absente de la prise arrête le montage en la nommant', () => {
    const story = PLANS.find((p) => p.id === 'story')
    expect(() => entreeDuPlan({ plan: story, rapport: rapport({}) })).toThrow('ouverture')
    const frappe = PLANS.find((p) => p.id === 'frappe')
    expect(() => entreeDuPlan({ plan: frappe, rapport: rapport(), mouvementMs: null })).toThrow('mouvement')
  })

  test('une prise manquante arrête le montage en la nommant', () => {
    const sans = prises()
    delete sans['interaction-story']
    expect(() => planDeLEntete({ lang: 'fr', prises: sans, nomDeFiche: nomDeFiche('fr') })).toThrow('interaction-story')
  })
})

describe('l’en-tête épique : les langues (#9904)', () => {
  test.each(KIT_LANGS)('%s : quatre réels écrits dans quatre AUTRES langues, lus dans celle du lecteur', (lang) => {
    const legendes = [1, 2, 3, 4].map((n) => legendeDuReel(n, lang))
    expect(new Set(legendes.map((l) => l.langues.origine.code)).size).toBe(4)
    legendes.forEach((l, i) => {
      expect(l.langues.origine.code).not.toBe(lang)
      expect(l.langues.lecteur.code).toBe(lang)
      expect(l.traduction).toBe(REELS_DROLES[i].textes[lang])
      expect(l.original).toBe(REELS_DROLES[i].textes[l.langues.origine.code])
    })
  })

  test.each(KIT_LANGS)('%s : chaque texte de l’en-tête existe, et la signature est le nom de la fiche sans la marque', (lang) => {
    const p = plan(lang)
    for (const x of p.plans.filter((q) => q.acte !== 'signature')) expect(x.titre).toBeTruthy()
    const signature = p.plans.find((q) => q.acte === 'signature')
    expect(signature.titre).toBeTruthy()
    expect(signature.titre).not.toMatch(/Meeshy/)
    expect(nomDeFiche(lang)).toContain(signature.titre.slice(1))
  })

  test('« Meeshy : Parle au monde entier » devient « Parle au monde entier », un nom inattendu est refusé', () => {
    expect(titreDeSignature('Meeshy : Parle au monde entier\n')).toBe('Parle au monde entier')
    expect(titreDeSignature('Meeshy: habla con el mundo')).toBe('Habla con el mundo')
    expect(() => titreDeSignature('Autre application')).toThrow('inattendu')
  })

  test('en arabe tout se retourne : les côtés, et la fenêtre de la caméra autour de l’axe de l’écran', () => {
    const fr = plan('fr')
    const ar = plan('ar')
    expect(ar.dir).toBe('rtl')
    fr.plans.filter((p) => p.cote).forEach((p, i) => {
      const q = ar.plans[i]
      expect(q.cote).toBe(p.cote === 'droite' ? 'gauche' : 'droite')
      expect(q.camera.de.x + q.camera.de.largeur / 2).toBeCloseTo(1320 - (p.camera.de.x + p.camera.de.largeur / 2), 6)
    })
  })

  test('les textes du jeu reprennent ceux des aperçus, sans le point final', () => {
    expect(TEXTES_ENTETE.frappe.titre.fr).toBe('Frappe ta Meesh')
    for (const lang of KIT_LANGS) expect(TEXTES_ENTETE.rang.sousTitre[lang]).toBeTruthy()
  })
})

describe('l’en-tête épique : la caméra et la loupe (#9904)', () => {
  test('une fenêtre reste dans l’écran, sous la barre d’état', () => {
    const f = fenetre(0, 0, 2)
    expect(f.x).toBe(0)
    expect(f.y).toBe(165)
    const g = fenetre(1320, 2868, 2)
    expect(g.x + g.largeur).toBeCloseTo(1320, 6)
    expect(g.y + g.hauteur).toBeCloseTo(2868, 6)
  })

  test('le vocal suit son bouton quand la conversation s’arrête plus bas', () => {
    const vocal = PLANS.find((p) => p.id === 'vocal')
    const r = recaler(vocal, { repereY: vocal.repere.y + 84 })
    expect(r.loupe.y).toBe(vocal.loupe.y + 84)
    for (const f of [r.camera.de, r.camera.a]) expect(f.y + f.hauteur).toBeLessThanOrEqual(2868 + 1e-6)
    const haute = recaler({ ...vocal, camera: { de: fenetre(660, 1200, 2), a: fenetre(660, 1200, 2) } }, { repereY: vocal.repere.y + 84 })
    expect(haute.camera.de.y).toBeCloseTo(fenetre(660, 1200, 2).y + 84, 6)
    expect(recaler(vocal, {}).loupe).toEqual(vocal.loupe)
  })

  test('une loupe tient dans 660 × 430 px CSS, au rapport de son rectangle', () => {
    for (const p of PLANS.filter((x) => x.loupe)) {
      const l = tailleDeLoupe(p.loupe)
      expect(l.largeur).toBeLessThanOrEqual(660)
      expect(l.hauteur).toBeLessThanOrEqual(430)
      expect(l.largeur / l.hauteur).toBeCloseTo(p.loupe.largeur / p.loupe.hauteur, 1)
    }
  })

  test('le modèle de la page : les réels s’enchaînent au coup de poing, le reste entre au fouet, le jeu éclate sur ses coups', () => {
    const p = plan('fr')
    const images = Object.fromEntries(p.plans.filter((x) => x.clip).map((x) => [x.id, { dossier: `images/${x.id}`, nombre: 60 }]))
    const m = modeleDeLaPage({ plan: p, images })
    expect(m.plans.map((x) => x.entree)).toEqual(['fouet', 'poing', 'poing', 'poing', 'fouet', 'fouet', 'fouet', 'fouet', 'fouet', 'fouet'])
    expect(m.plans.filter((x) => x.loupe).map((x) => x.id)).toEqual(['vocal', 'frappe', 'coffre', 'niveau', 'rang'])
    expect(m.blocs.map((b) => b.id)).toEqual(['reels', 'story', 'vocal', 'frappe', 'coffre', 'niveau'])
    expect(m.citations).toHaveLength(4)
    expect(m.coups.length).toBeGreaterThanOrEqual(5)
    expect(m.signature.titre).toBe('Parle au monde entier')
  })
})

describe('l’en-tête épique : le mixage (#9904)', () => {
  test('la musique est l’extrait du plan, chaque effet est posé à son départ, rien n’est normalisé par entrée', () => {
    const p = plan('fr')
    const f = filtreDeMixage({ reperes: p.reperes })
    expect(f).toContain(`atrim=start=${MUSIQUE.debutS}:end=${(MUSIQUE.debutS + DUREE_S).toFixed(3)}`)
    expect(f).toContain(`amix=inputs=${p.reperes.length + 1}:duration=first:normalize=0`)
    for (const r of p.reperes) expect(f).toContain(`adelay=${Math.round(r.departS * 1000)}|${Math.round(r.departS * 1000)}`)
  })

  test('la sonie vise -16 LUFS et -1,5 dBTP ; la seconde passe applique la mesure de la première, en linéaire', () => {
    expect(CIBLE_LUFS).toBe(-16)
    expect(CRETE_DBTP).toBe(-1.5)
    expect(filtreDeSonie()).toBe('loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json')
    const mesure = lireMesure('[Parsed_loudnorm] {\n "input_i" : "-20.1", "input_tp" : "-3.0", "input_lra" : "6.2", "input_thresh" : "-30.4", "target_offset" : "0.2" \n}')
    expect(filtreDeSonie(mesure)).toContain('measured_I=-20.1:measured_TP=-3.0:measured_LRA=6.2:measured_thresh=-30.4:offset=0.2:linear=true')
    const args = argumentsDeMixage({ musique: '/m.mp3', sons: Object.fromEntries(Object.keys(SONS).map((k) => [k, `/${k}.wav`])), reperes: plan('fr').reperes, mesure, sortie: '/o.wav' })
    expect(args.at(-1)).toBe('/o.wav')
    expect(args.filter((a) => a === '-i')).toHaveLength(plan('fr').reperes.length + 1)
  })
})

describe('l’en-tête épique : les sources et le dépôt (#9904)', () => {
  test('un son téléchargé qui n’est pas celui du kit est refusé et effacé', () => {
    const dossier = mkdtempSync(join(tmpdir(), 'entete-son-'))
    const prendre = (_url, chemin) => writeFileSync(chemin, 'autre chose')
    expect(() => sourceVerifiee({ source: 'https://x', fichier: 'a.wav', sha256: 'f'.repeat(64) }, { dossier, prendre })).toThrow('n’est pas celui du kit')
    expect(existsSync(join(dossier, 'a.wav'))).toBe(false)
    const octets = 'le bon son'
    const chemin = sourceVerifiee({ source: 'https://x', fichier: 'b.wav', sha256: empreinte(Buffer.from(octets)) }, { dossier, prendre: (_u, c) => writeFileSync(c, octets) })
    expect(readFileSync(chemin, 'utf8')).toBe(octets)
  })

  test('le dépôt remplace l’ancien en-tête de la langue et ne touche à rien d’autre du dossier', () => {
    const metadata = mkdtempSync(join(tmpdir(), 'entete-depot-'))
    const dossier = join(metadata, 'fr-FR', 'product_page_header')
    mkdirSync(dossier, { recursive: true })
    writeFileSync(join(dossier, '01-entete-fr-FR.mp4'), 'ancien')
    writeFileSync(join(dossier, 'notes.txt'), 'à garder')
    const source = join(mkdtempSync(join(tmpdir(), 'entete-src-')), nomDuFichier('fr'))
    writeFileSync(source, 'nouveau')
    const d = deposerLEntete({ chemin: source, lang: 'fr', metadata })
    expect(d.retires).toEqual(['01-entete-fr-FR.mp4'])
    expect(readdirSync(dossier).sort()).toEqual([nomDuFichier('fr'), 'notes.txt'].sort())
  })
})
