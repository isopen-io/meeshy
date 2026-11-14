// packages/shared/__tests__/ci/socket-payload-shape/required-field-report.test.ts
//
// Le témoin du MESSAGE des gardes de forme (#18240).
//
// Une garde ne compose son rapport que sur ROUGE : son texte vit dans un
// `.map()` qu'une suite verte n'exécute jamais. `socket-payload-shape-gate` a
// vécu ainsi avec un `REPO` jamais importé — elle bloquait, mais rendait
// `ReferenceError` au lieu de nommer la dérive, c'est-à-dire tout ce qu'elle
// apporte par rapport à un `expect(false)`.
//
// Ce fichier donne à la composition une FIXTURE et lit le texte rendu, sur le
// chemin VERT : la prochaine interpolation fautive rougit chez celui qui
// l'écrit, pas à la prochaine divergence du dépôt.

import { describe, expect, it } from 'vitest';

import {
  KOTLIN_MIRROR,
  SWIFT_MIRROR,
  describeRequiredFieldFinding,
  describeUnresolvedRoute,
  relativeToRepo,
} from './required-field-report';
import { REPO } from './mirror-contract';

describe('le rapport des gardes de forme des charges socket (#18240)', () => {
  it("nomme l'événement, le champ, le type, le fichier du miroir et le contrat", () => {
    const rendered = describeRequiredFieldFinding({
      event: 'message:translation',
      field: 'conversationId',
      typeName: 'TranslationEvent',
      mirrorFile: `${REPO}/apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt`,
      presence: 'absent',
      mirror: KOTLIN_MIRROR,
    });

    expect(rendered).toContain('message:translation');
    expect(rendered).toContain('conversationId');
    expect(rendered).toContain('TranslationEvent');
    expect(rendered).toContain('apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt');
    expect(rendered).toContain('packages/shared/types/socketio-events/event-maps.ts');
    expect(rendered).toContain('ABSENT');
    expect(rendered).toContain('MissingFieldException');
  });

  /**
   * Les deux présences ne décrivent PAS la même panne — « absent du contrat » dit que la clé
   * n'existe nulle part, « optionnel au contrat » que l'émetteur a le droit de l'omettre. Un
   * rapport qui les confondrait enverrait chercher la clé au mauvais endroit.
   */
  it('distingue une clé ABSENTE du contrat d\'une clé seulement OPTIONNELLE', () => {
    const base = {
      event: 'reaction:added',
      field: 'userId',
      typeName: 'ReactionUpdateEvent',
      mirrorFile: `${REPO}/apps/android/core/model/src/main/kotlin/me/meeshy/sdk/model/SocketEvents.kt`,
      mirror: KOTLIN_MIRROR,
    } as const;

    expect(describeRequiredFieldFinding({ ...base, presence: 'optional' })).toContain('OPTIONNEL');
    expect(describeRequiredFieldFinding({ ...base, presence: 'absent' })).toContain('ABSENT');
  });

  /** Le symptôme est ce qui distingue les deux miroirs ; le reste de la phrase leur est commun. */
  it('dit le symptôme du miroir visé, et nomme la plateforme', () => {
    const swift = describeRequiredFieldFinding({
      event: 'user:preferences-updated',
      field: 'category',
      typeName: 'UserPreferencesUpdatedEvent',
      mirrorFile: `${REPO}/packages/MeeshySDK/Sources/MeeshySDK/Sockets/MessageSocketEvents+Conversations.swift`,
      presence: 'absent',
      mirror: SWIFT_MIRROR,
    });

    expect(swift).toContain('iOS');
    expect(swift).toContain('keyNotFound');
    expect(swift).not.toContain('MissingFieldException');
  });

  it('rend les chemins relatifs à la racine du dépôt, et laisse intact ce qui ne lui appartient pas', () => {
    expect(relativeToRepo(`${REPO}/packages/shared/types/post.ts`)).toBe('packages/shared/types/post.ts');
    expect(relativeToRepo('/ailleurs/post.ts')).toBe('/ailleurs/post.ts');
  });

  it('nomme le fichier, la référence et la raison d\'un site de routage non résolu', () => {
    const rendered = describeUnresolvedRoute({
      file: `${REPO}/apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt`,
      reference: 'SocketEventNames.MESSAGE_NEW',
      reason: 'classe « ApiMessage » non résolue',
    });

    expect(rendered).toBe(
      'apps/android/sdk-core/src/main/kotlin/me/meeshy/sdk/socket/MessageSocketManager.kt — ' +
        'SocketEventNames.MESSAGE_NEW ⇒ classe « ApiMessage » non résolue',
    );
  });
});
