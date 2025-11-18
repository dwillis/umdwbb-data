#!/usr/bin/env python3
"""
Script to deduplicate CSV files in basketball data directories.
Uses the same unique key logic as game_parser.py.
Uses only standard library - no external dependencies.
"""

import csv
from pathlib import Path
import argparse
import sys
from collections import OrderedDict

# Define unique key columns for each dataframe type to detect duplicates
UNIQUE_KEYS = {
    'game_info': ['file_id'],
    'period_scores': ['file_id', 'team', 'period'],
    'plays': ['file_id', 'period', 'time_remaining', 'team', 'play_type', 'play_action', 'narrative'],
    'player_stats': ['file_id', 'team', 'name'],
    'team_totals': ['file_id', 'team']
}

def deduplicate_csv(file_path: Path, unique_keys: list) -> int:
    """
    Deduplicate a CSV file based on unique keys.
    Returns the number of duplicates removed.
    """
    try:
        # Read the CSV file
        with open(file_path, 'r', newline='', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            rows = list(reader)
            fieldnames = reader.fieldnames

        if not rows:
            print(f"  {file_path.name}: Empty file, skipping")
            return 0

        # Check if all unique key columns exist
        missing_cols = [col for col in unique_keys if col not in fieldnames]
        if missing_cols:
            print(f"  {file_path.name}: Missing columns {missing_cols}, skipping deduplication")
            return 0

        original_count = len(rows)

        # Remove duplicates, keeping the first occurrence
        # Use OrderedDict to preserve order while removing duplicates
        seen = OrderedDict()
        for row in rows:
            # Create a key tuple from the unique key columns
            key = tuple(row.get(col, '') for col in unique_keys)
            if key not in seen:
                seen[key] = row

        deduped_rows = list(seen.values())
        duplicates_removed = original_count - len(deduped_rows)

        if duplicates_removed > 0:
            # Create backup
            backup_path = file_path.with_suffix('.csv.bak')
            if backup_path.exists():
                backup_path.unlink()
            file_path.rename(backup_path)
            print(f"  {file_path.name}: Created backup at {backup_path.name}")

            # Write cleaned data with consistent quoting
            with open(file_path, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
                writer.writeheader()
                writer.writerows(deduped_rows)

            print(f"  {file_path.name}: Removed {duplicates_removed} duplicate(s)")
        else:
            print(f"  {file_path.name}: No duplicates found")

        return duplicates_removed

    except Exception as e:
        print(f"  Error processing {file_path.name}: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        return 0

def deduplicate_directory(directory: Path, csv_files: list = None) -> None:
    """
    Deduplicate all relevant CSV files in a directory.
    If csv_files is None, process all files matching UNIQUE_KEYS.
    """
    if not directory.exists():
        print(f"Error: Directory {directory} does not exist")
        return

    if csv_files is None:
        csv_files = list(UNIQUE_KEYS.keys())

    print(f"\nProcessing directory: {directory}")
    print("=" * 60)

    total_duplicates = 0
    files_processed = 0

    for csv_name in csv_files:
        if csv_name not in UNIQUE_KEYS:
            print(f"  Warning: Unknown CSV file type '{csv_name}', skipping")
            continue

        file_path = directory / f"{csv_name}.csv"

        if not file_path.exists():
            print(f"  {csv_name}.csv: File not found, skipping")
            continue

        files_processed += 1
        duplicates = deduplicate_csv(file_path, UNIQUE_KEYS[csv_name])
        total_duplicates += duplicates

    print("=" * 60)
    print(f"Summary: Processed {files_processed} file(s), removed {total_duplicates} total duplicate(s)\n")

def main():
    parser = argparse.ArgumentParser(
        description='Deduplicate CSV files in basketball data directories'
    )
    parser.add_argument(
        'directories',
        nargs='+',
        help='Directory or directories containing CSV files to deduplicate'
    )
    parser.add_argument(
        '--files',
        nargs='+',
        choices=list(UNIQUE_KEYS.keys()),
        help='Specific CSV files to process (without .csv extension). If not specified, all files will be processed.'
    )

    args = parser.parse_args()

    for directory in args.directories:
        dir_path = Path(directory)
        deduplicate_directory(dir_path, args.files)

if __name__ == "__main__":
    main()
