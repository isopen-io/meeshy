// packages/shared/__tests__/ci/socket-payload-shape/swift-route-relay.test.ts
//
// Le témoin du TROISIÈME idiome de routage iOS : la route posée par un RELAIS (#19711).
//
// `MessageSocketManager+CallControls.swift` ne pose plus ses routes par `route(.event, T.self)`
// mais par un helper générique qui y délègue — `relayCallControl(.event, T.self) { … }`. La
// lecture ne reconnaissait que le premier nom : six événements d'appel ont quitté la
// confrontation en silence, et seul le compteur de couverture l'a dit. Ce fichier fixe la
// reconnaissance sur des fragments SYNTHÉTIQUES (aucun nom de helper n'est attendu en dur) puis
// sur le vrai SDK.

import { describe, expect, it } from 'vitest';

import { decodingRouteCalls, readSwift, routeRelayHelpers } from './swift-mirror';

const RELAY = `
extension Manager {
    var routes: [SocketInboundRoute] {
        [
            forward(.alphaHappened, AlphaEvent.self) { .alpha($0) },
            forward(.betaHappened, BetaEvent.self) { .beta($0) },
            route(.gammaHappened, GammaEvent.self) { _, value in handle(value) },
        ]
    }

    private func forward<T: Decodable & Sendable>(_ event: SocketEvent, _ type: T.Type, _ wrap: @escaping @Sendable (T) -> Wrapped) -> SocketInboundRoute {
        route(event, type) { _, value in Channel.events.send(wrap(value)) }
    }
}
`;

const LOOKALIKE = `
extension Manager {
    func announce() {
        emitTyped(.deltaHappened, DeltaEvent.self)
    }

    private func emitTyped<T: Encodable>(_ event: SocketEvent, _ type: T.Type) {
        socket.emit(event, type)
    }
}
`;

const pairs = (calls: ReturnType<typeof decodingRouteCalls>) => calls.map((call) => `${call.caseName}:${call.typeName}`);

describe('la lecture Swift reconnaît une route posée par un RELAIS (#19711)', () => {
  it("reconnaît un helper `func NOM<…>(_ : SocketEvent, _ : T.Type …)` qui délègue à `route(`", () => {
    expect(routeRelayHelpers([RELAY])).toEqual(['forward']);
  });

  it('traite les appels du relais comme des routes décodées, à côté des `route(` directs', () => {
    expect(pairs(decodingRouteCalls(RELAY, routeRelayHelpers([RELAY])))).toEqual([
      'alphaHappened:AlphaEvent',
      'betaHappened:BetaEvent',
      'gammaHappened:GammaEvent',
    ]);
  });

  it('ne prend pas pour relais un helper de même signature qui ne délègue PAS à `route(`', () => {
    expect(routeRelayHelpers([LOOKALIKE])).toEqual([]);
    expect(pairs(decodingRouteCalls(LOOKALIKE, routeRelayHelpers([LOOKALIKE])))).toEqual([]);
  });

  it("confronte les six événements d'appel que le SDK pose par relais", () => {
    const routed = new Set(
      readSwift()
        .routes.filter((route) => route.kind === 'decoding')
        .map((route) => `${route.event}:${route.typeName}`),
    );
    expect(
      [
        'call:participant-invited:CallParticipantInvitedEvent',
        'call:invite-declined:CallInviteSettledEvent',
        'call:invite-expired:CallInviteSettledEvent',
        'call:muted-by-moderator:CallMutedByModeratorEvent',
        'call:reaction-received:CallReactionReceivedEvent',
        'call:conversation-changed:CallConversationChangedEvent',
      ].filter((expected) => !routed.has(expected)),
    ).toEqual([]);
  });
});
