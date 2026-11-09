export const meta = {
  name: 'meeshy-kit-planche',
  description:
    "Le kit de composants de la planche « Composer, vue finale » : chaque composant de la planche devient UN composant réutilisable dans toute l'application, sur iOS d'abord (MeeshyUI/Kit) puis reproduit sur Android (:sdk-ui component/kit), et les écrans l'adoptent. Registre des lots, fiche de contrat par composant (fable), exécution (haiku ou sonnet selon le lot), relecture, divergences iOS ↔ Android ↔ planche et intégrations (opus), preuve par la CI, couverture des 64 vues",
  whenToUse:
    "Lancer ou reprendre le chantier du kit depuis n'importe quelle session. Args (objet ou chaîne JSON) : { attribution (OBLIGATOIRE : les lignes Co-Authored-By et Claude-Session de la session qui lance), date, etape ('kit' par défaut : socle + composants ; 'integration' : adoption par les écrans ; 'verifier' : aucune écriture, seulement divergences et couverture ; 'tout'), plateformes (['ios','android']), seulement [clés], sauter [clés], devPar (2), maxFix (3), run ('/home/user/meeshy-kit-run'), base ('dev') }.",
  phases: [
    { title: 'Préparer', detail: 'dev à jour, registre lu, état de chaque lot par plateforme (livré, en PR, à faire)', model: 'haiku' },
    { title: 'Spécifier', detail: 'la fiche de contrat du composant : API, états, gestes, accessibilité, jumeaux à absorber, sur les deux plateformes', model: 'fable' },
    { title: 'Issue', detail: "l'issue du lot, titre sémantique, fiche en corps, milestone du chantier", model: 'haiku' },
    { title: 'Développer iOS', detail: 'extraction du jumeau le plus complet vers MeeshyUI/Kit, TDD, instantané, entrée au catalogue (haiku ou sonnet selon le lot)' },
    { title: 'Reproduire Android', detail: 'le composant iOS fusionné et sa fiche reproduits dans :sdk-ui (haiku ou sonnet selon le lot)' },
    { title: 'Relire', detail: 'le diff confronté à la fiche et à la planche ; opus corrige lui-même', model: 'opus' },
    { title: 'Prouver', detail: 'merge de dev, CI concernées au SHA de tête, verdict et images des instantanés', model: 'sonnet' },
    { title: 'Corriger', detail: 'cause racine des rouges du lot et des conflits avec dev', model: 'opus' },
    { title: 'Livrer', detail: 'kit : fusion au vert, issue close avec preuve ; intégration : PR ouverte, arrêt pour captures simulateur et accord du porteur', model: 'sonnet' },
    { title: 'Diverger', detail: 'composant par composant : iOS contre Android contre fiche contre planche, et jumeaux restants', model: 'opus' },
    { title: 'Intégrer', detail: "un écran adopte le kit, ses jumeaux sont supprimés, conflits avec dev résolus", model: 'opus' },
    { title: 'Couvrir', detail: 'les 64 vues de la planche × les composants : chaque vue se compose du kit seul, cliquets relevés', model: 'opus' },
    { title: 'Bilan', detail: "commentaire daté sur l'issue du chantier", model: 'haiku' },
  ],
}

// ---------------------------------------------------------------------------
// PARAMÈTRES
// ---------------------------------------------------------------------------
const lireArgs = (brut) => {
  if (brut && typeof brut === 'object') return brut
  if (typeof brut === 'string' && brut.trim().startsWith('{')) {
    try { return JSON.parse(brut) } catch (e) { return {} }
  }
  return {}
}
const A = lireArgs(args)
const REPO = '/home/user/meeshy'
const GH = 'isopen-io/meeshy'
const RUN = typeof A.run === 'string' && A.run ? A.run.replace(/\/$/, '') : '/home/user/meeshy-kit-run'
const BASE = typeof A.base === 'string' && A.base ? A.base : 'dev'
const DATE = typeof A.date === 'string' && A.date ? A.date : '(lis la date avec date -I)'
const ATTR = typeof A.attribution === 'string' && /Claude-Session: \S+/.test(A.attribution) ? A.attribution.trim() : ''
const ETAPE = ['kit', 'integration', 'verifier', 'tout'].includes(A.etape) ? A.etape : 'kit'
const PLATEFORMES = Array.isArray(A.plateformes) && A.plateformes.length ? A.plateformes.filter((p) => p === 'ios' || p === 'android') : ['ios', 'android']
const DEV_PAR = Number.isInteger(A.devPar) && A.devPar > 0 ? Math.min(A.devPar, 3) : 2
const MAX_FIX = Number.isInteger(A.maxFix) && A.maxFix > 0 ? A.maxFix : 3
const SAUTER = new Set(Array.isArray(A.sauter) ? A.sauter : [])
const SEULEMENT = Array.isArray(A.seulement) && A.seulement.length ? new Set(A.seulement) : null
const REGISTRE = '.claude/workflows/meeshy-kit-planche.lots.json'
const PLANCHE = 'docs/product/composer-vue-finale/planche.html'
const LOIS = 'docs/product/composer-vue-finale.md'
const FICHES = 'docs/product/kit'
const MODELE = { mecanique: 'haiku', reflexion: 'fable', prouver: 'sonnet', livrer: 'sonnet', relire: 'opus', corriger: 'opus', diverger: 'opus', integrer: 'opus' }
const branche = (cle, plateforme) => `claude/kit-${cle.toLowerCase()}-${plateforme}`

