const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 6034;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const CARD_PAIRS = 8;
let leaderboard = [];

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

app.get('/api/shuffle', (req, res) => {
  const cardIds = [];
  for (let i = 1; i <= CARD_PAIRS; i++) {
    cardIds.push(i, i);
  }
  const shuffled = shuffle(cardIds);
  res.json({ cards: shuffled });
});

app.post('/api/score', (req, res) => {
  const { time, playerName } = req.body;
  
  if (typeof time !== 'number' || time <= 0) {
    return res.status(400).json({ error: '鏃犳晥鐨勬垚缁╂暟鎹? });
  }

  const entry = {
    id: Date.now(),
    time: time,
    playerName: playerName || '鍖垮悕鐜╁',
    date: new Date().toLocaleString('zh-CN')
  };

  leaderboard.push(entry);
  leaderboard.sort((a, b) => a.time - b.time);
  leaderboard = leaderboard.slice(0, 10);

  const rank = leaderboard.findIndex(e => e.id === entry.id) + 1;

  res.json({
    success: true,
    rank: rank,
    leaderboard: leaderboard
  });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: leaderboard });
});

app.listen(PORT, () => {
  console.log(`鏈嶅姟鍣ㄨ繍琛屽湪 http://localhost:${PORT}`);
});
