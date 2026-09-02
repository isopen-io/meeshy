/**
 * @jest-environment node
 */

import { GET, POST } from '@/app/(public)/chat/[lien]/route';
import { CHOIX } from '@/app/(public)/chat/[lien]/choix-vue';
import { PROVENANCE } from '@/app/provenance';
import { nomDuCookie } from '@/lib/api/guest-session';
import { RAISONS_DE_FERMETURE } from '@/lib/api/invite';
import { FIL as COPIE } from '@/lib/contenu/fil';

import {
  avecPasserelle,
  BATTEMENT,
  chemins,
  contexte,
  CONVERSATION,
  JONCTION,
  LIEN,
  lienDeTest,
  MESSAGE_LU,
  passerelleCouplee,
  RECONNAISSANCE,
  refus,
  requete,
} from './lib/porte-du-lien';

/**
 * `/chat/:lien`, second volet — CE QUE LE LECTEUR DÉTIENT, ET D'OÙ VIENT LA
 * REQUÊTE (revue croisée de #4522, 2026-09-02). Le premier volet
 * (`chat-lien.test.ts`) joue les trois états ; celui-ci joue ce qui les
 * précède : l'aperçu qui refuse avant d'avoir regardé le cookie, le formulaire
 * posté deux fois, le préchargement qui joindrait, le formulaire venu
 * d'ailleurs, et le lien clos que rien ne décrit.
 */

