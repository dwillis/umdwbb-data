"""
Reconstructs on-court lineups from play-by-play SUBS events for one season.

Starters are inferred from play order (see pbp_common.infer_starters), then
substitutions are replayed chronologically while points are attributed to the
five players on the floor for each team. Works for every season back to
2014-15 because SUBS plays exist in all game feeds.

Outputs (regenerated wholesale each run):

  {season}/stints.csv             - per-player floor stints with plus-minus
  {season}/lineup_stints.csv      - five-player unit segments per game
  {season}/lineup_season.csv      - Maryland units aggregated for the season
  {season}/player_onoff.csv       - Maryland on/off scoring splits
  {season}/lineup_validation.csv  - reconstructed vs box-score minutes

The validation file is the honesty check: games where reconstructed minutes
drift more than 2 minutes from the box score for any player should be treated
as low confidence (the site badges them).
"""

import argparse
import csv
from collections import defaultdict
from pathlib import Path

import pbp_common

STINT_COLUMNS = [
    'source_id', 'file_id', 'team', 'player_name', 'player_number',
    'stint_index', 'in_seconds', 'out_seconds', 'duration',
    'pts_for', 'pts_against', 'plus_minus', 'starter',
]

LINEUP_STINT_COLUMNS = [
    'source_id', 'file_id', 'team', 'lineup', 'num_players',
    'start_seconds', 'end_seconds', 'duration', 'pts_for', 'pts_against', 'plus_minus',
]

LINEUP_SEASON_COLUMNS = [
    'source_id', 'lineup', 'games', 'stints', 'seconds', 'minutes',
    'pts_for', 'pts_against', 'plus_minus', 'net_per_40',
]

ONOFF_COLUMNS = [
    'source_id', 'player_name', 'games', 'min_on', 'min_off',
    'pts_for_on', 'pts_against_on', 'net_on_per_40',
    'pts_for_off', 'pts_against_off', 'net_off_per_40',
    'on_off_diff', 'plus_minus',
]

VALIDATION_COLUMNS = [
    'source_id', 'file_id', 'team', 'player_name', 'player_number',
    'box_minutes', 'stint_minutes', 'delta', 'anomalies_in_game',
]


