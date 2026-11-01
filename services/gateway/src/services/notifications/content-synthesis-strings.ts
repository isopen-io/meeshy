/**
 * #14309 — les libellés de la SYNTHÈSE d'un contenu, par langue de cadrage.
 * Table pure ; la loi qui les choisit vit dans `content-synthesis.ts`.
 */

import type { NotificationLanguage } from '@meeshy/shared/utils/notification-strings';

export const SYNTHESIS_KINDS = [
  'image', 'gif', 'video', 'audio', 'voice', 'pdf', 'document', 'spreadsheet',
  'presentation', 'text', 'archive', 'contact', 'file',
] as const;
export type SynthesisKind = typeof SYNTHESIS_KINDS[number];

/** Une étiquette qui dépend d'un compte (pages, diapositives, lignes) : avec `{n}`, pour 1, et sans compte connu. */
export type CountedLabel = { readonly many: string; readonly one: string; readonly unknown: string };

export type SynthesisStrings = {
  /** Les sept paliers, du mot unique au long essai. */
  readonly text: readonly [string, string, string, string, string, string, string];
  readonly single: Readonly<Record<SynthesisKind, string | CountedLabel>>;
  /** Le nom court d'une nature, au singulier puis au pluriel — pour les comptes agrégés. */
  readonly noun: Readonly<Record<SynthesisKind, readonly [string, string]>>;
  /** Comment un compte s'écrit devant un nom (`{n}` et `{noun}`). */
  readonly countPhrase: string;
  readonly listSeparator: string;
  readonly location: string;
  readonly link: string;
  readonly invitation: string;
  readonly sticker: string;
};

const counted = (many: string, one: string, unknown: string): CountedLabel => ({ many, one, unknown });

