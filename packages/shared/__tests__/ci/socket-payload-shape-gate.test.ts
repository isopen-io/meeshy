// packages/shared/__tests__/ci/socket-payload-shape-gate.test.ts
//
// Les NOMS d'événements socket ont trois gardes ; la FORME de leurs charges
// n'en avait aucune (#18070).
//
// ─── D'où vient cette garde ────────────────────────────────────────────────
//
// Le dépôt garde complètement les NOMS : aucun client n'écoute hors contrat
// (`socket-event-name-gate`), la passerelle n'émet que par constante
// (`socket-event-emitter-gate`), l'enum Swift suit le contrat
// (`ios-socket-event-enum-parity`). Mesure du 2026-11-13 : zéro divergence de
// nom sur les trois clients.
//
// La FORME, elle, n'était tenue par rien — et c'est là que vivent les
// divergences coûteuses. Le dépôt les a payées deux fois :
//
//  1. `participant:role-updated` — la passerelle émet `newRole`, Android
//     exigeait `role`. « Aucun changement de rang n'a jamais atteint le
//     trombinoscope Android, et le témoin était vert »
//     (`services/gateway/CLAUDE.md`). Réparé.
//  2. `message:translation` — #18069. Même forme, même silence, mêmes témoins
//     verts : le Prisme Linguistique, principe fondateur du produit, devenait
//     fonction d'un rechargement REST sur Android.
//
// ─── Le mécanisme exact attrapé ────────────────────────────────────────────
//
// Le `Json` injecté côté Android (`sdk-core/.../di/SdkModule.kt`) pose
// `ignoreUnknownKeys = true` : les clés EN TROP sont tolérées — la passerelle
// peut enrichir librement. Mais une clé MANQUANTE pour un champ Kotlin
// non-nullable et sans défaut lève `MissingFieldException`, que
// `SocketInboundRoute.guarded` avale dans une ligne Timber qui ne nomme ni la
// charge ni le message. L'événement n'arrive jamais, et rien ne rougit.
//
//   Le contrat dit ce qui est ÉMIS ; le miroir décide ce qui est EXIGÉ.
//   Rien ne comparait les deux.
//
// ─── Ce que la garde vérifie ───────────────────────────────────────────────
//
// Pour chaque événement serveur→client qu'Android décode : tout champ du
// miroir Kotlin NON-NULLABLE et SANS DÉFAUT — ou marqué `@Required`, que
// kotlinx exige MALGRÉ son défaut — (après `@SerialName`) doit exister
// comme clé du type de charge déclaré par `ServerToClientEvents`, et y être
// NON-OPTIONNEL. Un champ requis absent ⇒ rouge ; un champ requis en face d'un
// `?:` du contrat ⇒ rouge aussi (le contrat déclare alors que la clé peut
// manquer, donc le décodage Kotlin peut lever).
//
// ─── Pourquoi le compilateur TypeScript, et pas une lecture de texte ───────
//
// Le type de charge d'un événement n'est pas toujours une `interface` écrite à
// plat : il y a des alias, des `extends`, des intersections, des unions, et des
// types qui vivent hors de `types/socketio-events/`. Une lecture textuelle
// devrait les suivre — ce serait réécrire un vérificateur de types, et il se
// tromperait. `ts.getPropertiesOfType` les résout tous, et rend d'une UNION
// les seules propriétés COMMUNES : exactement la sémantique voulue ici,
// « ce que la charge porte à COUP SÛR ».
//
// La résolution se fait depuis la racine du dépôt parce que `packages/shared`
// épingle TypeScript 7 (le portage natif), qui n'expose pas l'API JS du
// compilateur. Si aucune des deux n'offre `createProgram`, la garde ÉCHOUE —
// elle ne se saute pas : un agrégateur qui n'a rien exécuté conclurait vert
// par absence d'échec (`tasks/lessons/`).
//
// ─── Les invariants de BALAYAGE, et pourquoi ils sont des assertions ───────
//
// La leçon du cycle 155 : « un gate indexé sur une RELATION ne balaie pas les
// sites qui n'ont pas de relation déclarée ». Cette garde n'a donc AUCUNE table
// à tenir à la main — le couple (événement, classe) se DÉDUIT des sites de
// routage. Mais une déduction peut se vider en silence : un renommage de
// `route(` ou de `SocketInboundRoute.decoding(` rendrait zéro route, et zéro
// route ne rougit jamais. Quatre invariants ferment cette porte, et chacun est
// un `expect` :
//
//   · le balayage rend au moins `MINIMUM_ROUTES` routes ;
//   · toute constante d'événement citée par un site de routage se résout ;
//   · toute classe de charge citée par un site de routage se résout ;
//   · tout événement routé est déclaré dans `ServerToClientEvents`.
//
// ─── Ce que la garde ne couvre PAS (dit à voix haute) ──────────────────────
//
// **Un tiers des événements du contrat, et c'est le trou le plus coûteux.**
// Mesuré le 2026-11-14 : la garde balaie **110 des 176** événements de
// `ServerToClientEvents`. Elle déduit ses couples de TROIS idiomes de routage ;
// le dépôt en a CINQ. Les deux autres — `SocketInboundRoute.raw(…)` et
// `socketManager.on(…)` suivi d'un `decode<T>` réifié — lui sont invisibles, et
// avec eux toute la famille `call:*`, les quatre `viewing:*`,
// `user:preferences-updated`, `talkie:chunk` et `message:starred`.
//
// Les quatre invariants ci-dessous NE PEUVENT PAS voir ce trou : ils vérifient
// que ce qui est balayé se résout, jamais que le balayage atteint tout. Un
// `MINIMUM_ROUTES` ne compte que les routes reconnues. L'extension est #18123.
//
//   Remesurer : comparer les noms rendus par les trois idiomes aux propriétés de
//   `ServerToClientEvents` — c'est ce que fait le script de l'issue.
//
// Que ce trou soit un PIÈGE ARMÉ et non une panne est, lui aussi, mesuré : les
// miroirs des cinq événements les plus exposés (`viewing:*`,
// `conversation:join-error`) ont été relus à la main le 2026-11-14, sans
// divergence vivante. Les ~35 `call:*` n'ont PAS été confrontés.
//
// Les champs IMBRIQUÉS. `SocketPostCreatedData.post`, `SocketCommentAddedData.
// comment` portent des objets entiers dont un seul champ requis tue le document
// de la même façon. Le critère retenu est celui de #18070 — le PREMIER niveau —
// et l'extension est suivie par sa propre issue. De même, une classe à
// sérialiseur de classe (`@Serializable(with = …)`) n'est pas analysable par la
// liste de ses paramètres : c'est le sérialiseur qui décide, et la garde la
// laisse de côté en le DISANT (`classesWithCustomSerializer`).
//
// ─── Placement ─────────────────────────────────────────────────────────────
//
// Même arbitrage que `ios-socket-event-enum-parity.test.ts`, son voisin de
// dossier : `packages/shared` tourne sur CHAQUE PR (`ci.yml`, matrice `test`),
// alors qu'`android.yml` ne tourne que sur les chemins `apps/android/**`. Une
// divergence introduite par le CONTRAT (un champ rendu optionnel côté TS) doit
// rougir chez celui qui l'écrit, pas seulement chez celui qui la subit.

