// packages/shared/__tests__/ci/socket-payload-dead-field-gate.test.ts
//
// Le SENS INVERSE de `socket-payload-shape-gate` (#18158, classe de #18124).
//
// ─── Les deux sens, et pourquoi le second est le plus silencieux ───────────
//
// La garde jumelle (#18070) demande : « le miroir EXIGE-t-il plus que le
// contrat ne DÉCLARE ? » Un champ Kotlin non-nullable et sans défaut absent de
// la charge fait lever `MissingFieldException` ; la trame entière tombe, et
// `SocketInboundRoute.guarded` l'avale dans une ligne Timber.
//
// Celle-ci demande l'inverse : « le miroir DÉCLARE-t-il ce que le contrat ne
// porte NULLE PART ? »
//
//   Un champ que le contrat ne déclare nulle part est toujours à son DÉFAUT à
//   l'exécution. `ignoreUnknownKeys = true` laisse passer la trame ; le champ
//   prend `null`, `0` ou `false` ; et la branche qui le lit ne s'exécute
//   jamais — ou pire, écrit ce défaut par-dessus une valeur juste.
//
// L'asymétrie compte : le premier sens PERD l'événement — invisible, mais rien
// n'est écrit. Le second le laisse ARRIVER avec un trou dedans, et le trou a
// l'air d'une donnée. #18157 en est la forme la plus coûteuse : un post à 42
// j'aime recevait `post:liked` et affichait **0**, sur quatre écrans, parce que
// la passerelle sert `likeCount` et que le miroir lisait `likesCount`.
//
// ─── Pourquoi un OUTIL, et pas une relecture ───────────────────────────────
//
// #18124 a été trouvé par un audit adversarial, et l'issue le dit elle-même :
// « personne n'a balayé le dépôt pour “champ déclaré par un miroir et absent du
// contrat” ». La relecture avait vu UN cas ; le balayage en a rendu QUINZE, dont
// deux pannes vivantes que personne ne cherchait. C'est la leçon du cycle 155
// rejouée : une règle en prose ne couvre que ce que son outil exprime.
//
// ─── Le critère, et la seule exception qu'il admet ─────────────────────────
//
// Un champ de miroir SOCKET absent des propriétés déclarées par
// `ServerToClientEvents` pour TOUS les événements qui routent sa classe ⇒ rouge.
//
// « SOCKET » n'est pas décoratif, c'est la frontière du raisonnement. Une classe
// déclarée dans un fichier `*SocketEvent*.kt` n'a qu'un producteur : le fil. Un
// champ qu'il ne sert pas y est donc mort, sans alternative. Une classe PARTAGÉE
// avec le REST — `ApiMessage`, routée par `message:new` et `message:edited` —
// porte légitimement des champs que le fil ne sert pas et que l'API REST
// remplit : `pinnedAt`, `readCount`, `reactionSummary`… Les confondre noierait
// la garde sous treize faux positifs, et un outil qui crie à tort finit
// désarmé.
//
// « pour TOUS les événements » ferme la seconde porte : une classe routée par
// plusieurs événements (`ConversationDeletedSocketEvent` en sert trois) ne doit
// pas rougir pour un champ qu'un seul d'entre eux porte.
//
// ─── L'inventaire est un CLIQUET À DEUX SENS, pas un baseline ──────────────
//
// Douze divergences restent, et aucune ne se corrige sans une décision que ce
// lot n'a pas à prendre (compléter le contrat et ses trois miroirs, ou retirer
// le champ et réécrire son consommateur). Les taire les rendrait invisibles ;
// les laisser rougir rendrait la garde inutile dès le premier jour.
//
// D'où `DIVERGENCES_CONNUES` : chaque entrée porte SON issue et ce que la mesure
// a dit de sa gravité. Et la table est tenue par DEUX assertions opposées —
// aucune divergence hors table, et aucune entrée de la table qui ne diverge
// plus. La seconde est celle qui compte : elle force une divergence réparée à
// SORTIR de l'inventaire, donc empêche la table de devenir le cimetière où l'on
// range ce qu'on ne veut plus voir.
//
// ─── Placement ─────────────────────────────────────────────────────────────
//
// `packages/shared` tourne sur CHAQUE PR ; `android.yml` ne tourne que sur les
// chemins `apps/android/**`. Une divergence introduite par le CONTRAT — un champ
// renommé côté TypeScript — doit rougir chez celui qui l'écrit, pas seulement
// chez celui qui la subit.

import { describe, expect, it } from 'vitest';
import { basename } from 'node:path';
import { EVENT_MAPS_TS, readContract, readKotlin } from './socket-payload-shape/mirror-contract';

/**
 * Un miroir dont le FIL est l'unique producteur. Le test porte sur le nom de
 * FICHIER et non sur celui de la classe : c'est le fichier qui dit d'où vient
 * l'objet, et une classe peut être nommée sans `Socket` (`UnreadUpdateEvent`,
 * `ReactionUpdateEvent`) tout en ne venant que du fil.
 */
const isSocketMirror = (file: string): boolean => /SocketEvent/i.test(basename(file));

type Divergence = {
  readonly className: string;
  readonly field: string;
  readonly events: readonly string[];
};