if (!ATTR) {
  log("Arrêt : args.attribution est obligatoire (les lignes Co-Authored-By et Claude-Session de la session qui lance).")
  return { arret: 'attribution manquante' }
}

// ---------------------------------------------------------------------------
// SOCLE COMMUN DES CONSIGNES
// ---------------------------------------------------------------------------
const clone = (cle, plateforme) => `D=${RUN}/lots/${cle}-${plateforme}
mkdir -p ${RUN}/lots && rm -rf "$D" && git clone -q --shared --no-checkout ${REPO} "$D" && cd "$D" \\
  && git remote set-url origin https://github.com/${GH} && git fetch -q origin ${BASE} \\
  && { git fetch -q origin ${branche(cle, plateforme)} && git checkout -q -B ${branche(cle, plateforme)} origin/${branche(cle, plateforme)} \\
       || git checkout -q -B ${branche(cle, plateforme)} origin/${BASE}; }
(jamais de worktree : la limite de 4 est tenue par un hook ; un clone partagé ne compte pas. Supprime $D quand le lot est fusionné.)`

const GATES = {
  ios: `GATES iOS — ni Xcode ni swift dans ce conteneur : la seule compilation est la CI (ios.yml, sdk-tests.yml), lancée par
workflow_dispatch sur la branche (la CI de PR iOS est gelée). Un .swift neuf demande un commit de tête dont le message porte
« [xcodegen] » (le robot régénère alors le projet ; ne pousse rien pendant qu'il travaille). Un runner macOS qui ne démarre pas
(« job was not acquired ») se relance, ce n'est pas un rouge du lot.
Gardes qui tournent sous Linux, vertes avant de pousser : bash apps/ios/scripts/check_cohesion_budget.sh ;
bash scripts/check-law-literals.sh ; bash scripts/check-swift-viewbuilder.sh ; node scripts/check-accent-color-hardcoding.mjs.
Un .xcstrings touché ⇒ ./apps/android/meeshy.sh i18n puis python3 apps/android/scripts/i18n/xcstrings_to_android.py --check.
Garde de compilation : chaque type et membre référencé existe (grep sur origin/${BASE}) ; MeeshySDK ne voit ni MeeshyUI ni l'app ;
un type du kit est public avec un init public ; @MainActor / Sendable justes ; fonction ≤ 80 lignes ; aucune couleur en dur.`,
  android: `GATES ANDROID — conteneur sans SDK Android : le seul compilateur complet est la CI android.yml (assembleDebug +
testDebugUnitTest), prouvée sur la PR. Versions réelles dans apps/android/gradle/libs.versions.toml : aucune API de mémoire.
Chaînes GÉNÉRÉES depuis les catalogues iOS (./apps/android/meeshy.sh i18n). Gardes : apps/android/scripts/check-file-budget.sh,
check-feature-edges.sh ; tests de parité de :sdk-ui (NoLocalHexColorGuardTest, MeeshyTokenParityTest).
Garde de compilation : explicitApi (visibilité explicite), when exhaustif, chaque R.string existe, imports vérifiés par grep.`,
}

const fiche = (l) => `${FICHES}/${l.cle}-${l.nom || 'integration'}.md`

