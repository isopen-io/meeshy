"""
Voice API Handler - Compatibility shim for backward compatibility
DEPRECATED: Import from services.voice_api instead

This module provides backward compatibility for code that imports
from the old voice_api_handler.py location. New code should import
from services.voice_api package instead.
"""

import warnings

# Import all exports from new modular structure
from .voice_api import (
    VoiceAPIHandler,
    get_voice_api_handler,
    reset_voice_api_handler,
    RequestHandler,
    OperationHandlers,
    SystemHandlers,
    VoiceAPIResult
)

# Deprecated warning
warnings.warn(
    "Importing from services.voice_api_handler is deprecated. "
    "Please import from services.voice_api instead.",
    DeprecationWarning,
    stacklevel=2
)

__all__ = [
    'VoiceAPIHandler',
    'get_voice_api_handler',
    'reset_voice_api_handler',
    'RequestHandler',
    'OperationHandlers',
    'SystemHandlers',
    'VoiceAPIResult'
]
