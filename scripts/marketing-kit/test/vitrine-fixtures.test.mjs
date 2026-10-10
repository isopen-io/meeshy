import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REPO_ROOT } from '../lib/catalog.mjs'
import { KIT_LANGS } from '../lib/locales.mjs'
import { DEMO, lecteurDe, partenaireDe, profilDe } from '../textes/demo.mjs'
import { ID_DEBAT, ID_GLOBAL, ID_NOVA, ID_SONDE, LIEN_LISBOA, MESURE_PAR_DEFAUT, exporterVitrine, idAmour, languesDuCommentaireVocal, oid, storyDeLEntete } from '../vitrine/fixtures.mjs'
import { RACINE_MEDIAS, VIDEOS_DES_REELS_DROLES, VIDEO_DU_REEL, afficheMedia, videoMedia } from '../vitrine/medias.mjs'

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
    expect(f.modesDeLecture).toEqual({ [ID_GLOBAL]: 'script', [ID_DEBAT]: 'script', [idAmour('fr')]: 'bubbles', [ID_SONDE]: 'script' })
    expect(f.conversationsDeScene['interaction-sonde'][0].unreadCount).toBe(0)
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

describe('fixtures de la vitrine, lot 2 : ce que la capture montre (#8855)', () => {
  test.each(KIT_LANGS)('%s : le message rouvert sur son original est parmi les quatre derniers du fil — visible sur l’écran de l’iPhone', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.messages[ID_DEBAT].slice(-4).map((m) => m.id)).toContain(f.scenes.groupe.messageId)
  })
})

describe('fixtures de la vitrine : le réel et le commentaire vocal (#9820)', () => {
  test.each(KIT_LANGS)('%s : la vidéo du réel est livrée avec les autres médias', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.medias.filter((m) => m.genre === 'video')).toEqual([VIDEO_DU_REEL, ...VIDEOS_DES_REELS_DROLES].map(videoMedia))
  })

  test.each(KIT_LANGS)('%s : le commentaire vocal est celui du lecteur, dans SA langue, en réponse au post d’Aiko — transcrit et traduit', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const { conversationId, messageId, attachmentId } = f.scenes['interaction-commentaire-audio']
    expect(f.posts[0].author.username).toBe('aiko.t')
    expect(f.conversations.map((c) => c.id)).toContain(conversationId)
    const message = f.messages[conversationId].find((m) => m.id === messageId)
    expect(message.sender.userId).toBe(f.lecteur.id)
    expect(message.messageType).toBe('audio')
    expect(message.originalLanguage).toBe(lang)
    const piece = message.attachments.find((a) => a.id === attachmentId)
    expect(piece.transcription).toMatchObject({ text: DEMO.commentaireVocal[lang], language: lang })
    expect(Object.keys(piece.translations).sort()).toEqual([...languesDuCommentaireVocal(lang)].sort())
    expect(Object.keys(piece.translations)).toContain(profilDe('aiko.t').lang)
    for (const [cible, piste] of Object.entries(piece.translations)) {
      expect(piste.transcription).toBe(DEMO.commentaireVocal[cible])
      expect(piste.segments.at(-1).endMs).toBe(piste.durationMs)
    }
    expect(piece.fileUrl).not.toBe(f.messages[idAmour(lang)].at(-1).attachments[0].fileUrl)
  })

  test.each(KIT_LANGS)('%s : le vocal du commentaire ne change ni la ligne de « Nova » ni la garde de minuit', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const nova = f.conversations.find((c) => c.id === ID_NOVA)
    const vocal = f.messages[ID_NOVA].at(-1)
    expect(nova.lastMessage.id).not.toBe(vocal.id)
    expect(vocal.createdAt < nova.lastMessageAt).toBe(true)
    const plusAncienMontre = [...f.messages[idAmour(lang)], ...f.messages[ID_DEBAT], ...f.messages[ID_GLOBAL]].map((m) => m.createdAt).sort()[0]
    expect(vocal.createdAt > plusAncienMontre).toBe(true)
  })
})

