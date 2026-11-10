export const meta = {
  name: 'meeshy-kit-bout-en-bout',
  description:
    "Le chantier « kit de la planche » de bout en bout et sans s'arrêter : tours du kit (pilote K00-K02 puis les 26 lots) jusqu'à ce qu'un tour ne livre plus rien, tours d'intégration, puis RAPPROCHEMENT — chaque branche du chantier reçoit ce qui a bougé sur dev sur ses fichiers, sans rien écraser ni perdre, est prouvée par la CI et fusionnée dans dev — et un tour de vérification final",
  whenToUse:
    "Lancer tout le chantier du kit (#17312) en automatique. Args : { attribution (OBLIGATOIRE : lignes Co-Authored-By et Claude-Session), date, pilote (['K00','K01','K02']), toursMax (10), seche (2 tours sans livraison avant de passer à l'étape suivante), integration (true), rapprocher (true), verifier (true), autonome (true : aucune question n'arrête le chantier, chaque choix est consigné), consignes ({ '*': …, 'K02': … } : change une décision prise, prime sur elle), base ('dev'), run ('/home/user/meeshy-kit-run') }.",
  phases: [
    { title: 'Pilote', detail: 'tours du kit sur K00, K01, K02 jusqu’à ce qu’un tour ne livre plus rien' },
    { title: 'Kit', detail: 'tours du kit sur les 26 lots, iOS puis Android et web' },
    { title: 'Intégration', detail: 'les écrans adoptent le kit, PR ouvertes' },
    { title: 'Inventaire', detail: 'branches claude/kit-* et PR ouvertes qui portent du travail absent de dev', model: 'sonnet' },
    { title: 'Rapprocher', detail: 'merge de dev dans chaque branche, conflits résolus sans rien perdre, gates, preuve CI', model: 'opus' },
    { title: 'Fusionner', detail: 'une branche à la fois : dev re-mergé s’il a bougé, fusion, contrôle que rien de dev n’est perdu', model: 'opus' },
    { title: 'Vérifier', detail: 'tour de vérification : divergences et couverture des 70 vues' },
    { title: 'Bilan', detail: 'compte rendu daté sur #17312', model: 'haiku' },
  ],
}

const A = args && typeof args === 'object' ? args : {}
const ATTR = typeof A.attribution === 'string' && /Claude-Session: \S+/.test(A.attribution) ? A.attribution.trim() : ''
if (!ATTR) {
  log('Arrêt : args.attribution est obligatoire.')
  return { arret: 'attribution manquante' }
}
const REPO = '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const RUN = typeof A.run === 'string' && A.run ? A.run.replace(/\/$/, '') : '/home/user/meeshy-kit-run'
const DATE = typeof A.date === 'string' && A.date ? A.date : '(lis la date avec date -I)'
const PILOTE = Array.isArray(A.pilote) && A.pilote.length ? A.pilote : ['K00', 'K01', 'K02']
const TOURS_MAX = Number.isInteger(A.toursMax) && A.toursMax > 0 ? A.toursMax : 10
const SECHE = Number.isInteger(A.seche) && A.seche > 0 ? A.seche : 2
const KIT = { scriptPath: `${REPO}/.claude/workflows/meeshy-kit-planche.js` }
const CONSIGNES = A.consignes && typeof A.consignes === 'object' ? A.consignes : {}
const commun = { attribution: ATTR, date: DATE, base: BASE, run: RUN, autonome: A.autonome !== false, consignes: CONSIGNES }

const PROGRES = ['fusionne', 'pr_en_attente_porteur']
const journal = []
const decisionsRapprochement = []

const tour = async (nom, extra) => {
  try {
    const r = await workflow(KIT, { ...commun, ...extra })
    journal.push({ nom, resultat: r })
    return r
  } catch (e) {
    log(`${nom} : le tour a échoué (${String(e)})`)
    journal.push({ nom, erreur: String(e) })
    return null
  }
}

