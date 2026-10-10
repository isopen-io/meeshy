"""
Module de segmentation de texte pour traduction structurée
Préserve les paragraphes, sauts de ligne et emojis dans les traductions
"""

import re
from typing import List, Tuple, Dict
import logging

logger = logging.getLogger(__name__)

# Pattern ULTRA-ROBUSTE pour tous les types d'emojis
# Inclut tous les ranges Unicode emoji + modificateurs + ZWJ sequences
_EMOJI_UNIT = (
    "(?:"
    # Emojis avec modificateurs de peau (skin tone) et ZWJ
    "[\U0001F3FB-\U0001F3FF]|"  # Modificateurs de peau
    "\U0000200D|"  # Zero Width Joiner (ZWJ)
    "\U0000FE0F|"  # Variation Selector-16 (présentation emoji)
    "\U0000FE0E|"  # Variation Selector-15 (présentation texte)
    # Emojis de base
    "[\U0001F600-\U0001F64F]|"  # Emoticons
    "[\U0001F300-\U0001F5FF]|"  # Symbols & Pictographs
    "[\U0001F680-\U0001F6FF]|"  # Transport & Map Symbols
    "[\U0001F700-\U0001F77F]|"  # Alchemical Symbols
    "[\U0001F780-\U0001F7FF]|"  # Geometric Shapes Extended
    "[\U0001F800-\U0001F8FF]|"  # Supplemental Arrows-C
    "[\U0001F900-\U0001F9FF]|"  # Supplemental Symbols and Pictographs
    "[\U0001FA00-\U0001FA6F]|"  # Chess Symbols
    "[\U0001FA70-\U0001FAFF]|"  # Symbols and Pictographs Extended-A
    "[\U00002702-\U000027B0]|"  # Dingbats
    # Enclosed Alphanumeric/Ideographic Supplement — NE PAS écrire
    # "[\U000024C2-\U0001F251]" : cette PLAGE U+24C2..U+1F251 traverse les blocs
    # CJK (U+4E00..U+9FFF), Kana (U+3040..U+30FF) et Hangul (U+AC00..U+D7AF), donc
    # l'extraction des émojis prenait des phrases entières chinoises/japonaises/coréennes
    # comme « emoji » et les remplaçait par des placeholders → texte CJK jamais
    # traduit. Les code points encadrés hors supplément (Ⓜ U+24C2, ㊗ U+3297,
    # ㊙ U+3299, indicateurs régionaux) sont déjà couverts par d'autres branches.
    "[\U0001F100-\U0001F251]|"  # Enclosed Alphanumeric/Ideographic Supplement
    "[\U0001F1E0-\U0001F1FF]|"  # Regional Indicator Symbols (flags)
    "[\U00002600-\U000026FF]|"  # Miscellaneous Symbols
    "[\U00002700-\U000027BF]|"  # Dingbats
    "[\U0001F900-\U0001F9FF]|"  # Supplemental Symbols
    "[\U0001FA00-\U0001FAFF]|"  # Extended Pictographs
    # Symboles additionnels souvent utilisés comme emojis
    "[\u2600-\u26FF]|"  # Miscellaneous Symbols
    "[\u2700-\u27BF]|"  # Dingbats
    "[\u2B50]|"  # Star
    "[\u2934-\u2935]|"  # Arrows
    "[\u3030]|"  # Wavy dash
    "[\u303D]|"  # Part alternation mark
    "[\u3297]|"  # Circled Ideograph Congratulation
    "[\u3299]|"  # Circled Ideograph Secret
    # Keycap sequences
    "[\u0023\u002A\u0030-\u0039]\uFE0F?\u20E3|"  # Keycaps
    # Copyright, registered, trademark
    "[\u00A9\u00AE\u203C\u2049\u2122\u2139]|"
    # Arrows
    "[\u2194-\u2199\u21A9-\u21AA]|"
    # Checkmarks, crosses
    "[\u231A-\u231B\u2328\u23CF\u23E9-\u23F3\u23F8-\u23FA\u24C2]|"
    # Geometric shapes
    "[\u25AA-\u25AB\u25B6\u25C0\u25FB-\u25FE]|"
    # Additional symbols
    "[\u2934-\u2935\u2B05-\u2B07\u2B1B-\u2B1C\u2B50\u2B55]|"
    # Emojis récents (Unicode 13.0+)
    "[\U0001F90C-\U0001F971]|"  # Nouveaux emojis
    "[\U0001F973-\U0001F976]|"
    "[\U0001F97A-\U0001F9A2]|"
    "[\U0001F9A5-\U0001F9AA]|"
    "[\U0001F9AE-\U0001F9CA]|"
    "[\U0001F9CD-\U0001F9FF]|"
    "[\U0001FA70-\U0001FA74]|"
    "[\U0001FA78-\U0001FA7A]|"
    "[\U0001FA80-\U0001FA86]|"
    "[\U0001FA90-\U0001FAA8]|"
    "[\U0001FAB0-\U0001FAB6]|"
    "[\U0001FAC0-\U0001FAC2]|"
    "[\U0001FAD0-\U0001FAD6]"
    ")"
)
EMOJI_PATTERN = re.compile(_EMOJI_UNIT + "+", flags=re.UNICODE)
# Un émoji collé à un marqueur ne doit pas avaler son 🔹 (lui-même un émoji).
_EMOJI_RUN_OUTSIDE_PLACEHOLDERS = rf"(?:(?!🔹EMOJI_\d+🔹){_EMOJI_UNIT})+"

