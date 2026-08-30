import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * #3877 — « voit l'historique depuis le <date> », sur les TROIS clients.
 *
 * Le critère de fin de l'issue demande une CAPTURE par plateforme. Une capture
 * prouve trois choses et une seule fois : que la section existe, qu'elle est à
 * la même PLACE, et qu'elle n'apparaît qu'à qui a le droit de la voir. Elle ne
 * dit rien du lendemain — et elle n'est pas reproductible en intégration
 * continue (ni simulateur iOS, ni émulateur Android, ni pile vivante).
 *
 * Ce témoin prend le relais sur ce qu'une capture prouvait, et le rend
 * PERMANENT : il lit les trois surfaces à la source et tombe le jour où l'une
 * d'elles s'écarte des deux autres. Ce qu'il ne remplace pas — l'aspect, la
 * lisibilité, la taille des cibles — reste une recette manuelle.
 *
 * Dimension 6 (cohérence de positionnement) : même geste, même place, même
 * règle d'apparition sur les trois plateformes.
 */

const RACINE = join(__dirname, '../../../..');

const lire = (chemin: string): string => readFileSync(join(RACINE, chemin), 'utf8');

const SURFACES = {
  web: lire('apps/web/components/conversations/ParticipantProfileCard.tsx'),
  ios: lire('apps/ios/Meeshy/Features/Main/Views/ParticipantProfileSheet.swift'),
  android: lire(
    'apps/android/feature/chat/src/main/kotlin/me/meeshy/app/chat/ParticipantProfileSheet.kt'
  ),
};

/**
 * La règle d'apparition, une par langage : la section se montre à qui peut
 * ÉCRIRE l'octroi **ou** à qui en voit déjà un — jamais à un membre ordinaire,
 * à qui l'existence même d'un octroi ne regarde pas. C'est un fait de
 * MODÉRATION, et les trois clients le taisent de la même façon.
 */
