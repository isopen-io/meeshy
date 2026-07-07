"""
Tests for LanguageCapabilitiesService — P0 Prisme Linguistique × translator
Coverage target: ≥92% line + branch on language_capabilities.py
"""
import pytest

from src.services.language_capabilities import (
    TTSEngine,
    STTEngine,
    LanguageCapability,
    LanguageCapabilityError,
    LanguageCapabilitiesService,
    get_language_capabilities,
)


def make_service() -> LanguageCapabilitiesService:
    """Factory: reset singleton and return fresh instance."""
    LanguageCapabilitiesService._instance = None
    return LanguageCapabilitiesService()


# ===========================================================================
# Enums
# ===========================================================================

class TestEnums:
    def test_tts_engine_values(self):
        assert TTSEngine.CHATTERBOX.value == "chatterbox"
        assert TTSEngine.XTTS.value == "xtts"
        assert TTSEngine.MMS.value == "mms"
        assert TTSEngine.VITS.value == "vits"
        assert TTSEngine.NONE.value == "none"

    def test_stt_engine_values(self):
        assert STTEngine.WHISPER.value == "whisper"
        assert STTEngine.MMS_ASR.value == "mms_asr"
        assert STTEngine.NONE.value == "none"


# ===========================================================================
# LanguageCapability dataclass
# ===========================================================================

class TestLanguageCapability:
    def test_defaults(self):
        cap = LanguageCapability(code="xx", name="Test", native_name="Test")
        assert cap.tts_supported is False
        assert cap.tts_engine == TTSEngine.NONE
        assert cap.tts_voice_cloning is False
        assert cap.stt_supported is False
        assert cap.stt_engine == STTEngine.NONE
        assert cap.translation_supported is True
        assert cap.mms_tts_code is None
        assert cap.mms_asr_code is None
        assert cap.region == ""
        assert cap.notes == ""

    def test_full_construction(self):
        cap = LanguageCapability(
            code="en",
            name="English",
            native_name="English",
            tts_supported=True,
            tts_engine=TTSEngine.CHATTERBOX,
            tts_voice_cloning=True,
            stt_supported=True,
            stt_engine=STTEngine.WHISPER,
            mms_tts_code="eng",
            mms_asr_code="eng",
            region="Europe",
            notes="test note",
        )
        assert cap.code == "en"
        assert cap.tts_engine == TTSEngine.CHATTERBOX
        assert cap.tts_voice_cloning is True
        assert cap.stt_engine == STTEngine.WHISPER
        assert cap.mms_tts_code == "eng"
        assert cap.mms_asr_code == "eng"
        assert cap.region == "Europe"
        assert cap.notes == "test note"


# ===========================================================================
# LanguageCapabilityError
# ===========================================================================

class TestLanguageCapabilityError:
    def test_basic_constructor(self):
        err = LanguageCapabilityError(
            message="Not supported",
            code="xyz",
            capability="tts",
        )
        assert err.message == "Not supported"
        assert err.code == "xyz"
        assert err.capability == "tts"
        assert err.available_alternatives == []
        assert str(err) == "Not supported"

    def test_with_alternatives(self):
        err = LanguageCapabilityError(
            message="Not supported",
            code="xyz",
            capability="stt",
            available_alternatives=["en", "fr"],
        )
        assert err.available_alternatives == ["en", "fr"]

    def test_to_dict(self):
        err = LanguageCapabilityError(
            message="Not supported",
            code="xyz",
            capability="tts",
            available_alternatives=["en"],
        )
        d = err.to_dict()
        assert d["error"] == "LANGUAGE_CAPABILITY_ERROR"
        assert d["message"] == "Not supported"
        assert d["language_code"] == "xyz"
        assert d["capability"] == "tts"
        assert d["available_alternatives"] == ["en"]

    def test_to_dict_empty_alternatives(self):
        err = LanguageCapabilityError(message="m", code="c", capability="c")
        d = err.to_dict()
        assert d["available_alternatives"] == []

    def test_is_exception(self):
        err = LanguageCapabilityError(message="m", code="c", capability="c")
        assert isinstance(err, Exception)

    def test_can_be_raised_and_caught(self):
        with pytest.raises(LanguageCapabilityError) as exc_info:
            raise LanguageCapabilityError(message="boom", code="zz", capability="tts")
        assert exc_info.value.capability == "tts"


# ===========================================================================
# Singleton pattern
# ===========================================================================

