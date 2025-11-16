// Global state
let currentSeason = null;
let currentGameId = null;
let allPlays = [];
let allStats = [];
let allTeamTotals = [];
let allGames = [];
let filteredPlays = [];
let filteredStats = [];

// Available seasons
const seasons = [
    '2014-15', '2015-16', '2016-17', '2017-18', '2018-19', '2019-20',
    '2020-21', '2021-22', '2022-23', '2023-24', '2024-25', '2025-26'
];

// CSV Parser
function parseCSV(text) {
    const lines = text.trim().split('\n');
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

    // Load games for this season
    allGames = await loadCSV(season, 'game_info.csv');

    // Show games section
    document.getElementById('games-section').style.display = 'block';
    document.getElementById('game-details-section').style.display = 'none';

    renderGames();

    // Scroll to games section
    document.getElementById('games-section').scrollIntoView({ behavior: 'smooth' });
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

    // Sort by date
    uniqueGames.sort((a, b) => new Date(a.date) - new Date(b.date));

    container.innerHTML = uniqueGames.map(game => `
        <div class="game-card" onclick="selectGame('${game.file_id}')">
            <div class="game-card-header">
                <span class="game-date">${game.date}</span>
                <span class="game-score">${game.home_score} - ${game.visiting_score}</span>
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
    [allPlays, allStats, allTeamTotals] = await Promise.all([
        loadCSV(currentSeason, 'plays.csv'),
        loadCSV(currentSeason, 'player_stats.csv'),
        loadCSV(currentSeason, 'team_totals.csv')
    ]);

    // Filter by current game
    allPlays = allPlays.filter(p => p.file_id === gameId);
    allStats = allStats.filter(s => s.file_id === gameId);
    allTeamTotals = allTeamTotals.filter(t => t.file_id === gameId);

    filteredPlays = [...allPlays];
    filteredStats = [...allStats];

    // Show game details section
    document.getElementById('game-details-section').style.display = 'block';

    renderGameInfo();
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
                <span class="info-label">Home:</span> ${game.home_team} (${game.home_score})
            </div>
            <div class="info-item">
                <span class="info-label">Visiting:</span> ${game.visiting_team} (${game.visiting_score})
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
            `<span class="play-score">${play.home_team_score || '-'} - ${play.visiting_team_score || '-'}</span>` : '';

        const playerLink = play.player_name ?
            `<span class="play-player" onclick="showPlayerDetails('${play.player_name.replace(/'/g, "\\'")}')">${play.player_name}</span>` :
            '';

        return `
            <div class="play-item">
                <div class="play-header">
                    <div>
                        <span class="play-type">${play.play_type} ${play.play_action ? '- ' + play.play_action : ''}</span>
                        | Period ${play.period} | ${play.time_remaining}s | ${play.team}
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
                        `<span class="play-score">${play.home_team_score || '-'} - ${play.visiting_team_score || '-'}</span>` : '';

                    return `
                        <div class="play-item">
                            <div class="play-header">
                                <div>
                                    <span class="play-type">${play.play_type} ${play.play_action ? '- ' + play.play_action : ''}</span>
                                    | Period ${play.period} | ${play.time_remaining}s
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

// Initialize on page load
document.addEventListener('DOMContentLoaded', init);
