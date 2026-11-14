// packages/shared/__tests__/ci/socket-event-platform-parity-gate.test.ts
//
// L'événement que DEUX clients lisent et que le troisième ignore (#18342).
//
// ─── La limite que l'orphan gate s'écrivait ───────────────────────────────
//
// `socket-event-orphan-gate` répond « au moins un client connaît ce nom ».
// C'est ce qu'il faut pour trouver l'orphelin TOTAL, et cela masque par
// CONSTRUCTION l'asymétrie : un événement lu par iOS et Android et ignoré du
// web y est indiscernable d'un événement lu par les trois. #18342 écrivait la
// limite — « elle ne dit rien des événements écoutés par un seul client là où
// trois devraient l'être » — et ce cliquet est ce qui la mesure.
//
// ─── Ce que la mesure dit, au cycle 161 ───────────────────────────────────
//
// 177 événements de `ServerToClientEvents` : 128 cités par les trois clients,
// 32 par deux, 10 par un seul, 7 par aucun (ceux-là sont l'affaire de
// l'orphan gate, et son inventaire les porte).
//
// **Les 29 des 32 qui manquent au WEB ne sont pas 29 défauts**, et il faut le
// dire avant l'inventaire : `apps/web` est le chantier 2.0 qui suit l'interface
// iOS (directive porteur du 2026-09-07), donc « iOS et Android le lisent, le
// web pas encore » y est l'état NORMAL d'une feature non encore portée. Ce
// cliquet ne prétend pas que chacune soit à porter ; il prétend que la liste
// soit CONNUE, qu'elle ne grandisse pas en silence, et qu'un portage la fasse
// RÉTRÉCIR dans le commit qui le livre.
//
// ─── Ce que l'inventaire porte, et ce qu'il ne porte pas ──────────────────
//
// Il porte la MESURE — quelle plateforme ne cite pas ce nom — et une raison
// par FAMILLE, là où la raison vit réellement. Il ne porte AUCUN verdict :
// décider s'il faut écrire le lecteur, retirer l'émission ou retirer la
// déclaration appartient au produit (#18342), et ce n'est pas la même décision
// pour un vocal traduit et pour une sonnerie de Bring.
//
// Le cliquet est à DEUX SENS, comme son voisin : une asymétrie neuve rougit
// chez celui qui l'écrit, et un événement qui gagne son troisième lecteur doit
// SORTIR de l'inventaire — sans quoi la liste se périme en affirmant un retard
// qui a été rattrapé, ce qui est exactement ce qui est arrivé au commentaire de
// `link:message:new` (cycle 161).

import { describe, expect, it } from 'vitest';

import {
  CLIENT_PLATFORMS,
  eventsNamedByClients,
  eventsNamedByPlatform,
  type ClientPlatform,
} from './socket-payload-shape/client-event-readers';
import { readContractPayloads } from './socket-payload-shape/mirror-contract';

/**
 * Les familles d'asymétrie mesurées, avec la raison de la famille. Chaque
 * événement est NOMMÉ : une raison de famille n'autorise pas une liste ouverte.
 */
const ASYMETRIES: readonly {
  readonly absents: readonly ClientPlatform[];
  readonly raison: string;
  readonly events: readonly string[];
}[] = [
  {
    absents: ['web'],
    raison:
      "chantier 2.0 : `apps/web` suit l'interface iOS (directive porteur 2026-09-07) et ces signaux temps réel "
      + "ne sont pas encore portés. Aucun n'est un défaut en soi ; la liste ne doit que rétrécir.",
    events: [
      'audio:transcription-failed',
      'audio:translation-failed',
      'audio:translation-ready',
      'audio:translations-completed',
      'audio:translations-progressive',
      'comment:media-updated',
      'comment:reaction-added',
      'comment:reaction-removed',
      'conversation:deleted',
      'conversation:join-error',
      'conversation:joined',
      'conversation:left',
      'conversation:participant-unbanned',
      'conversation:restored',
      'conversation:stats',
      'e2ee:envelope',
      'heartbeat:ack',
      'location:live-started',
      'location:live-stopped',
      'location:live-updated',
      'mention:created',
      'participant:rights-updated',
      'status:created',
      'status:deleted',
      'status:reacted',
      'status:unreacted',
      'story:translation-updated',
      'translation:failed',
      'user:preferences-reordered',
    ],
  },
  {
    absents: ['android'],
    raison:
      "features dont le miroir Kotlin n'a pas encore sa moitié : la sonnerie de Bring et l'écoute partagée "
      + "(« en train d'écouter »). Le dégel du Kotlin natif (#11570) les rend portables ; aucune issue ne les réclame encore.",
    events: ['bring:ring', 'now-playing:changed', 'now-playing:cleared'],
  },
  {
    absents: ['android', 'ios'],
    raison:
      'surfaces que le WEB SEUL porte aujourd\'hui : la console d\'administration (métriques d\'hôte), '
      + "l'enveloppe d'erreur générique, les deux familles de demande d'ami, la traduction d'un texte "
      + "alternatif et la bibliothèque d'autocollants. Pour plusieurs, le natif a sa propre voie (REST, "
      + 'notification) ; la parité par socket est une question produit, pas une dette mesurée.',
    events: [
      'admin-metrics:sample',
      'community:updated',
      'error',
      'friend-request:accepted',
      'friend-request:new',
      'media:alt-translation-updated',
      'sticker:library-updated',
    ],
  },
  {
    absents: ['web', 'ios'],
    raison:
      "signaux que seul le miroir ANDROID cite : la pièce jointe prête côté SDK Kotlin et le "
      + "réordonnancement des communautés, dont le web persiste la ligne sans écouter l'écho. À instruire "
      + 'avec le lot qui porte ces deux gestes, pas isolément.',
    events: ['attachment:ready', 'user:preferences-community-reordered'],
  },
  {
    absents: ['web', 'android'],
    raison:
      "le Jeu Meeshy est né sur iOS : ses missions sont un écran iOS, et le web comme Android n'en ont "
      + 'pas encore la surface. La parité suivra le portage du Jeu, qui a ses propres issues.',
    events: ['game:missions-updated'],
  },
];

