import os
import re
import json
import requests
from bs4 import BeautifulSoup

base_url = "https://umterps.com/sports/womens-basketball/stats/"

def fetch_season(season):
    game_ids = fetch_game_ids(season)
    parse_games(season, game_ids)

def build_url(season, section):
    return base_url + season + "#" + section

def fetch_url(url):
    r = requests.get(url)
    return r

def fetch_game_ids(season):
    url = build_url(season, 'game')
    r = fetch_url(url)
    if season == '2019-20':
        season_js = re.search(r"var obj = (.*);", r.text).group(1)
        season_json = json.loads(season_js)
        game_ids = [x['id'] for x in season_json['data']]
    else:
        season_html = BeautifulSoup(r.text, features="html.parser")
        games = season_html.find('section', {'id': 'game-team'}).findAll('a')
        game_ids = [x['href'].split("id=")[1].replace("&path=wbball","") for x in games]
    return game_ids

def parse_games(season, game_ids):
    results = []
    for game_id in game_ids:
        game_json = fetch_game_json(game_id)
        write_json(game_id, game_json, season)

def fetch_game_json(game_id):
    url = f"https://umterps.com/api/livestats?game_id={game_id}&detail=full"
    r = fetch_url(url)
    if r.status_code == 200:
        pbp = r.json()
    else:
        pbp = None
    return pbp

def write_json(game_id, game_json, season):
    if not os.path.exists(season):
        os.makedirs(season)

    os.chdir(season)
    filename = str(game_id) + '.json'
    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(game_json, f, ensure_ascii=False, indent=4)
    os.chdir('..')
