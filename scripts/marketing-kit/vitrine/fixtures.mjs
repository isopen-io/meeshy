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