class TestSingleton:
    def test_same_instance_returned(self):
        svc1 = make_service()
        svc2 = LanguageCapabilitiesService()
        assert svc1 is svc2

    def test_init_called_twice_does_not_repopulate(self):
        svc = make_service()
        initial_count = len(svc._capabilities)
        svc.__init__()
        assert len(svc._capabilities) == initial_count

    def test_get_language_capabilities_accessor(self):
        LanguageCapabilitiesService._instance = None
        svc = get_language_capabilities()
        assert isinstance(svc, LanguageCapabilitiesService)
        assert get_language_capabilities() is svc

    def test_reset_creates_new_instance(self):
        svc1 = make_service()
        LanguageCapabilitiesService._instance = None
        svc2 = LanguageCapabilitiesService()
        assert svc2._initialized is True


# ===========================================================================
# Language initialization — European
# ===========================================================================

class TestEuropeanLanguages:
    def test_european_languages_present(self):
        svc = make_service()
        for code in ["en", "fr", "de", "es", "it", "pt", "nl", "pl", "ru"]:
            assert code in svc._capabilities, f"Missing: {code}"

    def test_chatterbox_european_language(self):
        svc = make_service()
        en = svc._capabilities["en"]
        assert en.tts_engine == TTSEngine.CHATTERBOX
        assert en.tts_voice_cloning is True
        assert en.stt_engine == STTEngine.WHISPER
        assert en.region == "Europe"
        assert en.mms_tts_code is None

    def test_mms_european_languages_have_mms_codes(self):
        svc = make_service()
        assert svc._capabilities["uk"].mms_tts_code == "ukr"
        assert svc._capabilities["ro"].mms_tts_code == "ron"
        assert svc._capabilities["bg"].mms_tts_code == "bul"
        assert svc._capabilities["hr"].mms_tts_code == "hrv"
        assert svc._capabilities["sk"].mms_tts_code == "slk"
        assert svc._capabilities["sl"].mms_tts_code == "slv"
        assert svc._capabilities["lt"].mms_tts_code == "lit"
        assert svc._capabilities["hy"].mms_tts_code == "hye"

    def test_mms_european_languages_no_voice_clone(self):
        svc = make_service()
        for code in ["uk", "ro", "bg", "hr"]:
            assert svc._capabilities[code].tts_voice_cloning is False
            assert svc._capabilities[code].tts_engine == TTSEngine.MMS

    def test_all_european_have_stt_and_tts(self):
        svc = make_service()
        for code in ["en", "fr", "de", "es", "it", "ru", "uk", "ro"]:
            cap = svc._capabilities[code]
            assert cap.stt_supported is True
            assert cap.tts_supported is True

    def test_armenian_present(self):
        svc = make_service()
        assert "hy" in svc._capabilities
        assert svc._capabilities["hy"].tts_engine == TTSEngine.MMS


# ===========================================================================
# Language initialization — Asian
# ===========================================================================

class TestAsianLanguages:
    def test_asian_languages_present(self):
        svc = make_service()
        for code in ["ar", "he", "fa", "hi", "bn", "ja", "ko", "zh"]:
            assert code in svc._capabilities, f"Missing: {code}"

    def test_asian_mms_codes(self):
        svc = make_service()
        assert svc._capabilities["ar"].mms_tts_code == "ara"
        assert svc._capabilities["ar"].mms_asr_code == "ara"
        assert svc._capabilities["ja"].mms_tts_code == "jpn"
        assert svc._capabilities["zh"].mms_tts_code == "cmn"

    def test_chatterbox_asian_languages(self):
        svc = make_service()
        for code in ["ar", "he", "hi", "ms", "ja", "ko", "zh"]:
            assert svc._capabilities[code].tts_engine == TTSEngine.CHATTERBOX

    def test_mms_asian_languages(self):
        svc = make_service()
        for code in ["fa", "bn", "ur", "ta", "te", "th", "vi", "id"]:
            assert svc._capabilities[code].tts_engine == TTSEngine.MMS

    def test_asian_region(self):
        svc = make_service()
        for code in ["ar", "hi", "ja"]:
            assert svc._capabilities[code].region == "Asia"


# ===========================================================================
# Language initialization — African
# ===========================================================================