const socle = (l, plateforme) => `
CHANTIER « kit de la planche » (${GH}) — date : ${DATE}. Lot ${l.cle} sur ${plateforme}.
Le registre ${REGISTRE} fait foi pour le périmètre (lis l'entrée « ${l.cle} » et la section « regles ») ; la planche ${PLANCHE}
et ses lois ${LOIS} font foi pour le dessin ; l'ISSUE du lot fait foi pour l'état.
Titre du lot : ${l.titre}
Contrat : ${l.contrat}
Vues de la planche : ${(l.vues || []).join(' ') || '(transverse)'} — captures de référence : docs/product/composer-vue-finale/vues/<vue>.png
Règles qui ne se discutent pas :
- composant AGNOSTIQUE (paramètres opaques, aucun type du composer ni des appels, aucun singleton nommé Meeshy) ; l'orchestration reste côté app ;
- EXTRAIRE avant de créer : le jumeau le plus complet devient le composant ; ne supprime un jumeau que si ton lot est une intégration ;
- le verre passe par K01 et par lui seul : Liquid Glass du système sur iOS 26+ (interactif sur ce qui se touche, verres voisins fondus dans un
  conteneur), verre dessiné avec réponse au toucher dessinée sous iOS 26 et sur Android ; Liquid Glass l'emporte toujours quand il existe ;
- pas de légende sous un bouton rond (le nom vit dans l'accessibilité), aucune couleur ni rayon en dur, cible tactile 44 pt / 48 dp ;
- TDD : témoin rouge d'abord ; un composant livré a sa fiche, son témoin de comportement, son instantané (clair, sombre, grande police, RTL)
  et son entrée au catalogue ;
- branche ${branche(l.cle, plateforme)}, poussée dans les quinze minutes avec le squelette ; si une autre branche vivante écrit déjà
  tes fichiers, tu cèdes et tu le dis (statut « cede ») ;
- commits terminés par :
${ATTR}
- PR vers ${BASE} : les deux premières lignes du corps sont le bloc d'attribution du projet s'il t'est fourni par la session,
  et le corps finit par la ligne « 🤖 Generated with [Claude Code](https://claude.com/claude-code) ».
Clone de travail :
${clone(l.cle, plateforme)}
${GATES[plateforme]}
`

// ---------------------------------------------------------------------------
// SCHÉMAS
// ---------------------------------------------------------------------------
const S = (properties, required) => ({ type: 'object', properties, required: required || Object.keys(properties) })
const TXT = { type: 'string' }
const LISTE = { type: 'array', items: TXT }
const ETAT = S({
  chantier: { type: 'integer' }, milestone: { type: 'integer' },
  lots: { type: 'array', items: S({
    cle: TXT, type: TXT, nom: TXT, titre: TXT, contrat: TXT, vues: LISTE, depend: LISTE,
    modele_ios: TXT, modele_android: TXT, issue: { type: 'integer' },
    ios: { type: 'string', enum: ['livre', 'pr', 'a_faire', 'sans_objet'] },
    android: { type: 'string', enum: ['livre', 'pr', 'a_faire', 'sans_objet'] },
    fiche: { type: 'boolean' },
  }, ['cle', 'type', 'titre', 'contrat', 'depend', 'modele_ios', 'modele_android', 'ios', 'android', 'fiche']) },
  rouge_prealable: TXT,
}, ['lots'])
const FICHE = S({ fiche_markdown: TXT, nom_ios: TXT, nom_android: TXT, jumeaux_ios: LISTE, jumeaux_android: LISTE, questions_porteur: LISTE, modele_conseille: { type: 'string', enum: ['haiku', 'sonnet', 'opus'] } },
  ['fiche_markdown', 'nom_ios', 'nom_android', 'jumeaux_ios', 'jumeaux_android', 'questions_porteur', 'modele_conseille'])
const ISSUE = S({ issue: { type: 'integer' } })
const FAIT = S({ statut: { type: 'string', enum: ['pousse', 'cede', 'bloque', 'deja_tenu'] }, sha: TXT, fichiers: LISTE, suites: LISTE, resume: TXT, escalade: TXT }, ['statut', 'resume'])
const REVUE = S({ conforme: { type: 'boolean' }, ecarts_corriges: LISTE, ecarts_restants: LISTE, sha: TXT }, ['conforme', 'ecarts_corriges', 'ecarts_restants'])
const PREUVE = S({ vert: { type: 'boolean' }, pr: { type: 'integer' }, sha: TXT, rouges: LISTE, cause_hors_lot: { type: 'boolean' }, images: LISTE }, ['vert', 'rouges'])
const LIVRAISON = S({ statut: { type: 'string', enum: ['fusionne', 'pr_en_attente_porteur', 'bloque'] }, pr: { type: 'integer' }, resume: TXT }, ['statut', 'resume'])
const DIVERGENCE = S({ cle: TXT, verdict: { type: 'string', enum: ['iso', 'ecarts', 'incomplet'] }, ecarts: { type: 'array', items: S({ quoi: TXT, plateforme: TXT, gravite: { type: 'string', enum: ['bloquant', 'a_corriger', 'assume'] }, issue: { type: 'integer' } }, ['quoi', 'plateforme', 'gravite']) }, jumeaux_restants: LISTE },
  ['cle', 'verdict', 'ecarts', 'jumeaux_restants'])
