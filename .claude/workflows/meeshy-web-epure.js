export const meta = {
  name: 'meeshy-web-epure',
  description:
    "Épure de l'interface web (#17584) : chaque vue de apps/web ne montre que le texte nécessaire à l'instant, le reste passe derrière un (i), ⋯ ou « Plus ». Un socle (gate de verbosité à budgets par vue, (i) généralisé, capture avant/après) puis huit lots par famille d'écrans. Par lot : relevé AVANT (captures + mots visibles), contrat « texte actuel → devient » par vue, témoin rouge, épure du code et des sept catalogues, relevé APRÈS, revue-correction, gate web complet, PR vers dev avec ses paires avant/après. Rien n'est fusionné par le workflow.",
  whenToUse:
    "Lancer ou reprendre l'épure de l'interface web (#17584, compte rendu https://claude.ai/artifact/3Hh8N7AcCUCkogwtzT8rur). Args, tous optionnels : { attribution (lignes de pied de commit ; défaut AUCUNE), repo ('/home/user/meeshy'), racineWorktrees (dossier parent du clone), worktrees (lots simultanés, 3, plafond 4), base ('dev'), essais (2), seulement [clés], sauter [clés], socleFait (false : true si L0 est déjà dans dev), parapluie (17584) }.",
  phases: [
    { title: 'Socle', detail: 'gate check-verbosity + budgets, (i) sur rangées et titres de bloc, capture avant/après ; fusion requise avant les lots', model: 'opus' },
    { title: 'Avant', detail: 'issue fille, branche poussée tôt, captures et mots visibles de chaque vue du lot, contrat texte → devient', model: 'sonnet' },
    { title: 'Épurer', detail: 'témoin rouge (budget + tests d’écran), code et sept catalogues, relevé après', model: 'sonnet' },
    { title: 'Relire', detail: 'revue-correction : aucun texte perdu, accessibilité, sept langues, règles 1 à 6', model: 'opus' },
    { title: 'Prouver', detail: 'bun run gate dans apps/web, corrections à la cause racine', model: 'sonnet' },
    { title: 'PR', detail: 'PR vers dev (non fusionnée) avec paires avant/après et tableau des budgets', model: 'sonnet' },
  ],
}

const A = args && typeof args === 'object' ? args : {}
const REPO = typeof A.repo === 'string' && A.repo ? A.repo : '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const ESSAIS = Number.isInteger(A.essais) && A.essais >= 0 ? A.essais : 2
const ATTR = typeof A.attribution === 'string' ? A.attribution.trim() : ''
const PARAPLUIE = Number.isInteger(A.parapluie) ? A.parapluie : 17584
const SEULEMENT = new Set(Array.isArray(A.seulement) ? A.seulement : [])
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const RACINE_WT = typeof A.racineWorktrees === 'string' && A.racineWorktrees ? A.racineWorktrees : REPO.replace(/\/[^/]+$/, '')
const ESPACES = Number.isInteger(A.worktrees) && A.worktrees > 0 ? Math.min(A.worktrees, 4) : 3
const WT = l => `${RACINE_WT}/wt-epure-${l.cle}`
const BRANCHE = l => `claude/web-epure-${l.cle}`
const OUTILS = '.claude/workflows/meeshy-web-epure'

const REGLES = `LES SIX RÈGLES DE L'ÉPURE (#${PARAPLUIE}) :
1. Un libellé NOMME, il n'explique pas. L'explication passe derrière un (i) (apps/web/src/components/info-hint.tsx : InfoHintButton + note, la note reste dans le DOM en sr-only et citée par aria-describedby). Le nom accessible du (i) est la QUESTION à laquelle la note répond, jamais « Plus d'infos ».
2. Pas de sous-titre qui répète le titre (« Envoyer des images · Les invités peuvent partager des photos » devient « Images »).
3. Le titre de section porte le verbe (« Autoriser »), les rangées sont des noms.
4. Un état vide tient en une ligne, plus une action s'il en existe une.
5. Un texte tronqué est un texte en trop : on retire la légende, on garde la valeur ou la jauge.
6. Le rare se range derrière « Plus », ⋯ ou une fiche ; au repos l'écran porte l'action nominale.
NE SE RETIRE PAS : la conséquence d'un geste irréversible (suppression, E2EE irréversible, purge admin), le consentement légal, les pages publiques exigées par les magasins (/account/deletion est EXEMPTÉE). Elle se dit en une phrase, le détail derrière (i).
AUCUN TEXTE N'EST PERDU : un libellé qui quitte l'écran garde sa clé de catalogue et devient le texte d'un (i), d'une fiche ou d'un « Plus ». Une clé qui n'a plus AUCUN lecteur est supprimée des SEPT catalogues (fr, en, es, pt, de, it, ar) dans le même commit ; un libellé raccourci l'est dans les sept, traduit, jamais copié du français.
UN (i) N'EST PAS UN DÉPOTOIR : un libellé qui se comprend seul n'en reçoit pas. Si l'explication n'apprend rien, elle est supprimée, pas déplacée.`