class TestAfricanLanguages:
    def test_african_mms_tts_languages_present(self):
        svc = make_service()
        for code in ["am", "sw", "yo", "ha", "rw"]:
            assert code in svc._capabilities

    def test_swahili_uses_whisper_stt(self):
        svc = make_service()
        assert svc._capabilities["sw"].stt_engine == STTEngine.WHISPER

    def test_amharic_uses_mms_asr(self):
        svc = make_service()
        assert svc._capabilities["am"].stt_engine == STTEngine.MMS_ASR

    def test_african_mms_tts_languages_no_voice_clone(self):
        svc = make_service()
        for code in ["am", "sw", "yo", "ha"]:
            assert svc._capabilities[code].tts_supported is True
            assert svc._capabilities[code].tts_engine == TTSEngine.MMS
            assert svc._capabilities[code].tts_voice_cloning is False

    def test_lingala_vits_with_voice_cloning(self):
        svc = make_service()
        ln = svc._capabilities["ln"]
        assert ln.tts_engine == TTSEngine.VITS
        assert ln.tts_voice_cloning is True
        assert ln.mms_tts_code is None
        assert ln.mms_asr_code == "lin"
        assert ln.region == "Africa"

    def test_african_no_tts_languages(self):
        svc = make_service()
        for code in ["ig", "zu", "xh", "wo", "tw"]:
            cap = svc._capabilities[code]
            assert cap.tts_supported is False
            assert cap.tts_engine == TTSEngine.NONE
            assert cap.mms_tts_code is None

    def test_afrikaans_whisper_stt_no_tts(self):
        svc = make_service()
        af = svc._capabilities["af"]
        assert af.stt_engine == STTEngine.WHISPER
        assert af.tts_supported is False

    def test_african_no_tts_mms_asr(self):
        svc = make_service()
        # Languages without whisper use MMS_ASR
        assert svc._capabilities["ig"].stt_engine == STTEngine.MMS_ASR
        assert svc._capabilities["zu"].stt_engine == STTEngine.MMS_ASR

    def test_cameroonian_languages_present(self):
        svc = make_service()
        for code in ["bas", "ksf", "nnh", "dua", "bum", "ewo"]:
            cap = svc._capabilities[code]
            assert cap.tts_supported is False
            assert cap.stt_engine == STTEngine.MMS_ASR
            assert cap.region == "Africa (Cameroon)"

    def test_cameroonian_mms_asr_codes(self):
        svc = make_service()
        assert svc._capabilities["bas"].mms_asr_code == "bas"
        assert svc._capabilities["ksf"].mms_asr_code == "ksf"
        assert svc._capabilities["nnh"].mms_asr_code == "nnh"

    def test_all_african_no_tts_have_stt(self):
        svc = make_service()
        for code in ["ig", "zu", "xh", "af"]:
            assert svc._capabilities[code].stt_supported is True


# ===========================================================================
# Public query API
# ===========================================================================

class TestGetCapability:
    def test_known_language(self):
        svc = make_service()
        cap = svc.get_capability("en")
        assert cap is not None
        assert cap.code == "en"

    def test_unknown_language_returns_none(self):
        svc = make_service()
        assert svc.get_capability("xyz") is None

    def test_case_insensitive(self):
        svc = make_service()
        assert svc.get_capability("EN") is not None
        assert svc.get_capability("FR") is not None
        assert svc.get_capability("Am") is not None


class TestCanTranscribe:
    def test_supported_language(self):
        svc = make_service()
        assert svc.can_transcribe("en") is True
        assert svc.can_transcribe("am") is True

    def test_unknown_language(self):
        svc = make_service()
        assert svc.can_transcribe("xyz") is False

    def test_stt_not_supported(self):
        svc = make_service()
        svc._capabilities["nostt"] = LanguageCapability(
            code="nostt", name="NoSTT", native_name="NoSTT",
            tts_supported=True, tts_engine=TTSEngine.MMS,
            stt_supported=False,
        )
        assert svc.can_transcribe("nostt") is False


class TestCanSynthesize:
    def test_supported(self):
        svc = make_service()
        assert svc.can_synthesize("en") is True
        assert svc.can_synthesize("am") is True

    def test_not_supported(self):
        svc = make_service()
        assert svc.can_synthesize("ig") is False

    def test_unknown(self):
        svc = make_service()
        assert svc.can_synthesize("xyz") is False


