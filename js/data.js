// Shared data utilities: CSV parsing, cached fetching, formatting.
// Loaded before page scripts; defines globals used across all pages.

// Format time remaining in seconds to MM:SS format
function formatTime(seconds) {
    const secs = parseInt(seconds) || 0;
    const minutes = Math.floor(secs / 60);
    const remainingSeconds = secs % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

// Format absolute game seconds as elapsed MM:SS
function formatElapsed(seconds) {
    return formatTime(seconds);
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

const csvCache = new Map();

// Load CSV file (cached); returns [] when the file doesn't exist
async function loadCSV(season, filename) {
    const url = `${season}/${filename}`;
    if (csvCache.has(url)) {
        return csvCache.get(url);
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            console.warn(`Could not load ${url}`);
            csvCache.set(url, []);
            return [];
        }
        const text = await response.text();
        const data = parseCSV(text);
        csvCache.set(url, data);
        return data;
    } catch (error) {
        console.error(`Error loading ${url}:`, error);
        return [];
    }
}

// Load a JSON file (cached); returns null when unavailable
async function loadJSON(url) {
    const cacheKey = `json:${url}`;
    if (csvCache.has(cacheKey)) {
        return csvCache.get(cacheKey);
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            csvCache.set(cacheKey, null);
            return null;
        }
        const data = await response.json();
        csvCache.set(cacheKey, data);
        return data;
    } catch (error) {
        console.error(`Error loading ${url}:`, error);
        return null;
    }
}

// Normalize file ids that may carry a trailing ".0" from float coercion
function normId(value) {
    return String(value == null ? '' : value).split('.')[0].trim();
}

function escapeHtml(value) {
    return String(value == null ? '' : value)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Player identity index (data/players_index.json), shared across pages
let playersIndexCache = null;

async function loadPlayersIndex() {
    if (playersIndexCache) return playersIndexCache;
    const data = await loadJSON('data/players_index.json');
    const bySeasonBoxName = new Map();  // `${season}|${box_name}` -> entry
    const byId = new Map();
    if (data && data.players) {
        data.players.forEach(player => {
            byId.set(player.id, player);
            player.seasons.forEach(s => {
                bySeasonBoxName.set(`${s.season}|${s.box_name}`, player);
            });
        });
    }
    playersIndexCache = { bySeasonBoxName, byId };
    return playersIndexCache;
}

// --- Table enhancements: click-to-sort headers + text search -----------

// Sortable value extracted from a cell's text: numeric when the text
// starts with a number, otherwise a lowercase string.
function tableCellValue(cell) {
    const text = (cell ? cell.textContent : '').trim();
    if (!text || text === '—' || text === '-' || text === '∞') {
        return { missing: true, num: false, value: text.toLowerCase() };
    }
    const match = text.replace(/,/g, '').replace(/−/g, '-').match(/^[+-]?\$?\d+(\.\d+)?/);
    if (match) {
        const n = parseFloat(match[0].replace('$', ''));
        if (!isNaN(n)) return { missing: false, num: true, value: n };
    }
    return { missing: false, num: false, value: text.toLowerCase() };
}

// Attach sort + search behavior to one table. Rows with the class
// `group-start` anchor a group: the group sorts and filters as a unit
// (so detail rows stay attached to their parent row).
function enhanceTable(table, opts) {
    const { searchable = true, minSearchRows = 10 } = opts || {};
    if (!table || !table.tHead || !table.tBodies[0] || table.dataset.enhanced === 'on') return;
    if (table.tBodies[0].rows.length === 0) return;
    table.dataset.enhanced = 'on';
    table.classList.add('enhanced-table');

    // Partition tbody rows into groups. When the table marks anchor rows
    // with `group-start`, those anchors form a group with the rows that
    // follow (detail rows stay attached). Without any `group-start` rows,
    // every row is its own group and sorts independently.
    const allRows = [...table.tBodies[0].rows];
    const hasGroupAnchors = allRows.some(row => row.classList.contains('group-start'));
    const groups = [];
    let current = null;
    allRows.forEach(row => {
        if (!hasGroupAnchors || row.classList.contains('group-start') || !current) {
            current = [row];
            groups.push(current);
        } else {
            current.push(row);
        }
    });

    // Search box above larger tables
    if (searchable && allRows.length >= minSearchRows && !table.parentNode.classList.contains('table-search-wrap')) {
        const wrap = document.createElement('div');
        wrap.className = 'table-search-wrap';
        table.parentNode.insertBefore(wrap, table);
        wrap.appendChild(table);
        const search = document.createElement('input');
        search.type = 'search';
        search.className = 'table-search';
        search.placeholder = `Filter ${allRows.length} rows…`;
        search.setAttribute('aria-label', 'Filter table rows');
        wrap.insertBefore(search, table);
        search.addEventListener('input', () => {
            const q = search.value.trim().toLowerCase();
            groups.forEach(group => {
                const show = !q || group[0].textContent.toLowerCase().includes(q);
                group.forEach(row => { row.style.display = show ? '' : 'none'; });
            });
        });
    }

    // Click-to-sort headers
    const headers = [...table.tHead.rows[0].cells];
    headers.forEach((th, idx) => {
        if (!groups.every(g => g[0].cells[idx])) return; // column present in every group
        th.classList.add('sortable-th');
        th.addEventListener('click', () => {
            const dir = th.dataset.dir === 'desc' ? 1 : -1;  // numeric columns start desc
            headers.forEach(h => { delete h.dataset.dir; h.classList.remove('sorted-asc', 'sorted-desc'); });
            th.dataset.dir = dir === 1 ? 'asc' : 'desc';
            th.classList.add(dir === 1 ? 'sorted-asc' : 'sorted-desc');
            sortTableGroups(table, groups, idx, dir);
        });
    });
}

function sortTableGroups(table, groups, idx, dir) {
    // A column is numeric when most group-anchor cells hold numbers
    const values = groups.map(g => tableCellValue(g[0].cells[idx]));
    const numericCount = values.filter(v => v.num).length;
    const isNumeric = numericCount > 0 && numericCount >= groups.length * 0.8;

    const compare = (a, b) => {
        if (a.missing && b.missing) return 0;
        if (a.missing) return 1;   // missing values always sort last
        if (b.missing) return -1;
        if (isNumeric) return (a.value - b.value) * dir;
        return a.value.localeCompare(b.value) * dir;
    };

    groups
        .map(g => ({ key: tableCellValue(g[0].cells[idx]), group: g }))
        .sort((x, y) => compare(x.key, y.key))
        .forEach(({ group }) => group.forEach(row => table.tBodies[0].appendChild(row)));
}

// Enhance every table under root (skips tables already enhanced)
function enhanceTables(root, opts) {
    if (!root) return;
    root.querySelectorAll('table').forEach(table => enhanceTable(table, opts));
}
