"""Helpers for determining which season the scrapers should process."""

import sys
from datetime import date


def current_season(today=None):
    """Return the active season label, e.g. "2026-27".

    The season label uses the year the season starts. July 1 is used as the
    rollover point so the new season is selected during preseason, after the
    previous season has finished.
    """
    today = today or date.today()
    start_year = today.year if today.month >= 7 else today.year - 1
    return f"{start_year}-{str(start_year + 1)[-2:]}"


def resolve_season(argv=None):
    """Use a season passed on the command line, otherwise the current season."""
    argv = sys.argv if argv is None else argv
    return argv[1] if len(argv) > 1 else current_season()
