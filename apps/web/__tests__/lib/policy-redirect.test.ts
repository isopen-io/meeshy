import nextConfig from '../../next.config';

describe('next.config redirects — /policy', () => {
  it('redirects /policy permanently to /privacy (dead link served by the LIVE 1.0.5 app-info)', async () => {
    const redirects = await nextConfig.redirects!();

    const policyRedirect = redirects.find((redirect) => redirect.source === '/policy');

    expect(policyRedirect).toEqual({
      source: '/policy',
      destination: '/privacy',
      permanent: true,
    });
  });
});
