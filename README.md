# UMDWBB-DATA

This repository includes data from Maryland Women's Basketball games from the 2014-15 season through the 2025-26 season. The data comes from the official university site (see [an example game](https://umterps.com/sports/womens-basketball/stats/2019-20/iowa/boxscore/11719)) and is not changed. A Python scraper for the data is included.

## Game Data Browser

A web interface is included to browse and analyze game data.

### View Online

The browser is available via GitHub Pages. Once enabled, visit:
`https://[username].github.io/umdwbb-data/`

### Setup GitHub Pages

To enable GitHub Pages for this repository:

1. Go to repository Settings
2. Navigate to "Pages" in the left sidebar
3. Under "Build and deployment":
   - Source: Deploy from a branch
   - Branch: Select your branch (e.g., `main` or the current branch)
   - Folder: / (root)
4. Click Save
5. Wait a few minutes for deployment
6. Visit the provided URL

### Local Usage

To use locally:

1. Open `index.html` in a web browser
2. Select a season from the grid
3. Choose a game to view detailed statistics
4. Use filters to explore plays and player statistics
5. Click on player names to see individual performance details

### Features

- Browse games by season (2014-15 through 2025-26)
- Filter plays by team, play type, action, and player
- Filter player statistics by points, rebounds, and assists
- Detailed player drill-down views with play-by-play
- Responsive design styled with Maryland state colors (red, gold, black)

## Team Season Totals Generator

A Python script that generates comprehensive team season statistics by aggregating data from all games in a given season.

### Usage

```bash
# Display season totals in console
python generate_team_season_totals.py SEASON

# Save to CSV file
python generate_team_season_totals.py SEASON --output FILENAME.csv

# Skip console display and only save to CSV
python generate_team_season_totals.py SEASON --output FILENAME.csv --no-display
```

### Examples

```bash
# View 2024-25 season stats in console
python generate_team_season_totals.py 2024-25

# Generate CSV for 2024-25 season
python generate_team_season_totals.py 2024-25 --output team_stats.csv

# Generate CSV for 2023-24 season in the season directory
python generate_team_season_totals.py 2023-24 --output 2023-24/team_season_totals.csv
```

### Statistics Included

**Basic Team Stats:**
- Games played, wins, losses, win percentage
- Total and per-game averages: points, rebounds, assists, steals, blocks, turnovers, fouls
- Shooting totals and percentages: FG%, 3P%, FT%

**Advanced Team Stats:**
- Effective Field Goal % (eFG%)
- True Shooting % (TS%)
- Free Throw Rate (FTR)
- Assist-to-Turnover Ratio
- Offensive Rating (points scored per game)
- Defensive Rating (points allowed per game)
- Net Rating (offensive - defensive rating)

### Output Format

The script provides two output formats:

1. **Console Display**: Formatted tables showing team stats sorted by wins
2. **CSV File**: Detailed statistics in spreadsheet format for further analysis

The CSV includes all statistics with the following columns:
- `team`, `games`, `wins`, `losses`, `win_pct`
- `total_points`, `ppg`, `points_allowed`, `off_rating`, `def_rating`, `net_rating`
- `fg_made`, `fg_attempted`, `fg_pct`, `three_made`, `three_attempted`, `three_pt_pct`
- `ft_made`, `ft_attempted`, `ft_pct`, `efg_pct`, `ts_pct`, `ft_rate`
- `total_rebounds`, `rpg`, `total_assists`, `apg`, `ast_to_ratio`
- `total_steals`, `spg`, `total_blocks`, `bpg`, `total_turnovers`, `tpg`, `total_fouls`, `fpg`