# Marqueur UNIQUE de tout ce que la traduction ne doit pas toucher : émojis,
# adresses, mentions, hashtags (#9086). Format: 🔹EMOJI_X🔹 où X est l'index.
# 🔹 appartient au vocabulaire NLLB, qui le RECOPIE ; le marqueur 🔗X🔗 qui
# protégeait les URL avant #9086 était un jeton <unk> — détruit dès
# l'encodage, l'adresse disparaissait de chaque traduction. Le texte du
# marqueur ne change pas : les segments déjà en cache restent valides.
PROTECTED_PLACEHOLDER = "🔹EMOJI_{index}🔹"
_PLACEHOLDER_PATTERN = re.compile(r"🔹EMOJI_(\d+)🔹")

# Ce qu'un lecteur doit retrouver à l'identique dans chaque traduction. L'ordre
# des branches compte : à une même position, la forme la plus longue gagne.
#   [[url]]            le bloc entier (lien affiché tel quel, sans suivi)
#   [libellé](cible)   le LIBELLÉ reste dans le texte à traduire, `(cible)` est protégée
#   <url>              chevrons compris
#   url brute          http(s):// ou www., sans la ponctuation finale de phrase
#   m+<token>          lien court suivi
#   @pseudo, #hashtag  (une adresse e-mail n'est pas une mention)
PROTECTED_ENTITY_PATTERN = re.compile(
    r"(?P<placeholder>🔹EMOJI_\d+🔹)"
    r"|(?P<raw_block>\[\[[^\[\]\n]+\]\])"
    r"|\[(?P<md_label>[^\[\]\n]+)\](?P<md_target>\([^()\s]+\))"
    r"|(?P<angle><(?:https?://|www\.)[^\s<>]+>)"
    r"|(?P<url>(?:https?://|(?<![\w/.@])www\.)[^\s<>]*[^\s<>.,;:!?'\"»)\]])"
    r"|(?P<short_link>(?<![\w+])m\+[A-Za-z0-9_-]{2,50})"
    r"|(?P<mention>(?<![\w@])@[\w-]{1,30})"
    r"|(?P<hashtag>(?<![\w#&])#\w+)"
    rf"|(?P<emoji>{_EMOJI_RUN_OUTSIDE_PLACEHOLDERS})",
    flags=re.UNICODE,
)


