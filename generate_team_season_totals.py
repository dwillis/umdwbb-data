#!/usr/bin/env python3
"""
Team Season Totals Generator

This script generates comprehensive team season statistics by aggregating
data from all games in a given season. It calculates both basic and advanced
team statistics.

Usage:
    python generate_team_season_totals.py SEASON [--output OUTPUT_FILE]

Example:
    python generate_team_season_totals.py 2024-25
    python generate_team_season_totals.py 2024-25 --output team_season_stats.csv
"""

import csv
import os
import sys
import argparse
from collections import defaultdict
from typing import Dict, List, Tuple


class TeamSeasonStats:
    """Aggregates and calculates team statistics for a season."""

    def __init__(self, season: str):
        self.season = season
        self.season_dir = os.path.join(os.path.dirname(__file__), season)
        self.team_stats = defaultdict(lambda: {
            'games': 0,
            'wins': 0,
            'losses': 0,
            'points': 0,
            'points_allowed': 0,
            'field_goals_made': 0,
            'field_goals_attempted': 0,
            'three_pointers_made': 0,
            'three_pointers_attempted': 0,
            'free_throws_made': 0,
            'free_throws_attempted': 0,
            'rebounds': 0,
            'assists': 0,
            'steals': 0,
            'blocks': 0,
            'turnovers': 0,
            'fouls': 0,
        })

    def load_game_results(self) -> Dict[str, Dict]:
        """Load game results to track wins/losses and points allowed."""
        game_info_file = os.path.join(self.season_dir, 'game_info.csv')
        game_results = {}

        if not os.path.exists(game_info_file):
            print(f"Warning: {game_info_file} not found")
            return game_results

        with open(game_info_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                game_id = row['file_id']
                game_results[game_id] = {
                    'home_team': row['home_team'],
                    'home_score': int(row['home_score']),
                    'visiting_team': row['visiting_team'],
                    'visiting_score': int(row['visiting_score'])
                }

        return game_results

    def process_team_totals(self) -> None:
        """Process team totals from CSV and aggregate by team."""
        team_totals_file = os.path.join(self.season_dir, 'team_totals.csv')

        if not os.path.exists(team_totals_file):
            raise FileNotFoundError(f"Team totals file not found: {team_totals_file}")

        game_results = self.load_game_results()

        with open(team_totals_file, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                team = row['team']
                game_id = row['file_id']
                stats = self.team_stats[team]

                # Increment games played
                stats['games'] += 1

                # Parse shooting stats (format: "made-attempted")
                fg_made, fg_attempted = self._parse_shooting_stat(row['field_goals'])
                three_made, three_attempted = self._parse_shooting_stat(row['three_pointers'])
                ft_made, ft_attempted = self._parse_shooting_stat(row['free_throws'])

                # Aggregate stats
                stats['points'] += int(row['points'])
                stats['field_goals_made'] += fg_made
                stats['field_goals_attempted'] += fg_attempted
                stats['three_pointers_made'] += three_made
                stats['three_pointers_attempted'] += three_attempted
                stats['free_throws_made'] += ft_made
                stats['free_throws_attempted'] += ft_attempted
                stats['rebounds'] += int(row['rebounds'])
                stats['assists'] += int(row['assists'])
                stats['steals'] += int(row['steals'])
                stats['blocks'] += int(row['blocks'])
                stats['turnovers'] += int(row['turnovers'])
                stats['fouls'] += int(row['fouls'])

                # Track wins/losses and points allowed
                if game_id in game_results:
                    game = game_results[game_id]
                    if game['home_team'] == team:
                        stats['points_allowed'] += game['visiting_score']
                        if game['home_score'] > game['visiting_score']:
                            stats['wins'] += 1
                        else:
                            stats['losses'] += 1
                    elif game['visiting_team'] == team:
                        stats['points_allowed'] += game['home_score']
                        if game['visiting_score'] > game['home_score']:
                            stats['wins'] += 1
                        else:
                            stats['losses'] += 1

    def _parse_shooting_stat(self, stat_str: str) -> Tuple[int, int]:
        """Parse shooting stat in 'made-attempted' format."""
        try:
            parts = stat_str.split('-')
            return int(parts[0]), int(parts[1])
        except (ValueError, IndexError):
            return 0, 0

    def calculate_advanced_stats(self) -> Dict[str, Dict]:
        """Calculate advanced statistics for each team."""
        advanced_stats = {}

        for team, stats in self.team_stats.items():
            games = stats['games']
            if games == 0:
                continue

            # Calculate percentages
            fg_pct = (stats['field_goals_made'] / stats['field_goals_attempted'] * 100
                     if stats['field_goals_attempted'] > 0 else 0)
            three_pt_pct = (stats['three_pointers_made'] / stats['three_pointers_attempted'] * 100
                           if stats['three_pointers_attempted'] > 0 else 0)
            ft_pct = (stats['free_throws_made'] / stats['free_throws_attempted'] * 100
                     if stats['free_throws_attempted'] > 0 else 0)

            # Advanced Stats
            # Effective Field Goal % = (FGM + 0.5 * 3PM) / FGA
            efg_pct = ((stats['field_goals_made'] + 0.5 * stats['three_pointers_made']) /
                      stats['field_goals_attempted'] * 100
                      if stats['field_goals_attempted'] > 0 else 0)

            # True Shooting % = Points / (2 * (FGA + 0.44 * FTA))
            ts_attempts = 2 * (stats['field_goals_attempted'] + 0.44 * stats['free_throws_attempted'])
            ts_pct = (stats['points'] / ts_attempts * 100 if ts_attempts > 0 else 0)

            # Free Throw Rate = FTA / FGA
            ft_rate = (stats['free_throws_attempted'] / stats['field_goals_attempted']
                      if stats['field_goals_attempted'] > 0 else 0)

            # Assist to Turnover Ratio
            ast_to_ratio = (stats['assists'] / stats['turnovers']
                           if stats['turnovers'] > 0 else stats['assists'])

            # Per-game averages
            ppg = stats['points'] / games
            rpg = stats['rebounds'] / games
            apg = stats['assists'] / games
            spg = stats['steals'] / games
            bpg = stats['blocks'] / games
            tpg = stats['turnovers'] / games
            fpg = stats['fouls'] / games

            # Offensive/Defensive efficiency (points per game)
            off_rating = stats['points'] / games
            def_rating = stats['points_allowed'] / games
            net_rating = off_rating - def_rating

            # Win percentage
            win_pct = (stats['wins'] / games * 100 if games > 0 else 0)

            advanced_stats[team] = {
                # Record
                'team': team,
                'games': games,
                'wins': stats['wins'],
                'losses': stats['losses'],
                'win_pct': win_pct,

                # Total stats
                'total_points': stats['points'],
                'total_rebounds': stats['rebounds'],
                'total_assists': stats['assists'],
                'total_steals': stats['steals'],
                'total_blocks': stats['blocks'],
                'total_turnovers': stats['turnovers'],
                'total_fouls': stats['fouls'],

                # Shooting totals
                'fg_made': stats['field_goals_made'],
                'fg_attempted': stats['field_goals_attempted'],
                'three_made': stats['three_pointers_made'],
                'three_attempted': stats['three_pointers_attempted'],
                'ft_made': stats['free_throws_made'],
                'ft_attempted': stats['free_throws_attempted'],

                # Shooting percentages
                'fg_pct': fg_pct,
                'three_pt_pct': three_pt_pct,
                'ft_pct': ft_pct,
                'efg_pct': efg_pct,
                'ts_pct': ts_pct,

                # Per-game averages
                'ppg': ppg,
                'rpg': rpg,
                'apg': apg,
                'spg': spg,
                'bpg': bpg,
                'tpg': tpg,
                'fpg': fpg,

                # Advanced stats
                'ft_rate': ft_rate,
                'ast_to_ratio': ast_to_ratio,
                'off_rating': off_rating,
                'def_rating': def_rating,
                'net_rating': net_rating,
                'points_allowed': stats['points_allowed'],
            }

        return advanced_stats

    def generate_report(self) -> List[Dict]:
        """Generate the complete season statistics report."""
        self.process_team_totals()
        return self.calculate_advanced_stats()

    def save_to_csv(self, output_file: str) -> None:
        """Save season statistics to CSV file."""
        stats = self.generate_report()

        if not stats:
            print(f"No stats to save for season {self.season}")
            return

        # Define field order
        fieldnames = [
            'team', 'games', 'wins', 'losses', 'win_pct',
            'total_points', 'ppg', 'points_allowed', 'off_rating', 'def_rating', 'net_rating',
            'fg_made', 'fg_attempted', 'fg_pct',
            'three_made', 'three_attempted', 'three_pt_pct',
            'ft_made', 'ft_attempted', 'ft_pct',
            'efg_pct', 'ts_pct', 'ft_rate',
            'total_rebounds', 'rpg',
            'total_assists', 'apg', 'ast_to_ratio',
            'total_steals', 'spg',
            'total_blocks', 'bpg',
            'total_turnovers', 'tpg',
            'total_fouls', 'fpg',
        ]

        with open(output_file, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()

            # Sort by wins (descending)
            sorted_stats = sorted(stats.values(), key=lambda x: x['wins'], reverse=True)

            for team_stats in sorted_stats:
                writer.writerow(team_stats)

        print(f"Season statistics saved to {output_file}")

    def display_report(self) -> None:
        """Display season statistics in a formatted table."""
        stats = self.generate_report()

        if not stats:
            print(f"No stats available for season {self.season}")
            return

        print(f"\n{'='*80}")
        print(f"TEAM SEASON TOTALS - {self.season}")
        print(f"{'='*80}\n")

        # Sort by wins (descending)
        sorted_teams = sorted(stats.values(), key=lambda x: x['wins'], reverse=True)

        # Basic Stats Table
        print(f"{'TEAM':<25} {'REC':<10} {'PPG':<8} {'RPG':<8} {'APG':<8} {'SPG':<8}")
        print('-' * 80)
        for team_stats in sorted_teams:
            record = f"{team_stats['wins']}-{team_stats['losses']}"
            print(f"{team_stats['team']:<25} {record:<10} "
                  f"{team_stats['ppg']:<8.1f} {team_stats['rpg']:<8.1f} "
                  f"{team_stats['apg']:<8.1f} {team_stats['spg']:<8.1f}")

        print(f"\n{'SHOOTING PERCENTAGES'}")
        print('-' * 80)
        print(f"{'TEAM':<25} {'FG%':<8} {'3P%':<8} {'FT%':<8} {'eFG%':<8} {'TS%':<8}")
        print('-' * 80)
        for team_stats in sorted_teams:
            print(f"{team_stats['team']:<25} "
                  f"{team_stats['fg_pct']:<8.1f} {team_stats['three_pt_pct']:<8.1f} "
                  f"{team_stats['ft_pct']:<8.1f} {team_stats['efg_pct']:<8.1f} "
                  f"{team_stats['ts_pct']:<8.1f}")

        print(f"\n{'ADVANCED STATS'}")
        print('-' * 80)
        print(f"{'TEAM':<25} {'ORTG':<8} {'DRTG':<8} {'NET':<8} {'AST/TO':<8} {'FTR':<8}")
        print('-' * 80)
        for team_stats in sorted_teams:
            print(f"{team_stats['team']:<25} "
                  f"{team_stats['off_rating']:<8.1f} {team_stats['def_rating']:<8.1f} "
                  f"{team_stats['net_rating']:<8.1f} {team_stats['ast_to_ratio']:<8.2f} "
                  f"{team_stats['ft_rate']:<8.2f}")

        print(f"\n{'='*80}\n")


def main():
    parser = argparse.ArgumentParser(
        description='Generate team season totals with advanced statistics',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python generate_team_season_totals.py 2024-25
  python generate_team_season_totals.py 2024-25 --output team_stats.csv
  python generate_team_season_totals.py 2023-24 -o 2023-24-team-stats.csv
        """
    )

    parser.add_argument('season', help='Season to process (e.g., 2024-25)')
    parser.add_argument('-o', '--output', help='Output CSV file (optional)')
    parser.add_argument('--no-display', action='store_true',
                       help='Do not display stats to console')

    args = parser.parse_args()

    # Create stats generator
    generator = TeamSeasonStats(args.season)

    # Display stats to console
    if not args.no_display:
        generator.display_report()

    # Save to CSV if output file specified
    if args.output:
        generator.save_to_csv(args.output)
    elif args.no_display:
        # If not displaying and no output file, use default filename
        default_output = f"{args.season}_team_season_totals.csv"
        generator.save_to_csv(default_output)


if __name__ == '__main__':
    main()