/**
 * Les divergences CONNUES au 2026-11-14, chacune avec son issue et ce que la
 * mesure a dit de sa gravité. Ce n'est pas un baseline : l'invariant
 * « l'inventaire ne ment pas » rougit sur une entrée qui ne diverge PLUS, donc
 * une correction force sa sortie.
 *
 * Aucune n'est corrigeable sans une décision hors de ce lot : soit compléter le
 * contrat ET ses trois miroirs ET l'émetteur, soit retirer le champ et réécrire
 * son consommateur. #18124 énonce les deux branches et dit pourquoi elles ne
 * s'arbitrent pas de la même façon.
 */
const DIVERGENCES_CONNUES: readonly (Divergence & { readonly issue: string; readonly note: string })[] = [
  {
    className: 'AttachmentReactionUpdateEvent',
    field: 'userId',
    events: ['attachment:reaction-added', 'attachment:reaction-removed'],
    issue: '#18124',
    note: "PANNE VIVANTE — lu par `MessageDeltaApplier.kt:90` : `mine` est toujours faux, la pastille de MA réaction à une pièce jointe ne s'allume jamais. L'émetteur pose `participantId` ; corriger demande de trancher QUELLE identité comparer.",
  },
  {
    className: 'AttachmentUpdatedEvent',
    field: 'url',
    events: ['message:attachment-updated'],
    issue: '#18115',
    note: "non lu — la jumelle Kotlin de cet événement est morte (#18115), et ces trois champs sont ce qui en reste.",
  },
  {
    className: 'AttachmentUpdatedEvent',
    field: 'status',
    events: ['message:attachment-updated'],
    issue: '#18115',
    note: 'non lu — voir ci-dessus.',
  },
  {
    className: 'AttachmentUpdatedEvent',
    field: 'thumbnailUrl',
    events: ['message:attachment-updated'],
    issue: '#18115',
    note: 'non lu — voir ci-dessus.',
  },
];

const kotlin = readKotlin();
const contract = readContract();

/**
 * Les classes de miroir SOCKET effectivement routées, avec l'ensemble des
 * événements qui les routent — la classe est la clé, parce que le critère
 * (« absent pour TOUS ses événements ») se pose sur elle, pas sur une route.
 */
const miroirsRoutes = (() => {
  const grouped = new Map<string, { events: Set<string>; fields: readonly { name: string; kotlinName: string }[]; file: string }>();
  for (const route of kotlin.routes) {
    const klass = kotlin.resolveClass(route.className);
    if (!route.event || !route.className || !klass) continue;
    /* Un sérialiseur de classe décide lui-même de ses clés : la liste des paramètres ne dit rien. */
    if (klass.customSerializer) continue;
    if (!isSocketMirror(klass.file)) continue;
    if (!contract.has(route.event)) continue;
    const entry = grouped.get(route.className) ?? { events: new Set<string>(), fields: klass.fields, file: klass.file };
    entry.events.add(route.event);
    grouped.set(route.className, entry);
  }
  return grouped;
})();

const divergences = (): readonly (Divergence & { readonly file: string })[] => {
  const found: (Divergence & { readonly file: string })[] = [];
  for (const [className, entry] of miroirsRoutes) {
    const events = [...entry.events].sort();
    for (const field of entry.fields) {
      const serviNullePart = events.every(
        (event) => !(contract.get(event) ?? []).some((declared) => declared.name === field.name),
      );
      if (serviNullePart) found.push({ className, field: field.kotlinName, events, file: entry.file });
    }
  }
  return found;
};

const cle = (d: Divergence): string => `${d.className}.${d.field}`;

describe('la FORME des charges socket — ce que le miroir DÉCLARE, ce que le contrat ne PORTE PAS (#18158)', () => {
  it('balaie des miroirs socket, et pas zéro — une déduction qui se vide ne rougit jamais toute seule', () => {
    expect(miroirsRoutes.size).toBeGreaterThanOrEqual(30);
    expect([...miroirsRoutes.values()].every((entry) => entry.fields.length > 0)).toBe(true);
  });

  it('ne déclare aucun champ que le contrat ne porte nulle part, hors inventaire', () => {
    const connues = new Set(DIVERGENCES_CONNUES.map(cle));
    const nouvelles = divergences().filter((d) => !connues.has(cle(d)));
    expect(
      nouvelles.map(
        (d) =>
          `${d.className}.${d.field} — déclaré par ${d.file.replace(/.*apps\//, 'apps/')}, ` +
          `absent de ${EVENT_MAPS_TS} pour ${d.events.join(', ')} : ` +
          'le champ restera à son défaut (`null` / `0` / `false`) à chaque trame, en silence.',
      ),
    ).toEqual([]);
  });

  it("l'inventaire ne ment pas : une divergence réparée doit en SORTIR", () => {
    const vivantes = new Set(divergences().map(cle));
    const perimees = DIVERGENCES_CONNUES.filter((d) => !vivantes.has(cle(d)));
    expect(
      perimees.map(
        (d) => `${cle(d)} (${d.issue}) ne diverge plus — retirer son entrée de DIVERGENCES_CONNUES.`,
      ),
    ).toEqual([]);
  });

  it('inventorie chaque divergence connue avec son issue, et aucune sans', () => {
    expect(DIVERGENCES_CONNUES.filter((d) => !/^#\d+$/.test(d.issue)).map(cle)).toEqual([]);
    expect(DIVERGENCES_CONNUES.filter((d) => d.note.trim().length < 20).map(cle)).toEqual([]);
  });
});
