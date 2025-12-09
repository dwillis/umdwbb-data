#!/usr/bin/env python3
"""
Process assist data for a season.
Runs both the parser and analyzer in sequence.
"""

import sys
import subprocess
from pathlib import Path


def process_season(season_dir):
    """Process assists for a given season directory."""
    season_path = Path(season_dir)

    if not season_path.exists():
        print(f"Error: Season directory '{season_dir}' not found")
        return False

    plays_csv = season_path / 'plays.csv'
    if not plays_csv.exists():
        print(f"Error: {plays_csv} not found")
        print("Run game_parser.py first to generate plays.csv")
        return False

    print(f"Processing assists for {season_dir}...")
    print("=" * 60)

    # Step 1: Parse assists from plays.csv
    print("\n1. Parsing assists from play-by-play data...")
    result = subprocess.run(
        ['python', 'assist_parser.py', season_dir],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error parsing assists: {result.stderr}")
        return False

    print(result.stdout)

    # Step 2: Analyze assist network
    print("\n2. Analyzing assist network...")
    result = subprocess.run(
        ['python', 'analyze_assists.py', season_dir],
        capture_output=True,
        text=True
    )

    if result.returncode != 0:
        print(f"Error analyzing assists: {result.stderr}")
        return False

    print(result.stdout)

    print("\n" + "=" * 60)
    print(f"✓ Assist processing complete for {season_dir}")
    print(f"\nGenerated files:")
    print(f"  - {season_dir}/assists.csv")
    print(f"  - {season_dir}/assist_network.csv")
    print(f"  - {season_dir}/assist_leaders.csv")
    print(f"  - {season_dir}/assist_receivers.csv")

    return True


def main():
    """Main execution function."""
    if len(sys.argv) < 2:
        print("Usage: python process_assists.py <season_dir>")
        print("Example: python process_assists.py 2024-25")
        print("\nTo process all seasons:")
        print("  python process_assists.py --all")
        sys.exit(1)

    if sys.argv[1] == '--all':
        # Process all season directories
        seasons = sorted([d for d in Path('.').iterdir()
                         if d.is_dir() and d.name.startswith('20')])

        print(f"Found {len(seasons)} season directories")
        success_count = 0

        for season in seasons:
            print(f"\n{'='*60}")
            if process_season(season):
                success_count += 1
            print()

        print(f"\n{'='*60}")
        print(f"Processed {success_count}/{len(seasons)} seasons successfully")
    else:
        # Process single season
        season = sys.argv[1]
        if process_season(season):
            sys.exit(0)
        else:
            sys.exit(1)


if __name__ == '__main__':
    main()
