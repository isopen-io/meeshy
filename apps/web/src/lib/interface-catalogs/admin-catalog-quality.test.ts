import { describe, expect, test } from 'bun:test';

import { loadAdminInterfaceCatalog, type AdminInterfaceCatalog } from '@/lib/i18n-admin-catalog';

/**
 * **LES CATALOGUES D'ADMINISTRATION ESPAGNOL ET PORTUGAIS DISENT QUELQUE CHOSE**
 * (#8876, `decisions.md` D-159).
 *
 * La parité des clés et des paramètres (`i18n-admin-catalog.test.ts`) prouve que
 * chaque langue a la MÊME forme ; elle ne prouve pas qu'elle est TRADUITE. Une
 * première passe de traduction a livré, sous ces témoins verts :
 *
 * - des valeurs ANGLAISES recopiées telles quelles (983 en espagnol) ;
 * - des HYBRIDES produits par remplacement de mots (« Close o/a link »,
 *   « Requests sent por {name} »), du français à moitié traduit (« Cette
 *   publicação est introuvable ») ;
 * - des valeurs TRONQUÉES à un mot (« Ligações » pour « Liens de suivi aux plus
 *   de visiteurs distincts », « Conta » pour un titre de section) ;
 * - des PARAMÈTRES traduits (`{tipo}` pour `{type}`, `{de}` pour `{from}`).
 *
 * Chaque témoin ci-dessous a attrapé une de ces formes. Ils sont à PRÉCISION
 * élevée — des mots que ni l'espagnol ni le portugais n'écrivent — pour ne
 * jamais rougir sur un emprunt légitime (Reel, Story, Gateway, Redis, Android,
 * Tablet, WAV…), qu'un test n'a pas à interdire.
 *
 * Le portugais est le portugais du BRÉSIL (D-159) : « você », « tela »,
 * « arquivo », « senha ». Les marques du portugais d'Europe sont interdites, pour
 * qu'une page ne mélange pas « Configurações » et « Definições ».
 */
type Language = 'es' | 'pt';

const LANGUAGES: readonly Language[] = ['es', 'pt'];

const catalogs = async (): Promise<{
  readonly en: AdminInterfaceCatalog;
  readonly fr: AdminInterfaceCatalog;
  readonly translated: Readonly<Record<Language, AdminInterfaceCatalog>>;
}> => ({
  en: await loadAdminInterfaceCatalog('en'),
  fr: await loadAdminInterfaceCatalog('fr'),
  translated: { es: await loadAdminInterfaceCatalog('es'), pt: await loadAdminInterfaceCatalog('pt') },
});

const words = (text: string): readonly string[] =>
  text
    .replace(/\{\w+\}/g, ' ')
    .toLowerCase()
    .split(/[^\p{L}]+/u)
    .filter((word) => word !== '');

const entries = (catalog: AdminInterfaceCatalog): ReadonlyArray<readonly [string, string]> => Object.entries(catalog);

const ENGLISH_ONLY: ReadonlySet<string> = new Set([
  'the', 'of', 'and', 'with', 'from', 'this', 'that', 'will', 'are', 'was', 'were', 'not', 'been', 'have', 'has', 'into',
  'your', 'their', 'these', 'those', 'which', 'when', 'where', 'what', 'whose', 'your', 'only', 'sent', 'last', 'list',
  'loading', 'search', 'delete', 'close', 'reopen', 'reveal', 'requests', 'members', 'guests', 'accounts', 'messages',
]);

const FRENCH_ONLY: ReadonlySet<string> = new Set([
  'des', 'une', 'est', 'sont', 'pour', 'avec', 'dans', 'cette', 'ces', 'aux', 'aussi', 'quand', 'nous', 'vous', 'votre',
  'vos', 'déjà', 'encore', 'rien', 'personne', 'aucune', 'aucun', 'voir', 'retirer', 'supprimer', 'toutes',
]);

