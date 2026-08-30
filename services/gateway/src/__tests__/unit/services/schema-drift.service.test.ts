import {
  colonnesChaineDuSchema,
  commandeDeComptage,
  commandeDeDetail,
  demarrerSondeDeTypage,
  filtreDeDerive,
  pipelineDeDetail,
  sonderLeTypage,
  type ExecuteurMongo,
  type JournalDeSonde,
  type ModeleDatamodel,
} from '../../../services/schema-drift.service';

/**
 * Témoins de la SONDE DE DÉRIVE DE TYPAGE (#4243).
 *
 * Chaque témoin nomme la mutation sous laquelle il rougit — un témoin qu'on n'a
 * jamais vu rouge ne protège rien. La mine que la sonde garde : une valeur mal
 * typée rend TOUTE écriture Prisma sur sa ligne impossible, y compris celles
 * qui ne touchent pas la colonne fautive, et rien ne le signale.
 */

const champ = (partiel: Partial<ModeleDatamodel['fields'][number]> & { name: string }) => ({
  dbName: null,
  kind: 'scalar',
  type: 'String',
  isList: false,
  isRequired: false,
  nativeType: null,
  ...partiel,
});

const datamodelDeTest: readonly ModeleDatamodel[] = [
  {
    name: 'User',
    dbName: null,
    fields: [
      champ({ name: 'id', dbName: '_id', isRequired: true, nativeType: ['ObjectId', []] }),
      champ({ name: 'username', isRequired: true }),
      champ({ name: 'phoneNumber' }),
      champ({ name: 'searchTokens', isList: true, isRequired: true }),
      champ({ name: 'isOnline', type: 'Boolean', isRequired: true }),
      champ({ name: 'conversations', kind: 'object', type: 'Conversation', isList: true, isRequired: true }),
    ],
  },
  {
    name: 'MutationLog',
    dbName: 'mutation_logs',
    fields: [
      champ({ name: 'id', dbName: '_id', isRequired: true, nativeType: ['ObjectId', []] }),
      champ({ name: 'mentionedUserId', dbName: 'mentionedParticipantId' }),
    ],
  },
  {
    name: 'SansChaine',
    dbName: null,
    fields: [champ({ name: 'compteur', type: 'Int', isRequired: true })],
  },
];

const journalMuet = (): JournalDeSonde & {
  erreurs: { message: string; contexte?: Record<string, unknown> }[];
  avertissements: string[];
  infos: string[];
} => {
  const erreurs: { message: string; contexte?: Record<string, unknown> }[] = [];
  const avertissements: string[] = [];
  const infos: string[] = [];
  return {
    erreurs,
    avertissements,
    infos,
    info: (message) => { infos.push(message); },
    warn: (message) => { avertissements.push(message); },
    error: (message, _erreur, contexte) => { erreurs.push({ message, contexte }); },
  };
};

/** Un exécuteur qui rend, pour chaque commande, la réponse programmée par collection. */
const executeurAvec = (
  reponses: Record<string, { compte?: number; detail?: Record<string, unknown>[]; echec?: string }>,
): ExecuteurMongo & { commandes: Record<string, unknown>[] } => {
  const commandes: Record<string, unknown>[] = [];
  return {
    commandes,
    $runCommandRaw: async (commande) => {
      commandes.push(commande);
      const collection = String(commande.aggregate);
      const reponse = reponses[collection] ?? {};
      if (reponse.echec) throw new Error(reponse.echec);
      const pipeline = commande.pipeline as { $count?: string }[];
      const estComptage = pipeline.some((etape) => '$count' in etape);
      if (estComptage) {
        return { cursor: { firstBatch: reponse.compte ? [{ n: reponse.compte }] : [] }, ok: 1 };
      }
      return { cursor: { firstBatch: reponse.detail ?? [] }, ok: 1 };
    },
  };
};

const collectionsDeTest = () => colonnesChaineDuSchema(datamodelDeTest);
const userDeTest = () => collectionsDeTest().find((c) => c.collection === 'User')!;

describe('recensement des colonnes `String` depuis le SCHÉMA', () => {
  // Mutation : retirer le filtre `nativeType?.[0] !== 'ObjectId'`.
  it('exclut les colonnes @db.ObjectId — leur type BSON n\'est JAMAIS `string`', () => {
    expect(userDeTest().colonnes.map((c) => c.colonne)).not.toContain('_id');
  });

  // Mutation : retirer les filtres `kind === 'scalar'` / `type === 'String'`.
  it('ne retient que les scalaires `String` — ni relations, ni booléens', () => {
    expect(userDeTest().colonnes.map((c) => c.colonne).sort()).toEqual(['phoneNumber', 'searchTokens', 'username']);
  });

  // Mutation : lire `modele.name` / `champ.name` au lieu de `dbName ?? name`.
  it('nomme la collection et la colonne comme MONGO les nomme (@@map, @map)', () => {
    const mappee = collectionsDeTest().find((c) => c.modele === 'MutationLog');
    expect(mappee?.collection).toBe('mutation_logs');
    expect(mappee?.colonnes[0]?.colonne).toBe('mentionedParticipantId');
    expect(mappee?.colonnes[0]?.champ).toBe('mentionedUserId');
  });

  // Mutation : retirer le `.filter(collection => collection.colonnes.length > 0)`.
  it('écarte les collections sans colonne `String` — un `$or` vide matcherait TOUT', () => {
    expect(collectionsDeTest().map((c) => c.collection)).not.toContain('SansChaine');
  });
});

