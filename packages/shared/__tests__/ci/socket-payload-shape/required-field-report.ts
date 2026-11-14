// packages/shared/__tests__/ci/socket-payload-shape/required-field-report.ts
//
// La COMPOSITION du rapport des gardes de forme — sortie du fichier de test pour
// une seule raison, et elle est mesurée (#18240).
//
// ─── Pourquoi un module, alors que le code tenait dans le `expect` ─────────
//
// Le message d'une garde ne s'évalue QUE sur rouge : il vit dans un `.map()`
// que le chemin vert n'exécute jamais. La garde de forme (#18070) a vécu ainsi
// avec un `REPO` jamais importé — confrontée le 2026-11-14 à une divergence
// injectée, elle rendait `ReferenceError: REPO is not defined` au lieu de
// nommer l'événement, le champ, la classe et les deux fichiers. Elle bloquait
// toujours ; elle n'informait plus. Or nommer la dérive EST la raison d'être
// de cette garde — sans cela, elle renvoie celui qui la subit à la relecture
// manuelle qu'elle existe pour supprimer.
//
//   Ce qui n'est pas exécuté n'est pas vérifié. C'est la leçon de #18069 — un
//   témoin qui CONSTRUIT l'événement saute le décodeur et reste vert — appliquée
//   au texte de la garde plutôt qu'à son sujet.
//
// Ici, la composition est une fonction PURE : un témoin lui donne une fixture
// et lit le texte, sur le chemin VERT. La prochaine interpolation fautive
// rougit chez celui qui l'écrit, pas à la prochaine divergence.
//
// ─── Pourquoi la plateforme est un PARAMÈTRE ──────────────────────────────
//
// Le miroir Kotlin lève `MissingFieldException`, le miroir Swift `keyNotFound` ;
// la DIVERGENCE, elle, est la même — « le miroir exige une clé que le contrat
// ne garantit pas ». Deux rapports jumeaux auraient dérivé, sur la règle même
// que ces gardes défendent (#18121).

import { EVENT_MAPS_TS, REPO } from './mirror-contract';

/** Le symptôme à l'exécution, par miroir : c'est tout ce qui diffère entre les deux plateformes. */
export type MirrorIdentity = {
  readonly platform: string;
  /** Ce qui se passe à la réception d'une charge sans la clé, avec le site qui avale l'erreur. */
  readonly symptom: string;
};

export const KOTLIN_MIRROR: MirrorIdentity = {
  platform: 'Android',
  symptom:
    'Une charge sans cette clé lève `MissingFieldException`, que `SocketInboundRoute.guarded` avale : ' +
    "l'événement n'arrive jamais et rien ne rougit.",
};

export const SWIFT_MIRROR: MirrorIdentity = {
  platform: 'iOS',
  symptom:
    'Une charge sans cette clé fait échouer le décodage par `keyNotFound`, avalé par le `catch` de la route : ' +
    "l'événement n'arrive jamais et rien ne rougit.",
};

export type RequiredFieldFinding = {
  readonly event: string;
  readonly field: string;
  readonly typeName: string;
  readonly mirrorFile: string;
  /** `absent` : la clé n'existe pas au contrat. `optional` : elle existe, mais le contrat la dit facultative. */
  readonly presence: 'absent' | 'optional';
  readonly mirror: MirrorIdentity;
};

/** Un chemin ABSOLU n'aide personne dans un journal de CI ; la racine du dépôt est le repère commun. */
export const relativeToRepo = (file: string): string =>
  file.startsWith(`${REPO}/`) ? file.slice(REPO.length + 1) : file;

export const describeRequiredFieldFinding = (finding: RequiredFieldFinding): string =>
  `${finding.event} — « ${finding.field} » est REQUIS par ${finding.typeName} ` +
  `(${relativeToRepo(finding.mirrorFile)}, miroir ${finding.mirror.platform}) mais ` +
  `${finding.presence === 'optional' ? 'OPTIONNEL' : 'ABSENT'} au contrat (${EVENT_MAPS_TS}). ` +
  finding.mirror.symptom;

export type UnresolvedRoute = {
  readonly file: string;
  readonly reference: string;
  readonly reason: string;
};

export const describeUnresolvedRoute = (route: UnresolvedRoute): string =>
  `${relativeToRepo(route.file)} — ${route.reference} ⇒ ${route.reason}`;

/**
 * Un champ qui porte un OBJET, et ce que le miroir exige DEDANS (#18116).
 *
 * Un champ imbriqué tue la trame exactement comme un champ de premier niveau — le décodeur descend,
 * ne trouve pas la clé, et l'ÉVÉNEMENT ENTIER est perdu. `SocketCommentAddedData.comment` et
 * `ApiNotification.actor` sont des documents complets derrière une seule clé.
 */
export type NestedCarrier = {
  readonly event: string;
  /** La clé du FIL qui porte l'objet. */
  readonly carrierField: string;
  readonly nestedTypeName: string;
  readonly nestedFile: string;
  /** Les clés que le miroir exige DANS l'objet porté. */
  readonly requiredFields: readonly string[];
  /** Ce que le contrat déclare dans cet objet — `undefined` ⇒ rien à confronter. */
  readonly declared: ReadonlyMap<string, boolean> | undefined;
  readonly mirror: MirrorIdentity;
};

export const describeNestedFindings = (carrier: NestedCarrier): readonly string[] => {
  if (!carrier.declared) return [];
  return carrier.requiredFields
    .filter((field) => carrier.declared?.get(field) !== false)
    .map(
      (field) =>
        `${carrier.event} — « ${carrier.carrierField}.${field} » est REQUIS par ` +
        `${carrier.nestedTypeName} (${relativeToRepo(carrier.nestedFile)}, miroir ${carrier.mirror.platform}) ` +
        `mais ${carrier.declared?.has(field) ? 'OPTIONNEL' : 'ABSENT'} dans l'objet que le contrat ` +
        `déclare sous « ${carrier.carrierField} » (${EVENT_MAPS_TS}). ` +
        carrier.mirror.symptom,
    );
};
