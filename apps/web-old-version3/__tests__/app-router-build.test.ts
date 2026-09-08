import {
  inspectAppRouterBuild,
  readEmittedAppRoutes,
} from '../scripts/check-app-router-built.mjs';

describe("le gate sur ce que next build PRODUIT", () => {
  it('voit vide un manifeste où aucune route d\'App Router n\'a été émise', () => {
    expect(inspectAppRouterBuild(readEmittedAppRoutes('{"pages":{}}')).built).toBe(false);
  });

  it("voit vide un manifeste sans clé pages du tout", () => {
    expect(inspectAppRouterBuild(readEmittedAppRoutes('{}')).built).toBe(false);
  });

  it("reconnaît l'App Router dès qu'une route est émise", () => {
    const report = inspectAppRouterBuild(readEmittedAppRoutes('{"pages":{"/healthz/route":[]}}'));

    expect(report.built).toBe(true);
    expect(report.routes).toEqual(['/healthz/route']);
  });

  it("distingue « l'App Router existe » de « l'App Router sert le 404 »", () => {
    const routeOnly = inspectAppRouterBuild(readEmittedAppRoutes('{"pages":{"/healthz/route":[]}}'));
    const withPage = inspectAppRouterBuild(
      readEmittedAppRoutes('{"pages":{"/healthz/route":[],"/_not-found/page":[]}}'),
    );

    expect(routeOnly.servesAppNotFound).toBe(false);
    expect(withPage.servesAppNotFound).toBe(true);
  });
});
