// Le contenu d'une vitrine (#8855), au format EXACT des réponses de la passerelle : l'app le
// décode avec son décodeur de production (`APIClient.makeAPIPayloadDecoder()`) et le range dans
// ses vraies bases. Une seule source : les textes du kit.
import { createHash } from 'node:crypto'
import { KIT_LANGS } from '../lib/locales.mjs'
import { CREDITS } from '../lib/photos.mjs'
import { DEMO, lecteurDe, partenaireDe, profilDe } from '../textes/demo.mjs'
import { REELS_DROLES, STORIES_DE_L_ENTETE } from '../textes/reels.mjs'
import { AFFILIATION, SAV, SONDE } from '../textes/liens.mjs'
import { VIDEO_DU_REEL, afficheMedia, photoMedia, segmenter, videoMedia, vocalMedia } from './medias.mjs'

export const VERSION_FIXTURES = 2

// Un identifiant stable au format ObjectId : une même graine donne toujours le même identifiant.
export const oid = (graine) => createHash('sha1').update(graine).digest('hex').slice(0, 24)

export const ID_GLOBAL = oid('conv:global')
export const ID_DEBAT = oid('conv:debat')
export const ID_NOVA = oid('conv:nova')
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

// Une pièce vocale telle que la passerelle la sert : sa transcription, et une piste traduite par langue.
const pieceVocale = ({ son, pistes, texte, langue, messageId, auteur, maintenant, minutes, mesures }) => {
  const mesure = (media) => mesures[media.url] ?? MESURE_PAR_DEFAUT
  const duree = mesure(son).dureeMs
  return {
    ...piece({ media: { ...son, taille: mesure(son).taille }, messageId, auteur, maintenant, minutes }),
    duration: duree,
    transcription: { text: texte, language: langue, confidence: 0.97, durationMs: duree, segments: segmenter(texte, duree) },
    translations: Object.fromEntries(pistes.map((p) => {
      const d = mesure(p).dureeMs
      return [p.lang, { type: 'audio', url: p.url, transcription: p.texte, durationMs: d, format: 'm4a', cloned: true, quality: 0.93, ttsModel: 'chatterbox', segments: segmenter(p.texte, d) }]
    })),
  }
}

const vocal = ({ lang, maintenant, mesures, minutes }) => {
  const conversationId = idAmour(lang)
  const partenaire = partenaireDe(lang)
  const original = DEMO.amour.vocalRecu[partenaire.lang]
  const id = oid(`msg:${conversationId}:amour.vocal.recu`)
  const { original: son, pistes } = mediasDuVocal(lang)
  return {
    id,
    conversationId,
    senderId: idParticipant(conversationId, partenaire),
    createdAt: iso(maintenant, minutes),
    sender: expediteur(conversationId, partenaire),
    content: '',
    originalLanguage: original.lang,
    messageType: 'audio',
    attachments: [pieceVocale({ son, pistes, texte: original.text, langue: original.lang, messageId: id, auteur: partenaire, maintenant, minutes, mesures })],
  }
}

// Le vocal que la scène `interaction-commentaire-audio` envoie sous le post d'Aiko (#9820) : le lecteur y répond dans SA
// langue, et la passerelle le traduit dans celle d'Aiko et en anglais (en français pour un lecteur anglophone).
export const languesDuCommentaireVocal = (lang) => [...new Set([profilDe('aiko.t').lang, lang === 'en' ? 'fr' : 'en'])].filter((l) => l !== lang)

const mediasDuCommentaireVocal = (lang) => {
  const lecteur = lecteurDe(lang)
  const cle = (l) => `commentaire-${lecteur.pseudo}-${l}`
  return {
    original: vocalMedia({ cle: cle(lang), texte: DEMO.commentaireVocal[lang], lang }),
    pistes: languesDuCommentaireVocal(lang).map((l) => vocalMedia({ cle: cle(l), texte: DEMO.commentaireVocal[l], lang: l })),
  }
}

