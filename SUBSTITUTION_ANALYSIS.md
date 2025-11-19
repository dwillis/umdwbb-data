# Maryland Women's Basketball - Substitution Pattern Analysis

This system tracks and analyzes substitution patterns for Maryland Women's Basketball based on play-by-play data from game JSON files.

## Overview

The substitution analysis system provides insights into:
- **Individual substitution events** - Every time a player enters/exits the game
- **Substitution pairings** - Which players commonly substitute for each other
- **Rotation patterns** - When substitutions typically occur during games
- **Multi-player substitutions** - Mass substitutions (2+ players at once)
- **Player frequency** - How often each player is substituted

## Quick Start

To analyze a season's substitution patterns:

```bash
python process_substitutions.py 2024-25
```

This will generate 8 CSV files and 1 text report in the season directory.

## Generated Files

### CSV Data Files

1. **substitutions.csv** - Individual substitution events
   - Every substitution with timestamp, players involved, and game score
   - Columns: source_id, file_id, period, clock_seconds, time_remaining, player_out_number, player_out_name, player_in_number, player_in_name, maryland_score, opponent_score, score_diff, narrative

2. **substitution_pairs.csv** - Common substitution pairings
   - Which players typically substitute for each other
   - Columns: source_id, player_out_number, player_out_name, player_in_number, player_in_name, times_occurred, games, avg_period, avg_clock_seconds

3. **player_sub_frequency.csv** - Per-player substitution statistics
   - How often each player enters/exits the game
   - Columns: source_id, player_number, player_name, games_with_subs, total_subs_in, total_subs_out, avg_subs_in_per_game, avg_subs_out_per_game

4. **rotation_timing_patterns.csv** - When substitutions occur
   - Timing patterns by quarter and time bucket
   - Columns: source_id, period, time_bucket, total_subs, games, avg_subs_per_game, most_common_out, times_out, most_common_in, times_in

5. **situational_substitutions.csv** - Substitutions by game situation
   - Patterns based on score differential (leading, trailing, tied)
   - Columns: source_id, situation, total_subs, games, avg_subs_per_game, avg_period, most_common_out, times_out, most_common_in, times_in

6. **multi_player_substitutions.csv** - Multi-player substitution events
   - When 2+ players substitute simultaneously
   - Columns: source_id, file_id, period, clock_seconds, num_players, players_out, players_in, score_diff

7. **period_transition_subs.csv** - Substitutions at period starts
   - Patterns at the beginning of quarters
   - Columns: source_id, period, total_subs, games, avg_subs_per_game, most_common_out, times_out, most_common_in, times_in

### Report File

8. **substitution_report.txt** - Human-readable summary
   - Overview statistics
   - Key insights and patterns
   - Top players and pairings

## Individual Scripts

The processing pipeline consists of three main scripts:

### 1. substitution_parser.py
Parses substitution events from game JSON files.

```bash
python substitution_parser.py 2024-25
```

Outputs:
- substitutions.csv
- substitution_pairs.csv
- player_sub_frequency.csv

### 2. analyze_rotations.py
Analyzes rotation patterns from substitution data.

```bash
python analyze_rotations.py 2024-25/substitutions.csv
```

Outputs:
- rotation_timing_patterns.csv
- situational_substitutions.csv
- multi_player_substitutions.csv
- period_transition_subs.csv

### 3. generate_rotation_report.py
Generates human-readable summary report.

```bash
python generate_rotation_report.py 2024-25
```

Outputs to stdout or optional file:
```bash
python generate_rotation_report.py 2024-25 report.txt
```

## Example Insights

From the 2024-25 season analysis:

