-- Paste this into your D1 database's Console in Cloudflare and run it once.
CREATE TABLE IF NOT EXISTS players (
  id            TEXT PRIMARY KEY,
  token_hash    TEXT NOT NULL,
  gen_name      TEXT NOT NULL,
  req_name      TEXT,
  approved_name TEXT,
  name_status   TEXT NOT NULL DEFAULT 'none',
  score         REAL NOT NULL DEFAULT 0,
  runs          INTEGER NOT NULL DEFAULT 0,
  shares        INTEGER NOT NULL DEFAULT 0,
  credited_play REAL NOT NULL DEFAULT 0,
  last_submit   INTEGER NOT NULL DEFAULT 0,
  created       INTEGER NOT NULL,
  flagged       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_players_board ON players (flagged, score DESC);
CREATE INDEX IF NOT EXISTS idx_players_names ON players (name_status);