const COUVERTURE = S({ vues_conformes: LISTE, vues_en_ecart: { type: 'array', items: S({ vue: TXT, plateforme: TXT, ecart: TXT, issue: { type: 'integer' } }, ['vue', 'plateforme', 'ecart']) }, cliquets: TXT, issues_ouvertes: { type: 'array', items: { type: 'integer' } } },
  ['vues_conformes', 'vues_en_ecart', 'cliquets'])

// ---------------------------------------------------------------------------
// ÉTAPES D'UN LOT
// ---------------------------------------------------------------------------
const modeleDe = (l, plateforme) => {
  const m = plateforme === 'ios' ? l.modele_ios : l.modele_android
  return ['haiku', 'sonnet', 'opus'].includes(m) ? m : 'sonnet'
}

const specifier = (l) => agent(`
Tu écris la FICHE DE CONTRAT du composant ${l.cle} (${l.nom}) du kit de la planche. Lecture seule : tu ne modifies aucun fichier.
Lis l'entrée « ${l.cle} » de ${REPO}/${REGISTRE} (existant relevé sur les deux plateformes, à REVÉRIFIER sur origin/${BASE} : git -C ${REPO} fetch -q origin ${BASE}),
la planche ${PLANCHE} (la fonction JS qui dessine ce composant et CHAQUE vue qui l'emploie : ${(l.vues || []).join(' ')}), les lois ${LOIS},
puis le code des jumeaux existants sur iOS et sur Android.
La fiche, en français, tient en une page et fixe, pour les DEUX plateformes à la fois :
1. Rôle en une phrase, et ce que le composant ne fait PAS (ce qui reste à l'app).
2. API : nom iOS (Swift, MeeshyUI/Kit) et nom Android (Compose, me.meeshy.ui.component.kit), paramètres avec types opaques et défauts, emplacements (slots).
3. États, un par ligne, avec la vue de la planche qui le montre ; ce qui ne s'affiche pas quand (loi 13).
4. Gestes et retours (haptique par le site unique, animation, « réduire les animations »).
5. Accessibilité : nom, rôle, valeur, ordre de lecture, Dynamic Type / fontScale, RTL, contraste sur verre clair et sombre.
6. Jetons de design employés (aucune valeur en dur) et mesures tirées de la planche.
7. Jumeaux à absorber : pour chaque plateforme, lequel devient le composant, lesquels seront supprimés et par quel lot d'intégration.
8. Témoins exigés : comportements à tester, instantanés à produire, entrée au catalogue.
9. Écarts connus entre la planche et le code, et les questions qui reviennent au porteur (jamais tranchées par toi).
Conseille aussi le modèle d'exécution : haiku si la fiche ne laisse AUCUNE décision à prendre et qu'aucun jumeau n'est à arbitrer,
sonnet s'il reste de l'état, un geste ou une fusion de jumeaux, opus seulement si le composant touche une loi partagée.`,
  { label: `specifier:${l.cle}`, phase: 'Spécifier', schema: FICHE, model: MODELE.reflexion, effort: 'high' })

const ouvrirIssue = (l, f, etat) => agent(`
Ouvre (ou retrouve : cherche d'abord par titre) l'issue du lot ${l.cle} dans ${GH}. Titre EXACT : « ${l.titre} ».
Corps : Contexte (chantier #${etat.chantier || '?'}, lot ${l.cle}, vues ${(l.vues || []).join(' ') || 'transverses'}) · la fiche ci-dessous telle quelle ·
Preuve (CI verte, instantanés, entrée au catalogue) · Critère de fin (le contrat du registre) · Source (${REGISTRE}, ${PLANCHE}, ${LOIS}) ·
Dimensions visées : 6, 11, 13, plus 5 (accessibilité). ${etat.milestone ? `Milestone numéro ${etat.milestone}.` : "Milestone : celui du chantier, lis-le sur l'issue du chantier."}
Termine le corps par le pied « Generated by Claude Code » exigé pour tout post GitHub. Rends le numéro.
FICHE :
${f ? f.fiche_markdown : l.contrat}
${f && f.questions_porteur.length ? `Questions au porteur à lister dans une section « À trancher » : ${f.questions_porteur.join(' | ')}` : ''}`,
  { label: `issue:${l.cle}`, phase: 'Issue', schema: ISSUE, model: MODELE.mecanique, effort: 'low' })

