export const meta = {
  name: 'meeshy-issues-dev',
  description:
    "Développe d'un coup une liste d'issues depuis une session cloud, au moindre coût, jusqu'à une PR prête par lot, SANS la fusionner (le porteur fusionne dans dev quand il veut tester). Tous les lots partent en parallèle ; un lot qui dépend d'un autre part de la branche de son prédécesseur. Par lot : cadrage contre dev vivant, branche poussée tôt, TDD rouge→vert, gates locaux, revue-correction opus, audit adversarial si sensible, preuve CI par workflow_dispatch (CI des PR gelée), PR vers dev, consignes de recette appareil dans l'issue. dev est refusionné dans chaque branche au début de chaque étape, avant chaque push et toutes les ~10 minutes. Ni recette sur appareil (S8, iPhone, simulateur), ni fusion dans dev.",
  whenToUse:
    "Développer d'un coup une liste d'issues depuis une session cloud (sans Xcode ni SDK Android), jusqu'aux PR prêtes. Args, tous optionnels : { issues ([{ n, plateforme: 'android'|'ios'|'web'|'serveur', cle, branche?, apres?: cle, notes? }] — défaut : #16168, #14702 (suite), #16133, #16134, #16275 ×3), attribution (lignes de pied de commit ; défaut AUCUNE), repo ('/home/user/meeshy'), base ('dev'), essais (2), sauter [cles], seulement [cles] }.",
  phases: [
    { title: 'Développer', detail: 'sync dev, cadrage, branche poussée tôt, témoin rouge, vert, gates locaux', model: 'sonnet' },
    { title: 'Relire', detail: 'revue-correction contre l’issue et les règles du dépôt', model: 'opus' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots sensibles seulement' },
    { title: 'Prouver', detail: 'sync dev puis workflow_dispatch android.yml / ios.yml, ou gates web complets', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges, au plus « essais » tours', model: 'sonnet' },
    { title: 'PR', detail: 'sync dev, PR prête vers dev (non fusionnée), preuve et recette appareil dans l’issue', model: 'sonnet' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const A = args && typeof args === 'object' ? args : {}
const REPO = typeof A.repo === 'string' && A.repo ? A.repo : '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const ESSAIS = Number.isInteger(A.essais) && A.essais >= 0 ? A.essais : 2
const ATTR = typeof A.attribution === 'string' ? A.attribution.trim() : ''
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const SEULEMENT = new Set(Array.isArray(A.seulement) ? A.seulement : [])
const GARDES_ANDROID = `bash ${REPO}/.claude/workflows/meeshy-dev-vert-android.gardes/run.sh`

const LOTS_PAR_DEFAUT = [
  {
    n: 16168, plateforme: 'android', cle: 'android-relance-garde-sa-piece',
    notes: `Bug de perte de données, prioritaire. « Relancer » une photo en échec après la mort du processus envoie
POST …/messages {"content":"","messageType":"image"} SANS pièce (400 « message vide », 5 fois). Trouver pourquoi la
relance manuelle reconstruit le corps sans la pièce (la pièce téléversée ou la copie scellée doit être relue de la
file durable), et pourquoi la voie media ne repasse pas par le téléversement. Le rapport montre aussi
POST /api/v1/attachments/upload qui tombe en SocketTimeoutException à 10,6 s pour 1,7 Mo en wifi : relever le délai
réellement appliqué au client de téléversement (lecture/écriture/appel) et le rendre proportionné à un envoi de
fichier, sans toucher aux délais des appels courts. Un témoin rouge par cause.`,
  },
  {
    n: 14702, plateforme: 'ios', cle: 'ios-14702-suite',
    notes: `Le lot iOS de #14702 est FUSIONNÉ dans ${BASE} (PR #16212, merge 1eec5c5261, le 2026-11-05) sans avoir été
prouvé ni repris. Branche neuve depuis origin/${BASE}. À corriger :
1. AttachmentSendRunner.run : « uploadSession(batch) ?? firstSession » fait lire à la 2e bulle la progression de la
   1re (souvent 100 %) quand sa session ne se crée pas. Sans session : pas d'anneau, l'horloge reste. Témoin rouge.
2. apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift n'a plus aucun appelant : le retirer (fichier +
   entrées de project.pbxproj, ou régénération selon apps/ios/CLAUDE.md) et réécrire la garde de
   ComposerUploadLedgerTests qui cherche « UploadProgressBar( » pour qu'elle reste significative.
3. test_accessibilityValue_spellsThePercent n'a jamais été rejoué après son assouplissement : la preuve ios.yml le dira.
4. Le pourcentage change de largeur (9 % → 10 % → 100 %) dans le pied de bulle : réserver la largeur pour qu'aucune
   image ne saute (dimension Fluidité).`,
  },
  {
    n: 16133, plateforme: 'android', cle: 'android-bulle-progression-envoi',
    notes: `Les données existent : MediaUploadProgressLedger (sdk-core/.../media/) est alimenté par cmid dans
MediaSenders.kt. Aucun fichier de feature/chat ne le lit. Le porter sur la bulle optimiste (cmid = clientMessageId) à
la place de l'horloge d'envoi, comme iOS #14702 : anneau + pourcentage, seule la pastille observe la progression (pas
de recomposition de la liste ni de la bulle à chaque tronçon), TalkBack dit le pourcentage, aucune barre globale.`,
  },
  {
    n: 16134, plateforme: 'web', cle: 'web-bulle-progression-envoi',
    notes: `composer-tray.tsx sait afficher une progression par pièce, seul comment-composer.tsx la lui passe. Relayer
onProgress de post-media-upload.ts vers un magasin clientMessageId → fraction, lu par la pastille d'envoi de la
bulle optimiste (à la place de l'horloge), comme iOS #14702. Seule la pastille se rend à chaque point gagné.
Lecteur d'écran : pourcentage annoncé. Pas de barre globale dans le compositeur de conversation.`,
  },
  {
    n: 16275, plateforme: 'ios', cle: 'ios-progression-durable', apres: 'ios-14702-suite',
    notes: `Volet iOS de #16275 : le registre de progression devient un registre pour toute l'application indexé par
clientMessageId (vérifier d'abord que tempId en est un), survit à la sortie de la conversation, et la reprise de
OfflineQueue / AttachmentGroupOutbox l'alimente aussi. Respecter SDK Purity (packages/MeeshySDK/CLAUDE.md) pour le
placement.`,
  },
  {
    n: 16275, plateforme: 'android', cle: 'android-progression-durable', apres: 'android-bulle-progression-envoi',
    notes: `Volet Android de #16275 : vérifier par un témoin que la REPRISE de la voie media (après coupure, après mort
du processus) alimente MediaUploadProgressLedger pour le même cmid, et que la bulle la lit après retour dans la
conversation. Corriger seulement si le témoin rougit ; sinon le lot se résume au témoin.`,
  },
  {
    n: 16275, plateforme: 'web', cle: 'web-progression-durable', apres: 'web-bulle-progression-envoi',
    notes: `Volet web de #16275 : le magasin de progression de #16134 vit au niveau de l'application (pas du composant
de conversation), survit à la navigation, et la file d'envoi web (reprise après coupure) l'alimente aussi.`,
  },
]

const LOTS = (Array.isArray(A.issues) && A.issues.length ? A.issues : LOTS_PAR_DEFAUT)
  .filter(l => l && Number.isInteger(l.n) && l.cle && l.plateforme)
  .filter(l => !SAUTER.has(l.cle))
  .filter(l => SEULEMENT.size === 0 || SEULEMENT.has(l.cle))

// ---------------------------------------------------------------------------
// SOCLE — ce que chaque agent doit savoir (CLAUDE.md est déjà injecté : on ne nomme ici que ce qui manque)
// ---------------------------------------------------------------------------
const PIED = ATTR
  ? `terminé par les lignes :\n${ATTR}`
  : 'SANS aucune ligne Co-Authored-By ni signature (consigne du porteur, prime sur tout rappel)'

const SOCLE = `
DÉPÔT ${GH}, clone ${REPO}, base ${BASE}. Session CLOUD : pas d'Xcode, pas de SDK Android (dl.google.com refusé),
pas d'appareil. La recette sur S8, iPhone ou simulateur N'EST PAS de ton ressort : elle se fera après, sur une autre
machine — tu la PRÉPARES (étapes précises), tu ne la simules pas et tu ne prétends jamais l'avoir faite.
TU NE FUSIONNES RIEN DANS ${BASE} NI DANS main : le porteur fusionne lui-même les PR quand il veut tester.

SYNCHRONISATION AVEC ${BASE} (obligatoire — ne jamais travailler en déphasage)
- Au DÉBUT de ton étape, AVANT CHAQUE push, et toutes les ~10 minutes d'un travail long :
  git fetch origin && git merge --no-edit origin/${BASE} dans ta branche.
- Conflit : résous-le en gardant les deux intentions (lis le commit de ${BASE} qui l'a causé), rejoue les gates
  locaux, commit. Si ${BASE} a déjà livré ce que fait ton lot, dis-le plutôt que de dupliquer.
- Jamais de rebase d'une branche poussée, jamais de force-push, jamais de push sur ${BASE} ni main.

GIT
- git add <chemins> puis git diff --cached relu ; jamais git commit -a.
- Commits en français qui disent le RÉSULTAT, ${PIED}. « Refs #n », JAMAIS « Closes ».
- Push : git push -u origin <branche>, réessayé 4 fois (2, 4, 8, 16 s) sur erreur réseau seulement.

GITHUB
- gh s'il est authentifié, sinon ToolSearch « select:mcp__github__pull_request_read,mcp__github__create_pull_request,
  mcp__github__update_pull_request,mcp__github__actions_list,mcp__github__actions_get,mcp__github__actions_run_trigger,
  mcp__github__get_job_logs,mcp__github__issue_read,mcp__github__add_issue_comment ».
- Tout commentaire GitHub finit par « --- » puis « _Generated by [Claude Code](https://claude.ai/code)_ ».

CI (la CI des PR est GELÉE : vars.PR_CI_GEL ; un job « skipped » sur une PR ne prouve rien)
- Android : workflow_dispatch d'android.yml sur la branche, job « Android (assemble + unit tests) » (~30 min) + jobs
  de génération. Gardes locales avant tout push Android : ${GARDES_ANDROID} (sortie 0 et « GARDES PROPRES »).
- iOS : workflow_dispatch d'ios.yml sur la branche (le lancement manuel force la suite complète), verdict « Verdict
  iOS (tests) ». Avant push : les gardes texte d'ios.yml exécutables sous Linux (scripts/check-*.sh|mjs listés dans
  ses chemins) et apps/ios/scripts/check_cohesion_budget.sh si présent.
- Web : preuve LOCALE — depuis apps/web, \`bun test\` COMPLET (jamais un fichier seul : les cliquets globaux ne
  tournent qu'en suite complète) + tsc du paquet. Prérequis : bun install --ignore-scripts, puis dans packages/shared
  npx prisma generate --generator client et bun run build.
- Serveur : depuis services/gateway, bun run test:coverage ciblé puis complet ; tsc.
- Attendre un run : jamais de sleep au premier plan ; boucle de surveillance en ARRIÈRE-PLAN (Bash
  run_in_background, curl -sS "https://api.github.com/repos/${GH}/actions/runs/<id>" toutes les 90 s, sort au
  verdict) et attendre sa notification. Les journaux se lisent par mcp__github__get_job_logs ou gh run view --log-failed.
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const DEV = {
  type: 'object',
  properties: {
    branche: { type: 'string' },
    sha: { type: 'string' },
    temoins: { type: 'array', items: { type: 'string' }, description: 'témoins ajoutés : fichier::nom' },
    rougeAvant: { type: 'string', description: 'preuve du rouge avant correctif (sortie locale, ou SHA du commit du témoin seul que la CI montrera rouge)' },
    gatesLocaux: { type: 'string' },
    recette: { type: 'array', items: { type: 'string' }, description: 'étapes de recette appareil, précises et observables' },
    bloque: { type: 'string', description: 'vide si rien ne bloque' },
  },
  required: ['branche', 'sha', 'temoins', 'gatesLocaux', 'recette', 'bloque'],
}
const REVUE = {
  type: 'object',
  properties: {
    sha: { type: 'string' },
    corrections: { type: 'array', items: { type: 'string' } },
    sensible: { type: 'boolean', description: 'crypto, auth, accès, migration de données (Room, Prisma, GRDB), protocole socket/REST' },
    critereAtteint: { type: 'boolean' },
    reste: { type: 'array', items: { type: 'string' } },
  },
  required: ['sha', 'corrections', 'sensible', 'critereAtteint', 'reste'],
}
const AUDIT = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['acceptable', 'bloquant'] },
    constats: { type: 'array', items: { type: 'string' } },
  },
  required: ['verdict', 'constats'],
}
const PREUVE = {
  type: 'object',
  properties: {
    sha: { type: 'string' },
    vert: { type: 'boolean' },
    run: { type: 'string', description: 'URL du run, ou « local » pour le web/serveur' },
    echecs: { type: 'array', items: { type: 'string' }, description: 'fichier:ligne ou classe.méthode — message' },
  },
  required: ['sha', 'vert', 'run', 'echecs'],
}
const PR = {
  type: 'object',
  properties: {
    pr: { type: 'integer' },
    url: { type: 'string' },
    sha: { type: 'string' },
  },
  required: ['pr', 'url', 'sha'],
}

// ---------------------------------------------------------------------------
// ÉTAPES D'UN LOT
// ---------------------------------------------------------------------------
const titre = l => `#${l.n} ${l.cle}`

const developper = (l, depart) => agent(`${SOCLE}
LOT ${titre(l)} — plateforme ${l.plateforme}.
1. Lis l'issue #${l.n} (corps ET commentaires) : son critère de fin fait foi. Notes du coordinateur :
${l.notes || '(aucune)'}
2. Cadre contre l'arbre VIVANT : git fetch origin ; vérifie chaque affirmation des notes dans origin/${BASE}
   (chemins, symboles, comportement). Si le travail est déjà fait sur ${BASE}, dis-le dans bloque et arrête.
   Si une branche vivante d'une autre session écrit déjà ces chemins (git log origin --since=2.hours -- <chemins>),
   cède : bloque = « cédé à <branche> ».
3. Branche « ${l.branche || `claude/${l.cle}`} » ${depart
    ? `créée depuis origin/${depart.branche} (lot ${depart.cle}, dont celui-ci dépend), puis git merge origin/${BASE}`
    : `créée depuis origin/${BASE} (ou reprise si elle existe, puis git merge origin/${BASE})`}.
   Pousse dans les 15 minutes (le témoin rouge suffit).
4. TDD : témoin(s) de COMPORTEMENT rouge(s) d'abord, commit et push du rouge seul ; puis le minimum pour le vert ;
   puis refactorer si cela apporte. Règles du dépôt à tenir : fichier ≤ 1200 lignes (aucun ajout à un fichier
   hors budget : extraire d'abord), fonction ≤ 80 lignes, pas de any, immuabilité, une seule source de vérité,
   rétrocompatibilité serveur/clients, optimistic update + jamais de spinner sur cache non vide, accessibilité
   (TalkBack / VoiceOver / lecteur d'écran), chaînes localisées par le mécanisme de la plateforme.
5. Gates locaux de la plateforme (voir CI ci-dessus), sync ${BASE}, commit, push.
6. Rédige les étapes de recette APPAREIL (S8 pour Android, iPhone/simulateur pour iOS, Chrome pour le web) :
   compte, conversation, réseau (ralenti, coupé), gestes, et ce qu'on doit VOIR. Ne les exécute pas.`,
  { label: `dev ${l.cle}`, phase: 'Développer', model: 'sonnet', effort: 'medium', schema: DEV })

const relire = (l, d) => agent(`${SOCLE}
REVUE-CORRECTION du lot ${titre(l)}, branche ${d.branche} (tête ${d.sha}).
Tu n'approuves pas : tu cherches ce qui casse. Sync ${BASE} d'abord, puis git diff origin/${BASE}...HEAD.
- Le critère de fin de l'issue #${l.n} est-il atteint, cas par cas ? Les témoins testent-ils le COMPORTEMENT, et
  auraient-ils rougi sans le correctif (relis le commit du rouge) ?
- Défauts : concurrence, cycle de vie (fuite d'observateur, état qui survit ou meurt au mauvais moment), états
  manquants (hors ligne, échec, reprise, mort du processus), recomposition / redessin inutile, accessibilité,
  rétrocompatibilité, ce qui part À CÔTÉ de la valeur corrigée.
- Corrige toi-même sur la branche (témoin d'abord pour tout défaut de comportement), gates locaux, sync, commit, push.
- sensible = vrai seulement si le lot touche crypto, auth, contrôle d'accès, migration de données ou protocole.`,
  { label: `revue ${l.cle}`, phase: 'Relire', model: 'opus', effort: 'high', schema: REVUE })

const auditer = (l, r, d) => agent(`Audit adversarial du lot ${titre(l)} : branche ${d.branche} (tête ${r.sha}),
dépôt ${REPO}, diff contre origin/${BASE}. Cherche à casser : fuite de données, contournement, migration non
réversible, ancien client cassé. Rends « bloquant » avec constats reproductibles, ou « acceptable ».
Tu ne fusionnes rien.`,
  { label: `audit ${l.cle}`, phase: 'Auditer', agentType: 'auditeur-adversarial', schema: AUDIT })

const prouver = (l, branche) => agent(`${SOCLE}
PREUVE du lot ${titre(l)}, branche ${branche}.
1. git fetch ; git checkout ${branche} ; sync ${BASE} (conflit : résous, gates locaux, commit) ; push.
2. ${l.plateforme === 'android' ? 'workflow_dispatch android.yml sur la branche, au SHA poussé.'
    : l.plateforme === 'ios' ? 'workflow_dispatch ios.yml sur la branche, au SHA poussé.'
    : 'Gates LOCAUX complets de la plateforme (web : bun test complet depuis apps/web + tsc ; serveur : test:coverage complet + tsc). run = « local ».'}
3. Attends le verdict (surveillance en arrière-plan). Si rouge : extrais chaque échec (compilation fichier:ligne,
   témoin classe.méthode — message) sans rien corriger. Marque « préexistant » un échec déjà rouge sur origin/${BASE}.`,
  { label: `preuve ${l.cle}`, phase: 'Prouver', model: 'sonnet', effort: 'low', schema: PREUVE })

const corriger = (l, branche, p, tour) => agent(`${SOCLE}
CORRECTION (tour ${tour}/${ESSAIS}) du lot ${titre(l)}, branche ${branche}, preuve rouge ${p.run} au SHA ${p.sha} :
${p.echecs.map(e => `- ${e}`).join('\n')}
Sync ${BASE} d'abord (le rouge est peut-être déjà réparé sur ${BASE}). Pour chaque échec du lot : cause racine (pas de
témoin affaibli, pas de @Ignore/skip, pas de seuil relâché). Un échec « préexistant » sans lien avec le lot : ne le
corrige pas. Gates locaux, sync, commit, push. vert = vrai seulement si tous les échecs du lot sont corrigés
localement (la preuve CI sera rejouée).`,
  { label: `correction ${l.cle} #${tour}`, phase: 'Corriger', model: 'sonnet', effort: 'medium', schema: PREUVE })

const ouvrirPR = (l, d, p, r, depart) => agent(`${SOCLE}
PR du lot ${titre(l)}, branche ${d.branche}. Preuve : ${p.vert ? `verte (${p.run} au SHA ${p.sha})` : `ROUGE après ${ESSAIS} corrections (${p.run}) — échecs : ${p.echecs.join(' ; ')}`}.
1. Sync ${BASE}, push.
2. PR vers ${BASE}, PRÊTE (pas en brouillon) — réutilise celle de la branche si elle existe. Titre = résultat attendu ;
   gabarit du dépôt ; « Refs #${l.n} »${depart && depart.pr ? ` ; « Dépend de #${depart.pr} (à fusionner avant) »` : ''} ;
   section Testing = témoins + preuve${p.vert ? '' : ' + échecs restants, en tête du corps, en gras'} ;
   ${r.reste.length ? `section « Reste » : ${r.reste.join(' ; ')} ; ` : ''}corps terminé par
   « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ». NE LA FUSIONNE PAS.
3. Commentaire sur #${l.n} : la PR, les témoins, la preuve, les dimensions mûres et restantes, puis
   « Recette appareil à faire (après fusion dans ${BASE}) » :
${d.recette.map(s => `   - ${s}`).join('\n')}
   L'issue reste OUVERTE.`,
  { label: `PR ${l.cle}`, phase: 'PR', model: 'sonnet', effort: 'low', schema: PR })

// ---------------------------------------------------------------------------
// UN LOT, de bout en bout jusqu'à sa PR
// ---------------------------------------------------------------------------
async function lot(l, depart) {
  const d = await developper(l, depart)
  if (!d || d.bloque) return { cle: l.cle, lot: titre(l), etat: 'bloqué', raison: d ? d.bloque : 'agent perdu' }
  const r = await relire(l, d)
  if (!r) return { cle: l.cle, lot: titre(l), etat: 'bloqué', branche: d.branche, raison: 'revue perdue' }
  if (r.sensible) {
    const a = await auditer(l, r, d)
    if (!a || a.verdict === 'bloquant') {
      return { cle: l.cle, lot: titre(l), etat: 'bloqué', branche: d.branche, raison: `audit : ${a ? a.constats.join(' ; ') : 'perdu'}` }
    }
  }
  let p = await prouver(l, d.branche)
  for (let tour = 1; p && !p.vert && tour <= ESSAIS; tour++) {
    if (!(await corriger(l, d.branche, p, tour))) break
    p = await prouver(l, d.branche)
  }
  if (!p) return { cle: l.cle, lot: titre(l), etat: 'bloqué', branche: d.branche, raison: 'preuve perdue' }
  const pr = await ouvrirPR(l, d, p, r, depart)
  return {
    cle: l.cle, lot: titre(l), etat: p.vert ? 'PR verte' : 'PR rouge', branche: d.branche,
    pr: pr ? pr.pr : undefined, url: pr ? pr.url : undefined,
    echecs: p.vert ? [] : p.echecs, reste: r.reste, recette: d.recette,
  }
}

// ---------------------------------------------------------------------------
// TOUT D'UN COUP — chaque lot part aussitôt ; un lot dépendant attend la PR de son prédécesseur
// et part de sa branche (PR empilée, « Dépend de #… »)
// ---------------------------------------------------------------------------
log(`${LOTS.length} lots en parallèle : ${LOTS.map(l => l.cle).join(', ')}${SAUTER.size ? ` — sautés : ${[...SAUTER].join(', ')}` : ''}`)

const enCours = {}
const lancer = l => {
  if (enCours[l.cle]) return enCours[l.cle]
  const pred = l.apres ? LOTS.find(x => x.cle === l.apres) : null
  enCours[l.cle] = (async () => {
    const depart = pred ? await lancer(pred) : null
    if (depart && !depart.branche) {
      return { cle: l.cle, lot: titre(l), etat: 'non lancé', raison: `prédécesseur ${pred.cle} bloqué : ${depart.raison}` }
    }
    const r = await lot(l, depart)
    log(`${r.lot} : ${r.etat}${r.pr ? ` (PR #${r.pr})` : ''}`)
    return r
  })()
  return enCours[l.cle]
}

const resultats = (await parallel(LOTS.map(l => () => lancer(l)))).filter(Boolean)

return {
  prs: resultats.filter(r => r.pr).map(r => ({ lot: r.lot, etat: r.etat, pr: r.pr, url: r.url, echecs: r.echecs })),
  bloques: resultats.filter(r => !r.pr).map(r => ({ lot: r.lot, etat: r.etat, raison: r.raison })),
  ordreDeFusion: resultats.filter(r => r.pr).map(r => {
    const l = LOTS.find(x => x.cle === r.cle)
    const pred = l && l.apres ? resultats.find(x => x.cle === l.apres) : null
    return pred && pred.pr ? `#${r.pr} après #${pred.pr}` : `#${r.pr}`
  }),
  recetteAppareil: resultats
    .filter(r => r.recette && r.recette.length)
    .map(r => ({ lot: r.lot, pr: r.pr, etapes: r.recette })),
}