class TestCanCloneVoice:
    def test_supported(self):
        svc = make_service()
        assert svc.can_clone_voice("en") is True
        assert svc.can_clone_voice("ln") is True

    def test_not_supported_mms(self):
        svc = make_service()
        assert svc.can_clone_voice("am") is False

    def test_unknown(self):
        svc = make_service()
        assert svc.can_clone_voice("xyz") is False


class TestCanTranslate:
    def test_known_language(self):
        svc = make_service()
        assert svc.can_translate("en") is True

    def test_unknown_language(self):
        svc = make_service()
        assert svc.can_translate("xyz") is False

    def test_translation_disabled(self):
        svc = make_service()
        svc._capabilities["notrans"] = LanguageCapability(
            code="notrans", name="NoTrans", native_name="NoTrans",
            translation_supported=False,
        )
        assert svc.can_translate("notrans") is False


class TestGetEngines:
    def test_get_tts_engine_chatterbox(self):
        svc = make_service()
        assert svc.get_tts_engine("en") == TTSEngine.CHATTERBOX

    def test_get_tts_engine_mms(self):
        svc = make_service()
        assert svc.get_tts_engine("am") == TTSEngine.MMS

    def test_get_tts_engine_vits(self):
        svc = make_service()
        assert svc.get_tts_engine("ln") == TTSEngine.VITS

    def test_get_tts_engine_unknown(self):
        svc = make_service()
        assert svc.get_tts_engine("xyz") == TTSEngine.NONE

    def test_get_stt_engine_whisper(self):
        svc = make_service()
        assert svc.get_stt_engine("en") == STTEngine.WHISPER

    def test_get_stt_engine_mms_asr(self):
        svc = make_service()
        assert svc.get_stt_engine("am") == STTEngine.MMS_ASR

    def test_get_stt_engine_unknown(self):
        svc = make_service()
        assert svc.get_stt_engine("xyz") == STTEngine.NONE


class TestMmsCodes:
    def test_get_mms_tts_code_known(self):
        svc = make_service()
        assert svc.get_mms_tts_code("ar") == "ara"
        assert svc.get_mms_tts_code("am") == "amh"
        assert svc.get_mms_tts_code("sw") == "swh"

    def test_get_mms_tts_code_no_code(self):
        svc = make_service()
        assert svc.get_mms_tts_code("en") is None

    def test_get_mms_tts_code_unknown(self):
        svc = make_service()
        assert svc.get_mms_tts_code("xyz") is None

    def test_get_mms_asr_code_known(self):
        svc = make_service()
        assert svc.get_mms_asr_code("ar") == "ara"
        assert svc.get_mms_asr_code("ln") == "lin"

    def test_get_mms_asr_code_unknown(self):
        svc = make_service()
        assert svc.get_mms_asr_code("xyz") is None


class TestRequiresMms:
    def test_requires_mms_tts_true(self):
        svc = make_service()
        assert svc.requires_mms_tts("am") is True
        assert svc.requires_mms_tts("uk") is True

    def test_requires_mms_tts_false_chatterbox(self):
        svc = make_service()
        assert svc.requires_mms_tts("en") is False

    def test_requires_mms_tts_false_vits(self):
        svc = make_service()
        assert svc.requires_mms_tts("ln") is False

    def test_requires_mms_tts_unknown(self):
        svc = make_service()
        assert svc.requires_mms_tts("xyz") is False

    def test_requires_mms_asr_true(self):
        svc = make_service()
        assert svc.requires_mms_asr("am") is True
        assert svc.requires_mms_asr("yo") is True

    def test_requires_mms_asr_false_whisper(self):
        svc = make_service()
        assert svc.requires_mms_asr("en") is False
        assert svc.requires_mms_asr("sw") is False

    def test_requires_mms_asr_unknown(self):
        svc = make_service()
        assert svc.requires_mms_asr("xyz") is False


# ===========================================================================
# Require methods — exception paths
# ===========================================================================