const developper = (l, plateforme, f, issue, etat) => {
  const android = plateforme === 'android'
  return agent(`${socle(l, plateforme)}
Issue du lot : #${issue}. ${android ? `Ton commit de livraison porte « Closes #${issue} » : Android est la dernière plateforme du lot.` : `Tes commits portent « Refs #${issue} » : l'issue ne se ferme qu'avec la reproduction Android.`}
FICHE DE CONTRAT (elle fixe l'API, les états, l'accessibilité ; tu ne la réinterprètes pas) :
${f ? f.fiche_markdown : '(lis-la dans ' + fiche(l) + ' sur origin/' + BASE + ')'}
${android
    ? `Tu REPRODUIS sur Android le composant iOS déjà fusionné (${l.cible_ios || 'MeeshyUI/Kit'}) : lis-le, lis ses témoins, et rends les mêmes
états, les mêmes noms d'accessibilité, les mêmes gestes, en Compose, dans ${l.cible_android || 'apps/android/sdk-ui/.../component/kit/'}.
La transposition Material ne s'applique que là où la plateforme l'impose (retour système). Jumeau Android à promouvoir : ${f ? f.jumeaux_android.join(', ') : 'voir le registre'}.`
    : `Tu livres le composant iOS dans ${l.cible_ios || 'packages/MeeshySDK/Sources/MeeshyUI/Kit/'} en EXTRAYANT le jumeau désigné par la fiche
(${f ? f.jumeaux_ios.join(', ') : 'voir le registre'}) : le type existant devient un alias ou un appelant mince du composant du kit pour que rien ne change
à l'écran dans ce lot. Tu commits aussi la fiche dans ${fiche(l)}.`}
Ordre : squelette + témoin rouge poussés ; composant ; instantanés ; entrée au catalogue ; gardes locales ; PR ouverte vers ${BASE}.
Ce lot ne change AUCUN écran : s'il te faut modifier un écran pour le faire passer, arrête-toi et rends « bloque » avec la raison.
Si la fiche laisse une décision que tu ne peux pas prendre sans réfléchir au produit, rends « bloque » avec « escalade » rempli :
le lot repartira sur un modèle plus fort, ce n'est pas un échec.`,
    { label: `${android ? 'android' : 'ios'}:${l.cle}`, phase: android ? 'Reproduire Android' : 'Développer iOS', schema: FAIT,
      model: etat.escalade ? 'sonnet' : modeleDe(l, plateforme), effort: modeleDe(l, plateforme) === 'haiku' ? 'medium' : 'high' })
}

const integrer = (l, plateforme, issue) => agent(`${socle(l, plateforme)}
Issue du lot : #${issue}. LOT D'INTÉGRATION : les écrans des vues ${(l.vues || []).join(' ') || '(voir le contrat)'} adoptent les composants
${(l.consomme || []).join(', ')} du kit, déjà fusionnés sur ${BASE}.
1. Relève chaque site qui dessine encore à la main ce qu'un composant du kit fournit (grep des jumeaux listés dans les fiches ${FICHES}/).
2. Remplace site par site ; supprime chaque jumeau qui n'a plus d'appelant ; réécris les gardes et témoins qui citaient le jumeau.
3. Chaque vue du lot est comparée à sa capture de référence : disposition, hiérarchie, états, gestes. Un écart que tu ne peux pas
   fermer devient une issue (même milestone), jamais une ligne dans un fichier.
4. Conflits avec ${BASE} : merge de origin/${BASE} avant de pousser, résolus par la cause, jamais en écrasant le travail d'une autre session.
5. Fais descendre le cliquet de la garde du kit (nombre de boutons de verre dessinés à la main) et note l'avant / après.
Ce lot CHANGE ce que l'utilisateur voit : ouvre la PR, liste dans son corps les écrans à capturer au simulateur (clair, sombre, iPhone, iPad
si la vue en a), et NE FUSIONNE PAS. Rends la liste des écrans dans « resume ».`,
  { label: `integrer:${l.cle}:${plateforme}`, phase: 'Intégrer', schema: FAIT, model: MODELE.integrer, effort: 'high' })

