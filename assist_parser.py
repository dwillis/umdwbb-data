#!/usr/bin/env python3
"""
Parse assist data from Maryland Women's Basketball play-by-play data.
Extracts assister-to-scorer relationships from game narratives.
"""

import csv
import re
from pathlib import Path
from collections import defaultdict


class AssistParser:
    """Parser for extracting assist networks from play-by-play data."""

    def __init__(self, plays_csv_path):
        """
        Initialize the parser with a plays.csv file.

        Args:
            plays_csv_path: Path to the plays.csv file
        """
        self.plays_csv_path = Path(plays_csv_path)
        self.assists = []

        # Regex pattern to match assist plays
        # Format: "{number} {scorer} {type} GOOD (...); {number} {assister} Assist (...)"
        self.assist_pattern = re.compile(
            r'^(\d+)\s+([^;]+?)\s+(LAYUP|3PTR|JUMPER|DUNK|TIP IN)\s+GOOD\s+\((\d+)\s+Pt\);\s+'
            r'(\d+)\s+([^;]+?)\s+Assist\s+\((\d+)\s+Asst\)',
            re.IGNORECASE
        )

    def parse_plays(self):
        """Parse all plays and extract assists."""
        with open(self.plays_csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)

            for row in reader:
                # Skip rows with empty file_id (duplicates)
                if not row.get('file_id') or row['file_id'].strip() == '':
                    continue

                # Only process Maryland plays
                if row['team'] != 'Maryland':
                    continue

                # Only process successful scoring plays with assists
                if 'Assist' not in row['narrative']:
                    continue

                assist_data = self._parse_assist_narrative(row)
                if assist_data:
                    self.assists.append(assist_data)

        return self.assists

    def _parse_assist_narrative(self, play_row):
        """
        Parse an individual play narrative to extract assist information.

        Args:
            play_row: Dictionary containing play data from CSV

        Returns:
            Dictionary with assist details or None if no assist found
        """
        narrative = play_row['narrative']
        match = self.assist_pattern.match(narrative)

        if not match:
            return None

        scorer_number = match.group(1)
        scorer_name = match.group(2).strip()
        shot_type = match.group(3)
        points = match.group(4)
        assister_number = match.group(5)
        assister_name = match.group(6).strip()
        assist_count = match.group(7)

        return {
            'source_id': play_row['source_id'],
            'file_id': play_row['file_id'],
            'period': play_row['period'],
            'time_remaining': play_row['time_remaining'],
            'assister_number': assister_number,
            'assister_name': assister_name,
            'assister_assist_count': assist_count,
            'scorer_number': scorer_number,
            'scorer_name': scorer_name,
            'shot_type': shot_type,
            'points': points,
            'home_score': play_row['home_team_score'],
            'visiting_score': play_row['visiting_team_score'],
            'narrative': narrative
        }

    def save_to_csv(self, output_path):
        """
        Save parsed assists to a CSV file.

        Args:
            output_path: Path where the CSV should be saved
        """
        if not self.assists:
            print("No assists found to save.")
            return

        output_path = Path(output_path)
        fieldnames = [
            'source_id', 'file_id', 'period', 'time_remaining',
            'assister_number', 'assister_name', 'assister_assist_count',
            'scorer_number', 'scorer_name', 'shot_type', 'points',
            'home_score', 'visiting_score', 'narrative'
        ]

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(self.assists)

        print(f"Saved {len(self.assists)} assists to {output_path}")

    def get_assist_summary(self):
        """Get summary statistics about parsed assists."""
        if not self.assists:
            return "No assists parsed yet."

        total_assists = len(self.assists)

        # Count unique combinations
        combinations = defaultdict(int)
        assisters = defaultdict(int)
        scorers = defaultdict(int)

        for assist in self.assists:
            combo = f"{assist['assister_name']} → {assist['scorer_name']}"
            combinations[combo] += 1
            assisters[assist['assister_name']] += 1
            scorers[assist['scorer_name']] += 1

        summary = [
            f"\nAssist Summary:",
            f"  Total Assists: {total_assists}",
            f"  Unique Assist Combinations: {len(combinations)}",
            f"  Players with Assists: {len(assisters)}",
            f"  Players Receiving Assists: {len(scorers)}",
            f"\nTop 5 Assist Combinations:",
        ]

        top_combos = sorted(combinations.items(), key=lambda x: x[1], reverse=True)[:5]
        for i, (combo, count) in enumerate(top_combos, 1):
            summary.append(f"  {i}. {combo}: {count} assists")

        return "\n".join(summary)


def main():
    """Main execution function."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python assist_parser.py <season_dir>")
        print("Example: python assist_parser.py 2024-25")
        sys.exit(1)

    season_dir = Path(sys.argv[1])
    plays_csv = season_dir / 'plays.csv'

    if not plays_csv.exists():
        print(f"Error: {plays_csv} not found")
        sys.exit(1)

    print(f"Parsing assists from {plays_csv}...")
    parser = AssistParser(plays_csv)
    parser.parse_plays()

    # Save to assists.csv in the same directory
    output_path = season_dir / 'assists.csv'
    parser.save_to_csv(output_path)

    # Print summary
    print(parser.get_assist_summary())


if __name__ == '__main__':
    main()