class GameLineupTracker:
    """Replays one game's plays, producing stints and lineup segments."""

    def __init__(self, data, season, file_id):
        self.data = data
        self.season = season
        self.file_id = file_id
        self.names = pbp_common.team_names(data)
        self.total_seconds = pbp_common.game_length(data)
        self.anomalies = 0

        starters = pbp_common.infer_starters(data)
        # on_court[team_key] = {number: name}
        self.on_court = {}
        # open_stints[team_key][number] = {'name', 'in', 'pf', 'pa', 'starter'}
        self.open_stints = {'HomeTeam': {}, 'VisitingTeam': {}}
        self.stints = []
        self.starter_numbers = {}
        for team_key in ('HomeTeam', 'VisitingTeam'):
            self.on_court[team_key] = {num: name for num, name in starters[team_key]}
            self.starter_numbers[team_key] = set(self.on_court[team_key])
            if len(self.on_court[team_key]) != 5:
                self.anomalies += 1
            for num, name in starters[team_key]:
                self.open_stints[team_key][num] = {
                    'name': name, 'in': 0, 'pf': 0, 'pa': 0, 'starter': 1,
                }

        # Current five-player segment per team
        self.segments = []
        self.open_segments = {
            team_key: {'players': dict(self.on_court[team_key]), 'start': 0, 'pf': 0, 'pa': 0}
            for team_key in ('HomeTeam', 'VisitingTeam')
        }

    def _close_stint(self, team_key, number, t):
        stint = self.open_stints[team_key].pop(number, None)
        if stint is None:
            return
        self.stints.append({
            'source_id': self.season,
            'file_id': self.file_id,
            'team': self.names[team_key],
            'player_name': stint['name'],
            'player_number': number,
            'stint_index': 0,  # filled in later per player
            'in_seconds': stint['in'],
            'out_seconds': t,
            'duration': max(t - stint['in'], 0),
            'pts_for': stint['pf'],
            'pts_against': stint['pa'],
            'plus_minus': stint['pf'] - stint['pa'],
            'starter': stint['starter'],
        })

    def _close_segment(self, team_key, t):
        seg = self.open_segments[team_key]
        duration = max(t - seg['start'], 0)
        if duration > 0 or seg['pf'] or seg['pa']:
            names_sorted = sorted(seg['players'].values())
            self.segments.append({
                'source_id': self.season,
                'file_id': self.file_id,
                'team': self.names[team_key],
                'lineup': '|'.join(names_sorted),
                'num_players': len(names_sorted),
                'start_seconds': seg['start'],
                'end_seconds': t,
                'duration': duration,
                'pts_for': seg['pf'],
                'pts_against': seg['pa'],
                'plus_minus': seg['pf'] - seg['pa'],
            })

    def _apply_sub(self, team_key, narrative, t):
        players_out, players_in = pbp_common.parse_subs_narrative(narrative)
        if not players_out and not players_in:
            return
        self._close_segment(team_key, t)
        court = self.on_court[team_key]
        for number, name in players_out:
            if number in court:
                del court[number]
                self._close_stint(team_key, number, t)
            else:
                self.anomalies += 1
        for number, name in players_in:
            if number in court:
                self.anomalies += 1
            else:
                court[number] = name
                self.open_stints[team_key][number] = {
                    'name': name, 'in': t, 'pf': 0, 'pa': 0, 'starter': 0,
                }
        if len(court) != 5:
            self.anomalies += 1
        self.open_segments[team_key] = {'players': dict(court), 'start': t, 'pf': 0, 'pa': 0}

    def _score(self, scoring_key, points):
        other_key = 'VisitingTeam' if scoring_key == 'HomeTeam' else 'HomeTeam'
        for stint in self.open_stints[scoring_key].values():
            stint['pf'] += points
        for stint in self.open_stints[other_key].values():
            stint['pa'] += points
        self.open_segments[scoring_key]['pf'] += points
        self.open_segments[other_key]['pa'] += points

    def _period_on_court(self, period_plays, team_key):
        """Players who must have been on court when the period began.

        Anyone whose first involvement in the period is an action or a sub
        OUT (rather than a sub IN) was already on the floor.
        """
        must = []
        entered = set()

        def known(number):
            return number in entered or any(num == number for num, _ in must)

        for play in period_plays:
            if play['team_key'] != team_key:
                continue
            if play['play_type'] == 'SUBS':
                players_out, players_in = pbp_common.parse_subs_narrative(play['narrative'])
                for number, name in players_out:
                    if not known(number) and len(must) < 5:
                        must.append((number, name))
                for number, name in players_in:
                    if not known(number):
                        entered.add(number)
            elif play['player_number'] is not None and play['player_name']:
                if not known(play['player_number']) and len(must) < 5:
                    must.append((play['player_number'], play['player_name']))
            if len(must) == 5:
                break
        return must

    def _reconcile_period_start(self, period_plays, t):
        """Re-anchor lineups at a period boundary.

        Older feeds (notably the 2014-15 halves era) often skip SUBS events
        for changes made during breaks; without this the tracker drifts.
        """
        for team_key in ('HomeTeam', 'VisitingTeam'):
            must = self._period_on_court(period_plays, team_key)
            court = self.on_court[team_key]
            must_numbers = {num for num, _ in must}
            changed = False

            for number, name in must:
                if number not in court:
                    court[number] = name
                    self.open_stints[team_key][number] = {
                        'name': name, 'in': t, 'pf': 0, 'pa': 0, 'starter': 0,
                    }
                    changed = True

            if len(court) > 5:
                # Un-logged departures: drop carryover players not required
                # this period, quietest assumption available.
                removable = sorted(num for num in court if num not in must_numbers)
                while len(court) > 5 and removable:
                    number = removable.pop()
                    del court[number]
                    self._close_stint(team_key, number, t)
                    changed = True

            if changed:
                self._close_segment(team_key, t)
                self.open_segments[team_key] = {
                    'players': dict(court), 'start': t, 'pf': 0, 'pa': 0,
                }

    def run(self):
        rules = pbp_common.game_rules(self.data)
        plays = pbp_common.normalized_plays(self.data)
        by_period = defaultdict(list)
        for play in plays:
            by_period[play['period']].append(play)

        prev_home = 0
        for period in sorted(by_period):
            if period > 1:
                period_start = pbp_common.seconds_elapsed(
                    period, pbp_common.period_length(period, rules), rules)
                self._reconcile_period_start(by_period[period], period_start)
            for play in by_period[period]:
                if play['play_type'] == 'SUBS' and play['team_key'] in self.open_stints:
                    self._apply_sub(play['team_key'], play['narrative'], play['seconds_elapsed'])
                if play['points'] > 0:
                    scoring_key = 'HomeTeam' if play['home_score'] > prev_home else 'VisitingTeam'
                    self._score(scoring_key, play['points'])
                prev_home = play['home_score']

        for team_key in ('HomeTeam', 'VisitingTeam'):
            self._close_segment(team_key, self.total_seconds)
            for number in list(self.open_stints[team_key]):
                self._close_stint(team_key, number, self.total_seconds)

        # Number stints per player in chronological order
        counters = defaultdict(int)
        self.stints.sort(key=lambda s: (s['team'], s['player_number'], s['in_seconds']))
        for stint in self.stints:
            key = (stint['team'], stint['player_number'])
            counters[key] += 1
            stint['stint_index'] = counters[key]
        self.stints.sort(key=lambda s: (s['in_seconds'], s['team'], s['player_number']))

        return self.stints, self.segments, self.anomalies


