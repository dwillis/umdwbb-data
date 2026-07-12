import argparse
import csv
import json
import pandas as pd
import requests
from pathlib import Path
import logging
from typing import Dict, Any, List, Optional, Tuple
import os
import glob

import pbp_common

def extract_ids_from_path(filepath: str) -> Tuple[Optional[int], Optional[int]]:
    """Extract source_id and file_id from filepath as integers."""
    try:
        # Get the directory structure
        parts = Path(filepath).parts
        # Find the part that contains source_id (e.g., "392-maryland")
        source_part = [p for p in parts if '-' in p and p.split('-')[0].isdigit()][0]
        source_id = int(source_part.split('-')[0])
        # Get the file name without extension and convert to int
        file_id = int(Path(filepath).stem)
        return source_id, file_id
    except (IndexError, AttributeError, ValueError):
        return None, None

class BasketballGameProcessor:
    def __init__(self, debug: bool = False):
        self.debug = debug
        # Set up logging
        logging_level = logging.DEBUG if debug else logging.INFO
        logging.basicConfig(level=logging_level, format='%(asctime)s - %(levelname)s - %(message)s')
        self.logger = logging
        # Store team names and ids for reference
        self.home_team = None
        self.visiting_team = None
        self.source_id = None
        self.file_id = None

    def load_json_file(self, filepath: str) -> Optional[Dict]:
        """Load JSON data from file."""
        try:
            self.logger.info(f"Loading data from {filepath}")
            # Extract IDs from filepath
            self.source_id, self.file_id = extract_ids_from_path(filepath)
            self.logger.debug(f"Extracted source_id: {self.source_id}, file_id: {self.file_id}")
            
            with open(filepath, 'r') as f:
                data = json.load(f)
            # Store team names when loading data
            self.home_team = data['Game']['HomeTeam']['Name']
            self.visiting_team = data['Game']['VisitingTeam']['Name']
            return data
        except Exception as e:
            self.logger.error(f"Error loading data: {e}")
            return None

    def process_game_info(self, data: Dict) -> pd.DataFrame:
        """Process basic game information."""
        self.logger.debug("Processing game info")
        game = data['Game']
        
        game_info = {
            'source_id': self.source_id,
            'file_id': self.file_id,
            'date': game['Date'],
            'location': game['Location'],
            'officials': game['Officials'],
            'attendance': game['Attendance'],
            'home_team': self.home_team,
            'home_score': game['HomeTeam']['Score'],
            'home_record': game['HomeTeam']['CurrentRecord'],
            'visiting_team': self.visiting_team,
            'visiting_score': game['VisitingTeam']['Score'],
            'visiting_record': game['VisitingTeam']['CurrentRecord']
        }
        
        return pd.DataFrame([game_info])
    
    def process_period_scores(self, data: Dict) -> pd.DataFrame:
        """Process period-by-period scoring."""
        self.logger.debug("Processing period scores")
        
        home_scores = [{
            'source_id': self.source_id,
            'file_id': self.file_id,
            'team': self.home_team,
            'period': i+1,
            'score': score
        } for i, score in enumerate(data['Game']['HomeTeam']['PeriodScores'])]
        
        visiting_scores = [{
            'source_id': self.source_id,
            'file_id': self.file_id,
            'team': self.visiting_team,
            'period': i+1,
            'score': score
        } for i, score in enumerate(data['Game']['VisitingTeam']['PeriodScores'])]
        
        return pd.DataFrame(home_scores + visiting_scores)

    def process_plays(self, data: Dict) -> pd.DataFrame:
        """Process play-by-play data.

        In addition to the original columns, each play carries a stable
        play_id, absolute game clock (seconds_elapsed), forward-filled
        running scores/margin, the points scored on the play, and any
        assister/blocker pulled from the structured InvolvedPlayers data.
        """
        self.logger.debug("Processing plays")

        plays_list = []
        for norm in pbp_common.normalized_plays(data):
            raw = data['Plays'][norm['index']]

            play_dict = {
                'source_id': self.source_id,
                'file_id': self.file_id,
                'period': norm['period'],
                'time_remaining': norm['clock_seconds'],
                'team': norm['team'],
                'play_type': norm['play_type'],
                'play_action': norm['play_action'],
                'narrative': norm['narrative'],
                'player_name': norm['player_name'],
                'player_number': raw['Player']['UniformNumber'] if raw.get('Player') else None,
            }

            # Original sparse score columns (populated on scoring plays only)
            if raw.get('Score'):
                play_dict['home_team_score'] = raw['Score'].get('HomeTeam')
                play_dict['visiting_team_score'] = raw['Score'].get('VisitingTeam')
            else:
                play_dict['home_team_score'] = None
                play_dict['visiting_team_score'] = None

            # Enriched columns
            assist_by = None
            blocked_by = None
            if norm['involved'] and norm['play_type'] in pbp_common.SHOT_TYPES:
                involved_name = pbp_common.player_full_name(norm['involved'][0])
                if norm['play_action'] == 'GOOD':
                    assist_by = involved_name
                elif norm['play_action'] == 'MISS':
                    blocked_by = involved_name

            play_dict.update({
                'play_id': norm['play_id'],
                'seconds_elapsed': norm['seconds_elapsed'],
                'home_score_running': norm['home_score'],
                'visiting_score_running': norm['visiting_score'],
                'margin': norm['home_score'] - norm['visiting_score'],
                'points': norm['points'],
                'assist_by': assist_by,
                'blocked_by': blocked_by,
            })

            plays_list.append(play_dict)

        return pd.DataFrame(plays_list)

    def process_player_stats(self, data: Dict) -> pd.DataFrame:
        """Process player statistics.

        Beyond the original box columns this exports the JSON-only fields
        (rebound splits, fouls, efficiency, usage), numeric made/attempted
        splits, and an inferred starter flag.
        """
        self.logger.debug("Processing player statistics")

        starters = pbp_common.infer_starters(data)

        def split_made_attempted(value: str) -> Tuple[int, int]:
            try:
                made, attempted = str(value).split('-')
                return int(made), int(attempted)
            except (ValueError, AttributeError):
                return 0, 0

        def process_team_players(team_data: Dict, team_name: str, team_key: str) -> List[Dict]:
            players = team_data['PlayerGroups']['Players']['Values']
            starter_numbers = {num for num, _ in starters.get(team_key, [])}
            team_stats = []
            seen_players = set()  # Track unique players by (name, number)

            for player in players:
                # Create unique identifier for this player
                player_key = (player['Name'], player['Uni'])

                # Skip if we've already processed this player
                if player_key in seen_players:
                    self.logger.warning(f"Skipping duplicate player: {player['Name']} (#{player['Uni']}) for team {team_name}")
                    continue

                seen_players.add(player_key)

                fgm, fga = split_made_attempted(player['Fgam'])
                tpm, tpa = split_made_attempted(player['Tpam'])
                ftm, fta = split_made_attempted(player['Ftma'])
                try:
                    uni_number = int(player['Uni'])
                except (TypeError, ValueError):
                    uni_number = None

                stats = {
                    'source_id': self.source_id,
                    'file_id': self.file_id,
                    'team': team_name,
                    'name': player['Name'],
                    'number': player['Uni'],
                    'position': player['Position'],
                    'minutes': player['Minutes'],
                    'field_goals': player['Fgam'],
                    'fg_pct': player['ShootingPercentage'].rstrip('%'),
                    'three_pointers': player['Tpam'],
                    'three_pt_pct': player['Tppercentage'].rstrip('%'),
                    'free_throws': player['Ftma'],
                    'ft_pct': player['Ftp'].rstrip('%'),
                    'rebounds': player['TotalRebounds'],
                    'assists': player['Assists'],
                    'turnovers': player['Turnovers'],
                    'steals': player['Steals'],
                    'blocks': player['Blocks'],
                    'points': player['Points'],
                    # Enriched columns (previously unexported JSON fields)
                    'offensive_rebounds': pbp_common.to_int(player.get('OffensiveRebounds')),
                    'defensive_rebounds': pbp_common.to_int(player.get('DefensiveRebounds')),
                    'personal_fouls': pbp_common.to_int(player.get('PersonalFouls')),
                    'technical_fouls': pbp_common.to_int(player.get('TechnicalFouls')),
                    'efficiency': pbp_common.to_float(player.get('Efficiency')),
                    'usage_pct': pbp_common.to_float(player.get('UsagePercentage')),
                    'points_per_minute': pbp_common.to_float(player.get('PointsPerMinute')),
                    'fgm': fgm, 'fga': fga,
                    'tpm': tpm, 'tpa': tpa,
                    'ftm': ftm, 'fta': fta,
                    'starter': 1 if uni_number is not None and uni_number in starter_numbers else 0,
                }
                team_stats.append(stats)

            return team_stats

        home_stats = process_team_players(data['Stats']['HomeTeam'], self.home_team, 'HomeTeam')
        visiting_stats = process_team_players(data['Stats']['VisitingTeam'], self.visiting_team, 'VisitingTeam')

        # Create DataFrame and remove any duplicates based on unique player identifiers
        df = pd.DataFrame(home_stats + visiting_stats)

        # Deduplicate based on file_id, team, and name (one record per player per team per game)
        original_count = len(df)
        df = df.drop_duplicates(subset=['file_id', 'team', 'name'], keep='first')
        duplicates_removed = original_count - len(df)

        if duplicates_removed > 0:
            self.logger.warning(f"Removed {duplicates_removed} duplicate player record(s) within game processing")

        return df

    def process_team_totals(self, data: Dict) -> pd.DataFrame:
        """Process team totals."""
        self.logger.debug("Processing team totals")
        
        def process_team(team_data: Dict, team_name: str) -> Dict:
            totals = team_data['Totals']['Values']
            return {
                'source_id': self.source_id,
                'file_id': self.file_id,
                'team': team_name,
                'points': totals['Points'],
                'field_goals': totals['Fgam'],
                'fg_pct': totals['ShootingPercentage'],
                'three_pointers': totals['Tpam'],
                'three_pt_pct': totals['Tppercentage'],
                'free_throws': totals['Ftma'],
                'ft_pct': totals['Ftp'],
                'rebounds': totals['TotalRebounds'],
                'assists': totals['Assists'],
                'steals': totals['Steals'],
                'blocks': totals['Blocks'],
                'turnovers': totals['Turnovers'],
                'fouls': totals['PersonalFouls'],
                'offensive_rebounds': pbp_common.to_int(totals.get('OffensiveRebounds')),
                'defensive_rebounds': pbp_common.to_int(totals.get('DefensiveRebounds')),
                'technical_fouls': pbp_common.to_int(totals.get('TechnicalFouls'))
            }
        
        home_totals = process_team(data['Stats']['HomeTeam'], self.home_team)
        visiting_totals = process_team(data['Stats']['VisitingTeam'], self.visiting_team)
        
        return pd.DataFrame([home_totals, visiting_totals])
    
    def save_to_csv(self, dataframes: Dict[str, pd.DataFrame], output_dir: str) -> None:
        """Save all dataframes to CSV files, appending if files exist."""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)

        # Define unique key columns for each dataframe type to detect duplicates
        unique_keys = {
            'game_info': ['file_id'],
            'period_scores': ['file_id', 'team', 'period'],
            'plays': ['file_id', 'play_id'],
            'player_stats': ['file_id', 'team', 'name'],
            'team_totals': ['file_id', 'team']
        }

        for name, df in dataframes.items():
            file_path = output_path / f"{name}.csv"

            if file_path.exists():
                # Read existing file
                try:
                    existing_df = pd.read_csv(file_path)

                    # Check if this game is already in the file
                    game_exists = False
                    if not existing_df.empty and 'file_id' in existing_df.columns:
                        if df['file_id'].iloc[0] in existing_df['file_id'].values:
                            self.logger.info(f"Game {df['file_id'].iloc[0]} already exists in {name}.csv - skipping append")
                            game_exists = True

                    # Concatenate existing and new data
                    combined_df = pd.concat([existing_df, df], ignore_index=True)
                    self.logger.debug(f"{name}: Concatenated {len(existing_df)} existing + {len(df)} new = {len(combined_df)} total rows")

                    # Remove duplicates based on unique keys for this dataframe type
                    duplicates_removed = 0
                    if name in unique_keys:
                        # Legacy plays.csv files predate the play_id column; their
                        # rows would get NaN play_ids after concat and collapse
                        # under the new key, so fall back to the old composite
                        # key until the file has been rebuilt.
                        if name == 'plays' and 'play_id' not in existing_df.columns:
                            unique_keys = dict(unique_keys)
                            unique_keys['plays'] = ['file_id', 'period', 'time_remaining',
                                                    'team', 'play_type', 'play_action', 'narrative']
                        original_count = len(combined_df)

                        # Detailed debugging for player_stats
                        if self.debug and name == 'player_stats' and original_count > 30:
                            self.logger.debug(f"Before dedup sample data:")
                            sample = combined_df[['file_id', 'team', 'name']].head(4)
                            for idx, row in sample.iterrows():
                                self.logger.debug(f"  Row {idx}: file_id={repr(row['file_id'])}, team={repr(row['team'])}, name={repr(row['name'])}")

                        combined_df = combined_df.drop_duplicates(subset=unique_keys[name], keep='first')
                        duplicates_removed = original_count - len(combined_df)
                        self.logger.debug(f"{name}: After deduplication on {unique_keys[name]}: {len(combined_df)} rows (removed {duplicates_removed} duplicates)")

                        if duplicates_removed > 0:
                            self.logger.info(f"Removed {duplicates_removed} duplicate row(s) from {name}.csv")
                    else:
                        self.logger.debug(f"{name}: No unique keys defined, skipping deduplication")

                    # Write the deduplicated data if anything changed
                    rows_changed = len(combined_df) - len(existing_df)
                    self.logger.debug(f"{name}: Row count change: {len(existing_df)} -> {len(combined_df)} (diff: {rows_changed})")

                    if len(combined_df) != len(existing_df):
                        combined_df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                        if name in unique_keys and duplicates_removed > 0:
                            self.logger.info(f"Updated {name}.csv (added new data and removed duplicates)")
                        else:
                            self.logger.info(f"Appended new data to existing {name}.csv")
                    elif duplicates_removed > 0:
                        # Same row count but duplicates were removed (shouldn't happen often)
                        combined_df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                        self.logger.info(f"Cleaned up duplicates in {name}.csv")
                    else:
                        self.logger.debug(f"No changes needed for {name}.csv (data already exists)")
                except pd.errors.EmptyDataError:
                    # If the file exists but is empty, write new data
                    df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                    self.logger.info(f"Wrote new data to empty {name}.csv")
                except Exception as e:
                    self.logger.error(f"Error processing existing {name}.csv: {e}")
                    # Create backup of existing file
                    backup_path = file_path.with_suffix('.csv.bak')
                    if file_path.exists():
                        file_path.rename(backup_path)
                        self.logger.info(f"Created backup of existing file at {backup_path}")
                    # Write new data
                    df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                    self.logger.info(f"Wrote new data to {name}.csv after backing up existing file")
            else:
                # If file doesn't exist, create it
                df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                self.logger.info(f"Created new file {name}.csv")

    def process_game(self, filepath: str, output_dir: str) -> bool:
        """Process entire game and save to CSV files."""
        try:
            # Load data
            data = self.load_json_file(filepath)
            if not data:
                return False
            
            # Process all components
            dataframes = {
                'game_info': self.process_game_info(data),
                'period_scores': self.process_period_scores(data),
                'plays': self.process_plays(data),
                'player_stats': self.process_player_stats(data),
                'team_totals': self.process_team_totals(data)
            }
            
            # Save to CSV
            self.save_to_csv(dataframes, output_dir)
            
            return True
            
        except Exception as e:
            self.logger.error(f"Error processing game: {e}")
            return False