// Il vit dans « Nova », un groupe de la liste qu'aucune scène n'ouvre : sa ligne garde son dernier message, plus récent
// (160 min), et le vocal reste plus jeune que le plus ancien message montré (185 min) — la garde de minuit n'y perd rien.
const commentaireVocal = ({ lang, maintenant, mesures }) => {
  const lecteur = lecteurDe(lang)
  const minutes = 170
  const id = oid(`msg:${ID_NOVA}:commentaire.vocal:${lecteur.pseudo}`)
  const { original: son, pistes } = mediasDuCommentaireVocal(lang)
  return {
    id,
    conversationId: ID_NOVA,
    senderId: idParticipant(ID_NOVA, lecteur),
    createdAt: iso(maintenant, minutes),
    sender: expediteur(ID_NOVA, lecteur),
    content: '',
    originalLanguage: lang,
    messageType: 'audio',
    attachments: [pieceVocale({ son, pistes, texte: DEMO.commentaireVocal[lang], langue: lang, messageId: id, auteur: lecteur, maintenant, minutes, mesures })],
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

// Le message que la scène 2 rouvre sur son original : celui d'un AUTRE membre, dans une AUTRE langue,
// parmi les dernières répliques — celles que l'écran de l'iPhone montre.
const CANDIDATS_ORIGINAL = ['debat.quitte', 'debat.popcorn', 'debat.patate-douce']

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
  const idNova = ID_NOVA
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

// Les réels drôles de l'en-tête (#9904), tels que `GET /posts/feed/reels` les sert : une vraie vidéo, son affiche, la
// légende écrite par son auteur dans SA langue et traduite dans les sept langues de lecture. L'auteur qui parle la langue
// du lecteur cède la parole à son remplaçant : le spectateur lit toujours une légende traduite.
export const auteurDuReel = (reel, lang) => {
  const auteur = reel.auteurs.map(profilDe).find((p) => p.lang !== lang)
  if (!auteur) throw new Error(`${reel.id} : aucun auteur hors de la langue ${lang}`)
  return auteur
}

const reelsDroles = (lang, maintenant) =>
  REELS_DROLES.map((reel, i) => {
    const auteur = auteurDuReel(reel, lang)
    const video = videoMedia(reel.video)
    const affiche = afficheMedia(reel.video)
    const minutes = 12 + i * 9
    return {
      id: oid(`reel:${reel.id}`),
      type: 'REEL',
      visibility: 'PUBLIC',
      content: reel.textes[auteur.lang],
      originalLanguage: auteur.lang,
      createdAt: iso(maintenant, minutes),
      updatedAt: iso(maintenant, minutes),
      author: identite(auteur),
      likeCount: 1840 - i * 377,
      commentCount: 96 - i * 17,
      repostCount: 0,
      viewCount: 23_400 - i * 4_100,
      bookmarkCount: 0,
      shareCount: 41 - i * 6,
      reactionSummary: { '😂': 1240 - i * 260, '❤️': 600 - i * 117 },
      media: [{
        id: oid(`reel-media:${reel.id}`), fileName: video.fichier, originalName: video.fichier, mimeType: 'video/mp4',
        fileUrl: video.url, thumbnailUrl: affiche.url, width: video.width, height: video.height, duration: video.dureeMs, order: 0,
      }],
      translations: Object.fromEntries(Object.entries(reel.textes).filter(([l]) => l !== auteur.lang).map(([cible, text]) => [cible, { text }])),
    }
  })

// La story que la scène `interaction-story` ouvre (#9904) : une photo, et sur la scène le texte de son auteur, dans SA
// langue, avec ses traductions — le lecteur la lit dans la sienne. Elle expire dans 23 h.
export const storyDeLEntete = (lang) => {
  const story = STORIES_DE_L_ENTETE.map((id) => DEMO.story.find((s) => s.id === id)).find((s) => profilDe(s.auteur).lang !== lang)
  if (!story) throw new Error(`aucune story hors de la langue ${lang}`)
  return story
}

const storiesDeLEntete = (lang, maintenant) => {
  const story = storyDeLEntete(lang)
  const photo = photoMedia(story.photo)
  const minutes = 25
  return [{
    id: oid(`story:${story.id}`),
    type: 'STORY',
    visibility: 'PUBLIC',
    content: null,
    originalLanguage: story.lang,
    createdAt: iso(maintenant, minutes),
    updatedAt: iso(maintenant, minutes),
    expiresAt: iso(maintenant, minutes - 23 * 60),
    author: identite(profilDe(story.auteur)),
    likeCount: 64,
    commentCount: 0,
    repostCount: 0,
    viewCount: 212,
    bookmarkCount: 0,
    shareCount: 0,
    media: [{
      id: oid(`story-media:${story.id}`), fileName: photo.fichier, originalName: photo.fichier, mimeType: 'image/jpeg',
      fileSize: photo.taille, fileUrl: photo.url, width: photo.width, height: photo.height, order: 0,
    }],
    storyEffects: {
      textObjects: [{
        id: oid(`story-texte:${story.id}`), text: story.text, sourceLanguage: story.lang, translations: story.translations,
        x: 0.5, y: 0.7, scale: 1, rotation: 0, zIndex: 1, fontSize: 84, textStyle: 'bold', textColor: 'FFFFFF',
        textAlign: 'center',
      }],
    },
  }]
}

const photoDuFichier = (fichier) => Object.keys(CREDITS).find((nom) => CREDITS[nom].fichier === fichier)

// Tout ce que les messages et les posts désignent : le script de capture le dépose, l'app le range.
const mediasDe = ({ lang, fils, lesPosts, lesStories }) => {
  const images = [
    ...Object.values(fils).flat().flatMap((m) => m.attachments ?? []).filter((a) => a.mimeType === 'image/jpeg'),
    ...lesPosts.flatMap((p) => p.media),
    ...lesStories.flatMap((s) => s.media),
  ]
  const { original, pistes } = mediasDuVocal(lang)
  const commentaire = mediasDuCommentaireVocal(lang)
  return [...new Set(images.map((a) => a.fileName))].map((fichier) => photoMedia(photoDuFichier(fichier)))
    .concat([original, ...pistes, commentaire.original, ...commentaire.pistes, videoMedia(VIDEO_DU_REEL)])
    .concat(REELS_DROLES.flatMap((r) => [videoMedia(r.video), afficheMedia(r.video)]))
}

// Ce que chaque scène ouvre (spec § 3) : sa conversation, et le message ou la pièce qu'elle met en avant.
const scenes = (lang, fils) => {
  const leVocal = fils[idAmour(lang)].at(-1)
  const leCommentaire = fils[ID_NOVA].at(-1)
  return {
    global: { conversationId: ID_GLOBAL },
    amour: { conversationId: idAmour(lang), messageId: leVocal.id, attachmentId: leVocal.attachments[0].id },
    groupe: { conversationId: ID_DEBAT, messageId: messageOriginal(lang) },
    imagine: { conversationId: idAmour(lang), messageId: oid(`msg:${idAmour(lang)}:amour.vue`) },
    'interaction-commentaire-audio': { conversationId: ID_NOVA, messageId: leCommentaire.id, attachmentId: leCommentaire.attachments[0].id },
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

// Le LIEN (#9904). « Dis-moi tout » : la conversation d'un lien anonyme partagé aux proches, où chacun écrit SANS compte
// (`sender.type: 'anonymous'`), dans sa langue — le lecteur la lit dans la sienne. Un message écrit dans la langue du
// lecteur n'y figure pas : la scène montre des traductions.
export const ID_SONDE = oid('conv:sonde')

const expediteurAnonyme = (conversationId, pseudo) => ({
  id: oid(`anon:${conversationId}:${pseudo}`), username: pseudo, displayName: pseudo, type: 'anonymous',
})

export const messagesDeLaSonde = (lang, maintenant) => SONDE.messages.filter((m) => m.lang !== lang).map((m, i, tous) => {
  const id = oid(`msg:${ID_SONDE}:${m.id}`)
  const minutes = 4 + (tous.length - i) * 3
  return {
    id, conversationId: ID_SONDE, senderId: expediteurAnonyme(ID_SONDE, m.pseudo).id, createdAt: iso(maintenant, minutes),
    sender: expediteurAnonyme(ID_SONDE, m.pseudo), content: m.textes[m.lang], originalLanguage: m.lang, messageType: 'text',
    translations: traductions(id, { lang: m.lang, translations: Object.fromEntries(Object.entries(m.textes).filter(([l]) => l !== m.lang)) }),
  }
})

const conversationDeLaSonde = (lang, maintenant, messages) => ({
  id: ID_SONDE, type: 'group', title: SONDE.titre[lang], memberCount: messages.length + 1, unreadCount: 0, isMember: true,
  createdAt: iso(maintenant, 3 * JOUR), updatedAt: messages.at(-1).createdAt, ...ligneDe(messages.at(-1)),
})

// Les conversations de SAV : une par produit, la dernière question d'un client SANS compte, dans sa langue.
export const ID_SAV = (cle) => oid(`conv:sav:${cle}`)

const conversationsDuSav = (lang, maintenant) => SAV.map((c, i) => {
  const id = ID_SAV(c.cle)
  const client = expediteurAnonyme(id, c.client)
  // Plus récentes que tout le reste de la liste (le vocal d'« amour » a 2 min) : elles s'affichent en tête.
  const minutes = 0.5 + i * 0.35
  return {
    id, type: 'group', title: c.titre[lang], memberCount: 18 + i * 7, unreadCount: 3 - Math.min(i, 2), isMember: true,
    createdAt: iso(maintenant, 20 * JOUR), updatedAt: iso(maintenant, minutes),
    lastMessage: { id: oid(`last:${id}`), content: c.textes[c.lang], senderId: client.id, createdAt: iso(maintenant, minutes), messageType: 'text', sender: client },
    lastMessageTranslations: Object.fromEntries(Object.entries(c.textes).filter(([l]) => l !== c.lang)),
    lastMessageOriginalLanguage: c.lang,
    lastMessageAt: iso(maintenant, minutes),
  }
})

// Le lien du premier SAV, tel qu'un client sans compte l'ouvre (`GET /links/:id`). Le client, c'est le lecteur : le SAV
// est celui d'une autre activité, celle de Kwame — un lecteur ne s'invite pas lui-même.
const lienDuSav = (lang, maintenant) => {
  const c = SAV[0]
  const langues = [...new Set([lang, ...SAV.map((x) => x.lang)])]
  return {
    id: oid(`link:${c.lien}`), linkId: c.lien, name: c.titre[lang], currentUses: 41, currentConcurrentUsers: 3,
    requireAccount: false, requireNickname: false, requireEmail: false, requireBirthday: false, allowedLanguages: [],
    allowAnonymousMessages: true, allowAnonymousImages: true, allowAnonymousFiles: false, allowViewHistory: true,
    conversation: { id: ID_SAV(c.cle), title: c.titre[lang], type: 'group', createdAt: iso(maintenant, 20 * JOUR) },
    creator: identite(profilDe('kwame.m')),
    stats: { totalParticipants: 42, memberCount: 42, anonymousCount: 37, languageCount: langues.length, spokenLanguages: langues },
  }
}

// Les liens d'affiliation du lecteur, au format de la passerelle (`GET /affiliate/tokens`).
const liensDAffiliation = (lang, maintenant) => AFFILIATION.map((a, i) => ({
  id: oid(`affiliate:${a.cle}`), token: a.cle, name: a.nom[lang], affiliateLink: `https://meeshy.me/join?affiliate=${a.cle}`,
  maxUses: null, currentUses: a.inscrits, isActive: true, expiresAt: null, createdAt: iso(maintenant, (30 + i * 9) * JOUR),
  _count: { affiliations: a.inscrits }, clickCount: a.clics,
}))

export const exporterVitrine = ({ lang, maintenant, mesures = {} }) => {
  if (!KIT_LANGS.includes(lang)) throw new Error(`langue hors kit : ${lang}`)
  const fils = {
    [ID_GLOBAL]: messagesGlobal(maintenant),
    [idAmour(lang)]: messagesAmour(lang, maintenant, mesures),
    [ID_DEBAT]: messagesDebat(lang, maintenant),
    [ID_NOVA]: [commentaireVocal({ lang, maintenant, mesures })],
  }
  const lesPosts = posts(maintenant)
  const lesStories = storiesDeLEntete(lang, maintenant)
  const sonde = messagesDeLaSonde(lang, maintenant)
  return {
    version: VERSION_FIXTURES,
    lang,
    lecteur: utilisateur(lecteurDe(lang), maintenant),
    conversations: conversations(lang, maintenant, fils),
    messages: { ...fils, [ID_SONDE]: sonde },
    progression: progression(maintenant),
    lienInvitation: lienInvitation(lang, maintenant),
    modesDeLecture: { [ID_GLOBAL]: 'script', [ID_DEBAT]: 'script', [idAmour(lang)]: 'bubbles', [ID_SONDE]: 'script' },
    medias: mediasDe({ lang, fils, lesPosts, lesStories }),
    posts: lesPosts,
    reels: reelsDroles(lang, maintenant),
    stories: lesStories,
    conversationsDeScene: {
      'interaction-sonde': [conversationDeLaSonde(lang, maintenant, sonde)],
      'interaction-sav': conversationsDuSav(lang, maintenant),
    },
    lienSav: lienDuSav(lang, maintenant),
    liensDAffiliation: liensDAffiliation(lang, maintenant),
    scenes: { ...scenes(lang, fils), 'interaction-sonde': { conversationId: ID_SONDE } },
  }
}