const LOTS = [
  { cle: 'reglages', titre: 'Les réglages se lisent en libellés, chaque explication derrière son (i)',
    vues: ['/settings', '/settings (Sécurité)', '/settings/notifications', 'appareils chiffrés (settings-e2ee-devices)', 'cercles prévenus (settings-circle-notify)', 'téléchargement des médias (settings-media-download)', 'comptes (settings-accounts)', 'packs (settings-packs)'],
    notes: 'Prototype : /settings 387 → 137 mots. Les huit paragraphes sous les interrupteurs de Confidentialité, Notifications et Données passent derrière (i). Libellés courts proposés dans prototype-rules.json (clé "settings").' },
  { cle: 'liens', titre: 'Les écrans de liens nomment leurs entrées sans les paraphraser',
    vues: ['/links', '/links/share', '/links/share/new', '/links/share/$link', '/links/share/$link/arrivals', '/links/tracking', '/links/tracking/new', '/links/tracking/$token', '/links/affiliate', '/links/affiliate/new', '/links/communities', '/links/communities/$community'],
    notes: 'Prototype : /links 86 → 28, /links/share/new 125 → 43. Retirer la carte d’en-tête de /links, les sous-titres des quatre entrées, les sous-titres des interrupteurs du formulaire ; seul « Date de naissance » garde un (i).' },
  { cle: 'entree', titre: 'Les écrans d’entrée ne disent rien deux fois',
    vues: ['/welcome', '/login', '/signup', '/signup/affiliate/$token', '/auth/magic-link', '/auth/magic-link/validate', '/forgot-password', '/reset-password', '/onboarding', '/download', 'portes « Connectez-vous pour continuer » (/settings/notifications, /settings/data-export hors session)', '/world'],
    notes: 'Déjà traités en partie (#6441, #6626) : ne pas défaire. Reste : mentions légales écrites trois fois sur /signup, pied « version + cinq liens » sur chaque écran, phrases qui répètent les boutons de magasin sur /download, légende de jauge du jeu dans /onboarding. /account/deletion est EXEMPTÉE.' },
  { cle: 'jeu', titre: 'Le jeu montre des valeurs, ses règles sont à un toucher',
    vues: ['/me/progression', '/me/progression/reglages', '/me/progression/saison', '/me/progression/ligue', '/me/progression/badges', '/me/progression/defis', '/me/progression/succes', '/me/progression/vitrine', '/me/progression/atlas', '/me/progression/prestige', '/me/progression/carnet', '/me/progression/regles', '/me/progression/concept/$concept', '/me/progression/tableau-de-bord'],
    notes: 'Prototype : réglages du jeu 304 → 103, voyage 169 → 116. /regles (2 917 mots) : sommaire de concepts repliés, un ouvert à la fois, le texte ne change pas. Médailles : le palier suivant seul, l’échelle au toucher. Joute : l’unité une fois en tête de colonne. Consulter l’agent jeu-saisons-ligues pour tout libellé de saison ou de ligue.' },
  { cle: 'social', titre: 'Découvrir, profil, appels et états vides tiennent en une ligne',
    vues: ['/discover', '/discover (Cercles)', '/communities', '/communities/new', '/communities/$community', '/communities/$community/members', '/communities/$community/settings', '/me', '/u/$username', '/notifications', '/calls', '/calls/keypad', '/call/$callId', '/me/bookmarks', '/me/starred-messages', '/me/sounds', '/hashtag/$tag'],
    notes: 'Tous les états vides de l’application appartiennent à ce lot (règle 4). /notifications : trois filtres + « Plus » (les onze restent atteignables), compteur de non lus écrit une fois. /call/$callId : pas de bloc Transcription vide, pas de ligne Type redondante.' },
  { cle: 'conversations', titre: 'La liste et le fil gardent leurs gestes rares derrière « Plus »',
    vues: ['/chats', '/c/$conversation', '/conversations/new', 'fiches du fil (thread-sheets, send-sheet, composer-attach)', '/chat/$link'],
    notes: '/chats : quatre filtres visibles + « Plus », les dix restent atteignables, l’ordre retient ceux qu’emploie l’utilisateur. Chiffrement (catalog-conversation-encryption-fr.ts, 32 libellés > 80 caractères) : une ligne par mode ; la phrase d’IRRÉVERSIBILITÉ reste entière et visible. Lot SENSIBLE : audit adversarial sur tout ce qui touche le choix du mode de chiffrement.', sensible: true },
  { cle: 'fil', titre: 'Le fil et les réels n’écrivent pas un compteur nul',
    vues: ['/feed', '/reels', '/reel/$post', '/post/$post', '/stories', '/stories/mine'],
    notes: 'Un compteur à 0 ne s’écrit pas (icône seule). NE PAS toucher au studio (/stories/new, /posts/new, /status/new) : il relève de la planche du composer et d’une décision porteur.' },
  { cle: 'admin', titre: 'L’administration confirme en une phrase et détaille à la demande',
    vues: ['/admin et ses 35 écrans (catalogues interface-catalogs/admin/*-fr.ts)'],
    notes: '275 libellés > 80 caractères. Explications du journal d’audit (*.explain) derrière (i). Corps de confirmation destructifs : UNE phrase de conséquence visible + « Détail ». La conséquence d’un geste irréversible reste obligatoire avant le geste. Les écrans ne se capturent qu’avec un rôle admin dans les fixtures : le relevé se fait par les tests d’écran et measure-catalogs.mjs.' },
].filter(l => (SEULEMENT.size ? SEULEMENT.has(l.cle) : true) && !SAUTER.has(l.cle))

