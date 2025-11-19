#!/usr/bin/env python3
"""
Maryland Women's Basketball - Complete Substitution Analysis Pipeline

This script runs the complete substitution pattern analysis:
1. Parse substitutions from game JSON files
2. Analyze rotation patterns
3. Generate summary report

Usage:
    python process_substitutions.py <season_dir>
    Example: python process_substitutions.py 2024-25
"""

import sys
from pathlib import Path
from substitution_parser import SubstitutionAggregator
from analyze_rotations import RotationAnalyzer
from generate_rotation_report import generate_report


def process_season(season_dir: str):
    """
    Run complete substitution analysis for a season.

    Args:
        season_dir: Path to season directory (e.g., "2024-25")
    """
    season_path = Path(season_dir)

    if not season_path.exists():
        print(f"Error: Season directory '{season_dir}' not found")
        sys.exit(1)

    print(f"Processing substitution patterns for {season_dir}...")
    print("=" * 80)

    # Step 1: Parse substitutions
    print("\n[1/3] Parsing substitutions from game files...")
    aggregator = SubstitutionAggregator()
    aggregator.add_season(season_dir)

    # Save substitution CSVs
    aggregator.save_substitutions_csv(season_path / 'substitutions.csv')
    aggregator.save_substitution_pairs_csv(season_path / 'substitution_pairs.csv')
    aggregator.save_player_sub_frequency_csv(season_path / 'player_sub_frequency.csv')

    # Step 2: Analyze rotation patterns
    print("\n[2/3] Analyzing rotation patterns...")
    analyzer = RotationAnalyzer(season_path / 'substitutions.csv')
    analyzer.save_timing_patterns_csv(season_path / 'rotation_timing_patterns.csv')
    analyzer.save_situational_subs_csv(season_path / 'situational_substitutions.csv')
    analyzer.save_multi_player_subs_csv(season_path / 'multi_player_substitutions.csv')
    analyzer.save_period_transitions_csv(season_path / 'period_transition_subs.csv')

    # Step 3: Generate summary report
    print("\n[3/3] Generating summary report...")
    report_file = season_path / 'substitution_report.txt'
    generate_report(season_dir, str(report_file))

    print("\n" + "=" * 80)
    print("Analysis complete!")
    print(f"\nGenerated files in {season_dir}/:")
    print("  • substitutions.csv - All substitution events")
    print("  • substitution_pairs.csv - Common substitution pairings")
    print("  • player_sub_frequency.csv - Per-player substitution stats")
    print("  • rotation_timing_patterns.csv - Timing patterns by quarter")
    print("  • situational_substitutions.csv - Substitutions by game situation")
    print("  • multi_player_substitutions.csv - Multi-player substitution events")
    print("  • period_transition_subs.csv - Substitutions at period starts")
    print("  • substitution_report.txt - Human-readable summary report")
    print("\n" + "=" * 80)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    season_dir = sys.argv[1]
    process_season(season_dir)