const boucle = async (titre, extra, max) => {
  phase(titre)
  let seches = 0
  const vus = new Set()
  for (let n = 1; n <= max && seches < SECHE; n++) {
    const r = await tour(`${titre} ${n}`, extra)
    const lots = r && Array.isArray(r.lots) ? r.lots : []
    const livres = lots.filter((x) => PROGRES.includes(x.statut) && !vus.has(`${x.cle}:${x.plateforme}`))
    livres.forEach((x) => vus.add(`${x.cle}:${x.plateforme}`))
    const restants = lots.filter((x) => !PROGRES.includes(x.statut) && x.statut !== 'deja_tenu')
    log(`${titre} ${n} : ${livres.length} livré(s) ${livres.map((x) => `${x.cle}:${x.plateforme}`).join(' ')} ; ${restants.length} rouge(s) ou bloqué(s) ${restants.map((x) => `${x.cle}:${x.plateforme}=${x.statut}`).join(' ')}`)
    if (!r || r.arret) { seches = SECHE; break }
    seches = livres.length ? 0 : seches + 1
    if (!lots.length) break
  }
}

await boucle('Pilote', { etape: 'kit', seulement: PILOTE }, Math.min(TOURS_MAX, 6))
await boucle('Kit', { etape: 'kit' }, TOURS_MAX)
if (A.integration !== false) await boucle('Intégration', { etape: 'integration' }, Math.min(TOURS_MAX, 4))

const S = (properties, required) => ({ type: 'object', properties, required: required || Object.keys(properties) })
const TXT = { type: 'string' }
const LISTE = { type: 'array', items: TXT }
const INVENTAIRE = S({ branches: { type: 'array', items: S({ branche: TXT, pr: { type: 'integer' }, cle: TXT, plateforme: TXT, integration: { type: 'boolean' }, fichiers: { type: 'integer' } }, ['branche', 'cle', 'plateforme', 'integration']) } }, ['branches'])
const DECISIONS = { type: 'array', items: S({ question: TXT, choix: TXT, alternatives: LISTE, issue: { type: 'integer' } }, ['question', 'choix']) }
const RAPPROCHE = S({ statut: { type: 'string', enum: ['pret', 'rouge', 'bloque', 'rien'] }, pr: { type: 'integer' }, sha: TXT, commits_dev_absorbes: LISTE, conflits: LISTE, rouges: LISTE, resume: TXT, decisions: DECISIONS }, ['statut', 'resume'])
const FUSION = S({ statut: { type: 'string', enum: ['fusionne', 'rouge', 'bloque'] }, pr: { type: 'integer' }, sha_dev: TXT, perte_detectee: LISTE, resume: TXT }, ['statut', 'resume'])

const clone = (b) => `D=${RUN}/rapprocher/$(echo ${b} | tr '/' '_')
mkdir -p ${RUN}/rapprocher && rm -rf "$D" && git clone -q --shared --no-checkout ${REPO} "$D" && cd "$D" \\
  && git remote set-url origin https://github.com/${GH} && git fetch -q origin ${BASE} ${b} \\
  && git checkout -q -B ${b} origin/${b}
(jamais de worktree ; supprime $D à la fin.)`

const REGLES = `Règles qui ne se discutent pas :
- RIEN N'EST ÉCRASÉ NI PERDU. Tu intègres ${BASE} par « git merge origin/${BASE} » (jamais rebase, jamais push --force, jamais « -X ours/theirs », jamais « git checkout --ours/--theirs » sur un fichier entier).
  Chaque conflit se résout à la main, hunk par hunk, en gardant l'INTENTION des deux côtés : ce que ${BASE} a ajouté reste, ce que la branche ajoute reste.
- Avant de merger, liste les commits de ${BASE} arrivés depuis la base de la branche QUI TOUCHENT ses fichiers :
  MB=$(git merge-base HEAD origin/${BASE}); git log --oneline $MB..origin/${BASE} -- $(git diff --name-only $MB..HEAD).
  Lis chacun (git show). Après le merge, prouve pour CHACUN que son changement est toujours là (git diff <commit>^ <commit> comparé au fichier final) :
  un changement de ${BASE} absent du résultat est une PERTE, tu la répares avant de pousser.
- Un fichier renommé, déplacé ou supprimé sur ${BASE} : suis-le (git log --follow), reporte le travail de la branche à son nouvel emplacement.
- Gates locaux de la plateforme verts avant de pousser : web (cd apps/web && bun run type-check && bun test <tests touchés> && bun run gate),
  gateway/shared (tests touchés sous bun), iOS (bash apps/ios/scripts/check_cohesion_budget.sh, bash scripts/check-law-literals.sh, bash scripts/check-swift-viewbuilder.sh ;
  un .swift neuf exige un commit « [xcodegen] »), Android (apps/android/scripts/check-file-budget.sh, check-feature-edges.sh). iOS et Android ne compilent que par la CI.
- Jamais de test sauté, désactivé ou affaibli.
- MODE AUTONOME : un conflit dont la résolution demande un CHOIX (deux comportements incompatibles) se tranche en gardant les deux features si possible, sinon
  celle de ${BASE} (plus récente, déjà en recette) ; le choix va dans « decisions » et dans une issue labellisée « décision-produit » qui dit comment l'inverser.
${CONSIGNES['*'] ? `- CONSIGNES DU PORTEUR : ${CONSIGNES['*']}\n` : ''}- Commits terminés par :
${ATTR}
- PR vers ${BASE} (ouvre-la si elle manque) ; son corps finit par « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».`

