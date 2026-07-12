"""
Derives event-level analysis tables from raw game JSONs for one season:

  {season}/fouls.csv       - every personal/technical foul with game context
  {season}/ft_trips.csv    - free throw trips (consecutive FTs grouped)
  {season}/runs.csv        - unanswered scoring runs of 6+ points
  {season}/streaks.csv     - notable Maryland make/miss streaks (cross-game)
  {season}/heat_check.csv  - Maryland FG% when "hot" vs "cold" vs baseline

All files are regenerated wholesale on each run.

Known data limits (documented in the site UI as well): fouls carry no
shooting/offensive typing, and the feed has no 1-and-1 marker so free throw
trips are grouped heuristically by (player, period, clock).
"""

import argparse
import csv
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pbp_common

PF_COUNT_RE = re.compile(r'\((\d+) PF\)')

FOUL_COLUMNS = [
    'source_id', 'file_id', 'period', 'time_remaining', 'seconds_elapsed',
    'team', 'player_name', 'player_number', 'foul_type', 'player_foul_count',
    'team_fouls_in_period', 'bonus_active', 'margin_at_foul',
]

FT_TRIP_COLUMNS = [
    'source_id', 'file_id', 'period', 'time_remaining', 'seconds_elapsed',
    'team', 'player_name', 'player_number', 'trip_size', 'made', 'missed',
    'trip_result', 'first_attempt_made', 'margin_before', 'clutch',
    'trip_context',
]

RUN_COLUMNS = [
    'source_id', 'file_id', 'team', 'opponent', 'points',
    'start_seconds', 'end_seconds', 'duration',
    'period_start', 'period_end', 'score_before', 'score_after',
]

STREAK_COLUMNS = [
    'source_id', 'player_name', 'streak_type', 'length',
    'start_date', 'end_date', 'start_file_id', 'end_file_id',
    'spans_games', 'active',
]

HEAT_CHECK_COLUMNS = [
    'source_id', 'player_name',
    'fga_hot', 'fgm_hot', 'pct_hot',
    'fga_cold', 'fgm_cold', 'pct_cold',
    'fga_all', 'fgm_all', 'pct_all',
]

# Minimum lengths for a streak to be recorded
STREAK_THRESHOLDS = {
    'fg_makes': 4,
    'three_makes': 3,
    'ft_makes': 6,
    'fg_misses': 5,
}


def game_date(data):
    try:
        return datetime.strptime(data['Game']['Date'], '%m/%d/%Y')
    except (KeyError, ValueError):
        return datetime.min


def margins_before(plays):
    """margin (home - visiting) immediately before each play index."""
    result = []
    prev = 0
    for play in plays:
        result.append(prev)
        prev = play['home_score'] - play['visiting_score']
    return result


def team_margin(play, team_name, names):
    """Score margin from team_name's perspective at/after this play."""
    home_margin = play['home_score'] - play['visiting_score']
    return home_margin if team_name == names['HomeTeam'] else -home_margin


def is_clutch(play, rules, margin_abs):
    """Last 5 minutes of regulation or any OT, margin within 5."""
    _, _, periods_regulation = rules
    in_window = (play['period'] == periods_regulation and play['clock_seconds'] <= 300) \
        or play['period'] > periods_regulation
    return in_window and margin_abs <= 5


def extract_fouls(data, season, file_id):
    rules = pbp_common.game_rules(data)
    names = pbp_common.team_names(data)
    # Bonus threshold: 5 team fouls per quarter (quarters era), 7 per half (2014-15)
    bonus_threshold = 5 if rules[2] >= 4 else 7
    team_fouls = defaultdict(int)  # (team, period) -> count
    rows = []
    for play in pbp_common.normalized_plays(data):
        if play['play_type'] not in ('FOUL', 'TECH'):
            continue
        team = play['team']
        foul_type = 'technical' if play['play_type'] == 'TECH' else 'personal'
        if foul_type == 'personal':
            team_fouls[(team, play['period'])] += 1
        count_match = PF_COUNT_RE.search(play['narrative'] or '')
        fouls_in_period = team_fouls[(team, play['period'])]
        rows.append({
            'source_id': season,
            'file_id': file_id,
            'period': play['period'],
            'time_remaining': play['clock_seconds'],
            'seconds_elapsed': play['seconds_elapsed'],
            'team': team,
            'player_name': play['player_name'] or '',
            'player_number': play['player_number'] if play['player_number'] is not None else '',
            'foul_type': foul_type,
            'player_foul_count': int(count_match.group(1)) if count_match else '',
            'team_fouls_in_period': fouls_in_period,
            'bonus_active': 1 if fouls_in_period >= bonus_threshold else 0,
            'margin_at_foul': team_margin(play, team, names) if team in names.values() else '',
        })
    return rows