def box_minutes(data):
    """{(team_name, number:int): (player_name, minutes:int)} from the box score."""
    names = pbp_common.team_names(data)
    result = {}
    for team_key in ('HomeTeam', 'VisitingTeam'):
        players = data['Stats'][team_key]['PlayerGroups']['Players']['Values']
        for player in players:
            try:
                number = int(player['Uni'])
            except (TypeError, ValueError):
                continue
            result[(names[team_key], number)] = (player['Name'], pbp_common.to_int(player['Minutes']))
    return result


def validate_game(data, season, file_id, stints, anomalies):
    """Compare reconstructed minutes to box score minutes per player."""
    reconstructed = defaultdict(int)
    stint_names = {}
    for stint in stints:
        key = (stint['team'], stint['player_number'])
        reconstructed[key] += stint['duration']
        stint_names[key] = stint['player_name']

    rows = []
    for (team, number), (box_name, minutes) in box_minutes(data).items():
        stint_minutes = round(reconstructed.get((team, number), 0) / 60, 1)
        if minutes == 0 and stint_minutes == 0:
            continue
        rows.append({
            'source_id': season,
            'file_id': file_id,
            'team': team,
            'player_name': stint_names.get((team, number), box_name),
            'player_number': number,
            'box_minutes': minutes,
            'stint_minutes': stint_minutes,
            'delta': round(stint_minutes - minutes, 1),
            'anomalies_in_game': anomalies,
        })
    return rows


def aggregate_lineups(segments, season, team_name='Maryland'):
    agg = {}
    for seg in segments:
        if seg['team'] != team_name or seg['num_players'] != 5:
            continue
        entry = agg.setdefault(seg['lineup'], {
            'source_id': season, 'lineup': seg['lineup'], 'games': set(),
            'stints': 0, 'seconds': 0, 'pts_for': 0, 'pts_against': 0,
        })
        entry['games'].add(seg['file_id'])
        entry['stints'] += 1
        entry['seconds'] += seg['duration']
        entry['pts_for'] += seg['pts_for']
        entry['pts_against'] += seg['pts_against']

    rows = []
    for entry in agg.values():
        seconds = entry['seconds']
        plus_minus = entry['pts_for'] - entry['pts_against']
        rows.append({
            'source_id': entry['source_id'],
            'lineup': entry['lineup'],
            'games': len(entry['games']),
            'stints': entry['stints'],
            'seconds': seconds,
            'minutes': round(seconds / 60, 1),
            'pts_for': entry['pts_for'],
            'pts_against': entry['pts_against'],
            'plus_minus': plus_minus,
            'net_per_40': round(plus_minus / (seconds / 2400), 1) if seconds >= 60 else '',
        })
    rows.sort(key=lambda r: -r['seconds'])
    return rows


