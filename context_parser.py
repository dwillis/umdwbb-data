"""
Exports per-game and per-period team context stats from raw game JSONs.

These fields (points in paint, fast-break, second-chance, bench points, lead
tracking, possessions) exist in every game JSON back to 2014-15 but were never
exported to CSV. Output files are regenerated wholesale on every run:

  {season}/team_game_context.csv    - 2 rows per game
  {season}/team_period_context.csv  - 2 rows per period per game
"""

import argparse
import csv
from pathlib import Path

import pbp_common

GAME_CONTEXT_COLUMNS = [
    'source_id', 'file_id', 'team', 'opponent', 'is_home',
    'points_in_paint', 'points_off_turnovers', 'points_fastbreak',
    'points_second_chance', 'points_from_bench',
    'largest_lead', 'largest_lead_time', 'time_with_lead_sec', 'pct_lead',
    'ties', 'lead_changes', 'possessions', 'avg_scoring_possession',
    'largest_deficit',
]

PERIOD_CONTEXT_COLUMNS = [
    'source_id', 'file_id', 'team', 'period',
    'points', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
    'offensive_rebounds', 'defensive_rebounds', 'rebounds',
    'assists', 'turnovers', 'steals', 'blocks', 'personal_fouls',
    'points_in_paint', 'points_off_turnovers', 'points_fastbreak',
    'points_second_chance', 'points_from_bench',
]


def split_made_attempted(value):
    try:
        made, attempted = str(value).split('-')
        return int(made), int(attempted)
    except (ValueError, AttributeError):
        return 0, 0


def largest_deficits(data):
    """Max points each team trailed by at any moment: {'HomeTeam': n, 'VisitingTeam': n}."""
    worst = {'HomeTeam': 0, 'VisitingTeam': 0}
    for play in pbp_common.normalized_plays(data):
        margin = play['home_score'] - play['visiting_score']
        worst['HomeTeam'] = max(worst['HomeTeam'], -margin)
        worst['VisitingTeam'] = max(worst['VisitingTeam'], margin)
    return worst


def game_context_rows(data, season, file_id):
    names = pbp_common.team_names(data)
    deficits = largest_deficits(data)
    rows = []
    for team_key in ('HomeTeam', 'VisitingTeam'):
        totals = data['Stats'][team_key]['Totals']['Values']
        opponent_key = 'VisitingTeam' if team_key == 'HomeTeam' else 'HomeTeam'
        rows.append({
            'source_id': season,
            'file_id': file_id,
            'team': names[team_key],
            'opponent': names[opponent_key],
            'is_home': 1 if team_key == 'HomeTeam' else 0,
            'points_in_paint': pbp_common.to_int(totals.get('PointsInPaint')),
            'points_off_turnovers': pbp_common.to_int(totals.get('PointsOffTurnovers')),
            'points_fastbreak': pbp_common.to_int(totals.get('PointsOffFastBreak')),
            'points_second_chance': pbp_common.to_int(totals.get('PointsOffSecondChance')),
            'points_from_bench': pbp_common.to_int(totals.get('PointsFromBench')),
            'largest_lead': pbp_common.to_int(totals.get('LargestLead')),
            'largest_lead_time': totals.get('LargestLeadTime', ''),
            'time_with_lead_sec': pbp_common.mmss_to_seconds(totals.get('TimeWithLead')),
            'pct_lead': pbp_common.to_float(totals.get('PercentLead')),
            'ties': pbp_common.to_int(totals.get('Ties')),
            'lead_changes': pbp_common.to_int(totals.get('Leads')),
            'possessions': pbp_common.to_int(totals.get('Possession')),
            'avg_scoring_possession': totals.get('AverageScoringPossession', ''),
            'largest_deficit': deficits[team_key],
        })
    return rows


def period_context_rows(data, season, file_id):
    names = pbp_common.team_names(data)
    rows = []
    for team_key in ('HomeTeam', 'VisitingTeam'):
        period_stats = data['Stats'][team_key].get('PeriodStats') or []
        for period_index, entry in enumerate(period_stats, start=1):
            values = entry.get('Values') or {}
            fgm, fga = split_made_attempted(values.get('Fgam'))
            tpm, tpa = split_made_attempted(values.get('Tpam'))
            ftm, fta = split_made_attempted(values.get('Ftma'))
            rows.append({
                'source_id': season,
                'file_id': file_id,
                'team': names[team_key],
                'period': period_index,
                'points': pbp_common.to_int(values.get('Points')),
                'fgm': fgm, 'fga': fga,
                'tpm': tpm, 'tpa': tpa,
                'ftm': ftm, 'fta': fta,
                'offensive_rebounds': pbp_common.to_int(values.get('OffensiveRebounds')),
                'defensive_rebounds': pbp_common.to_int(values.get('DefensiveRebounds')),
                'rebounds': pbp_common.to_int(values.get('TotalRebounds')),
                'assists': pbp_common.to_int(values.get('Assists')),
                'turnovers': pbp_common.to_int(values.get('Turnovers')),
                'steals': pbp_common.to_int(values.get('Steals')),
                'blocks': pbp_common.to_int(values.get('Blocks')),
                'personal_fouls': pbp_common.to_int(values.get('PersonalFouls')),
                'points_in_paint': pbp_common.to_int(values.get('PointsInPaint')),
                'points_off_turnovers': pbp_common.to_int(values.get('PointsOffTurnovers')),
                'points_fastbreak': pbp_common.to_int(values.get('PointsOffFastBreak')),
                'points_second_chance': pbp_common.to_int(values.get('PointsOffSecondChance')),
                'points_from_bench': pbp_common.to_int(values.get('PointsFromBench')),
            })
    return rows


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

    game_rows, period_rows = [], []
    for json_path in pbp_common.season_json_files(season_path):
        data, file_id = pbp_common.load_game(json_path)
        if not data:
            print(f"Skipping unreadable game file {json_path}")
            continue
        game_rows.extend(game_context_rows(data, season, file_id))
        period_rows.extend(period_context_rows(data, season, file_id))

    if game_rows:
        write_csv(season_path / 'team_game_context.csv', GAME_CONTEXT_COLUMNS, game_rows)
    if period_rows:
        write_csv(season_path / 'team_period_context.csv', PERIOD_CONTEXT_COLUMNS, period_rows)


def main():
    parser = argparse.ArgumentParser(description="Export team game/period context stats")
    parser.add_argument('season', nargs='?', default='2025-26')
    args = parser.parse_args()
    process_season(args.season)


if __name__ == '__main__':
    main()
