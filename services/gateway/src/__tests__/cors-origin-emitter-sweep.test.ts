/**
 * Le CLIQUET des portes qui DÉCIDENT d'une origine (#4538).
 *
 * ## Ce qu'il corrige de son aîné
 *
 * #4480 a rendu la résolution des origines UNIQUE, sur un inventaire des
 * LECTEURS de `CORS_ORIGINS` / `ALLOWED_ORIGINS`. Cet inventaire était complet
 * dans la langue où il était énoncé — et il a laissé des portes dehors, parce
 * qu'elles ne participent à aucune phrase contenant le nom de la variable :
 *
 * > Une énumération de lecteurs ferme la classe qu'elle a nommée. Chercher
 * > « qui LIT `CORS_ORIGINS` » trouve deux portes ; chercher « qu'est-ce qui
 * > POSE un en-tête d'origine » en trouve quatre.
 *
 * D'où l'angle de ce cliquet, qui est tout le sujet de #4538 : il balaie ce qui
 * **SORT**, jamais ce qui est lu. `balayerEmissions` (dans `helpers/`) porte la
 * mesure ; ce fichier porte le VERDICT.
 *
 * ## Les quatre portes, mesurées le 2026-08-31
 *
 * | porte | forme | gouvernée ? |
 * |---|---|---|
 * | `server.ts` (`register(cors, …)`) | déléguée à `@fastify/cors` | oui — `fastifyCorsOrigin` |
 * | `socketio/MeeshySocketIOManager.ts` (`new SocketIOServer(…)`) | déléguée à `socket.io` | oui — `socketIoCorsOrigin` |
 * | `routes/attachments/download.ts` | littérale, `'*'` | **non — déclarée** |
 * | `routes/uploads/tus-handler.ts` (`new Server({…})`) | déléguée à `@tus/server`, `'*'` par défaut | **non — déclarée** |
 *
 * **#4538 en annonçait trois ; la mesure en rend quatre.** La quatrième ne
 * nomme aucun en-tête, ne lit aucune variable d'origine et ne pose même pas
 * d'option : elle décide en OMETTANT `allowedOrigins`, ce dont seul un balayage
 * écrit sur les émetteurs pouvait s'apercevoir. Détail et raison mesurée dans
 * `PORTES_HORS_REGLE`.
 *
 * ## Les trois règles, et le sens dans lequel chacune mord
 *
 * 1. toute porte est GOUVERNÉE (elle importe la règle et en cite un résolveur)
 *    ou DÉCLARÉE hors règle avec sa raison — une cinquième porte inconnue
 *    rougit ;
 * 1 bis. aucune déclaration ne survit à la porte qu'elle décrivait — une porte
 *    supprimée dont la ligne reste rougit ;
 * 1 ter. une porte déclarée hors règle qui se met à LIRE la règle rougit — la
 *    déclaration devenue fausse doit partir dans le même commit ;
 * 2. l'en-tête ET la valeur déclarés sont ceux que le site pose réellement.
 *
 * Ajouter une porte qui RESPECTE la règle ne demande de toucher à rien ici :
 * seule une porte qui s'en échappe doit se déclarer. C'est ce qui rend le
 * cliquet tenable sans transformer chaque route en formalité.
 *
 * @jest-environment node
 */

import { describe, it, expect } from '@jest/globals';
import { readFileSync } from 'fs';
import { join } from 'path';

import { isHandWrittenSource, walk } from './helpers/file-size-sweep';
import {
  COMPOSANTS_EMETTEURS,
  balayerEmissions,
  composantPoseLEnTete,
  poseUnEnTete,
  type EmissionOrigine,
  type RegleDesOrigines,
} from './helpers/cors-origin-emitter-sweep';
import * as moduleDeLaRegle from '../config/cors-origins';
import {
  MODULE_DE_LA_REGLE,
  PORTES_HORS_REGLE,
  RESOLVEURS_DE_LA_REGLE,
  type PorteHorsRegle,
} from '../config/cors-origins';

const SRC = join(__dirname, '..');
const RACINE_GATEWAY = join(__dirname, '../..');

