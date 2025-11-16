# Advanced Basketball Statistics Suggestions

Based on the available data in this repository, here are recommended advanced statistics that can be calculated:

## Currently Available Data
- Player box score stats (points, rebounds, assists, steals, blocks, turnovers, minutes)
- Shooting stats (FG, 3P, FT with made/attempted counts)
- Play-by-play data with timestamps, actions, and running scores
- Team totals for each game

## Recommended Advanced Statistics

### 1. **True Shooting Percentage (TS%)**
Measures shooting efficiency accounting for 2-pointers, 3-pointers, and free throws.
- **Formula**: `Points / (2 * (FGA + 0.44 * FTA)) * 100`
- **Why it matters**: More accurate than FG% because it values 3-pointers appropriately and includes free throws
- **League average**: ~55% in college basketball

### 2. **Effective Field Goal Percentage (eFG%)**
Adjusts field goal percentage to account for 3-pointers being worth more.
- **Formula**: `(FGM + 0.5 * 3PM) / FGA * 100`
- **Why it matters**: Better shooting metric than raw FG% for comparing players with different shot selections
- **League average**: ~48-50% in college basketball

### 3. **Assist-to-Turnover Ratio (AST/TO)**
Measures ball-handling and decision-making efficiency.
- **Formula**: `Assists / Turnovers`
- **Why it matters**: Key metric for guards and playmakers
- **Good ratio**: Above 2.0 is excellent for college guards

### 4. **Usage Rate**
Estimates the percentage of team plays used by a player while on the floor.
- **Formula**: `100 * ((FGA + 0.44 * FTA + TOV) * (Team Minutes / 5)) / (Minutes * (Team FGA + 0.44 * Team FTA + Team TOV))`
- **Why it matters**: Shows how often a player is involved in offensive plays
- **Typical range**: 15-25% for role players, 25%+ for primary scorers

### 5. **Points Per Possession (PPP)**
Estimates how efficiently a player scores.
- **Formula**: `Points / (FGA + 0.44 * FTA + TOV)`
- **Why it matters**: Better than PPG for measuring offensive efficiency
- **Good value**: Above 1.0 is efficient

### 6. **Rebound Rate**
Percentage of available rebounds a player grabs while on the floor.
- **Offensive Rebound Rate**: `OReb * (Team Minutes / 5) / (Minutes * (Team OReb + Opponent DReb))`
- **Defensive Rebound Rate**: `DReb * (Team Minutes / 5) / (Minutes * (Team DReb + Opponent OReb))`
- **Why it matters**: Better than raw rebounds for comparing players with different minutes
- **Note**: Requires splitting rebounds into offensive/defensive (currently shows total)

### 7. **Steal Rate & Block Rate**
Percentage of opponent possessions ending in a steal/block while player is on floor.
- **Steal Rate**: `(Steals * (Team Minutes / 5)) / (Minutes * Opponent Possessions)`
- **Block Rate**: `(Blocks * (Team Minutes / 5)) / (Minutes * Opponent Possessions)`
- **Why it matters**: Measures defensive impact independent of minutes played
- **Note**: Requires possession estimates from play-by-play data

### 8. **Free Throw Rate (FTR)**
How often a player gets to the free throw line.
- **Formula**: `FTA / FGA`
- **Why it matters**: Indicates ability to draw fouls and get to the line
- **Good value**: Above 0.4 shows strong ability to draw contact

### 9. **Box Plus/Minus (BPM) - Simplified**
Estimates a player's contribution per 100 possessions.
- **Simplified Formula**: Combination of:
  - Scoring efficiency (TS%, PPG)
  - Playmaking (AST, AST/TO)
  - Rebounding (TRB rate)
  - Defense (STL, BLK)
  - Turnovers (negative impact)
- **Why it matters**: Single metric capturing overall contribution
- **Typical range**: 0 is average, +5 is very good, +10 is elite

