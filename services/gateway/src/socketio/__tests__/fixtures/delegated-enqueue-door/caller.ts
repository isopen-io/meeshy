// Fixture — la forme JUSTE : le transport délègue, et ne touche jamais la file.
// Sans ce second témoin, la seule façon de rendre le cliquet vert serait de
// cesser d'enfiler.
type Params = { conversationId: string; messageId: string };
declare function enqueueForOfflineParticipants(deps: unknown, params: Params): Promise<void>;

export async function enqueueDelegated(deps: unknown, params: Params): Promise<void> {
  await enqueueForOfflineParticipants(deps, params);
}