CORE_CSVS = ['game_info', 'period_scores', 'plays', 'player_stats', 'team_totals']


def process_season(season: str, base_dir: str = ".", output_dir: str = "basketball_data",
                   rebuild: bool = False, debug: bool = True):
    """Process all JSON files for a given season.

    With rebuild=True the five core CSVs are deleted first and regenerated
    from scratch — required once after any schema change, since the append
    path can't retrofit new columns onto existing rows.
    """
    # Create path to season directory
    season_path = Path(base_dir) / season

    # Check if season directory exists
    if not season_path.exists():
        print(f"Error: Season directory {season_path} does not exist")
        return

    # Find all JSON files, ordered by game id for deterministic output
    json_files = [str(p) for p in pbp_common.season_json_files(season_path)]

    if not json_files:
        print(f"No JSON files found in {season_path}")
        return

    if rebuild:
        for name in CORE_CSVS:
            csv_path = Path(output_dir) / f"{name}.csv"
            if csv_path.exists():
                csv_path.unlink()
                print(f"Rebuild: removed {csv_path}")

    print(f"Found {len(json_files)} JSON files to process")

    processor = BasketballGameProcessor(debug=debug)

    # Process each game
    successful = 0
    failed = 0

    for filepath in json_files:
        print(f"\nProcessing game from {filepath}")
        success = processor.process_game(filepath, output_dir)

        if success:
            successful += 1
            print(f"Successfully processed and saved/appended data from {filepath}")
        else:
            failed += 1
            print(f"Error processing game from {filepath}")

    print(f"\nProcessing complete: {successful} successful, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description="Parse game JSONs into the core season CSVs")
    parser.add_argument('season', nargs='?', default='2025-26',
                        help='Season directory to process (default: 2025-26)')
    parser.add_argument('--rebuild', action='store_true',
                        help='Delete and regenerate the core CSVs from all game JSONs')
    parser.add_argument('--quiet', action='store_true', help='Reduce logging output')
    args = parser.parse_args()

    process_season(args.season, base_dir=".", output_dir=args.season,
                   rebuild=args.rebuild, debug=not args.quiet)


if __name__ == "__main__":
    main()