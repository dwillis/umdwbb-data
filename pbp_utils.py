import json
import glob
import sqlite_utils
import csv

def time_stats(season):
    stats = []
    stats.append(['season', 'game_id', 'date', 'home', 'home_lead_time', 'home_pct_lead', 'home_largest_lead', 'visitor', 'visitor_lead_time', 'visitor_pct_lead', 'visitor_largest_lead'])
    for file in glob.glob(f"{season}/*.json"):
        game_json = json.loads(open(file).read())
        stats.append([season, file.split('/')[1].split('.')[0], game_json['Game']['Date'], game_json['Game']['HomeTeam']['Name'], game_json['Stats']['HomeTeam']['Totals']['Values']['TimeWithLead'], game_json['Stats']['HomeTeam']['Totals']['Values']['PercentLead'], game_json['Stats']['HomeTeam']['Totals']['Values']['LargestLead'], game_json['Game']['VisitingTeam']['Name'], game_json['Stats']['VisitingTeam']['Totals']['Values']['TimeWithLead'], game_json['Stats']['VisitingTeam']['Totals']['Values']['PercentLead'], game_json['Stats']['VisitingTeam']['Totals']['Values']['LargestLead']])

    with open(f"time_stats_{season.replace('-','_')}.csv", 'w') as file:
        writer = csv.writer(file)
        writer.writerows(stats)
