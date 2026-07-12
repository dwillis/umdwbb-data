// Hand-rolled SVG charts (no dependencies): game-flow worm chart,
// rotation gantt, foul timeline, paired comparison bars, sparklines.
// All charts scale via viewBox and inherit the site's Maryland palette.

const Charts = (() => {
    const NS = 'http://www.w3.org/2000/svg';
    const RED = '#E03A3E';
    const DARK = '#333333';
    const GOLD = '#FFD520';

    function el(name, attrs, parent) {
        const node = document.createElementNS(NS, name);
        for (const [key, value] of Object.entries(attrs || {})) {
            node.setAttribute(key, value);
        }
        if (parent) parent.appendChild(node);
        return node;
    }

    function svgRoot(container, width, height) {
        container.innerHTML = '';
        const svg = el('svg', {
            viewBox: `0 0 ${width} ${height}`,
            width: '100%',
            style: 'display:block; max-width:100%; font-family:inherit;'
        });
        container.appendChild(svg);
        return svg;
    }

    function periodLabel(period, isHalves) {
        if (isHalves) return period <= 2 ? `H${period}` : `OT${period - 2}`;
        return period <= 4 ? `Q${period}` : `OT${period - 4}`;
    }

    // Derive period boundaries from enriched plays (seconds_elapsed + period)
    function gameShape(plays) {
        let maxPeriod = 1;
        let maxElapsed = 0;
        plays.forEach(p => {
            const period = parseInt(p.period) || 1;
            const t = parseInt(p.seconds_elapsed) || 0;
            if (period > maxPeriod) maxPeriod = period;
            if (t > maxElapsed) maxElapsed = t;
        });
        const isHalves = maxPeriod <= 2 && maxElapsed > 1250;
        const regPeriods = isHalves ? 2 : 4;
        const regLen = isHalves ? 1200 : 600;
        const boundaries = [];
        let total = 0;
        for (let p = 1; p <= Math.max(maxPeriod, regPeriods); p++) {
            total += p <= regPeriods ? regLen : 300;
            boundaries.push({ period: p, end: total, label: periodLabel(p, isHalves) });
        }
        return { boundaries, total, isHalves, regPeriods };
    }

    // --- Game flow worm chart -------------------------------------------
    // points: [{t, margin, label}] margin from Maryland's perspective
    function wormChart(container, plays, opts) {
        const { marylandIsHome, marylandName = 'Maryland', opponentName = 'Opponent' } = opts || {};
        const shape = gameShape(plays);

        const points = [{ t: 0, margin: 0, label: 'Tip-off' }];
        plays.forEach(p => {
            if ((parseInt(p.points) || 0) <= 0) return;
            const homeMargin = (parseInt(p.home_score_running) || 0) - (parseInt(p.visiting_score_running) || 0);
            const margin = marylandIsHome ? homeMargin : -homeMargin;
            points.push({
                t: parseInt(p.seconds_elapsed) || 0,
                margin,
                score: `${p.home_score_running}-${p.visiting_score_running}`,
                label: p.narrative
            });
        });
        if (points.length > 1) {
            points.push({ ...points[points.length - 1], t: shape.total, label: 'Final' });
        }

        const W = 900, H = 300, padL = 44, padR = 12, padT = 16, padB = 28;
        const plotW = W - padL - padR, plotH = H - padT - padB;
        const maxAbs = Math.max(10, ...points.map(p => Math.abs(p.margin)));
        const x = t => padL + (t / shape.total) * plotW;
        const y = m => padT + plotH / 2 - (m / maxAbs) * (plotH / 2);

        const svg = svgRoot(container, W, H);

        // Filled step areas: clamped positive (Maryland lead) and negative
        function stepArea(clamp) {
            let d = `M ${x(0)} ${y(0)}`;
            let prev = 0;
            points.forEach(p => {
                const v = clamp(p.margin);
                d += ` L ${x(p.t)} ${y(prev)} L ${x(p.t)} ${y(v)}`;
                prev = v;
            });
            d += ` L ${x(shape.total)} ${y(0)} Z`;
            return d;
        }
        el('path', { d: stepArea(m => Math.max(m, 0)), fill: RED, 'fill-opacity': 0.55 }, svg);
        el('path', { d: stepArea(m => Math.min(m, 0)), fill: DARK, 'fill-opacity': 0.4 }, svg);

        // Grid: period boundaries + zero line + margin ticks
        shape.boundaries.forEach((b, i) => {
            if (b.end < shape.total) {
                el('line', { x1: x(b.end), y1: padT, x2: x(b.end), y2: padT + plotH, stroke: '#ccc', 'stroke-dasharray': '4,3' }, svg);
            }
            const startT = i === 0 ? 0 : shape.boundaries[i - 1].end;
            const mid = x((startT + Math.min(b.end, shape.total)) / 2);
            el('text', { x: mid, y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#666' }, svg)
                .textContent = b.label;
        });
        el('line', { x1: padL, y1: y(0), x2: padL + plotW, y2: y(0), stroke: '#999' }, svg);
        [maxAbs, Math.round(maxAbs / 2), -Math.round(maxAbs / 2), -maxAbs].forEach(tick => {
            el('text', { x: padL - 6, y: y(tick) + 4, 'text-anchor': 'end', 'font-size': 11, fill: '#666' }, svg)
                .textContent = tick > 0 ? `+${tick}` : tick;
        });
        el('text', { x: padL + 4, y: padT + 12, 'font-size': 12, fill: RED, 'font-weight': 700 }, svg)
            .textContent = `${marylandName} lead`;
        el('text', { x: padL + 4, y: padT + plotH - 4, 'font-size': 12, fill: DARK, 'font-weight': 700 }, svg)
            .textContent = `${opponentName} lead`;

        // Hover interaction
        const guide = el('line', { y1: padT, y2: padT + plotH, stroke: GOLD, 'stroke-width': 2, visibility: 'hidden' }, svg);
        const tooltip = document.createElement('div');
        tooltip.className = 'chart-tooltip';
        tooltip.style.display = 'none';
        container.style.position = 'relative';
        container.appendChild(tooltip);

        svg.addEventListener('mousemove', event => {
            const rect = svg.getBoundingClientRect();
            const t = ((event.clientX - rect.left) / rect.width * W - padL) / plotW * shape.total;
            let nearest = points[0];
            points.forEach(p => {
                if (Math.abs(p.t - t) < Math.abs(nearest.t - t)) nearest = p;
            });
            guide.setAttribute('x1', x(nearest.t));
            guide.setAttribute('x2', x(nearest.t));
            guide.setAttribute('visibility', 'visible');
            tooltip.style.display = 'block';
            tooltip.innerHTML = `<strong>${formatElapsed(nearest.t)}</strong>` +
                (nearest.score ? ` · ${nearest.score}` : '') +
                `<br>${escapeHtml(nearest.label || '')}`;
            const left = (event.clientX - rect.left) / rect.width * 100;
            tooltip.style.left = `${Math.min(left, 70)}%`;
            tooltip.style.top = '8px';
        });
        svg.addEventListener('mouseleave', () => {
            guide.setAttribute('visibility', 'hidden');
            tooltip.style.display = 'none';
        });

        return shape;
    }

    // --- Rotation gantt --------------------------------------------------
    // stints: rows from stints.csv for one game & team, fouls: fouls.csv rows
    function rotationChart(container, stints, fouls, plays) {
        const shape = gameShape(plays);

        // Order: starters first, then by first entrance
        const players = new Map();
        stints.forEach(s => {
            const name = s.player_name;
            if (!players.has(name)) {
                players.set(name, { name, starter: s.starter === '1', first: parseInt(s.in_seconds) || 0, stints: [], plusMinus: 0 });
            }
            const p = players.get(name);
            p.stints.push(s);
            p.plusMinus += parseInt(s.plus_minus) || 0;
            p.starter = p.starter || s.starter === '1';
        });
        const rows = [...players.values()].sort((a, b) =>
            (b.starter - a.starter) || (a.first - b.first));

        const rowH = 26, padL = 150, padR = 12, padT = 8, padB = 26;
        const W = 900;
        const plotW = W - padL - padR;
        const H = padT + rows.length * rowH + padB;
        const x = t => padL + (t / shape.total) * plotW;

        const svg = svgRoot(container, W, H);

        shape.boundaries.forEach((b, i) => {
            if (b.end < shape.total) {
                el('line', { x1: x(b.end), y1: padT, x2: x(b.end), y2: padT + rows.length * rowH, stroke: '#ddd' }, svg);
            }
            const startT = i === 0 ? 0 : shape.boundaries[i - 1].end;
            el('text', { x: x((startT + Math.min(b.end, shape.total)) / 2), y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#666' }, svg)
                .textContent = b.label;
        });

        rows.forEach((player, i) => {
            const yTop = padT + i * rowH;
            if (i % 2 === 0) {
                el('rect', { x: padL, y: yTop, width: plotW, height: rowH, fill: '#000', 'fill-opacity': 0.03 }, svg);
            }
            const label = el('text', { x: padL - 8, y: yTop + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 12, fill: '#222', 'font-weight': player.starter ? 700 : 400 }, svg);
            label.textContent = (player.starter ? '★ ' : '') + player.name;

            player.stints.forEach(s => {
                const inT = parseInt(s.in_seconds) || 0;
                const outT = parseInt(s.out_seconds) || 0;
                const pm = parseInt(s.plus_minus) || 0;
                const minutes = (outT - inT) / 60;
                const perMin = minutes > 0.5 ? pm / minutes : 0;
                const color = perMin > 0.15 ? '#2e8b57' : perMin < -0.15 ? RED : '#8a8a8a';
                const bar = el('rect', {
                    x: x(inT), y: yTop + 5,
                    width: Math.max(x(outT) - x(inT), 1.5), height: rowH - 10,
                    rx: 3, fill: color, 'fill-opacity': 0.8
                }, svg);
                el('title', {}, bar).textContent =
                    `${player.name}: ${formatElapsed(inT)}–${formatElapsed(outT)} · ${pm > 0 ? '+' : ''}${pm}`;
            });

            // Foul tick marks on this player's row
            fouls.filter(f => f.player_name === player.name).forEach(f => {
                const t = parseInt(f.seconds_elapsed) || 0;
                const mark = el('circle', { cx: x(t), cy: yTop + rowH / 2, r: 5, fill: GOLD, stroke: '#7a5c00', 'stroke-width': 1 }, svg);
                el('title', {}, mark).textContent =
                    `Foul ${f.player_foul_count} · ${periodLabel(parseInt(f.period), shape.isHalves)} ${formatTime(f.time_remaining)}`;
            });

            const pmText = el('text', { x: W - 4, y: yTop + rowH / 2 + 4, 'text-anchor': 'end', 'font-size': 11, 'font-weight': 700, fill: player.plusMinus > 0 ? '#2e8b57' : player.plusMinus < 0 ? RED : '#666' }, svg);
            pmText.textContent = `${player.plusMinus > 0 ? '+' : ''}${player.plusMinus}`;
        });
    }

    // --- Foul timeline ----------------------------------------------------
    // Two lanes with a tick per foul, shaded once the opponent is in the bonus
    function foulTimeline(container, fouls, plays, teamA, teamB) {
        const shape = gameShape(plays);
        const laneH = 46, padL = 130, padR = 12, padT = 8, padB = 26;
        const W = 900, plotW = W - padL - padR;
        const H = padT + laneH * 2 + padB;
        const x = t => padL + (t / shape.total) * plotW;

        const svg = svgRoot(container, W, H);

        [teamA, teamB].forEach((team, lane) => {
            const yTop = padT + lane * laneH;
            const yMid = yTop + laneH / 2;
            el('rect', { x: padL, y: yTop + 6, width: plotW, height: laneH - 12, fill: '#000', 'fill-opacity': 0.04, rx: 4 }, svg);
            el('text', { x: padL - 8, y: yMid + 4, 'text-anchor': 'end', 'font-size': 12, 'font-weight': 700, fill: team === 'Maryland' ? RED : '#222' }, svg)
                .textContent = team;

            const teamFouls = fouls.filter(f => f.team === team);

            // Bonus shading: from the foul that triggers the bonus to period end
            shape.boundaries.forEach((b, i) => {
                const startT = i === 0 ? 0 : shape.boundaries[i - 1].end;
                const trigger = teamFouls.find(f =>
                    parseInt(f.period) === b.period && f.bonus_active === '1');
                if (trigger) {
                    const from = parseInt(trigger.seconds_elapsed) || startT;
                    const bar = el('rect', { x: x(from), y: yTop + 6, width: Math.max(x(Math.min(b.end, shape.total)) - x(from), 0), height: laneH - 12, fill: GOLD, 'fill-opacity': 0.45, rx: 4 }, svg);
                    el('title', {}, bar).textContent = `${team} in the penalty (${b.label})`;
                }
                if (b.end < shape.total) {
                    el('line', { x1: x(b.end), y1: yTop + 4, x2: x(b.end), y2: yTop + laneH - 4, stroke: '#ccc' }, svg);
                }
            });

            teamFouls.forEach(f => {
                const t = parseInt(f.seconds_elapsed) || 0;
                const technical = f.foul_type === 'technical';
                const mark = el('line', {
                    x1: x(t), y1: yMid - 9, x2: x(t), y2: yMid + 9,
                    stroke: technical ? '#7a00a8' : (team === 'Maryland' ? RED : '#444'),
                    'stroke-width': technical ? 3.5 : 2
                }, svg);
                el('title', {}, mark).textContent =
                    `${f.player_name || 'Team'} ${technical ? 'technical ' : ''}foul` +
                    (f.player_foul_count ? ` (${f.player_foul_count})` : '') +
                    ` · ${periodLabel(parseInt(f.period), shape.isHalves)} ${formatTime(f.time_remaining)}`;
            });
        });

        shape.boundaries.forEach((b, i) => {
            const startT = i === 0 ? 0 : shape.boundaries[i - 1].end;
            el('text', { x: x((startT + Math.min(b.end, shape.total)) / 2), y: H - 8, 'text-anchor': 'middle', 'font-size': 12, fill: '#666' }, svg)
                .textContent = b.label;
        });
    }

    // --- Paired horizontal comparison bars (HTML) --------------------------
    // rows: [{label, a, b}] — a is Maryland, b the opponent
    function comparisonBars(container, rows, teamA, teamB) {
        const maxValue = Math.max(1, ...rows.flatMap(r => [r.a, r.b]));
        container.innerHTML = `
            <div class="compare-header"><span class="compare-team maryland">${escapeHtml(teamA)}</span><span></span><span class="compare-team">${escapeHtml(teamB)}</span></div>
            ${rows.map(r => `
                <div class="compare-row">
                    <div class="compare-side left">
                        <span class="compare-value">${r.a}</span>
                        <div class="compare-bar maryland" style="width:${(r.a / maxValue * 100).toFixed(1)}%"></div>
                    </div>
                    <div class="compare-label">${escapeHtml(r.label)}</div>
                    <div class="compare-side right">
                        <div class="compare-bar opp" style="width:${(r.b / maxValue * 100).toFixed(1)}%"></div>
                        <span class="compare-value">${r.b}</span>
                    </div>
                </div>
            `).join('')}
        `;
    }

    // --- Sparkline ---------------------------------------------------------
    function sparkline(values, width = 120, height = 28) {
        if (!values.length) return '';
        const max = Math.max(...values), min = Math.min(...values);
        const range = max - min || 1;
        const step = values.length > 1 ? width / (values.length - 1) : 0;
        const pts = values.map((v, i) =>
            `${(i * step).toFixed(1)},${(height - 3 - (v - min) / range * (height - 6)).toFixed(1)}`).join(' ');
        return `<svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">` +
            `<polyline points="${pts}" fill="none" stroke="${RED}" stroke-width="2"/></svg>`;
    }

    return { wormChart, rotationChart, foulTimeline, comparisonBars, sparkline, gameShape };
})();
