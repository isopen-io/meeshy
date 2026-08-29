/**
 * Le CLIQUET du manifeste des routes (#4276).
 *
 * ## Ce qu'il tient
 *
 * `docs/api/route-manifest.{json,md}` prétend dire ce que la gateway SERT. Un
 * artefact commité qui n'est comparé à rien devient faux au premier merge, et
 * un catalogue client bâti dessus hérite du mensonge sans le savoir : c'est
 * exactement ce qui a laissé `apps/web` appeler pendant des mois trois sondes
 * `/health/*` et un `/groups` qui n'existaient nulle part (#4219, #4222).
 *
 * Ce fichier RECALCULE le manifeste à chaque exécution des tests et le compare
 * octet à octet au fichier commité. Une route ajoutée, retirée, déplacée, ou
 * dont la garde change de niveau, fait rougir la suite tant que
 * `npx tsx scripts/route-manifest.ts` n'a pas été rejoué.
 *
 * ## Pourquoi le cliquet est aussi le GÉNÉRATEUR
 *
 * `MEESHY_ROUTE_MANIFEST=write` fait ÉCRIRE cette même suite au lieu de
 * comparer — c'est ce que le script de la racine déclenche. Le fichier commité
 * et ce que le cliquet recalcule viennent donc du MÊME code, sous le MÊME
 * runtime. Deux chemins (un pour écrire, un pour vérifier) auraient dérivé, et
 * un cliquet qui compare deux mesures différentes rougit sur du bruit — puis
 * finit désactivé.
 *
 * Le CERVEAU (assemblage, classement S0–S6, anomalies, rendu) vit dans
 * `scripts/route-manifest.ts`. Ce fichier n'est que la salle des machines : il
 * pose les doubles de modules ESM que seul le harnais Jest sait installer.
 *
 * ## Pourquoi ce n'est PAS dans `__tests__/security/`
 *
 * `route-auth-coverage.test.ts` répond à « une route laisse-t-elle passer un
 * anonyme ? ». Celui-ci répond à « la table publiée est-elle à jour ? ». Deux
 * questions, deux fichiers : les mêler ferait d'un désaccord de documentation
 * un échec de sécurité, et l'un finirait par couvrir l'autre.
 */

import { describe, it, expect, beforeAll } from '@jest/globals';
import fs from 'fs';
import path from 'path';

// Les doubles délèguent au générateur — un SEUL site pour chaque double, qui
// sert aussi bien la sonde que la génération. `require` est dans la liste
// blanche du hoisting de `jest.mock`, ce qui permet cette délégation.
jest.mock('@tus/server', () => require('../../../../scripts/route-manifest').doubleTusServer());
jest.mock('@tus/file-store', () => require('../../../../scripts/route-manifest').doubleTusFileStore());
jest.mock('../services/ZmqSingleton', () => require('../../../../scripts/route-manifest').doubleZmqSingleton());

// Enveloppe la fabrique de gardes AVANT que les modules de routes l'appellent :
// chaque garde rendue porte alors la permission qu'on lui a demandée. C'est ce
// qui rend S4/S5/S6 CONSTATÉS par identité plutôt que devinés par le nom d'une
// variable — les treize gardes locales de `routes/admin/` ne sont plus, depuis
// #4153, que des alias de cette fabrique.
jest.mock('../middleware/authorize', () => {
  const reel = jest.requireActual('../middleware/authorize');
  return require('../../../../scripts/route-manifest').envelopperAutorisation(reel);
});

import {
  construireManifeste,
  ecrireManifeste,
  rendreJson,
  rendreMarkdown,
  CHEMIN_MANIFESTE_JSON,
  CHEMIN_MANIFESTE_MD,
  COMMANDE_REGENERATION,
  RACINE_DEPOT,
  VOCABULAIRE,
  type Manifeste,
} from '../../../../scripts/route-manifest';

const ECRITURE = process.env.MEESHY_ROUTE_MANIFEST === 'write';
const relatif = (p: string) => path.relative(RACINE_DEPOT, p);

/** L'assemblage complet coûte une quinzaine de secondes : une seule fois. */
let manifeste: Manifeste;

beforeAll(async () => {
  manifeste = await construireManifeste();
}, 180_000);

