import re
from typing import Any

COMMON_FILLER_WORDS = [
    "um",
    "uh",
    "er",
    "ah",
    "like",
    "you know",
    "actually",
    "basically",
    "literally",
    "i mean",
    "so",
]

# Precompile regex patterns for whole-word/phrase boundary matching (case-insensitive)
FILLER_PATTERNS = [
    (phrase, re.compile(rf"\b{re.escape(phrase)}\b", re.IGNORECASE))
    for phrase in sorted(COMMON_FILLER_WORDS, key=len, reverse=True)
]


def count_words(text: str) -> int:
    """Return the number of words in a text string."""
    if not text:
        return 0
    words = text.strip().split()
    return len(words)


def calculate_words_per_minute(word_count: int, duration_seconds: float | None) -> float | None:
    """Calculate words per minute (WPM) given word count and duration in seconds."""
    if duration_seconds is None or duration_seconds <= 0 or word_count <= 0:
        return None
    wpm = (word_count / duration_seconds) * 60.0
    return round(wpm, 1)


def find_filler_words(text: str) -> dict[str, int]:
    """Find and count occurrences of common filler words and phrases in the text."""
    if not text:
        return {}

    counts: dict[str, int] = {}
    for phrase, pattern in FILLER_PATTERNS:
        matches = len(pattern.findall(text))
        if matches > 0:
            counts[phrase] = matches
    return counts


def analyze_speech(
    transcript: str | None,
    duration_seconds: float | None = None,
) -> dict[str, Any]:
    """Calculate basic speech delivery metrics from transcript and duration.

    Disclaimer: Speech pace and filler word counts are provided for delivery awareness
    only and do not measure candidate knowledge, competence, or confidence.
    """
    clean_text = transcript.strip() if transcript else ""
    word_count = count_words(clean_text)
    rounded_duration = round(duration_seconds, 2) if duration_seconds is not None else None
    wpm = calculate_words_per_minute(word_count, rounded_duration)
    filler_counts = find_filler_words(clean_text)
    total_fillers = sum(filler_counts.values())

    return {
        "word_count": word_count,
        "duration_seconds": rounded_duration,
        "words_per_minute": wpm,
        "filler_words_count": total_fillers,
        "filler_words": filler_counts,
        "pause_analysis": "Pause analysis is not yet available",
    }
