// Opponents page: all-time record vs every opponent with expandable game logs.
// Data: data/opponents_index.csv

async function initOpponentsPage() {
    const container = document.getElementById('opponents-page');
    const games = await loadCSV('data', 'opponents_index.csv');
    if (games.length === 0) {
        container.innerHTML = '<h2>Opponents</h2><p>No opponent data available.</p>';
        return;
    }

    const byOpponent = new Map();
    games.forEach(g => {
        const entry = byOpponent.get(g.opponent) || { games: [], wins: 0, losses: 0, marginSum: 0 };
        entry.games.push(g);
        if (g.result === 'W') entry.wins++; else entry.losses++;
        entry.marginSum += parseInt(g.margin) || 0;
        byOpponent.set(g.opponent, entry);
    });

    const opponents = [...byOpponent.entries()].sort((a, b) =>
        b[1].games.length - a[1].games.length || a[0].localeCompare(b[0]));

    // Current streak vs each opponent (games are chronological in the file)
    const streakText = entry => {
        const results = entry.games.map(g => g.result);
        const last = results[results.length - 1];
        let n = 0;
        for (let i = results.length - 1; i >= 0 && results[i] === last; i--) n++;
        return `${last}${n}`;
    };

    container.innerHTML = `
        <h2>All-Time vs Every Opponent</h2>
        <p class="section-note">${games.length} games against ${opponents.length} opponents across the dataset.
        Click a row to see the full series.</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr><th>Opponent</th><th>Games</th><th>Record</th><th>Avg Margin</th><th>Streak</th><th>Last Meeting</th></tr></thead>
            <tbody>${opponents.map(([name, entry], i) => {
                const last = entry.games[entry.games.length - 1];
                const avgMargin = entry.marginSum / entry.games.length;
                return `
                <tr class="opponent-row" onclick="toggleSeries(${i})">
                    <td><strong>${escapeHtml(name)}</strong></td>
                    <td>${entry.games.length}</td>
                    <td><strong class="${entry.wins >= entry.losses ? 'pos' : 'neg'}">${entry.wins}-${entry.losses}</strong></td>
                    <td class="${avgMargin > 0 ? 'pos' : 'neg'}">${avgMargin > 0 ? '+' : ''}${avgMargin.toFixed(1)}</td>
                    <td>${streakText(entry)}</td>
                    <td>${last.date} (${last.result} ${last.maryland_score}-${last.opponent_score})</td>
                </tr>
                <tr id="series-${i}" class="series-row" style="display:none;">
                    <td colspan="6">
                        <div class="series-games">
                            ${entry.games.slice().reverse().map(g => `
                                <div class="run-item ${g.result === 'W' ? 'run-maryland' : ''}">
                                    <span class="run-points">${g.result}</span>
                                    <span>${g.date} · ${g.is_home === '1' ? 'vs' : 'at'} ${escapeHtml(name)}
                                    <strong>${g.maryland_score}-${g.opponent_score}</strong>
                                    <span class="series-season">(${g.season})</span></span>
                                </div>`).join('')}
                        </div>
                    </td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>
    `;
}

function toggleSeries(index) {
    const row = document.getElementById(`series-${index}`);
    row.style.display = row.style.display === 'none' ? 'table-row' : 'none';
}

document.addEventListener('DOMContentLoaded', initOpponentsPage);