describe('Manifeste des routes — le cliquet (#4276)', () => {
  it('assemble le serveur réel et énumère au moins une centaine de routes', () => {
    // Garde-fou du HARNAIS : sans lui, un assemblage qui cesserait d'énumérer
    // quoi que ce soit produirait un manifeste vide, et le cliquet passerait au
    // vert en ne mesurant plus rien — la mort silencieuse d'une garde négative.
    expect(manifeste.comptes.routes).toBeGreaterThan(100);
    expect(manifeste.comptes.modules).toBeGreaterThan(20);
  });

  it('attribue à chaque route un module déclarant réel', () => {
    // L'origine se lit dans la pile d'appel au moment du hook `onRoute`. Si la
    // résolution de source map cassait, tout deviendrait « inconnu » sans que
    // rien d'autre ne rougisse — et la colonne la plus utile du manifeste
    // deviendrait du remplissage.
    const orphelines = manifeste.routes.filter((r) => r.module === 'inconnu');
    expect(orphelines.map((r) => `${r.methode} ${r.chemin}`)).toEqual([]);
  });

  it('publie un niveau S0–S6 pour chaque route, ou l\'avoue', () => {
    // Le vocabulaire vient du générateur, jamais d'une copie locale : deux
    // listes qui disent la même chose finissent par ne plus la dire.
    const niveauxAdmis = new Set<string>(VOCABULAIRE);
    const horsVocabulaire = manifeste.routes.filter((r) => !niveauxAdmis.has(r.niveau));
    expect(horsVocabulaire.map((r) => `${r.methode} ${r.chemin} → ${r.niveau}`)).toEqual([]);

    // Chaque ligne porte la PREUVE de son niveau. Un niveau sans preuve est une
    // opinion, et le manifeste n'en publie pas.
    const sansPreuve = manifeste.routes.filter((r) => !r.preuve.includes('anonyme→'));
    expect(sansPreuve.map((r) => `${r.methode} ${r.chemin}`)).toEqual([]);

    // La matrice centrale est réellement lue : si l'enveloppe de
    // `middleware/authorize` cessait d'être posée, toutes les routes
    // d'administration retomberaient en S2 sans qu'aucun autre témoin ne bouge.
    const parMatrice = manifeste.routes.filter((r) => r.niveau === 'S5' || r.niveau === 'S6' || r.niveau === 'S4');
    expect(parMatrice.length).toBeGreaterThan(10);
  });

  it('CONSTATE les trois défauts d\'adressage du 2026-08-29 sans les corriger (#4277)', () => {
    const horsPrefixe = manifeste.anomalies.horsPrefixeApi.join('\n');
    const enDur = manifeste.anomalies.prefixeCodeDansLeModule.join('\n');

    // 1. `voiceAnalysisRoutes` est enregistré SANS préfixe (`register(x)` nu) :
    //    CINQ routes remontent à la racine au lieu de vivre sous /api/v1.
    const racineVoiceAnalysis = manifeste.anomalies.horsPrefixeApi.filter((l) =>
      l.includes('routes/voice-analysis.ts')
    );
    expect(racineVoiceAnalysis).toHaveLength(5);

    // 2. `routes/uploads/tus-handler.ts` et les modules de `routes/voice/`
    //    écrivent « /api/v1 » DANS le module : montage sans préfixe, chemin
    //    déjà préfixé.
    //
    //    NUANCE trouvée en mesurant, et conservée telle quelle : le préfixe est
    //    calculé par `routes/voice/index.ts` (`const prefix = '/api/v1/voice'`)
    //    mais les chemins sont DÉCLARÉS par `analysis.ts` et `translation.ts`,
    //    à qui il est passé. Le manifeste nomme le module DÉCLARANT — le seul
    //    qu'on ouvre pour changer une adresse. Viser `index.ts` ici aurait
    //    ancré le témoin sur un fichier que la table ne cite pas.
    expect(enDur).toContain('routes/uploads/tus-handler.ts');
    expect(enDur).toContain('routes/voice/analysis.ts');
    expect(enDur).toContain('routes/voice/translation.ts');

    // 3. `userDeletionsRoutes` est monté avec `prefix: ''` et déclare son
    //    chemin complet à l'intérieur — troisième convention d'adressage dans
    //    le même fichier. Le manifeste dit de PLUS ce que l'issue ne disait
    //    pas : ce chemin complet est écrit sous `/api/…` SANS `v1`, donc ces
    //    sept routes échappent aussi au versionnage — elles figurent dans les
    //    DEUX listes d'anomalies.
    expect(enDur).toContain('routes/user-deletions.ts');
    const userDeletionsHorsVersion = manifeste.anomalies.horsPrefixeApi.filter((l) =>
      l.includes('routes/user-deletions.ts')
    );
    expect(userDeletionsHorsVersion).toHaveLength(7);

    // Ce témoin NE SURVIT PAS à sa propre résolution : le jour où #4277 range
    // ces trois montages, il rougit. C'est le signal de le retirer, pas de
    // l'assouplir — une attente qui se relâche pour rester verte ne mesure plus
    // rien, et laisse revenir en silence ce qu'elle prétendait tenir.
  });

  it(ECRITURE ? 'écrit docs/api/route-manifest.{json,md}' : 'la version commitée de docs/api/route-manifest.{json,md} est à jour', () => {
    const json = rendreJson(manifeste);
    const md = rendreMarkdown(manifeste);

    if (ECRITURE) {
      ecrireManifeste(manifeste);
      expect(fs.readFileSync(CHEMIN_MANIFESTE_JSON, 'utf8')).toBe(json);
      expect(fs.readFileSync(CHEMIN_MANIFESTE_MD, 'utf8')).toBe(md);
      return;
    }

    for (const [chemin, attendu] of [
      [CHEMIN_MANIFESTE_JSON, json],
      [CHEMIN_MANIFESTE_MD, md],
    ] as const) {
      if (!fs.existsSync(chemin)) {
        throw new Error(
          `${relatif(chemin)} est ABSENT. Le manifeste est un artefact du dépôt : ` +
          `régénère-le par \`${COMMANDE_REGENERATION}\` et commite-le.`
        );
      }
      const commite = fs.readFileSync(chemin, 'utf8');
      if (commite === attendu) continue;

      // Le cas de LOIN le plus fréquent est « une route est apparue ou a
      // disparu ». Le dire en clair épargne d'ouvrir un diff de 500 lignes
      // pour retrouver ce qu'on vient soi-même de changer — et un message
      // qu'on ne sait pas lire est un cliquet qu'on finit par désactiver.
      if (chemin === CHEMIN_MANIFESTE_JSON) {
        const cle = (r: { methode: string; chemin: string }) => `${r.methode} ${r.chemin}`;
        const avant = new Set((JSON.parse(commite) as Manifeste).routes.map(cle));
        const apres = new Set(manifeste.routes.map(cle));
        const ajoutees = [...apres].filter((k) => !avant.has(k));
        const retirees = [...avant].filter((k) => !apres.has(k));
        if (ajoutees.length > 0 || retirees.length > 0) {
          throw new Error(
            `${relatif(chemin)} est PÉRIMÉ — le serveur assemblé ne sert plus les mêmes routes ` +
            `que le fichier commité.\n` +
            (ajoutees.length > 0 ? `\nServies mais ABSENTES du manifeste (${ajoutees.length}) :\n  ${ajoutees.join('\n  ')}\n` : '') +
            (retirees.length > 0 ? `\nDéclarées au manifeste mais PLUS SERVIES (${retirees.length}) :\n  ${retirees.join('\n  ')}\n` : '') +
            `\nRégénère et commite : \`${COMMANDE_REGENERATION}\``
          );
        }
      }

      // Le message NOMME la première ligne qui diverge : « les fichiers
      // diffèrent » oblige à relancer le générateur pour savoir quoi.
      const a = commite.split('\n');
      const b = attendu.split('\n');
      const i = a.findIndex((ligne, k) => ligne !== b[k]);
      throw new Error(
        `${relatif(chemin)} est PÉRIMÉ — le serveur assemblé ne dit plus ce que le fichier commité déclare.\n` +
        `Première divergence, ligne ${i + 1} :\n` +
        `  commité : ${a[i] ?? '(fin de fichier)'}\n` +
        `  assemblé: ${b[i] ?? '(fin de fichier)'}\n\n` +
        `Régénère et commite : \`${COMMANDE_REGENERATION}\``
      );
    }
  });
});