const relire = (l, plateforme, f) => agent(`${socle(l, plateforme)}
Tu RELIS le lot poussé sur ${branche(l.cle, plateforme)} (git diff origin/${BASE}...HEAD après merge de origin/${BASE}) et tu CORRIGES toi-même.
Confronte, point par point : la fiche (${fiche(l)}${f ? ', reprise ci-dessous' : ''}), la fonction de la planche et les captures des vues, les règles du registre.
Cherche d'abord ce qui n'est pas là : un état de la fiche sans témoin, un nom d'accessibilité absent, un jumeau recopié au lieu d'être
absorbé, un type du composer ou des appels entré dans le kit, un verre dessiné hors de K01 ou sans réponse au toucher, un verre posé sur du verre, une couleur en dur, une légende sous un bouton, un écran modifié par un lot de kit.
${plateforme === 'android' ? "Compare aussi au composant iOS fusionné : tout écart d'état, de nom ou de geste est un écart, sauf imposé par la plateforme (dis lequel)." : ''}
Pousse tes corrections ; ce que tu ne peux pas fermer va dans « ecarts_restants » avec la raison.
${f ? 'FICHE :\n' + f.fiche_markdown : ''}`,
  { label: `relire:${l.cle}:${plateforme}`, phase: 'Relire', schema: REVUE, model: MODELE.relire, effort: 'high' })

const prouver = (l, plateforme, tour) => agent(`${socle(l, plateforme)}
Tu PROUVES la branche ${branche(l.cle, plateforme)} (tour ${tour}). Merge origin/${BASE} si elle a du retard, pousse, puis lance les CI concernées
au SHA de tête (${plateforme === 'ios' ? 'workflow_dispatch de ios.yml et sdk-tests.yml sur la branche' : 'android.yml sur la PR'}) et attends leur verdict.
Rends : vert ou non, la PR, le SHA, chaque rouge avec son job et sa première erreur utile, si la cause est hors du lot (un rouge déjà
présent sur ${BASE} : vérifie-le sur le dernier run de ${BASE}, ne le suppose pas), et les images d'instantanés produites par la CI.
Tu ne corriges rien et tu ne désactives aucun test.`,
  { label: `prouver:${l.cle}:${plateforme}:${tour}`, phase: 'Prouver', schema: PREUVE, model: MODELE.prouver, effort: 'medium' })

const corriger = (l, plateforme, p, tour) => agent(`${socle(l, plateforme)}
La preuve de ${branche(l.cle, plateforme)} est ROUGE (tour ${tour}). Rouges : ${p.rouges.join(' || ')}.
Trouve la cause racine de chacun, corrige dans le périmètre du lot, rejoue les gardes locales, pousse. Jamais de test sauté ni affaibli.`,
  { label: `corriger:${l.cle}:${plateforme}:${tour}`, phase: 'Corriger', schema: FAIT, model: MODELE.corriger, effort: 'high' })