/** Les marques du portugais d'EUROPE — le catalogue est en portugais du Brésil. */
const PORTUGAL_ONLY =
  /\b(ecrã|ecrãs|ficheiros?|palavra-passe|utilizadores?|telemóveis|telemóvel|registo|registos|registado|registada|registados|registadas|partilh\w*|gostos|definições|definição|eliminar|eliminad\w*|equipa|secção|secções|contactos?|de momento|pseudónimo|facultativ\w*|detetad\w*|fornecedor|sítio|já não|fotogramas?|quota|câmara|em linha|separador|a guardar|a atualizar|anónim\w*|efémer\w*)\b/i;

describe('aucune valeur n’est une phrase anglaise ou française recopiée', () => {
  for (const language of LANGUAGES) {
    test(`${language} : aucune phrase de trois mots ou plus identique à l’anglais`, async () => {
      const { en, translated } = await catalogs();
      const copied = entries(translated[language])
        .filter(([key, value]) => words(value).length >= 3 && value === en[key as keyof AdminInterfaceCatalog])
        .map(([key]) => key);
      expect({ language, copied }).toEqual({ language, copied: [] });
    });

    test(`${language} : aucun mot que seul l’anglais écrit`, async () => {
      const { translated } = await catalogs();
      const hybrids = entries(translated[language])
        .filter(([, value]) => words(value).some((word) => ENGLISH_ONLY.has(word)))
        .map(([key, value]) => `${key} : ${value}`);
      expect({ language, hybrids }).toEqual({ language, hybrids: [] });
    });

    test(`${language} : aucun mot que seul le français écrit`, async () => {
      const { translated } = await catalogs();
      const hybrids = entries(translated[language])
        .filter(([, value]) => words(value).some((word) => FRENCH_ONLY.has(word)))
        .map(([key, value]) => `${key} : ${value}`);
      expect({ language, hybrids }).toEqual({ language, hybrids: [] });
    });

    test(`${language} : aucune valeur tronquée — un titre d’un mot pour une phrase`, async () => {
      const { en, translated } = await catalogs();
      const truncated = entries(translated[language])
        .filter(([key, value]) => {
          const source = en[key as keyof AdminInterfaceCatalog];
          return words(source).length >= 4 && words(value).length <= 1;
        })
        .map(([key, value]) => `${key} : ${value}`);
      expect({ language, truncated }).toEqual({ language, truncated: [] });
    });
  }
});

/**
 * LA LISTE DES CLÉS QUI S'ÉCRIVENT COMME EN ANGLAIS — et c'est tout. Un emprunt
 * (Reel, Story, Gateway, Android), un sigle (WAV, VP9, kbit/s), un mot commun aux
 * deux langues (No, Normal, Audio, Error, Manual) y est déclaré PAR SA CLÉ ; toute
 * autre valeur identique à l'anglais est une phrase que personne n'a traduite.
 * Ajouter une clé ici est un constat, pas un palliatif : il se justifie dans la
 * revue.
 */
