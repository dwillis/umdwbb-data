"""
Builds cross-season index files consumed by the site's player, opponent,
officials, and records pages. Outputs to the repo-root data/ directory:

  data/players_index.json     - canonical Maryland player ids across seasons
  data/career_stats.csv       - one row per Maryland player-season
  data/opponents_index.csv    - every Maryland game keyed by opponent
  data/officials_summary.csv  - per-official game counts and foul tendencies
  data/records.json           - precomputed records & milestones

Player identity: the feed's PersonId is always empty, so identity is a slug
of the full name from play-by-play data, joined to the abbreviated box-score
names via uniform number within each season. Distinct players who share a
full name across eras would collide; acceptable for this dataset.
"""

import argparse
import csv
import json
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

import pbp_common

TEAM = 'Maryland'

CAREER_COLUMNS = [
    'player_id', 'player_name', 'season', 'games', 'starts', 'minutes',
    'points', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
    'offensive_rebounds', 'defensive_rebounds', 'rebounds',
    'assists', 'steals', 'blocks', 'turnovers', 'personal_fouls',
    'high_points', 'double_doubles', 'triple_doubles',
]

OPPONENT_COLUMNS = [
    'opponent', 'season', 'file_id', 'date', 'location', 'is_home',
    'maryland_score', 'opponent_score', 'result', 'margin',
]

OFFICIALS_COLUMNS = [
    'official', 'games', 'first_season', 'last_season', 'umd_wins', 'umd_losses',
    'avg_fouls_total', 'avg_fouls_umd', 'avg_fouls_opp',
    'avg_fta_umd', 'avg_fta_opp',
]


def slugify(name):
    return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')


def parse_date(value):
    try:
        return datetime.strptime(value, '%m/%d/%Y')
    except (TypeError, ValueError):
        return datetime.min


def read_csv(path):
    try:
        with open(path, newline='') as f:
            return list(csv.DictReader(f))
    except FileNotFoundError:
        return []


def norm_file_id(value):
    return str(value).split('.')[0].strip()


def made_attempted(value):
    try:
        made, attempted = str(value).split('-')
        return int(made), int(attempted)
    except (ValueError, AttributeError):
        return 0, 0


def full_name_maps(season):
    """Per-season {(team_name, number:int): full_name} from game JSONs."""
    mapping = {}
    for json_path in pbp_common.season_json_files(season):
        data, _ = pbp_common.load_game(json_path)
        if not data:
            continue
        names = pbp_common.team_names(data)
        for play in data['Plays']:
            player = play.get('Player')
            team_key = play.get('Team')
            if not player or team_key not in names:
                continue
            number = pbp_common.player_number(player)
            full = pbp_common.player_full_name(player)
            if number is not None and full:
                mapping.setdefault((names[team_key], number), full)
            for involved in play.get('InvolvedPlayers') or []:
                number = pbp_common.player_number(involved)
                full = pbp_common.player_full_name(involved)
                if number is not None and full:
                    mapping.setdefault((names[team_key], number), full)
    return mapping


def maryland_games(season):
    """Deduped Maryland games for a season with parsed metadata."""
    games = []
    seen = set()
    for row in read_csv(Path(season) / 'game_info.csv'):
        file_id = norm_file_id(row.get('file_id', ''))
        if not file_id or file_id in seen:
            continue
        seen.add(file_id)
        home, visiting = row['home_team'], row['visiting_team']
        if TEAM not in (home, visiting):
            continue
        is_home = home == TEAM
        md_score = pbp_common.to_int(row['home_score' if is_home else 'visiting_score'])
        opp_score = pbp_common.to_int(row['visiting_score' if is_home else 'home_score'])
        games.append({
            'season': season,
            'file_id': file_id,
            'date': parse_date(row.get('date')),
            'date_str': row.get('date', ''),
            'location': row.get('location', ''),
            'officials': row.get('officials', ''),
            'attendance': pbp_common.to_int(row.get('attendance')),
            'opponent': visiting if is_home else home,
            'is_home': 1 if is_home else 0,
            'maryland_score': md_score,
            'opponent_score': opp_score,
            'result': 'W' if md_score > opp_score else 'L',
            'margin': md_score - opp_score,
        })
    games.sort(key=lambda g: (g['date'], g['file_id']))
    return games