describe('ce que le lecteur DÉTIENT tranche avant l’aperçu', () => {
  const cookie = `${nomDuCookie(LIEN)}=S1`;

  it('sert le fil au DERNIER admis d’un lien plein — la place reconnue, le battement décide, la liste dit pourquoi elle se ferme', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ maxUses: 13, currentUses: 13 })), async (appels) => {
      const reponse = await GET(new Request('https://meeshy.me/chat/lagos-q1?bienvenue=1', { headers: { cookie } }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(200);
      expect(html).not.toContain('<dialog class="feuille"');
      expect(html).toContain('data-porte="invite"');
      expect(html).toContain(`data-lien="${LIEN}"`);
      expect(html).toContain('<details class="bandeau bien" open>');
      // La liste refuse 403 SHARE_LINK_MAX_USES au dernier admis (`messages-list.ts:275-277`) : le composeur le DIT,
      // et aucune carte « aucun message » ne prétend que le fil est vide.
      expect(html).toContain('class="composeur ferme"');
      expect(html).toContain(RAISONS_DE_FERMETURE.SHARE_LINK_MAX_USES);
      expect(html).not.toContain(COPIE.vide);
      expect(reponse.headers.get('set-cookie')).toBeNull();
      expect(chemins(appels)).toEqual([
        'GET /api/v1/anonymous/link/lagos-q1',
        `GET ${RECONNAISSANCE}`,
        `PATCH ${BATTEMENT}`,
        `GET /api/v1/conversations/${CONVERSATION}`,
        `GET /api/v1/conversations/${CONVERSATION}/messages`,
      ]);
      expect(appels.find((a) => a.chemin === RECONNAISSANCE)?.entetes['x-session-token']).toBe('S1');
    });
  });

  /**
   * ÉTAT G AU RECHARGEMENT — « contenu conservé » (§ 6.3 G). Un battement 410
   * ferme le COMPOSEUR, pas la LECTURE : la liste ne lit pas `isActive`
   * (`messages-list.ts`, gagé par `messages-routes.test.ts:854-885`) et sert
   * une place active d'un lien fermé. Mesuré avant : 0 ligne servie, « Entré
   * comme  · anonyme », et quatre droits REFUSÉS que rien n'avait relus. La
   * reconnaissance NOMME l'occupant (`currentUser`, `retrieval.ts:248-262`) ;
   * le battement 410 ne sert aucun droit — aucun verdict n'est rendu.
   */
  it('garde la lecture — la liste est relue, les lignes restent — et ferme le composeur avec sa raison quand le lien est fermé par son auteur PENDANT la lecture (état G)', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ actif: false })), async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(200);
      // Jamais la MODALE du choix ; la palette de réactions, elle, vit dans un `<template>` du gabarit.
      expect(html).not.toContain('<dialog class="feuille"');
      expect(html).toContain('class="composeur ferme"');
      expect(html).toContain(RAISONS_DE_FERMETURE.LINK_DEACTIVATED);
      expect(html).not.toContain(COPIE.vide);
      expect(html).toContain(`id="m-${MESSAGE_LU.id}"`);
      expect(html).toContain('Entré comme Tolu · anonyme');
      expect(html).toContain('data-moi="p-tolu"');
      expect(html).not.toContain('data-droit=');
      expect(html).not.toContain('Bienvenue');
      expect(reponse.headers.get('set-cookie')).toBeNull();
      // L'aperçu a refusé ; la place est reconnue (et nommée) ; le battement ferme le composeur ; la liste est LUE avec la session ;
      // ce qui est affiché est DIT (`accuseCeQuiEstServi`) — la lecture reste une lecture.
      expect(chemins(appels)).toEqual([
        'GET /api/v1/anonymous/link/lagos-q1',
        `GET ${RECONNAISSANCE}`,
        `PATCH ${BATTEMENT}`,
        `GET /api/v1/conversations/${CONVERSATION}`,
        `GET /api/v1/conversations/${CONVERSATION}/messages`,
        `POST /api/v1/conversations/${CONVERSATION}/receipts`,
      ]);
      expect(appels.find((a) => a.chemin.endsWith('/messages'))?.entetes['x-session-token']).toBe('S1');
    });
  });

  it('quand le lien est échu PENDANT la lecture, c’est la LISTE qui ferme (403 SHARE_LINK_EXPIRED) — même raison, aucune carte « aucun message », aucun verdict', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ expireA: new Date(Date.now() - 60_000).toISOString() })), async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(200);
      expect(html).not.toContain('<dialog class="feuille"');
      expect(html).toContain('class="composeur ferme"');
      expect(html).toContain(RAISONS_DE_FERMETURE.LINK_EXPIRED);
      expect(html).not.toContain(COPIE.vide);
      expect(html).not.toContain('data-droit=');
      expect(reponse.headers.get('set-cookie')).toBeNull();
      expect(chemins(appels)).toEqual([
        'GET /api/v1/anonymous/link/lagos-q1',
        `GET ${RECONNAISSANCE}`,
        `PATCH ${BATTEMENT}`,
        `GET /api/v1/conversations/${CONVERSATION}`,
        `GET /api/v1/conversations/${CONVERSATION}/messages`,
      ]);
    });
  });

  it('rend la modale CLOSE à qui tient une place sur un AUTRE lien — sans battement, sans rien effacer', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ actif: false, placeDuLien: false })), async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(410);
      expect(html).toContain('<dialog');
      expect(html).toContain(RAISONS_DE_FERMETURE.LINK_INACTIVE);
      expect(reponse.headers.get('set-cookie')).toBeNull();
      expect(chemins(appels)).toEqual(['GET /api/v1/anonymous/link/lagos-q1', `GET ${RECONNAISSANCE}`]);
    });
  });

  it('rend la modale CLOSE, sans reconnaissance, à qui ne porte aucun cookie invité', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ maxUses: 12 })), async (appels) => {
      const reponse = await GET(requete({ cookie: 'meeshy_session=x' }), contexte);
      expect(reponse.status).toBe(410);
      expect(await reponse.text()).toContain('<dialog');
      expect(chemins(appels)).toEqual(['GET /api/v1/anonymous/link/lagos-q1']);
    });
  });

  it('présente CHAQUE jeton invité porté, et retient celui que la passerelle reconnaît', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ actif: false })), async (appels) => {
      const reponse = await GET(requete({ cookie: `meeshy_guest_mshy_autre=S9; ${cookie}` }), contexte);
      expect(reponse.status).toBe(200);
      expect(await reponse.text()).toContain(RAISONS_DE_FERMETURE.LINK_DEACTIVATED);
      expect(appels.filter((a) => a.chemin === RECONNAISSANCE).map((a) => a.entetes['x-session-token'])).toEqual(['S9', 'S1']);
    });
  });

  /**
   * La place meurt ENTRE la reconnaissance et le battement (révocation
   * concurrente) : le 401 de battement est l'état F — le cookie s'efface, et
   * comme l'aperçu a refusé, c'est la modale CLOSE qui reste.
   */
  it('efface la place morte et rend la modale CLOSE sur un 401 de battement après reconnaissance', async () => {
    const couplee = passerelleCouplee(lienDeTest({ actif: false }));
    await avecPasserelle({ ...couplee, [BATTEMENT]: () => refus(401, 'UNAUTHORIZED', 'Session invalide ou expirée') }, async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      expect(reponse.status).toBe(410);
      expect(reponse.headers.get('set-cookie')).toContain(`${nomDuCookie(LIEN)}=; Max-Age=0`);
      expect(await reponse.text()).toContain('<dialog');
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
    });
  });

  it('rend la modale CLOSE, sans battement, à une place RÉVOQUÉE (410 de la reconnaissance)', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ actif: false, placeActive: false })), async (appels) => {
      const reponse = await GET(requete({ cookie }), contexte);
      expect(reponse.status).toBe(410);
      expect(chemins(appels)).toEqual(['GET /api/v1/anonymous/link/lagos-q1', `GET ${RECONNAISSANCE}`]);
    });
  });
});