**Most Active Substitute**: Christina Dalce (#15)
- 268 total substitutions across 33 games
- Averages 3.88 subs in, 4.24 subs out per game

**Most Common Pairing**: Christina Dalce ↔ Allie Kubek
- These two players swap positions 82 times
- Dalce → Kubek: 44 times across 23 games
- Kubek → Dalce: 38 times across 16 games

**Peak Substitution Times**:
- Quarter 1: 5-7 minutes remaining (44 subs across 25 games)
- Quarter 2: 10-12 minutes remaining (start of period, 48 subs)
- Quarter 3: 10-12 minutes remaining (start of period, 61 subs)
- Quarter 4: 0-2 minutes remaining (endgame, 60 subs)

**Multi-Player Substitutions**:
- 1 five-player substitution (complete lineup change)
- 6 four-player substitutions
- 30 three-player substitutions
- 135 two-player substitutions

## Limitations

### What This System Tracks
✅ All substitution events with accurate timing
✅ Who substitutes for whom
✅ When substitutions occur
✅ Multi-player substitution patterns

### What This System Does NOT Track
❌ **Full 5-player lineup combinations** - We cannot reliably determine the starting lineup from play-by-play data alone, which means we cannot reconstruct the complete lineup state at every moment

❌ **Plus/minus for lineup combinations** - Without knowing all 5 players on court, we cannot calculate performance metrics for specific lineup combinations

❌ **Minutes played together** - Cannot determine how long specific player combinations were on the court together

### Why Not Full Lineup Tracking?

Starting lineup detection is unreliable because:
1. No explicit starting lineup data in JSON files
2. Minutes-played heuristic (top 5 = starters) fails when:
   - Starters get in foul trouble or injured
   - Bench players get extended minutes
3. Play-by-play doesn't always show all 5 starters before first substitution

**Example**: In game 18730, Christina Dalce started but only played 16 minutes, while bench player Mir McLean played 36 minutes. A simple "top 5 by minutes" heuristic would incorrectly identify McLean as a starter.

## Data Requirements

- JSON files for each game in the season directory (e.g., `2024-25/*.json`)
- JSON files must contain `Plays` array with substitution events
- Each substitution play has:
  - `Type: "SUBS"`
  - `Narrative` with format: "XX Player Name OUT; YY Player Name IN"
  - `Period` and `ClockSeconds` for timing

## Processing Multiple Seasons

To analyze all available seasons:

```bash
for season in 2014-15 2015-16 2016-17 2017-18 2018-19 2019-20 2020-21 2021-22 2022-23 2023-24 2024-25; do
    echo "Processing $season..."
    python process_substitutions.py $season
done
```

## Technical Details

### Substitution Narrative Parsing

The parser handles various narrative formats:
- Single substitution: `"02 Kaylene Smikle OUT; 10 Mir McLean IN"`
- Multi-player: `"02 Kaylene Smikle OUT; 14 Allie Kubek OUT; 06 Saylor Poffenbarger IN; 10 Mir McLean IN"`

Multi-player substitutions are split into individual pairing records for analysis.

### Time Bucketing

Rotation timing uses 2-minute buckets:
- 0-2min, 2-4min, 4-6min, 6-8min, 8-10min, 10-12min

### Maryland Team Detection

The parser automatically identifies Maryland as either home or visiting team and only tracks Maryland substitutions (opponent substitutions are ignored).

## Troubleshooting

**Error: Missing required CSV file**
- Make sure to run `substitution_parser.py` before `analyze_rotations.py`
- Or use the all-in-one `process_substitutions.py` script

**No substitutions found**
- Check that JSON files exist in the season directory
- Verify JSON files contain `Plays` array with substitution events

**Player names don't match**
- Names come directly from JSON play-by-play data
- May differ slightly from player_stats.csv (e.g., "S. SELLERS" vs "Shyanne Sellers")

## Future Enhancements

Potential improvements:
1. Add game-by-game substitution summaries
2. Compare rotation patterns vs opponent
3. Identify "clutch time" substitution strategies
4. Track substitutions by margin/situation more accurately (requires score tracking)
5. Visualizations (charts of rotation patterns)
6. Integration with player performance metrics

## Questions?

For issues or questions, contact the repository maintainer or open an issue on GitHub.
