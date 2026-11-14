// packages/shared/__tests__/ci/swift-socket-payload-shape-gate.test.ts
//
// La FORME des charges socket, côté miroir SWIFT (#18121).
//
// ─── Pourquoi une garde de plus ────────────────────────────────────────────
//
// `socket-payload-shape-gate` (#18070) confronte ce que le miroir KOTLIN exige
// à ce que le contrat déclare. Elle a trouvé trois divergences vivantes, dont
// une qui privait Android de toute traduction temps réel (#18069).
//
// Le miroir SWIFT n'était balayé par rien — et la mesure manuelle du même jour
// y a rendu une divergence certaine, avec émetteur vivant : une préférence de
// COMMUNAUTÉ modifiée n'atteint jamais iOS (#18120). La classe de défaut
// traverse les deux plateformes ; seul l'outil était à une seule.
//
//   La règle Swift est le pendant exact de la règle Kotlin : une propriété
//   STOCKÉE, NON-OPTIONNELLE, SANS défaut, dans un type à `init(from:)`
//   SYNTHÉTISÉ, est exigée au décodage. Son absence lève `keyNotFound`, que le
//   `catch` de la route avale. La trame entière est perdue, en silence.
//
// ─── Les DEUX questions, et pourquoi la seconde existe ─────────────────────
//
// 1. **Le miroir exige-t-il plus que le contrat ne déclare ?** — la question de
//    #18070, champ par champ, posée ici au Swift.
// 2. **Un aiguillage couvre-t-il toutes les PORTÉES de sa charge ?** — la
//    question que la première ne peut pas poser. `user:preferences-updated`
//    est une UNION à trois portées (conversation, communauté, catégorie) que
//    le client discrimine lui-même ; ses clés COMMUNES restent justes quoi
//    qu'il arrive. C'est précisément pourquoi #18120 a survécu à une
//    confrontation champ par champ : l'aiguillage iOS n'implémente que la
//    moitié de son discriminant, et la portée communauté tombe dans la branche
//    « sinon », qui exige un `category` qu'elle ne porte pas.
//
//    Le contrat sait pourtant combien de portées il déclare — c'est
//    `ContractPayload.variantCount`. Un `.raw` qui décode MOINS de types que sa
//    charge n'a de portées laisse au moins une portée sans branche.
//
// ─── Ce que la garde ne couvre PAS, et qui est ÉNUMÉRÉ ici ─────────────────
//
// Pas raconté dans un doc-comment qui vieillit : rendu par des `expect`, avec
// l'inventaire exact. Trois formes restent hors de portée —
//
//   · les routes `.raw` dont aucune branche ne nomme un type (le décodage se
//     fait ailleurs qu'à un cran de la fermeture) ;
//   · les types à `init(from:)` MANUEL — et un init manuel n'est PAS une preuve
//     de tolérance : c'est par un `try c.decode(APIAuthor.self, forKey:)` manuel
//     que passent les deux pièges armés de #18120 ;
//   · les champs IMBRIQUÉS, par le même critère « premier niveau » que la garde
//     jumelle (#18116).
//
// Les contrats opaques ne sont pas une quatrième forme : mesuré le 2026-11-14,
// aucun des 176 événements de `ServerToClientEvents` n'a de charge `unknown` à
// la racine.
//
// ─── L'inventaire est un cliquet à DEUX SENS ───────────────────────────────
//
// La divergence de #18120 est VIVANTE : une garde rouge ne se fusionne pas, et
// un baseline muet armerait le piège au lieu de le désamorcer (cycle 156). La
// table répond par sa SECONDE assertion — « aucune entrée de la table qui ne
// diverge plus » — qui force une divergence réparée à SORTIR de l'inventaire.
// La table ne peut donc pas devenir le cimetière où l'on range ce qu'on ne veut
// plus voir.

import { describe, expect, it } from 'vitest';