const PIED = ATTR ? `Terminer chaque message de commit par ces lignes, telles quelles :\n${ATTR}` : 'Aucune ligne d’attribution dans les commits.'
const COMMUN = l => `Dépôt ${GH}, clone ${REPO}. Ton worktree : ${WT(l)} (crée-le depuis origin/${BASE} s'il n'existe pas : git -C ${REPO} fetch origin ${BASE} && git -C ${REPO} worktree add ${WT(l)} -B ${BRANCHE(l)} origin/${BASE} ; s'il existe, refusionne origin/${BASE} dedans). Branche : ${BRANCHE(l)}. Ne travaille QUE dans ce worktree, ne pousse QUE cette branche (git push -u origin ${BRANCHE(l)}).
${PIED}
${REGLES}
Outils du chantier dans ${OUTILS}/ : prototype-rules.json (les règles du prototype du 2026-11-11 : pour chaque vue prototypée, les textes masqués, passés en (i) ou raccourcis — c'est une PROPOSITION de contrat, à confirmer contre l'écran vivant), prototype.mjs, measure-catalogs.mjs.
GitHub : outils MCP mcp__github__* (pas de gh, sauf gh api pour la recherche).`

const ETAT = { type: 'object', properties: { ok: { type: 'boolean' }, issue: { type: 'integer' }, resume: { type: 'string' }, bloque: { type: 'string' } }, required: ['ok', 'resume'] }
const REVUE = { type: 'object', properties: { ok: { type: 'boolean' }, corrections: { type: 'array', items: { type: 'string' } }, restes: { type: 'array', items: { type: 'string' } } }, required: ['ok', 'corrections', 'restes'] }
const PREUVE = { type: 'object', properties: { vert: { type: 'boolean' }, echecs: { type: 'array', items: { type: 'string' } } }, required: ['vert', 'echecs'] }
const PR = { type: 'object', properties: { pr: { type: 'integer' }, url: { type: 'string' }, resume: { type: 'string' } }, required: ['resume'] }