def protect_entities(text: str) -> Tuple[str, Dict[int, str]]:
    """Remplace chaque entité protégée par un marqueur 🔹EMOJI_n🔹.

    Retourne `(texte_masqué, index → entité d'origine)`. Les marqueurs déjà
    présents sont opaques et la numérotation reprend après le plus grand : un
    texte peut être protégé deux fois (segmenteur puis moteur) sans collision.
    """
    existing = [int(index) for index in _PLACEHOLDER_PATTERN.findall(text)]
    next_index = max(existing, default=-1) + 1
    entities: Dict[int, str] = {}

    def _mask(value: str) -> str:
        nonlocal next_index
        index = next_index
        entities[index] = value
        next_index += 1
        return PROTECTED_PLACEHOLDER.format(index=index)

    def _replace(match: "re.Match[str]") -> str:
        if match.group("placeholder"):
            return match.group(0)
        if match.group("md_target"):
            label = PROTECTED_ENTITY_PATTERN.sub(_replace, match.group("md_label"))
            return f"[{label}]{_mask(match.group('md_target'))}"
        return _mask(match.group(0))

    masked = PROTECTED_ENTITY_PATTERN.sub(_replace, text)
    if entities:
        logger.debug(f"[SEGMENTER] {len(entities)} entités protégées: {list(entities.values())}")
    return masked, entities


def restore_entities(text: str, entities: Dict[int, str]) -> str:
    """Réinjecte chaque entité à la place de son marqueur.

    Tolère les espaces que NLLB insère dans un marqueur. Une entité dont le
    marqueur a disparu de la sortie du modèle est rajoutée en fin de texte :
    une adresse ne se perd jamais en traduction (#9086).
    """
    result = text
    dropped: List[str] = []
    for index, value in sorted(entities.items()):
        marker = re.compile(r"🔹\s*EMOJI_\s*" + str(index) + r"\s*🔹")
        if marker.search(result) is None:
            dropped.append(value)
            continue
        result = marker.sub(lambda _m: value, result)

    if dropped:
        logger.warning(f"[SEGMENTER] ⚠️  {len(dropped)} marqueurs perdus par le modèle, réinjectés en fin: {dropped}")
        result = " ".join([result.rstrip(), *dropped]) if result.strip() else " ".join(dropped)
    return result


def strip_entities(text: str) -> str:
    """Le texte sans ce que la détection de langue ne doit pas lire.

    Une adresse, une mention ou un hashtag n'est écrit dans aucune langue ; le
    libellé d'un lien markdown, lui, l'est et reste.
    """
    def _replace(match: "re.Match[str]") -> str:
        return f" {match.group('md_label')} " if match.group("md_target") else " "

    return PROTECTED_ENTITY_PATTERN.sub(_replace, text)


def has_translatable_text(masked: str) -> bool:
    """Un texte masqué qui ne contient plus aucune lettre n'a rien à traduire."""
    return any(char.isalpha() for char in _PLACEHOLDER_PATTERN.sub("", masked))

# Marqueur pour les sauts de ligne (pour préservation explicite)
NEWLINE_MARKER = "__NL__"

