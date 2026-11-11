const COUNTERS = { total: 'mots visibles', firstScreen: 'mots au premier écran' };

const sorted = (record) => Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));

export const budgetsFromMeasure = (measured) => ({ views: sorted(measured.views), uncovered: sorted(measured.uncovered) });

const overBudget = (name, measuredView, budgetView) =>
  Object.entries(COUNTERS).flatMap(([key, label]) =>
    measuredView[key] > budgetView[key]
      ? [`${name} : ${measuredView[key]} ${label} pour un budget de ${budgetView[key]} — l'écran redevient bavard, range le texte derrière un (i)`]
      : [],
  );

const raised = (name, budgetView, previousView) =>
  Object.entries(COUNTERS).flatMap(([key, label]) =>
    budgetView[key] > previousView[key]
      ? [`${name} : le budget de ${label} passe de ${previousView[key]} à ${budgetView[key]} — un budget ne peut que baisser`]
      : [],
  );

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

const ratchetProblems = ({ budgets, previous }) =>
  Object.entries(previous.views).flatMap(([name, previousView]) => {
    const budget = budgets.views[name];
    if (budget !== undefined) return raised(name, budget, previousView);
    if (name in budgets.uncovered) return [`${name} : couverte à la base, elle ne peut pas devenir « non couverte »`];
    return [];
  });

export const verbosityProblems = ({ listed, measured, budgets, previous }) => [
  ...listed.flatMap((name) => listedProblems({ name, measured, budgets })),
  ...(previous === null ? [] : ratchetProblems({ budgets, previous })),
];
