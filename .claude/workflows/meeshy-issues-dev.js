export const meta = {
  name: 'meeshy-issues-dev',
  description:
    "Développe des issues de bout en bout depuis une session cloud, au moindre coût : une chaîne par plateforme (android, ios, web, serveur) en parallèle, lots en série dans chaque chaîne ; par lot : cadrage contre dev vivant, branche poussée tôt, TDD rouge→vert, gates locaux, revue-correction opus, audit adversarial si sensible, preuve CI par workflow_dispatch (CI des PR gelée), PR « Refs #n » fusionnée dans dev, consignes de recette appareil laissées dans l'issue. La recette sur S8, iPhone ou simulateur n'est PAS faite : elle revient à la machine qui a les appareils.",
  whenToUse:
    "Lancer le développement d'une liste d'issues depuis une session cloud (sans Xcode ni SDK Android). Args, tous optionnels : { issues ([{ n, plateforme: 'android'|'ios'|'web'|'serveur', cle, branche?, apres?: [cles], notes? }] — défaut : le lot « progression d'envoi par bulle » #16168, #14702, #16133, #16134, #16275), attribution (lignes de pied de commit ; défaut AUCUNE), repo ('/home/user/meeshy'), base ('dev'), essais (2), sauter [cles], seulement [cles] }.",
  phases: [
    { title: 'Développer', detail: 'cadrage, branche poussée tôt, témoin rouge, vert, gates locaux', model: 'sonnet' },
    { title: 'Relire', detail: 'revue-correction contre l’issue et les règles du dépôt', model: 'opus' },
    { title: 'Auditer', detail: 'auditeur-adversarial sur les lots sensibles seulement' },
    { title: 'Prouver', detail: 'workflow_dispatch android.yml / ios.yml sur la branche à jour de dev', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges, au plus « essais » tours', model: 'sonnet' },
    { title: 'Fusionner', detail: 'PR Refs #n fusionnée dans dev, preuve et recette appareil dans l’issue', model: 'sonnet' },
    { title: 'Bilan', detail: 'CI de dev sur la tête finale, consignes de recette rassemblées', model: 'sonnet' },
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
    n: 14702, plateforme: 'ios', cle: 'ios-14702', branche: 'claude/ios-14702',
    notes: `Lot DÉJÀ écrit sur la branche claude/ios-14702 (commit f5500ddd02, PR #16212 ouverte) : le reprendre, ne pas
le refaire. Y fusionner origin/${BASE} (107 commits de retard le 2026-11-05). À corriger avant fusion :
1. AttachmentSendRunner.run : « uploadSession(batch) ?? firstSession » fait lire à la 2e bulle la progression de la
   1re (souvent 100 %) quand sa session ne se crée pas. Sans session : pas d'anneau, l'horloge reste. Témoin rouge.
2. apps/ios/Meeshy/Features/Main/Components/UploadProgressBar.swift n'a plus aucun appelant : le retirer (fichier +
   les 4 entrées de project.pbxproj, ou régénérer le pbxproj selon apps/ios/CLAUDE.md) et réécrire la garde de
   ComposerUploadLedgerTests qui cherche « UploadProgressBar( » pour qu'elle reste significative.
3. test_accessibilityValue_spellsThePercent n'a jamais été rejoué après son assouplissement : la preuve est ios.yml.
4. Le pourcentage change de largeur (9 % → 10 % → 100 %) dans le pied de bulle : réserver la largeur pour qu'aucune
   image ne saute (dimension Fluidité).`,
  },
  {
    n: 16133, plateforme: 'android', cle: 'android-bulle-progression-envoi', apres: ['android-relance-garde-sa-piece'],
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
    n: 16275, plateforme: 'ios', cle: 'ios-progression-durable', apres: ['ios-14702'],
    notes: `Volet iOS de #16275 : le registre de progression devient un registre pour toute l'application indexé par
clientMessageId (vérifier d'abord que tempId en est un), survit à la sortie de la conversation, et la reprise de
OfflineQueue / AttachmentGroupOutbox l'alimente aussi. Respecter SDK Purity (packages/MeeshySDK/CLAUDE.md) pour le
placement.`,
  },
  {
    n: 16275, plateforme: 'android', cle: 'android-progression-durable', apres: ['android-bulle-progression-envoi'],
    notes: `Volet Android de #16275 : vérifier par un témoin que la REPRISE de la voie media (après coupure, après mort
du processus) alimente MediaUploadProgressLedger pour le même cmid, et que la bulle la lit après retour dans la
conversation. Corriger seulement si le témoin rougit ; sinon le lot se résume au témoin.`,
  },
  {
    n: 16275, plateforme: 'web', cle: 'web-progression-durable', apres: ['web-bulle-progression-envoi'],
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

GIT
- Synchroniser = git fetch origin puis git merge origin/${BASE} (jamais de rebase d'une branche poussée, jamais de
  force-push, jamais de push sur ${BASE} ni main). git add <chemins> puis git diff --cached relu ; jamais git commit -a.
- Commits en français qui disent le RÉSULTAT, ${PIED}. Message : « Refs #n », JAMAIS « Closes » (l'issue reste
  ouverte jusqu'à la recette appareil).
- Push : git push -u origin <branche>, réessayé 4 fois (2, 4, 8, 16 s) sur erreur réseau seulement.

GITHUB
- gh s'il est authentifié, sinon ToolSearch « select:mcp__github__pull_request_read,mcp__github__create_pull_request,
  mcp__github__merge_pull_request,mcp__github__update_pull_request,mcp__github__actions_list,mcp__github__actions_get,
  mcp__github__actions_run_trigger,mcp__github__get_job_logs,mcp__github__issue_read,mcp__github__add_issue_comment ».
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
  verdict) et attendre sa notification. Les journaux ne se lisent que par mcp__github__get_job_logs ou gh run view --log-failed.
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
    rougeAvant: { type: 'string', description: 'preuve du rouge avant correctif (sortie locale ou raison : compilation impossible dans le cloud, le rouge sera montré par la CI au commit du témoin)' },
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
    verdict: { type: 'string', enum: ['fusionnable', 'bloquant'] },
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
const FUSION = {
  type: 'object',
  properties: {
    pr: { type: 'integer' },
    fusionne: { type: 'boolean' },
    sha: { type: 'string' },
    raison: { type: 'string' },
  },
  required: ['fusionne', 'raison'],
}
const BILAN = {
  type: 'object',
  properties: {
    devSha: { type: 'string' },
    ci: { type: 'array', items: { type: 'string' }, description: 'workflow : conclusion (URL)' },
    rougesDeNosLots: { type: 'array', items: { type: 'string' } },
  },
  required: ['devSha', 'ci', 'rougesDeNosLots'],
}

// ---------------------------------------------------------------------------
// ÉTAPES D'UN LOT
// ---------------------------------------------------------------------------
const titre = l => `#${l.n} ${l.cle}`

const developper = l => agent(`${SOCLE}
LOT ${titre(l)} — plateforme ${l.plateforme}.
1. Lis l'issue #${l.n} (corps ET commentaires) : son critère de fin fait foi. Notes du coordinateur :
${l.notes || '(aucune)'}
2. Cadre contre l'arbre VIVANT : git fetch origin ; vérifie chaque affirmation des notes dans origin/${BASE}
   (chemins, symboles, comportement). Si le travail est déjà fait sur ${BASE}, dis-le dans bloque et arrête.
   Si une branche vivante d'une autre session écrit déjà ces chemins (git log origin --since=2.hours -- <chemins>),
   cède : bloque = « cédé à <branche> ».
3. Branche ${l.branche ? `existante « ${l.branche} » : git checkout ${l.branche} && git merge origin/${BASE}` : `« claude/${l.cle} » depuis origin/${BASE}`}.
   Pousse dans les 15 minutes (le témoin rouge suffit).
4. TDD : témoin(s) de COMPORTEMENT rouge(s) d'abord, commit et push du rouge seul ; puis le minimum pour le vert ;
   puis refactorer si cela apporte. Règles du dépôt à tenir : fichier ≤ 1200 lignes (aucun ajout à un fichier
   hors budget : extraire d'abord), fonction ≤ 80 lignes, pas de any, immuabilité, une seule source de vérité,
   rétrocompatibilité serveur/clients, optimistic update + jamais de spinner sur cache non vide, accessibilité
   (TalkBack / VoiceOver / lecteur d'écran), chaînes localisées par le mécanisme de la plateforme.
5. Gates locaux de la plateforme (voir CI ci-dessus), commit, push.
6. Rédige les étapes de recette APPAREIL (S8 pour Android, iPhone/simulateur pour iOS, Chrome pour le web) :
   compte, conversation, réseau (ralenti, coupé), gestes, et ce qu'on doit VOIR. Ne les exécute pas.`,
  { label: `dev ${l.cle}`, phase: 'Développer', model: 'sonnet', effort: 'medium', schema: DEV })

const relire = (l, d) => agent(`${SOCLE}
REVUE-CORRECTION du lot ${titre(l)}, branche ${d.branche} (tête ${d.sha}).
Tu n'approuves pas : tu cherches ce qui casse. git fetch ; git diff origin/${BASE}...origin/${d.branche}.
- Le critère de fin de l'issue #${l.n} est-il atteint, cas par cas ? Les témoins testent-ils le COMPORTEMENT, et
  auraient-ils rougi sans le correctif (relis le commit du rouge) ?
- Défauts : concurrence, cycle de vie (fuite d'observateur, état qui survit ou meurt au mauvais moment), états
  manquants (hors ligne, échec, reprise, mort du processus), recomposition / redessin inutile, accessibilité,
  rétrocompatibilité, ce qui part À CÔTÉ de la valeur corrigée.
- Corrige toi-même sur la branche (témoin d'abord pour tout défaut de comportement), gates locaux, commit, push.
- sensible = vrai seulement si le lot touche crypto, auth, contrôle d'accès, migration de données ou protocole.`,
  { label: `revue ${l.cle}`, phase: 'Relire', model: 'opus', effort: 'high', schema: REVUE })

const auditer = (l, r, d) => agent(`Audit adversarial avant fusion du lot ${titre(l)} : branche ${d.branche} (tête ${r.sha}),
dépôt ${REPO}, diff contre origin/${BASE}. Cherche à casser : fuite de données, contournement, migration non
réversible, ancien client cassé. Rends « bloquant » avec constats reproductibles, ou « fusionnable ».`,
  { label: `audit ${l.cle}`, phase: 'Auditer', agentType: 'auditeur-adversarial', schema: AUDIT })

const prouver = (l, branche) => agent(`${SOCLE}
PREUVE du lot ${titre(l)}, branche ${branche}.
1. git fetch ; git checkout ${branche} ; git merge origin/${BASE} (conflit : résous-le en gardant les deux
   intentions, gates locaux, commit) ; push.
2. ${l.plateforme === 'android' ? 'workflow_dispatch android.yml sur la branche, au SHA poussé.'
    : l.plateforme === 'ios' ? 'workflow_dispatch ios.yml sur la branche, au SHA poussé.'
    : 'Gates LOCAUX complets de la plateforme (web : bun test complet depuis apps/web + tsc ; serveur : test:coverage complet + tsc). run = « local ».'}
3. Attends le verdict (surveillance en arrière-plan). Si rouge : extrais chaque échec (compilation fichier:ligne,
   témoin classe.méthode — message) sans rien corriger.`,
  { label: `preuve ${l.cle}`, phase: 'Prouver', model: 'sonnet', effort: 'low', schema: PREUVE })

const corriger = (l, branche, p, tour) => agent(`${SOCLE}
CORRECTION (tour ${tour}/${ESSAIS}) du lot ${titre(l)}, branche ${branche}, preuve rouge ${p.run} au SHA ${p.sha} :
${p.echecs.map(e => `- ${e}`).join('\n')}
Pour chaque échec : cause racine (pas de témoin affaibli, pas de @Ignore/skip, pas de seuil relâché). Un échec déjà
rouge sur origin/${BASE} sans lien avec le lot : ne le corrige pas, note-le dans echecs avec « préexistant ».
Gates locaux, commit, push. Rends vert = vrai seulement si tous les échecs du lot sont corrigés localement
(la preuve CI sera rejouée).`,
  { label: `correction ${l.cle} #${tour}`, phase: 'Corriger', model: 'sonnet', effort: 'medium', schema: PREUVE })

const fusionner = (l, branche, d, p) => agent(`${SOCLE}
FUSION du lot ${titre(l)}, branche ${branche}, prouvée verte : ${p.run} au SHA ${p.sha}.
1. git fetch : si origin/${BASE} a avancé depuis ${p.sha} sur des chemins de ${l.plateforme}, fusionne-le dans la
   branche, gates locaux, push (pas de nouvelle preuve CI si la fusion est sans conflit et hors des fichiers du lot ;
   sinon rends fusionne = faux, raison = « re-preuve »).
2. PR vers ${BASE} (réutilise celle de la branche si elle existe, sortie du brouillon) : titre = résultat attendu,
   gabarit du dépôt, « Refs #${l.n} », section Testing = témoins + preuve ; corps terminé par
   « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
3. Fusionne (merge commit) en exigeant le SHA de tête attendu. Ne supprime pas la branche.
4. Commentaire sur #${l.n} : ce qui est livré (PR, SHA de fusion, témoins, preuve), dimensions mûres et restantes,
   puis « Recette appareil à faire » avec ces étapes :
${d.recette.map(s => `   - ${s}`).join('\n')}
   L'issue reste OUVERTE (Status In Progress) : elle se ferme après la recette appareil.`,
  { label: `fusion ${l.cle}`, phase: 'Fusionner', model: 'sonnet', effort: 'low', schema: FUSION })

async function lot(l) {
  const d = await developper(l)
  if (!d || d.bloque) return { lot: titre(l), etat: 'bloqué', raison: d ? d.bloque : 'agent perdu' }
  const r = await relire(l, d)
  if (!r) return { lot: titre(l), etat: 'bloqué', raison: 'revue perdue' }
  if (r.sensible) {
    const a = await auditer(l, r, d)
    if (!a || a.verdict === 'bloquant') return { lot: titre(l), etat: 'bloqué', raison: `audit : ${a ? a.constats.join(' ; ') : 'perdu'}` }
  }
  let p = await prouver(l, d.branche)
  for (let tour = 1; p && !p.vert && tour <= ESSAIS; tour++) {
    const c = await corriger(l, d.branche, p, tour)
    if (!c) break
    p = await prouver(l, d.branche)
  }
  if (!p || !p.vert) return { lot: titre(l), etat: 'rouge', branche: d.branche, echecs: p ? p.echecs : [], recette: d.recette }
  let f = await fusionner(l, d.branche, d, p)
  if (f && !f.fusionne && /re-preuve/.test(f.raison)) {
    p = await prouver(l, d.branche)
    if (p && p.vert) f = await fusionner(l, d.branche, d, p)
  }
  return {
    lot: titre(l), etat: f && f.fusionne ? 'fusionné' : 'non fusionné', branche: d.branche,
    pr: f ? f.pr : undefined, raison: f ? f.raison : 'fusion perdue',
    reste: r.reste, recette: d.recette,
  }
}

// ---------------------------------------------------------------------------
// CHAÎNES — une par plateforme, en parallèle ; dans une chaîne, les lots passent en série
// (même zone de code, et une seule preuve CI lourde à la fois par plateforme)
// ---------------------------------------------------------------------------
const PLATEFORMES = [...new Set(LOTS.map(l => l.plateforme))]
log(`${LOTS.length} lots sur ${PLATEFORMES.join(', ')}${SAUTER.size ? ` — sautés : ${[...SAUTER].join(', ')}` : ''}`)

const resultats = {}
async function chaine(plateforme) {
  const sortie = []
  for (const l of LOTS.filter(x => x.plateforme === plateforme)) {
    const manquants = (l.apres || []).filter(k => LOTS.some(x => x.cle === k) && (!resultats[k] || resultats[k].etat !== 'fusionné'))
    if (manquants.length) {
      const r = { lot: titre(l), etat: 'non lancé', raison: `attend ${manquants.join(', ')}` }
      resultats[l.cle] = r
      sortie.push(r)
      continue
    }
    const r = await lot(l)
    resultats[l.cle] = r
    log(`${r.lot} : ${r.etat}`)
    sortie.push(r)
  }
  return sortie
}

const parChaine = (await parallel(PLATEFORMES.map(p => () => chaine(p)))).filter(Boolean).flat()

// ---------------------------------------------------------------------------
// BILAN — la CI de dev sur la tête finale fait foi
// ---------------------------------------------------------------------------
phase('Bilan')
const fusionnes = parChaine.filter(r => r.etat === 'fusionné')
const bilan = fusionnes.length ? await agent(`${SOCLE}
BILAN. Lots fusionnés dans ${BASE} : ${fusionnes.map(r => `${r.lot} (PR #${r.pr})`).join(', ')}.
1. git fetch ; tête de origin/${BASE}. Attends les runs du push sur cette tête (ci.yml, ios.yml, android.yml selon
   les chemins touchés) — surveillance en arrière-plan, au plus 90 minutes.
2. Pour chaque run rouge : l'échec vient-il d'un de nos lots ? Si oui, liste-le dans rougesDeNosLots (fichier:ligne
   ou témoin), sans corriger.
3. Si android.yml est vert sur cette tête : commente #16012 et #16013 avec la preuve (URL du run, SHA) ; ne les
   ferme que si leur fil montre déjà la recette S8 faite, sinon rappelle qu'elle reste à faire.`,
  { label: 'bilan dev', phase: 'Bilan', model: 'sonnet', effort: 'low', schema: BILAN }) : null

return {
  lots: parChaine,
  ciDev: bilan,
  recetteAppareil: parChaine
    .filter(r => r.recette && r.recette.length)
    .map(r => ({ lot: r.lot, etat: r.etat, etapes: r.recette })),
}