describe('le filtre qui dit « ce type n\'est pas déclaré »', () => {
  const colonne = (nom: string) => userDeTest().colonnes.find((c) => c.colonne === nom)!;

  // Mutation : retirer `$exists: true`.
  it('exige `$exists: true` — sans lui, toute ligne antérieure à la colonne compterait comme fautive', () => {
    expect(filtreDeDerive(colonne('phoneNumber'))).toEqual({
      phoneNumber: { $exists: true, $not: { $type: ['string', 'null'] } },
    });
  });

  // Mutation : servir `['string', 'null']` quelle que soit l'obligation du champ.
  it('`null` est déclaré par une colonne OPTIONNELLE, jamais par une colonne REQUISE', () => {
    expect(filtreDeDerive(colonne('username'))).toEqual({
      username: { $exists: true, $not: { $type: ['string'] } },
    });
  });

  // Mutation : rendre la forme scalaire pour une liste.
  it('une LISTE se casse de deux façons — pas un tableau, ou un élément non-chaîne', () => {
    expect(filtreDeDerive(colonne('searchTokens'))).toEqual({
      $or: [
        { searchTokens: { $exists: true, $not: { $type: 'array' } } },
        { searchTokens: { $elemMatch: { $not: { $type: 'string' } } } },
      ],
    });
  });
});

describe('la commande envoyée à la base', () => {
  // Mutation : retirer `maxTimeMS` de `commandeDeComptage`.
  it('borne le balayage CÔTÉ BASE — un `$match` sans index ne rend jamais la main tout seul', () => {
    expect(commandeDeComptage(userDeTest(), 4321).maxTimeMS).toBe(4321);
    expect(commandeDeDetail(userDeTest(), 5, 4321).maxTimeMS).toBe(4321);
  });

  // Mutation : projeter la valeur (`{ _id: 1, valeurs: { phoneNumber: '$phoneNumber' } }`).
  it('le détail ne projette JAMAIS la valeur fautive — seulement son type BSON', () => {
    const projection = JSON.stringify(pipelineDeDetail(userDeTest(), 3));
    expect(projection).toContain('$type');
    expect(projection).not.toMatch(/"phoneNumber"\s*:\s*"\$phoneNumber"/);
  });

  // Mutation : remplacer l'expression de liste par un simple `{ $type: '$searchTokens' }`.
  it('sur une LISTE, le type rendu est celui des ÉLÉMENTS — `array` ne dirait rien', () => {
    const projection = JSON.stringify(pipelineDeDetail(userDeTest(), 3));
    expect(projection).toContain('$setUnion');
    expect(projection).toContain('$isArray');
  });

  // Mutation : retirer `$limit` du pipeline de détail.
  it('borne l\'échantillon — le détail sert à NOMMER la colonne, pas à rapatrier la base', () => {
    expect(pipelineDeDetail(userDeTest(), 7)).toContainEqual({ $limit: 7 });
  });
});

