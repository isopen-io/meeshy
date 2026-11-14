export const KIT_WIDTHS = [390, 820, 1440];
export const KIT_BOARD_ID = 'planche';
export const KIT_COMPACT_WIDTH = 390;
export const KIT_CATALOGUE_NAME = 'Catalogue';
export const KIT_EMPTY_STATE = { id: 'vide', boardView: null, isTouchable: false };

export const kitLotsOf = (registry) =>
  registry.lots
    .filter((lot) => lot.type === 'kit' && typeof lot.cle === 'string' && typeof lot.nom === 'string' && typeof lot.cible_web === 'string')
    .map((lot) => ({ key: lot.cle, name: lot.nom, target: lot.cible_web }));

export const boardViewIds = (html) => {
  const start = html.indexOf('const S=[');
  if (start === -1) throw new Error('la table S a disparu de la planche');
  return new Set([...html.slice(start).matchAll(/\{id:'([A-Z]+[0-9]+)'/g)].map((match) => match[1]));
};

export const witnessPath = (target) => target.replace(/\.tsx?$/, '.test.tsx');

export const candidatePaths = (lots) => lots.flatMap((lot) => [lot.target, witnessPath(lot.target)]);

export const variantsOf = (state) => (state.isTouchable ? ['clair', 'sombre', 'presse'] : ['clair', 'sombre']);

export const imageStem = ({ id, variant, width }) => `${id}.${variant}-${width}`;

export const expectedStems = (states) => [
  ...states.flatMap((state) =>
    variantsOf(state).flatMap((variant) => KIT_WIDTHS.map((width) => imageStem({ id: state.id, variant, width }))),
  ),
  imageStem({ id: KIT_BOARD_ID, variant: 'grande-police', width: KIT_COMPACT_WIDTH }),
  imageStem({ id: KIT_BOARD_ID, variant: 'rtl', width: KIT_COMPACT_WIDTH }),
];

export const imageProblems = ({ label, name, states, images }) =>
  expectedStems(states)
    .filter((stem) => !images.includes(`${name}/${stem}.png`))
    .map((stem) => `${label} : l'image ${name}/${stem} est absente`);

export const catalogueProblems = ({ images }) =>
  imageProblems({ label: KIT_CATALOGUE_NAME, name: KIT_CATALOGUE_NAME, states: [KIT_EMPTY_STATE], images });

export const sequenceProblems = ({ lots, entries }) =>
  JSON.stringify(lots.map((lot) => [lot.key, lot.name])) === JSON.stringify(entries.map((entry) => [entry.key, entry.name]))
    ? []
    : ["le catalogue ne porte pas les clés et les noms du registre, dans l'ordre"];

export const lotProblems = ({ lot, entry, boardViewIds: known, disk }) => {
  if (!disk.existing.has(lot.target)) {
    return entry.states.length > 0 ? [`${lot.key} ${lot.name} : la cible ${lot.target} n'existe pas, l'entrée doit être vide`] : [];
  }
  if (entry.states.length === 0) return [`${lot.key} ${lot.name} : la cible existe, l'entrée est vide`];
  return [
    ...(disk.existing.has(witnessPath(lot.target)) ? [] : [`${lot.key} : le témoin ${witnessPath(lot.target)} est absent`]),
    ...entry.states
      .filter((state) => state.boardView !== null && !known.has(state.boardView))
      .map((state) => `${lot.key} : la vue ${state.boardView} n'est pas dans la table S de la planche`),
    ...imageProblems({ label: lot.key, name: lot.name, states: entry.states, images: disk.images }),
  ];
};

export const auditKitRegistry = ({ lots, entries, boardViewIds: known, disk }) => [
  ...sequenceProblems({ lots, entries }),
  ...lots.flatMap((lot) => {
    const entry = entries.find((candidate) => candidate.key === lot.key);
    return entry === undefined ? [] : lotProblems({ lot, entry, boardViewIds: known, disk });
  }),
  ...catalogueProblems({ images: disk.images }),
];