class TextSegmenter:
    """Gère la segmentation de texte pour traduction avec préservation de structure"""

    def __init__(self, max_segment_length: int = 100):
        """
        Args:
            max_segment_length: Nombre maximum de caractères par segment (en dessous de max_length du modèle)
        """
        self.max_segment_length = max_segment_length

    def is_list_item(self, line: str) -> bool:
        """
        Détecte si une ligne est un élément de liste

        Patterns reconnus:
        - Tirets: -, •, *, →
        - Numéros: 1., 2., 3., etc.
        - Lettres: a), b), c)
        - Lettres romaines: I), II), III), etc.
        """
        stripped = line.strip()
        if not stripped:
            return False

        # Pattern pour listes à puces (le '-' est échappé pour rester littéral :
        # non échappé, `[+-•]` définit une PLAGE U+002B..U+2022 qui avale chiffres,
        # lettres et ponctuation, classant à tort « A dog » / « 2 items » comme liste)
        bullet_pattern = r'^[+\-•*→]\s+'
        # Pattern pour listes numérotées (1., 2., etc.)
        numbered_pattern = r'^\d+\.\s+'
        # Pattern pour listes avec lettres (a), b), etc.)
        lettered_pattern = r'^[a-z]\)\s+'
        # Pattern pour listes avec lettres (I), II), etc.)
        roman_lettered_pattern = r'^[IVXLCDM]+\)\s+'

        return (re.match(bullet_pattern, stripped) is not None or
                re.match(numbered_pattern, stripped) is not None or
                re.match(lettered_pattern, stripped) is not None or
                re.match(roman_lettered_pattern, stripped) is not None)

    def segment_by_sentences_and_lines(self, text: str) -> List[Tuple[str, str]]:
        """
        ALGORITHME SIMPLIFIÉ : Découper par retour à la ligne et mémoriser le type de séparateur

        Logique simple :
        1. Split par \n et capturer les séparateurs
        2. Chaque ligne devient un segment à traduire
        3. Détecter les blocs de code (``` ... ```) et les marquer comme non traduisibles
        4. Mémoriser si après chaque ligne il faut reconstruire avec 1 ou plusieurs \n

        Returns:
            Liste de tuples (segment, type)
            - segment: texte de la ligne
            - type: 'line' (ligne normale), 'separator' (séparateur \n), 'code' (ligne de code non traduisible)
        """
        segments = []

        # Split avec capture pour préserver les \n
        # Pattern: Split sur \n mais capturer les \n consécutifs
        parts = re.split(r'(\n+)', text)

        # État pour détecter les blocs de code
        in_code_block = False

        for i, part in enumerate(parts):
            if not part:
                continue

            # Les indices impairs sont les séparateurs (\n, \n\n, \n\n\n, etc.)
            if i % 2 == 1:
                # C'est un séparateur - mémoriser combien de \n
                segments.append((part, 'separator'))
            else:
                # C'est une ligne de texte (peut être vide)
                # IMPORTANT: Utiliser rstrip() pour préserver l'indentation à gauche (pour le code)
                if part.strip():  # Seulement si la ligne contient du texte
                    stripped = part.strip()

                    # Détecter les délimiteurs de blocs de code (```)
                    if stripped.startswith('```'):
                        in_code_block = not in_code_block
                        # Les lignes ``` elles-mêmes sont du code (non traduisibles)
                        segments.append((part.rstrip(), 'code'))
                    elif in_code_block:
                        # On est dans un bloc de code - ne pas traduire
                        segments.append((part.rstrip(), 'code'))
                    else:
                        # Ligne normale - à traduire
                        segments.append((part.rstrip(), 'line'))
                elif part:  # Ligne avec uniquement des espaces
                    segments.append(('', 'empty_line'))

        logger.debug(f"[SEGMENTER] Segmented into {len(segments)} parts by line breaks")
        return segments

    def segment_by_sentences(self, text: str) -> List[str]:
        """
        Segmente un paragraphe en phrases si trop long
        Préserve les sauts de ligne simples
        """
        # Si le texte est court, retourner tel quel
        if len(text) <= self.max_segment_length:
            return [text]

        # Remplacer temporairement les sauts de ligne simples
        text_with_markers = text.replace('\n', NEWLINE_MARKER)

        # Découper par phrases (., !, ?, ;)
        sentences = re.split(r'([.!?;]+\s+)', text_with_markers)

        # Regrouper les phrases avec leur ponctuation
        segments = []
        current_segment = ""

        for i, part in enumerate(sentences):
            # Les indices pairs sont les phrases, impairs sont les séparateurs
            if i % 2 == 0:
                current_segment += part
            else:
                current_segment += part

                # Si le segment est assez long, l'ajouter
                if len(current_segment) >= self.max_segment_length * 0.7:
                    segments.append(current_segment.strip())
                    current_segment = ""

        # Ajouter le dernier segment s'il existe
        if current_segment.strip():
            segments.append(current_segment.strip())

        # Restaurer les sauts de ligne
        segments = [s.replace(NEWLINE_MARKER, '\n') for s in segments]

        logger.debug(f"[SEGMENTER] Split long paragraph into {len(segments)} sentences")
        return segments if segments else [text]

    def segment_text(self, text: str) -> Tuple[List[Dict], Dict[int, str]]:
        """
        Segmente le texte intelligemment en préservant la structure

        Returns:
            (liste_segments, mapping_entités_protégées)
            Chaque segment est un dict: {
                'text': str,
                'type': 'sentence' | 'list_item' | 'paragraph_break',
                'index': int
            }
        """
        # 1. Protéger émojis, adresses, mentions et hashtags (#9086)
        masked_text, entities = protect_entities(text)

        # 2. Segmenter intelligemment (phrases + listes)
        parts = self.segment_by_sentences_and_lines(masked_text)

        # 3. Créer les segments
        segments = []
        segment_index = 0

        for part_text, part_type in parts:
            segments.append({
                'text': part_text,
                'type': part_type,
                'index': segment_index
            })
            segment_index += 1

        logger.info(f"[SEGMENTER] Text segmented into {len(segments)} parts ({len([s for s in segments if s['type'] == 'line'])} translatable lines) with {len(entities)} protected entities")
        return segments, entities

    def reassemble_text(self, translated_segments: List[Dict], entities: Dict[int, str]) -> str:
        """
        ALGORITHME SIMPLIFIÉ : Réassemble en respectant exactement les séparateurs mémorisés

        Logique simple :
        1. Pour chaque segment de type 'line' : ajouter le texte traduit
        2. Pour chaque segment de type 'code' : ajouter le code non traduit
        3. Pour chaque segment de type 'separator' : ajouter exactement les \n mémorisés
        4. Réinjecter les entités protégées à la fin

        Args:
            translated_segments: Liste de segments avec 'text' et 'type'
            entities: Mapping des entités protégées à réinjecter
        """
        result_parts = []

        for segment in translated_segments:
            segment_type = segment['type']
            segment_text = segment['text']

            if segment_type == 'separator':
                # Ajouter exactement le séparateur mémorisé (\n, \n\n, \n\n\n, etc.)
                result_parts.append(segment_text)
            elif segment_type in ['line', 'code']:
                # Ajouter la ligne (traduite si 'line', originale si 'code')
                result_parts.append(segment_text)
            elif segment_type == 'empty_line':
                # Ligne vide - ne rien ajouter (le séparateur suivant gérera les \n)
                pass

        # Joindre toutes les parties
        reassembled = ''.join(result_parts)

        # Réinjecter émojis, adresses, mentions et hashtags
        final_text = restore_entities(reassembled, entities)

        logger.info(f"[SEGMENTER] Text reassembled: {len(final_text)} chars from {len(translated_segments)} segments")
        return final_text


def test_segmenter():
    """Test du segmenteur"""
    segmenter = TextSegmenter(max_segment_length=50)

    test_text = """Hello! 😊 How are you today?

This is a new paragraph with some emojis 🎉🎊.

And this is the final paragraph! 🚀"""

    print("Original text:")
    print(test_text)
    print("\n" + "="*50 + "\n")

    # Segmenter
    segments, emojis = segmenter.segment_text(test_text)

    print("Segments:")
    for seg in segments:
        print(f"[{seg['type']}] {repr(seg['text'])}")

    print(f"\nEmojis extracted: {emojis}")

    # Simuler une traduction (garder tel quel)
    translated = [{'text': s['text'], 'type': s['type'], 'index': s['index']} for s in segments]

    # Réassembler
    result = segmenter.reassemble_text(translated, emojis)

    print("\n" + "="*50 + "\n")
    print("Reassembled text:")
    print(result)

    print("\n" + "="*50 + "\n")
    print(f"Match original: {result == test_text}")


if __name__ == "__main__":
    test_segmenter()
