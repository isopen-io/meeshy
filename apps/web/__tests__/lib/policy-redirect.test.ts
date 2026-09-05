import nextConfig from '../../next.config';

/**
 * `/policy` n'a jamais existé, et la fiche App Store de la 1.0.5 — FIGÉE après
 * publication — y pointe encore (#3539).
 *
 * **La destination est `/terms`.** Le premier correctif visait `/privacy`, en
 * lisant « policy » comme « politique de confidentialité » — ce que le français
 * rend plausible, et ce que rien dans le dépôt ne contredisait : aucune
 * métadonnée App Store n'y est versionnée. C'est la page des CONDITIONS que la
 * fiche désigne (correction du porteur, 2026-09-06).
 *
 * Ce témoin épingle donc la destination EXACTE, pas seulement l'existence
 * d'une redirection : envoyer un lecteur vers le mauvais document juridique
 * n'est pas moins faux qu'un 404 — c'est seulement moins visible.
 */
describe('next.config redirects — /policy', () => {
  it('redirige /policy en permanence vers /terms, jamais vers /privacy', async () => {
    const redirects = await nextConfig.redirects!();

    const policyRedirect = redirects.find((redirect) => redirect.source === '/policy');

    expect(policyRedirect).toEqual({
      source: '/policy',
      destination: '/terms',
      permanent: true,
    });
  });
});
