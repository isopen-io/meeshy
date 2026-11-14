const COUNTERS = { total: 'mots visibles', firstScreen: 'mots au premier écran' };

const sorted = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export const budgetsFromMeasure = (measured, current = {}) => ({
  views: sorted(measured.views),
  uncovered: sorted(measured.uncovered),
  ...(current.releves === undefined ? {} : { releves: current.releves }),
});

const sameView = (left, right) => left !== undefined && right !== undefined && Object.keys(COUNTERS).every((key) => left[key] === right[key]);
const pair = (view) => (view === undefined ? 'rien' : `${view.total}/${view.firstScreen}`);

const overBudget = (name, measuredView, budgetView) =>
  Object.entries(COUNTERS).flatMap(([key, label]) =>
    measuredView[key] > budgetView[key]
      ? [`${name} : ${measuredView[key]} ${label} pour un budget de ${budgetView[key]} — l'écran redevient bavard, range le texte derrière un (i)`]
      : [],
  );

const raised = (name, budgetView, previousView) =>
  Object.entries(COUNTERS).flatMap(([key, label]) =>
    budgetView[key] > previousView[key]
      ? [`${name} : le budget de ${label} passe de ${previousView[key]} à ${budgetView[key]} — un budget ne peut que baisser, sauf relèvement motivé inscrit dans « releves »`]
      : [],
  );

const releveProblem = ({ name, releve, budgetView, previousView, socleView }) => {
  if (typeof releve.motif !== 'string' || releve.motif.trim() === '') return `${name} : relèvement sans motif — dis quel repère revient à l'écran`;
  if (!Number.isInteger(releve.issue) || releve.issue <= 0) return `${name} : relèvement sans issue — inscris le numéro de l'issue qui le porte`;
  if (!sameView(releve.de, previousView)) return `${name} : le relèvement part de ${pair(releve.de)}, le budget de la base est ${pair(previousView)}`;
  if (!sameView(releve.a, budgetView)) return `${name} : le relèvement annonce ${pair(releve.a)}, le budget inscrit est ${pair(budgetView)}`;
  if (socleView === undefined) return `${name} : aucun budget d’avant l’épure connu (verbosity-socle.json) — un relèvement ne se mesure que contre lui`;
  if (Object.keys(COUNTERS).some((key) => budgetView[key] > socleView[key])) return `${name} : le relèvement à ${pair(budgetView)} dépasse le budget d’avant l’épure (${pair(socleView)})`;
  return null;
};

const raisedProblems = ({ name, budgets, budgetView, previousView, socle }) => {
  const problems = raised(name, budgetView, previousView);
  const releve = budgets.releves?.[name];
  if (problems.length === 0 || releve === undefined) return problems;
  const problem = releveProblem({ name, releve, budgetView, previousView, socleView: socle?.views[name] });
  return problem === null ? [] : [problem];
};

const listedProblems = ({ name, measured, budgets }) => {
  const budget = budgets.views[name];
  if (budget === undefined) {
    if (name in budgets.uncovered) return [];
    return [`${name} : vue listée sans budget ni mention « non couverte » — inscris-la dans verbosity-budgets.json`];
  }
  const measuredView = measured.views[name];
  if (measuredView === undefined) return [`${name} : la vue ne s’ouvre plus en fixtures (${measured.uncovered[name] ?? 'non mesurée'}) — un budget ne passe pas à vide`];
  return overBudget(name, measuredView, budget);
};

const ratchetProblems = ({ budgets, previous, socle }) =>
  Object.entries(previous.views).flatMap(([name, previousView]) => {
    const budget = budgets.views[name];
    if (budget !== undefined) return raisedProblems({ name, budgets, budgetView: budget, previousView, socle });
    if (name in budgets.uncovered) return [`${name} : couverte à la base, elle ne peut pas devenir « non couverte »`];
    return [];
  });

export const socleProblems = ({ socle, previousSocle }) =>
  previousSocle === null
    ? []
    : Object.entries(previousSocle.views).flatMap(([name, previousView]) =>
        sameView(socle.views[name], previousView) ? [] : [`${name} : le budget d’avant l’épure (${pair(previousView)}) ne se réécrit pas — il est le plafond des relèvements`],
      );

export const verbosityProblems = ({ listed, measured, budgets, previous, socle = null }) => [
  ...listed.flatMap((name) => listedProblems({ name, measured, budgets })),
  ...(previous === null ? [] : ratchetProblems({ budgets, previous, socle })),
];