const livrer = (l, plateforme, p, issue, integration) => agent(`${socle(l, plateforme)}
La branche ${branche(l.cle, plateforme)} est prouvée verte (PR #${p.pr || '?'}, SHA ${p.sha || '?'}). Issue #${issue}.
${integration
    ? `LOT D'INTÉGRATION : ne fusionne pas. Vérifie que le corps de la PR liste les écrans à capturer et joint les images de la CI, commente
l'issue (ce qui est mûr, ce qui reste, dimensions), et rends « pr_en_attente_porteur ».`
    : `LOT DE KIT (aucun écran changé) : vérifie que ${BASE} n'a pas bougé sous la preuve (sinon rends « bloque »), fusionne la PR, commente l'issue
avec la preuve (commit, runs, instantanés) et les dimensions mûres ou restantes ; une dimension non mûre devient une issue. Supprime le clone.`}`,
  { label: `livrer:${l.cle}:${plateforme}`, phase: 'Livrer', schema: LIVRAISON, model: MODELE.livrer, effort: 'medium' })

const issues = {}
const menerLot = async (l, plateforme, etat) => {
  const integration = l.type === 'integration'
  // La fiche s'écrit UNE fois (fable), avant iOS ; Android la relit depuis le dépôt, où le lot iOS l'a commitée.
  const f = integration || l.fiche || plateforme === 'android' ? null : await specifier(l)
  const issue = issues[l.cle] || l.issue || ((await ouvrirIssue(l, f, etat)) || {}).issue
  if (!issue) return { cle: l.cle, plateforme, statut: 'bloque', resume: "pas d'issue" }
  issues[l.cle] = issue
  let fait = integration ? await integrer(l, plateforme, issue) : await developper(l, plateforme, f, issue, {})
  if (fait && fait.statut === 'bloque' && fait.escalade && !integration && modeleDe(l, plateforme) === 'haiku') {
    log(`${l.cle} ${plateforme} : haiku rend la main (${fait.escalade}) — le lot repart sur sonnet`)
    fait = await developper(l, plateforme, f, issue, { escalade: true })
  }
  if (!fait || fait.statut !== 'pousse') return { cle: l.cle, plateforme, issue, statut: fait ? fait.statut : 'bloque', resume: fait ? fait.resume : 'agent interrompu' }
  const revue = await relire(l, plateforme, f)
  let preuve = null
  for (let tour = 1; tour <= MAX_FIX; tour++) {
    preuve = await prouver(l, plateforme, tour)
    if (!preuve || preuve.vert || preuve.cause_hors_lot) break
    if (tour < MAX_FIX) await corriger(l, plateforme, preuve, tour)
  }
  if (!preuve || !(preuve.vert || preuve.cause_hors_lot)) {
    return { cle: l.cle, plateforme, issue, statut: 'rouge', resume: preuve ? preuve.rouges.join(' | ') : 'preuve interrompue', ecarts: revue ? revue.ecarts_restants : [] }
  }
  const livraison = await livrer(l, plateforme, preuve, issue, integration)
  return { cle: l.cle, plateforme, issue, pr: livraison ? livraison.pr : preuve.pr, statut: livraison ? livraison.statut : 'bloque', ecarts: revue ? revue.ecarts_restants : [] }
}

// ---------------------------------------------------------------------------
// DÉROULÉ
// ---------------------------------------------------------------------------
phase('Préparer')
const etat = await agent(`
Prépare le chantier du kit. mkdir -p ${RUN}/lots ; git -C ${REPO} fetch -q origin ${BASE}.
Lis ${REPO}/${REGISTRE} sur origin/${BASE} (git show origin/${BASE}:${REGISTRE}) et rends CHAQUE lot (cle, type, nom, titre, contrat, vues, depend,
modele_ios, modele_android) avec, constaté et non supposé :
- ios / android : « livre » si le fichier cible existe sur origin/${BASE} (cible_ios, cible_android ; pour une intégration : son issue est fermée),
  « pr » si une PR ouverte part de la branche claude/kit-<clé en minuscules>-<plateforme>, « a_faire » sinon, « sans_objet » si le lot ne vise pas la plateforme ;
- fiche : vrai si ${FICHES}/<clé>-<nom>.md existe sur origin/${BASE} ;
- issue : le numéro de l'issue ouverte ou fermée dont le titre est exactement celui du lot, si elle existe.
Rends aussi chantier et milestone (champs du registre), et « rouge_prealable » : les jobs rouges du dernier run de ios.yml et android.yml sur ${BASE}, en une ligne.`,
  { label: 'préparer', phase: 'Préparer', schema: ETAT, model: MODELE.mecanique, effort: 'low' })
if (!etat || !etat.lots.length) return { arret: 'registre illisible' }

const retenu = (l) => !SAUTER.has(l.cle) && (!SEULEMENT || SEULEMENT.has(l.cle))
const estKit = (l) => l.type === 'kit' || l.type === 'socle'
const lots = etat.lots.filter(retenu)
const livre = { ios: new Set(etat.lots.filter((l) => l.ios === 'livre').map((l) => l.cle)), android: new Set(etat.lots.filter((l) => l.android === 'livre').map((l) => l.cle)) }
const tente = new Set()
const resultats = []
const cle2 = (l, p) => `${l.cle}:${p}`

const pret = (l, p) => {
  if (tente.has(cle2(l, p)) || l[p] === 'livre' || l[p] === 'sans_objet') return false
  if (ETAPE === 'kit' && !estKit(l)) return false
  if (ETAPE === 'integration' && estKit(l)) return false
  if (!(l.depend || []).every((d) => livre[p].has(d))) return false
  // iOS d'abord : Android reproduit le composant iOS FUSIONNÉ.
  return p === 'ios' || !estKit(l) || livre.ios.has(l.cle)
}

if (ETAPE !== 'verifier') {
  let vague = 0
  while (vague < 12) {
    const file = PLATEFORMES.flatMap((p) => lots.filter((l) => pret(l, p)).map((l) => ({ l, p })))
    if (!file.length) break
    vague++
    log(`Vague ${vague} : ${file.map((x) => cle2(x.l, x.p)).join(', ')}`)
    for (let i = 0; i < file.length; i += DEV_PAR) {
      const tranche = file.slice(i, i + DEV_PAR)
      tranche.forEach((x) => tente.add(cle2(x.l, x.p)))
      const rendus = (await parallel(tranche.map((x) => () => menerLot(x.l, x.p, etat)))).filter(Boolean)
      rendus.forEach((r) => {
        resultats.push(r)
        if (r.statut === 'fusionne') livre[r.plateforme].add(r.cle)
      })
    }
  }
  const restes = lots.filter((l) => PLATEFORMES.some((p) => !tente.has(cle2(l, p)) && l[p] !== 'livre' && l[p] !== 'sans_objet'))
  if (restes.length) log(`Non lancés (dépendance non livrée ou hors de l'étape « ${ETAPE} ») : ${restes.map((l) => l.cle).join(', ')}`)
}

