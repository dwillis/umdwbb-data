"""
Shared play-by-play utilities used by the parsing pipeline.

Centralizes game-clock math (halves vs quarters vs OT), running-score
forward-filling, substitution narrative parsing, and starter inference so
that game_parser.py, context_parser.py, enrich_pbp.py and lineup_engine.py
all agree on the same definitions.
"""

import json
import re
from pathlib import Path

SEASONS = [
    '2014-15', '2015-16', '2016-17', '2017-18', '2018-19', '2019-20',
    '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'
]

SHOT_TYPES = {'LAYUP', 'JUMPER', '3PTR', 'TIPIN', 'DUNK'}

SUB_SEGMENT_RE = re.compile(r'^\s*(\d+)\s+(.+?)\s+(OUT|IN)\s*$')


def load_game(filepath):
    """Load a game JSON file, returning (data, file_id) or (None, None)."""
    path = Path(filepath)
    try:
        with open(path) as f:
            data = json.load(f)
        return data, path.stem
    except (json.JSONDecodeError, OSError):
        return None, None


def season_json_files(season_dir):
    """All game JSONs for a season, ordered by numeric game id."""
    paths = list(Path(season_dir).glob('*.json'))

    def sort_key(p):
        try:
            return (0, int(p.stem))
        except ValueError:
            return (1, p.stem)

    return sorted(paths, key=sort_key)


def game_rules(data):
    """Return (period_seconds, ot_seconds, periods_regulation) for a game."""
    rules = data['Game'].get('Rules') or {}
    period_minutes = rules.get('PeriodMinutes') or 10
    ot_minutes = rules.get('OTMinutes') or 5
    periods_regulation = data['Game'].get('PeriodsRegulation') or 4
    return period_minutes * 60, ot_minutes * 60, periods_regulation


def period_length(period, rules):
    """Length in seconds of a given period under the game's rules."""
    period_seconds, ot_seconds, periods_regulation = rules
    return period_seconds if period <= periods_regulation else ot_seconds


def seconds_elapsed(period, clock_seconds, rules):
    """Absolute game seconds elapsed at a moment (period + countdown clock)."""
    period_seconds, ot_seconds, periods_regulation = rules
    if period <= periods_regulation:
        before = (period - 1) * period_seconds
    else:
        before = (periods_regulation * period_seconds
                  + (period - 1 - periods_regulation) * ot_seconds)
    clock = clock_seconds if clock_seconds is not None else 0
    return before + (period_length(period, rules) - clock)


def game_length(data):
    """Total seconds in a game, accounting for OT periods actually played."""
    rules = game_rules(data)
    last_period = max((p['Period'] for p in data['Plays']), default=rules[2])
    return seconds_elapsed(last_period, 0, rules)


def team_names(data):
    """Return {'HomeTeam': name, 'VisitingTeam': name}."""
    return {
        'HomeTeam': data['Game']['HomeTeam']['Name'],
        'VisitingTeam': data['Game']['VisitingTeam']['Name'],
    }


def player_full_name(player):
    """Full name from a play's Player/InvolvedPlayers entry."""
    if not player:
        return None
    return f"{player.get('FirstName', '') or ''} {player.get('LastName', '') or ''}".strip() or None


def player_number(player):
    """Uniform number as an int (or None) from a play's player entry."""
    if not player:
        return None
    try:
        return int(player.get('UniformNumber'))
    except (TypeError, ValueError):
        return None


def parse_subs_narrative(narrative):
    """Parse 'NN Name OUT; NN Name IN; ...' into (out_list, in_list).

    Each list holds (number:int, name:str) tuples. Segments that don't match
    the pattern (e.g. team-level notes) are ignored.
    """
    players_out, players_in = [], []
    for segment in (narrative or '').split(';'):
        m = SUB_SEGMENT_RE.match(segment)
        if not m:
            continue
        number, name, direction = int(m.group(1)), m.group(2).strip(), m.group(3)
        (players_out if direction == 'OUT' else players_in).append((number, name))
    return players_out, players_in


def normalized_plays(data):
    """Chronological plays with forward-filled running scores.

    Yields dicts with: index, play_id, period, clock_seconds, seconds_elapsed,
    team_key (HomeTeam/VisitingTeam/None), team (name), play_type, play_action,
    narrative, player_name, player_number, home_score, visiting_score, points
    (points scored by this play, 0 if non-scoring).
    """
    rules = game_rules(data)
    names = team_names(data)
    home, visiting = 0, 0
    out = []
    for i, play in enumerate(data['Plays']):
        points = 0
        score = play.get('Score')
        if score and score.get('HomeTeam') is not None:
            new_home = int(score['HomeTeam'])
            new_visiting = int(score['VisitingTeam'])
            points = (new_home - home) + (new_visiting - visiting)
            home, visiting = new_home, new_visiting
        team_key = play.get('Team') if play.get('Team') in names else None
        out.append({
            'index': i,
            'play_id': play.get('Id'),
            'period': play['Period'],
            'clock_seconds': play['ClockSeconds'],
            'seconds_elapsed': seconds_elapsed(play['Period'], play['ClockSeconds'], rules),
            'team_key': team_key,
            'team': names.get(team_key, play.get('Team')),
            'play_type': play.get('Type'),
            'play_action': play.get('Action'),
            'narrative': play.get('Narrative'),
            'player_name': player_full_name(play.get('Player')),
            'player_number': player_number(play.get('Player')),
            'involved': play.get('InvolvedPlayers') or [],
            'home_score': home,
            'visiting_score': visiting,
            'points': max(points, 0),
        })
    return out


def infer_starters(data):
    """Infer starting fives from play order.

    A player is a starter if their first appearance in the play log is an
    action or a sub OUT — i.e. they were on the floor before ever subbing IN.
    Returns {'HomeTeam': [(number, name), ...], 'VisitingTeam': [...]} with
    up to 5 entries per team.
    """
    starters = {'HomeTeam': [], 'VisitingTeam': []}
    entered_via_sub = {'HomeTeam': set(), 'VisitingTeam': set()}

    def is_known(team_key, number):
        return (number in entered_via_sub[team_key]
                or any(num == number for num, _ in starters[team_key]))

    for play in data['Plays']:
        team_key = play.get('Team')
        if team_key not in starters:
            continue
        if play.get('Type') == 'SUBS':
            players_out, players_in = parse_subs_narrative(play.get('Narrative'))
            for number, name in players_out:
                if not is_known(team_key, number) and len(starters[team_key]) < 5:
                    starters[team_key].append((number, name))
            for number, name in players_in:
                if not is_known(team_key, number):
                    entered_via_sub[team_key].add(number)
        else:
            number = player_number(play.get('Player'))
            name = player_full_name(play.get('Player'))
            if number is None or name is None:
                continue
            if not is_known(team_key, number) and len(starters[team_key]) < 5:
                starters[team_key].append((number, name))
        if len(starters['HomeTeam']) == 5 and len(starters['VisitingTeam']) == 5:
            break

    return starters


def to_int(value, default=0):
    """Parse stat values that may be '', '-', or numeric strings."""
    try:
        return int(str(value).replace(',', ''))
    except (TypeError, ValueError):
        return default


def to_float(value, default=0.0):
    try:
        return float(str(value).replace('%', '').replace(',', ''))
    except (TypeError, ValueError):
        return default


def mmss_to_seconds(value, default=0):
    """Convert 'MM:SS' strings (e.g. TimeWithLead) to seconds."""
    try:
        minutes, secs = str(value).split(':')
        return int(minutes) * 60 + int(secs)
    except (AttributeError, ValueError):
        return default