const REGLE: RegleDesOrigines = {
  module: MODULE_DE_LA_REGLE,
  resolveurs: RESOLVEURS_DE_LA_REGLE,
};

const EMISSIONS = balayerEmissions(SRC, REGLE);

/**
 * La clé d'une porte : fichier, FORME, et le composant quand elle délègue.
 *
 * Le fichier seul ne suffit pas, et ce n'est pas une précaution théorique : la
 * première version de ce cliquet indexait les déclarations par fichier, si bien
 * qu'un fichier déjà déclaré recevait un blanc-seing pour TOUTE émission qu'on
 * lui ajouterait ensuite. La porte factice fabriquée pour prouver le rouge —
 * une délégation ajoutée dans `download.ts`, déjà déclaré pour son émission
 * littérale — passait au VERT. Une déclaration couvre une porte, jamais un
 * fichier.
 */
const cle = (fichier: string, forme: string, composant?: string): string =>
  [fichier, forme, composant].filter((part) => part !== undefined).join(' | ');

const cleDeLEmission = (emission: EmissionOrigine): string =>
  emission.forme === 'deleguee'
    ? cle(emission.fichier, emission.forme, emission.composant)
    : cle(emission.fichier, emission.forme);

const cleDeLaDeclaration = (declaree: PorteHorsRegle): string =>
  declaree.forme === 'deleguee'
    ? cle(declaree.fichier, declaree.forme, declaree.composant)
    : cle(declaree.fichier, declaree.forme);

const DECLAREES = new Set(PORTES_HORS_REGLE.map(cleDeLaDeclaration));

/** Les FICHIERS déclarés — la bonne granularité pour la règle 1 ter seule, qui juge le fichier. */
const FICHIERS_DECLARES = new Set(PORTES_HORS_REGLE.map((porte) => porte.fichier));

const identite = (emission: EmissionOrigine): string => cleDeLEmission(emission);

/** Les émissions du module de la règle sont sa DÉCLARATION, jamais une porte. */
const portes = EMISSIONS.filter((emission) => emission.fichier !== MODULE_DE_LA_REGLE);

