import { describe, expect, test } from 'bun:test';

import { createPublicationKeyring, publicationFingerprint } from './publication-mutation-key';

const CMID = /^cmid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * LA CLÉ D'UNE PUBLICATION (#10316) — un rejeu du MÊME contenu (retour du
 * réseau, réessai après une annulation qui avait en fait abouti) porte la
 * MÊME clé : la passerelle le reconnaît et ne publie pas deux fois. Un contenu
 * DIFFÉRENT en porte une neuve : il n'est jamais confondu avec l'ancien.
 */
describe('createPublicationKeyring — une clé par contenu, stable au rejeu', () => {
  test('le même contenu rend la même clé, au format que la passerelle valide', () => {
    const keyring = createPublicationKeyring();
    const body = { type: 'STORY', mediaIds: ['pm-1'], storyEffects: { v: 3 } };
    const first = keyring.keyFor(publicationFingerprint(body));
    expect(first).toMatch(CMID);
    expect(keyring.keyFor(publicationFingerprint({ ...body }))).toBe(first);
  });

  test('un contenu retouché rend une clé neuve', () => {
    const keyring = createPublicationKeyring();
    const before = keyring.keyFor(publicationFingerprint({ type: 'POST', content: 'Bonjour' }));
    const after = keyring.keyFor(publicationFingerprint({ type: 'POST', content: 'Bonsoir' }));
    expect(after).not.toBe(before);
  });

  test('deux trousseaux ne partagent rien', () => {
    const body = publicationFingerprint({ type: 'POST', content: 'Bonjour' });
    expect(createPublicationKeyring().keyFor(body)).not.toBe(createPublicationKeyring().keyFor(body));
  });

  test("l'empreinte ne dépend pas de l'ordre des clés", () => {
    expect(publicationFingerprint({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(publicationFingerprint({ b: { d: [1, 2], c: 2 }, a: 1 }));
  });
});