if (A.rapprocher !== false) {
  phase('Inventaire')
  const inv = await agent(`Lecture seule. git -C ${REPO} fetch -q origin.
Liste les branches distantes « claude/kit-* » de ${GH} qui portent au moins un commit absent de origin/${BASE} (git rev-list --count origin/${BASE}..origin/<branche>),
et les PR OUVERTES vers ${BASE} dont la branche commence par « claude/kit- » (outils MCP GitHub, list_pull_requests). Pour chacune : branche, numéro de PR s'il y en a,
clé du lot (K.. en majuscules) et plateforme (ios, android, web) lues dans le nom, « integration » si le registre .claude/workflows/meeshy-kit-planche.lots.json
donne au lot le type « integration », et le nombre de fichiers différents de ${BASE}. Ordre de sortie : lots de kit avant intégrations, iOS avant Android avant web, clés croissantes.`,
    { label: 'inventaire', phase: 'Inventaire', schema: INVENTAIRE, model: 'sonnet', effort: 'medium' })
  const branches = inv && Array.isArray(inv.branches) ? inv.branches : []
  log(`Inventaire : ${branches.length} branche(s) à rapprocher — ${branches.map((b) => b.branche).join(', ')}`)

  const rapprocher = (b) => agent(`Tu RAPPROCHES la branche ${b.branche} (lot ${b.cle}, ${b.plateforme}${b.pr ? `, PR #${b.pr}` : ''}) de ${BASE}.
${clone(b.branche)}
${REGLES}
Étapes : relevé des commits de ${BASE} sur ses fichiers ; merge ; conflits ; contrôle de non-perte commit par commit ; gates ; push ; puis la preuve CI au SHA de tête
(${b.plateforme === 'ios' ? 'workflow_dispatch de ios.yml et sdk-tests.yml sur la branche' : b.plateforme === 'android' ? 'android.yml (workflow_dispatch sur la branche si la CI de PR ne tourne pas)' : 'ci.yml sur la PR'}) et son verdict.
Un rouge : trouve sa cause racine et corrige (trois tours au plus). Un rouge déjà présent sur le dernier run de ${BASE} est « hors lot » : vérifie-le, ne le suppose pas, et dis-le.
${b.integration ? `LOT D'INTÉGRATION : il change ce que l'utilisateur voit. Ses captures web se font ici (bun run build, bun run preview, Playwright — Chromium est installé —, chaque vue en clair et en sombre à 390, 820 et 1440 px), commitées sous docs/product/kit/captures/${b.cle}/web/ ; pour iOS et Android, joins à la PR les images d'instantanés produites par la CI.` : ''}
Rends « pret » (vert ou rouge hors lot prouvé), « rouge », « bloque » (avec la raison) ou « rien » (aucun commit hors ${BASE}).`,
    { label: `rapprocher:${b.cle}:${b.plateforme}`, phase: 'Rapprocher', schema: RAPPROCHE, model: 'opus', effort: 'high' })

  const prets = (await parallel(branches.map((b) => () => rapprocher(b).then((r) => ({ b, r }))))).filter(Boolean)
  prets.forEach(({ b, r }) => (r && Array.isArray(r.decisions) ? r.decisions : []).forEach((d) => decisionsRapprochement.push({ cle: b.cle, plateforme: b.plateforme, etape: 'rapprochement', ...d })))

  phase('Fusionner')
  const fusions = []
  for (const { b, r } of prets) {
    if (!r || r.statut !== 'pret') {
      fusions.push({ branche: b.branche, statut: r ? r.statut : 'bloque', resume: r ? r.resume : 'agent interrompu' })
      continue
    }
    const f = await agent(`Tu FUSIONNES dans ${BASE} la branche ${b.branche} (lot ${b.cle}, ${b.plateforme}, PR #${r.pr || b.pr || '?'}), rapprochée et prouvée au SHA ${r.sha || '?'}.
${clone(b.branche)}
${REGLES}
1. git fetch origin ${BASE} : si ${BASE} a bougé depuis le rapprochement (d'autres branches viennent d'y entrer), refais le relevé, le merge et le contrôle de non-perte
   sur les seuls nouveaux commits, rejoue les gates, pousse et attends la CI de la plateforme au nouveau SHA (verte, ou rouge hors lot prouvé).
2. Fusionne la PR (merge_pull_request, merge_method « merge », expectedHeadSha = le SHA de tête que tu viens de vérifier). Jamais de squash qui effacerait l'histoire du merge.
3. Après la fusion : sur origin/${BASE}, pour chaque commit de ${BASE} relevé au point 1 et au rapprochement, vérifie que son changement est toujours présent.
   Une perte va dans « perte_detectee » ET se répare aussitôt par une PR vers ${BASE}.
4. Commente l'issue du lot avec la preuve (PR, SHA, runs) ; ferme-la si le composant existe désormais sur iOS, Android et le web (ou si l'intégration est complète sur la plateforme).
Supprime le clone.`,
      { label: `fusionner:${b.cle}:${b.plateforme}`, phase: 'Fusionner', schema: FUSION, model: 'opus', effort: 'high' })
    fusions.push({ branche: b.branche, ...(f || { statut: 'bloque', resume: 'agent interrompu' }) })
    log(`${b.branche} : ${f ? f.statut : 'interrompu'}`)
  }
  journal.push({ nom: 'Rapprochement', fusions })
}

if (A.verifier !== false) {
  phase('Vérifier')
  await tour('Vérification', { etape: 'verifier' })
}

phase('Bilan')
const decisions = [
  ...journal.flatMap((j) => (j.resultat && Array.isArray(j.resultat.decisions) ? j.resultat.decisions.map((d) => ({ tour: j.nom, ...d })) : [])),
  ...decisionsRapprochement,
].map((d) => ({ ...d, changer: `relancer meeshy-kit-bout-en-bout avec args.consignes.${d.cle || '*'} = « <votre choix> »` }))
const resume = journal.map((j) => ({
  nom: j.nom,
  erreur: j.erreur,
  lots: j.resultat && Array.isArray(j.resultat.lots) ? j.resultat.lots.map((x) => ({ cle: x.cle, plateforme: x.plateforme, statut: x.statut, pr: x.pr })) : undefined,
  couverture: j.resultat && j.resultat.couverture ? { conformes: j.resultat.couverture.conformes, ecarts: (j.resultat.couverture.en_ecart || []).length } : undefined,
  fusions: j.fusions,
}))
await agent(`Poste UN commentaire daté (${DATE}) sur l'issue #17312 de ${GH} : compte rendu du passage de bout en bout (workflow meeshy-kit-bout-en-bout), en français,
phrases complètes : tours du pilote et du kit (ce qui a été livré, ce qui est rouge ou bloqué et pourquoi), intégrations (PR), rapprochement avec ${BASE}
(branches fusionnées, conflits résolus, pertes détectées et réparées), couverture finale des 70 vues, ce qui reste, puis une section « Décisions prises sans vous » : une ligne par décision (lot, question, choix retenu, alternatives,
issue décision-produit, et comment la changer : relancer avec args.consignes.<clé> = « … »). Le commentaire est un compte rendu daté ;
l'état fait foi dans les issues. Pied « Generated by Claude Code » obligatoire.
DONNÉES : ${JSON.stringify({ resume, decisions })}`,
  { label: 'bilan', phase: 'Bilan', model: 'haiku', effort: 'low' })

return { journal: resume, decisions }
