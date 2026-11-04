import os
import re
import json
import time
import requests
from bs4 import BeautifulSoup

from season_utils import resolve_season

base_url = "https://umterps.com/sports/womens-basketball/stats/"
headers = {
    "User-Agent": "umdwbb-data/1.0 (+https://github.com/dwillis/umdwbb-data)"
}


def fetch_season(season):
    game_ids = fetch_game_ids(season)
    print(f"Found {len(game_ids)} games for {season}")
    parse_games(season, game_ids)


def build_url(season, section):
    return base_url + season + "#" + section


def fetch_url(url, retries=3):
    """Fetch a URL, retrying transient network failures."""
    last_error = None
    for attempt in range(1, retries + 1):
        try:
            r = requests.get(url, headers=headers, timeout=60)
            r.raise_for_status()
            return r
        except requests.RequestException as e:
            last_error = e
            if attempt < retries:
                time.sleep(2 * attempt)
    raise last_error


def fetch_game_ids(season):
    url = build_url(season, 'game')
    r = fetch_url(url)
    html = r.text

    # Current site layout: /sports/womens-basketball/stats/{start_year}/{opponent}/boxscore/{game_id}
    start_year = season.split('-')[0]
    pattern = re.compile(
        r'/sports/womens-basketball/stats/%s/[^"\']*?/boxscore/(\d+)'
        % re.escape(start_year)
    )
    game_ids = list(dict.fromkeys(pattern.findall(html)))
    if game_ids:
        return game_ids

    # Legacy layout (pre-redesign): links inside <section id="game-team">.
    season_html = BeautifulSoup(html, features="html.parser")
    section = season_html.find('section', {'id': 'game-team'})
    if section:
        games = section.find_all('a')
        return [
            re.sub(r'&path=.*', '', x['href'].split("id=")[1])
            for x in games
            if x.get('href') and "id=" in x['href']
        ]

    # Legacy layout used for the 2019-20 season.
    match = re.search(r"var obj = (.*);", html)
    if match:
        season_json = json.loads(match.group(1))
        return [x['id'] for x in season_json['data']]

    # Last resort: any boxscore link on the page.
    return list(dict.fromkeys(re.findall(r'/boxscore/(\d+)', html)))


def parse_games(season, game_ids):
    for game_id in game_ids:
        game_json = fetch_game_json(game_id)
        if game_json:
            write_json(game_id, game_json, season)
            print(f"Saved {season}/{game_id}.json")
        else:
            print(f"No data returned for game {game_id} - skipping")


def fetch_game_json(game_id):
    url = f"https://umterps.com/api/livestats?game_id={game_id}&detail=full"
    try:
        r = fetch_url(url)
    except requests.RequestException as e:
        print(f"Error fetching game {game_id}: {e}")
        return None
    return r.json()


def write_json(game_id, game_json, season):
    os.makedirs(season, exist_ok=True)
    filename = os.path.join(season, str(game_id) + '.json')
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(game_json, f, ensure_ascii=False, indent=4)


if __name__ == "__main__":
    fetch_season(season=resolve_season())