//
// ─── La LECTURE est partagée, la QUESTION ne l'est pas ─────────────────────
//
// L'extraction du Kotlin et la résolution du contrat vivent dans
// `socket-payload-shape/mirror-contract.ts`, parce que la garde jumelle
// (`socket-payload-dead-field-gate`, #18124) pose la question INVERSE sur la
// même lecture. Deux extracteurs auraient dérivé.

import { describe, expect, it } from 'vitest';
import {
  MINIMUM_ROUTES,
  SWEPT_EVENTS_AT_LAST_MEASURE,
  isRequired,
  readContract,
  readKotlin,
} from './socket-payload-shape/mirror-contract';
import {
  KOTLIN_MIRROR,
  describeRequiredFieldFinding,
  describeUnresolvedRoute,
} from './socket-payload-shape/required-field-report';

const kotlin = readKotlin();
const contract = readContract();
describe("la FORME des charges socket — ce qu'Android EXIGE, ce que le contrat DÉCLARE (#18070)", () => {
  it('balaie un nombre plausible de routes — une table déduite qui se vide ne rougit jamais toute seule', () => {
    expect(kotlin.classCount).toBeGreaterThan(0);
    expect(kotlin.routes.length).toBeGreaterThanOrEqual(MINIMUM_ROUTES);
  });

  /**
   * Un CLIQUET de couverture, pas un plafond : la garde ne voit que trois des cinq idiomes de
   * routage du dépôt (#18123), et ce test est le seul endroit où ce manque est CHIFFRÉ plutôt que
   * raconté. Il rougit si la couverture BAISSE — un idiome renommé, une famille déplacée — et il
   * rougit aussi quand elle MONTE, pour qu'une extension vienne relever le chiffre ici au lieu de
   * laisser la prose vieillir.
   */
  it('confronte toujours autant d\'événements du contrat qu\'à la dernière mesure', () => {
    const sweptEvents = new Set(
      kotlin.routes.map((route) => route.event).filter((event): event is string => event !== undefined && contract.has(event)),
    );
    expect(
      sweptEvents.size,
      `couverture mesurée : ${sweptEvents.size} des ${contract.size} événements du contrat ` +
        `(dernière mesure : ${SWEPT_EVENTS_AT_LAST_MEASURE}). ` +
        'En baisse ⇒ un idiome de routage a changé de forme. ' +
        'En hausse ⇒ relever SWEPT_EVENTS_AT_LAST_MEASURE et le chiffre du doc-comment.',
    ).toBe(SWEPT_EVENTS_AT_LAST_MEASURE);
  });

  it('résout la constante et la classe de charge de CHAQUE site de routage', () => {
    const unresolved = kotlin.routes
      .filter((route) => route.event === undefined || kotlin.resolveClass(route.className) === undefined)
      .map((route) =>
        describeUnresolvedRoute({
          file: route.file,
          reference: `SocketEventNames.${route.constName}`,
          reason:
            route.event === undefined ? 'constante inconnue' : `classe « ${route.className ?? '?'} » non résolue`,
        }),
      );
    expect(unresolved, unresolved.join('\n')).toEqual([]);
  });

  it('ne route que des événements déclarés par `ServerToClientEvents`', () => {
    const undeclared = [
      ...new Set(
        kotlin.routes
          .filter((route) => route.event !== undefined && !contract.has(route.event))
          .map((route) => route.event as string),
      ),
    ];
    expect(undeclared, `hors contrat : ${undeclared.join(', ')}`).toEqual([]);
  });

  it('tout champ REQUIS du miroir Kotlin existe au contrat, et y est REQUIS', () => {
    const divergences = new Map<string, string>();

    for (const route of kotlin.routes) {
      const mirror = kotlin.resolveClass(route.className);
      const declared = route.event === undefined ? undefined : contract.get(route.event);
      if (!mirror || !declared || mirror.customSerializer) continue;

      const byName = new Map(declared.map((field) => [field.name, field] as const));
      for (const required of mirror.fields.filter(isRequired)) {
        const counterpart = byName.get(required.name);
        if (counterpart && !counterpart.optional) continue;
        divergences.set(
          `${route.event}|${required.name}`,
          describeRequiredFieldFinding({
            event: route.event as string,
            field: required.name,
            typeName: route.className ?? '?',
            mirrorFile: mirror.file,
            presence: counterpart ? 'optional' : 'absent',
            mirror: KOTLIN_MIRROR,
          }),
        );
      }
    }

    const report = [...divergences.values()].sort();
    expect(report, `\n${report.join('\n')}\n`).toEqual([]);
  });
});
