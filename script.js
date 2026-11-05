// Global state
let currentSeason = null;
let currentGameId = null;
let allPlays = [];
let allStats = [];
let allTeamTotals = [];
let allPeriodScores = [];
let allGames = [];
let filteredPlays = [];
let filteredStats = [];
let seasonPlayerStats = [];
let filteredSeasonStats = [];
let seasonTeamTotals = [];
let assistNetwork = [];
let assistLeaders = [];
let assistReceivers = [];

// Per-game analysis data (loaded on game selection)
let gameStints = [];
let gameFouls = [];
let gameLineupStints = [];
let gameValidation = [];
let gameContext = [];
let gameRuns = [];

// Player identity index (box name -> career page id / full name)
let playerLinkMap = new Map();

// Timeline state
let sortedGames = [];           // Games sorted chronologically (oldest first)
let selectedGameIndex = -1;     // Index into sortedGames (0-based, -1 means all games)
let allSeasonStats = [];        // All player stats for the season (preserved for filtering)
let seasonScopeStats = [];      // Player stats within the current timeline selection

// Available seasons (most recent first)
const seasons = [
    '2026-27', '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21',
    '2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2014-15'
];

// CSV/JSON loading, parsing and formatting helpers live in js/data.js

// Initialize the app
async function init() {
    renderSeasonSelector();
    renderDashboard();
}

// Render season selector
function renderSeasonSelector() {
    const container = document.getElementById('season-selector');
    container.innerHTML = seasons.map(season =>
        `<button class="season-btn" onclick="selectSeason('${season}')">${season}</button>`
    ).join('');
}

// Current-season dashboard: the front door for the latest data.
// Loads the most recent season that has games and shows record, last
// result, team leaders, active streaks and the best lineup.
async function renderDashboard() {
    const container = document.getElementById('dashboard-content');
    if (!container) return;

    let season = null, games = [];
    for (const s of seasons) {
        const g = await loadCSV(s, 'game_info.csv');
        if (g.length > 0) { season = s; games = g; break; }
    }
    if (!season) {
        container.innerHTML = '<p class="section-note">No game data available yet.</p>';
        return;
    }

    document.getElementById('dashboard-title').textContent = `${season} Season`;

    // Maryland games only, chronological
    const mdGames = games
        .filter(g => g.home_team === 'Maryland' || g.visiting_team === 'Maryland')
        .filter((g, i, arr) => arr.findIndex(x => x.file_id === g.file_id) === i)
        .sort((a, b) => new Date(a.date) - new Date(b.date));

    if (mdGames.length === 0) {
        container.innerHTML = '<p class="section-note">No Maryland games in the latest season yet.</p>';
        return;
    }

    const [stats, streaks, lineups] = await Promise.all([
        loadCSV(season, 'player_stats.csv'),
        loadCSV(season, 'streaks.csv'),
        loadCSV(season, 'lineup_season.csv')
    ]);

    // Record + point totals
    let wins = 0, losses = 0, pointsFor = 0, pointsAgainst = 0;
    mdGames.forEach(g => {
        const isHome = g.home_team === 'Maryland';
        const md = parseInt(isHome ? g.home_score : g.visiting_score) || 0;
        const opp = parseInt(isHome ? g.visiting_score : g.home_score) || 0;
        pointsFor += md;
        pointsAgainst += opp;
        md > opp ? wins++ : losses++;
    });

    const last = mdGames[mdGames.length - 1];
    const lastMd = marylandPerspective(last);
    const margins = mdGames.map((g, i) => ({ i, margin: marylandPerspective(g).marylandScore - marylandPerspective(g).opponentScore }));
    const bestMargin = margins.reduce((best, cur) => cur.margin > best.margin ? cur : best);
    const bestWinGame = mdGames[bestMargin.i];
    const bestWinMd = marylandPerspective(bestWinGame);

    // Team leaders (Maryland, per-game)
    const leaders = new Map();
    stats.filter(s => s.team === 'Maryland').forEach(s => {
        const p = leaders.get(s.name) || { games: 0, points: 0, rebounds: 0, assists: 0 };
        p.games++;
        p.points += parseInt(s.points) || 0;
        p.rebounds += parseInt(s.rebounds) || 0;
        p.assists += parseInt(s.assists) || 0;
        leaders.set(s.name, p);
    });
    const leaderFor = key => [...leaders.entries()]
        .filter(([, p]) => p.games > 0)
        .sort((a, b) => b[1][key] / b[1].games - a[1][key] / a[1].games)[0];

    const streakLabel = { fg_makes: 'consecutive FGs made', three_makes: 'consecutive 3-pointers made', ft_makes: 'consecutive FTs made', fg_misses: 'consecutive FGs missed' };
    const activeStreaks = streaks
        .filter(s => s.active === '1' && s.streak_type !== 'fg_misses')
        .sort((a, b) => parseInt(b.length) - parseInt(a.length))
        .slice(0, 4);

    const bestLineup = [...lineups]
        .filter(l => parseFloat(l.minutes) >= 20 && l.net_per_40 !== '')
        .sort((a, b) => parseFloat(b.net_per_40) - parseFloat(a.net_per_40))[0];
    const mostUsedLineup = [...lineups]
        .filter(l => parseFloat(l.minutes) >= 20)
        .sort((a, b) => parseFloat(b.minutes) - parseFloat(a.minutes))[0];

    const leaderCell = (label, entry, unit) => entry ? `
        <div class="stat-chip">
            <span class="stat-chip-value">${(entry[1][unit] / entry[1].games).toFixed(1)}</span>
            ${label}: <strong>${escapeHtml(entry[0])}</strong>
        </div>` : '';

    container.innerHTML = `
        <div class="stat-strip">
            <div class="stat-chip"><span class="stat-chip-value">${wins}-${losses}</span> record</div>
            <div class="stat-chip"><span class="stat-chip-value">${(pointsFor / mdGames.length).toFixed(1)}</span> PPG ·
                <span class="stat-chip-value">${(pointsAgainst / mdGames.length).toFixed(1)}</span> allowed</div>
            ${leaderCell('PPG', leaderFor('points'), 'points')}
            ${leaderCell('RPG', leaderFor('rebounds'), 'rebounds')}
            ${leaderCell('APG', leaderFor('assists'), 'assists')}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            <div>
                <h3>Latest Game</h3>
                <div class="run-item run-maryland">
                    <span class="run-points">${lastMd.marylandScore > lastMd.opponentScore ? 'W' : 'L'}</span>
                    <span>${lastMd.isHome ? 'vs' : 'at'} <strong>${escapeHtml(lastMd.opponent)}</strong>
                    <strong>${lastMd.marylandScore}-${lastMd.opponentScore}</strong> · ${last.date}</span>
                </div>
                ${bestMargin.margin > 0 ? `
                <h3>Biggest Win</h3>
                <div class="run-item run-maryland">
                    <span class="run-points">+${bestMargin.margin}</span>
                    <span>${bestWinMd.isHome ? 'vs' : 'at'} <strong>${escapeHtml(bestWinMd.opponent)}</strong>
                    <strong>${bestWinMd.marylandScore}-${bestWinMd.opponentScore}</strong> · ${bestWinGame.date}</span>
                </div>` : `
                <h3>Closest Game</h3>
                <div class="run-item run-maryland">
                    <span class="run-points">${bestMargin.margin}</span>
                    <span>${bestWinMd.isHome ? 'vs' : 'at'} <strong>${escapeHtml(bestWinMd.opponent)}</strong>
                    <strong>${bestWinMd.marylandScore}-${bestWinMd.opponentScore}</strong> · ${bestWinGame.date}</span>
                </div>`}
            </div>
            <div>
                <h3>Active Streaks</h3>
                ${activeStreaks.length === 0 ? '<p class="section-note">No active streaks right now.</p>' :
                    activeStreaks.map(s => `
                    <div class="run-item run-maryland">
                        <span class="run-points">${s.length}</span>
                        <span><strong>${escapeHtml(s.player_name)}</strong> · ${streakLabel[s.streak_type] || s.streak_type}</span>
                    </div>`).join('')}
                ${bestLineup ? `
                <h3>Best Lineup (20+ min)</h3>
                <div class="run-item run-maryland">
                    <span class="run-points">+${parseFloat(bestLineup.net_per_40).toFixed(1)}</span>
                    <span>Net/40: ${escapeHtml(bestLineup.lineup.split('|').join(', '))}</span>
                </div>` : ''}
                ${mostUsedLineup && mostUsedLineup !== bestLineup ? `
                <h3>Most-Used Lineup</h3>
                <div class="run-item run-maryland">
                    <span class="run-points">${parseFloat(mostUsedLineup.minutes).toFixed(0)}m</span>
                    <span>${escapeHtml(mostUsedLineup.lineup.split('|').join(', '))}</span>
                </div>` : ''}
            </div>
        </div>
        <p style="margin-top:1rem;">
            <button class="btn-primary" onclick="selectSeason('${season}')">Open the ${season} season →</button>
        </p>
    `;
}

// Select a season
async function selectSeason(season) {
    currentSeason = season;
    document.getElementById('selected-season').textContent = season;
    document.getElementById('season-stats-season').textContent = season;

    // Load games, player stats, team season totals, and assist data for this season
    let playersIndex;
    [allGames, allSeasonStats, seasonTeamTotals, assistNetwork, assistLeaders, assistReceivers, playersIndex] = await Promise.all([
        loadCSV(season, 'game_info.csv'),
        loadCSV(season, 'player_stats.csv'),
        loadCSV(season, 'team_season_totals.csv'),
        loadCSV(season, 'assist_network.csv'),
        loadCSV(season, 'assist_leaders.csv'),
        loadCSV(season, 'assist_receivers.csv'),
        loadPlayersIndex()
    ]);
    playerLinkMap = playersIndex.bySeasonBoxName;

    // Store all stats for filtering
    allStats = [...allSeasonStats];
    seasonScopeStats = [...allSeasonStats];

    // Setup the game timeline
    setupGameTimeline();

    // Show sections
    document.getElementById('games-section').style.display = 'block';
    document.getElementById('season-stats-section').style.display = 'block';
    document.getElementById('game-details-section').style.display = 'none';

    renderGames();

    // Scroll to season stats section
    document.getElementById('season-stats-section').scrollIntoView({ behavior: 'smooth' });
}

// Setup the game timeline selector
function setupGameTimeline() {
    // Remove duplicates and sort games chronologically (oldest first)
    const uniqueGames = [];
    const seenIds = new Set();

    for (const game of allGames) {
        if (!seenIds.has(game.file_id)) {
            seenIds.add(game.file_id);
            uniqueGames.push(game);
        }
    }

    // Sort by date (oldest first for timeline)
    sortedGames = uniqueGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Filter to only Maryland games
    sortedGames = sortedGames.filter(game =>
        game.home_team === 'Maryland' || game.visiting_team === 'Maryland'
    );

    if (sortedGames.length === 0) {
        document.getElementById('game-timeline-container').style.display = 'none';
        // Aggregate all stats if no Maryland games
        aggregateSeasonStats(allSeasonStats);
        renderSeasonTeamTotals();
        applySeasonStatsFilter();
        return;
    }

    document.getElementById('game-timeline-container').style.display = 'block';

    // Setup slider
    const slider = document.getElementById('game-timeline-slider');
    slider.min = 1;
    slider.max = sortedGames.length;
    slider.value = sortedGames.length; // Start at most recent (all games)

    // Update labels
    document.getElementById('timeline-start-label').textContent = 'Game 1';
    document.getElementById('timeline-end-label').textContent = `Game ${sortedGames.length}`;

    // Set initial state to show all games
    selectedGameIndex = sortedGames.length - 1;
    updateGameTimeline(sortedGames.length);
}

