"""
Maryland Women's Basketball - Substitution Pattern Parser

Parses play-by-play data to extract substitution events and analyze rotation patterns.
"""

import json
import csv
import re
from pathlib import Path
from typing import List, Dict, Tuple, Optional
from collections import defaultdict


class SubstitutionParser:
    """Parses substitution events from basketball game JSON files."""

    def __init__(self, game_file: str):
        """
        Initialize parser with a game JSON file.

        Args:
            game_file: Path to the game JSON file
        """
        self.game_file = Path(game_file)
        self.data = self._load_json()
        self.source_id = self.game_file.parent.name  # e.g., "2024-25"
        self.file_id = self.game_file.stem  # e.g., "18730"

    def _load_json(self) -> dict:
        """Load and parse the JSON file."""
        with open(self.game_file, 'r') as f:
            return json.load(f)

    def get_team_info(self) -> Tuple[str, str]:
        """
        Get home and visiting team names.

        Returns:
            Tuple of (home_team_name, visiting_team_name)
        """
        game = self.data.get('Game', {})
        home_team = game.get('HomeTeam', {}).get('Name', 'Unknown')
        visiting_team = game.get('VisitingTeam', {}).get('Name', 'Unknown')
        return home_team, visiting_team

    def is_maryland_home(self) -> bool:
        """Check if Maryland is the home team."""
        home_team, _ = self.get_team_info()
        return home_team == 'Maryland'

    def parse_substitution_narrative(self, narrative: str) -> List[Tuple[str, str, str, str]]:
        """
        Parse substitution narrative to extract player OUT/IN information.

        Format examples:
        - "02 Kaylene Smikle OUT; 06 Saylor Poffenbarger IN"
        - "02 Kaylene Smikle OUT; 14 Allie Kubek OUT; 06 Saylor Poffenbarger IN; 10 Mir McLean IN"

        Args:
            narrative: Substitution narrative string

        Returns:
            List of tuples: (player_out_number, player_out_name, player_in_number, player_in_name)
        """
        # Split by semicolon to get individual sub events
        parts = [p.strip() for p in narrative.split(';')]

        players_out = []
        players_in = []

        for part in parts:
            # Match pattern: "NUMBER NAME OUT" or "NUMBER NAME IN"
            match = re.match(r'^(\d+)\s+(.+?)\s+(OUT|IN)$', part)
            if match:
                number = match.group(1)
                name = match.group(2).strip()
                direction = match.group(3)

                if direction == 'OUT':
                    players_out.append((number, name))
                else:
                    players_in.append((number, name))

        # Pair up OUT and IN players
        # If multiple subs, pair them in order
        substitutions = []
        max_len = max(len(players_out), len(players_in))

        for i in range(max_len):
            out_num, out_name = players_out[i] if i < len(players_out) else ('', '')
            in_num, in_name = players_in[i] if i < len(players_in) else ('', '')
            substitutions.append((out_num, out_name, in_num, in_name))

        return substitutions

    def get_score_at_play(self, play: dict) -> Tuple[int, int]:
        """
        Get the score at a specific play.

        Args:
            play: Play dictionary

        Returns:
            Tuple of (home_score, visiting_score)
        """
        score = play.get('Score')
        if score and isinstance(score, dict):
            home = score.get('Home', 0)
            visiting = score.get('Visiting', 0)
            return (home, visiting)
        return (0, 0)

    def extract_substitutions(self) -> List[Dict]:
        """
        Extract all substitution events from the game.

        Returns:
            List of substitution event dictionaries
        """
        plays = self.data.get('Plays', [])
        home_team, visiting_team = self.get_team_info()
        maryland_is_home = self.is_maryland_home()

        substitutions = []

        for play in plays:
            if play.get('Type') != 'SUBS':
                continue

            period = play.get('Period')
            clock_seconds = play.get('ClockSeconds')
            narrative = play.get('Narrative', '')
            team = play.get('Team')  # 'HomeTeam' or 'VisitingTeam'

            # Determine if this is a Maryland substitution
            is_maryland_sub = (maryland_is_home and team == 'HomeTeam') or \
                             (not maryland_is_home and team == 'VisitingTeam')

            # Skip non-Maryland substitutions
            if not is_maryland_sub:
                continue

            # Get score (may be None for substitution plays)
            home_score, visiting_score = self.get_score_at_play(play)

            # Determine Maryland vs opponent score
            if maryland_is_home:
                maryland_score = home_score
                opponent_score = visiting_score
            else:
                maryland_score = visiting_score
                opponent_score = home_score

            # Parse the substitution narrative
            parsed_subs = self.parse_substitution_narrative(narrative)

            # Create a record for each individual substitution
            for out_num, out_name, in_num, in_name in parsed_subs:
                sub_event = {
                    'source_id': self.source_id,
                    'file_id': self.file_id,
                    'period': period,
                    'clock_seconds': clock_seconds,
                    'time_remaining': self._format_time(clock_seconds),
                    'player_out_number': out_num,
                    'player_out_name': out_name,
                    'player_in_number': in_num,
                    'player_in_name': in_name,
                    'maryland_score': maryland_score,
                    'opponent_score': opponent_score,
                    'score_diff': maryland_score - opponent_score,
                    'narrative': narrative
                }
                substitutions.append(sub_event)

        return substitutions

    def _format_time(self, seconds: int) -> str:
        """
        Format seconds remaining as MM:SS.

        Args:
            seconds: Seconds remaining in period

        Returns:
            Time string in MM:SS format
        """
        if seconds is None or seconds < 0:
            return "00:00"
        minutes = seconds // 60
        secs = seconds % 60
        return f"{minutes:02d}:{secs:02d}"


