#!/usr/bin/env python3
"""
Analyze assist network data for Maryland Women's Basketball.
Generates statistics about assist combinations, top passers, and network patterns.
"""

import csv
from pathlib import Path
from collections import defaultdict, Counter


class AssistNetworkAnalyzer:
    """Analyzer for assist network patterns and statistics."""

    def __init__(self, assists_csv_path):
        """
        Initialize the analyzer with an assists.csv file.

        Args:
            assists_csv_path: Path to the assists.csv file
        """
        self.assists_csv_path = Path(assists_csv_path)
        self.assists = []
        self.load_assists()

    def load_assists(self):
        """Load assists from CSV file."""
        if not self.assists_csv_path.exists():
            print(f"Warning: {self.assists_csv_path} not found")
            return

        with open(self.assists_csv_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            self.assists = list(reader)

        print(f"Loaded {len(self.assists)} assists from {self.assists_csv_path}")

    def analyze_assist_network(self):
        """
        Analyze passer-to-scorer combinations.

        Returns:
            List of dictionaries with assist network data
        """
        network = defaultdict(lambda: {
            'assists': 0,
            'threes': 0,
            'twos': 0,
            'layups': 0,
            'jumpers': 0,
            'dunks': 0,
            'total_points': 0
        })

        for assist in self.assists:
            assister = assist['assister_name']
            scorer = assist['scorer_name']
            shot_type = assist['shot_type']
            points = int(assist['points'])

            key = (assister, scorer)
            network[key]['assists'] += 1
            network[key]['total_points'] += points

            # Track shot types
            if points == 3:
                network[key]['threes'] += 1
            else:
                network[key]['twos'] += 1

            shot_lower = shot_type.lower()
            if 'layup' in shot_lower:
                network[key]['layups'] += 1
            elif 'jumper' in shot_lower:
                network[key]['jumpers'] += 1
            elif 'dunk' in shot_lower:
                network[key]['dunks'] += 1

        # Convert to list format
        network_list = []
        for (assister, scorer), stats in network.items():
            network_list.append({
                'assister': assister,
                'scorer': scorer,
                'assists': stats['assists'],
                'total_points': stats['total_points'],
                'threes': stats['threes'],
                'twos': stats['twos'],
                'layups': stats['layups'],
                'jumpers': stats['jumpers'],
                'dunks': stats['dunks'],
                'avg_points_per_assist': round(stats['total_points'] / stats['assists'], 2)
            })

        # Sort by number of assists (descending)
        network_list.sort(key=lambda x: x['assists'], reverse=True)
        return network_list

    def analyze_assisters(self):
        """
        Analyze total assists by passer.

        Returns:
            List of dictionaries with assister statistics
        """
        assister_stats = defaultdict(lambda: {
            'total_assists': 0,
            'unique_teammates': set(),
            'threes_assisted': 0,
            'twos_assisted': 0,
            'points_created': 0
        })

        for assist in self.assists:
            assister = assist['assister_name']
            scorer = assist['scorer_name']
            points = int(assist['points'])

            assister_stats[assister]['total_assists'] += 1
            assister_stats[assister]['unique_teammates'].add(scorer)
            assister_stats[assister]['points_created'] += points

            if points == 3:
                assister_stats[assister]['threes_assisted'] += 1
            else:
                assister_stats[assister]['twos_assisted'] += 1

        # Convert to list format
        assister_list = []
        for assister, stats in assister_stats.items():
            assister_list.append({
                'assister': assister,
                'total_assists': stats['total_assists'],
                'unique_teammates': len(stats['unique_teammates']),
                'threes_assisted': stats['threes_assisted'],
                'twos_assisted': stats['twos_assisted'],
                'points_created': stats['points_created'],
                'avg_points_per_assist': round(stats['points_created'] / stats['total_assists'], 2)
            })

        # Sort by total assists (descending)
        assister_list.sort(key=lambda x: x['total_assists'], reverse=True)
        return assister_list

    def analyze_scorers(self):
        """
        Analyze players receiving assists.

        Returns:
            List of dictionaries with scorer statistics
        """
        scorer_stats = defaultdict(lambda: {
            'assists_received': 0,
            'unique_assisters': set(),
            'threes_assisted': 0,
            'twos_assisted': 0,
            'points_from_assists': 0
        })

        for assist in self.assists:
            assister = assist['assister_name']
            scorer = assist['scorer_name']
            points = int(assist['points'])

            scorer_stats[scorer]['assists_received'] += 1
            scorer_stats[scorer]['unique_assisters'].add(assister)
            scorer_stats[scorer]['points_from_assists'] += points

            if points == 3:
                scorer_stats[scorer]['threes_assisted'] += 1
            else:
                scorer_stats[scorer]['twos_assisted'] += 1

        # Convert to list format
        scorer_list = []
        for scorer, stats in scorer_stats.items():
            scorer_list.append({
                'scorer': scorer,
                'assists_received': stats['assists_received'],
                'unique_assisters': len(stats['unique_assisters']),
                'threes_assisted': stats['threes_assisted'],
                'twos_assisted': stats['twos_assisted'],
                'points_from_assists': stats['points_from_assists'],
                'avg_points_per_assist': round(stats['points_from_assists'] / stats['assists_received'], 2)
            })

        # Sort by assists received (descending)
        scorer_list.sort(key=lambda x: x['assists_received'], reverse=True)
        return scorer_list

    def save_network_to_csv(self, network_data, output_path):
        """Save assist network data to CSV."""
        if not network_data:
            print("No network data to save.")
            return

        output_path = Path(output_path)
        fieldnames = [
            'assister', 'scorer', 'assists', 'total_points',
            'avg_points_per_assist', 'threes', 'twos',
            'layups', 'jumpers', 'dunks'
        ]

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(network_data)

        print(f"Saved {len(network_data)} assist combinations to {output_path}")

    def save_assisters_to_csv(self, assister_data, output_path):
        """Save assister statistics to CSV."""
        if not assister_data:
            print("No assister data to save.")
            return

        output_path = Path(output_path)
        fieldnames = [
            'assister', 'total_assists', 'unique_teammates',
            'threes_assisted', 'twos_assisted', 'points_created',
            'avg_points_per_assist'
        ]

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(assister_data)

        print(f"Saved {len(assister_data)} assister stats to {output_path}")

    def save_scorers_to_csv(self, scorer_data, output_path):
        """Save scorer statistics to CSV."""
        if not scorer_data:
            print("No scorer data to save.")
            return

        output_path = Path(output_path)
        fieldnames = [
            'scorer', 'assists_received', 'unique_assisters',
            'threes_assisted', 'twos_assisted', 'points_from_assists',
            'avg_points_per_assist'
        ]

        with open(output_path, 'w', newline='', encoding='utf-8') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(scorer_data)

        print(f"Saved {len(scorer_data)} scorer stats to {output_path}")


def main():
    """Main execution function."""
    import sys

    if len(sys.argv) < 2:
        print("Usage: python analyze_assists.py <season_dir>")
        print("Example: python analyze_assists.py 2024-25")
        sys.exit(1)

    season_dir = Path(sys.argv[1])
    assists_csv = season_dir / 'assists.csv'

    if not assists_csv.exists():
        print(f"Error: {assists_csv} not found")
        print("Run assist_parser.py first to generate assists.csv")
        sys.exit(1)

    print(f"Analyzing assists from {assists_csv}...")
    analyzer = AssistNetworkAnalyzer(assists_csv)

    # Generate all analyses
    print("\nGenerating assist network analysis...")
    network_data = analyzer.analyze_assist_network()
    analyzer.save_network_to_csv(network_data, season_dir / 'assist_network.csv')

    print("\nGenerating assister statistics...")
    assister_data = analyzer.analyze_assisters()
    analyzer.save_assisters_to_csv(assister_data, season_dir / 'assist_leaders.csv')

    print("\nGenerating scorer statistics...")
    scorer_data = analyzer.analyze_scorers()
    analyzer.save_scorers_to_csv(scorer_data, season_dir / 'assist_receivers.csv')

    # Print summary
    print("\n" + "="*60)
    print("ASSIST NETWORK SUMMARY")
    print("="*60)

    if assister_data:
        print("\nTop 5 Assist Leaders:")
        for i, player in enumerate(assister_data[:5], 1):
            print(f"  {i}. {player['assister']}: {player['total_assists']} assists "
                  f"({player['points_created']} points created)")

    if network_data:
        print("\nTop 10 Assist Combinations:")
        for i, combo in enumerate(network_data[:10], 1):
            print(f"  {i}. {combo['assister']} → {combo['scorer']}: "
                  f"{combo['assists']} assists ({combo['total_points']} points)")

    print("\n" + "="*60)


if __name__ == '__main__':
    main()
