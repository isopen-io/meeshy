import { describe, expect, test } from 'bun:test'
import { existsSync } from 'node:fs'
import { LEGENDES } from '../textes/legendes.mjs'
import { VITRINE } from '../templates/vitrine/plan.mjs'
import { HOTE_INJOIGNABLE, TAILLES_NATIVES, argumentsDeLancement, attendreLeSignal, cheminBrut, fixturesMesurees, sourceDuMedia } from '../vitrine/capturer.mjs'
import { exporterVitrine } from '../vitrine/fixtures.mjs'

describe('capture des vrais écrans (#8855)', () => {
  test('lot 2 : six scènes, dans l’ordre du storyboard, sur iPhone et iPad', () => {
    for (const appareil of ['iphone', 'ipad']) {
      expect(VITRINE[appareil].captures.map((c) => c.scene)).toEqual(['amour', 'groupe', 'global', 'lien', 'progression', 'imagine'])
      expect(VITRINE[appareil].captures.map((c) => c.legende)).toEqual(['L1', 'L2', 'L3', 'L10', 'L7', 'L13'])
      for (const c of VITRINE[appareil].captures) expect(LEGENDES[c.legende]).toBeDefined()
    }
    expect([VITRINE.iphone.width, VITRINE.iphone.height]).toEqual([1320, 2868])
    expect([VITRINE.ipad.width, VITRINE.ipad.height]).toEqual([2064, 2752])
  })

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
