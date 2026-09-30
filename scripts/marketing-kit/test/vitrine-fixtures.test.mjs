import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { DEMO, lecteurDe, partenaireDe } from '../textes/demo.mjs'
import { ID_DEBAT, ID_GLOBAL, LIEN_LISBOA, MESURE_PAR_DEFAUT, exporterVitrine, idAmour, oid } from '../vitrine/fixtures.mjs'
import { RACINE_MEDIAS } from '../vitrine/medias.mjs'

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
