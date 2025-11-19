"""
Maryland Women's Basketball - Rotation Pattern Analyzer

Analyzes substitution timing, rotation patterns, and situational substitution strategies.
"""

import csv
from pathlib import Path
from typing import List, Dict
from collections import defaultdict
import statistics


class RotationAnalyzer:
    """Analyzes rotation patterns from substitution data."""

    def __init__(self, substitutions_csv: str):
        """
        Initialize analyzer with substitutions CSV.

        Args:
            substitutions_csv: Path to substitutions.csv file
        """
        self.substitutions_csv = Path(substitutions_csv)
        self.substitutions = self._load_substitutions()

    def _load_substitutions(self) -> List[Dict]:
        """Load substitutions from CSV."""
        subs = []
        with open(self.substitutions_csv, 'r') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Convert numeric fields
                row['period'] = int(row['period'])
                row['clock_seconds'] = int(row['clock_seconds'])
                row['maryland_score'] = int(row['maryland_score'])
                row['opponent_score'] = int(row['opponent_score'])
                row['score_diff'] = int(row['score_diff'])
                subs.append(row)
        return subs

    def analyze_timing_patterns(self) -> List[Dict]:
        """
        Analyze when substitutions typically occur.

        Returns:
            List of timing pattern statistics by period and time bucket
        """
        # Group by period and minute
        time_buckets = defaultdict(lambda: {
            'count': 0,
            'games': set(),
            'players_out': defaultdict(int),
            'players_in': defaultdict(int)
        })

        for sub in self.substitutions:
            period = sub['period']
            # Create 2-minute buckets (0-2min, 2-4min, etc.)
            minutes_remaining = sub['clock_seconds'] // 60
            bucket = f"{minutes_remaining}-{minutes_remaining+2}min"

            key = (period, bucket)
            time_buckets[key]['count'] += 1
            time_buckets[key]['games'].add(sub['file_id'])

            if sub['player_out_name']:
                time_buckets[key]['players_out'][sub['player_out_name']] += 1
            if sub['player_in_name']:
                time_buckets[key]['players_in'][sub['player_in_name']] += 1

        # Convert to list
        patterns = []
        for (period, bucket), stats in time_buckets.items():
            # Find most common players
            most_out = max(stats['players_out'].items(), key=lambda x: x[1]) if stats['players_out'] else ('None', 0)
            most_in = max(stats['players_in'].items(), key=lambda x: x[1]) if stats['players_in'] else ('None', 0)

            patterns.append({
                'period': period,
                'time_bucket': bucket,
                'total_subs': stats['count'],
                'games': len(stats['games']),
                'avg_subs_per_game': round(stats['count'] / len(stats['games']), 2),
                'most_common_out': most_out[0],
                'times_out': most_out[1],
                'most_common_in': most_in[0],
                'times_in': most_in[1]
            })

        # Sort by period and time bucket
        patterns.sort(key=lambda x: (x['period'], x['time_bucket']))
        return patterns

    def analyze_situational_subs(self) -> List[Dict]:
        """
        Analyze substitutions based on game situation (score differential).

        Returns:
            List of situational substitution patterns
        """
        situations = {
            'Leading by 10+': lambda diff: diff >= 10,
            'Leading by 5-9': lambda diff: 5 <= diff < 10,
            'Leading by 1-4': lambda diff: 1 <= diff < 5,
            'Tied': lambda diff: diff == 0,
            'Trailing by 1-4': lambda diff: -4 <= diff < 0,
            'Trailing by 5-9': lambda diff: -9 <= diff < -4,
            'Trailing by 10+': lambda diff: diff <= -10
        }

        situation_stats = defaultdict(lambda: {
            'count': 0,
            'games': set(),
            'players_out': defaultdict(int),
            'players_in': defaultdict(int),
            'periods': []
        })

        for sub in self.substitutions:
            diff = sub['score_diff']

            # Find matching situation
            for sit_name, sit_func in situations.items():
                if sit_func(diff):
                    situation_stats[sit_name]['count'] += 1
                    situation_stats[sit_name]['games'].add(sub['file_id'])
                    situation_stats[sit_name]['periods'].append(sub['period'])

                    if sub['player_out_name']:
                        situation_stats[sit_name]['players_out'][sub['player_out_name']] += 1
                    if sub['player_in_name']:
                        situation_stats[sit_name]['players_in'][sub['player_in_name']] += 1
                    break

        # Convert to list
        patterns = []
        for sit_name, stats in situation_stats.items():
            if stats['count'] == 0:
                continue

            most_out = max(stats['players_out'].items(), key=lambda x: x[1]) if stats['players_out'] else ('None', 0)
            most_in = max(stats['players_in'].items(), key=lambda x: x[1]) if stats['players_in'] else ('None', 0)
            avg_period = statistics.mean(stats['periods']) if stats['periods'] else 0

            patterns.append({
                'situation': sit_name,
                'total_subs': stats['count'],
                'games': len(stats['games']),
                'avg_subs_per_game': round(stats['count'] / len(stats['games']), 2) if stats['games'] else 0,
                'avg_period': round(avg_period, 1),
                'most_common_out': most_out[0],
                'times_out': most_out[1],
                'most_common_in': most_in[0],
                'times_in': most_in[1]
            })

        return patterns

    def analyze_multi_player_subs(self) -> List[Dict]:
        """
        Analyze multi-player substitutions (when 2+ players sub at once).

        Returns:
            List of multi-player substitution patterns
        """
        # Group substitutions by game, period, and exact clock time
        sub_groups = defaultdict(lambda: {
            'players_out': [],
            'players_in': [],
            'period': 0,
            'clock_seconds': 0,
            'score_diff': 0
        })

        for sub in self.substitutions:
            key = (sub['file_id'], sub['period'], sub['clock_seconds'], sub['narrative'])
            sub_groups[key]['players_out'].append(sub['player_out_name'])
            sub_groups[key]['players_in'].append(sub['player_in_name'])
            sub_groups[key]['period'] = sub['period']
            sub_groups[key]['clock_seconds'] = sub['clock_seconds']
            sub_groups[key]['score_diff'] = sub['score_diff']

        # Find multi-player substitutions
        multi_subs = []
        for key, group in sub_groups.items():
            file_id, period, clock_seconds, narrative = key
            num_players = len([p for p in group['players_out'] if p])

            if num_players >= 2:
                multi_subs.append({
                    'file_id': file_id,
                    'period': period,
                    'clock_seconds': clock_seconds,
                    'num_players': num_players,
                    'players_out': ', '.join([p for p in group['players_out'] if p]),
                    'players_in': ', '.join([p for p in group['players_in'] if p]),
                    'score_diff': group['score_diff']
                })

        # Sort by number of players (most first)
        multi_subs.sort(key=lambda x: x['num_players'], reverse=True)
        return multi_subs

    def analyze_period_transitions(self) -> List[Dict]:
        """
        Analyze substitution patterns at the start of periods.

        Returns:
            List of period transition statistics
        """
        # Find substitutions at start of periods (at 10:00 or within first 30 seconds)
        period_starts = defaultdict(lambda: {
            'count': 0,
            'games': set(),
            'players_out': defaultdict(int),
            'players_in': defaultdict(int)
        })

        for sub in self.substitutions:
            # Check if sub is at start of period (600 seconds = 10:00)
            if 570 <= sub['clock_seconds'] <= 600:
                period = sub['period']
                period_starts[period]['count'] += 1
                period_starts[period]['games'].add(sub['file_id'])

                if sub['player_out_name']:
                    period_starts[period]['players_out'][sub['player_out_name']] += 1
                if sub['player_in_name']:
                    period_starts[period]['players_in'][sub['player_in_name']] += 1

        # Convert to list
        patterns = []
        for period, stats in period_starts.items():
            most_out = max(stats['players_out'].items(), key=lambda x: x[1]) if stats['players_out'] else ('None', 0)
            most_in = max(stats['players_in'].items(), key=lambda x: x[1]) if stats['players_in'] else ('None', 0)

            patterns.append({
                'period': period,
                'total_subs': stats['count'],
                'games': len(stats['games']),
                'avg_subs_per_game': round(stats['count'] / len(stats['games']), 2) if stats['games'] else 0,
                'most_common_out': most_out[0],
                'times_out': most_out[1],
                'most_common_in': most_in[0],
                'times_in': most_in[1]
            })

        patterns.sort(key=lambda x: x['period'])
        return patterns

    def save_timing_patterns_csv(self, output_file: str):
        """Save timing pattern analysis to CSV."""
        patterns = self.analyze_timing_patterns()

        if not patterns:
            print("No timing patterns to save")
            return

        source_id = self.substitutions[0]['source_id'] if self.substitutions else ''
        for p in patterns:
            p['source_id'] = source_id

        fieldnames = [
            'source_id', 'period', 'time_bucket', 'total_subs', 'games',
            'avg_subs_per_game', 'most_common_out', 'times_out',
            'most_common_in', 'times_in'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(patterns)

        print(f"Saved {len(patterns)} timing patterns to {output_file}")

    def save_situational_subs_csv(self, output_file: str):
        """Save situational substitution analysis to CSV."""
        patterns = self.analyze_situational_subs()

        if not patterns:
            print("No situational patterns to save")
            return

        source_id = self.substitutions[0]['source_id'] if self.substitutions else ''
        for p in patterns:
            p['source_id'] = source_id

        fieldnames = [
            'source_id', 'situation', 'total_subs', 'games', 'avg_subs_per_game',
            'avg_period', 'most_common_out', 'times_out', 'most_common_in', 'times_in'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(patterns)

        print(f"Saved {len(patterns)} situational patterns to {output_file}")

    def save_multi_player_subs_csv(self, output_file: str):
        """Save multi-player substitution analysis to CSV."""
        multi_subs = self.analyze_multi_player_subs()

        if not multi_subs:
            print("No multi-player subs to save")
            return

        source_id = self.substitutions[0]['source_id'] if self.substitutions else ''
        for s in multi_subs:
            s['source_id'] = source_id

        fieldnames = [
            'source_id', 'file_id', 'period', 'clock_seconds',
            'num_players', 'players_out', 'players_in', 'score_diff'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(multi_subs)

        print(f"Saved {len(multi_subs)} multi-player substitutions to {output_file}")

    def save_period_transitions_csv(self, output_file: str):
        """Save period transition analysis to CSV."""
        patterns = self.analyze_period_transitions()

        if not patterns:
            print("No period transition patterns to save")
            return

        source_id = self.substitutions[0]['source_id'] if self.substitutions else ''
        for p in patterns:
            p['source_id'] = source_id

        fieldnames = [
            'source_id', 'period', 'total_subs', 'games', 'avg_subs_per_game',
            'most_common_out', 'times_out', 'most_common_in', 'times_in'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(patterns)

        print(f"Saved {len(patterns)} period transition patterns to {output_file}")


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python analyze_rotations.py <substitutions_csv>")
        print("Example: python analyze_rotations.py 2024-25/substitutions.csv")
        sys.exit(1)

    subs_csv = Path(sys.argv[1])
    output_dir = subs_csv.parent

    # Analyze rotation patterns
    analyzer = RotationAnalyzer(subs_csv)

    # Save all analysis outputs
    analyzer.save_timing_patterns_csv(output_dir / 'rotation_timing_patterns.csv')
    analyzer.save_situational_subs_csv(output_dir / 'situational_substitutions.csv')
    analyzer.save_multi_player_subs_csv(output_dir / 'multi_player_substitutions.csv')
    analyzer.save_period_transitions_csv(output_dir / 'period_transition_subs.csv')

    print("\nRotation analysis complete!")