def aggregate_onoff(all_stints, game_totals, season, team_name='Maryland'):
    """game_totals: {file_id: (total_seconds, md_pts, opp_pts)} for games involving team_name."""
    players = defaultdict(lambda: {'games': set(), 'seconds': 0, 'pf': 0, 'pa': 0})
    for stint in all_stints:
        if stint['team'] != team_name:
            continue
        p = players[stint['player_name']]
        p['games'].add(stint['file_id'])
        p['seconds'] += stint['duration']
        p['pf'] += stint['pts_for']
        p['pa'] += stint['pts_against']

    season_seconds = sum(t[0] for t in game_totals.values())
    season_pts_for = sum(t[1] for t in game_totals.values())
    season_pts_against = sum(t[2] for t in game_totals.values())

    rows = []
    for name, p in players.items():
        sec_on = p['seconds']
        sec_off = max(season_seconds - sec_on, 0)
        pf_off = season_pts_for - p['pf']
        pa_off = season_pts_against - p['pa']
        net_on = (p['pf'] - p['pa']) / (sec_on / 2400) if sec_on >= 300 else None
        net_off = (pf_off - pa_off) / (sec_off / 2400) if sec_off >= 300 else None
        rows.append({
            'source_id': season,
            'player_name': name,
            'games': len(p['games']),
            'min_on': round(sec_on / 60, 1),
            'min_off': round(sec_off / 60, 1),
            'pts_for_on': p['pf'],
            'pts_against_on': p['pa'],
            'net_on_per_40': round(net_on, 1) if net_on is not None else '',
            'pts_for_off': pf_off,
            'pts_against_off': pa_off,
            'net_off_per_40': round(net_off, 1) if net_off is not None else '',
            'on_off_diff': round(net_on - net_off, 1) if net_on is not None and net_off is not None else '',
            'plus_minus': p['pf'] - p['pa'],
        })
    rows.sort(key=lambda r: -r['min_on'])
    return rows


def write_csv(path, columns, rows):
    with open(path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=columns, quoting=csv.QUOTE_NONNUMERIC)
        writer.writeheader()
        writer.writerows(rows)
    print(f"Wrote {len(rows)} rows to {path}")


def process_season(season, base_dir='.', team_name='Maryland'):
    season_path = Path(base_dir) / season
    if not season_path.exists():
        print(f"Error: season directory {season_path} does not exist")
        return

    all_stints, all_segments, validation_rows = [], [], []
    game_totals = {}

    for json_path in pbp_common.season_json_files(season_path):
        data, file_id = pbp_common.load_game(json_path)
        if not data:
            print(f"Skipping unreadable game file {json_path}")
            continue
        names = pbp_common.team_names(data)
        tracker = GameLineupTracker(data, season, file_id)
        stints, segments, anomalies = tracker.run()
        all_stints.extend(stints)
        all_segments.extend(segments)
        validation_rows.extend(validate_game(data, season, file_id, stints, anomalies))

        if team_name in names.values():
            is_home = names['HomeTeam'] == team_name
            home_score = pbp_common.to_int(data['Game']['HomeTeam']['Score'])
            visiting_score = pbp_common.to_int(data['Game']['VisitingTeam']['Score'])
            md = home_score if is_home else visiting_score
            opp = visiting_score if is_home else home_score
            game_totals[file_id] = (tracker.total_seconds, md, opp)

    write_csv(season_path / 'stints.csv', STINT_COLUMNS, all_stints)
    write_csv(season_path / 'lineup_stints.csv', LINEUP_STINT_COLUMNS, all_segments)
    write_csv(season_path / 'lineup_season.csv', LINEUP_SEASON_COLUMNS,
              aggregate_lineups(all_segments, season, team_name))
    write_csv(season_path / 'player_onoff.csv', ONOFF_COLUMNS,
              aggregate_onoff(all_stints, game_totals, season, team_name))
    write_csv(season_path / 'lineup_validation.csv', VALIDATION_COLUMNS, validation_rows)

    bad = sum(1 for r in validation_rows if abs(r['delta']) > 2)
    total = len(validation_rows)
    if total:
        print(f"Validation: {total - bad}/{total} player-games within 2 min of box score "
              f"({(total - bad) / total * 100:.1f}%)")


def main():
    parser = argparse.ArgumentParser(description="Reconstruct lineups and stints from SUBS plays")
    parser.add_argument('season', nargs='?', default='2025-26')
    args = parser.parse_args()
    process_season(args.season)


if __name__ == '__main__':
    main()