// Update the game timeline when slider changes
function updateGameTimeline(gameNumber) {
    const index = parseInt(gameNumber) - 1; // Convert to 0-based index
    selectedGameIndex = index;

    const game = sortedGames[index];
    if (!game) return;

    // Update display info
    document.getElementById('timeline-current-game').textContent = `Game ${gameNumber} of ${sortedGames.length}`;
    document.getElementById('timeline-current-date').textContent = game.date;

    // Determine opponent
    const isHome = game.home_team === 'Maryland';
    const opponent = isHome ? game.visiting_team : game.home_team;
    const marylandScore = isHome ? parseInt(game.home_score) : parseInt(game.visiting_score);
    const opponentScore = isHome ? parseInt(game.visiting_score) : parseInt(game.home_score);
    const result = marylandScore > opponentScore ? 'W' : 'L';

    document.getElementById('timeline-opponent').textContent =
        `${result} vs ${opponent} (${marylandScore}-${opponentScore})`;

    // Calculate record through this game
    let wins = 0, losses = 0;
    for (let i = 0; i <= index; i++) {
        const g = sortedGames[i];
        const gIsHome = g.home_team === 'Maryland';
        const gMarylandScore = gIsHome ? parseInt(g.home_score) : parseInt(g.visiting_score);
        const gOpponentScore = gIsHome ? parseInt(g.visiting_score) : parseInt(g.home_score);
        if (gMarylandScore > gOpponentScore) {
            wins++;
        } else {
            losses++;
        }
    }

    document.getElementById('timeline-record').innerHTML =
        `Record: <span class="wins">${wins}</span>-<span class="losses">${losses}</span>`;

    // Get file_ids for games through this point
    const gameIdsThrough = new Set(sortedGames.slice(0, index + 1).map(g => g.file_id));

    // Filter stats to only include games through this point
    seasonScopeStats = allSeasonStats.filter(stat => gameIdsThrough.has(stat.file_id));
    const filteredStats = seasonScopeStats;

    // Aggregate stats for selected timeframe
    aggregateSeasonStats(filteredStats);

    // Compute team season totals dynamically
    computeTeamSeasonTotals(sortedGames.slice(0, index + 1), filteredStats);

    // Apply current filter and render
    applySeasonStatsFilter();
}

// Compute team season totals dynamically based on filtered games
function computeTeamSeasonTotals(games, playerStats) {
    // Calculate Maryland's stats
    const teamStats = {
        maryland: {
            games: 0,
            wins: 0,
            losses: 0,
            points: 0,
            pointsAllowed: 0,
            rebounds: 0,
            assists: 0,
            steals: 0,
            blocks: 0,
            turnovers: 0,
            fgMade: 0,
            fgAttempted: 0,
            threeMade: 0,
            threeAttempted: 0,
            ftMade: 0,
            ftAttempted: 0
        }
    };

    // Process each game for team-level stats
    games.forEach(game => {
        const isHome = game.home_team === 'Maryland';
        const marylandScore = isHome ? parseInt(game.home_score) : parseInt(game.visiting_score);
        const opponentScore = isHome ? parseInt(game.visiting_score) : parseInt(game.home_score);

        teamStats.maryland.games++;
        teamStats.maryland.points += marylandScore;
        teamStats.maryland.pointsAllowed += opponentScore;

        if (marylandScore > opponentScore) {
            teamStats.maryland.wins++;
        } else {
            teamStats.maryland.losses++;
        }
    });

    // Aggregate player stats for Maryland
    playerStats.filter(s => s.team === 'Maryland').forEach(stat => {
        teamStats.maryland.rebounds += parseInt(stat.rebounds) || 0;
        teamStats.maryland.assists += parseInt(stat.assists) || 0;
        teamStats.maryland.steals += parseInt(stat.steals) || 0;
        teamStats.maryland.blocks += parseInt(stat.blocks) || 0;
        teamStats.maryland.turnovers += parseInt(stat.turnovers) || 0;

        if (stat.field_goals) {
            const [made, attempted] = stat.field_goals.split('-').map(n => parseInt(n) || 0);
            teamStats.maryland.fgMade += made;
            teamStats.maryland.fgAttempted += attempted;
        }
        if (stat.three_pointers) {
            const [made, attempted] = stat.three_pointers.split('-').map(n => parseInt(n) || 0);
            teamStats.maryland.threeMade += made;
            teamStats.maryland.threeAttempted += attempted;
        }
        if (stat.free_throws) {
            const [made, attempted] = stat.free_throws.split('-').map(n => parseInt(n) || 0);
            teamStats.maryland.ftMade += made;
            teamStats.maryland.ftAttempted += attempted;
        }
    });

    const md = teamStats.maryland;
    const gamesPlayed = md.games || 1;

    // Calculate percentages and per-game stats
    const fgPct = md.fgAttempted > 0 ? (md.fgMade / md.fgAttempted * 100) : 0;
    const threePtPct = md.threeAttempted > 0 ? (md.threeMade / md.threeAttempted * 100) : 0;
    const ftPct = md.ftAttempted > 0 ? (md.ftMade / md.ftAttempted * 100) : 0;

    // Advanced stats
    const efgPct = md.fgAttempted > 0 ? ((md.fgMade + 0.5 * md.threeMade) / md.fgAttempted * 100) : 0;
    const tsPct = (md.fgAttempted + 0.44 * md.ftAttempted) > 0
        ? (md.points / (2 * (md.fgAttempted + 0.44 * md.ftAttempted)) * 100) : 0;
    const ftRate = md.fgAttempted > 0 ? (md.ftAttempted / md.fgAttempted) : 0;
    const astToRatio = md.turnovers > 0 ? (md.assists / md.turnovers) : md.assists;

    const offRating = md.points / gamesPlayed;
    const defRating = md.pointsAllowed / gamesPlayed;
    const netRating = offRating - defRating;

    // Create computed season totals object
    seasonTeamTotals = [{
        team: 'Maryland',
        games: md.games,
        wins: md.wins,
        losses: md.losses,
        win_pct: md.games > 0 ? (md.wins / md.games * 100) : 0,
        ppg: (md.points / gamesPlayed).toFixed(1),
        rpg: (md.rebounds / gamesPlayed).toFixed(1),
        apg: (md.assists / gamesPlayed).toFixed(1),
        spg: (md.steals / gamesPlayed).toFixed(1),
        bpg: (md.blocks / gamesPlayed).toFixed(1),
        tpg: (md.turnovers / gamesPlayed).toFixed(1),
        fg_pct: fgPct.toFixed(1),
        three_pt_pct: threePtPct.toFixed(1),
        ft_pct: ftPct.toFixed(1),
        efg_pct: efgPct.toFixed(1),
        ts_pct: tsPct.toFixed(1),
        ft_rate: ftRate.toFixed(2),
        ast_to_ratio: astToRatio.toFixed(2),
        off_rating: offRating.toFixed(1),
        def_rating: defRating.toFixed(1),
        net_rating: netRating.toFixed(1)
    }];

    renderSeasonTeamTotals();
}

// Render games list
function renderGames() {
    const container = document.getElementById('games-list');

    if (allGames.length === 0) {
        container.innerHTML = '<p>No games found for this season.</p>';
        return;
    }

    // Remove duplicates based on file_id
    const uniqueGames = [];
    const seenIds = new Set();

    for (const game of allGames) {
        if (!seenIds.has(game.file_id)) {
            seenIds.add(game.file_id);
            uniqueGames.push(game);
        }
    }

    // Sort by date (most recent first)
    uniqueGames.sort((a, b) => new Date(b.date) - new Date(a.date));

    container.innerHTML = uniqueGames.map(game => `
        <div class="game-card" onclick="selectGame('${game.file_id}')">
            <div class="game-card-header">
                <span class="game-date">${game.date}</span>
                <span class="game-score">${parseInt(game.home_score)} - ${parseInt(game.visiting_score)}</span>
            </div>
            <div class="game-teams">
                <strong>${game.home_team}</strong> vs <strong>${game.visiting_team}</strong>
            </div>
            <div class="game-location">${game.location}</div>
        </div>
    `).join('');
}

// Select a game
async function selectGame(gameId) {
    currentGameId = gameId;

    // Load all data for this game (season files are cached after first load)
    let seasonStints, seasonFouls, seasonLineups, seasonValidation, seasonContext, seasonRuns;
    [allPlays, allStats, allTeamTotals, allPeriodScores,
     seasonStints, seasonFouls, seasonLineups, seasonValidation, seasonContext, seasonRuns] = await Promise.all([
        loadCSV(currentSeason, 'plays.csv'),
        loadCSV(currentSeason, 'player_stats.csv'),
        loadCSV(currentSeason, 'team_totals.csv'),
        loadCSV(currentSeason, 'period_scores.csv'),
        loadCSV(currentSeason, 'stints.csv'),
        loadCSV(currentSeason, 'fouls.csv'),
        loadCSV(currentSeason, 'lineup_stints.csv'),
        loadCSV(currentSeason, 'lineup_validation.csv'),
        loadCSV(currentSeason, 'team_game_context.csv'),
        loadCSV(currentSeason, 'runs.csv')
    ]);

    // Filter by current game
    const id = normId(gameId);
    const byGame = row => normId(row.file_id) === id;
    allPlays = allPlays.filter(byGame);
    allStats = allStats.filter(byGame);
    allTeamTotals = allTeamTotals.filter(byGame);
    allPeriodScores = allPeriodScores.filter(byGame);
    gameStints = seasonStints.filter(byGame);
    gameFouls = seasonFouls.filter(byGame);
    gameLineupStints = seasonLineups.filter(byGame);
    gameValidation = seasonValidation.filter(byGame);
    gameContext = seasonContext.filter(byGame);
    gameRuns = seasonRuns.filter(byGame);

    filteredPlays = [...allPlays];
    filteredStats = [...allStats];

    // Show game details section
    document.getElementById('game-details-section').style.display = 'block';

    // Reset to the Game Flow tab
    document.querySelectorAll('#game-details-section .tab-content').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('#game-details-section .tabs .tab-btn').forEach((btn, i) => {
        btn.classList.toggle('active', i === 0);
    });
    document.getElementById('gameflow-tab').classList.add('active');

    renderGameInfo();
    renderPeriodScoring();
    setupFilters();
    renderGameFlow();
    renderRotation();
    renderGameFouls();
    renderPlays();
    renderStats();
    renderTeamTotals();

    // Scroll to game details
    document.getElementById('game-details-section').scrollIntoView({ behavior: 'smooth' });
}

// ---- Game analysis helpers ----

function currentGame() {
    return allGames.find(g => normId(g.file_id) === normId(currentGameId));
}

function marylandPerspective(game) {
    const isHome = game.home_team === 'Maryland';
    return {
        isHome,
        opponent: isHome ? game.visiting_team : game.home_team,
        marylandScore: parseInt(isHome ? game.home_score : game.visiting_score),
        opponentScore: parseInt(isHome ? game.visiting_score : game.home_score)
    };
}

// Render the Game Flow tab: worm chart, lead stats, team context bars, runs
function renderGameFlow() {
    const container = document.getElementById('gameflow-content');
    const game = currentGame();
    if (!game || allPlays.length === 0 || !allPlays[0].seconds_elapsed) {
        container.innerHTML = '<p>No play-by-play flow data available for this game.</p>';
        return;
    }
    const md = marylandPerspective(game);

    const mdContext = gameContext.find(c => c.team === 'Maryland');
    const oppContext = gameContext.find(c => c.team !== 'Maryland');

    let statStrip = '';
    if (mdContext && oppContext) {
        statStrip = `
            <div class="stat-strip">
                <div class="stat-chip"><span class="stat-chip-value">${mdContext.lead_changes}</span> lead changes</div>
                <div class="stat-chip"><span class="stat-chip-value">${mdContext.ties}</span> ties</div>
                <div class="stat-chip"><span class="stat-chip-value">${mdContext.largest_lead}</span> largest MD lead</div>
                <div class="stat-chip"><span class="stat-chip-value">${formatTime(mdContext.time_with_lead_sec)}</span> time with lead (${parseFloat(mdContext.pct_lead).toFixed(0)}%)</div>
                ${parseInt(mdContext.largest_deficit) > 0 ? `<div class="stat-chip"><span class="stat-chip-value">${mdContext.largest_deficit}</span> largest deficit</div>` : ''}
            </div>`;
    }

    container.innerHTML = `
        <h3>Game Flow</h3>
        <p class="section-note">Maryland scoring margin over game time. Hover for the play and score.</p>
        ${statStrip}
        <div id="worm-chart" class="chart-frame"></div>
        <div class="flow-columns">
            <div>
                <h3>How Points Were Scored</h3>
                <div id="context-bars"></div>
            </div>
            <div>
                <h3>Scoring Runs (6-0 or better)</h3>
                <div id="game-runs"></div>
            </div>
        </div>
    `;

    Charts.wormChart(document.getElementById('worm-chart'), allPlays, {
        marylandIsHome: md.isHome,
        opponentName: md.opponent
    });

    if (mdContext && oppContext) {
        Charts.comparisonBars(document.getElementById('context-bars'), [
            { label: 'Points in paint', a: +mdContext.points_in_paint, b: +oppContext.points_in_paint },
            { label: 'Fast break', a: +mdContext.points_fastbreak, b: +oppContext.points_fastbreak },
            { label: 'Off turnovers', a: +mdContext.points_off_turnovers, b: +oppContext.points_off_turnovers },
            { label: 'Second chance', a: +mdContext.points_second_chance, b: +oppContext.points_second_chance },
            { label: 'Bench points', a: +mdContext.points_from_bench, b: +oppContext.points_from_bench }
        ], 'Maryland', md.opponent);
    } else {
        document.getElementById('context-bars').innerHTML = '<p>No team context data for this game.</p>';
    }

    const runsContainer = document.getElementById('game-runs');
    if (gameRuns.length === 0) {
        runsContainer.innerHTML = '<p>No runs of 6-0 or better in this game.</p>';
    } else {
        const runs = [...gameRuns].sort((a, b) => (+b.points) - (+a.points));
        runsContainer.innerHTML = runs.map(run => `
            <div class="run-item ${run.team === 'Maryland' ? 'run-maryland' : ''}">
                <span class="run-points">${run.points}-0</span>
                <span>${run.team} · ${formatElapsed(run.start_seconds)}–${formatElapsed(run.end_seconds)}
                (${run.score_before} → ${run.score_after})</span>
            </div>
        `).join('');
    }
}