/**
 * UN FORMULAIRE POSTÉ DEUX FOIS NE PREND QU'UNE PLACE. Double tap en 3G,
 * « renvoyer le formulaire ? » au retour arrière, rechargement de la 303 : le
 * second `pseudo` arrive avec le cookie de la première place. La place est
 * relue, jamais recréée — une seconde ligne `Participant` orpheline
 * consommerait `maxConcurrentUsers` jusqu'au 409 des suivants.
 */
describe('un formulaire posté deux fois ne prend qu’une place', () => {
  const cookie = `${nomDuCookie(LIEN)}=S1`;
  const jonctionAvecCookie = (): Request =>
    new Request('https://meeshy.me/chat/lagos-q1', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', cookie },
      body: new URLSearchParams({ pseudo: 'Tolu', langue: 'fr' }),
    });

  it('renvoie vers le fil sans rejoindre quand la place tient — 303, aucun POST /members', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest()), async (appels) => {
      const reponse = await POST(jonctionAvecCookie(), contexte);
      expect(reponse.status).toBe(303);
      expect(reponse.headers.get('location')).toBe('/chat/lagos-q1');
      expect(reponse.headers.get('set-cookie')).toBeNull();
      expect(chemins(appels)).toEqual(['GET /api/v1/anonymous/link/lagos-q1', `PATCH ${BATTEMENT}`]);
    });
  });

  it('renvoie aussi vers le fil quand le lien s’est fermé entre-temps — la place existe, le GET dira l’état G', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ actif: false })), async (appels) => {
      const reponse = await POST(jonctionAvecCookie(), contexte);
      expect(reponse.status).toBe(303);
      expect(reponse.headers.get('location')).toBe('/chat/lagos-q1');
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
    });
  });

  it('rejoint seulement quand la place est MORTE (401) — et la nouvelle place remplace le cookie', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ placeActive: false })), async (appels) => {
      const reponse = await POST(jonctionAvecCookie(), contexte);
      expect(reponse.status).toBe(303);
      expect(reponse.headers.get('location')).toBe('/chat/lagos-q1?bienvenue=1');
      expect(reponse.headers.get('set-cookie')).toBe(`${nomDuCookie(LIEN)}=S2; Path=/chat; SameSite=Lax; Secure`);
      expect(chemins(appels)).toEqual(['GET /api/v1/anonymous/link/lagos-q1', `PATCH ${BATTEMENT}`, `POST ${JONCTION}`]);
    });
  });

  it('ne rejoint pas non plus un lien CLOS dont la place est morte : le cookie s’efface, il reste le compte', async () => {
    const couplee = passerelleCouplee(lienDeTest({ actif: false }));
    await avecPasserelle({ ...couplee, [BATTEMENT]: () => refus(401, 'UNAUTHORIZED', 'Session invalide ou expirée') }, async (appels) => {
      const reponse = await POST(jonctionAvecCookie(), contexte);
      expect(reponse.status).toBe(410);
      expect(reponse.headers.get('set-cookie')).toContain(`${nomDuCookie(LIEN)}=; Max-Age=0`);
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(false);
    });
  });
});

/**
 * LA PROVENANCE (`app/provenance.ts`). Un préchargement ou un prérendu
 * (`Sec-Purpose: prefetch`) joindrait un membre connecté sans qu'il ait rien
 * fait ; un formulaire soumis depuis un autre site poserait une place — et son
 * cookie — dans le navigateur d'une victime.
 */