const contract = readContractPayloads();
const perPlatform = eventsNamedByPlatform();

const missingPlatforms = (event: string): readonly ClientPlatform[] =>
  CLIENT_PLATFORMS.filter((platform) => !perPlatform.get(platform)?.has(event));

/** Les asymétries RÉELLES : cité par un ou deux clients, pas par zéro (l'orphan gate) ni par trois. */
const measured = (): ReadonlyMap<string, readonly ClientPlatform[]> =>
  new Map(
    [...contract.keys()]
      .sort()
      .map((event) => [event, missingPlatforms(event)] as const)
      .filter(([, absents]) => absents.length > 0 && absents.length < CLIENT_PLATFORMS.length),
  );

const inventaire = (): ReadonlyMap<string, readonly ClientPlatform[]> =>
  new Map(ASYMETRIES.flatMap((famille) => famille.events.map((event) => [event, famille.absents] as const)));

const memeJeu = (left: readonly ClientPlatform[], right: readonly ClientPlatform[]): boolean =>
  left.length === right.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);

describe("l'événement que deux clients lisent et que le troisième ignore (#18342)", () => {
  it('chaque plateforme CITE des événements — un balayage vide ne rougit jamais tout seul', () => {
    expect(contract.size).toBeGreaterThanOrEqual(150);
    for (const platform of CLIENT_PLATFORMS) {
      const named = [...(perPlatform.get(platform) ?? [])].filter((event) => contract.has(event));
      expect(named.length, `${platform} ne cite presque aucun événement du contrat — le balayage est cassé`).toBeGreaterThanOrEqual(90);
    }
  });

  // La garde STRUCTURELLE : les deux relevés partagent leur balayage, et c'est
  // ce qui empêche l'un de dériver de l'autre. Sans elle, le relevé par
  // plateforme pourrait se tromper sans que l'orphan gate bronche.
  it("le relevé global est exactement l'UNION des relevés par plateforme", () => {
    const union = new Set<string>();
    for (const named of perPlatform.values()) for (const event of named) union.add(event);
    expect([...eventsNamedByClients()].sort()).toEqual([...union].sort());
  });

  it("toute asymétrie mesurée figure à l'inventaire, avec la plateforme qui manque", () => {
    const gelees = inventaire();
    const inattendues = [...measured().entries()]
      .filter(([event, absents]) => {
        const gele = gelees.get(event);
        return gele === undefined || !memeJeu(gele, absents);
      })
      .map(([event, absents]) =>
        `${event} — déclaré par \`ServerToClientEvents\`, cité par ${CLIENT_PLATFORMS.length - absents.length} `
        + `client(s) sur ${CLIENT_PLATFORMS.length} ; manque à : ${absents.join(', ')}. `
        + "Porter le lecteur, ou l'inscrire dans ASYMETRIES avec la raison de sa famille.",
      );

    expect(inattendues, `\n${inattendues.join('\n')}\n`).toEqual([]);
  });

  /** Le second sens : un retard rattrapé doit SORTIR de l'inventaire. */
  it("chaque entrée de l'inventaire est ENCORE en retard", () => {
    const vues = measured();
    const perimees = [...inventaire().entries()]
      .filter(([event, absents]) => !contract.has(event) || !memeJeu(vues.get(event) ?? [], absents))
      .map(([event, absents]) => `${event} (${absents.join(', ')})`);

    expect(
      perimees,
      `lu par ${perimees.length > 1 ? 'ces plateformes' : 'cette plateforme'}, ou retiré du contrat — à sortir de l'inventaire : ${perimees.join(', ')}`,
    ).toEqual([]);
  });

  it('chaque famille porte une raison ÉCRITE, et aucune liste vide', () => {
    for (const famille of ASYMETRIES) {
      expect(famille.raison.length).toBeGreaterThan(80);
      expect(famille.events.length).toBeGreaterThan(0);
      expect(famille.absents.length).toBeGreaterThan(0);
      expect([...famille.events].sort()).toEqual([...famille.events]);
    }
  });
});