// Render the Rotation tab: stint gantt per team + game lineup table
function renderRotation() {
    const container = document.getElementById('rotation-content');
    const game = currentGame();
    if (!game || gameStints.length === 0) {
        container.innerHTML = '<p>No substitution data available for this game.</p>';
        return;
    }
    const md = marylandPerspective(game);

    // Confidence badge from minutes reconciliation
    const worstDelta = Math.max(0, ...gameValidation.map(v => Math.abs(parseFloat(v.delta) || 0)));
    const lowConfidence = worstDelta > 2;
    const badge = lowConfidence
        ? `<span class="confidence-badge low" title="Reconstructed minutes differ from the box score by up to ${worstDelta.toFixed(1)} min — the play-by-play feed is missing some substitutions.">⚠ estimated</span>`
        : `<span class="confidence-badge ok" title="Reconstructed minutes match the box score within 2 minutes for every player.">✓ verified vs box score</span>`;

    container.innerHTML = `
        <h3>Rotation Chart ${badge}</h3>
        <p class="section-note">Floor time reconstructed from play-by-play substitutions. Bars are colored by
        the team's scoring margin during the stint (green = outscored opponent); ★ = starter; gold dots = personal fouls.</p>
        <h4 class="rotation-team-label maryland-text">Maryland</h4>
        <div id="rotation-md" class="chart-frame"></div>
        <h4 class="rotation-team-label">${md.opponent}</h4>
        <div id="rotation-opp" class="chart-frame"></div>
        <h3 style="margin-top:1.5rem;">Five-Player Lineups (Maryland)</h3>
        <div id="game-lineups"></div>
    `;

    Charts.rotationChart(document.getElementById('rotation-md'),
        gameStints.filter(s => s.team === 'Maryland'),
        gameFouls.filter(f => f.team === 'Maryland'), allPlays);
    Charts.rotationChart(document.getElementById('rotation-opp'),
        gameStints.filter(s => s.team !== 'Maryland'),
        gameFouls.filter(f => f.team !== 'Maryland'), allPlays);

    const lineups = gameLineupStints
        .filter(l => l.team === 'Maryland' && l.num_players === '5')
        .reduce((map, seg) => {
            const entry = map.get(seg.lineup) || { seconds: 0, pf: 0, pa: 0 };
            entry.seconds += parseInt(seg.duration) || 0;
            entry.pf += parseInt(seg.pts_for) || 0;
            entry.pa += parseInt(seg.pts_against) || 0;
            map.set(seg.lineup, entry);
            return map;
        }, new Map());

    const lineupRows = [...lineups.entries()]
        .sort((a, b) => b[1].seconds - a[1].seconds)
        .filter(([, v]) => v.seconds >= 60);

    document.getElementById('game-lineups').innerHTML = lineupRows.length === 0
        ? '<p>No lineup data.</p>'
        : `<table>
            <thead><tr><th>Lineup</th><th>Min</th><th>Pts For</th><th>Pts Against</th><th>+/-</th></tr></thead>
            <tbody>${lineupRows.map(([lineup, v]) => {
                const pm = v.pf - v.pa;
                return `<tr>
                    <td>${lineup.split('|').join(', ')}</td>
                    <td>${(v.seconds / 60).toFixed(1)}</td>
                    <td>${v.pf}</td>
                    <td>${v.pa}</td>
                    <td class="${pm > 0 ? 'pos' : pm < 0 ? 'neg' : ''}"><strong>${pm > 0 ? '+' : ''}${pm}</strong></td>
                </tr>`;
            }).join('')}</tbody>
        </table>`;

    enhanceTables(document.getElementById('game-lineups'), { minSearchRows: 8 });
}

// Render the game Fouls tab: timeline, team fouls by period, trouble callouts
function renderGameFouls() {
    const container = document.getElementById('game-fouls-content');
    const game = currentGame();
    if (!game || gameFouls.length === 0) {
        container.innerHTML = '<p>No foul data available for this game.</p>';
        return;
    }
    const md = marylandPerspective(game);

    container.innerHTML = `
        <h3>Foul Timeline</h3>
        <p class="section-note">Each tick is a foul; purple ticks are technicals. Gold shading marks time
        spent in the penalty (opponent shooting bonus free throws).</p>
        <div id="foul-timeline" class="chart-frame"></div>
        <div class="flow-columns">
            <div>
                <h3>Team Fouls by Period</h3>
                <div id="fouls-by-period"></div>
            </div>
            <div>
                <h3>Foul Trouble</h3>
                <div id="foul-trouble"></div>
            </div>
        </div>
    `;

    Charts.foulTimeline(document.getElementById('foul-timeline'), gameFouls, allPlays, 'Maryland', md.opponent);

    // Team fouls by period table
    const periods = [...new Set(gameFouls.map(f => parseInt(f.period)))].sort((a, b) => a - b);
    const shape = Charts.gameShape(allPlays);
    const countFor = (team, period) => gameFouls.filter(f =>
        f.team === team && parseInt(f.period) === period && f.foul_type === 'personal').length;
    document.getElementById('fouls-by-period').innerHTML = `
        <table>
            <thead><tr><th>Team</th>${periods.map(p => `<th>${p <= (shape.isHalves ? 2 : 4) ? (shape.isHalves ? 'H' : 'Q') + p : 'OT' + (p - (shape.isHalves ? 2 : 4))}</th>`).join('')}<th>Total</th></tr></thead>
            <tbody>
                ${['Maryland', md.opponent].map(team => `
                    <tr class="${team === 'Maryland' ? 'team-maryland' : ''}">
                        <td><strong>${team}</strong></td>
                        ${periods.map(p => {
                            const count = countFor(team, p);
                            const threshold = shape.isHalves ? 7 : 5;
                            return `<td class="${count >= threshold ? 'bonus-cell' : ''}">${count}</td>`;
                        }).join('')}
                        <td><strong>${gameFouls.filter(f => f.team === team && f.foul_type === 'personal').length}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
        <p class="section-note">Highlighted cells: team reached the bonus that period.</p>
    `;

    // Foul trouble callouts: fouls accumulated ahead of the usual pace
    const callouts = [];
    gameFouls.forEach(f => {
        if (f.foul_type !== 'personal' || !f.player_name) return;
        const count = parseInt(f.player_foul_count) || 0;
        const period = parseInt(f.period);
        const troubled = shape.isHalves ? (count >= 2 && period === 1) || count >= 4
                                        : count >= period + 1;
        if (troubled && count >= 2) {
            callouts.push({
                team: f.team, player: f.player_name, count,
                when: `${formatTime(f.time_remaining)} left in ${shape.isHalves ? 'H' : 'Q'}${period}`
            });
        }
    });
    document.getElementById('foul-trouble').innerHTML = callouts.length === 0
        ? '<p>No players got ahead of the foul pace in this game.</p>'
        : callouts.map(c => `
            <div class="run-item ${c.team === 'Maryland' ? 'run-maryland' : ''}">
                <span class="run-points">${c.count} PF</span>
                <span><strong>${c.player}</strong> (${c.team}) — foul #${c.count} with ${c.when}</span>
            </div>
        `).join('');
}

// Render game info
function renderGameInfo() {
    const game = allGames.find(g => g.file_id === currentGameId);
    if (!game) return;

    const container = document.getElementById('game-info');
    container.innerHTML = `
        <div class="game-info-grid">
            <div class="info-item">
                <span class="info-label">Date:</span> ${game.date}
            </div>
            <div class="info-item">
                <span class="info-label">Location:</span> ${game.location}
            </div>
            <div class="info-item">
                <span class="info-label">Home:</span> ${game.home_team} (${parseInt(game.home_score)})
            </div>
            <div class="info-item">
                <span class="info-label">Visiting:</span> ${game.visiting_team} (${parseInt(game.visiting_score)})
            </div>
            <div class="info-item">
                <span class="info-label">Home Record:</span> ${game.home_record}
            </div>
            <div class="info-item">
                <span class="info-label">Visiting Record:</span> ${game.visiting_record}
            </div>
            ${game.officials ? `<div class="info-item"><span class="info-label">Officials:</span> ${game.officials}</div>` : ''}
            ${game.attendance ? `<div class="info-item"><span class="info-label">Attendance:</span> ${game.attendance}</div>` : ''}
        </div>
    `;
}

// Render period scoring from PeriodScores data
function renderPeriodScoring() {
    const game = allGames.find(g => g.file_id === currentGameId);
    if (!game || allPeriodScores.length === 0) return;

    const container = document.getElementById('period-scoring');

    // Get unique periods and sort them
    const periods = [...new Set(allPeriodScores.map(p => parseInt(p.period)))].sort((a, b) => a - b);

    // Organize period scores by team and period
    const homeScores = {};
    const visitingScores = {};

    allPeriodScores.forEach(ps => {
        const period = parseInt(ps.period);
        const score = parseInt(ps.score) || 0;

        if (ps.team === game.home_team) {
            homeScores[period] = score;
        } else if (ps.team === game.visiting_team) {
            visitingScores[period] = score;
        }
    });

    // Generate the period scoring table
    const shape = Charts.gameShape(allPlays);
    const periodLabels = periods.map(p => shape.isHalves
        ? (p <= 2 ? `H${p}` : `OT${p - 2}`)
        : (p <= 4 ? `Q${p}` : `OT${p - 4}`));

    // Maryland per-period points and margins (when Maryland is in this game)
    const marylandInGame = game.home_team === 'Maryland' || game.visiting_team === 'Maryland';
    const mdIsHome = game.home_team === 'Maryland';
    const mdScores = {};
    const oppScores = {};
    periods.forEach(p => {
        mdScores[p] = (mdIsHome ? homeScores[p] : visitingScores[p]) || 0;
        oppScores[p] = (!mdIsHome ? homeScores[p] : visitingScores[p]) || 0;
    });

    container.innerHTML = `
        <h3>Scoring by Period</h3>
        <div class="period-scoring-table">
            <table>
                <thead>
                    <tr>
                        <th>Team</th>
                        ${periodLabels.map(label => `<th>${label}</th>`).join('')}
                        <th>Total</th>
                    </tr>
                </thead>
                <tbody>
                    <tr class="${game.visiting_team === 'Maryland' ? 'team-maryland' : ''}">
                        <td><strong>${escapeHtml(game.visiting_team)}</strong></td>
                        ${periods.map(p => `<td>${visitingScores[p] || 0}</td>`).join('')}
                        <td><strong>${parseInt(game.visiting_score)}</strong></td>
                    </tr>
                    <tr class="${game.home_team === 'Maryland' ? 'team-maryland' : ''}">
                        <td><strong>${escapeHtml(game.home_team)}</strong></td>
                        ${periods.map(p => `<td>${homeScores[p] || 0}</td>`).join('')}
                        <td><strong>${parseInt(game.home_score)}</strong></td>
                    </tr>
                    ${marylandInGame ? `
                    <tr>
                        <td><strong>Maryland margin</strong></td>
                        ${periods.map(p => {
                            const margin = mdScores[p] - oppScores[p];
                            return `<td class="${margin > 0 ? 'pos' : margin < 0 ? 'neg' : ''}">${margin > 0 ? '+' : ''}${margin}</td>`;
                        }).join('')}
                        <td><strong class="${parseInt(mdIsHome ? game.home_score : game.visiting_score) > parseInt(mdIsHome ? game.visiting_score : game.home_score) ? 'pos' : 'neg'}">
                            ${parseInt(mdIsHome ? game.home_score : game.visiting_score) - parseInt(mdIsHome ? game.visiting_score : game.home_score) > 0 ? '+' : ''}
                            ${parseInt(mdIsHome ? game.home_score : game.visiting_score) - parseInt(mdIsHome ? game.visiting_score : game.home_score)}</strong></td>
                    </tr>` : ''}
                </tbody>
            </table>
        </div>
    `;

    enhanceTables(container, { minSearchRows: 100 });
}

// Setup filter dropdowns
function setupFilters() {
    // Team filter
    const teams = [...new Set(allPlays.map(p => p.team).filter(t => t))];
    document.getElementById('team-filter').innerHTML =
        '<option value="">All Teams</option>' +
        teams.map(t => `<option value="${t}">${t}</option>`).join('');

    // Play type filter
    const playTypes = [...new Set(allPlays.map(p => p.play_type).filter(t => t))];
    document.getElementById('playtype-filter').innerHTML =
        '<option value="">All Play Types</option>' +
        playTypes.map(t => `<option value="${t}">${t}</option>`).join('');

    // Action filter
    const actions = [...new Set(allPlays.map(p => p.play_action).filter(a => a))];
    document.getElementById('action-filter').innerHTML =
        '<option value="">All Actions</option>' +
        actions.map(a => `<option value="${a}">${a}</option>`).join('');

    // Player filter
    const players = [...new Set(allPlays.map(p => p.player_name).filter(n => n))];
    players.sort();
    document.getElementById('player-filter').innerHTML =
        '<option value="">All Players</option>' +
        players.map(p => `<option value="${p}">${p}</option>`).join('');
}

// Apply plays filter
function applyPlaysFilter() {
    const team = document.getElementById('team-filter').value;
    const playType = document.getElementById('playtype-filter').value;
    const action = document.getElementById('action-filter').value;
    const player = document.getElementById('player-filter').value;

    filteredPlays = allPlays.filter(play => {
        if (team && play.team !== team) return false;
        if (playType && play.play_type !== playType) return false;
        if (action && play.play_action !== action) return false;
        if (player && play.player_name !== player) return false;
        return true;
    });

    renderPlays();
}

// Clear plays filter
function clearPlaysFilter() {
    document.getElementById('team-filter').value = '';
    document.getElementById('playtype-filter').value = '';
    document.getElementById('action-filter').value = '';
    document.getElementById('player-filter').value = '';
    filteredPlays = [...allPlays];
    renderPlays();
}

// Render plays
function renderPlays() {
    const container = document.getElementById('plays-list');

    if (filteredPlays.length === 0) {
        container.innerHTML = '<p>No plays match the current filter.</p>';
        return;
    }

    // Show result count at the top
    const resultCount = `<div class="filter-result-count"><strong>${filteredPlays.length}</strong> play${filteredPlays.length !== 1 ? 's' : ''} found</div>`;

    container.innerHTML = resultCount + filteredPlays.map(play => {
        const score = play.home_team_score || play.visiting_team_score ?
            `<span class="play-score">${play.home_team_score ? parseInt(play.home_team_score) : '-'} - ${play.visiting_team_score ? parseInt(play.visiting_team_score) : '-'}</span>` : '';

        const playerLink = play.player_name ?
            `<span class="play-player" onclick="showPlayerDetails('${play.player_name.replace(/'/g, "\\'")}')">${play.player_name}</span>` :
            '';

        return `
            <div class="play-item">
                <div class="play-header">
                    <div>
                        <span class="play-type">${play.play_type} ${play.play_action ? '- ' + play.play_action : ''}</span>
                        | Period ${play.period} | ${formatTime(play.time_remaining)} | ${play.team}
                    </div>
                    ${score}
                </div>
                <div class="play-narrative">${play.narrative}</div>
                ${playerLink ? `<div style="margin-top: 0.3rem;">${playerLink}</div>` : ''}
            </div>
        `;
    }).join('');
}