describe('la garde qui rougit', () => {
  const detailPhone = [{ _id: { $oid: 'aaa' }, types: { username: 'string', phoneNumber: 'long', searchTokens: ['string'] } }];

  // Mutation : `journal.warn(...)` au lieu de `journal.error(...)` dans `journaliser`.
  it('journalise en ERROR dès qu\'une ligne porte un type non déclaré', async () => {
    const journal = journalMuet();
    const rapport = await sonderLeTypage(executeurAvec({ User: { compte: 1, detail: detailPhone } }), {
      modeles: datamodelDeTest,
      journal,
    });
    expect(rapport.lignesEnDerive).toBe(1);
    expect(journal.erreurs).toHaveLength(1);
    expect(journal.erreurs[0].message).toContain('DÉRIVE DE TYPAGE');
    expect(journal.erreurs[0].contexte?.derives).toEqual([
      { collection: 'User', colonne: 'phoneNumber', typeBson: 'long', exemples: ['aaa'] },
    ]);
  });

  // Mutation : ne balayer que la première collection recensée.
  it('balaye TOUTES les collections, pas seulement `User`', async () => {
    const executeur = executeurAvec({});
    await sonderLeTypage(executeur, { modeles: datamodelDeTest, journal: journalMuet() });
    expect(executeur.commandes.map((c) => c.aggregate)).toEqual(['User', 'mutation_logs']);
  });

  // Mutation : retirer le `continue` quand le compte vaut 0.
  it('ne demande le détail que si le compte est non nul — une base saine coûte une commande par collection', async () => {
    const executeur = executeurAvec({ User: { compte: 0 } });
    await sonderLeTypage(executeur, { modeles: datamodelDeTest, journal: journalMuet() });
    expect(executeur.commandes).toHaveLength(2);
  });

  // Mutation : `catch { continue; }` sans nourrir `collectionsNonSondees`.
  it('une collection illisible n\'est NI propre NI fautive — elle est déclarée non sondée', async () => {
    const journal = journalMuet();
    const rapport = await sonderLeTypage(executeurAvec({ User: { echec: 'operation exceeded time limit' } }), {
      modeles: datamodelDeTest,
      journal,
    });
    expect(rapport.collectionsNonSondees).toEqual([
      { collection: 'User', raison: 'operation exceeded time limit' },
    ]);
    expect(rapport.collectionsSondees).toBe(1);
    expect(journal.avertissements[0]).toContain('balayage INCOMPLET');
    expect(journal.infos).toHaveLength(0);
  });

  // Mutation : rendre un rapport vert quand le recensement est vide.
  it('un datamodel ILLISIBLE rend une ERREUR, jamais un rapport vert', async () => {
    const journal = journalMuet();
    const rapport = await sonderLeTypage(executeurAvec({}), { modeles: [], journal });
    expect(journal.erreurs[0].message).toContain('datamodel ILLISIBLE');
    expect(rapport.collectionsNonSondees).toEqual([{ collection: '*', raison: 'datamodel illisible' }]);
  });

  // Mutation : compter une liste `['string']` comme une dérive (retirer le tri par type déclaré).
  it('ne retient, dans le détail, que les colonnes dont le type n\'est pas déclaré', async () => {
    const journal = journalMuet();
    const rapport = await sonderLeTypage(
      executeurAvec({
        User: {
          compte: 2,
          detail: [
            { _id: 'a', types: { username: 'string', phoneNumber: 'long', searchTokens: ['string'] } },
            { _id: 'b', types: { username: 'string', phoneNumber: 'string', searchTokens: ['string', 'int'] } },
          ],
        },
      }),
      { modeles: datamodelDeTest, journal },
    );
    expect(rapport.derives).toEqual([
      { collection: 'User', colonne: 'phoneNumber', typeBson: 'long', exemples: ['a'] },
      { collection: 'User', colonne: 'searchTokens', typeBson: 'array<string|int>', exemples: ['b'] },
    ]);
  });
});

describe('le démarrage de la sonde', () => {
  // Mutation : retirer l'appel `passe()` avant `setInterval`.
  it('passe une première fois AU DÉMARRAGE — une sonde qui attend 12 h ne garde rien au boot', async () => {
    const executeur = executeurAvec({});
    const sonde = demarrerSondeDeTypage(executeur, {
      modeles: datamodelDeTest,
      journal: journalMuet(),
      periodeMs: 60_000,
    });
    await Promise.resolve();
    await Promise.resolve();
    sonde.arreter();
    expect(executeur.commandes.length).toBeGreaterThan(0);
  });

  // Mutation : remplacer le corps du `.catch` de la passe par un no-op.
  it('une passe qui ÉCHOUE journalise en error — une sonde muette qui meurt ne garde plus rien', async () => {
    const journal = journalMuet();
    const executeurCasse: ExecuteurMongo = {
      $runCommandRaw: () => Promise.reject(new Error('base injoignable')),
    };
    const sonde = demarrerSondeDeTypage(executeurCasse, {
      modeles: datamodelDeTest,
      journal,
      periodeMs: 60_000,
    });
    for (let tour = 0; tour < 8; tour++) await Promise.resolve();
    sonde.arreter();
    // Une collection illisible est absorbée par collection ; ce qui doit rougir
    // ici est le balayage INCOMPLET, jamais un rapport silencieusement vert.
    expect(journal.avertissements.some((m) => m.includes('balayage INCOMPLET'))).toBe(true);
    expect(journal.infos).toHaveLength(0);
  });

  // Mutation : ne pas relancer (remplacer `setInterval` par `setTimeout` sans répétition).
  it('repasse à intervalle régulier — la prochaine écriture hors Prisma ne doit pas dormir six mois', async () => {
    jest.useFakeTimers();
    try {
      const executeur = executeurAvec({});
      const sonde = demarrerSondeDeTypage(executeur, {
        modeles: datamodelDeTest,
        journal: journalMuet(),
        periodeMs: 1_000,
      });
      await Promise.resolve();
      const apresDemarrage = executeur.commandes.length;
      jest.advanceTimersByTime(3_000);
      await Promise.resolve();
      await Promise.resolve();
      sonde.arreter();
      expect(executeur.commandes.length).toBeGreaterThan(apresDemarrage);
    } finally {
      jest.useRealTimers();
    }
  });
});