import { readContractPayloads } from './socket-payload-shape/mirror-contract';
import {
  MINIMUM_SWIFT_ROUTES,
  SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE,
  isSwiftRequired,
  readSwift,
} from './socket-payload-shape/swift-mirror';
import {
  SWIFT_MIRROR,
  describeNestedFindings,
  describeRequiredFieldFinding,
  describeUnresolvedRoute,
  relativeToRepo,
} from './socket-payload-shape/required-field-report';

/**
 * Les divergences MESURÉES et non encore réparées, chacune avec son issue.
 *
 * Entrer ici n'excuse rien : la seconde assertion exige que chaque entrée
 * diverge ENCORE. Une entrée réparée fait rougir la garde jusqu'à ce qu'on la
 * retire — c'est ce qui distingue un inventaire d'un baseline.
 */
const INVENTAIRE: ReadonlyMap<string, string> = new Map([
  [
    'user:preferences-updated',
    "#18120 — l'aiguillage `.raw` n'implémente que la moitié de son discriminant : il teste " +
      '`conversationId` et jamais `communityId`, donc la portée COMMUNAUTÉ tombe dans la branche ' +
      "« sinon », qui décode `UserPreferencesUpdatedEvent` — dont `category` est requis et que cette " +
      "portée ne porte pas. Épingler, masquer ou mettre en sourdine une communauté depuis un autre " +
      'appareil ne se propage pas sur iOS.',
  ],
]);

const swift = readSwift();
const contract = readContractPayloads();
const named = swift.routes.filter((route) => route.typeName !== undefined);

