// packages/shared/__tests__/ci/swift-socket-payload-dead-field-gate.test.ts
//
// Le SENS INVERSE, côté miroir SWIFT — la quatrième case d'un tableau à deux
// entrées (#18158 pour Kotlin, #18121 et #18070 pour l'autre sens).
//
// |                 | le miroir EXIGE trop | le miroir DÉCLARE trop |
// |-----------------|----------------------|------------------------|
// | **Kotlin**      | #18070               | #18158                 |
// | **Swift**       | #18121               | **ici**                |
//
// ─── Ce que ce sens attrape, et pourquoi il est le plus silencieux ────────
//
// Une propriété OPTIONNELLE que le contrat ne porte nulle part se décode
// toujours en `nil` : la trame arrive, et la branche qui la lit ne s'exécute
// jamais. Rien ne lève, rien ne manque à l'écran — le code est simplement
// inerte. Côté Kotlin, ce balayage a rendu QUINZE champs là où une relecture
// adversariale en voyait un, dont deux pannes vivantes (#18157 : un compteur de
// j'aime remis à zéro sur quatre écrans).
//
// ─── La frontière, et pourquoi c'est le FICHIER qui la décide ─────────────
//
// Un type déclaré sous `Sockets/` n'a qu'un producteur : le fil. Un champ qu'il
// ne sert pas y est mort, sans alternative. Un type de `Models/` — `APIMessage`,
// `APIPostComment` — porte légitimement ce que l'API REST remplit et que le
// socket ne sert pas. Les confondre noierait la garde sous des dizaines de faux
// positifs, et un outil qui crie à tort finit désarmé.
//
// (#18269) Les types à `init(from:)` MANUEL sont écartés pour une raison distincte : leur
// décodeur peut alimenter une propriété depuis une AUTRE clé du fil, ou depuis
// rien du tout. Mesuré : les compter rendait 18 constats, dont 17 de cette
// forme. Ils sont ÉNUMÉRÉS, pas tus.

import { describe, expect, it } from 'vitest';

import { readContractPayloads } from './socket-payload-shape/mirror-contract';
import { readSwift } from './socket-payload-shape/swift-mirror';
import { relativeToRepo } from './socket-payload-shape/required-field-report';

/**
 * Les champs DÉCLARÉS par le miroir et absents du contrat, avec leur raison.
 *
 * Une entrée n'excuse rien : la seconde assertion exige qu'elle soit ENCORE morte,
 * donc une entrée réparée fait rougir la garde jusqu'à ce qu'on la retire.
 */
const DIVERGENCES_CONNUES: ReadonlyMap<string, string> = new Map([
  [
    'FriendRequestRejectedEvent.senderId',
    "DÉLIBÉRÉ et documenté sur place : « `senderId` n'est PAS sur le fil (il ne sert qu'à router " +
      "l'émission côté gateway) : déclaré optionnel par tolérance, jamais lu ». Le consommateur ne lit " +
      'que `rejecterId` — aucune branche inerte, donc aucune panne à armer.',
  ],
]);

const swift = readSwift();
const contract = readContractPayloads();

/** Les événements du contrat qui routent chaque type NOMMÉ par une route. */
const eventsByType = (): ReadonlyMap<string, ReadonlySet<string>> => {
  const map = new Map<string, Set<string>>();
  for (const route of swift.routes) {
    if (route.typeName === undefined || route.event === undefined || !contract.has(route.event)) continue;
    const events = map.get(route.typeName) ?? new Set<string>();
    events.add(route.event);
    map.set(route.typeName, events);
  }
  return map;
};

const deadFields = (): ReadonlyMap<string, string> => {
  const dead = new Map<string, string>();
  for (const [typeName, events] of eventsByType()) {
    const mirror = swift.resolveType(typeName);
    /* La frontière est le FICHIER : hors de `Sockets/`, le type a un producteur REST. */
    if (!mirror || mirror.customDecoder || !mirror.file.includes('/Sockets/')) continue;
    for (const property of mirror.properties) {
      const served = [...events].some((event) =>
        (contract.get(event)?.fields ?? []).some((field) => field.name === property.name),
      );
      if (served) continue;
      dead.set(
        `${typeName}.${property.name}`,
        `${typeName}.${property.name} (${property.type}) — déclaré par le miroir iOS ` +
          `(${relativeToRepo(mirror.file)}) et porté par AUCUN des événements qui routent ce type ` +
          `(${[...events].sort().join(', ')}). La propriété se décode toujours en \`nil\` : la branche ` +
          "qui la lit ne s'exécute jamais, et rien ne rougit.",
      );
    }
  }
  return dead;
};

describe("ce que le miroir SWIFT DÉCLARE et que le contrat ne porte nulle part", () => {
  it('balaie un nombre plausible de types de fil — un balayage vide ne rougit jamais tout seul', () => {
    const wireTypes = [...eventsByType().keys()]
      .map((name) => swift.resolveType(name))
      .filter((mirror) => mirror !== undefined && mirror.file.includes('/Sockets/'));
    expect(wireTypes.length).toBeGreaterThanOrEqual(90);
  });

  it('aucun champ du miroir de FIL ne manque au contrat — hors inventaire', () => {
    const report = [...deadFields()]
      .filter(([key]) => !DIVERGENCES_CONNUES.has(key))
      .map(([, message]) => message)
      .sort();
    expect(report, `\n${report.join('\n')}\n`).toEqual([]);
  });

  /** Le second sens du cliquet : une entrée réparée doit SORTIR de la table. */
  it("chaque entrée de l'inventaire est ENCORE morte", () => {
    const live = deadFields();
    const stale = [...DIVERGENCES_CONNUES.keys()].filter((key) => !live.has(key));
    expect(stale, `réparé(s) — à retirer de l'inventaire : ${stale.join(', ')}`).toEqual([]);
  });

  /**
   * Ce que la garde n'examine pas, RENDU plutôt que raconté : les types dont l'`init(from:)` est
   * écrit à la main peuvent alimenter une propriété depuis une autre clé, ou depuis rien.
   */
  it('énumère les types de fil à décodeur manuel, qu\'elle n\'examine pas', () => {
    const manual = [...eventsByType().keys()]
      .filter((name) => {
        const mirror = swift.resolveType(name);
        return mirror !== undefined && mirror.customDecoder && mirror.file.includes('/Sockets/');
      })
      .sort();
    expect(manual.length, `types de fil à init(from:) manuel : ${manual.join(', ')}`).toBe(15);
  });
});