// Apply stats filter
function applyStatsFilter() {
    const minPoints = parseInt(document.getElementById('min-points').value) || 0;
    const minRebounds = parseInt(document.getElementById('min-rebounds').value) || 0;
    const minAssists = parseInt(document.getElementById('min-assists').value) || 0;

    filteredStats = allStats.filter(stat => {
        const points = parseInt(stat.points) || 0;
        const rebounds = parseInt(stat.rebounds) || 0;
        const assists = parseInt(stat.assists) || 0;

        return points >= minPoints && rebounds >= minRebounds && assists >= minAssists;
    });

    renderStats();
}

// Clear stats filter
function clearStatsFilter() {
    document.getElementById('min-points').value = '0';
    document.getElementById('min-rebounds').value = '0';
    document.getElementById('min-assists').value = '0';
    filteredStats = [...allStats];
    renderStats();
}

// Render stats
function renderStats() {
    const container = document.getElementById('stats-list');

    if (filteredStats.length === 0) {
        container.innerHTML = '<p>No player stats match the current filter.</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>Min</th>
                    <th>FG</th>
                    <th>FG%</th>
                    <th>3PT</th>
                    <th>3PT%</th>
                    <th>FT</th>
                    <th>FT%</th>
                    <th>Reb</th>
                    <th>Ast</th>
                    <th>TO</th>
                    <th>Stl</th>
                    <th>Blk</th>
                    <th>Pts</th>
                </tr>
            </thead>
            <tbody>
                ${filteredStats.map(stat => `
                    <tr class="${stat.team === 'Maryland' ? 'team-maryland' : ''}">
                        <td>${stat.team}</td>
                        <td class="player-name-cell" onclick="showPlayerDetails('${stat.name.replace(/'/g, "\\'")}')">${stat.name}</td>
                        <td>${stat.position}</td>
                        <td>${stat.minutes}</td>
                        <td>${stat.field_goals}</td>
                        <td>${stat.fg_pct}</td>
                        <td>${stat.three_pointers}</td>
                        <td>${stat.three_pt_pct}</td>
                        <td>${stat.free_throws}</td>
                        <td>${stat.ft_pct}</td>
                        <td>${stat.rebounds}</td>
                        <td>${stat.assists}</td>
                        <td>${stat.turnovers}</td>
                        <td>${stat.steals}</td>
                        <td>${stat.blocks}</td>
                        <td><strong>${stat.points}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enhanceTables(container);
}

// Render team totals
function renderTeamTotals() {
    const container = document.getElementById('team-totals-list');

    if (allTeamTotals.length === 0) {
        container.innerHTML = '<p>No team stats available.</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>FG</th>
                    <th>FG%</th>
                    <th>3PT</th>
                    <th>3PT%</th>
                    <th>FT</th>
                    <th>FT%</th>
                    <th>Reb</th>
                    <th>Ast</th>
                    <th>TO</th>
                    <th>Stl</th>
                    <th>Blk</th>
                    <th>Pts</th>
                </tr>
            </thead>
            <tbody>
                ${allTeamTotals.map(stat => `
                    <tr class="${stat.team === 'Maryland' ? 'team-maryland' : ''}">
                        <td><strong>${stat.team}</strong></td>
                        <td>${stat.field_goals}</td>
                        <td>${stat.fg_pct}</td>
                        <td>${stat.three_pointers}</td>
                        <td>${stat.three_pt_pct}</td>
                        <td>${stat.free_throws}</td>
                        <td>${stat.ft_pct}</td>
                        <td>${stat.rebounds}</td>
                        <td>${stat.assists}</td>
                        <td>${stat.turnovers}</td>
                        <td>${stat.steals}</td>
                        <td>${stat.blocks}</td>
                        <td><strong>${stat.points}</strong></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    // Four factors + efficiency (estimated possessions)
    const mdRow = allTeamTotals.find(t => t.team === 'Maryland');
    const oppRow = allTeamTotals.find(t => t !== mdRow);
    if (mdRow && oppRow) {
        const md = fourFactors(mdRow, oppRow);
        const opp = fourFactors(oppRow, mdRow);
        container.insertAdjacentHTML('beforeend', `
            <h3 style="margin-top:1.5rem;">Four Factors — Why This Game Was Won</h3>
            <p class="section-note">Dean Oliver's four factors, plus per-100-possession efficiency.
            Possessions estimated as FGA + 0.44·FTA − offensive rebounds + turnovers.</p>
            <div id="four-factors-bars"></div>
            <div style="overflow-x:auto;">
            <table>
                <thead><tr><th>Team</th><th>Possessions</th><th>eFG%</th><th>TOV%</th><th>ORB%</th><th>FT Rate</th><th>ORtg</th><th>DRtg</th></tr></thead>
                <tbody>
                    <tr class="team-maryland">
                        <td><strong>Maryland</strong></td>
                        <td>${md.poss}</td>
                        <td><strong>${md.efg.toFixed(1)}</strong></td>
                        <td>${md.tovPct.toFixed(1)}</td>
                        <td>${md.orbPct.toFixed(1)}</td>
                        <td>${md.ftRate.toFixed(2)}</td>
                        <td><strong>${md.ortg.toFixed(0)}</strong></td>
                        <td>${md.drtg.toFixed(0)}</td>
                    </tr>
                    <tr>
                        <td><strong>${escapeHtml(oppRow.team)}</strong></td>
                        <td>${opp.poss}</td>
                        <td><strong>${opp.efg.toFixed(1)}</strong></td>
                        <td>${opp.tovPct.toFixed(1)}</td>
                        <td>${opp.orbPct.toFixed(1)}</td>
                        <td>${opp.ftRate.toFixed(2)}</td>
                        <td><strong>${opp.ortg.toFixed(0)}</strong></td>
                        <td>${opp.drtg.toFixed(0)}</td>
                    </tr>
                </tbody>
            </table>
            </div>
        `);
        Charts.comparisonBars(document.getElementById('four-factors-bars'), [
            { label: 'Effective FG%', a: md.efg.toFixed(1), b: opp.efg.toFixed(1) },
            { label: 'Turnover%', a: md.tovPct.toFixed(1), b: opp.tovPct.toFixed(1) },
            { label: 'Off. Rebound%', a: md.orbPct.toFixed(1), b: opp.orbPct.toFixed(1) },
            { label: 'FT Rate (FTA/FGA)', a: md.ftRate.toFixed(2), b: opp.ftRate.toFixed(2) }
        ], 'Maryland', oppRow.team);
    }

    enhanceTables(container);
}

// Parse "made-attempted" strings like "24-59" from team totals
function parseShooting(value) {
    const parts = (value || '').split('-');
    return {
        made: parseInt(parts[0]) || 0,
        attempted: parseInt(parts[1]) || 0
    };
}

// Four factors + efficiency for one team, given both teams' totals
function fourFactors(team, opp) {
    const fg = parseShooting(team.field_goals);
    const tp = parseShooting(team.three_pointers);
    const ft = parseShooting(team.free_throws);
    const oppFg = parseShooting(opp.field_goals);
    const oppFt = parseShooting(opp.free_throws);
    const orb = parseInt(team.offensive_rebounds) || 0;
    const drb = parseInt(team.defensive_rebounds) || 0;
    const oppOrb = parseInt(opp.offensive_rebounds) || 0;
    const oppDrb = parseInt(opp.defensive_rebounds) || 0;
    const tov = parseInt(team.turnovers) || 0;
    const oppTov = parseInt(opp.turnovers) || 0;
    const pts = parseInt(team.points) || 0;
    const oppPts = parseInt(opp.points) || 0;

    const poss = fg.attempted + 0.44 * ft.attempted - orb + tov;
    const oppPoss = oppFg.attempted + 0.44 * oppFt.attempted - oppOrb + oppTov;

    return {
        poss: Math.round(poss),
        efg: fg.attempted ? (fg.made + 0.5 * tp.made) / fg.attempted * 100 : 0,
        tovPct: poss > 0 ? tov / poss * 100 : 0,
        orbPct: (orb + oppDrb) > 0 ? orb / (orb + oppDrb) * 100 : 0,
        ftRate: fg.attempted ? ft.attempted / fg.attempted : 0,
        ortg: poss > 0 ? pts / poss * 100 : 0,
        drtg: oppPoss > 0 ? oppPts / oppPoss * 100 : 0
    };
}

// Show player details in modal
function showPlayerDetails(playerName) {
    // Get all plays and stats for this player in the current game
    const playerPlays = allPlays.filter(p => p.player_name === playerName);
    const playerStat = allStats.find(s => s.name === playerName);

    if (!playerStat && playerPlays.length === 0) {
        alert('No data found for this player.');
        return;
    }

    document.getElementById('player-name').textContent = playerName;

    let content = '';

    // Show stats if available
    if (playerStat) {
        content += `
            <h3>Game Statistics</h3>
            <div class="stat-summary">
                <div class="stat-box">
                    <div class="stat-value">${playerStat.points}</div>
                    <div class="stat-label">Points</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.rebounds}</div>
                    <div class="stat-label">Rebounds</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.assists}</div>
                    <div class="stat-label">Assists</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.steals}</div>
                    <div class="stat-label">Steals</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.blocks}</div>
                    <div class="stat-label">Blocks</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.turnovers}</div>
                    <div class="stat-label">Turnovers</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.field_goals}</div>
                    <div class="stat-label">FG</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.fg_pct}%</div>
                    <div class="stat-label">FG%</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.three_pointers}</div>
                    <div class="stat-label">3PT</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.three_pt_pct}%</div>
                    <div class="stat-label">3PT%</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.free_throws}</div>
                    <div class="stat-label">FT</div>
                </div>
                <div class="stat-box">
                    <div class="stat-value">${playerStat.minutes}</div>
                    <div class="stat-label">Minutes</div>
                </div>
            </div>
        `;
    }

    // Show plays
    if (playerPlays.length > 0) {
        content += `
            <h3>Play-by-Play (${playerPlays.length} plays)</h3>
            <div class="plays-list" style="max-height: 400px;">
                ${playerPlays.map(play => {
                    const score = play.home_team_score || play.visiting_team_score ?
                        `<span class="play-score">${play.home_team_score ? parseInt(play.home_team_score) : '-'} - ${play.visiting_team_score ? parseInt(play.visiting_team_score) : '-'}</span>` : '';

                    return `
                        <div class="play-item">
                            <div class="play-header">
                                <div>
                                    <span class="play-type">${play.play_type} ${play.play_action ? '- ' + play.play_action : ''}</span>
                                    | Period ${play.period} | ${formatTime(play.time_remaining)}
                                </div>
                                ${score}
                            </div>
                            <div class="play-narrative">${play.narrative}</div>
                        </div>
                    `;
                }).join('')}
            </div>
        `;
    }

    document.getElementById('player-details').innerHTML = content;
    document.getElementById('player-modal').style.display = 'flex';
}

// Close player modal
function closePlayerModal() {
    document.getElementById('player-modal').style.display = 'none';
}

// Close modal when clicking outside
window.onclick = function(event) {
    const modal = document.getElementById('player-modal');
    if (event.target === modal) {
        closePlayerModal();
    }
}

// Tab switching (game details tabs; scoped so the season tabs are untouched)
function showTab(tabName) {
    // Hide all game tabs
    document.querySelectorAll('#game-details-section .tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('#game-details-section .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    document.querySelectorAll('#game-details-section .tab-btn').forEach(btn => {
        if ((btn.getAttribute('onclick') || '').includes(`'${tabName}'`)) btn.classList.add('active');
    });
}

// Back to games
function backToGames() {
    document.getElementById('game-details-section').style.display = 'none';
    document.getElementById('games-section').scrollIntoView({ behavior: 'smooth' });
}

// Aggregate season stats
function aggregateSeasonStats(stats = allSeasonStats) {
    const playerMap = new Map();

    stats.forEach(stat => {
        const key = `${stat.name}-${stat.team}`;

        if (!playerMap.has(key)) {
            playerMap.set(key, {
                name: stat.name,
                team: stat.team,
                position: stat.position,
                games: 0,
                totalPoints: 0,
                totalRebounds: 0,
                totalAssists: 0,
                totalSteals: 0,
                totalBlocks: 0,
                totalTurnovers: 0,
                totalMinutes: 0,
                fgMade: 0,
                fgAttempted: 0,
                threeMade: 0,
                threeAttempted: 0,
                ftMade: 0,
                ftAttempted: 0
            });
        }

        const player = playerMap.get(key);
        player.games++;
        player.totalPoints += parseInt(stat.points) || 0;
        player.totalRebounds += parseInt(stat.rebounds) || 0;
        player.totalAssists += parseInt(stat.assists) || 0;
        player.totalSteals += parseInt(stat.steals) || 0;
        player.totalBlocks += parseInt(stat.blocks) || 0;
        player.totalTurnovers += parseInt(stat.turnovers) || 0;
        player.totalMinutes += parseInt(stat.minutes) || 0;

        // Parse field goals (e.g., "5-10" => 5 made, 10 attempted)
        if (stat.field_goals) {
            const [made, attempted] = stat.field_goals.split('-').map(n => parseInt(n) || 0);
            player.fgMade += made;
            player.fgAttempted += attempted;
        }

        // Parse three pointers
        if (stat.three_pointers) {
            const [made, attempted] = stat.three_pointers.split('-').map(n => parseInt(n) || 0);
            player.threeMade += made;
            player.threeAttempted += attempted;
        }

        // Parse free throws
        if (stat.free_throws) {
            const [made, attempted] = stat.free_throws.split('-').map(n => parseInt(n) || 0);
            player.ftMade += made;
            player.ftAttempted += attempted;
        }
    });

    seasonPlayerStats = Array.from(playerMap.values()).map(player => {
        // Basic per-game averages
        const ppg = (player.totalPoints / player.games).toFixed(1);
        const rpg = (player.totalRebounds / player.games).toFixed(1);
        const apg = (player.totalAssists / player.games).toFixed(1);
        const spg = (player.totalSteals / player.games).toFixed(1);
        const bpg = (player.totalBlocks / player.games).toFixed(1);
        const topg = (player.totalTurnovers / player.games).toFixed(1);
        const mpg = (player.totalMinutes / player.games).toFixed(1);

        // Shooting percentages
        const fgPct = player.fgAttempted > 0 ? ((player.fgMade / player.fgAttempted) * 100).toFixed(1) : '0.0';
        const threePct = player.threeAttempted > 0 ? ((player.threeMade / player.threeAttempted) * 100).toFixed(1) : '0.0';
        const ftPct = player.ftAttempted > 0 ? ((player.ftMade / player.ftAttempted) * 100).toFixed(1) : '0.0';

        // Advanced Stats
        // True Shooting % = Points / (2 * (FGA + 0.44 * FTA)) * 100
        const tsPct = player.fgAttempted > 0 || player.ftAttempted > 0
            ? (player.totalPoints / (2 * (player.fgAttempted + 0.44 * player.ftAttempted)) * 100).toFixed(1)
            : '0.0';

        // Effective FG% = (FGM + 0.5 * 3PM) / FGA * 100
        const efgPct = player.fgAttempted > 0
            ? ((player.fgMade + 0.5 * player.threeMade) / player.fgAttempted * 100).toFixed(1)
            : '0.0';

        // Assist-to-Turnover Ratio
        const astToRatio = player.totalTurnovers > 0
            ? (player.totalAssists / player.totalTurnovers).toFixed(2)
            : player.totalAssists > 0 ? '∞' : '0.00';

        // Free Throw Rate = FTA / FGA
        const ftr = player.fgAttempted > 0
            ? (player.ftAttempted / player.fgAttempted).toFixed(2)
            : '0.00';

        // Game Score (per game average)
        // PTS + 0.4*FGM - 0.7*FGA - 0.4*(FTA-FTM) + 0.7*ORB + 0.3*DRB + STL + 0.7*AST + 0.7*BLK - TOV
        // Simplified (we don't have ORB/DRB split, use total rebounds with 0.5 weight)
        const gameScore = (
            player.totalPoints
            + 0.4 * player.fgMade
            - 0.7 * player.fgAttempted
            - 0.4 * (player.ftAttempted - player.ftMade)
            + 0.5 * player.totalRebounds
            + player.totalSteals
            + 0.7 * player.totalAssists
            + 0.7 * player.totalBlocks
            - player.totalTurnovers
        ) / player.games;

        return {
            ...player,
            ppg, rpg, apg, spg, bpg, topg, mpg,
            fgPct, threePct, ftPct,
            tsPct, efgPct, astToRatio, ftr,
            gameScore: gameScore.toFixed(1)
        };
    });

    // Sort by total points descending
    seasonPlayerStats.sort((a, b) => b.totalPoints - a.totalPoints);
    filteredSeasonStats = [...seasonPlayerStats];
}

// Apply season stats filter
function applySeasonStatsFilter() {
    const minGames = parseInt(document.getElementById('season-min-games').value) || 0;
    const minPoints = parseInt(document.getElementById('season-min-points').value) || 0;
    const minRebounds = parseInt(document.getElementById('season-min-rebounds').value) || 0;
    const minAssists = parseInt(document.getElementById('season-min-assists').value) || 0;
    const team = document.getElementById('season-team-filter').value;

    filteredSeasonStats = seasonPlayerStats.filter(player => {
        if (player.games < minGames) return false;
        if (player.totalPoints < minPoints) return false;
        if (player.totalRebounds < minRebounds) return false;
        if (player.totalAssists < minAssists) return false;
        if (team && player.team !== team) return false;
        return true;
    });

    renderSeasonStats();
    renderSeasonStatsAdvanced();
}

// Clear season stats filter
function clearSeasonStatsFilter() {
    document.getElementById('season-min-games').value = '0';
    document.getElementById('season-min-points').value = '0';
    document.getElementById('season-min-rebounds').value = '0';
    document.getElementById('season-min-assists').value = '0';
    document.getElementById('season-team-filter').value = 'Maryland';
    applySeasonStatsFilter();
}

// Render season stats (basic)
function renderSeasonStats() {
    const container = document.getElementById('season-stats-list');

    if (filteredSeasonStats.length === 0) {
        container.innerHTML = '<p>No players match the current filter.</p>';
        return;
    }

    container.innerHTML = `
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>GP</th>
                    <th>PPG</th>
                    <th>RPG</th>
                    <th>APG</th>
                    <th>SPG</th>
                    <th>BPG</th>
                    <th>FG%</th>
                    <th>3P%</th>
                    <th>FT%</th>
                    <th>Total Pts</th>
                    <th>Total Reb</th>
                    <th>Total Ast</th>
                </tr>
            </thead>
            <tbody>
                ${filteredSeasonStats.map(player => `
                    <tr class="${player.team === 'Maryland' ? 'team-maryland' : ''}">
                        <td>${player.team}</td>
                        <td>${playerNameLink(player.name, player.team)}</td>
                        <td>${player.position}</td>
                        <td>${player.games}</td>
                        <td>${player.ppg}</td>
                        <td>${player.rpg}</td>
                        <td>${player.apg}</td>
                        <td>${player.spg}</td>
                        <td>${player.bpg}</td>
                        <td>${player.fgPct}%</td>
                        <td>${player.threePct}%</td>
                        <td>${player.ftPct}%</td>
                        <td><strong>${player.totalPoints}</strong></td>
                        <td>${player.totalRebounds}</td>
                        <td>${player.totalAssists}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enhanceTables(container);
}

// Render season stats (advanced)
function renderSeasonStatsAdvanced() {
    const container = document.getElementById('season-stats-advanced-list');

    if (filteredSeasonStats.length === 0) {
        container.innerHTML = '<p>No players match the current filter.</p>';
        return;
    }

    container.innerHTML = `
        <div style="margin-bottom: 1rem;">
            <p><strong>Advanced Stats Glossary:</strong></p>
            <ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.9rem;">
                <li><strong>TS%</strong> - True Shooting %: Shooting efficiency including 2PT, 3PT, and FT (55%+ is good)</li>
                <li><strong>eFG%</strong> - Effective FG %: FG% adjusted for 3PT being worth more (50%+ is good)</li>
                <li><strong>AST/TO</strong> - Assist to Turnover Ratio (2.0+ is excellent for guards)</li>
                <li><strong>FTR</strong> - Free Throw Rate: FTA per FGA, measures ability to draw fouls (0.4+ is good)</li>
                <li><strong>GmSc</strong> - Game Score: Overall performance metric (10+ solid, 20+ excellent per game)</li>
            </ul>
        </div>
        <table>
            <thead>
                <tr>
                    <th>Team</th>
                    <th>Player</th>
                    <th>Pos</th>
                    <th>GP</th>
                    <th>MPG</th>
                    <th>TS%</th>
                    <th>eFG%</th>
                    <th>AST/TO</th>
                    <th>FTR</th>
                    <th>GmSc</th>
                    <th>PPG</th>
                    <th>RPG</th>
                    <th>APG</th>
                </tr>
            </thead>
            <tbody>
                ${filteredSeasonStats.map(player => `
                    <tr class="${player.team === 'Maryland' ? 'team-maryland' : ''}">
                        <td>${player.team}</td>
                        <td>${playerNameLink(player.name, player.team)}</td>
                        <td>${player.position}</td>
                        <td>${player.games}</td>
                        <td>${player.mpg}</td>
                        <td><strong>${player.tsPct}%</strong></td>
                        <td>${player.efgPct}%</td>
                        <td>${player.astToRatio}</td>
                        <td>${player.ftr}</td>
                        <td><strong>${player.gameScore}</strong></td>
                        <td>${player.ppg}</td>
                        <td>${player.rpg}</td>
                        <td>${player.apg}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    `;

    enhanceTables(container);
}

// Render team season totals
function renderSeasonTeamTotals() {
    const container = document.getElementById('season-team-totals-list');

    if (seasonTeamTotals.length === 0) {
        container.innerHTML = '<p>No team season totals available for this season.</p>';
        return;
    }

    // Separate Maryland from opponents
    const maryland = seasonTeamTotals.filter(team => team.team === 'Maryland');
    const opponents = seasonTeamTotals.filter(team => team.team !== 'Maryland');

    // Get context about which games are included
    const gamesIncluded = selectedGameIndex >= 0 ? selectedGameIndex + 1 : sortedGames.length;
    const totalGames = sortedGames.length;
    const throughGame = gamesIncluded < totalGames
        ? `through Game ${gamesIncluded} of ${totalGames}`
        : `for all ${totalGames} games`;

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="margin-bottom: 0.5rem;">Season Summary</h3>
            <p style="font-size: 0.9rem; color: #666;">Comprehensive team statistics ${throughGame}.</p>
        </div>

        ${maryland.length > 0 ? `
            <div style="margin-bottom: 2rem;">
                <h3 style="color: #e03a3e; margin-bottom: 1rem;">Maryland</h3>
                ${renderTeamTotalsTable(maryland, true)}
                ${seasonFourFactorsHtml()}
            </div>
        ` : ''}

        ${opponents.length > 0 ? `
            <div style="margin-bottom: 2rem;">
                <h3 style="margin-bottom: 1rem;">Opponents</h3>
                ${renderTeamTotalsTable(opponents, false)}

                <div style="margin-top: 1.5rem; padding: 1rem; background: #f5f5f5; border-radius: 4px;">
                    <p style="margin: 0; font-size: 0.9rem;"><strong>Stats Glossary:</strong></p>
                    <ul style="margin: 0.5rem 0; padding-left: 1.5rem; font-size: 0.85rem; color: #555;">
                        <li><strong>eFG%</strong> - Effective FG %: Adjusts for 3-pointers being worth more</li>
                        <li><strong>TS%</strong> - True Shooting %: Overall shooting efficiency including FTs</li>
                        <li><strong>FTR</strong> - Free Throw Rate: Free throw attempts per field goal attempt</li>
                        <li><strong>AST/TO</strong> - Assist to Turnover Ratio</li>
                        <li><strong>ORtg</strong> - Offensive Rating: Points scored per game</li>
                        <li><strong>DRtg</strong> - Defensive Rating: Points allowed per game</li>
                        <li><strong>NetRtg</strong> - Net Rating: Offensive - Defensive rating</li>
                    </ul>
                </div>
            </div>
        ` : ''}
    `;

    enhanceTables(container);
}

// Season four factors for Maryland vs all opponents in the current
// timeline scope (see seasonScopeStats). Possessions estimated with
// FGA + 0.44·FTA − ORB + TOV.
function seasonFourFactorsHtml() {
    const stats = seasonScopeStats.length ? seasonScopeStats : allSeasonStats;
    const mdGames = sortedGames.length;
    if (!stats.length || !mdGames) return '';

    const agg = isMaryland => {
        const a = { fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0, orb: 0, drb: 0, tov: 0, pts: 0 };
        stats.filter(s => (s.team === 'Maryland') === isMaryland).forEach(stat => {
            const fg = parseShooting(stat.field_goals);
            const tp = parseShooting(stat.three_pointers);
            const ft = parseShooting(stat.free_throws);
            a.fgm += fg.made; a.fga += fg.attempted;
            a.tpm += tp.made; a.tpa += tp.attempted;
            a.ftm += ft.made; a.fta += ft.attempted;
            a.orb += parseInt(stat.offensive_rebounds) || 0;
            a.drb += parseInt(stat.defensive_rebounds) || 0;
            a.tov += parseInt(stat.turnovers) || 0;
            a.pts += parseInt(stat.points) || 0;
        });
        return a;
    };

    const md = agg(true);
    const opp = agg(false);
    const mdPoss = md.fga + 0.44 * md.fta - md.orb + md.tov;
    const oppPoss = opp.fga + 0.44 * opp.fta - opp.orb + opp.tov;
    if (mdPoss <= 0 || oppPoss <= 0) return '';

    const mdOrtg = md.pts / mdPoss * 100;
    const oppOrtg = opp.pts / oppPoss * 100;
    const pct = (num, den) => den > 0 ? (num / den * 100).toFixed(1) : '—';

    const row = (label, mdVal, oppVal, mdWins) => `
        <tr>
            <td>${label}</td>
            <td class="${mdWins === true ? 'pos' : mdWins === false ? 'neg' : ''}"><strong>${mdVal}</strong></td>
            <td>${oppVal}</td>
        </tr>`;

    return `
        <div style="margin-top: 1.5rem;">
            <h3 style="margin-bottom: 0.5rem;">Four Factors &amp; Pace — Maryland vs Opponents</h3>
            <table>
                <thead><tr><th>Factor</th><th>Maryland</th><th>Opponents</th></tr></thead>
                <tbody>
                    ${row('Effective FG%', pct(md.fgm + 0.5 * md.tpm, md.fga) + '%', pct(opp.fgm + 0.5 * opp.tpm, opp.fga) + '%',
                        (md.fgm + 0.5 * md.tpm) / (md.fga || 1) > (opp.fgm + 0.5 * opp.tpm) / (opp.fga || 1))}
                    ${row('Turnover %', pct(md.tov, mdPoss) + '%', pct(opp.tov, oppPoss) + '%',
                        md.tov / mdPoss < opp.tov / oppPoss)}
                    ${row('Offensive Rebound %', pct(md.orb, md.orb + opp.drb) + '%', pct(opp.orb, opp.orb + md.drb) + '%',
                        md.orb / (md.orb + opp.drb) > opp.orb / (opp.orb + md.drb))}
                    ${row('FT Rate (FTA/FGA)', (md.fga ? (md.fta / md.fga).toFixed(2) : '—'), (opp.fga ? (opp.fta / opp.fga).toFixed(2) : '—'),
                        md.fta / (md.fga || 1) > opp.fta / (opp.fga || 1))}
                    ${row('Pace (possessions/game)', (mdPoss / mdGames).toFixed(1), (oppPoss / mdGames).toFixed(1), null)}
                    ${row('Rating per 100 possessions', mdOrtg.toFixed(1) + ' off / ' + oppOrtg.toFixed(1) + ' def',
                        oppOrtg.toFixed(1) + ' off / ' + mdOrtg.toFixed(1) + ' def', mdOrtg > oppOrtg)}
                </tbody>
            </table>
            <p class="section-note" style="margin-top:0.5rem;">Maryland's offensive rating (points per 100
            possessions, estimated) vs what opponents score against the Terps. Estimated possessions:
            FGA + 0.44·FTA − offensive rebounds + turnovers.</p>
        </div>
    `;
}

function renderTeamTotalsTable(teams, showRecord = true) {
    return `
        <div style="overflow-x: auto;">
            <table>
                <thead>
                    <tr>
                        <th>Team</th>
                        ${showRecord ? '<th>Record</th>' : ''}
                        <th>PPG</th>
                        <th>RPG</th>
                        <th>APG</th>
                        <th>SPG</th>
                        <th>BPG</th>
                        <th>TPG</th>
                        <th>FG%</th>
                        <th>3P%</th>
                        <th>FT%</th>
                        <th>eFG%</th>
                        <th>TS%</th>
                        <th>FTR</th>
                        <th>AST/TO</th>
                        <th>ORtg</th>
                        <th>DRtg</th>
                        <th>NetRtg</th>
                    </tr>
                </thead>
                <tbody>
                    ${teams.map(team => {
                        const record = `${team.wins}-${team.losses}`;
                        const winPct = parseFloat(team.win_pct).toFixed(1);
                        const isMaryland = team.team === 'Maryland';

                        return `
                            <tr class="${isMaryland ? 'team-maryland' : ''}">
                                <td><strong>${team.team}</strong></td>
                                ${showRecord ? `<td><strong>${record}</strong> <span style="font-size: 0.85rem; color: #666;">(${winPct}%)</span></td>` : ''}
                                <td>${parseFloat(team.ppg).toFixed(1)}</td>
                                <td>${parseFloat(team.rpg).toFixed(1)}</td>
                                <td>${parseFloat(team.apg).toFixed(1)}</td>
                                <td>${parseFloat(team.spg).toFixed(1)}</td>
                                <td>${parseFloat(team.bpg).toFixed(1)}</td>
                                <td>${parseFloat(team.tpg).toFixed(1)}</td>
                                <td>${parseFloat(team.fg_pct).toFixed(1)}%</td>
                                <td>${parseFloat(team.three_pt_pct).toFixed(1)}%</td>
                                <td>${parseFloat(team.ft_pct).toFixed(1)}%</td>
                                <td><strong>${parseFloat(team.efg_pct).toFixed(1)}%</strong></td>
                                <td><strong>${parseFloat(team.ts_pct).toFixed(1)}%</strong></td>
                                <td>${parseFloat(team.ft_rate).toFixed(2)}</td>
                                <td>${parseFloat(team.ast_to_ratio).toFixed(2)}</td>
                                <td>${parseFloat(team.off_rating).toFixed(1)}</td>
                                <td>${parseFloat(team.def_rating).toFixed(1)}</td>
                                <td style="color: ${parseFloat(team.net_rating) > 0 ? 'green' : 'red'};">
                                    <strong>${parseFloat(team.net_rating) > 0 ? '+' : ''}${parseFloat(team.net_rating).toFixed(1)}</strong>
                                </td>
                            </tr>
                        `;
                    }).join('')}
                </tbody>
            </table>
        </div>
    `;
}

// Tab switching for season stats
const SEASON_TABS = ['team', 'basic', 'advanced', 'assists', 'freethrows', 'fouls', 'streaks', 'lineups', 'periods'];

function showSeasonStatsTab(tabName) {
    SEASON_TABS.forEach(name => {
        const tab = document.getElementById(`season-stats-${name}`);
        if (tab) tab.classList.remove('active');
    });
    document.querySelectorAll('#season-stats-section .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    const tab = document.getElementById(`season-stats-${tabName}`);
    if (tab) tab.classList.add('active');
    document.querySelectorAll('#season-stats-section .tab-btn').forEach(btn => {
        btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes(`'${tabName}'`));
    });

    if (tabName === 'assists') renderAssistNetwork();
    else if (tabName === 'freethrows') renderSeasonFreeThrows();
    else if (tabName === 'fouls') renderSeasonFouls();
    else if (tabName === 'streaks') renderSeasonStreaks();
    else if (tabName === 'lineups') renderSeasonLineups();
    else if (tabName === 'periods') renderSeasonPeriods();
}

// Link a box-score name to its career page (Maryland players with a known id)
function playerNameLink(boxName, team) {
    if (team === 'Maryland' && playerLinkMap.has(`${currentSeason}|${boxName}`)) {
        const player = playerLinkMap.get(`${currentSeason}|${boxName}`);
        return `<a class="player-link" href="players.html?id=${player.id}"><strong>${player.name}</strong></a>`;
    }
    return `<strong>${boxName}</strong>`;
}

// ---- Season analysis tabs (data lazy-loaded on first view, cached) ----

function pct(made, attempts, digits = 1) {
    return attempts > 0 ? (made / attempts * 100).toFixed(digits) : '—';
}

// Free Throw Deep Dive: trip conversion, clutch splits, by-period, streaks
async function renderSeasonFreeThrows() {
    const container = document.getElementById('season-freethrows-content');
    container.innerHTML = '<p>Loading…</p>';
    const [trips, streaks] = await Promise.all([
        loadCSV(currentSeason, 'ft_trips.csv'),
        loadCSV(currentSeason, 'streaks.csv')
    ]);
    if (trips.length === 0) {
        container.innerHTML = '<p>No free throw trip data available for this season.</p>';
        return;
    }

    const mdTrips = trips.filter(t => t.team === 'Maryland');
    const players = new Map();
    mdTrips.forEach(t => {
        const p = players.get(t.player_name) || {
            trips: 0, made: 0, att: 0, perfect: 0, multi: 0, frontMade: 0,
            clutchMade: 0, clutchAtt: 0
        };
        const size = parseInt(t.trip_size), made = parseInt(t.made);
        p.trips++;
        p.made += made;
        p.att += size;
        if (size >= 2) {
            p.multi++;
            if (made === size) p.perfect++;
            if (t.first_attempt_made === '1') p.frontMade++;
        }
        if (t.clutch === '1') {
            p.clutchMade += made;
            p.clutchAtt += size;
        }
        players.set(t.player_name, p);
    });

    const playerRows = [...players.entries()]
        .filter(([, p]) => p.att >= 5)
        .sort((a, b) => b[1].att - a[1].att);

    // FT% by period (Maryland)
    const byPeriod = new Map();
    mdTrips.forEach(t => {
        const p = byPeriod.get(t.period) || { made: 0, att: 0 };
        p.made += parseInt(t.made);
        p.att += parseInt(t.trip_size);
        byPeriod.set(t.period, p);
    });
    const periods = [...byPeriod.keys()].sort((a, b) => a - b);

    const ftStreaks = streaks.filter(s => s.streak_type === 'ft_makes').slice(0, 10);

    container.innerHTML = `
        <h3>Free Throw Deep Dive — Maryland</h3>
        <p class="section-note">A "trip" groups consecutive free throws by one player at the same clock stop.
        The feed doesn't mark 1-and-1s, so trip grouping is heuristic. Clutch = last 5 minutes / OT, margin within 5.</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Player</th><th>FTM-FTA</th><th>FT%</th>
                <th>Perfect Trips</th><th>Front End Made</th>
                <th>Clutch FTM-FTA</th><th>Clutch FT%</th>
            </tr></thead>
            <tbody>${playerRows.map(([name, p]) => `
                <tr>
                    <td><strong>${name}</strong></td>
                    <td>${p.made}-${p.att}</td>
                    <td><strong>${pct(p.made, p.att)}%</strong></td>
                    <td>${p.perfect}/${p.multi} (${pct(p.perfect, p.multi, 0)}%)</td>
                    <td>${pct(p.frontMade, p.multi, 0)}%</td>
                    <td>${p.clutchAtt > 0 ? `${p.clutchMade}-${p.clutchAtt}` : '—'}</td>
                    <td>${p.clutchAtt > 0 ? `<strong>${pct(p.clutchMade, p.clutchAtt)}%</strong>` : '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>
        <div class="flow-columns" style="margin-top:1.5rem;">
            <div>
                <h3>Team FT% by Period</h3>
                <table>
                    <thead><tr><th>Period</th><th>FTM-FTA</th><th>FT%</th></tr></thead>
                    <tbody>${periods.map(period => {
                        const p = byPeriod.get(period);
                        return `<tr><td>${period}</td><td>${p.made}-${p.att}</td><td><strong>${pct(p.made, p.att)}%</strong></td></tr>`;
                    }).join('')}</tbody>
                </table>
            </div>
            <div>
                <h3>Longest FT Make Streaks</h3>
                ${ftStreaks.length === 0 ? '<p>No qualifying streaks.</p>' : ftStreaks.map((s, i) => `
                    <div class="run-item run-maryland">
                        <span class="run-points">${s.length}</span>
                        <span><strong>${s.player_name}</strong> · ${s.start_date} → ${s.end_date}
                        ${s.active === '1' ? '<span class="active-streak">active</span>' : ''}</span>
                    </div>`).join('')}
            </div>
        </div>
    `;

    enhanceTables(container);
}

// Season Fouls tab: who fouls, when fouls happen, bonus pressure
async function renderSeasonFouls() {
    const container = document.getElementById('season-fouls-content');
    container.innerHTML = '<p>Loading…</p>';
    const fouls = await loadCSV(currentSeason, 'fouls.csv');
    if (fouls.length === 0) {
        container.innerHTML = '<p>No foul data available for this season.</p>';
        return;
    }

    const mdFouls = fouls.filter(f => f.team === 'Maryland' && f.foul_type === 'personal');
    const oppFouls = fouls.filter(f => f.team !== 'Maryland' && f.foul_type === 'personal');
    const games = new Set(fouls.map(f => f.file_id)).size;

    // Per-player: total fouls, per game, times reaching 3/4/5 in a game
    const perPlayer = new Map();
    mdFouls.forEach(f => {
        if (!f.player_name) return;
        const p = perPlayer.get(f.player_name) || { total: 0, games: new Set(), three: 0, four: 0, five: 0 };
        p.total++;
        p.games.add(f.file_id);
        const count = parseInt(f.player_foul_count) || 0;
        if (count === 3) p.three++;
        if (count === 4) p.four++;
        if (count === 5) p.five++;
        perPlayer.set(f.player_name, p);
    });
    const playerRows = [...perPlayer.entries()].sort((a, b) => b[1].total - a[1].total);

    // When Maryland fouls: distribution over 4-minute game buckets
    const bucketSize = 240;
    const buckets = new Map();
    let maxSeconds = 0;
    mdFouls.forEach(f => {
        const t = parseInt(f.seconds_elapsed) || 0;
        maxSeconds = Math.max(maxSeconds, t);
        const bucket = Math.floor(t / bucketSize);
        buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
    });
    const bucketCount = Math.floor(maxSeconds / bucketSize) + 1;
    const maxBucket = Math.max(...buckets.values());

    // Bonus pressure: periods where each side reached the bonus
    const bonusPeriods = team => {
        const set = new Set();
        fouls.filter(f => f.team !== 'Maryland' === (team === 'opp') && f.bonus_active === '1' && f.foul_type === 'personal')
            .forEach(f => set.add(`${f.file_id}:${f.period}`));
        return set.size;
    };

    container.innerHTML = `
        <h3>Foul Analysis — Maryland (${games} games)</h3>
        <div class="stat-strip">
            <div class="stat-chip"><span class="stat-chip-value">${(mdFouls.length / games).toFixed(1)}</span> MD fouls/game</div>
            <div class="stat-chip"><span class="stat-chip-value">${(oppFouls.length / games).toFixed(1)}</span> opponent fouls/game</div>
            <div class="stat-chip"><span class="stat-chip-value">${bonusPeriods('md')}</span> periods MD in penalty</div>
            <div class="stat-chip"><span class="stat-chip-value">${bonusPeriods('opp')}</span> periods opponent in penalty</div>
        </div>
        <h3>When Maryland Fouls</h3>
        <p class="section-note">Personal fouls by 4-minute segment of the game, season-wide.</p>
        <div class="bucket-chart">
            ${Array.from({ length: bucketCount }, (_, i) => {
                const count = buckets.get(i) || 0;
                return `<div class="bucket-col" title="${formatElapsed(i * bucketSize)}–${formatElapsed((i + 1) * bucketSize)}: ${count} fouls">
                    <div class="bucket-bar" style="height:${(count / maxBucket * 100).toFixed(0)}%"></div>
                    <div class="bucket-label">${formatElapsed(i * bucketSize)}</div>
                </div>`;
            }).join('')}
        </div>
        <h3 style="margin-top:1.5rem;">Foul Load by Player</h3>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Player</th><th>Fouls</th><th>Per Game</th>
                <th>3-Foul Games</th><th>4-Foul Games</th><th>Fouled Out</th>
            </tr></thead>
            <tbody>${playerRows.map(([name, p]) => `
                <tr>
                    <td><strong>${name}</strong></td>
                    <td>${p.total}</td>
                    <td>${(p.total / p.games.size).toFixed(1)}</td>
                    <td>${p.three}</td>
                    <td>${p.four}</td>
                    <td>${p.five > 0 ? `<strong class="neg">${p.five}</strong>` : '0'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>
    `;

    enhanceTables(container);
}

// Streaks & Runs tab: hot hands, big runs, comebacks
async function renderSeasonStreaks() {
    const container = document.getElementById('season-streaks-content');
    container.innerHTML = '<p>Loading…</p>';
    const [streaks, heat, runs, context] = await Promise.all([
        loadCSV(currentSeason, 'streaks.csv'),
        loadCSV(currentSeason, 'heat_check.csv'),
        loadCSV(currentSeason, 'runs.csv'),
        loadCSV(currentSeason, 'team_game_context.csv')
    ]);
    if (streaks.length === 0 && runs.length === 0) {
        container.innerHTML = '<p>No streak data available for this season.</p>';
        return;
    }

    const streakSection = (type, title, note) => {
        const rows = streaks.filter(s => s.streak_type === type).slice(0, 8);
        return `
            <div>
                <h3>${title}</h3>
                ${note ? `<p class="section-note">${note}</p>` : ''}
                ${rows.length === 0 ? '<p>None recorded.</p>' : rows.map(s => `
                    <div class="run-item run-maryland">
                        <span class="run-points">${s.length}</span>
                        <span><strong>${s.player_name}</strong> · ${s.start_date}${s.end_date !== s.start_date ? ' → ' + s.end_date : ''}
                        ${s.spans_games === '1' ? '<span class="spans-games">multi-game</span>' : ''}
                        ${s.active === '1' ? '<span class="active-streak">active</span>' : ''}</span>
                    </div>`).join('')}
            </div>`;
    };

    // Biggest runs of the season (Maryland)
    const mdRuns = runs.filter(r => r.team === 'Maryland')
        .sort((a, b) => (+b.points) - (+a.points)).slice(0, 10);
    const gameById = new Map(allGames.map(g => [normId(g.file_id), g]));

    // Comeback wins: Maryland won after trailing by 10+
    const comebacks = context
        .filter(c => c.team === 'Maryland' && parseInt(c.largest_deficit) >= 10)
        .map(c => {
            const game = gameById.get(normId(c.file_id));
            if (!game) return null;
            const md = marylandPerspective(game);
            if (md.marylandScore <= md.opponentScore) return null;
            return { deficit: parseInt(c.largest_deficit), game, md };
        })
        .filter(Boolean)
        .sort((a, b) => b.deficit - a.deficit);

    // Heat check table
    const heatRows = heat.filter(h => h.player_name !== 'TEAM' && parseInt(h.fga_hot) >= 10);
    const teamHeat = heat.find(h => h.player_name === 'TEAM');

    container.innerHTML = `
        <div class="flow-columns">
            ${streakSection('fg_makes', 'Consecutive Field Goals Made')}
            ${streakSection('three_makes', 'Consecutive 3-Pointers Made')}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            ${streakSection('ft_makes', 'Consecutive Free Throws Made')}
            ${streakSection('fg_misses', 'Cold Spells (Consecutive Misses)')}
        </div>

        <h3 style="margin-top:1.5rem;">Is the Hot Hand Real?</h3>
        <p class="section-note">FG% on shots taken after 2+ consecutive makes ("hot") vs after 2+ misses ("cold") vs all attempts, within single games.
        ${teamHeat ? `Team-wide: <strong>${teamHeat.pct_hot}%</strong> hot vs <strong>${teamHeat.pct_cold}%</strong> cold vs <strong>${teamHeat.pct_all}%</strong> overall.` : ''}</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr><th>Player</th><th>Hot FG%</th><th>Cold FG%</th><th>Overall FG%</th><th>Hot Attempts</th></tr></thead>
            <tbody>${heatRows.map(h => `
                <tr>
                    <td><strong>${h.player_name}</strong></td>
                    <td class="${parseFloat(h.pct_hot) > parseFloat(h.pct_all) ? 'pos' : ''}">${h.pct_hot}%</td>
                    <td>${h.pct_cold}%</td>
                    <td>${h.pct_all}%</td>
                    <td>${h.fga_hot}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>

        <div class="flow-columns" style="margin-top:1.5rem;">
            <div>
                <h3>Biggest Maryland Runs</h3>
                ${mdRuns.map(r => {
                    const game = gameById.get(normId(r.file_id));
                    return `<div class="run-item run-maryland">
                        <span class="run-points">${r.points}-0</span>
                        <span>vs <strong>${game ? marylandPerspective(game).opponent : '?'}</strong>
                        ${game ? '· ' + game.date : ''} (${r.score_before} → ${r.score_after})</span>
                    </div>`;
                }).join('')}
            </div>
            <div>
                <h3>Comeback Wins (trailed by 10+)</h3>
                ${comebacks.length === 0 ? '<p>No double-digit comebacks this season.</p>' : comebacks.map(c => `
                    <div class="run-item run-maryland">
                        <span class="run-points">−${c.deficit}</span>
                        <span>beat <strong>${c.md.opponent}</strong> ${c.md.marylandScore}-${c.md.opponentScore} · ${c.game.date}</span>
                    </div>`).join('')}
            </div>
        </div>
    `;

    enhanceTables(container);
}

// Lineups tab: top five-player units and on/off splits
async function renderSeasonLineups() {
    const container = document.getElementById('season-lineups-content');
    container.innerHTML = '<p>Loading…</p>';
    const [lineups, onoff, validation] = await Promise.all([
        loadCSV(currentSeason, 'lineup_season.csv'),
        loadCSV(currentSeason, 'player_onoff.csv'),
        loadCSV(currentSeason, 'lineup_validation.csv')
    ]);
    if (lineups.length === 0 && onoff.length === 0) {
        container.innerHTML = '<p>No lineup data available for this season.</p>';
        return;
    }

    // Data quality summary from minutes reconciliation
    const total = validation.length;
    const within = validation.filter(v => Math.abs(parseFloat(v.delta) || 0) <= 2).length;
    const quality = total > 0 ? (within / total * 100).toFixed(1) : null;

    const topLineups = lineups.filter(l => parseFloat(l.minutes) >= 15).slice(0, 15);

    container.innerHTML = `
        <h3>Maryland Lineups &amp; On/Off</h3>
        <p class="section-note">Reconstructed from play-by-play substitutions.
        ${quality !== null ? `Reconstruction matches box-score minutes within 2 minutes for <strong>${quality}%</strong> of player-games this season.` : ''}
        Net/40 = point differential per 40 minutes on the floor.</p>

        <h3>Most-Used Five-Player Lineups (15+ min)</h3>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr><th>Lineup</th><th>Games</th><th>Min</th><th>Pts For</th><th>Pts Against</th><th>+/-</th><th>Net/40</th></tr></thead>
            <tbody>${topLineups.map(l => {
                const pm = parseInt(l.plus_minus);
                return `<tr>
                    <td>${l.lineup.split('|').join(', ')}</td>
                    <td>${l.games}</td>
                    <td>${parseFloat(l.minutes).toFixed(0)}</td>
                    <td>${l.pts_for}</td>
                    <td>${l.pts_against}</td>
                    <td class="${pm > 0 ? 'pos' : pm < 0 ? 'neg' : ''}"><strong>${pm > 0 ? '+' : ''}${pm}</strong></td>
                    <td class="${parseFloat(l.net_per_40) > 0 ? 'pos' : 'neg'}">${l.net_per_40 !== '' ? (parseFloat(l.net_per_40) > 0 ? '+' : '') + l.net_per_40 : '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>

        <h3 style="margin-top:1.5rem;">Player On/Off Impact</h3>
        <p class="section-note">How the team performs with each player on vs off the floor (per 40 minutes).</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr><th>Player</th><th>Min On</th><th>+/-</th><th>Net/40 On</th><th>Net/40 Off</th><th>On-Off Diff</th></tr></thead>
            <tbody>${onoff.filter(p => parseFloat(p.min_on) >= 50).map(p => {
                const diff = parseFloat(p.on_off_diff);
                const pm = parseInt(p.plus_minus);
                return `<tr>
                    <td><strong>${p.player_name}</strong></td>
                    <td>${parseFloat(p.min_on).toFixed(0)}</td>
                    <td class="${pm > 0 ? 'pos' : pm < 0 ? 'neg' : ''}">${pm > 0 ? '+' : ''}${pm}</td>
                    <td>${p.net_on_per_40 !== '' ? (parseFloat(p.net_on_per_40) > 0 ? '+' : '') + p.net_on_per_40 : '—'}</td>
                    <td>${p.net_off_per_40 !== '' ? (parseFloat(p.net_off_per_40) > 0 ? '+' : '') + p.net_off_per_40 : '—'}</td>
                    <td class="${diff > 0 ? 'pos' : diff < 0 ? 'neg' : ''}"><strong>${isNaN(diff) ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(1)}</strong></td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>
    `;

    enhanceTables(container);
}

// Periods tab: quarter-by-quarter momentum across the season
// Data: team_period_context.csv (per-team, per-period scoring)
async function renderSeasonPeriods() {
    const container = document.getElementById('season-periods-content');
    container.innerHTML = '<p>Loading…</p>';
    const rows = await loadCSV(currentSeason, 'team_period_context.csv');
    if (rows.length === 0) {
        container.innerHTML = '<p>No per-period data available for this season.</p>';
        return;
    }

    // game+period -> { md, opp } points
    const byGamePeriod = new Map();
    rows.forEach(r => {
        const key = `${normId(r.file_id)}:${parseInt(r.period)}`;
        if (!byGamePeriod.has(key)) byGamePeriod.set(key, {});
        byGamePeriod.get(key)[r.team === 'Maryland' ? 'md' : 'opp'] = parseInt(r.points) || 0;
    });

    const gameIds = [...new Set(rows.map(r => normId(r.file_id)))];
    const periods = [...new Set(rows.map(r => parseInt(r.period)))].sort((a, b) => a - b);
    const isQuarters = periods.some(p => p >= 3);
    const label = p => isQuarters
        ? (p <= 4 ? `Q${p}` : `OT${p - 4}`)
        : (p <= 2 ? `H${p}` : `OT${p - 2}`);

    const gameById = new Map(allGames.map(g => [normId(g.file_id), g]));
    const gameResult = id => {
        const game = gameById.get(id);
        if (!game) return null;
        const isHome = game.home_team === 'Maryland';
        const mdScore = parseInt(isHome ? game.home_score : game.visiting_score);
        const oppScore = parseInt(isHome ? game.visiting_score : game.home_score);
        return mdScore > oppScore;
    };

    const perPeriod = periods.map(p => {
        let mdSum = 0, oppSum = 0, won = 0, lost = 0, tied = 0, occurred = 0;
        let wonGameWins = 0, wonGameLosses = 0, lostGameWins = 0, lostGameLosses = 0,
            tiedGameWins = 0, tiedGameLosses = 0;
        gameIds.forEach(id => {
            const entry = byGamePeriod.get(`${id}:${p}`);
            if (!entry || entry.md == null || entry.opp == null) return;
            occurred++;
            mdSum += entry.md;
            oppSum += entry.opp;
            const gameWin = gameResult(id);
            if (entry.md > entry.opp) {
                won++;
                if (gameWin != null) { gameWin ? wonGameWins++ : wonGameLosses++; }
            } else if (entry.md < entry.opp) {
                lost++;
                if (gameWin != null) { gameWin ? lostGameWins++ : lostGameLosses++; }
            } else {
                tied++;
                if (gameWin != null) { gameWin ? tiedGameWins++ : tiedGameLosses++; }
            }
        });
        const mdAvg = occurred ? mdSum / occurred : 0;
        const oppAvg = occurred ? oppSum / occurred : 0;
        return {
            period: p, label: label(p), occurred,
            mdAvg, oppAvg, margin: mdAvg - oppAvg, won, lost, tied,
            wonGameWins, wonGameLosses, lostGameWins, lostGameLosses,
            tiedGameWins, tiedGameLosses
        };
    });

    const regular = perPeriod.filter(s => s.period <= (isQuarters ? 4 : 2));
    const best = [...regular].sort((a, b) => b.margin - a.margin)[0];
    const worst = [...regular].sort((a, b) => a.margin - b.margin)[0];
    const regLabel = isQuarters ? 'quarter' : 'half';

    container.innerHTML = `
        <h3>Scoring by ${isQuarters ? 'Quarter' : 'Half'} — Maryland vs Opponents</h3>
        <p class="section-note">Average points per period across ${gameIds.length} games, from
        per-period team data. Overtime periods only count games that reached them.</p>
        <div class="stat-strip">
            ${best ? `<div class="stat-chip"><span class="stat-chip-value">${best.label}</span> best ${regLabel} (+${best.margin.toFixed(1)} avg margin)</div>` : ''}
            ${worst && worst !== best ? `<div class="stat-chip"><span class="stat-chip-value">${worst.label}</span> toughest ${regLabel} (${worst.margin >= 0 ? '+' : ''}${worst.margin.toFixed(1)} avg margin)</div>` : ''}
        </div>
        <div id="period-bars"></div>
        <h3 style="margin-top:1.5rem;">Period Details</h3>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Period</th><th>Games</th><th>MD PPG</th><th>Opp PPG</th>
                <th>Avg Margin</th><th>Periods Won</th><th>Lost</th><th>Tied</th>
            </tr></thead>
            <tbody>${perPeriod.map(s => `
                <tr>
                    <td><strong>${s.label}</strong>${s.occurred < gameIds.length ? ' <span class="section-note">(OT only)</span>' : ''}</td>
                    <td>${s.occurred}</td>
                    <td>${s.mdAvg.toFixed(1)}</td>
                    <td>${s.oppAvg.toFixed(1)}</td>
                    <td class="${s.margin > 0 ? 'pos' : s.margin < 0 ? 'neg' : ''}">
                        <strong>${s.margin > 0 ? '+' : ''}${s.margin.toFixed(1)}</strong></td>
                    <td>${s.won}</td>
                    <td>${s.lost}</td>
                    <td>${s.tied}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>
        <h3 style="margin-top:1.5rem;">Win the ${regLabel[0].toUpperCase() + regLabel.slice(1)}, Win the Game?</h3>
        <p class="section-note">How Maryland's final record breaks down by the result of each period.</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Period</th><th>Record when won</th><th>Record when lost</th><th>Record when tied</th>
            </tr></thead>
            <tbody>${perPeriod.map(s => `
                <tr>
                    <td><strong>${s.label}</strong></td>
                    <td class="${s.wonGameWins >= s.wonGameLosses ? 'pos' : 'neg'}"><strong>${s.wonGameWins}-${s.wonGameLosses}</strong></td>
                    <td class="${s.lostGameWins >= s.lostGameLosses ? 'pos' : 'neg'}"><strong>${s.lostGameWins}-${s.lostGameLosses}</strong></td>
                    <td>${s.tied > 0 ? `${s.tiedGameWins}-${s.tiedGameLosses}` : '—'}</td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>
    `;

    Charts.comparisonBars(document.getElementById('period-bars'),
        perPeriod.map(s => ({ label: s.label, a: s.mdAvg.toFixed(1), b: s.oppAvg.toFixed(1) })),
        'Maryland', 'Opponents');

    enhanceTables(container, { minSearchRows: 100 }); // small tables: sort only
}

// Assist Network Functions
function showAssistSubTab(tabName) {
    // Hide all subtabs
    document.getElementById('assist-combinations').classList.remove('active');
    document.getElementById('assist-leaders').classList.remove('active');
    document.getElementById('assist-receivers').classList.remove('active');

    // Remove active class from all subtab buttons
    document.querySelectorAll('.subtab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected subtab
    if (tabName === 'combinations') {
        document.getElementById('assist-combinations').classList.add('active');
        document.querySelectorAll('.subtab-btn').forEach(btn => {
            btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'combinations'"));
        });
        renderAssistNetwork();
    } else if (tabName === 'leaders') {
        document.getElementById('assist-leaders').classList.add('active');
        document.querySelectorAll('.subtab-btn').forEach(btn => {
            btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'leaders'"));
        });
        renderAssistLeaders();
    } else if (tabName === 'receivers') {
        document.getElementById('assist-receivers').classList.add('active');
        document.querySelectorAll('.subtab-btn').forEach(btn => {
            btn.classList.toggle('active', (btn.getAttribute('onclick') || '').includes("'receivers'"));
        });
        renderAssistReceivers();
    }
}

function renderAssistNetwork() {
    const container = document.getElementById('assist-network-list');

    if (!assistNetwork || assistNetwork.length === 0) {
        container.innerHTML = '<p>No assist network data available for this season.</p>';
        return;
    }

    // Render top assist combinations
    const html = assistNetwork.map((combo, index) => `
        <div class="assist-combo">
            <div class="assist-combo-header">
                <span class="assist-combo-players">
                    ${index + 1}. ${combo.assister} → ${combo.scorer}
                </span>
                <span class="assist-combo-count">${combo.assists}</span>
            </div>
            <div class="assist-combo-details">
                <div class="assist-combo-detail">
                    <strong>${combo.total_points}</strong> points
                </div>
                <div class="assist-combo-detail">
                    <strong>${combo.avg_points_per_assist}</strong> pts/assist
                </div>
                <div class="assist-combo-detail">
                    ${combo.threes} threes, ${combo.twos} twos
                </div>
                <div class="assist-combo-detail">
                    ${combo.layups} layups, ${combo.jumpers} jumpers
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderAssistLeaders() {
    const container = document.getElementById('assist-leaders-list');

    if (!assistLeaders || assistLeaders.length === 0) {
        container.innerHTML = '<p>No assist leaders data available for this season.</p>';
        return;
    }

    const html = assistLeaders.map((player, index) => `
        <div class="assist-combo">
            <div class="assist-combo-header">
                <span class="assist-combo-players">
                    ${index + 1}. ${player.assister}
                </span>
                <span class="assist-combo-count">${player.total_assists}</span>
            </div>
            <div class="assist-combo-details">
                <div class="assist-combo-detail">
                    <strong>${player.points_created}</strong> points created
                </div>
                <div class="assist-combo-detail">
                    <strong>${player.avg_points_per_assist}</strong> pts/assist
                </div>
                <div class="assist-combo-detail">
                    ${player.threes_assisted} threes, ${player.twos_assisted} twos
                </div>
                <div class="assist-combo-detail">
                    ${player.unique_teammates} unique teammates
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

function renderAssistReceivers() {
    const container = document.getElementById('assist-receivers-list');

    if (!assistReceivers || assistReceivers.length === 0) {
        container.innerHTML = '<p>No assist receivers data available for this season.</p>';
        return;
    }

    const html = assistReceivers.map((player, index) => `
        <div class="assist-combo">
            <div class="assist-combo-header">
                <span class="assist-combo-players">
                    ${index + 1}. ${player.scorer}
                </span>
                <span class="assist-combo-count">${player.assists_received}</span>
            </div>
            <div class="assist-combo-details">
                <div class="assist-combo-detail">
                    <strong>${player.points_from_assists}</strong> points from assists
                </div>
                <div class="assist-combo-detail">
                    <strong>${player.avg_points_per_assist}</strong> pts/assist
                </div>
                <div class="assist-combo-detail">
                    ${player.threes_assisted} threes, ${player.twos_assisted} twos
                </div>
                <div class="assist-combo-detail">
                    ${player.unique_assisters} unique assisters
                </div>
            </div>
        </div>
    `).join('');

    container.innerHTML = html;
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
