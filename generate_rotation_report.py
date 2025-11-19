"""
Maryland Women's Basketball - Rotation Pattern Summary Report

Generates a human-readable summary report of substitution and rotation patterns.
"""

import csv
from pathlib import Path
from typing import List, Dict


def load_csv(filepath: str) -> List[Dict]:
    """Load CSV file into list of dictionaries."""
    rows = []
    with open(filepath, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)
    return rows


def generate_report(season_dir: str, output_file: str = None):
    """
    Generate comprehensive rotation report.

    Args:
        season_dir: Directory containing CSV files
        output_file: Optional output file path (defaults to stdout)
    """
    season_path = Path(season_dir)

    # Load all data
    try:
        substitutions = load_csv(season_path / 'substitutions.csv')
        sub_pairs = load_csv(season_path / 'substitution_pairs.csv')
        player_freq = load_csv(season_path / 'player_sub_frequency.csv')
        timing = load_csv(season_path / 'rotation_timing_patterns.csv')
        multi_subs = load_csv(season_path / 'multi_player_substitutions.csv')
        period_trans = load_csv(season_path / 'period_transition_subs.csv')
    except FileNotFoundError as e:
        print(f"Error: Missing required CSV file - {e}")
        return

    # Build report
    lines = []
    lines.append("=" * 80)
    lines.append("MARYLAND WOMEN'S BASKETBALL - SUBSTITUTION PATTERN REPORT")
    lines.append(f"Season: {substitutions[0]['source_id']}")
    lines.append("=" * 80)
    lines.append("")

    # Overview
    num_games = len(set(s['file_id'] for s in substitutions))
    total_subs = len(substitutions)
    avg_subs_per_game = total_subs / num_games if num_games > 0 else 0

    lines.append("OVERVIEW")
    lines.append("-" * 80)
    lines.append(f"Total Games Analyzed: {num_games}")
    lines.append(f"Total Substitutions: {total_subs}")
    lines.append(f"Average Substitutions per Game: {avg_subs_per_game:.1f}")
    lines.append("")

    # Player Substitution Frequency
    lines.append("PLAYER SUBSTITUTION FREQUENCY (Top 10)")
    lines.append("-" * 80)
    lines.append(f"{'Player':<25} {'Games':<8} {'Subs In':<10} {'Subs Out':<10} {'Avg/Game':<10}")
    lines.append("-" * 80)

    for i, player in enumerate(player_freq[:10], 1):
        name = f"#{player['player_number']} {player['player_name']}"
        games = player['games_with_subs']
        subs_in = player['total_subs_in']
        subs_out = player['total_subs_out']
        avg = float(player['avg_subs_in_per_game'])
        lines.append(f"{name:<25} {games:<8} {subs_in:<10} {subs_out:<10} {avg:<10.2f}")

    lines.append("")

    # Common Substitution Pairs
    lines.append("MOST COMMON SUBSTITUTION PAIRS (Top 15)")
    lines.append("-" * 80)
    lines.append(f"{'OUT':<25} {'IN':<25} {'Count':<8} {'Games':<8}")
    lines.append("-" * 80)

    for i, pair in enumerate(sub_pairs[:15], 1):
        out_player = f"#{pair['player_out_number']} {pair['player_out_name']}"
        in_player = f"#{pair['player_in_number']} {pair['player_in_name']}"
        count = pair['times_occurred']
        games = pair['games']
        lines.append(f"{out_player:<25} {in_player:<25} {count:<8} {games:<8}")

    lines.append("")

    # Multi-Player Substitutions
    lines.append("MULTI-PLAYER SUBSTITUTIONS")
    lines.append("-" * 80)
    five_player = sum(1 for s in multi_subs if int(s['num_players']) == 5)
    four_player = sum(1 for s in multi_subs if int(s['num_players']) == 4)
    three_player = sum(1 for s in multi_subs if int(s['num_players']) == 3)
    two_player = sum(1 for s in multi_subs if int(s['num_players']) == 2)

    lines.append(f"5-Player Substitutions: {five_player}")
    lines.append(f"4-Player Substitutions: {four_player}")
    lines.append(f"3-Player Substitutions: {three_player}")
    lines.append(f"2-Player Substitutions: {two_player}")
    lines.append("")

    if five_player > 0:
        lines.append("Notable 5-Player Substitutions:")
        for sub in multi_subs[:5]:
            if int(sub['num_players']) == 5:
                lines.append(f"  Game {sub['file_id']}, Q{sub['period']}, {int(sub['clock_seconds'])//60}:{int(sub['clock_seconds'])%60:02d}")
                lines.append(f"    OUT: {sub['players_out']}")
                lines.append(f"    IN:  {sub['players_in']}")
        lines.append("")

    # Timing Patterns
    lines.append("SUBSTITUTION TIMING BY QUARTER")
    lines.append("-" * 80)

    for period in [1, 2, 3, 4]:
        period_timing = [t for t in timing if int(t['period']) == period]
        if period_timing:
            lines.append(f"\nQuarter {period}:")
            # Find peak substitution times
            period_timing.sort(key=lambda x: int(x['total_subs']), reverse=True)
            lines.append(f"  Peak substitution times:")
            for t in period_timing[:3]:
                lines.append(f"    {t['time_bucket']} remaining: {t['total_subs']} subs across {t['games']} games")

    lines.append("")

    # Period Transitions
    lines.append("PERIOD TRANSITION SUBSTITUTIONS")
    lines.append("-" * 80)
    lines.append(f"{'Period':<10} {'Total Subs':<12} {'Games':<8} {'Avg/Game':<10}")
    lines.append("-" * 80)

    for trans in period_trans:
        period = f"Start of Q{trans['period']}"
        total = trans['total_subs']
        games = trans['games']
        avg = trans['avg_subs_per_game']
        lines.append(f"{period:<10} {total:<12} {games:<8} {avg:<10}")

    lines.append("")

    # Key Insights
    lines.append("KEY INSIGHTS")
    lines.append("-" * 80)

    # Find most substituted player
    most_subbed = max(player_freq, key=lambda x: int(x['total_subs_in']) + int(x['total_subs_out']))
    lines.append(f"• Most active substitute: #{most_subbed['player_number']} {most_subbed['player_name']}")
    lines.append(f"  ({int(most_subbed['total_subs_in']) + int(most_subbed['total_subs_out'])} total subs in {most_subbed['games_with_subs']} games)")

    # Find most common pairing
    top_pair = sub_pairs[0]
    lines.append(f"• Most common substitution: #{top_pair['player_out_number']} {top_pair['player_out_name']} → #{top_pair['player_in_number']} {top_pair['player_in_name']}")
    lines.append(f"  (Occurred {top_pair['times_occurred']} times across {top_pair['games']} games)")

    # Find reciprocal pairs (players who frequently sub for each other)
    reciprocals = []
    for pair in sub_pairs:
        # Find reverse pairing
        reverse = next((p for p in sub_pairs
                       if p['player_out_number'] == pair['player_in_number']
                       and p['player_in_number'] == pair['player_out_number']), None)
        if reverse:
            total = int(pair['times_occurred']) + int(reverse['times_occurred'])
            if total >= 30:  # Significant reciprocal relationship
                reciprocals.append({
                    'p1': f"#{pair['player_out_number']} {pair['player_out_name']}",
                    'p2': f"#{pair['player_in_number']} {pair['player_in_name']}",
                    'total': total
                })

    if reciprocals:
        # Remove duplicates (A-B and B-A)
        seen = set()
        unique_reciprocals = []
        for r in reciprocals:
            key = tuple(sorted([r['p1'], r['p2']]))
            if key not in seen:
                seen.add(key)
                unique_reciprocals.append(r)

        unique_reciprocals.sort(key=lambda x: x['total'], reverse=True)

        lines.append(f"• Players who frequently rotate for each other:")
        for r in unique_reciprocals[:5]:
            lines.append(f"  {r['p1']} ↔ {r['p2']} ({r['total']} total swaps)")

    lines.append("")
    lines.append("=" * 80)

    # Output report
    report = "\n".join(lines)

    if output_file:
        with open(output_file, 'w') as f:
            f.write(report)
        print(f"Report saved to {output_file}")
    else:
        print(report)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        print("Usage: python generate_rotation_report.py <season_dir> [output_file]")
        print("Example: python generate_rotation_report.py 2024-25 report.txt")
        sys.exit(1)

    season_dir = sys.argv[1]
    output_file = sys.argv[2] if len(sys.argv) > 2 else None

    generate_report(season_dir, output_file)
