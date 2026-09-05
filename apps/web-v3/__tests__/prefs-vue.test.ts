/**
 * @jest-environment node
 */

import { documentDesPrefs, type EtatDesPrefs } from '@/app/connecte/prefs-vue';
import { BASCULES_DE_PREFS, SECTIONS_DE_PREFS, type CleDePreference } from '@/lib/contenu/prefs-de-notif';

/**
 * `app/connecte/prefs-vue.ts` — LA VUE DE `/notifications/preferences`
 * (spécification § 3, § 4 étape 3).
 *
 * CE QUE CES TÉMOINS GARDENT — ce qu'aucun test de la porte n'attraperait :
 *
 *   - les SIX sections de la planche, dans l'ordre ;
 *   - UN CONTRÔLE PAR EFFET : chaque bascule est un `<form method="post">`
 *     SANS `action`, portant `cle` + `valeur` où `valeur` est l'INVERSE de
 *     l'état servi — c'est ce POST qui, sans JavaScript, ferait le geste ;
 *   - les fentes de statut sont SERVIES MÊME VIDES, `hidden` quand muettes ;
 *   - l'état se DIT (`hors-ecran` « Activé »/« Désactivé »), pas seulement la
 *     couleur ;
 *   - la rangée DND affiche la fenêtre comme VALEUR, sans contrôle d'édition.
 */

const REGLAGES_SERVIS = Object.fromEntries(
  BASCULES_DE_PREFS.map((b) => [b.cle, b.cle !== 'reactionEnabled']),
) as Record<CleDePreference, boolean>;

const ETAT_NOMINAL: EtatDesPrefs = {
  reglages: REGLAGES_SERVIS,
  dndStartTime: '22:00',
  dndEndTime: '08:00',
  regleAppliquee: null,
  echec: false,
  tempsReel: null,
};

describe('la vue des réglages de notification', () => {
  it('sert les six sections, dans l’ordre de la planche', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    const rangs = SECTIONS_DE_PREFS.map((section) => html.indexOf(`<h2>${section.titre}</h2>`));

    expect(rangs.every((rang) => rang !== -1)).toBe(true);
    expect([...rangs].sort((a, b) => a - b)).toEqual(rangs);
  });

  it('sert l’en-tête .fil-tete avec un retour vers /notifications', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    expect(html).toContain('<header class="fil-tete">');
    expect(html).toContain('href="/notifications"');
    expect(html).toContain('Notifications');
    expect(html).toContain('Réglages');
  });

  it('rend chaque bascule comme un <form method="post"> sans action, portant cle et l’INVERSE de l’état', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    // pushEnabled est SERVI vrai : le formulaire poste false.
    const zone = html.slice(html.indexOf('name="cle" value="pushEnabled"') - 200, html.indexOf('name="cle" value="pushEnabled"') + 400);
    expect(zone).toContain('<form class="bascule" method="post">');
    expect(zone).not.toMatch(/<form[^>]*action=/);
    expect(zone).toContain('name="valeur" value="false"');

    // reactionEnabled est SERVI faux : le formulaire poste true.
    const zoneReaction = html.slice(
      html.indexOf('name="cle" value="reactionEnabled"') - 200,
      html.indexOf('name="cle" value="reactionEnabled"') + 400,
    );
    expect(zoneReaction).toContain('name="valeur" value="true"');
  });

  it('porte role="switch" et aria-checked reflétant l’état SERVI', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    const zonePush = html.slice(html.indexOf('name="cle" value="pushEnabled"'), html.indexOf('name="cle" value="pushEnabled"') + 400);
    expect(zonePush).toContain('role="switch"');
    expect(zonePush).toContain('aria-checked="true"');

    const zoneReaction = html.slice(html.indexOf('name="cle" value="reactionEnabled"'), html.indexOf('name="cle" value="reactionEnabled"') + 400);
    expect(zoneReaction).toContain('aria-checked="false"');
  });

  it('dit l’état par le texte, pas seulement par la couleur', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    expect(html).toContain('<span class="hors-ecran">Activé</span>');
    expect(html).toContain('<span class="hors-ecran">Désactivé</span>');
  });

  it('sert les fentes de statut MÊME VIDES, cachées quand muettes', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    expect(html).toMatch(/<p class="avis" role="status" hidden>/);
    expect(html).toMatch(/<p class="echec" role="alert" hidden>/);
  });

  it('révèle l’avis de réussite quand une règle vient d’être appliquée', () => {
    const html = documentDesPrefs({ ...ETAT_NOMINAL, regleAppliquee: 'pushEnabled' });

    expect(html).toMatch(/<p class="avis" role="status">/);
    expect(html).not.toMatch(/<p class="avis" role="status" hidden>/);
  });

  it('révèle le bandeau d’échec sur un échec', () => {
    const html = documentDesPrefs({ ...ETAT_NOMINAL, echec: true });

    expect(html).toMatch(/<p class="echec" role="alert">/);
    expect(html).not.toMatch(/<p class="echec" role="alert" hidden>/);
  });

  it('affiche la fenêtre DND comme une VALEUR, sans contrôle d’édition', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    expect(html).toContain('22:00 – 08:00');
    // Aucun <input> de saisie de temps, aucun <select> pour les heures.
    expect(html).not.toContain('type="time"');
  });

  it('sert le module de participation quand le temps réel est fourni', () => {
    const html = documentDesPrefs({
      ...ETAT_NOMINAL,
      tempsReel: { module: 'https://x.test/rt/prefs.abc.js', passerelle: 'https://gate.test' },
    });

    expect(html).toContain('data-participation="prefs"');
    expect(html).toContain('data-module="https://x.test/rt/prefs.abc.js"');
    expect(html).toContain('data-passerelle="https://gate.test"');
  });

  it('ne sert AUCUN module quand le temps réel est absent — le chemin sans JavaScript reste seul', () => {
    const html = documentDesPrefs(ETAT_NOMINAL);

    expect(html).not.toContain('data-participation="prefs"');
  });
});