class TestRequireStt:
    def test_success(self):
        svc = make_service()
        cap = svc.require_stt("en")
        assert cap.code == "en"
        assert cap.stt_supported is True

    def test_unknown_language_raises(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("xyz")
        err = exc_info.value
        assert err.code == "xyz"
        assert err.capability == "stt"
        assert "not recognized" in err.message

    def test_unknown_language_provides_alternatives(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("xyz")
        assert isinstance(exc_info.value.available_alternatives, list)

    def test_stt_not_supported_raises(self):
        svc = make_service()
        svc._capabilities["nostt"] = LanguageCapability(
            code="nostt", name="NoSTT", native_name="NoSTT",
            tts_supported=True, tts_engine=TTSEngine.MMS,
            stt_supported=False, stt_engine=STTEngine.NONE,
        )
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("nostt")
        err = exc_info.value
        assert err.code == "nostt"
        assert err.capability == "stt"
        assert "not available" in err.message

    def test_stt_not_supported_alternatives_are_stt_capable_languages(self):
        svc = make_service()
        svc._capabilities["nostt2"] = LanguageCapability(
            code="nostt2", name="NoSTT2", native_name="NoSTT2",
            stt_supported=False,
        )
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("nostt2")
        alts = exc_info.value.available_alternatives
        assert len(alts) > 0, "Expected at least one alternative STT-capable language"
        assert all(svc.can_transcribe(c) for c in alts), \
            f"All alternatives must be STT-capable, got: {alts}"

    def test_stt_alternatives_prefer_same_region(self):
        svc = make_service()
        # An STT-less African language must surface African STT-capable
        # alternatives (same region), not European ones by dict-insertion order.
        svc._capabilities["afrnostt"] = LanguageCapability(
            code="afrnostt", name="AfrNoSTT", native_name="AfrNoSTT",
            tts_supported=True, tts_engine=TTSEngine.MMS,
            stt_supported=False, stt_engine=STTEngine.NONE,
            region="Africa",
        )
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("afrnostt")
        alts = exc_info.value.available_alternatives
        assert len(alts) > 0, "Expected at least one alternative STT-capable language"
        assert all(svc.get_capability(c).region == "Africa" for c in alts), \
            f"Same-region alternatives expected, got: {[(c, svc.get_capability(c).region) for c in alts]}"

    def test_stt_alternatives_fall_back_when_region_has_no_match(self):
        svc = make_service()
        # A region with no other STT-capable language must still yield
        # alternatives (fallback to any STT-capable language), not an empty list.
        svc._capabilities["isolate"] = LanguageCapability(
            code="isolate", name="Isolate", native_name="Isolate",
            stt_supported=False, region="Atlantis",
        )
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_stt("isolate")
        alts = exc_info.value.available_alternatives
        assert len(alts) > 0, "Expected fallback alternatives when region has no STT sibling"
        assert all(svc.can_transcribe(c) for c in alts)


class TestRequireTts:
    def test_success(self):
        svc = make_service()
        cap = svc.require_tts("fr")
        assert cap.code == "fr"
        assert cap.tts_supported is True

    def test_unknown_language_raises(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_tts("xyz")
        err = exc_info.value
        assert err.code == "xyz"
        assert err.capability == "tts"
        assert "not recognized" in err.message

    def test_unknown_language_provides_alternatives(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_tts("xyz")
        assert isinstance(exc_info.value.available_alternatives, list)

    def test_not_supported_raises(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_tts("ig")
        err = exc_info.value
        assert err.code == "ig"
        assert err.capability == "tts"
        assert "not available" in err.message


class TestRequireVoiceCloning:
    def test_success(self):
        svc = make_service()
        cap = svc.require_voice_cloning("en")
        assert cap.tts_voice_cloning is True

    def test_unknown_language_raises_via_require_tts(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_voice_cloning("xyz")
        assert exc_info.value.capability == "tts"

    def test_no_tts_raises_via_require_tts(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_voice_cloning("ig")
        assert exc_info.value.capability == "tts"

    def test_tts_but_no_cloning_raises(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_voice_cloning("am")
        err = exc_info.value
        assert err.code == "am"
        assert err.capability == "voice_cloning"
        assert "not available" in err.message

    def test_no_cloning_lists_alternatives(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_voice_cloning("am")
        alts = exc_info.value.available_alternatives
        assert isinstance(alts, list)
        assert len(alts) > 0
        assert all("(" in a for a in alts)  # format: "code (Name)"

    def test_no_cloning_alternatives_are_cloning_capable(self):
        svc = make_service()
        with pytest.raises(LanguageCapabilityError) as exc_info:
            svc.require_voice_cloning("am")
        alts = exc_info.value.available_alternatives
        assert len(alts) > 0
        for a in alts:
            code = a.split(" ", 1)[0]
            assert svc.get_capability(code).tts_voice_cloning is True, \
                f"Alternative {a!r} must support voice cloning"

    def test_lingala_voice_cloning_succeeds(self):
        svc = make_service()
        cap = svc.require_voice_cloning("ln")
        assert cap.tts_voice_cloning is True
        assert cap.tts_engine == TTSEngine.VITS


# ===========================================================================
# Utility methods
# ===========================================================================

class TestGetSimilarLanguages:
    def test_match_by_prefix(self):
        svc = make_service()
        result = svc.get_similar_languages("en")
        assert "en" in result

    def test_no_match_returns_empty(self):
        svc = make_service()
        result = svc.get_similar_languages("zz")
        assert result == []

    def test_default_limit_five(self):
        svc = make_service()
        result = svc.get_similar_languages("a")  # matches 'af', 'am', 'ar'
        assert len(result) <= 5

    def test_custom_limit(self):
        svc = make_service()
        result = svc.get_similar_languages("en", limit=1)
        assert len(result) <= 1


class TestGetAllLanguages:
    def test_returns_list(self):
        svc = make_service()
        langs = svc.get_all_languages()
        assert isinstance(langs, list)
        assert len(langs) > 0

    def test_returns_capability_objects(self):
        svc = make_service()
        assert all(isinstance(c, LanguageCapability) for c in svc.get_all_languages())

    def test_count_matches_internal_dict(self):
        svc = make_service()
        assert len(svc.get_all_languages()) == len(svc._capabilities)


class TestGetLanguagesByRegion:
    def test_europe(self):
        svc = make_service()
        result = svc.get_languages_by_region("Europe")
        codes = [c.code for c in result]
        assert "en" in codes
        assert "fr" in codes
        assert "am" not in codes

    def test_africa(self):
        svc = make_service()
        result = svc.get_languages_by_region("Africa")
        codes = [c.code for c in result]
        assert "am" in codes
        assert "ln" in codes

    def test_no_match(self):
        svc = make_service()
        assert svc.get_languages_by_region("Antarctica") == []

    def test_case_insensitive(self):
        svc = make_service()
        lower = svc.get_languages_by_region("europe")
        upper = svc.get_languages_by_region("Europe")
        assert len(lower) == len(upper)

    def test_cameroon_subset_of_africa(self):
        svc = make_service()
        africa = svc.get_languages_by_region("Africa")
        cameroon_codes = [c.code for c in africa if "Cameroon" in c.region]
        assert "bas" in cameroon_codes


class TestGetLanguagesWith:
    def test_get_languages_with_tts(self):
        svc = make_service()
        result = svc.get_languages_with_tts()
        assert isinstance(result, list)
        assert "en" in result
        assert "am" in result
        assert "ig" not in result

    def test_get_languages_with_stt(self):
        svc = make_service()
        result = svc.get_languages_with_stt()
        assert "en" in result
        assert "am" in result

    def test_get_languages_with_voice_cloning(self):
        svc = make_service()
        result = svc.get_languages_with_voice_cloning()
        assert "en" in result
        assert "fr" in result
        assert "am" not in result
        assert "ln" in result

    def test_get_mms_only_languages(self):
        svc = make_service()
        result = svc.get_mms_only_languages()
        assert "am" in result
        assert "yo" in result
        assert "en" not in result
        assert "ln" not in result


class TestGetStats:
    def test_returns_expected_keys(self):
        svc = make_service()
        stats = svc.get_stats()
        for key in ["total_languages", "tts_supported", "stt_supported",
                    "voice_cloning", "mms_tts", "mms_asr", "regions"]:
            assert key in stats, f"Missing key: {key}"

    def test_total_languages_positive(self):
        svc = make_service()
        stats = svc.get_stats()
        assert stats["total_languages"] > 0

    def test_voice_cloning_subset_of_tts(self):
        svc = make_service()
        stats = svc.get_stats()
        assert stats["voice_cloning"] <= stats["tts_supported"]

    def test_mms_tts_subset_of_tts(self):
        svc = make_service()
        stats = svc.get_stats()
        assert stats["mms_tts"] <= stats["tts_supported"]

    def test_regions_list(self):
        svc = make_service()
        stats = svc.get_stats()
        assert isinstance(stats["regions"], list)
        assert "Europe" in stats["regions"]
        assert "Asia" in stats["regions"]

    def test_counts_are_non_negative(self):
        svc = make_service()
        stats = svc.get_stats()
        for key in ["total_languages", "tts_supported", "stt_supported",
                    "voice_cloning", "mms_tts", "mms_asr"]:
            assert stats[key] >= 0, f"Negative count for {key}"
