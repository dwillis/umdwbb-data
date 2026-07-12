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