const REGLE_D_APPARITION: Record<keyof typeof SURFACES, RegExp> = {
  web: /\{\(onSetHistoryGrant \|\| profile\.historyVisibleFrom\) && \(/,
  ios: /if canGrantHistory \|\| profile\.historyVisibleFrom != nil \{/,
  android: /if \(state\.canGrantHistory \|\| state\.historyVisibleFrom != null\) \{/,
};

/** Où commence la section d'octroi, dans chaque source. */
const DEBUT_OCTROI: Record<keyof typeof SURFACES, RegExp> = {
  web: /data-testid="participant-profile-history-grant"/,
  ios: /historyGrantSection\(profile\)/,
  android: /R\.string\.participant_profile_history\b/,
};

/** Où commence la section des CAPACITÉS d'entrée, qui la précède. */
const DEBUT_CAPACITES: Record<keyof typeof SURFACES, RegExp> = {
  web: /\{profile\.entryCapabilities && \(/,
  ios: /capabilitiesSection\(capabilities\)/,
  android: /R\.string\.participant_profile_capabilities\b/,
};

/** Le retrait de l'octroi, offert seulement quand il y a quelque chose à retirer. */
const RETRAIT: Record<keyof typeof SURFACES, RegExp> = {
  web: /data-testid="participant-profile-history-grant-clear"/,
  ios: /accessibilityIdentifier\("participant-profile-history-grant-clear"\)/,
  android: /viewModel::clearHistoryGrant/,
};

/** L'échec de l'écriture, DESSINÉ et non avalé. */
const ERREUR: Record<keyof typeof SURFACES, RegExp> = {
  web: /data-testid="participant-profile-history-grant-error"/,
  ios: /if let historyGrantErrorMessage \{/,
  android: /if \(state\.grantFailed\) \{/,
};

const plateformes = Object.keys(SURFACES) as Array<keyof typeof SURFACES>;

describe('« voit l’historique depuis le <date> » — les trois clients disent la même chose', () => {
  it.each(plateformes)(
    '%s : la section n’apparaît qu’à qui peut écrire l’octroi, ou en voit déjà un',
    (plateforme) => {
      expect(SURFACES[plateforme]).toMatch(REGLE_D_APPARITION[plateforme]);
    }
  );

  it.each(plateformes)('%s : la section suit les capacités d’entrée', (plateforme) => {
    const source = SURFACES[plateforme];
    const capacites = source.search(DEBUT_CAPACITES[plateforme]);
    const octroi = source.search(DEBUT_OCTROI[plateforme]);

    expect(capacites).toBeGreaterThan(-1);
    expect(octroi).toBeGreaterThan(-1);
    expect(octroi).toBeGreaterThan(capacites);
  });

  it.each(['web', 'ios'] as const)(
    '%s : et elle précède le lien d’entrée — Android n’a pas cette section',
    (plateforme) => {
      const source = SURFACES[plateforme];
      const lien = source.search(
        plateforme === 'web' ? /\{profile\.entryLink && \(/ : /entryLinkSection\(link\)/
      );

      expect(lien).toBeGreaterThan(-1);
      expect(source.search(DEBUT_OCTROI[plateforme])).toBeLessThan(lien);
    }
  );

  it.each(plateformes)('%s : le retrait de l’octroi est offert', (plateforme) => {
    expect(SURFACES[plateforme]).toMatch(RETRAIT[plateforme]);
  });

  it.each(plateformes)('%s : l’échec de l’écriture est DESSINÉ', (plateforme) => {
    expect(SURFACES[plateforme]).toMatch(ERREUR[plateforme]);
  });

  it('le balayage LIT bien les trois sources — une garde vide ne garde rien', () => {
    for (const plateforme of plateformes) {
      expect(SURFACES[plateforme].length).toBeGreaterThan(2000);
    }
  });
});

/**
 * #4393 — le geste s'utilise sans voir.
 *
 * Ce que ces témoins gardent est exactement ce qu'une recette au lecteur
 * d'écran a vérifié une fois : le contrôle porte un NOM (un identifiant de test
 * n'en est pas un), l'échec est ANNONCÉ (un texte qui apparaît ne réveille
 * aucun lecteur d'écran tout seul), et la cible se vise.
 */
describe('« voit l’historique depuis le <date> » — s’utilise sans voir', () => {
  const NOM_ACCESSIBLE: Record<keyof typeof SURFACES, RegExp> = {
    // Le libellé voisin est un `<span>`, jamais un `<label for>`.
    web: /aria-label=\{t\('participantProfile\.historyGrant\.label'/,
    // `.labelsHidden()` retire l'étiquette de VoiceOver aussi.
    ios: /\.accessibilityLabel\(seesHistorySinceLabel\)/,
    // Le contrôle Android est un bouton PORTANT son texte : il se nomme seul.
    android: /Text\(stringResource\(R\.string\.participant_profile_history_set\)\)/,
  };

  const ERREUR_ANNONCEE: Record<keyof typeof SURFACES, RegExp> = {
    web: /role="alert"/,
    // SwiftUI n'a pas de région vivante : l'annonce se pose où l'état s'écrit.
    ios: /UIAccessibility\.post\(notification: \.announcement, argument: message\)/,
    android: /liveRegion = LiveRegionMode\.Polite/,
  };

  it.each(plateformes)('%s : le contrôle de date porte un NOM accessible', (plateforme) => {
    expect(SURFACES[plateforme]).toMatch(NOM_ACCESSIBLE[plateforme]);
  });

  it.each(plateformes)('%s : l’échec de l’écriture est ANNONCÉ', (plateforme) => {
    expect(SURFACES[plateforme]).toMatch(ERREUR_ANNONCEE[plateforme]);
  });

  it.each(['web', 'ios'] as const)(
    '%s : le retrait offre une cible de 44 px — Android la tient de Material',
    (plateforme) => {
      // Une cible dessinée à la taille de son glyphe (14 px web, ~20 pt iOS) se
      // rate. Le `TextButton` Android, lui, est déjà à 48 dp par construction :
      // rien à affirmer dans sa source, et l'affirmer serait un faux témoin.
      expect(SURFACES[plateforme]).toMatch(
        plateforme === 'web' ? /h-11 w-11/ : /\.frame\(minWidth: 44, minHeight: 44\)/
      );
    }
  );

  it.each(plateformes)('%s : l’icône du geste reste décorative', (plateforme) => {
    const decorative: Record<keyof typeof SURFACES, RegExp> = {
      web: /<History className="h-3\.5 w-3\.5[^"]*" aria-hidden="true"|<History className="h-3\.5 w-3\.5"/,
      // iOS : un `Image(systemName:)` sans label n'est pas exposé seul.
      ios: /Image\(systemName: "clock\.arrow\.circlepath"\)/,
      android: /contentDescription = null/,
    };
    expect(SURFACES[plateforme]).toMatch(decorative[plateforme]);
  });
});