def build_players(seasons):
    """players_index.json entries + career_stats.csv rows."""
    index = {}
    career_rows = []

    for season in seasons:
        names_map = full_name_maps(season)
        stats_by_player = defaultdict(list)
        for row in read_csv(Path(season) / 'player_stats.csv'):
            if row.get('team') != TEAM:
                continue
            stats_by_player[(row['name'], pbp_common.to_int(row.get('number'), -1))].append(row)

        for (box_name, number), rows in stats_by_player.items():
            full_name = names_map.get((TEAM, number), box_name.title())
            player_id = slugify(full_name)

            totals = defaultdict(int)
            high_points = 0
            double_doubles = 0
            triple_doubles = 0
            for row in rows:
                fgm, fga = made_attempted(row.get('field_goals'))
                tpm, tpa = made_attempted(row.get('three_pointers'))
                ftm, fta = made_attempted(row.get('free_throws'))
                points = pbp_common.to_int(row.get('points'))
                rebounds = pbp_common.to_int(row.get('rebounds'))
                assists = pbp_common.to_int(row.get('assists'))
                totals['games'] += 1
                totals['starts'] += pbp_common.to_int(row.get('starter'))
                totals['minutes'] += pbp_common.to_int(row.get('minutes'))
                totals['points'] += points
                totals['fgm'] += fgm
                totals['fga'] += fga
                totals['tpm'] += tpm
                totals['tpa'] += tpa
                totals['ftm'] += ftm
                totals['fta'] += fta
                totals['offensive_rebounds'] += pbp_common.to_int(row.get('offensive_rebounds'))
                totals['defensive_rebounds'] += pbp_common.to_int(row.get('defensive_rebounds'))
                totals['rebounds'] += rebounds
                totals['assists'] += assists
                totals['steals'] += pbp_common.to_int(row.get('steals'))
                totals['blocks'] += pbp_common.to_int(row.get('blocks'))
                totals['turnovers'] += pbp_common.to_int(row.get('turnovers'))
                totals['personal_fouls'] += pbp_common.to_int(row.get('personal_fouls'))
                high_points = max(high_points, points)
                tens = sum(1 for v in (points, rebounds, assists,
                                       pbp_common.to_int(row.get('steals')),
                                       pbp_common.to_int(row.get('blocks'))) if v >= 10)
                if tens >= 2:
                    double_doubles += 1
                if tens >= 3:
                    triple_doubles += 1

            career_rows.append({
                'player_id': player_id,
                'player_name': full_name,
                'season': season,
                **{k: totals[k] for k in ('games', 'starts', 'minutes', 'points',
                                          'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
                                          'offensive_rebounds', 'defensive_rebounds',
                                          'rebounds', 'assists', 'steals', 'blocks',
                                          'turnovers', 'personal_fouls')},
                'high_points': high_points,
                'double_doubles': double_doubles,
                'triple_doubles': triple_doubles,
            })

            entry = index.setdefault(player_id, {'id': player_id, 'name': full_name, 'seasons': []})
            entry['seasons'].append({
                'season': season,
                'number': number,
                'box_name': box_name,
                'position': rows[0].get('position', ''),
                'games': totals['games'],
            })

    career_rows.sort(key=lambda r: (r['player_name'], r['season']))
    players = sorted(index.values(), key=lambda p: p['name'])
    return players, career_rows


def build_opponents(all_games):
    rows = []
    for game in all_games:
        rows.append({key: game[key] for key in
                     ('opponent', 'season', 'file_id', 'location', 'is_home',
                      'maryland_score', 'opponent_score', 'result', 'margin')}
                    | {'date': game['date_str']})
    return rows