def extract_ft_trips(data, season, file_id):
    rules = pbp_common.game_rules(data)
    names = pbp_common.team_names(data)
    plays = pbp_common.normalized_plays(data)
    prior_margins = margins_before(plays)

    # Group FT attempts by (player, period, clock) — attempts in one trip
    # share the same stopped clock.
    trips = {}
    order = []
    for i, play in enumerate(plays):
        if play['play_type'] != 'FT' or not play['player_name']:
            continue
        key = (play['player_name'], play['period'], play['clock_seconds'])
        if key not in trips:
            trips[key] = {'plays': [], 'first_index': i}
            order.append(key)
        trips[key]['plays'].append((i, play))

    rows = []
    for key in order:
        trip_plays = trips[key]['plays']
        first_index, first_play = trip_plays[0]
        team = first_play['team']
        made = sum(1 for _, p in trip_plays if p['play_action'] == 'GOOD')
        size = len(trip_plays)

        home_margin_before = prior_margins[first_index]
        margin_before = home_margin_before if team == names['HomeTeam'] else -home_margin_before

        # Classify 1-attempt trips: and-one (preceded by a made shot by the
        # same team at the same clock), technical FTs, or other (front end of
        # a missed 1-and-1, flagrant singles, etc.)
        context = ''
        if size == 1:
            context = 'other'
            for j in range(first_index - 1, max(first_index - 6, -1), -1):
                prev = plays[j]
                if prev['clock_seconds'] != first_play['clock_seconds'] or prev['period'] != first_play['period']:
                    break
                if prev['play_type'] == 'TECH':
                    context = 'technical'
                    break
                if (prev['play_type'] in pbp_common.SHOT_TYPES and prev['play_action'] == 'GOOD'
                        and prev['team'] == team):
                    context = 'and_one'
                    break

        rows.append({
            'source_id': season,
            'file_id': file_id,
            'period': first_play['period'],
            'time_remaining': first_play['clock_seconds'],
            'seconds_elapsed': first_play['seconds_elapsed'],
            'team': team,
            'player_name': first_play['player_name'],
            'player_number': first_play['player_number'] if first_play['player_number'] is not None else '',
            'trip_size': size,
            'made': made,
            'missed': size - made,
            'trip_result': f"{made}/{size}",
            'first_attempt_made': 1 if trip_plays[0][1]['play_action'] == 'GOOD' else 0,
            'margin_before': margin_before,
            'clutch': 1 if is_clutch(first_play, rules, abs(margin_before)) else 0,
            'trip_context': context,
        })
    return rows


