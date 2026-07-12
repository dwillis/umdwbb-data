"""
Single entry point for the data pipeline. Runs, per season:

  1. game_parser       - core CSVs from game JSONs (enriched columns)
  2. context_parser    - team_game_context / team_period_context
  3. enrich_pbp        - fouls, ft_trips, runs, streaks, heat_check
  4. lineup_engine     - stints, lineups, on/off, validation
  5. assist chain      - assists.csv + network aggregates (existing scripts)
  6. team season totals
  ... then once at the end:
  7. build_indexes     - cross-season files in data/

Usage:
  python pipeline.py                        # daily update of the current season
  python pipeline.py --season 2024-25
  python pipeline.py --all-seasons --rebuild   # one-time backfill / schema migration
"""

import argparse
import subprocess
import sys
from pathlib import Path

import build_indexes
import context_parser
import enrich_pbp
import game_parser
import lineup_engine
import pbp_common

CURRENT_SEASON = '2025-26'


def run_script(args, allow_failure=False):
    print(f"\n>>> {' '.join(args)}")
    result = subprocess.run([sys.executable] + args)
    if result.returncode != 0:
        message = f"Step failed ({' '.join(args)})"
        if allow_failure:
            print(f"WARNING: {message} - continuing")
        else:
            raise SystemExit(message)


def process_season(season, rebuild=False):
    if not Path(season).exists():
        print(f"Skipping {season}: directory not found")
        return

    print(f"\n===== {season} =====")
    game_parser.process_season(season, base_dir='.', output_dir=season,
                               rebuild=rebuild, debug=False)
    context_parser.process_season(season)
    enrich_pbp.process_season(season)
    lineup_engine.process_season(season)

    # Existing assist chain (parses plays.csv narratives)
    run_script(['assist_parser.py', season], allow_failure=True)
    run_script(['analyze_assists.py', season], allow_failure=True)

    run_script(['generate_team_season_totals.py', season,
                '--output', f'{season}/team_season_totals.csv', '--no-display'],
               allow_failure=True)


def main():
    parser = argparse.ArgumentParser(description="Run the full data pipeline")
    parser.add_argument('--season', default=CURRENT_SEASON,
                        help=f'Season to process (default: {CURRENT_SEASON})')
    parser.add_argument('--all-seasons', action='store_true',
                        help='Process every season directory')
    parser.add_argument('--rebuild', action='store_true',
                        help='Regenerate the core CSVs from scratch (required after schema changes)')
    parser.add_argument('--skip-indexes', action='store_true',
                        help='Skip rebuilding the cross-season data/ files')
    args = parser.parse_args()

    seasons = pbp_common.SEASONS if args.all_seasons else [args.season]
    for season in seasons:
        process_season(season, rebuild=args.rebuild)

    if not args.skip_indexes:
        print("\n===== cross-season indexes =====")
        sys.argv = ['build_indexes.py']
        build_indexes.main()


if __name__ == '__main__':
    main()
