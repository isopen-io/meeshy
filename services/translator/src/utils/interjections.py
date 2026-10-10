"""Lexique des interjections courantes, servi à la place de NLLB (#9723).

Mesuré sur staging (2026-10-08) : isolée, une interjection fait dérailler NLLB-200,
quelle que soit la taille (600M, 1.3B) ou la recherche (glouton, faisceau de 4) —
« Hello! » → « Je vous en prie. », « Oui. » → « - I know. », « Salut » → « - Hi ,
my name is ». Le modèle, entraîné sur des phrases, lit ces fragments comme des
répliques de sous-titres. Une phrase qui n'est QU'une interjection du lexique est
donc traduite ici, dans les sept langues de l'application ; tout le reste passe par
le modèle.

Chaque concept liste, par langue, ses formes reconnues ; la PREMIÈRE est celle que
l'on sert. Une forme présente dans deux concepts appartient au premier.
"""

from typing import Dict, List, Optional, Tuple

LEXICON: List[Dict[str, List[str]]] = [
    {  # bonjour
        "fr": ["bonjour"],
        "en": ["hello", "good morning", "good afternoon"],
        "es": ["hola", "buenos días", "buenos dias", "buenas tardes"],
        "de": ["hallo", "guten Tag", "guten Morgen"],
        "it": ["buongiorno", "salve"],
        "pt": ["olá", "ola", "bom dia", "boa tarde"],
        "ar": ["مرحبا", "مرحباً", "صباح الخير"],
    },
    {  # salut
        "fr": ["salut", "coucou"],
        "en": ["hi", "hey", "hiya"],
        "es": ["hola", "buenas"],
        "de": ["hi", "hey", "servus"],
        "it": ["ciao"],
        "pt": ["oi"],
        "ar": ["أهلا", "أهلاً", "اهلا"],
    },
    {  # bonsoir
        "fr": ["bonsoir"],
        "en": ["good evening"],
        "de": ["guten Abend"],
        "it": ["buonasera"],
        "ar": ["مساء الخير"],
    },
    {  # bonne nuit
        "fr": ["bonne nuit"],
        "en": ["good night", "goodnight"],
        "es": ["buenas noches"],
        "de": ["gute Nacht"],
        "it": ["buonanotte"],
        "pt": ["boa noite"],
        "ar": ["تصبح على خير"],
    },
    {  # merci beaucoup
        "fr": ["merci beaucoup"],
        "en": ["thank you very much", "thanks a lot", "thank you so much"],
        "es": ["muchas gracias"],
        "de": ["vielen Dank", "danke schön", "danke sehr"],
        "it": ["grazie mille"],
        "pt": ["muito obrigado", "muito obrigada"],
        "ar": ["شكرا جزيلا", "شكراً جزيلاً"],
    },
    {  # merci
        "fr": ["merci"],
        "en": ["thank you", "thanks"],
        "es": ["gracias"],
        "de": ["danke"],
        "it": ["grazie"],
        "pt": ["obrigado", "obrigada"],
        "ar": ["شكرا", "شكراً"],
    },
    {  # oui
        "fr": ["oui", "ouais"],
        "en": ["yes", "yeah", "yep"],
        "es": ["sí", "si"],
        "de": ["ja"],
        "it": ["sì", "si"],
        "pt": ["sim"],
        "ar": ["نعم"],
    },
    {  # non
        "fr": ["non"],
        "en": ["no", "nope"],
        "es": ["no"],
        "de": ["nein"],
        "it": ["no"],
        "pt": ["não", "nao"],
        "ar": ["لا"],
    },
    {  # d'accord
        "fr": ["d'accord", "ok", "okay"],
        "en": ["OK", "okay"],
        "es": ["de acuerdo", "vale", "ok"],
        "de": ["okay", "ok", "einverstanden"],
        "it": ["va bene", "ok", "d'accordo"],
        "pt": ["está bem", "ok", "certo"],
        "ar": ["حسنا", "حسناً"],
    },
    {  # bien sûr
        "fr": ["bien sûr", "bien sur"],
        "en": ["of course", "sure"],
        "es": ["claro", "por supuesto"],
        "de": ["natürlich", "klar"],
        "it": ["certo", "certamente"],
        "pt": ["claro", "com certeza"],
        "ar": ["بالتأكيد", "طبعا", "طبعاً"],
    },
    {  # au revoir
        "fr": ["au revoir"],
        "en": ["bye", "goodbye", "bye bye"],
        "es": ["adiós", "adios", "chao"],
        "de": ["tschüss", "tschüs", "auf Wiedersehen"],
        "it": ["arrivederci"],
        "pt": ["tchau", "adeus"],
        "ar": ["مع السلامة", "وداعا"],
    },
    {  # pardon
        "fr": ["pardon", "désolé", "désolée"],
        "en": ["sorry"],
        "es": ["perdón", "perdon", "lo siento"],
        "de": ["Entschuldigung", "sorry"],
        "it": ["scusa", "scusi", "mi dispiace"],
        "pt": ["desculpa", "desculpe"],
        "ar": ["آسف", "عذرا", "عذراً"],
    },
]

# La forme d'une phrase se lit par des `strip`, jamais par une expression à
# quantificateurs adjacents (`\s*(.*?)\s*([!?.]*)$` coûtait n² sur « !!!…!a ») ;
# et une phrase plus longue que la plus longue forme du lexique n'en est pas une.
OPENERS = "¡¿"
CLOSING_MARKS = "!?.…؟"
TRAILING_COMMAS = ",،"
MAX_SENTENCE_LENGTH = 64


def _base_language(language: str) -> str:
    return (language or "").split("-")[0].lower()


def _normalize(core: str) -> str:
    return core.replace("’", "'").casefold().rstrip(TRAILING_COMMAS).strip()


def _shape(sentence: str) -> Tuple[str, str]:
    """(cœur, ponctuation finale) d'une phrase, ouvrants espagnols retirés."""
    body = sentence.strip().lstrip(OPENERS).strip()
    unpunctuated = body.rstrip(CLOSING_MARKS)
    return unpunctuated.strip(), body[len(unpunctuated):]


def _concept_of(core: str, language: str) -> Optional[Dict[str, List[str]]]:
    key = _normalize(core)
    return next(
        (concept for concept in LEXICON if key in [form.casefold() for form in concept.get(language, [])]),
        None,
    )


def _cased(form: str, source_core: str) -> str:
    if form.isupper():
        return form
    if source_core[:1].islower():
        return form[:1].lower() + form[1:]
    return form[:1].upper() + form[1:]


def _punctuated(word: str, punctuation: str, language: str) -> str:
    if not punctuation:
        return word
    if language == "ar":
        punctuation = punctuation.replace("?", "؟")
    if language == "fr" and punctuation[0] in "!?":
        return f"{word} {punctuation}"
    if language == "es" and punctuation[0] in "!?":
        return f"{'¡' if punctuation[0] == '!' else '¿'}{word}{punctuation}"
    return f"{word}{punctuation}"


def translate_interjection(sentence: str, source_language: str, target_language: str) -> Optional[str]:
    """La traduction d'une phrase qui n'est qu'une interjection du lexique, sinon None."""
    source = _base_language(source_language)
    target = _base_language(target_language)
    if source == target or len(sentence) > MAX_SENTENCE_LENGTH:
        return None
    core, punctuation = _shape(sentence)
    if not core:
        return None
    concept = _concept_of(core, source)
    if concept is None or target not in concept:
        return None
    punctuation = punctuation.replace("؟", "?")
    return _punctuated(_cased(concept[target][0], core), punctuation, target)