def extract_runs(data, season, file_id, min_points=6):
    names = pbp_common.team_names(data)
    plays = pbp_common.normalized_plays(data)

    rows = []
    run = None  # {'side', 'points', 'start_seconds', 'start_period', 'score_before'}
    prev_home, prev_visiting = 0, 0

    def flush(end_play):
        if run and run['points'] >= min_points:
            side_name = names[run['side']]
            opp_name = names['VisitingTeam' if run['side'] == 'HomeTeam' else 'HomeTeam']
            rows.append({
                'source_id': season,
                'file_id': file_id,
                'team': side_name,
                'opponent': opp_name,
                'points': run['points'],
                'start_seconds': run['start_seconds'],
                'end_seconds': run['end_seconds'],
                'duration': run['end_seconds'] - run['start_seconds'],
                'period_start': run['start_period'],
                'period_end': run['end_period'],
                'score_before': run['score_before'],
                'score_after': f"{run['end_home']}-{run['end_visiting']}",
            })

    for play in plays:
        if play['points'] <= 0:
            continue
        side = 'HomeTeam' if play['home_score'] > prev_home else 'VisitingTeam'
        if run and run['side'] == side:
            run['points'] += play['points']
            run['end_seconds'] = play['seconds_elapsed']
            run['end_period'] = play['period']
            run['end_home'], run['end_visiting'] = play['home_score'], play['visiting_score']
        else:
            flush(play)
            run = {
                'side': side,
                'points': play['points'],
                'start_seconds': play['seconds_elapsed'],
                'end_seconds': play['seconds_elapsed'],
                'start_period': play['period'],
                'end_period': play['period'],
                'score_before': f"{prev_home}-{prev_visiting}",
                'end_home': play['home_score'],
                'end_visiting': play['visiting_score'],
            }
        prev_home, prev_visiting = play['home_score'], play['visiting_score']

    flush(None)
    return rows


def shot_events(data, team_name):
    """Chronological (player, kind, made) shot events for one team.

    kind is 'fg' for all field goals (3PTR included) plus a separate
    'three' event for 3-point attempts; 'ft' for free throws.
    """
    events = []
    for play in pbp_common.normalized_plays(data):
        if play['team'] != team_name or not play['player_name']:
            continue
        if play['play_action'] not in ('GOOD', 'MISS'):
            continue
        made = play['play_action'] == 'GOOD'
        if play['play_type'] in pbp_common.SHOT_TYPES:
            events.append((play['player_name'], 'fg', made))
            if play['play_type'] == '3PTR':
                events.append((play['player_name'], 'three', made))
        elif play['play_type'] == 'FT':
            events.append((play['player_name'], 'ft', made))
    return events


def build_streaks_and_heat(games, season, team_name='Maryland'):
    """Cross-game streak detection + hot/cold hand splits for one team.

    games: list of (date, file_id, data) sorted chronologically.
    """
    # Per-player running streak state across games:
    # streak[(player, type)] = {'length', 'start_date', 'start_file_id'}
    current = {}
    finished = []

    def close(key, end_date, end_file_id):
        state = current.pop(key, None)
        if not state:
            return
        player, streak_type = key
        if state['length'] >= STREAK_THRESHOLDS[streak_type]:
            finished.append({
                'source_id': season,
                'player_name': player,
                'streak_type': streak_type,
                'length': state['length'],
                'start_date': state['start_date'],
                'end_date': end_date,
                'start_file_id': state['start_file_id'],
                'end_file_id': end_file_id,
                'spans_games': 1 if state['start_file_id'] != end_file_id else 0,
                'active': 0,
            })

    def advance(player, streak_type, date_str, file_id):
        key = (player, streak_type)
        if key not in current:
            current[key] = {'length': 0, 'start_date': date_str, 'start_file_id': file_id}
        current[key]['length'] += 1
        current[key].setdefault('end_date', date_str)
        current[key]['end_date'] = date_str
        current[key]['end_file_id'] = file_id

    # Hot/cold-hand tracking (within a single game only)
    heat = defaultdict(lambda: {'fga_hot': 0, 'fgm_hot': 0, 'fga_cold': 0,
                                'fgm_cold': 0, 'fga_all': 0, 'fgm_all': 0})

    for date, file_id, data in games:
        date_str = date.strftime('%Y-%m-%d') if date != datetime.min else ''
        in_game_fg = defaultdict(int)  # player -> consecutive makes(+)/misses(-)

        for player, kind, made in shot_events(data, team_name):
            if kind == 'fg':
                streak_state = in_game_fg[player]
                stats = heat[player]
                stats['fga_all'] += 1
                if streak_state >= 2:
                    stats['fga_hot'] += 1
                elif streak_state <= -2:
                    stats['fga_cold'] += 1
                if made:
                    stats['fgm_all'] += 1
                    if streak_state >= 2:
                        stats['fgm_hot'] += 1
                    elif streak_state <= -2:
                        stats['fgm_cold'] += 1
                if made:
                    in_game_fg[player] = streak_state + 1 if streak_state >= 0 else 1
                else:
                    in_game_fg[player] = streak_state - 1 if streak_state <= 0 else -1

            make_type = {'fg': 'fg_makes', 'three': 'three_makes', 'ft': 'ft_makes'}[kind]
            if made:
                advance(player, make_type, date_str, file_id)
                if kind == 'fg':
                    close((player, 'fg_misses'), date_str, file_id)
            else:
                state = current.get((player, make_type))
                close((player, make_type),
                      state['end_date'] if state else date_str,
                      state['end_file_id'] if state else file_id)
                if kind == 'fg':
                    advance(player, 'fg_misses', date_str, file_id)

    # Streaks still alive at season end
    for key in list(current.keys()):
        player, streak_type = key
        state = current[key]
        if state['length'] >= STREAK_THRESHOLDS[streak_type]:
            finished.append({
                'source_id': season,
                'player_name': player,
                'streak_type': streak_type,
                'length': state['length'],
                'start_date': state['start_date'],
                'end_date': state.get('end_date', state['start_date']),
                'start_file_id': state['start_file_id'],
                'end_file_id': state.get('end_file_id', state['start_file_id']),
                'spans_games': 1 if state['start_file_id'] != state.get('end_file_id', state['start_file_id']) else 0,
                'active': 1,
            })

    finished.sort(key=lambda r: (-r['length'], r['streak_type'], r['player_name']))

    heat_rows = []
    team_totals = defaultdict(int)
    for player in sorted(heat):
        stats = heat[player]
        for k, v in stats.items():
            team_totals[k] += v
        if stats['fga_all'] < 30:
            continue
        heat_rows.append(heat_row(season, player, stats))
    heat_rows.append(heat_row(season, 'TEAM', team_totals))
    return finished, heat_rows