describe('la provenance de la requête', () => {
  const membre = { cookie: 'meeshy_session=x; meeshy_auth=JWT' };

  it.each([
    ['sec-purpose', 'prefetch'],
    ['sec-purpose', 'prefetch;prerender'],
    ['purpose', 'prefetch'],
    ['x-purpose', 'preview'],
    ['x-moz', 'prefetch'],
  ])('ne joint rien sur un chargement spéculatif (%s: %s) — 503 sans corps, aucun appel', async (nom, valeur) => {
    await avecPasserelle({}, async (appels) => {
      const reponse = await GET(requete({ ...membre, [nom]: valeur }), contexte);
      expect(reponse.status).toBe(503);
      expect(await reponse.text()).toBe('');
      expect(reponse.headers.get('cache-control')).toBe('no-store');
      expect(appels).toEqual([]);
    });
  });

  it.each([
    ['Sec-Fetch-Site: cross-site', { 'sec-fetch-site': 'cross-site', origin: 'https://meeshy.me' }],
    ['une Origin étrangère', { origin: 'https://evil.example' }],
    ['une Origin opaque', { origin: 'null' }],
  ])('refuse 403 un formulaire venu d’ailleurs (%s), sans un appel et sans cookie', async (_, entetes) => {
    await avecPasserelle({}, async (appels) => {
      const reponse = await POST(requete(entetes, 'POST', new URLSearchParams({ pseudo: 'Tolu', langue: 'fr' })), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(403);
      expect(html).toContain(PROVENANCE.titre);
      expect(html).toContain('href="/chat/lagos-q1"');
      expect(reponse.headers.get('set-cookie')).toBeNull();
      expect(appels).toEqual([]);
    });
  });

  it('laisse passer un formulaire de Meeshy — Origin de l’hôte servi, Sec-Fetch-Site: same-origin', async () => {
    await avecPasserelle(passerelleCouplee(lienDeTest({ placeActive: false })), async (appels) => {
      const reponse = await POST(
        requete({ origin: 'https://meeshy.me', 'sec-fetch-site': 'same-origin' }, 'POST', new URLSearchParams({ pseudo: 'Tolu', langue: 'fr' })),
        contexte,
      );
      expect(reponse.status).toBe(303);
      expect(appels.some((a) => a.chemin.endsWith('/members'))).toBe(true);
    });
  });
});

describe('un lien clos avant tout choix', () => {
  it.each(['LINK_INACTIVE', 'LINK_EXPIRED', 'LINK_MAX_USES'])('dit pourquoi (%s) dans la modale et ne propose que le compte', async (code) => {
    await avecPasserelle({ '/api/v1/anonymous/link/lagos-q1': () => refus(410, code, 'refus') }, async () => {
      const reponse = await GET(requete(), contexte);
      const html = await reponse.text();
      expect(reponse.status).toBe(410);
      expect(html).toContain(RAISONS_DE_FERMETURE[code] ?? 'ABSENT');
      expect(html).not.toContain('<form method="post"');
      expect(html).toContain('/signup?returnUrl=');
      expect(html).toContain('/login?returnUrl=');
    });
  });

  /**
   * RIEN D'INVENTÉ (§ 5.1) : la passerelle n'a servi que le code. Ni le
   * segment d'adresse en guise de nom, ni la question binaire (aucune voie
   * anonyme n'existe), ni un accordéon d'exigences que personne n'a servies.
   */
  it('n’invente ni nom, ni question, ni accordéon : le segment n’apparaît nulle part comme un nom', async () => {
    await avecPasserelle({ '/api/v1/anonymous/link/lagos-q1': () => refus(410, 'LINK_INACTIVE', 'refus') }, async () => {
      const html = await (await GET(requete(), contexte)).text();
      expect(html).toContain(`<h2 id="titre-du-choix">${CHOIX.clos.titre}</h2>`);
      expect(html).toContain(`<title>${CHOIX.clos.titre} — Meeshy</title>`);
      expect(html).not.toContain('lagos-q1 — Meeshy');
      expect(html).not.toContain('>lagos-q1<');
      expect(html).not.toContain(CHOIX.titre);
      expect(html).not.toContain(CHOIX.invite);
      expect(html).not.toContain('<details class="droits">');
      expect(html).toContain('<dialog class="feuille fermee"');
      expect(html).toContain(CHOIX.clos.sous);
    });
  });
});