def build_officials(all_games, seasons):
    """Per-official summary joined to team foul/FT totals per game."""
    fouls_by_game = {}
    for season in seasons:
        for row in read_csv(Path(season) / 'team_totals.csv'):
            file_id = norm_file_id(row.get('file_id', ''))
            entry = fouls_by_game.setdefault(file_id, {})
            _, fta = made_attempted(row.get('free_throws'))
            entry[row['team']] = (pbp_common.to_int(row.get('fouls')), fta)

    officials = defaultdict(lambda: {'games': 0, 'wins': 0, 'losses': 0, 'seasons': set(),
                                     'fouls_umd': 0, 'fouls_opp': 0, 'fta_umd': 0, 'fta_opp': 0,
                                     'games_with_fouls': 0})
    for game in all_games:
        names = [n.strip() for n in (game['officials'] or '').split(',') if n.strip()]
        game_fouls = fouls_by_game.get(game['file_id'], {})
        umd = game_fouls.get(TEAM)
        opp = game_fouls.get(game['opponent'])
        for name in names:
            o = officials[name]
            o['games'] += 1
            o['seasons'].add(game['season'])
            o['wins' if game['result'] == 'W' else 'losses'] += 1
            if umd and opp:
                o['games_with_fouls'] += 1
                o['fouls_umd'] += umd[0]
                o['fouls_opp'] += opp[0]
                o['fta_umd'] += umd[1]
                o['fta_opp'] += opp[1]

    rows = []
    for name, o in officials.items():
        n = o['games_with_fouls']
        rows.append({
            'official': name,
            'games': o['games'],
            'first_season': min(o['seasons']),
            'last_season': max(o['seasons']),
            'umd_wins': o['wins'],
            'umd_losses': o['losses'],
            'avg_fouls_total': round((o['fouls_umd'] + o['fouls_opp']) / n, 1) if n else '',
            'avg_fouls_umd': round(o['fouls_umd'] / n, 1) if n else '',
            'avg_fouls_opp': round(o['fouls_opp'] / n, 1) if n else '',
            'avg_fta_umd': round(o['fta_umd'] / n, 1) if n else '',
            'avg_fta_opp': round(o['fta_opp'] / n, 1) if n else '',
        })
    rows.sort(key=lambda r: -r['games'])
    return rows


