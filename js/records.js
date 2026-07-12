// Records & milestones page. Data: data/records.json (precomputed by pipeline).

async function initRecordsPage() {
    const container = document.getElementById('records-page');
    const records = await loadJSON('data/records.json');
    if (!records) {
        container.innerHTML = '<h2>Records</h2><p>No records data available.</p>';
        return;
    }

    const singleGameTable = (title, rows, unit) => `
        <div>
            <h3>${title}</h3>
            <table>
                <thead><tr><th>#</th><th>Player</th><th>${unit}</th><th>Opponent</th><th>Date</th></tr></thead>
                <tbody>${rows.map((r, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td><strong>${escapeHtml(r.player)}</strong></td>
                        <td><strong>${r.value}</strong></td>
                        <td>${escapeHtml(r.opponent)} (${escapeHtml(r.result)})</td>
                        <td>${r.date}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;

    const careerTable = (title, rows, unit) => `
        <div>
            <h3>${title}</h3>
            <table>
                <thead><tr><th>#</th><th>Player</th><th>${unit}</th><th>Games</th></tr></thead>
                <tbody>${rows.map((r, i) => `
                    <tr>
                        <td>${i + 1}</td>
                        <td><a class="player-link" href="players.html?id=${r.player_id}"><strong>${escapeHtml(r.player)}</strong></a></td>
                        <td><strong>${r.value}</strong></td>
                        <td>${r.games}</td>
                    </tr>`).join('')}
                </tbody>
            </table>
        </div>`;

    const gameList = (title, rows, valueOf, describe) => `
        <div>
            <h3>${title}</h3>
            ${rows.map(g => `
                <div class="run-item run-maryland">
                    <span class="run-points">${valueOf(g)}</span>
                    <span>${describe(g)}</span>
                </div>`).join('')}
        </div>`;

    const sg = records.single_game;
    const career = records.career;
    const team = records.team;

    container.innerHTML = `
        <h2>Records &amp; Milestones</h2>
        <p class="section-note">${escapeHtml(records.note)}. Career figures cover this dataset only, not full program history.</p>

        <div class="flow-columns">
            ${singleGameTable('Most Points in a Game', sg.points, 'Pts')}
            ${singleGameTable('Most Rebounds in a Game', sg.rebounds, 'Reb')}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            ${singleGameTable('Most Assists in a Game', sg.assists, 'Ast')}
            ${singleGameTable('Most Steals in a Game', sg.steals, 'Stl')}
        </div>

        <h2 style="margin-top:2rem;">Career Leaders (in dataset)</h2>
        <div class="flow-columns">
            ${careerTable('Points', career.points, 'Pts')}
            ${careerTable('Rebounds', career.rebounds, 'Reb')}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            ${careerTable('Assists', career.assists, 'Ast')}
            ${careerTable('Double-Doubles', career.double_doubles, 'DD')}
        </div>

        <h2 style="margin-top:2rem;">Team</h2>
        <div class="flow-columns">
            ${gameList('Biggest Wins', team.biggest_wins,
                g => `+${g.margin}`,
                g => `${g.score} ${g.is_home === 1 ? 'vs' : 'at'} <strong>${escapeHtml(g.opponent)}</strong> · ${g.date}`)}
            ${gameList('Largest Comebacks (won after trailing)', team.comebacks,
                g => `−${g.deficit}`,
                g => `beat <strong>${escapeHtml(g.opponent)}</strong> ${g.score} · ${g.date}`)}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            ${gameList('Longest Win Streaks', team.win_streaks,
                s => s.length,
                s => `${s.start} (${s.start_season}) → ${s.end} (${s.end_season})${s.active ? ' <span class="active-streak">active</span>' : ''}`)}
            ${gameList('Highest-Scoring Games', team.most_points,
                g => g.score.split('-')[0],
                g => `${g.score} ${g.is_home === 1 ? 'vs' : 'at'} <strong>${escapeHtml(g.opponent)}</strong> · ${g.date}`)}
        </div>
        <div class="flow-columns" style="margin-top:1rem;">
            ${gameList('Largest Crowds', team.top_attendance,
                g => g.attendance.toLocaleString(),
                g => `${g.is_home === 1 ? 'vs' : 'at'} <strong>${escapeHtml(g.opponent)}</strong> · ${g.date} (${g.score})`)}
            <div></div>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', initRecordsPage);
