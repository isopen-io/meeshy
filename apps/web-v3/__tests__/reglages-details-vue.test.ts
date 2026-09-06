/**
 * @jest-environment node
 */

import {
  documentDeLaConfidentialite,
  documentDeLaSuppression,
  documentDeLExport,
  documentDesMessages,
  documentDesReglagesDeDocument,
  documentDuHubMedias,
  documentDuStubMedias,
} from '@/app/connecte/reglages-details-vue';
import { REGLAGES_DETAILS } from '@/lib/contenu/reglages-details';

/**
 * `app/connecte/reglages-details-vue.ts` — LES VUES DES QUATRE
 * RÉGLAGES-DÉTAILS. Ce qu'aucun témoin de porte n'attraperait : le rendu
 * exact des sections, l'ABSENCE des deux bascules non exposées, l'ABSENCE de
 * tout contrôle sur les écrans en régime 3.
 */

describe('/settings/privacy', () => {
  const ETAT_NOMINAL = {
    reglages: { showOnlineStatus: true, showLastSeen: true, showReadReceipts: true, showTypingIndicator: false },
    regleAppliquee: null,
    echec: false,
  } as const;

  it('rend les QUATRE bascules exposées, dans la section Visibilité', () => {
    const html = documentDeLaConfidentialite(ETAT_NOMINAL);

    expect(html).toContain('name="cle" value="showOnlineStatus"');
    expect(html).toContain('name="cle" value="showLastSeen"');
    expect(html).toContain('name="cle" value="showReadReceipts"');
    expect(html).toContain('name="cle" value="showTypingIndicator"');
  });

  it('NE REND JAMAIS `hideProfileFromSearch` ni `allowContactRequests` — régime 3, § 0', () => {
    const html = documentDeLaConfidentialite(ETAT_NOMINAL);

    expect(html).not.toContain('hideProfileFromSearch');
    expect(html).not.toContain('allowContactRequests');
  });

  it('reflète l’état SERVI dans `aria-checked`, pas un défaut', () => {
    const html = documentDeLaConfidentialite({
      ...ETAT_NOMINAL,
      reglages: { ...ETAT_NOMINAL.reglages, showOnlineStatus: false },
    });
    const zone = html.slice(
      html.indexOf('name="cle" value="showOnlineStatus"'),
      html.indexOf('name="cle" value="showOnlineStatus"') + 400,
    );

    expect(zone).toContain('aria-checked="false"');
  });

  it('rend les rangées Exporter et Supprimer, la seconde en ATTENTION', () => {
    const html = documentDeLaConfidentialite(ETAT_NOMINAL);

    expect(html).toContain('href="/settings/privacy/export"');
    expect(html).toContain('href="/settings/privacy/delete"');
    expect(html).toContain('rangee-attention');
  });

  it('rend les deux liens légaux existants — jamais une route inventée', () => {
    const html = documentDeLaConfidentialite(ETAT_NOMINAL);

    expect(html).toContain('href="/privacy"');
    expect(html).toContain('href="/terms"');
  });

  it('révèle l’avis quand une règle vient d’être appliquée, et le bandeau d’échec sur un échec', () => {
    expect(documentDeLaConfidentialite({ ...ETAT_NOMINAL, regleAppliquee: 'showOnlineStatus' })).toMatch(
      /<p class="avis" role="status">/,
    );
    expect(documentDeLaConfidentialite({ ...ETAT_NOMINAL, echec: true })).toContain(REGLAGES_DETAILS.privacy.echec);
  });
});

describe('/settings/privacy/export', () => {
  it('rend un formulaire de demande quand rien n’est encore fait', () => {
    const html = documentDeLExport({ genre: 'formulaire' });
    expect(html).toContain('<form method="post">');
    expect(html).toContain(REGLAGES_DETAILS.export.bouton);
  });

  it('dessine la panne plutôt qu’une page blanche', () => {
    const html = documentDeLExport({ genre: 'panne' });
    expect(html).toContain(REGLAGES_DETAILS.export.panne);
    expect(html).not.toContain('<form');
  });
});

describe('/settings/privacy/delete', () => {
  it('rend le formulaire (phrase + mot de passe) et l’avertissement d’irréversibilité', () => {
    const html = documentDeLaSuppression({ genre: 'formulaire', avis: null });

    expect(html).toContain('name="confirmationPhrase"');
    expect(html).toContain('name="currentPassword"');
    expect(html).toContain(REGLAGES_DETAILS.suppression.avertissement);
  });

  it('affiche le motif du refus quand il y en a un', () => {
    const html = documentDeLaSuppression({ genre: 'formulaire', avis: REGLAGES_DETAILS.suppression.dejaEnCours });
    expect(html).toContain(REGLAGES_DETAILS.suppression.dejaEnCours);
  });

  it('affiche l’état « demandée » sans reformulaire, une fois la demande envoyée', () => {
    const html = documentDeLaSuppression({ genre: 'demandee' });
    expect(html).toContain(REGLAGES_DETAILS.suppression.demandee);
    expect(html).not.toContain('name="confirmationPhrase"');
  });
});

describe('/settings/media — le hub', () => {
  it('rend les trois rangées-liens, aucun appel n’étant possible sans état', () => {
    const html = documentDuHubMedias();

    expect(html).toContain('href="/settings/media/audio"');
    expect(html).toContain('href="/settings/media/video"');
    expect(html).toContain('href="/settings/media/document"');
  });
});

describe('/settings/media/audio, /settings/media/video — régime 3', () => {
  it.each([REGLAGES_DETAILS.media.audio, REGLAGES_DETAILS.media.video])(
    'ne rend AUCUN contrôle — ni <form>, ni <button>, ni role="switch" (%o)',
    (variante) => {
      const html = documentDuStubMedias(variante);

      expect(html).not.toContain('<form');
      expect(html).not.toContain('<button');
      expect(html).not.toContain('role="switch"');
      // Un `<main>` non vide : un écran blanc n'est pas un état.
      expect(html).toContain(variante.titre);
    },
  );
});

describe('/settings/media/document — l’EFFET observable', () => {
  it('reflète l’état SERVI du commutateur `autoDownloadEnabled`', () => {
    const html = documentDesReglagesDeDocument({ autoDownloadEnabled: true, regleAppliquee: false, echec: false });
    const zone = html.slice(
      html.indexOf('name="cle" value="autoDownloadEnabled"'),
      html.indexOf('name="cle" value="autoDownloadEnabled"') + 400,
    );

    expect(zone).toContain('aria-checked="true"');
  });

  it('révèle l’avis de réussite / le bandeau d’échec', () => {
    expect(documentDesReglagesDeDocument({ autoDownloadEnabled: false, regleAppliquee: true, echec: false })).toContain(
      REGLAGES_DETAILS.document.regle,
    );
    expect(documentDesReglagesDeDocument({ autoDownloadEnabled: false, regleAppliquee: false, echec: true })).toContain(
      REGLAGES_DETAILS.document.echec,
    );
  });
});

describe('/settings/message — régime 3', () => {
  it('rend un état DESSINÉ, aucun contrôle', () => {
    const html = documentDesMessages();

    expect(html).not.toContain('<form');
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<a class="rangee"'); // aucune rangée-LIEN : rien à ouvrir
    expect(html).toContain(REGLAGES_DETAILS.message.titreCarte);
  });
});