// ---------------------------------------------------------------------------
// SOCLE — seul, et FUSIONNÉ avant les lots : ils en consomment le gate et le (i).
// ---------------------------------------------------------------------------
const SOCLE = { cle: 'socle' }
if (!A.socleFait && !SAUTER.has('socle')) {
  phase('Socle')
  const socle = await agent(`${COMMUN(SOCLE)}

TU LIVRES LE SOCLE de l'épure (#${PARAPLUIE}). Ouvre d'abord l'issue fille « Le gate web refuse une vue qui dépasse son budget de mots visibles » (parent ${PARAPLUIE}), pousse la branche avec un premier commit dans les quinze minutes, puis en TDD :
1. apps/web/scripts/capture-verbosity.mjs : pour une liste de vues (apps/web/verbosity-views.json : nom, chemin, attente éventuelle), ouvre le build fixtures (vite preview, 390 × 844, horloge figée comme scripts/capture.mjs, via scripts/lib/browser.mjs), attend que l'écran soit peint, compte les MOTS VISIBLES (nœuds texte dont l'élément a une boîte non nulle, visible, opacité non nulle ; total et premier écran), et écrit une capture par vue dans render/ (non versionné). Reprends la mesure de ${OUTILS}/prototype.mjs, y compris la reprise quand l'écran rend 0 mot.
2. apps/web/verbosity-budgets.json : le relevé d'aujourd'hui par vue, tel que mesuré (aucun budget inventé). apps/web/scripts/check-verbosity.mjs : échoue si une vue dépasse son budget, et si un budget MONTE par rapport à origin/${BASE} (cliquet, même mécanique que budgets.json / budgets-measured.json). Branche-le dans le script "gate" de apps/web/package.json. Couvre au moins les vues listées dans les huit lots : ${LOTS.flatMap(l => l.vues).filter(v => v.startsWith('/')).join(', ')} — une vue à paramètre prend un identifiant de fixtures ; une vue qu'on ne peut pas ouvrir en fixtures est LISTÉE comme non couverte dans le fichier, jamais omise en silence.
3. Le (i) hors des écrans d'entrée : une rangée de réglage et un titre de bloc acceptent une note optionnelle rendue par InfoHintButton + sa note (un seul (i) ouvert à la fois par écran, cible 44 pt, focus visible, Échap referme, note en sr-only quand repliée). UN composant, consommé par les rangées de settings-sections.tsx et les blocs de progression-reglages.tsx sans changer leur texte dans ce lot. Tests de comportement (bun test + happy-dom) : nom accessible, aria-expanded, aria-controls, la note est citée par aria-describedby de l'interrupteur.
4. bun run gate vert dans apps/web. PR vers ${BASE}, corps = ce que le socle apporte + comment un lot s'en sert (trois lignes). Ne fusionne pas toi-même : active l'auto-merge si le dépôt le permet (mcp__github__enable_pr_auto_merge), sinon dis-le.
Rends ok=true seulement si la PR est ouverte et le gate vert.`, { label: 'socle', phase: 'Socle', schema: ETAT, model: 'opus' })
  if (!socle || !socle.ok) {
    log(`Socle non livré : ${socle ? socle.bloque || socle.resume : 'agent interrompu'}. Les lots ne partent pas.`)
    return { socle, lots: [] }
  }
  const fusion = await agent(`Dépôt ${GH}. La PR du socle de l'épure (branche ${BRANCHE(SOCLE)} vers ${BASE}) doit être FUSIONNÉE avant que les lots partent. Lis son état (mcp__github__list_pull_requests, pull_request_read). Si elle est fusionnée, rends ok=true. Si elle est ouverte, verte et fusionnable, et que l'auto-merge est armé, attends au plus dix minutes en relisant son état toutes les deux minutes. Ne la fusionne pas à la main. Rends ok=false avec la raison si elle n'est pas fusionnée.`, { label: 'socle:fusion', phase: 'Socle', schema: ETAT, model: 'sonnet', effort: 'low' })
  if (!fusion || !fusion.ok) {
    log(`Socle en PR mais pas dans ${BASE} : relancer avec { socleFait: true } après sa fusion.`)
    return { socle, fusion, lots: [] }
  }
}