def heat_row(season, player, stats):
    def pct(made, attempts):
        return round(made / attempts * 100, 1) if attempts else ''
    return {
        'source_id': season,
        'player_name': player,
        'fga_hot': stats['fga_hot'], 'fgm_hot': stats['fgm_hot'],
        'pct_hot': pct(stats['fgm_hot'], stats['fga_hot']),
        'fga_cold': stats['fga_cold'], 'fgm_cold': stats['fgm_cold'],
        'pct_cold': pct(stats['fgm_cold'], stats['fga_cold']),
        'fga_all': stats['fga_all'], 'fgm_all': stats['fgm_all'],
        'pct_all': pct(stats['fgm_all'], stats['fga_all']),
    }


def write_csv(path, columns, rows):
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {path}")


def process_season(season, base_dir='.'):
    season_path = Path(base_dir) / season
    if not season_path.exists():
        print(f"Error: season directory {season_path} does not exist")
        return

    games = []
    foul_rows, trip_rows, run_rows = [], [], []
    for json_path in pbp_common.season_json_files(season_path):
        data, file_id = pbp_common.load_game(json_path)
        if not data:
            print(f"Skipping unreadable game file {json_path}")
            continue
        games.append((game_date(data), file_id, data))
        foul_rows.extend(extract_fouls(data, season, file_id))
        trip_rows.extend(extract_ft_trips(data, season, file_id))
        run_rows.extend(extract_runs(data, season, file_id))

    games.sort(key=lambda g: (g[0], g[1]))
    streak_rows, heat_rows = build_streaks_and_heat(games, season)

    write_csv(season_path / 'fouls.csv', FOUL_COLUMNS, foul_rows)
    write_csv(season_path / 'ft_trips.csv', FT_TRIP_COLUMNS, trip_rows)
    write_csv(season_path / 'runs.csv', RUN_COLUMNS, run_rows)
    write_csv(season_path / 'streaks.csv', STREAK_COLUMNS, streak_rows)
    write_csv(season_path / 'heat_check.csv', HEAT_CHECK_COLUMNS, heat_rows)


def main():
    parser = argparse.ArgumentParser(description="Derive foul/FT/run/streak tables from game JSONs")
    parser.add_argument('season', nargs='?', default='2025-26')
    args = parser.parse_args()
    process_season(args.season)


if __name__ == '__main__':
    main()