describe('toute porte qui décide d’une origine est gouvernée, ou déclarée hors règle (#4538)', () => {
  // Trois bornes, parce qu'un balayage qui ne voit rien passerait les quatre
  // règles au vert — la pire des façons de passer. La deuxième et la troisième
  // ne bornent pas le VOLUME mais la CAPACITÉ : elles tombent si l'un des deux
  // détecteurs cesse de fonctionner, ce qu'un simple compte de fichiers ne dit
  // pas.
  it('borne de non-vacuité — le balayage lit bien les sources de production du gateway', () => {
    expect(walk(SRC, isHandWrittenSource).length).toBeGreaterThan(400);
  });

  it('borne de non-vacuité — il voit les DEUX formes d’émission, littérale et déléguée', () => {
    expect([...new Set(portes.map((porte) => porte.forme))].sort()).toEqual([
      'deleguee',
      'litterale',
    ]);
  });

  it('borne de non-vacuité — il voit la porte HTTP, qui ne nomme AUCUN en-tête', () => {
    // C'est le témoin du détecteur de délégation : `server.ts` ne contient pas
    // la chaîne `Access-Control-Allow-Origin`. Un balayage écrit sur le nom de
    // l'en-tête serait vert ici en ne voyant qu'une porte sur quatre.
    const httpFastify = portes.filter(
      (porte) => porte.fichier === 'server.ts' && porte.forme === 'deleguee'
    );

    expect(httpFastify.map(identite)).toEqual(['server.ts | deleguee | @fastify/cors']);
    expect(readFileSync(join(SRC, 'server.ts'), 'utf8')).not.toContain(
      'Access-Control-Allow-Origin'
    );
  });

  it('règle 1 — aucune porte qui ne soit gouvernée par la règle ou déclarée hors règle', () => {
    const inconnues = portes
      .filter((porte) => !porte.citeLaRegle && !DECLAREES.has(cleDeLEmission(porte)))
      .map(identite);

    expect(inconnues).toEqual([]);
  });

  it('règle 1 bis — aucune déclaration ne survit à la porte qu’elle décrivait', () => {
    const vues = new Set(portes.map(cleDeLEmission));
    const perimees = PORTES_HORS_REGLE.map(cleDeLaDeclaration).filter(
      (declaree) => !vues.has(declaree)
    );

    expect(perimees).toEqual([]);
  });

  it('règle 1 ter — une porte déclarée hors règle qui se met à LIRE la règle rougit', () => {
    // Le sens INVERSE du cliquet : faire enfin passer `download.ts` sous la
    // règle est une bonne nouvelle, mais laisser sa déclaration derrière
    // affirmerait une divergence qui n'existe plus — et la prochaine lecture
    // de `PORTES_HORS_REGLE` croirait une porte ouverte qui ne l'est pas.
    const retournees = portes
      .filter((porte) => porte.citeLaRegle && FICHIERS_DECLARES.has(porte.fichier))
      .map(identite);

    expect(retournees).toEqual([]);
  });

  it('règle 2 — chaque porte hors règle pose l’en-tête ET la valeur déclarés', () => {
    const ecarts = PORTES_HORS_REGLE.flatMap((declaree) => {
      const vue = portes.find((porte) => cleDeLEmission(porte) === cleDeLaDeclaration(declaree));
      if (vue === undefined) return [`${declaree.fichier} : aucune émission mesurée au site`];

      if (declaree.forme === 'litterale' && vue.forme === 'litterale') {
        const conforme =
          vue.entetes.includes(declaree.entete.toLowerCase()) &&
          vue.valeurs.includes(declaree.valeur);
        return conforme
          ? []
          : [
              `${declaree.fichier} : déclaré ${declaree.entete}=${declaree.valeur}, ` +
                `mesuré ${JSON.stringify(vue.entetes)} = ${JSON.stringify(vue.valeurs)}`,
            ];
      }

      if (declaree.forme === 'deleguee' && vue.forme === 'deleguee') {
        return declaree.composant === vue.composant
          ? []
          : [`${declaree.fichier} : déclaré via ${declaree.composant}, mesuré via ${vue.composant}`];
      }

      return [`${declaree.fichier} : forme déclarée et forme mesurée divergent`];
    });

    expect(ecarts).toEqual([]);
  });

  it('chaque porte hors règle porte une RAISON mesurée, jamais une mention', () => {
    const maigres = PORTES_HORS_REGLE.filter((declaree) => declaree.pourquoi.length <= 20).map(
      (declaree) => declaree.fichier
    );

    expect(maigres).toEqual([]);
  });

  it('les composants délégants POSENT réellement l’en-tête — vérifié dans le paquet installé', () => {
    // Anti-péremption de `COMPOSANTS_EMETTEURS` : une entrée gardée après que
    // le paquet a cessé d'émettre ferait porter au cliquet une délégation
    // imaginaire, et masquerait la porte qu'elle prétend décrire.
    const muets = COMPOSANTS_EMETTEURS.filter(
      (composant) => !composantPoseLEnTete(RACINE_GATEWAY, composant.module)
    ).map((composant) => composant.module);

    expect(muets).toEqual([]);
  });

  it('les résolveurs que la règle déclare sont bien les siens', () => {
    // Renommer `fastifyCorsOrigin` sans toucher à cette liste rendrait les deux
    // portes gouvernées INCONNUES au balayage : la règle 1 rougirait pour une
    // mauvaise raison. Ce témoin-ci nomme la vraie.
    const exportes: Readonly<Record<string, unknown>> = { ...moduleDeLaRegle };
    const absents = RESOLVEURS_DE_LA_REGLE.filter(
      (nom) => typeof exportes[nom] !== 'function'
    );

    expect(absents).toEqual([]);
  });

  it('le module de la règle ne pose lui-même aucun en-tête — sinon son exemption serait un trou', () => {
    // Il est le SEUL fichier exempté du balayage (il nomme forcément l'en-tête
    // qu'il gouverne). L'exemption ne vaut que tant qu'il ne pose rien.
    expect(poseUnEnTete(readFileSync(join(SRC, MODULE_DE_LA_REGLE), 'utf8'))).toBe(false);
  });
});