// ---------------------------------------------------------------------------
// LOTS — au plus ESPACES à la fois (un worktree chacun), chacun de bout en bout.
// ---------------------------------------------------------------------------
const unLot = async l => {
  const avant = await agent(`${COMMUN(l)}

LOT « ${l.titre} ». Vues : ${l.vues.join(' ; ')}.
Notes : ${l.notes}

ÉTAPE AVANT — n'écris AUCUN code d'écran.
1. Ouvre l'issue fille (parent ${PARAPLUIE}), titre = « ${l.titre} », corps = Contexte · Preuve · Critère de fin · dimensions visées (12, 8, 5, 6, 11).
2. Pousse la branche dans les quinze minutes (premier commit : les vues du lot ajoutées à apps/web/verbosity-views.json si elles manquent).
3. Relevé : bun run build puis capture-verbosity sur les vues du lot. Garde les captures dans render/avant/.
4. CONTRAT : pour CHAQUE vue, un tableau « texte actuel (clé de catalogue) → devient (supprimé | derrière (i) avec quelle question | raccourci en … | rangé derrière Plus/⋯) » et le budget de mots visé. Lis l'écran vivant et son catalogue, pas seulement prototype-rules.json. Une explication qui porte une conséquence irréversible ou légale reste visible. Poste le contrat en commentaire de l'issue fille (pied : « _Generated by [Claude Code](https://claude.ai/code)_ »).
Rends l'issue, et dans resume le contrat complet (il sert à l'étape suivante).`, { label: `avant:${l.cle}`, phase: 'Avant', schema: ETAT, model: 'sonnet' })
  if (!avant || !avant.ok) return { cle: l.cle, etat: 'bloqué avant', detail: avant ? avant.bloque || avant.resume : 'interrompu' }

  const epure = await agent(`${COMMUN(l)}

LOT « ${l.titre} », issue #${avant.issue}. Contrat validé à l'étape précédente :
${avant.resume}

ÉTAPE ÉPURER, en TDD :
1. ROUGE : baisse dans apps/web/verbosity-budgets.json le budget de chaque vue du lot à la valeur du contrat (check-verbosity échoue), et écris les tests d'écran qui attendent le nouvel état : le libellé court, le (i) avec son nom accessible, la note présente pour le lecteur d'écran, le contrôle rangé toujours atteignable (« un contrôle existe s'il a un effet »). Commit du témoin rouge.
2. VERT : épure le code et les SEPT catalogues. Aucun texte en dur dans un .tsx. Aucune clé orpheline, aucune clé manquante (i18n-catalog.test.ts). Un fichier hors budget de taille ne reçoit rien : on extrait d'abord.
3. Relevé APRÈS (render/apres/), check-verbosity vert sur le lot, bun test et type-check verts.
Ne touche à aucun écran d'un autre lot ni au studio. Ce que tu découvres hors périmètre devient une issue, pas un correctif.
Rends dans resume le tableau vue · mots avant → après.`, { label: `épurer:${l.cle}`, phase: 'Épurer', schema: ETAT, model: 'sonnet' })
  if (!epure || !epure.ok) return { cle: l.cle, issue: avant.issue, etat: 'bloqué à l’épure', detail: epure ? epure.bloque || epure.resume : 'interrompu' }

  const revue = await agent(`${COMMUN(l)}

REVUE-CORRECTION du lot « ${l.titre} » (issue #${avant.issue}). Lis le diff de ${BRANCHE(l)} contre origin/${BASE} et CORRIGE toi-même ce qui suit, un commit par correction :
- un texte retiré de l'écran qui n'est plus atteignable nulle part (perdu) ;
- une conséquence irréversible, un consentement ou une mention légale passés derrière un (i) ;
- un (i) sans nom accessible en forme de question, sans note sr-only, sous 44 pt, ou posé sur un libellé qui se comprend seul ;
- une des sept langues non traduite, copiée du français, ou qui déborde (allemand) ; l'arabe en RTL ;
- un libellé raccourci devenu ambigu hors de son titre de section ;
- un budget relevé au lieu d'un texte retiré, un test qui vérifie l'implémentation plutôt que ce que l'utilisateur lit.
Regarde les captures render/apres/ : un trou, un chevauchement ou un bloc vide laissé par un retrait est un défaut.
${l.sensible ? 'Lot SENSIBLE : fais en plus relire par l’agent auditeur-adversarial tout ce qui touche le choix et l’annonce du mode de chiffrement, et applique son verdict.' : ''}
Rends corrections (faites) et restes (ce qui demande une décision porteur ou une issue de suivi, que tu ouvres).`, { label: `relire:${l.cle}`, phase: 'Relire', schema: REVUE, model: 'opus' })

  let preuve = null
  for (let tour = 0; tour <= ESSAIS; tour++) {
    preuve = await agent(`${COMMUN(l)}

PREUVE du lot « ${l.titre} »${tour ? ` (tour de correction ${tour}/${ESSAIS})` : ''}. Refusionne origin/${BASE}, puis dans apps/web : bun run gate. ${tour ? `Échecs du tour précédent : ${(preuve && preuve.echecs || []).join(' | ')}. Corrige à la CAUSE RACINE (jamais un test sauté, jamais un budget relevé), commit, pousse, relance.` : 'Si tout est vert, pousse.'} Rends vert et la liste exacte des échecs restants.`, { label: `prouver:${l.cle}${tour ? `#${tour}` : ''}`, phase: 'Prouver', schema: PREUVE, model: 'sonnet' })
    if (preuve && preuve.vert) break
  }
  if (!preuve || !preuve.vert) return { cle: l.cle, issue: avant.issue, etat: 'rouge', detail: preuve ? preuve.echecs : 'interrompu', restes: revue ? revue.restes : [] }

  const pr = await agent(`${COMMUN(l)}

PR du lot « ${l.titre} » vers ${BASE} (ne la fusionne pas). Titre = le titre du lot. Corps : « Closes #${avant.issue} », le tableau vue · mots avant → après, le contrat appliqué, les paires de captures avant/après (téléverse-les dans un commentaire de l'issue ou décris où les régénérer : capture-verbosity sur ${BASE} puis sur la branche), les dimensions mûres et celles qui restent (${(revue && revue.restes || []).join(' ; ') || 'aucune'}), et l'issue miroir iOS/Android ouverte pour chaque libellé raccourci qui existe aussi sur ces plateformes. Reprends le gabarit de PR du dépôt s'il existe. Puis retire le worktree s'il est propre et poussé (git -C ${REPO} worktree remove ${WT(l)}), sinon signale-le.`, { label: `pr:${l.cle}`, phase: 'PR', schema: PR, model: 'sonnet' })
  return { cle: l.cle, issue: avant.issue, etat: pr && pr.pr ? 'PR ouverte' : 'vert sans PR', pr: pr ? pr.pr : null, url: pr ? pr.url : null, mesures: epure.resume, restes: revue ? revue.restes : [] }
}

const resultats = []
for (let i = 0; i < LOTS.length; i += ESPACES) {
  const vague = LOTS.slice(i, i + ESPACES)
  log(`Lots ${vague.map(l => l.cle).join(', ')} (${i + vague.length}/${LOTS.length})`)
  const rendus = await parallel(vague.map(l => () => unLot(l)))
  rendus.forEach((r, j) => resultats.push(r || { cle: vague[j].cle, etat: 'interrompu' }))
}

const bilan = resultats.map(r => `- ${r.cle} : ${r.etat}${r.pr ? ` (#${r.pr})` : ''}${r.restes && r.restes.length ? ` · reste : ${r.restes.join(' ; ')}` : ''}`).join('\n')
await agent(`Dépôt ${GH}. Poste sur l'issue #${PARAPLUIE} (mcp__github__add_issue_comment) le bilan de ce tour du workflow meeshy-web-epure, tel quel, suivi du pied « _Generated by [Claude Code](https://claude.ai/code)_ » :\n\n${bilan}`, { label: 'bilan', phase: 'PR', model: 'haiku', effort: 'low' })
return { lots: resultats }
