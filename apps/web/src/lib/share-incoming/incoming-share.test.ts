import { describe, expect, test } from 'bun:test';

import { payloadOfIncomingShare, requestOfIncomingShare, type IncomingShare } from './incoming-share';

/**
 * CE QUE LA FEUILLE D'ENVOI REÇOIT D'UN PARTAGE VENU D'UNE AUTRE APP (#8884).
 *
 * Le système remet trois morceaux — des fichiers, un texte, une adresse — et
 * chaque application les range à sa façon : Chrome pose l'adresse dans le
 * texte, Android répète le titre dans le sujet. La feuille, elle, attend UN
 * contenu : des fichiers, ou un texte avec son adresse.
 */
const file = (name: string, type: string): File => new File(['x'], name, { type });

const share = (parts: Partial<IncomingShare> = {}): IncomingShare => ({ files: [], text: '', title: '', url: '', ...parts });

describe('payloadOfIncomingShare — des fichiers, sinon un texte, sinon rien', () => {
  test('des fichiers partent tels quels, dans l’ordre reçu', () => {
    const photo = file('a.jpg', 'image/jpeg');
    const clip = file('b.mp4', 'video/mp4');
    expect(payloadOfIncomingShare(share({ files: [photo, clip], text: 'ignoré' }))).toEqual({ kind: 'files', files: [photo, clip] });
  });

  test('seules les images et les vidéos passent : un autre type venu d’un tiers est écarté, jamais envoyé', () => {
    const photo = file('a.jpg', 'image/jpeg');
    expect(payloadOfIncomingShare(share({ files: [file('x.exe', 'application/x-msdownload'), photo] }))).toEqual({ kind: 'files', files: [photo] });
    expect(payloadOfIncomingShare(share({ files: [file('x.html', 'text/html')], text: 'Salut' }))).toEqual({ kind: 'text', text: 'Salut' });
    expect(payloadOfIncomingShare(share({ files: [file('x.pdf', 'application/pdf')] }))).toBeNull();
  });

  test('un texte simple reste un texte, sans adresse', () => {
    expect(payloadOfIncomingShare(share({ text: 'Rendez-vous à 18 h' }))).toEqual({ kind: 'text', text: 'Rendez-vous à 18 h' });
  });

  test('l’adresse fournie à part voyage avec le texte', () => {
    expect(payloadOfIncomingShare(share({ text: 'À lire', url: 'https://exemple.org/a' }))).toEqual({
      kind: 'text',
      text: 'À lire',
      url: 'https://exemple.org/a',
    });
  });

  test('une adresse noyée dans le texte en sort : elle ne part pas deux fois', () => {
    expect(payloadOfIncomingShare(share({ text: 'À lire https://exemple.org/a' }))).toEqual({
      kind: 'text',
      text: 'À lire',
      url: 'https://exemple.org/a',
    });
  });

  test('une adresse fournie à part et répétée dans le texte n’est gardée qu’une fois', () => {
    expect(payloadOfIncomingShare(share({ text: 'À lire https://exemple.org/a', url: 'https://exemple.org/a' }))).toEqual({
      kind: 'text',
      text: 'À lire',
      url: 'https://exemple.org/a',
    });
  });

  test('une adresse seule donne un texte vide et l’adresse', () => {
    expect(payloadOfIncomingShare(share({ text: 'https://exemple.org/a' }))).toEqual({
      kind: 'text',
      text: '',
      url: 'https://exemple.org/a',
    });
  });

  test('le titre remplace un texte absent, jamais un texte présent', () => {
    expect(payloadOfIncomingShare(share({ title: 'Mon titre' }))).toEqual({ kind: 'text', text: 'Mon titre' });
    expect(payloadOfIncomingShare(share({ title: 'Mon titre', text: 'Mon corps' }))).toEqual({ kind: 'text', text: 'Mon corps' });
  });

  test('un blanc pur n’est rien : pas de feuille pour un partage vide', () => {
    expect(payloadOfIncomingShare(share({ text: '  \n ', title: ' ', url: '' }))).toBeNull();
    expect(payloadOfIncomingShare(share())).toBeNull();
  });

  test('seule une adresse http(s) compte comme lien ; tout autre schéma reste du texte', () => {
    expect(payloadOfIncomingShare(share({ text: 'javascript:alert(1)' }))).toEqual({ kind: 'text', text: 'javascript:alert(1)' });
    expect(payloadOfIncomingShare(share({ text: 'x', url: 'javascript:alert(1)' }))).toEqual({ kind: 'text', text: 'x javascript:alert(1)' });
  });
});

describe('requestOfIncomingShare — la demande faite à la feuille', () => {
  test('toujours en « partager » ; « plus d’options » seulement quand il y a une adresse', () => {
    expect(requestOfIncomingShare(share({ text: 'Bonjour' }))).toEqual({ intent: 'share', payload: { kind: 'text', text: 'Bonjour' } });
    expect(requestOfIncomingShare(share({ text: 'À lire https://exemple.org/a' }))).toEqual({
      intent: 'share',
      payload: { kind: 'text', text: 'À lire', url: 'https://exemple.org/a' },
      moreOptions: { url: 'https://exemple.org/a' },
    });
  });

  test('des fichiers n’ont pas d’adresse à offrir', () => {
    const photo = new File(['x'], 'a.jpg', { type: 'image/jpeg' });
    expect(requestOfIncomingShare(share({ files: [photo] }))).toEqual({ intent: 'share', payload: { kind: 'files', files: [photo] } });
  });

  test('un partage vide ne demande rien', () => {
    expect(requestOfIncomingShare(share())).toBeNull();
  });
});
