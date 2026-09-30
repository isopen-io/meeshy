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

  test.each(KIT_LANGS)('%s : une conversation directe se lit en tête-à-tête — ni salut « à tous », ni aperçu repris d’une autre ligne, ni bio', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const francais = (c) => (c.lastMessageOriginalLanguage === 'fr' ? c.lastMessage.content : c.lastMessageTranslations.fr)
    const bios = new Set(Object.values(DEMO.bios).map((b) => b.text))
    const directes = f.conversations.filter((c) => c.type === 'direct')
    const autres = new Set(f.conversations.filter((c) => c.type !== 'direct').map((c) => c.lastMessage.content))
    for (const c of directes) {
      expect(francais(c)).not.toMatch(/groupe|à tous|tout le monde/i)
      expect(autres.has(c.lastMessage.content)).toBe(false)
      expect(bios.has(c.lastMessage.content)).toBe(false)
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

  test('l’élan suit la règle partagée : entier, 1 + (familles − 1) + l’assise, gagnée seulement par 10 succès ou 5 hauts badges', () => {
    const { progression: p } = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    const succes = p.milestones.filter((m) => m.milestoneType === 'achievement').length
    const hautsBadges = p.milestones.filter((m) => m.milestoneType === 'badge' && Number(m.milestoneKey.split(':')[1]) >= 100).length
    expect(p.elan.hasStanding).toBe(succes >= 10 || hautsBadges >= 5)
    expect(p.elan.activeFamilyCount).toBe(p.elan.activeFamilies.length)
    expect(p.elan.factor).toBe(1 + (p.elan.activeFamilyCount - 1) + (p.elan.hasStanding ? 1 : 0))
  })

  test('des Meesh déjà frappées portent leur première et leur dernière frappe', () => {
    const { progression: p } = exporterVitrine({ lang: 'fr', maintenant: MAINTENANT })
    expect(p.meesh.mintedLifetime).toBeGreaterThan(0)
    expect(p.meesh.firstMintedAt).toMatch(ISO_MS)
    expect(p.meesh.lastMintedAt).toMatch(ISO_MS)
    expect(p.meesh.firstMintedAt < p.meesh.lastMintedAt).toBe(true)
  })

  test('deux exports au même instant sont identiques', () => {
    expect(exporterVitrine({ lang: 'de', maintenant: MAINTENANT })).toEqual(exporterVitrine({ lang: 'de', maintenant: MAINTENANT }))
  })

  test('l’échantillon que décode l’app iOS est à jour', () => {
    expect(JSON.parse(readFileSync(ECHANTILLON, 'utf8'))).toEqual(exporterVitrine({ lang: 'fr', maintenant: MAINTENANT }))
  })
})