export const SYNTHESIS_STRINGS: Readonly<Record<NotificationLanguage, SynthesisStrings>> = {
  fr: {
    text: ['Petit mot reçu', 'Petit message texte', 'Message texte', 'Long message texte', 'Petit essai texte', 'Essai texte', 'Long essai texte'],
    single: {
      image: 'Image haute définition', gif: 'Image animée', video: 'Vidéo haute définition',
      audio: 'Audio haute définition', voice: 'Vocal haute définition',
      pdf: counted('PDF de {n} pages', 'PDF d’une page', 'Document PDF'),
      document: counted('Document de {n} pages', 'Document d’une page', 'Document'),
      spreadsheet: 'Tableur',
      presentation: counted('Présentation de {n} diapositives', 'Présentation d’une diapositive', 'Présentation'),
      text: counted('Fichier texte de {n} lignes', 'Fichier texte d’une ligne', 'Fichier texte'),
      archive: 'Archive compressée', contact: 'Carte de visite', file: 'Fichier',
    },
    noun: {
      image: ['image', 'images'], gif: ['image animée', 'images animées'], video: ['vidéo', 'vidéos'],
      audio: ['audio', 'audios'], voice: ['vocal', 'vocaux'], pdf: ['PDF', 'PDF'],
      document: ['document', 'documents'], spreadsheet: ['tableur', 'tableurs'],
      presentation: ['présentation', 'présentations'], text: ['fichier texte', 'fichiers texte'],
      archive: ['archive', 'archives'], contact: ['carte de visite', 'cartes de visite'], file: ['fichier', 'fichiers'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Position partagée', link: 'Lien web', invitation: 'Invitation à une conversation', sticker: 'Autocollant',
  },
  en: {
    text: ['One-word message', 'Short text message', 'Text message', 'Long text message', 'Short text essay', 'Text essay', 'Long text essay'],
    single: {
      image: 'High-definition image', gif: 'Animated image', video: 'High-definition video',
      audio: 'High-definition audio', voice: 'High-definition voice message',
      pdf: counted('{n}-page PDF', '1-page PDF', 'PDF document'),
      document: counted('{n}-page document', '1-page document', 'Document'),
      spreadsheet: 'Spreadsheet',
      presentation: counted('{n}-slide presentation', '1-slide presentation', 'Presentation'),
      text: counted('{n}-line text file', '1-line text file', 'Text file'),
      archive: 'Compressed archive', contact: 'Contact card', file: 'File',
    },
    noun: {
      image: ['image', 'images'], gif: ['animated image', 'animated images'], video: ['video', 'videos'],
      audio: ['audio file', 'audio files'], voice: ['voice message', 'voice messages'], pdf: ['PDF', 'PDFs'],
      document: ['document', 'documents'], spreadsheet: ['spreadsheet', 'spreadsheets'],
      presentation: ['presentation', 'presentations'], text: ['text file', 'text files'],
      archive: ['archive', 'archives'], contact: ['contact card', 'contact cards'], file: ['file', 'files'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Shared location', link: 'Web link', invitation: 'Conversation invitation', sticker: 'Sticker',
  },
  es: {
    text: ['Una palabra', 'Mensaje de texto corto', 'Mensaje de texto', 'Mensaje de texto largo', 'Ensayo de texto corto', 'Ensayo de texto', 'Ensayo de texto largo'],
    single: {
      image: 'Imagen en alta definición', gif: 'Imagen animada', video: 'Vídeo en alta definición',
      audio: 'Audio en alta definición', voice: 'Mensaje de voz en alta definición',
      pdf: counted('PDF de {n} páginas', 'PDF de una página', 'Documento PDF'),
      document: counted('Documento de {n} páginas', 'Documento de una página', 'Documento'),
      spreadsheet: 'Hoja de cálculo',
      presentation: counted('Presentación de {n} diapositivas', 'Presentación de una diapositiva', 'Presentación'),
      text: counted('Archivo de texto de {n} líneas', 'Archivo de texto de una línea', 'Archivo de texto'),
      archive: 'Archivo comprimido', contact: 'Tarjeta de contacto', file: 'Archivo',
    },
    noun: {
      image: ['imagen', 'imágenes'], gif: ['imagen animada', 'imágenes animadas'], video: ['vídeo', 'vídeos'],
      audio: ['audio', 'audios'], voice: ['mensaje de voz', 'mensajes de voz'], pdf: ['PDF', 'PDF'],
      document: ['documento', 'documentos'], spreadsheet: ['hoja de cálculo', 'hojas de cálculo'],
      presentation: ['presentación', 'presentaciones'], text: ['archivo de texto', 'archivos de texto'],
      archive: ['archivo comprimido', 'archivos comprimidos'], contact: ['tarjeta de contacto', 'tarjetas de contacto'], file: ['archivo', 'archivos'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Ubicación compartida', link: 'Enlace web', invitation: 'Invitación a una conversación', sticker: 'Sticker',
  },
  pt: {
    text: ['Uma palavra', 'Mensagem de texto curta', 'Mensagem de texto', 'Mensagem de texto longa', 'Ensaio de texto curto', 'Ensaio de texto', 'Ensaio de texto longo'],
    single: {
      image: 'Imagem em alta definição', gif: 'Imagem animada', video: 'Vídeo em alta definição',
      audio: 'Áudio em alta definição', voice: 'Mensagem de voz em alta definição',
      pdf: counted('PDF de {n} páginas', 'PDF de uma página', 'Documento PDF'),
      document: counted('Documento de {n} páginas', 'Documento de uma página', 'Documento'),
      spreadsheet: 'Planilha',
      presentation: counted('Apresentação de {n} slides', 'Apresentação de um slide', 'Apresentação'),
      text: counted('Arquivo de texto de {n} linhas', 'Arquivo de texto de uma linha', 'Arquivo de texto'),
      archive: 'Arquivo compactado', contact: 'Cartão de contato', file: 'Arquivo',
    },
    noun: {
      image: ['imagem', 'imagens'], gif: ['imagem animada', 'imagens animadas'], video: ['vídeo', 'vídeos'],
      audio: ['áudio', 'áudios'], voice: ['mensagem de voz', 'mensagens de voz'], pdf: ['PDF', 'PDFs'],
      document: ['documento', 'documentos'], spreadsheet: ['planilha', 'planilhas'],
      presentation: ['apresentação', 'apresentações'], text: ['arquivo de texto', 'arquivos de texto'],
      archive: ['arquivo compactado', 'arquivos compactados'], contact: ['cartão de contato', 'cartões de contato'], file: ['arquivo', 'arquivos'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Localização compartilhada', link: 'Link da web', invitation: 'Convite para uma conversa', sticker: 'Figurinha',
  },
  de: {
    text: ['Ein Wort', 'Kurze Textnachricht', 'Textnachricht', 'Lange Textnachricht', 'Kurzer Textessay', 'Textessay', 'Langer Textessay'],
    single: {
      image: 'Bild in hoher Auflösung', gif: 'Animiertes Bild', video: 'Video in hoher Auflösung',
      audio: 'Audio in hoher Auflösung', voice: 'Sprachnachricht in hoher Auflösung',
      pdf: counted('PDF mit {n} Seiten', 'PDF mit einer Seite', 'PDF-Dokument'),
      document: counted('Dokument mit {n} Seiten', 'Dokument mit einer Seite', 'Dokument'),
      spreadsheet: 'Tabelle',
      presentation: counted('Präsentation mit {n} Folien', 'Präsentation mit einer Folie', 'Präsentation'),
      text: counted('Textdatei mit {n} Zeilen', 'Textdatei mit einer Zeile', 'Textdatei'),
      archive: 'Komprimiertes Archiv', contact: 'Kontaktkarte', file: 'Datei',
    },
    noun: {
      image: ['Bild', 'Bilder'], gif: ['animiertes Bild', 'animierte Bilder'], video: ['Video', 'Videos'],
      audio: ['Audio', 'Audios'], voice: ['Sprachnachricht', 'Sprachnachrichten'], pdf: ['PDF', 'PDFs'],
      document: ['Dokument', 'Dokumente'], spreadsheet: ['Tabelle', 'Tabellen'],
      presentation: ['Präsentation', 'Präsentationen'], text: ['Textdatei', 'Textdateien'],
      archive: ['Archiv', 'Archive'], contact: ['Kontaktkarte', 'Kontaktkarten'], file: ['Datei', 'Dateien'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Geteilter Standort', link: 'Weblink', invitation: 'Einladung zu einer Unterhaltung', sticker: 'Sticker',
  },
  it: {
    text: ['Una parola', 'Breve messaggio di testo', 'Messaggio di testo', 'Lungo messaggio di testo', 'Breve saggio di testo', 'Saggio di testo', 'Lungo saggio di testo'],
    single: {
      image: 'Immagine ad alta definizione', gif: 'Immagine animata', video: 'Video ad alta definizione',
      audio: 'Audio ad alta definizione', voice: 'Messaggio vocale ad alta definizione',
      pdf: counted('PDF di {n} pagine', 'PDF di una pagina', 'Documento PDF'),
      document: counted('Documento di {n} pagine', 'Documento di una pagina', 'Documento'),
      spreadsheet: 'Foglio di calcolo',
      presentation: counted('Presentazione di {n} diapositive', 'Presentazione di una diapositiva', 'Presentazione'),
      text: counted('File di testo di {n} righe', 'File di testo di una riga', 'File di testo'),
      archive: 'Archivio compresso', contact: 'Biglietto da visita', file: 'File',
    },
    noun: {
      image: ['immagine', 'immagini'], gif: ['immagine animata', 'immagini animate'], video: ['video', 'video'],
      audio: ['audio', 'audio'], voice: ['messaggio vocale', 'messaggi vocali'], pdf: ['PDF', 'PDF'],
      document: ['documento', 'documenti'], spreadsheet: ['foglio di calcolo', 'fogli di calcolo'],
      presentation: ['presentazione', 'presentazioni'], text: ['file di testo', 'file di testo'],
      archive: ['archivio', 'archivi'], contact: ['biglietto da visita', 'biglietti da visita'], file: ['file', 'file'],
    },
    countPhrase: '{n} {noun}', listSeparator: ', ',
    location: 'Posizione condivisa', link: 'Link web', invitation: 'Invito a una conversazione', sticker: 'Sticker',
  },
  ar: {
    text: ['كلمة واحدة', 'رسالة نصية قصيرة', 'رسالة نصية', 'رسالة نصية طويلة', 'مقال نصي قصير', 'مقال نصي', 'مقال نصي طويل'],
    single: {
      image: 'صورة عالية الدقة', gif: 'صورة متحركة', video: 'فيديو عالي الدقة',
      audio: 'ملف صوتي عالي الدقة', voice: 'رسالة صوتية عالية الدقة',
      pdf: counted('ملف PDF من {n} صفحات', 'ملف PDF من صفحة واحدة', 'مستند PDF'),
      document: counted('مستند من {n} صفحات', 'مستند من صفحة واحدة', 'مستند'),
      spreadsheet: 'جدول بيانات',
      presentation: counted('عرض تقديمي من {n} شرائح', 'عرض تقديمي من شريحة واحدة', 'عرض تقديمي'),
      text: counted('ملف نصي من {n} أسطر', 'ملف نصي من سطر واحد', 'ملف نصي'),
      archive: 'أرشيف مضغوط', contact: 'بطاقة اتصال', file: 'ملف',
    },
    noun: {
      image: ['صورة', 'صور'], gif: ['صورة متحركة', 'صور متحركة'], video: ['فيديو', 'فيديوهات'],
      audio: ['ملف صوتي', 'ملفات صوتية'], voice: ['رسالة صوتية', 'رسائل صوتية'], pdf: ['PDF', 'PDF'],
      document: ['مستند', 'مستندات'], spreadsheet: ['جدول بيانات', 'جداول بيانات'],
      presentation: ['عرض تقديمي', 'عروض تقديمية'], text: ['ملف نصي', 'ملفات نصية'],
      archive: ['أرشيف', 'أرشيفات'], contact: ['بطاقة اتصال', 'بطاقات اتصال'], file: ['ملف', 'ملفات'],
    },
    countPhrase: '{n} {noun}', listSeparator: '، ',
    location: 'موقع مُشارك', link: 'رابط ويب', invitation: 'دعوة إلى محادثة', sticker: 'ملصق',
  },
  'zh-Hans': {
    text: ['一个词', '简短文字消息', '文字消息', '长文字消息', '短篇文字', '文字文章', '长篇文字'],
    single: {
      image: '高清图片', gif: '动图', video: '高清视频', audio: '高清音频', voice: '高清语音',
      pdf: counted('{n} 页 PDF', '1 页 PDF', 'PDF 文档'),
      document: counted('{n} 页文档', '1 页文档', '文档'),
      spreadsheet: '电子表格',
      presentation: counted('{n} 张幻灯片的演示文稿', '1 张幻灯片的演示文稿', '演示文稿'),
      text: counted('{n} 行文本文件', '1 行文本文件', '文本文件'),
      archive: '压缩包', contact: '名片', file: '文件',
    },
    noun: {
      image: ['图片', '图片'], gif: ['动图', '动图'], video: ['视频', '视频'], audio: ['音频', '音频'],
      voice: ['语音', '语音'], pdf: ['PDF', 'PDF'], document: ['文档', '文档'], spreadsheet: ['电子表格', '电子表格'],
      presentation: ['演示文稿', '演示文稿'], text: ['文本文件', '文本文件'], archive: ['压缩包', '压缩包'],
      contact: ['名片', '名片'], file: ['文件', '文件'],
    },
    countPhrase: '{noun} ×{n}', listSeparator: '、',
    location: '共享位置', link: '网页链接', invitation: '会话邀请', sticker: '贴纸',
  },
};
