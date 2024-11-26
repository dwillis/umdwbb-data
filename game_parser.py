import csv
import json
import pandas as pd
import requests
from pathlib import Path
import logging
from typing import Dict, Any, List, Optional, Tuple
import os
import glob

def extract_ids_from_path(filepath: str) -> Tuple[str, str]:
    """Extract source_id and file_id from filepath."""
    try:
        # Get the directory structure
        parts = Path(filepath).parts
        # Find the part that contains source_id (e.g., "392-maryland")
        source_part = [p for p in parts if '-' in p and p.split('-')[0].isdigit()][0]
        source_id = source_part.split('-')[0]
        # Get the file name without extension
        file_id = Path(filepath).stem
        return source_id, file_id
    except (IndexError, AttributeError):
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
        """Process play-by-play data."""
        self.logger.debug("Processing plays")
        
        plays_list = []
        for play in data['Plays']:
            # Convert team reference to actual team name
            team_name = self.home_team if play['Team'] == 'HomeTeam' else self.visiting_team if play['Team'] == 'VisitingTeam' else play['Team']
            
            play_dict = {
                'source_id': self.source_id,
                'file_id': self.file_id,
                'period': play['Period'],
                'time_remaining': play['ClockSeconds'],
                'team': team_name,
                'play_type': play['Type'],
                'play_action': play['Action'],
                'narrative': play['Narrative']
            }
            
            # Add player information if available
            if play.get('Player'):
                play_dict.update({
                    'player_name': f"{play['Player']['FirstName']} {play['Player']['LastName']}".strip(),
                    'player_number': play['Player']['UniformNumber']
                })
            else:
                play_dict.update({
                    'player_name': None,
                    'player_number': None
                })
            
            # Add score information if available
            if play.get('Score'):
                play_dict.update({
                    'home_team_score': play['Score'].get('HomeTeam'),
                    'visiting_team_score': play['Score'].get('VisitingTeam')
                })
            else:
                play_dict.update({
                    'home_team_score': None,
                    'visiting_team_score': None
                })
            
            plays_list.append(play_dict)
        
        return pd.DataFrame(plays_list)

    def process_player_stats(self, data: Dict) -> pd.DataFrame:
        """Process player statistics."""
        self.logger.debug("Processing player statistics")
        
        def process_team_players(team_data: Dict, team_name: str) -> List[Dict]:
            players = team_data['PlayerGroups']['Players']['Values']
            team_stats = []
            
            for player in players:
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
                    'points': player['Points']
                }
                team_stats.append(stats)
            
            return team_stats
        
        home_stats = process_team_players(data['Stats']['HomeTeam'], self.home_team)
        visiting_stats = process_team_players(data['Stats']['VisitingTeam'], self.visiting_team)
        
        return pd.DataFrame(home_stats + visiting_stats)

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
                'fouls': totals['PersonalFouls']
            }
        
        home_totals = process_team(data['Stats']['HomeTeam'], self.home_team)
        visiting_totals = process_team(data['Stats']['VisitingTeam'], self.visiting_team)
        
        return pd.DataFrame([home_totals, visiting_totals])
    
    def save_to_csv(self, dataframes: Dict[str, pd.DataFrame], output_dir: str) -> None:
        """Save all dataframes to CSV files, appending if files exist."""
        output_path = Path(output_dir)
        output_path.mkdir(parents=True, exist_ok=True)
        
        for name, df in dataframes.items():
            file_path = output_path / f"{name}.csv"
            
            if file_path.exists():
                # Read existing file
                try:
                    existing_df = pd.read_csv(file_path)
                    
                    # Check if this game is already in the file
                    if not existing_df.empty and 'file_id' in existing_df.columns:
                        if df['file_id'].iloc[0] in existing_df['file_id'].values:
                            self.logger.info(f"Game {df['file_id'].iloc[0]} already exists in {name}.csv - skipping")
                            continue
                    
                    # Append new data
                    combined_df = pd.concat([existing_df, df], ignore_index=True)
                    combined_df.to_csv(file_path, index=False, quoting=csv.QUOTE_NONNUMERIC)
                    self.logger.info(f"Appended new data to existing {name}.csv")
                except pd.errors.EmptyDataError:
                    # If the file exists but is empty, write new data
                    df.to_csv(file_path, index=False)
                    self.logger.info(f"Wrote new data to empty {name}.csv")
                except Exception as e:
                    self.logger.error(f"Error processing existing {name}.csv: {e}")
                    # Create backup of existing file
                    backup_path = file_path.with_suffix('.csv.bak')
                    if file_path.exists():
                        file_path.rename(backup_path)
                        self.logger.info(f"Created backup of existing file at {backup_path}")
                    # Write new data
                    df.to_csv(file_path, index=False)
                    self.logger.info(f"Wrote new data to {name}.csv after backing up existing file")
            else:
                # If file doesn't exist, create it
                df.to_csv(file_path, index=False)
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

def process_season(season: str, base_dir: str = ".", output_dir: str = "basketball_data"):
    """Process all JSON files for a given season."""
    # Create path to season directory
    season_path = Path(base_dir) / season
    
    # Check if season directory exists
    if not season_path.exists():
        print(f"Error: Season directory {season_path} does not exist")
        return
    
    # Find all JSON files in the season directory and its subdirectories
    json_pattern = os.path.join(season_path, "*.json")
    json_files = glob.glob(json_pattern)
    
    if not json_files:
        print(f"No JSON files found in {season_path}")
        return
    
    print(f"Found {len(json_files)} JSON files to process")
    
    # Create processor with debug mode
    processor = BasketballGameProcessor(debug=True)
    
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

def main(season):
    # Example usage
    season = season  # Specify the season to process
    base_dir = "."      # Base directory containing season directories
    output_dir = season  # Output directory for CSV files
    
    process_season(season, base_dir, output_dir)

if __name__ == "__main__":
    main(season="2024-25")