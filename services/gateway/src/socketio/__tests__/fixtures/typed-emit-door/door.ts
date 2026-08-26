// Fixture du balayage — les trois formes JUSTES ne doivent PAS être signalées :
// la dérivation par union de tuples, la méthode générique sur le nom, et le
// paramètre déjà typé `ServerEventName`.
type ServerEventName = 'message:new' | 'message:edited';
type Payload = { id: string };
type ServerEmitArgs = [event: ServerEventName, payload: Payload];

export interface TypedTarget {
  emit(...args: ServerEmitArgs): unknown;
}

export interface GenericTarget {
  emit<E extends ServerEventName>(event: E, payload: Payload): unknown;
}

export interface NamedTarget {
  emit(event: ServerEventName, payload: Payload): unknown;
}
