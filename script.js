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

// Available seasons (most recent first)
const seasons = [
    '2025-26', '2024-25', '2023-24', '2022-23', '2021-22', '2020-21',
    '2019-20', '2018-19', '2017-18', '2016-17', '2015-16', '2014-15'
];

// Format time remaining in seconds to MM:SS format
function formatTime(seconds) {
    const secs = parseInt(seconds) || 0;
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// CSV Parser
function parseCSV(text) {
    // Handle both Unix (\n) and Windows (\r\n) line endings
    const lines = text.trim().split(/\r?\n/);
    const headers = parseCSVLine(lines[0]);
    const data = [];

    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = parseCSVLine(lines[i]);
            const row = {};
            headers.forEach((header, index) => {
                row[header] = values[index] || '';
            });
            data.push(row);
        }
    }

    return data;
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];

        if (char === '"') {
            inQuotes = !inQuotes;
            // Don't add the quote character to the result
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

// Load CSV file
async function loadCSV(season, filename) {
    try {
        const response = await fetch(`${season}/${filename}`);
        if (!response.ok) {
            console.warn(`Could not load ${season}/${filename}`);
            return [];
        }
        const text = await response.text();
        return parseCSV(text);
    } catch (error) {
        console.error(`Error loading ${season}/${filename}:`, error);
        return [];
    }
}

// Initialize the app
async function init() {
    renderSeasonSelector();
}

// Render season selector
function renderSeasonSelector() {
    const container = document.getElementById('season-selector');
    container.innerHTML = seasons.map(season =>
        `<button class="season-btn" onclick="selectSeason('${season}')">${season}</button>`
    ).join('');
}

// Select a season
async function selectSeason(season) {
    currentSeason = season;
    document.getElementById('selected-season').textContent = season;
    document.getElementById('season-stats-season').textContent = season;

    // Load games, player stats, team season totals, and assist data for this season
    [allGames, allStats, seasonTeamTotals, assistNetwork, assistLeaders, assistReceivers] = await Promise.all([
        loadCSV(season, 'game_info.csv'),
        loadCSV(season, 'player_stats.csv'),
        loadCSV(season, 'team_season_totals.csv'),
        loadCSV(season, 'assist_network.csv'),
        loadCSV(season, 'assist_leaders.csv'),
        loadCSV(season, 'assist_receivers.csv')
    ]);

    // Aggregate player stats for the season
    aggregateSeasonStats();

    // Show sections
    document.getElementById('games-section').style.display = 'block';
    document.getElementById('season-stats-section').style.display = 'block';
    document.getElementById('game-details-section').style.display = 'none';

    renderGames();
    renderSeasonTeamTotals();
    // Apply Maryland filter by default
    applySeasonStatsFilter();

    // Scroll to season stats section
    document.getElementById('season-stats-section').scrollIntoView({ behavior: 'smooth' });
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

    // Load all data for this game
    [allPlays, allStats, allTeamTotals, allPeriodScores] = await Promise.all([
        loadCSV(currentSeason, 'plays.csv'),
        loadCSV(currentSeason, 'player_stats.csv'),
        loadCSV(currentSeason, 'team_totals.csv'),
        loadCSV(currentSeason, 'period_scores.csv')
    ]);

    // Filter by current game
    allPlays = allPlays.filter(p => p.file_id === gameId);
    allStats = allStats.filter(s => s.file_id === gameId);
    allTeamTotals = allTeamTotals.filter(t => t.file_id === gameId);
    allPeriodScores = allPeriodScores.filter(p => p.file_id === gameId);

    filteredPlays = [...allPlays];
    filteredStats = [...allStats];

    // Show game details section
    document.getElementById('game-details-section').style.display = 'block';

    renderGameInfo();
    renderPeriodScoring();
    setupFilters();
    renderPlays();
    renderStats();
    renderTeamTotals();

    // Scroll to game details
    document.getElementById('game-details-section').scrollIntoView({ behavior: 'smooth' });
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
    const periodLabels = periods.map(p => {
        if (p <= 4) return `Q${p}`;
        return `OT${p - 4}`;
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
                        <td><strong>${game.visiting_team}</strong></td>
                        ${periods.map(p => `<td>${visitingScores[p] || 0}</td>`).join('')}
                        <td><strong>${parseInt(game.visiting_score)}</strong></td>
                    </tr>
                    <tr class="${game.home_team === 'Maryland' ? 'team-maryland' : ''}">
                        <td><strong>${game.home_team}</strong></td>
                        ${periods.map(p => `<td>${homeScores[p] || 0}</td>`).join('')}
                        <td><strong>${parseInt(game.home_score)}</strong></td>
                    </tr>
                </tbody>
            </table>
        </div>
    `;
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

    container.innerHTML = filteredPlays.map(play => {
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

// Tab switching
function showTab(tabName) {
    // Hide all tabs
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    document.getElementById(`${tabName}-tab`).classList.add('active');
    event.target.classList.add('active');
}

// Back to games
function backToGames() {
    document.getElementById('game-details-section').style.display = 'none';
    document.getElementById('games-section').scrollIntoView({ behavior: 'smooth' });
}

// Aggregate season stats
function aggregateSeasonStats() {
    const playerMap = new Map();

    allStats.forEach(stat => {
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
                        <td><strong>${player.name}</strong></td>
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
                        <td><strong>${player.name}</strong></td>
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

    container.innerHTML = `
        <div style="margin-bottom: 1.5rem;">
            <h3 style="margin-bottom: 0.5rem;">Season Summary</h3>
            <p style="font-size: 0.9rem; color: #666;">Comprehensive team statistics aggregated across all games in the season.</p>
        </div>

        ${maryland.length > 0 ? `
            <div style="margin-bottom: 2rem;">
                <h3 style="color: #e03a3e; margin-bottom: 1rem;">Maryland</h3>
                ${renderTeamTotalsTable(maryland, true)}
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
function showSeasonStatsTab(tabName) {
    // Hide all tabs
    document.getElementById('season-stats-team').classList.remove('active');
    document.getElementById('season-stats-basic').classList.remove('active');
    document.getElementById('season-stats-advanced').classList.remove('active');
    document.getElementById('season-stats-assists').classList.remove('active');

    // Remove active class from all buttons
    document.querySelectorAll('#season-stats-section .tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });

    // Show selected tab
    if (tabName === 'team') {
        document.getElementById('season-stats-team').classList.add('active');
        event.target.classList.add('active');
    } else if (tabName === 'basic') {
        document.getElementById('season-stats-basic').classList.add('active');
        event.target.classList.add('active');
    } else if (tabName === 'advanced') {
        document.getElementById('season-stats-advanced').classList.add('active');
        event.target.classList.add('active');
    } else if (tabName === 'assists') {
        document.getElementById('season-stats-assists').classList.add('active');
        event.target.classList.add('active');
        renderAssistNetwork();
    }
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
        event.target.classList.add('active');
        renderAssistNetwork();
    } else if (tabName === 'leaders') {
        document.getElementById('assist-leaders').classList.add('active');
        event.target.classList.add('active');
        renderAssistLeaders();
    } else if (tabName === 'receivers') {
        document.getElementById('assist-receivers').classList.add('active');
        event.target.classList.add('active');
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