describe('la FORME des charges socket — ce qu\'iOS EXIGE, ce que le contrat DÉCLARE (#18121)', () => {
  it('balaie un nombre plausible de routes — une table déduite qui se vide ne rougit jamais toute seule', () => {
    expect(swift.typeCount).toBeGreaterThan(0);
    expect(swift.eventCount).toBeGreaterThan(150);
    expect(swift.routes.length).toBeGreaterThanOrEqual(MINIMUM_SWIFT_ROUTES);
  });

  it('résout le nom d\'événement et le type de charge de CHAQUE site de routage', () => {
    const unresolved = swift.routes
      .filter((route) => route.event === undefined || (route.typeName !== undefined && !swift.resolveType(route.typeName)))
      .map((route) =>
        describeUnresolvedRoute({
          file: route.file,
          reference: `SocketEvent.${route.caseName}`,
          reason:
            route.event === undefined ? 'cas inconnu' : `type « ${route.typeName ?? '?'} » non résolu`,
        }),
      );
    expect(unresolved, unresolved.join('\n')).toEqual([]);
  });

  /**
   * Un nom de type AMBIGU (deux déclarations homonymes dans les sources balayées) rendrait la
   * résolution arbitraire : la garde confronterait un type pour un autre, et conclurait vert ou
   * rouge sans rapport avec le fil. Mesuré le 2026-11-14 : 138 types routés, aucun homonyme.
   */
  it('ne route aucun type dont le nom est AMBIGU', () => {
    const ambiguous = new Set(swift.ambiguousTypeNames);
    const clashing = [...new Set(named.map((route) => route.typeName as string))].filter((name) => ambiguous.has(name));
    expect(clashing, `types routés homonymes : ${clashing.join(', ')}`).toEqual([]);
  });

  it('ne route que des événements déclarés par `ServerToClientEvents`', () => {
    const undeclared = [
      ...new Set(
        swift.routes.filter((route) => route.event !== undefined && !contract.has(route.event)).map((route) => route.event as string),
      ),
    ];
    expect(undeclared, `hors contrat : ${undeclared.join(', ')}`).toEqual([]);
  });

  it("confronte toujours autant d'événements du contrat qu'à la dernière mesure", () => {
    const swept = new Set(
      named.map((route) => route.event).filter((event): event is string => event !== undefined && contract.has(event)),
    );
    expect(
      swept.size,
      `couverture mesurée : ${swept.size} des ${contract.size} événements du contrat ` +
        `(dernière mesure : ${SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE}). ` +
        'En baisse ⇒ un idiome de routage a changé de forme. ' +
        'En hausse ⇒ relever SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE.',
    ).toBe(SWIFT_SWEPT_EVENTS_AT_LAST_MEASURE);
  });

  it('tout champ REQUIS du miroir Swift existe au contrat, et y est REQUIS', () => {
    const divergences = new Map<string, string>();

    for (const route of named) {
      const mirror = swift.resolveType(route.typeName);
      const declared = route.event === undefined ? undefined : contract.get(route.event);
      if (!mirror || !declared || mirror.customDecoder) continue;

      const byName = new Map(declared.fields.map((field) => [field.name, field] as const));
      for (const required of mirror.properties.filter(isSwiftRequired)) {
        const counterpart = byName.get(required.name);
        if (counterpart && !counterpart.optional) continue;
        divergences.set(
          `${route.event}|${required.name}`,
          describeRequiredFieldFinding({
            event: route.event as string,
            field: required.name,
            typeName: route.typeName as string,
            mirrorFile: mirror.file,
            presence: counterpart ? 'optional' : 'absent',
            mirror: SWIFT_MIRROR,
          }),
        );
      }
    }

    const report = [...divergences.values()].sort();
    expect(report, `\n${report.join('\n')}\n`).toEqual([]);
  });

  it('un aiguillage `.raw` couvre toutes les PORTÉES que le contrat déclare — hors inventaire', () => {
    const uncovered = swift.routes
      .filter((route) => route.kind === 'raw' && route.candidates.length > 1)
      .filter((route) => {
        const declared = route.event === undefined ? undefined : contract.get(route.event);
        return declared !== undefined && route.candidates.length < declared.variantCount;
      })
      .filter((route) => !INVENTAIRE.has(route.event as string))
      .map(
        (route) =>
          `${route.event} — ${relativeToRepo(route.file)} décode ${route.candidates.length} type(s) ` +
          `(${route.candidates.join(', ')}) pour une charge à ${contract.get(route.event as string)?.variantCount} ` +
          'portées : au moins une portée tombe dans une branche qui ne la décode pas, et sa trame est perdue en silence.',
      );
    expect(uncovered, uncovered.join('\n')).toEqual([]);
  });

  /**
   * Le SECOND sens du cliquet. Sans lui, l'inventaire devient un baseline : une divergence réparée
   * y resterait pour toujours, et la table cesserait de dire la vérité sur le dépôt.
   */
  it("chaque entrée de l'inventaire diverge ENCORE — une entrée réparée doit en SORTIR", () => {
    const stale = [...INVENTAIRE.keys()].filter((event) => {
      const route = swift.routes.find((candidate) => candidate.event === event && candidate.kind === 'raw');
      const declared = contract.get(event);
      if (!route || !declared) return true;
      return route.candidates.length >= declared.variantCount;
    });
    expect(
      stale,
      `réparé(s) — à retirer de l'inventaire : ${stale.join(', ')}`,
    ).toEqual([]);
  });

  /**
   * Ce qui n'est pas couvert est RENDU, pas raconté : un trou qu'on ne compte pas se referme sur
   * celui qui croit la garde complète. Les deux listes sont figées — les faire bouger demande de
   * regarder ce qui a bougé.
   */
  it('énumère ce qu\'elle ne confronte pas : routes `.raw` sans type nommé, types à décodeur manuel', () => {
    const silentRaw = swift.routes
      .filter((route) => route.kind === 'raw' && route.candidates.length === 0)
      .map((route) => route.event as string)
      .sort();
    const manual = [
      ...new Set(named.filter((route) => swift.resolveType(route.typeName)?.customDecoder).map((route) => route.typeName as string)),
    ].sort();

    expect(silentRaw).toEqual(['auth:session-revoked', 'auth:token-expired', 'heartbeat:ack', 'talkie:chunk']);
    expect(manual.length, `types à init(from:) manuel : ${manual.join(', ')}`).toBe(26);
  });
  /**
   * Le SECOND niveau (#18116). Trois événements de commentaire y rendent la MÊME divergence —
   * `APIPostComment.author`, requis par le miroir Swift et optionnel au contrat : c'est l'un des
   * deux pièges ARMÉS que #18120 nommait, trouvé ici mécaniquement plutôt qu'à la relecture.
   *
   * Pourquoi il n'est pas réparé dans le lot qui le trouve, et c'est une mesure : le miroir ne peut
   * pas être relâché sans chaîne Swift, et le contrat ne peut pas être resserré AVEC PREUVE — son
   * émetteur passe la charge en `hoistCommentTrackingLinks(commentCite) as unknown as typeof comment`,
   * un cast qui retire au compilateur toute capacité de vérifier le resserrement. C'est l'inverse de
   * #18249, où un `tsc` vert sur `shared` ET `gateway` a PROUVÉ que le contrat mentait.
   */
  const IMBRIQUÉS_INVENTORIÉS: ReadonlyMap<string, string> = new Map([
    ['comment:added|comment.author', '#18120 — piège armé : tout émetteur inclut `author` aujourd\'hui (relation Prisma)'],
    ['comment:updated|comment.author', '#18120 — même cause, même type'],
    ['comment:media-updated|comment.author', '#18120 — même cause, même type'],
  ]);

  const imbriqués = (): ReadonlyMap<string, string> => {
    const found = new Map<string, string>();

    for (const route of named) {
      const mirror = swift.resolveType(route.typeName);
      const declared = route.event === undefined ? undefined : contract.get(route.event);
      if (!mirror || !declared || mirror.customDecoder) continue;

      const byName = new Map(declared.fields.map((field) => [field.name, field] as const));
      for (const property of mirror.properties) {
        /* `[T]` se confronte à son ÉLÉMENT ; `?` et `!` ne changent pas ce qui est porté. */
        const carriedName = property.type.replace(/[?!\s]/g, '').replace(/^\[(.+)\]$/, '$1');
        const carried = swift.resolveType(carriedName, route.typeName);
        const counterpart = byName.get(property.name);
        if (!carried || carried.customDecoder || !counterpart?.nested) continue;
        const requiredFields = carried.properties.filter(isSwiftRequired).map((nested) => nested.name);
        const declaredNested = new Map(counterpart.nested.map((nested) => [nested.name, nested.optional] as const));
        for (const field of requiredFields) {
          const [message] = describeNestedFindings({
            event: route.event as string,
            carrierField: property.name,
            nestedTypeName: carriedName,
            nestedFile: carried.file,
            requiredFields: [field],
            declared: declaredNested,
            mirror: SWIFT_MIRROR,
          });
          if (message) found.set(`${route.event}|${property.name}.${field}`, message);
        }
      }
    }
    return found;
  };

  it('tout champ REQUIS dans un objet IMBRIQUÉ existe au contrat, et y est REQUIS — hors inventaire', () => {
    const report = [...imbriqués()]
      .filter(([key]) => !IMBRIQUÉS_INVENTORIÉS.has(key))
      .map(([, message]) => message)
      .sort();
    expect(report, `\n${report.join('\n')}\n`).toEqual([]);
  });

  /** Le second sens du cliquet, pour l'inventaire imbriqué comme pour celui des portées. */
  it("chaque divergence imbriquée inventoriée diverge ENCORE", () => {
    const live = imbriqués();
    const stale = [...IMBRIQUÉS_INVENTORIÉS.keys()].filter((key) => !live.has(key));
    expect(stale, `réparée(s) — à retirer de l'inventaire : ${stale.join(', ')}`).toEqual([]);
  });
});