def build_records(all_games, career_rows, seasons):
    """Precomputed records & milestones for the records page."""
    # Individual game highs from player_stats across seasons
    performances = []
    for season in seasons:
        names_map = None
        for row in read_csv(Path(season) / 'player_stats.csv'):
            if row.get('team') != TEAM:
                continue
            if names_map is None:
                names_map = full_name_maps(season)
            number = pbp_common.to_int(row.get('number'), -1)
            performances.append({
                'season': season,
                'file_id': norm_file_id(row.get('file_id', '')),
                'player': names_map.get((TEAM, number), row['name'].title()),
                'points': pbp_common.to_int(row.get('points')),
                'rebounds': pbp_common.to_int(row.get('rebounds')),
                'assists': pbp_common.to_int(row.get('assists')),
                'steals': pbp_common.to_int(row.get('steals')),
                'blocks': pbp_common.to_int(row.get('blocks')),
            })

    game_by_id = {g['file_id']: g for g in all_games}

    def top(stat, n=15):
        best = sorted(performances, key=lambda p: -p[stat])[:n]
        out = []
        for p in best:
            game = game_by_id.get(p['file_id'], {})
            out.append({
                'player': p['player'], 'value': p[stat], 'season': p['season'],
                'file_id': p['file_id'],
                'date': game.get('date_str', ''), 'opponent': game.get('opponent', ''),
                'result': f"{game.get('result', '')} {game.get('maryland_score', '')}-{game.get('opponent_score', '')}",
            })
        return out

    # Comebacks: winner's largest deficit from team_game_context
    comebacks = []
    for season in seasons:
        for row in read_csv(Path(season) / 'team_game_context.csv'):
            if row.get('team') != TEAM:
                continue
            file_id = norm_file_id(row.get('file_id', ''))
            game = game_by_id.get(file_id)
            deficit = pbp_common.to_int(row.get('largest_deficit'))
            if game and game['result'] == 'W' and deficit >= 10:
                comebacks.append({
                    'season': season, 'file_id': file_id, 'deficit': deficit,
                    'date': game['date_str'], 'opponent': game['opponent'],
                    'score': f"{game['maryland_score']}-{game['opponent_score']}",
                })
    comebacks.sort(key=lambda c: -c['deficit'])

    # Longest win streaks across the whole dataset
    streaks = []
    current = None
    for game in all_games:
        if game['result'] == 'W':
            if current is None:
                current = {'start': game['date_str'], 'start_season': game['season'], 'length': 0}
            current['length'] += 1
            current['end'] = game['date_str']
            current['end_season'] = game['season']
        else:
            if current and current['length'] >= 5:
                streaks.append(current)
            current = None
    if current and current['length'] >= 5:
        current['active'] = True
        streaks.append(current)
    streaks.sort(key=lambda s: -s['length'])

    def game_summary(game):
        return {
            'season': game['season'], 'file_id': game['file_id'], 'date': game['date_str'],
            'opponent': game['opponent'], 'is_home': game['is_home'],
            'score': f"{game['maryland_score']}-{game['opponent_score']}",
            'margin': game['margin'], 'attendance': game['attendance'],
        }

    wins = [g for g in all_games if g['result'] == 'W']
    losses = [g for g in all_games if g['result'] == 'L']

    # Career totals across the dataset
    career_totals = defaultdict(lambda: defaultdict(int))
    career_names = {}
    for row in career_rows:
        career_names[row['player_id']] = row['player_name']
        for stat in ('games', 'points', 'rebounds', 'assists', 'steals', 'blocks',
                     'double_doubles', 'triple_doubles'):
            career_totals[row['player_id']][stat] += row[stat]

    def career_top(stat, n=15):
        ranked = sorted(career_totals.items(), key=lambda kv: -kv[1][stat])[:n]
        return [{'player_id': pid, 'player': career_names[pid], 'value': totals[stat],
                 'games': totals['games']} for pid, totals in ranked if totals[stat] > 0]

    return {
        'note': f'Records within this dataset ({seasons[0]} through {seasons[-1]})',
        'single_game': {
            'points': top('points'),
            'rebounds': top('rebounds'),
            'assists': top('assists'),
            'steals': top('steals', 10),
            'blocks': top('blocks', 10),
        },
        'career': {
            'points': career_top('points'),
            'rebounds': career_top('rebounds'),
            'assists': career_top('assists'),
            'double_doubles': career_top('double_doubles'),
        },
        'team': {
            'biggest_wins': [game_summary(g) for g in sorted(wins, key=lambda g: -g['margin'])[:10]],
            'worst_losses': [game_summary(g) for g in sorted(losses, key=lambda g: g['margin'])[:10]],
            'most_points': [game_summary(g) for g in sorted(all_games, key=lambda g: -g['maryland_score'])[:10]],
            'comebacks': comebacks[:10],
            'win_streaks': streaks[:10],
            'top_attendance': [game_summary(g) for g in
                               sorted(all_games, key=lambda g: -g['attendance'])[:10]],
        },
    }


def write_csv(path, columns, rows):
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {path}")


def main():
    parser = argparse.ArgumentParser(description="Build cross-season index files into data/")
    parser.add_argument('--output', default='data')
    args = parser.parse_args()

    seasons = [s for s in pbp_common.SEASONS if Path(s).exists()]
    out = Path(args.output)
    out.mkdir(exist_ok=True)

    all_games = []
    for season in seasons:
        all_games.extend(maryland_games(season))
    all_games.sort(key=lambda g: (g['date'], g['file_id']))

    players, career_rows = build_players(seasons)

    with open(out / 'players_index.json', 'w') as f:
        json.dump({'players': players}, f)
    print(f"Wrote {len(players)} players to {out / 'players_index.json'}")

    write_csv(out / 'career_stats.csv', CAREER_COLUMNS, career_rows)
    write_csv(out / 'opponents_index.csv', OPPONENT_COLUMNS, build_opponents(all_games))
    write_csv(out / 'officials_summary.csv', OFFICIALS_COLUMNS, build_officials(all_games, seasons))

    records = build_records(all_games, career_rows, seasons)
    with open(out / 'records.json', 'w') as f:
        json.dump(records, f)
    print(f"Wrote records to {out / 'records.json'}")


if __name__ == '__main__':
    main()