const SAME_AS_ENGLISH: Readonly<Record<Language, ReadonlySet<string>>> = {
  es: new Set([
    'admin.password.level.simple',
    'admin.list.no',
    'admin.value.no',
    'admin.stats.reels',
    'admin.convSettings.banner',
    'admin.audit.field.banner',
    'admin.value.platform.ios',
    'admin.value.platform.android',
    'admin.enum.role.AUDIT',
    'admin.enum.reportedEntity.story',
    'admin.enum.postType.REEL',
    'admin.enum.postType.STORY',
    'admin.enum.trackingTarget.REEL',
    'admin.enum.trackingTarget.STORY',
    'admin.enum.circuitState.CLOSED',
    'admin.posts.tab.STORY',
    'admin.posts.tab.REEL',
    'admin.posts.media.kind.audio',
    'admin.people.media.kind.audio',
    'admin.ranking.limit.option',
    'admin.monitoring.routes.issue',
    'admin.audit.family.roles',
    'admin.people.prefValue.videoResolution.480p',
    'admin.people.prefValue.videoResolution.720p',
    'admin.people.prefValue.videoResolution.1080p',
    'admin.people.prefValue.lineHeight.normal',
    'admin.people.prefValue.kbps',
    'admin.people.prefValue.videoCodec.VP8',
    'admin.people.prefValue.videoCodec.VP9',
    'admin.people.prefValue.videoCodec.H264',
    'admin.people.prefValue.videoCodec.H265',
    'admin.people.prefValue.videoCodec.AV1',
    'admin.people.prefValue.audioFormat.mp3',
    'admin.people.prefValue.audioFormat.wav',
    'admin.people.prefValue.audioFormat.ogg',
    'admin.agentPanel.tracked.col.control',
    'admin.agentPanel.outcome.error',
    'admin.agentPanel.trigger.manual',
  ]),
  pt: new Set([
    'admin.stats.reels',
    'admin.stats.stories',
    'admin.convSettings.banner',
    'admin.audit.field.banner',
    'admin.value.platform.ios',
    'admin.value.platform.android',
    'admin.enum.role.AUDIT',
    'admin.enum.reportType.spam',
    'admin.enum.reportedEntity.story',
    'admin.enum.postType.REEL',
    'admin.enum.postType.STORY',
    'admin.enum.trackingTarget.REEL',
    'admin.enum.trackingTarget.STORY',
    'admin.enum.circuitState.CLOSED',
    'admin.enum.presence.online',
    'admin.dash.system.redis',
    'admin.posts.tab.STORY',
    'admin.posts.tab.REEL',
    'admin.shareLink.list.count',
    'admin.shareLink.col.link',
    'admin.tracking.list.count',
    'admin.tracking.col.link',
    'admin.tracking.device.tablet',
    'admin.ranking.entity.links',
    'admin.ranking.limit.option',
    'admin.monitoring.gateway.title',
    'admin.monitoring.redis.title',
    'admin.monitoring.routes.issue',
    'admin.audit.family.links',
    'admin.people.sort.email',
    'admin.people.prefValue.videoResolution.480p',
    'admin.people.prefValue.videoResolution.720p',
    'admin.people.prefValue.videoResolution.1080p',
    'admin.people.prefValue.lineHeight.normal',
    'admin.people.prefValue.kbps',
    'admin.people.prefValue.videoCodec.VP8',
    'admin.people.prefValue.videoCodec.VP9',
    'admin.people.prefValue.videoCodec.H264',
    'admin.people.prefValue.videoCodec.H265',
    'admin.people.prefValue.videoCodec.AV1',
    'admin.people.prefValue.audioFormat.mp3',
    'admin.people.prefValue.audioFormat.wav',
    'admin.people.prefValue.audioFormat.ogg',
    'admin.agentPanel.trigger.manual',
  ]),
};

describe('une valeur identique à l’anglais est déclarée, clé par clé', () => {
  for (const language of LANGUAGES) {
    test(`${language} : toute valeur qui s’écrit comme en anglais est dans la liste des emprunts`, async () => {
      const { en, translated } = await catalogs();
      const allowed = SAME_AS_ENGLISH[language];
      const undeclared = entries(translated[language])
        .filter(([key, value]) => value === en[key as keyof AdminInterfaceCatalog] && /[A-Za-z]/.test(value.replace(/\{\w+\}/g, '')))
        .map(([key]) => key)
        .filter((key) => !allowed.has(key));
      expect({ language, undeclared }).toEqual({ language, undeclared: [] });
    });

    test(`${language} : la liste des emprunts ne garde aucune clé qui a été traduite depuis`, async () => {
      const { en, translated } = await catalogs();
      const stale = [...SAME_AS_ENGLISH[language]].filter(
        (key) => translated[language][key as keyof AdminInterfaceCatalog] !== en[key as keyof AdminInterfaceCatalog],
      );
      expect({ language, stale }).toEqual({ language, stale: [] });
    });
  }
});

describe('le portugais est celui du Brésil', () => {
  test('aucune marque du portugais d’Europe', async () => {
    const { translated } = await catalogs();
    const europe = entries(translated.pt)
      .filter(([, value]) => PORTUGAL_ONLY.test(value))
      .map(([key, value]) => `${key} : ${value}`);
    expect(europe).toEqual([]);
  });
});