describe('fixtures de la vitrine : les réels drôles et la story de l’en-tête (#9904)', () => {
  test.each(KIT_LANGS)('%s : quatre réels vidéo, chacun écrit dans une AUTRE langue que celle du lecteur, et traduit dans la sienne', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.reels).toHaveLength(4)
    for (const reel of f.reels) {
      expect(reel.type).toBe('REEL')
      expect(reel.id).toMatch(HEX24)
      expect(reel.originalLanguage).not.toBe(lang)
      expect(LANGUE_DE[reel.author.id]).toBe(reel.originalLanguage)
      expect(reel.translations[lang].text).toBeTruthy()
      expect(reel.translations[lang].text).not.toBe(reel.content)
      expect(reel.translations[reel.originalLanguage]).toBeUndefined()
      expect(reel.createdAt).toMatch(ISO_MS)
    }
    expect(new Set(f.reels.map((r) => r.originalLanguage)).size).toBe(4)
  })

  test.each(KIT_LANGS)('%s : chaque réel porte sa vraie vidéo et son affiche, toutes deux livrées', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const urls = new Set(f.medias.map((m) => m.url))
    f.reels.forEach((reel, i) => {
      const [media] = reel.media
      expect(media.mimeType).toBe('video/mp4')
      expect(media.fileUrl).toBe(videoMedia(VIDEOS_DES_REELS_DROLES[i]).url)
      expect(media.thumbnailUrl).toBe(afficheMedia(VIDEOS_DES_REELS_DROLES[i]).url)
      expect(media.duration).toBe(videoMedia(VIDEOS_DES_REELS_DROLES[i]).dureeMs)
      expect(urls.has(media.fileUrl)).toBe(true)
      expect(urls.has(media.thumbnailUrl)).toBe(true)
    })
  })

  test.each(KIT_LANGS)('%s : la story est celle d’un autre, écrite dans sa langue sur la photo, traduite pour le lecteur, encore vivante', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.stories).toHaveLength(1)
    const [story] = f.stories
    const attendue = storyDeLEntete(lang)
    expect(story.type).toBe('STORY')
    expect(story.id).toMatch(HEX24)
    expect(story.author.id).not.toBe(f.lecteur.id)
    expect(new Date(story.expiresAt) > MAINTENANT).toBe(true)
    const [texte] = story.storyEffects.textObjects
    expect(texte.sourceLanguage).toBe(attendue.lang)
    expect(texte.sourceLanguage).not.toBe(lang)
    expect(texte.text).toBe(attendue.text)
    expect(texte.translations[lang]).toBe(attendue.translations[lang])
    expect(f.medias.map((m) => m.url)).toContain(story.media[0].fileUrl)
  })

  test('la story de Lucas, sauf pour Lucas lui-même : il lit celle de Sofía', () => {
    expect(storyDeLEntete('fr').id).toBe('story.lucas')
    expect(storyDeLEntete('pt').id).toBe('story.sofia')
    expect(storyDeLEntete('es').id).toBe('story.lucas')
  })

})

describe('fixtures de la vitrine : le lien — « Dis-moi tout » et les SAV (#9904)', () => {
  test.each(KIT_LANGS)('%s : « Dis-moi tout » est remplie d’invités SANS compte, chacun dans une autre langue, traduits pour le lecteur', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const { conversationId } = f.scenes['interaction-sonde']
    expect(f.conversations.map((c) => c.id)).not.toContain(conversationId)
    expect(f.conversationsDeScene['interaction-sonde'].map((c) => c.id)).toEqual([conversationId])
    const messages = f.messages[conversationId]
    expect(messages.length).toBeGreaterThanOrEqual(4)
    expect(new Set(messages.map((m) => m.originalLanguage)).size).toBe(messages.length)
    for (const m of messages) {
      expect(m.sender.type).toBe('anonymous')
      expect(m.sender.userId).toBeUndefined()
      expect(m.originalLanguage).not.toBe(lang)
      expect(m.translations.map((t) => t.targetLanguage)).toContain(lang)
    }
    expect(f.modesDeLecture[conversationId]).toBe('script')
  })

  test.each(KIT_LANGS)('%s : une conversation de SAV par produit, la dernière question d’un client sans compte, que seule leur scène ajoute', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    const sav = f.conversationsDeScene['interaction-sav']
    expect(sav).toHaveLength(4)
    for (const c of sav) {
      expect(c.id).toMatch(HEX24)
      expect(c.title).toBeTruthy()
      expect(c.lastMessage.sender.type).toBe('anonymous')
      if (c.lastMessageOriginalLanguage !== lang) expect(c.lastMessageTranslations[lang]).toBeTruthy()
    }
    const plusRecent = Math.max(...f.conversations.map((c) => Date.parse(c.lastMessageAt)))
    expect(sav.every((c) => Date.parse(c.lastMessageAt) > plusRecent)).toBe(true)
  })

  test.each(KIT_LANGS)('%s : le lien du SAV s’ouvre sans compte, créé par une autre activité que le lecteur', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.lienSav.linkId).not.toBe(f.lienInvitation.linkId)
    expect(f.lienSav.requireAccount).toBe(false)
    expect(f.lienSav.allowAnonymousMessages).toBe(true)
    expect(f.lienSav.creator.id).not.toBe(f.lecteur.id)
    expect(f.lienSav.conversation.title).toBe(f.conversationsDeScene['interaction-sav'][0].title)
  })

  test.each(KIT_LANGS)('%s : les liens d’affiliation de « Mes liens », leurs clics et leurs inscrits', (lang) => {
    const f = exporterVitrine({ lang, maintenant: MAINTENANT })
    expect(f.liensDAffiliation).toHaveLength(3)
    for (const t of f.liensDAffiliation) {
      expect(t.id).toMatch(HEX24)
      expect(t.name).toBeTruthy()
      expect(t.clickCount).toBeGreaterThan(t._count.affiliations)
      expect(t.createdAt).toMatch(ISO_MS)
    }
  })
})