phase('Diverger')
const aComparer = lots.filter((l) => estKit(l) && livre.ios.has(l.cle) && (livre.android.has(l.cle) || !PLATEFORMES.includes('android')))
const divergences = (await parallel(aComparer.map((l) => () => agent(`
Lecture seule sur origin/${BASE} de ${REPO}, sauf les issues que tu ouvres. Composant ${l.cle} (${l.nom || l.titre}).
Confronte QUATRE sources : la fiche ${fiche(l)}, la planche ${PLANCHE} (vues ${(l.vues || []).join(' ')}), le composant iOS, le composant Android.
Pour chaque état, paramètre, geste, nom d'accessibilité et mesure de la fiche : présent et identique des deux côtés ?
Puis cherche les JUMEAUX RESTANTS : un type qui refait le travail du composant hors du kit (grep des noms listés dans la fiche et des
motifs du composant, sur apps/ios, packages/MeeshySDK, apps/android). Un jumeau encore appelé est attendu tant que son lot d'intégration
n'est pas livré : dis lequel le supprimera.
Chaque écart « bloquant » ou « a_corriger » devient une issue (titre sémantique, milestone du chantier, pied Claude Code), sauf si elle existe déjà ;
« assume » exige la raison (imposé par la plateforme).`,
  { label: `diverger:${l.cle}`, phase: 'Diverger', schema: DIVERGENCE, model: MODELE.diverger, effort: 'high' })))).filter(Boolean)

phase('Couvrir')
const couverture = await agent(`
Lecture seule sur origin/${BASE} de ${REPO}, sauf les issues que tu ouvres. Matrice de couverture de la planche ${PLANCHE} : ses 64 vues
(R1–R13, A1–A18, O1–O11, S1–S10, P1–P6, I1–I4, C1–C2) × iOS et Android.
Pour chaque vue : l'écran qui la réalise existe-t-il, se compose-t-il des composants du kit SEULS (${FICHES}/), et respecte-t-il les lois citées
par la vue dans ${LOIS} (disposition, hiérarchie, états, gestes) ? Appuie-toi sur le code, les témoins et les instantanés, pas sur les titres d'issues.
Une vue en écart sans issue ouverte en reçoit une (même milestone). Relève les cliquets de la garde du kit sur chaque plateforme
(sites qui dessinent encore un bouton de verre à la main) et leur valeur au registre.
Divergences déjà relevées composant par composant, à ne pas rouvrir : ${JSON.stringify(divergences.map((d) => ({ cle: d.cle, verdict: d.verdict, n: d.ecarts.length })))}`,
  { label: 'couvrir', phase: 'Couvrir', schema: COUVERTURE, model: MODELE.diverger, effort: 'high' })

phase('Bilan')
const bilan = {
  etape: ETAPE,
  lots: resultats,
  divergences: divergences.filter((d) => d.verdict !== 'iso'),
  couverture: couverture ? { conformes: couverture.vues_conformes.length, en_ecart: couverture.vues_en_ecart, cliquets: couverture.cliquets } : null,
  en_attente_porteur: resultats.filter((r) => r.statut === 'pr_en_attente_porteur').map((r) => ({ cle: r.cle, plateforme: r.plateforme, pr: r.pr })),
  rouge_prealable: etat.rouge_prealable || '',
}
await agent(`
Poste UN commentaire daté (${DATE}) sur l'issue du chantier #${etat.chantier || '(lis le champ chantier de ' + REGISTRE + ')'} de ${GH} : compte rendu de ce tour du workflow
meeshy-kit-planche, en français, phrases complètes. Sections : lots livrés (PR), lots en attente de captures et d'accord du porteur, lots rouges ou
bloqués avec la raison, divergences iOS ↔ Android ouvertes, couverture des 64 vues, ce qui est à lancer ensuite. Le commentaire est un compte
rendu daté : l'état fait foi dans les issues. Pied Claude Code obligatoire.
DONNÉES : ${JSON.stringify(bilan)}`,
  { label: 'bilan', phase: 'Bilan', model: MODELE.mecanique, effort: 'low' })

return bilan
