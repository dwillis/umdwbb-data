// Officials page: per-official whistle tendencies across Maryland games.
// Data: data/officials_summary.csv

async function initOfficialsPage() {
    const container = document.getElementById('officials-page');
    const officials = await loadCSV('data', 'officials_summary.csv');
    if (officials.length === 0) {
        container.innerHTML = '<h2>Officials</h2><p>No officials data available.</p>';
        return;
    }

    const withFouls = officials.filter(o => o.avg_fouls_total !== '');
    const datasetAvg = withFouls.length > 0
        ? withFouls.reduce((sum, o) => sum + parseFloat(o.avg_fouls_total) * parseInt(o.games), 0) /
          withFouls.reduce((sum, o) => sum + parseInt(o.games), 0)
        : 0;

    const regulars = officials.filter(o => parseInt(o.games) >= 5);

    container.innerHTML = `
        <h2>Officiating Crews in Maryland Games</h2>
        <p class="section-note"><strong>Read with care:</strong> officiating assignments are not random —
        conference and tournament officials tend to work stronger opponents, so differences here are
        descriptive, not evidence of bias. Foul averages count both teams' personal fouls in games the
        official worked (dataset average: ${datasetAvg.toFixed(1)} fouls/game).
        Showing officials with 5+ Maryland games; ${officials.length} officials appear in total.</p>
        <div style="overflow-x:auto;">
        <table>
            <thead><tr>
                <th>Official</th><th>Games</th><th>Seasons</th><th>UMD Record</th>
                <th>Fouls/Game</th><th>vs Avg</th><th>UMD Fouls</th><th>Opp Fouls</th>
                <th>UMD FTA</th><th>Opp FTA</th>
            </tr></thead>
            <tbody>${regulars.map(o => {
                const total = parseFloat(o.avg_fouls_total);
                const diff = isNaN(total) ? null : total - datasetAvg;
                return `
                <tr>
                    <td><strong>${escapeHtml(o.official)}</strong></td>
                    <td>${o.games}</td>
                    <td>${o.first_season.slice(0, 4)}–${o.last_season.slice(-2)}</td>
                    <td>${o.umd_wins}-${o.umd_losses}</td>
                    <td>${o.avg_fouls_total || '—'}</td>
                    <td class="${diff > 1 ? 'neg' : diff < -1 ? 'pos' : ''}">${diff === null ? '—' : (diff > 0 ? '+' : '') + diff.toFixed(1)}</td>
                    <td>${o.avg_fouls_umd || '—'}</td>
                    <td>${o.avg_fouls_opp || '—'}</td>
                    <td>${o.avg_fta_umd || '—'}</td>
                    <td>${o.avg_fta_opp || '—'}</td>
                </tr>`;
            }).join('')}</tbody>
        </table>
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', initOfficialsPage);