class SubstitutionAggregator:
    """Aggregates substitution data across multiple games."""

    def __init__(self):
        self.all_substitutions = []

    def add_game(self, game_file: str):
        """
        Parse and add substitutions from a game.

        Args:
            game_file: Path to game JSON file
        """
        parser = SubstitutionParser(game_file)
        subs = parser.extract_substitutions()
        self.all_substitutions.extend(subs)

    def add_season(self, season_dir: str):
        """
        Parse and add substitutions from all games in a season.

        Args:
            season_dir: Path to season directory
        """
        season_path = Path(season_dir)
        json_files = sorted(season_path.glob('*.json'))

        for json_file in json_files:
            try:
                self.add_game(str(json_file))
            except Exception as e:
                print(f"Error processing {json_file}: {e}")

    def save_substitutions_csv(self, output_file: str):
        """
        Save all substitutions to CSV.

        Args:
            output_file: Path to output CSV file
        """
        if not self.all_substitutions:
            print("No substitutions to save")
            return

        fieldnames = [
            'source_id', 'file_id', 'period', 'clock_seconds', 'time_remaining',
            'player_out_number', 'player_out_name', 'player_in_number', 'player_in_name',
            'maryland_score', 'opponent_score', 'score_diff', 'narrative'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(self.all_substitutions)

        print(f"Saved {len(self.all_substitutions)} substitutions to {output_file}")

    def analyze_substitution_pairs(self) -> List[Dict]:
        """
        Analyze which players commonly substitute for each other.

        Returns:
            List of substitution pair statistics
        """
        # Track substitution pairs
        pair_counts = defaultdict(lambda: {
            'count': 0,
            'periods': [],
            'clock_times': [],
            'games': set()
        })

        for sub in self.all_substitutions:
            if not sub['player_out_name'] or not sub['player_in_name']:
                continue

            key = (
                sub['player_out_number'],
                sub['player_out_name'],
                sub['player_in_number'],
                sub['player_in_name']
            )

            pair_counts[key]['count'] += 1
            pair_counts[key]['periods'].append(sub['period'])
            pair_counts[key]['clock_times'].append(sub['clock_seconds'])
            pair_counts[key]['games'].add(sub['file_id'])

        # Convert to list and calculate averages
        pairs = []
        for key, stats in pair_counts.items():
            out_num, out_name, in_num, in_name = key
            avg_period = sum(stats['periods']) / len(stats['periods'])
            avg_clock = sum(stats['clock_times']) / len(stats['clock_times'])

            pairs.append({
                'player_out_number': out_num,
                'player_out_name': out_name,
                'player_in_number': in_num,
                'player_in_name': in_name,
                'times_occurred': stats['count'],
                'games': len(stats['games']),
                'avg_period': round(avg_period, 1),
                'avg_clock_seconds': round(avg_clock, 0)
            })

        # Sort by frequency
        pairs.sort(key=lambda x: x['times_occurred'], reverse=True)
        return pairs

    def save_substitution_pairs_csv(self, output_file: str):
        """
        Save substitution pair analysis to CSV.

        Args:
            output_file: Path to output CSV file
        """
        pairs = self.analyze_substitution_pairs()

        if not pairs:
            print("No substitution pairs to save")
            return

        # Get source_id from first substitution
        source_id = self.all_substitutions[0]['source_id'] if self.all_substitutions else ''

        # Add source_id to each pair
        for pair in pairs:
            pair['source_id'] = source_id

        fieldnames = [
            'source_id', 'player_out_number', 'player_out_name',
            'player_in_number', 'player_in_name', 'times_occurred',
            'games', 'avg_period', 'avg_clock_seconds'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(pairs)

        print(f"Saved {len(pairs)} substitution pairs to {output_file}")

    def analyze_player_sub_frequency(self) -> List[Dict]:
        """
        Analyze substitution frequency per player.

        Returns:
            List of player substitution statistics
        """
        player_stats = defaultdict(lambda: {
            'subs_in': 0,
            'subs_out': 0,
            'games': set(),
            'first_sub_times': [],
            'periods': []
        })

        for sub in self.all_substitutions:
            # Track player coming OUT
            if sub['player_out_name']:
                key = (sub['player_out_number'], sub['player_out_name'])
                player_stats[key]['subs_out'] += 1
                player_stats[key]['games'].add(sub['file_id'])

            # Track player coming IN
            if sub['player_in_name']:
                key = (sub['player_in_number'], sub['player_in_name'])
                player_stats[key]['subs_in'] += 1
                player_stats[key]['games'].add(sub['file_id'])
                player_stats[key]['first_sub_times'].append(sub['clock_seconds'])
                player_stats[key]['periods'].append(sub['period'])

        # Convert to list
        players = []
        for key, stats in player_stats.items():
            number, name = key
            games = len(stats['games'])

            players.append({
                'player_number': number,
                'player_name': name,
                'games_with_subs': games,
                'total_subs_in': stats['subs_in'],
                'total_subs_out': stats['subs_out'],
                'avg_subs_in_per_game': round(stats['subs_in'] / games, 2) if games > 0 else 0,
                'avg_subs_out_per_game': round(stats['subs_out'] / games, 2) if games > 0 else 0,
            })

        # Sort by total substitutions
        players.sort(key=lambda x: x['total_subs_in'] + x['total_subs_out'], reverse=True)
        return players

    def save_player_sub_frequency_csv(self, output_file: str):
        """
        Save player substitution frequency to CSV.

        Args:
            output_file: Path to output CSV file
        """
        players = self.analyze_player_sub_frequency()

        if not players:
            print("No player stats to save")
            return

        # Get source_id from first substitution
        source_id = self.all_substitutions[0]['source_id'] if self.all_substitutions else ''

        # Add source_id to each player
        for player in players:
            player['source_id'] = source_id

        fieldnames = [
            'source_id', 'player_number', 'player_name', 'games_with_subs',
            'total_subs_in', 'total_subs_out', 'avg_subs_in_per_game',
            'avg_subs_out_per_game'
        ]

        with open(output_file, 'w', newline='') as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames, quoting=csv.QUOTE_NONNUMERIC)
            writer.writeheader()
            writer.writerows(players)

        print(f"Saved {len(players)} player stats to {output_file}")


if __name__ == "__main__":
    # Example usage
    import sys

    if len(sys.argv) < 2:
        print("Usage: python substitution_parser.py <season_dir>")
        print("Example: python substitution_parser.py 2024-25")
        sys.exit(1)

    season_dir = sys.argv[1]

    # Process season
    aggregator = SubstitutionAggregator()
    aggregator.add_season(season_dir)

    # Save outputs
    output_dir = Path(season_dir)
    aggregator.save_substitutions_csv(output_dir / 'substitutions.csv')
    aggregator.save_substitution_pairs_csv(output_dir / 'substitution_pairs.csv')
    aggregator.save_player_sub_frequency_csv(output_dir / 'player_sub_frequency.csv')
