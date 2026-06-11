﻿﻿﻿const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = 6034;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../client')));

const CARD_PAIRS = 8;
const MIN_FLIPS = CARD_PAIRS * 2;
const MAX_FLIPS = 80;
const MIN_GAME_TIME = 8;
const MAX_GAME_TIME = 600;
const TIME_TOLERANCE = 5;

let leaderboard = [];
let suspiciousScores = [];
let gameSessions = new Map();

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function generateSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

app.post('/api/start-game', (req, res) => {
  const sessionId = generateSessionId();
  const cardIds = [];
  for (let i = 1; i <= CARD_PAIRS; i++) {
    cardIds.push(i, i);
  }
  const shuffled = shuffle(cardIds);

  gameSessions.set(sessionId, {
    startTime: null,
    cards: shuffled,
    flipCount: 0,
    completed: false
  });

  setTimeout(() => {
    if (gameSessions.has(sessionId) && !gameSessions.get(sessionId).completed) {
      gameSessions.delete(sessionId);
    }
  }, 30 * 60 * 1000);

  res.json({ sessionId, cards: shuffled });
});

app.get('/api/shuffle', (req, res) => {
  const cardIds = [];
  for (let i = 1; i <= CARD_PAIRS; i++) {
    cardIds.push(i, i);
  }
  const shuffled = shuffle(cardIds);
  res.json({ cards: shuffled });
});

app.post('/api/flip', (req, res) => {
  const { sessionId } = req.body;
  
  if (!sessionId || !gameSessions.has(sessionId)) {
    return res.status(400).json({ error: '无效的会话' });
  }

  const session = gameSessions.get(sessionId);
  
  if (session.flipCount === 0) {
    session.startTime = Date.now();
  }
  
  session.flipCount++;

  res.json({ success: true, flipCount: session.flipCount });
});

function validateScore(sessionId, clientTime, clientFlips) {
  const issues = [];
  
  if (!sessionId || !gameSessions.has(sessionId)) {
    issues.push('无效的游戏会话');
    return { valid: false, issues };
  }

  const session = gameSessions.get(sessionId);
  
  if (session.completed) {
    issues.push('该会话已提交过成绩');
    return { valid: false, issues };
  }

  if (typeof clientFlips !== 'number' || isNaN(clientFlips)) {
    issues.push('翻牌次数缺失或非数字');
  }

  if (!session.startTime || session.flipCount === 0) {
    issues.push('未检测到有效翻牌记录');
  }

  const serverEndTime = Date.now();
  const serverDuration = session.startTime 
    ? Math.floor((serverEndTime - session.startTime) / 1000) 
    : 0;

  if (session.startTime && Math.abs(serverDuration - clientTime) > TIME_TOLERANCE) {
    issues.push(`客户端用时(${clientTime}s)与服务端记录(${serverDuration}s)差异过大`);
  }

  if (clientTime < MIN_GAME_TIME) {
    issues.push(`游戏时间过短(${clientTime}s < ${MIN_GAME_TIME}s)`);
  }

  if (clientTime > MAX_GAME_TIME) {
    issues.push(`游戏时间过长(${clientTime}s > ${MAX_GAME_TIME}s)`);
  }

  if (typeof clientFlips === 'number' && !isNaN(clientFlips)) {
    if (clientFlips < MIN_FLIPS) {
      issues.push(`翻牌次数过少(${clientFlips} < ${MIN_FLIPS})`);
    }

    if (clientFlips > MAX_FLIPS) {
      issues.push(`翻牌次数过多(${clientFlips} > ${MAX_FLIPS})`);
    }

    if (Math.abs(session.flipCount - clientFlips) > 2) {
      issues.push(`客户端翻牌数(${clientFlips})与服务端记录(${session.flipCount})不一致`);
    }
  }

  session.completed = true;
  session.endTime = serverEndTime;
  session.clientTime = clientTime;
  session.clientFlips = clientFlips;
  session.serverDuration = serverDuration;

  return {
    valid: issues.length === 0,
    issues,
    session
  };
}

app.post('/api/score', (req, res) => {
  const { time, playerName, sessionId, flips } = req.body;
  
  if (typeof time !== 'number' || time <= 0) {
    return res.status(400).json({ error: '无效的成绩数据' });
  }

  const validation = validateScore(sessionId, time, flips);
  const isSuspicious = !validation.valid;

  const entry = {
    id: Date.now(),
    time: time,
    playerName: playerName || '匿名玩家',
    date: new Date().toLocaleString('zh-CN'),
    flips: flips,
    serverDuration: validation.session ? validation.session.serverDuration : null,
    isSuspicious: isSuspicious,
    issues: validation.issues
  };

  let rank = null;

  if (!isSuspicious) {
    leaderboard.push(entry);
    leaderboard.sort((a, b) => a.time - b.time);
    leaderboard = leaderboard.slice(0, 10);
    rank = leaderboard.findIndex(e => e.id === entry.id) + 1;
  } else {
    suspiciousScores.push(entry);
    suspiciousScores.sort((a, b) => a.time - b.time);
    suspiciousScores = suspiciousScores.slice(0, 20);
  }

  if (gameSessions.has(sessionId)) {
    setTimeout(() => gameSessions.delete(sessionId), 1000);
  }

  res.json({
    success: true,
    rank: rank,
    isSuspicious: isSuspicious,
    issues: validation.issues,
    leaderboard: leaderboard
  });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({ leaderboard: leaderboard });
});

app.listen(PORT, () => {
  console.log(`服务器运行在 http://localhost:${PORT}`);
});
