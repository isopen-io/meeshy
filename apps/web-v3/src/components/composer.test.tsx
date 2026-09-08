import { describe, expect, test } from 'bun:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { Composer } from './composer';

/**
 * LA CITATION PRÉ-ADRESSÉE DIT SA LANGUE (revue #5695) — `replyTo.excerpt`
 * est servi par le PRISME (`served()`, `routes/thread.tsx`), donc il peut
 * être dans une langue AUTRE que celle du document. Le témoin est écrit sur
 * une langue autre que le français (leçon 261 : un témoin de rang ne se
 * pose jamais sur le rang qui rendrait le même verdict par accident).
 */
describe('Composer — la citation porte la langue dans laquelle elle est SERVIE', () => {
  test('replyTo.language pose lang sur l’extrait', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Do you confirm the mockup?', language: 'en' }} />,
    );
    expect(html).toContain('lang="en"');
    expect(html).toContain('Do you confirm the mockup?');
  });

  test('sans langue servie, aucun lang n’est posé — jamais un « fr » fabriqué', () => {
    const html = renderToStaticMarkup(
      <Composer onSend={() => {}} replyTo={{ author: 'Amina', excerpt: 'Tu valides la maquette ?' }} />,
    );
    expect(html).not.toContain('lang=');
  });

  test('sans citation, aucun bloc de réponse n’est monté', () => {
    const html = renderToStaticMarkup(<Composer onSend={() => {}} />);
    expect(html).not.toContain('data-composer-reply');
  });
});
