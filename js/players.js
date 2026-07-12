// Players page: roster directory (no ?id=) or a single career page (?id=slug).
// Data: data/players_index.json + data/career_stats.csv

async function initPlayersPage() {
    const container = document.getElementById('player-page');
    const params = new URLSearchParams(window.location.search);
    const playerId = params.get('id');

    const [index, careerRows] = await Promise.all([
        loadPlayersIndex(),
        loadCSV('data', 'career_stats.csv')
    ]);

    if (playerId) {
        renderCareerPage(container, index, careerRows, playerId);
    } else {
        renderDirectory(container, index, careerRows);
    }
}

function renderDirectory(container, index, careerRows) {
    const totalsById = new Map();
    careerRows.forEach(row => {
        const t = totalsById.get(row.player_id) || { points: 0, games: 0, seasons: [] };
        t.points += parseInt(row.points) || 0;
        t.games += parseInt(row.games) || 0;
        t.seasons.push(row.season);
        totalsById.set(row.player_id, t);
    });

    const players = [...index.byId.values()]
        .map(p => ({ ...p, totals: totalsById.get(p.id) || { points: 0, games: 0, seasons: [] } }))
        .sort((a, b) => b.totals.points - a.totals.points);

    container.innerHTML = `
        <h2>All Maryland Players (2014-15 → 2025-26)</h2>
        <p class="section-note">Every player to appear in a box score in the dataset, ranked by career points. Click through for full career pages.</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr><th>#</th><th>Player</th><th>Seasons</th><th>Games</th><th>Career Points</th></tr></thead>
            <tbody>${players.map((p, i) => `
                <tr>
                    <td>${i + 1}</td>
                    <td><a class="player-link" href="players.html?id=${p.id}"><strong>${escapeHtml(p.name)}</strong></a></td>
                    <td>${p.totals.seasons.length ? `${p.totals.seasons[0]} – ${p.totals.seasons[p.totals.seasons.length - 1]}` : '—'}</td>
                    <td>${p.totals.games}</td>
                    <td><strong>${p.totals.points}</strong></td>
                </tr>`).join('')}
            </tbody>
        </table>
        </div>
    `;
}

function renderCareerPage(container, index, careerRows, playerId) {
    const player = index.byId.get(playerId);
    const seasons = careerRows.filter(r => r.player_id === playerId);
    if (!player || seasons.length === 0) {
        container.innerHTML = `<h2>Player not found</h2><p><a href="players.html">← All players</a></p>`;
        return;
    }

    const num = v => parseInt(v) || 0;
    const totals = {};
    ['games', 'starts', 'minutes', 'points', 'fgm', 'fga', 'tpm', 'tpa', 'ftm', 'fta',
     'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'personal_fouls',
     'double_doubles', 'triple_doubles'].forEach(k => {
        totals[k] = seasons.reduce((sum, r) => sum + num(r[k]), 0);
    });
    const careerHigh = Math.max(...seasons.map(r => num(r.high_points)));
    const ppgBySeason = seasons.map(r => num(r.games) ? num(r.points) / num(r.games) : 0);

    const pctOf = (made, att) => att > 0 ? (made / att * 100).toFixed(1) + '%' : '—';
    const perGame = (total, games) => games > 0 ? (total / games).toFixed(1) : '—';

    const seasonRow = (r, isTotal = false) => {
        const g = num(r.games);
        return `
            <tr class="${isTotal ? 'career-total-row' : ''}">
                <td><strong>${isTotal ? 'Career' : r.season}</strong></td>
                <td>${g}</td>
                <td>${num(r.starts)}</td>
                <td>${perGame(num(r.minutes), g)}</td>
                <td><strong>${perGame(num(r.points), g)}</strong></td>
                <td>${perGame(num(r.rebounds), g)}</td>
                <td>${perGame(num(r.assists), g)}</td>
                <td>${perGame(num(r.steals), g)}</td>
                <td>${perGame(num(r.blocks), g)}</td>
                <td>${pctOf(num(r.fgm), num(r.fga))}</td>
                <td>${pctOf(num(r.tpm), num(r.tpa))}</td>
                <td>${pctOf(num(r.ftm), num(r.fta))}</td>
                <td>${num(r.points)}</td>
            </tr>`;
    };

    const numbers = [...new Set(player.seasons.map(s => `#${s.number}`))].join(', ');
    const positions = [...new Set(player.seasons.map(s => s.position).filter(Boolean))].join('/');

    container.innerHTML = `
        <p><a href="players.html">← All players</a></p>
        <h2>${escapeHtml(player.name)}</h2>
        <p class="section-note">${numbers}${positions ? ' · ' + positions : ''} ·
        ${seasons[0].season} – ${seasons[seasons.length - 1].season}</p>

        <div class="stat-strip">
            <div class="stat-chip"><span class="stat-chip-value">${totals.points}</span> career points</div>
            <div class="stat-chip"><span class="stat-chip-value">${totals.rebounds}</span> rebounds</div>
            <div class="stat-chip"><span class="stat-chip-value">${totals.assists}</span> assists</div>
            <div class="stat-chip"><span class="stat-chip-value">${careerHigh}</span> career high</div>
            <div class="stat-chip"><span class="stat-chip-value">${totals.double_doubles}</span> double-doubles</div>
            ${totals.triple_doubles > 0 ? `<div class="stat-chip"><span class="stat-chip-value">${totals.triple_doubles}</span> triple-doubles</div>` : ''}
            <div class="stat-chip"><span class="stat-chip-value">${Charts.sparkline(ppgBySeason)}</span> PPG trend</div>
        </div>

        <h3>Season by Season</h3>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Season</th><th>GP</th><th>GS</th><th>MPG</th><th>PPG</th><th>RPG</th><th>APG</th>
                <th>SPG</th><th>BPG</th><th>FG%</th><th>3P%</th><th>FT%</th><th>Pts</th>
            </tr></thead>
            <tbody>
                ${seasons.map(r => seasonRow(r)).join('')}
                ${seasons.length > 1 ? seasonRow(totals, true) : ''}
            </tbody>
        </table>
        </div>

        <h3 style="margin-top:1.5rem;">Explore</h3>
        <p>See per-game stats and play-by-play in the
        <a href="index.html">season browser</a> for any of ${escapeHtml(player.name)}'s seasons:
        ${seasons.map(r => `<strong>${r.season}</strong>`).join(', ')}.</p>
    `;
}

document.addEventListener('DOMContentLoaded', initPlayersPage);