### 10. **Game Score**
Quick metric to evaluate a single game performance.
- **Formula**: `PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*ORB + 0.3*DRB + STL + 0.7*AST + 0.7*BLK - 0.4*PF - TOV`
- **Why it matters**: Easy-to-calculate single-game performance metric
- **Good value**: 10+ is a solid game, 20+ is excellent, 30+ is outstanding

### 11. **Pace (Team Stat)**
Possessions per 40 minutes.
- **Formula**: `Possessions / (Minutes / 40)`
- **Possessions estimate**: `FGA + 0.44 * FTA - ORB + TOV`
- **Why it matters**: Controls for tempo when comparing team stats
- **Typical range**: 65-75 possessions per 40 minutes in college

### 12. **Offensive Rating (ORtg) & Defensive Rating (DRtg)**
Points produced/allowed per 100 possessions.
- **ORtg**: `(Points Produced / Possessions) * 100`
- **DRtg**: `(Opponent Points / Opponent Possessions) * 100`
- **Why it matters**: Tempo-independent efficiency metrics
- **Good values**: ORtg >110, DRtg <95 in college basketball

### 13. **Four Factors (Team Stats)**
Dean Oliver's four key factors for winning:
1. **Shooting** (eFG%)
2. **Turnovers** (TOV%)
3. **Rebounding** (Offensive Rebound %)
4. **Free Throws** (FT Rate and FT%)
- **Why it matters**: Statistical framework showing what drives winning

### 14. **Clutch Performance Stats**
Performance in close games (within 5 points in final 5 minutes).
- **Available from play-by-play data**: Can filter plays by score differential and time
- **Metrics**: FG%, points, +/-, turnovers in clutch situations
- **Why it matters**: Shows who performs under pressure

### 15. **Shot Distribution Analysis**
Breakdown of shot selection from play-by-play data.
- **At-rim %**: Layups, dunks
- **Mid-range %**: 2-point jumpers
- **Three-point %**: Shots from beyond the arc
- **Free throws per game**
- **Why it matters**: Modern analytics favor 3s and at-rim shots over mid-range

## Data Enhancements Needed

To calculate some of these advanced stats, you would benefit from:

1. **Offensive/Defensive Rebound Split**: Currently only total rebounds are tracked
2. **Personal Fouls**: Not currently in player_stats.csv
3. **Plus/Minus Tracking**: Could be calculated from play-by-play if you track lineups
4. **Shot Location Data**: If available in play-by-play narratives, could be extracted
5. **Lineup Data**: Who's on the floor together (for team-level metrics)

## Implementation Priority

**High Priority** (Easy to implement with current data):
1. True Shooting %
2. Effective Field Goal %
3. Assist-to-Turnover Ratio
4. Free Throw Rate
5. Game Score

**Medium Priority** (Requires some calculation):
1. Usage Rate
2. Points Per Possession
3. Pace
4. Four Factors

**Lower Priority** (Requires more complex analysis):
1. Box Plus/Minus
2. Offensive/Defensive Rating
3. Clutch Stats
4. Shot Chart Analysis

## Example Implementation

Here's sample code for calculating these stats in JavaScript:

```javascript
function calculateAdvancedStats(player) {
    // True Shooting %
    const ts = player.totalPoints / (2 * (player.fgAttempted + 0.44 * player.ftAttempted)) * 100;

    // Effective FG%
    const efg = (player.fgMade + 0.5 * player.threeMade) / player.fgAttempted * 100;

    // Assist to Turnover Ratio
    const astTo = player.totalAssists / player.totalTurnovers;

    // Free Throw Rate
    const ftr = player.ftAttempted / player.fgAttempted;

    // Points Per Possession (simplified)
    const ppp = player.totalPoints / (player.fgAttempted + 0.44 * player.ftAttempted + player.totalTurnovers);

    return { ts, efg, astTo, ftr, ppp };
}
```

These advanced statistics would provide much deeper insights into player and team performance beyond traditional box score stats.
