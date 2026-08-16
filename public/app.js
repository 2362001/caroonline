/**
 * CARO ONLINE - MAIN FRONTEND APPLICATION ENGINE
 * Features:
 * 1. Dual Network Engine: Socket.io Server & PeerJS WebRTC P2P (For Vercel/Netlify static hosting)
 * 2. AI Bot Mode: 3 Difficulty Levels (Easy, Medium, Hard/Pro AI)
 * 3. Undo Move (Xin đi lại nước cờ)
 * 4. AI Hint System (Gợi ý nước đi chiến thuật)
 * 5. Quick Floating Emoji Reactions Bar
 * 6. 🔥 Win Streak & Statistics System (Theo dõi chuỗi thắng, tỉ lệ thắng & Bảng Hạng)
 * 7. 🎵 Ambient Lofi BGM Synthesizer (Nhạc nền Chill êm dịu bằng Web Audio API)
 */

(function () {
  'use strict';

  // State Variables
  let socket = null;
  let peer = null;
  let peerConn = null;
  let isPeerMode = false;

  // Game Mode State
  let gameMode = 'online'; // 'online' or 'bot'
  let botDifficulty = 'medium'; // 'easy', 'medium', 'hard'
  let botTurnChoice = 'player_first'; // 'player_first' or 'bot_first'
  let botRole = 'O'; // 'O' or 'X'

  let playerInfo = {
    name: 'Cờ Thủ',
    role: null, // 'X', 'O', or 'SPECTATOR'
    score: 0
  };

  let roomData = {
    roomId: null,
    boardSize: 15,
    board: [],
    turn: 'X',
    status: 'waiting', // 'waiting', 'playing', 'ended'
    players: { X: null, O: null },
    winner: null,
    winningLine: null,
    blockedRule: true,
    lastMove: null,
    moveHistory: []
  };

  // User Stats State
  let userStats = {
    totalMatches: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    currentStreak: 0,
    maxStreak: 0
  };

  let soundEnabled = true;
  let bgmEnabled = false;
  let bgmInterval = null;
  let turnTimerInterval = null;
  let turnTimeLeft = 30;

  // DOM Elements
  const modalWelcome = document.getElementById('modal-welcome');
  const modalStats = document.getElementById('modal-stats');
  const inputPlayerName = document.getElementById('input-player-name');
  const inputRoomId = document.getElementById('input-room-id');
  const selectBoardSize = document.getElementById('select-board-size');
  const checkBlockedRule = document.getElementById('check-blocked-rule');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnGenerateRoom = document.getElementById('btn-generate-room');

  const modeBtnOnline = document.getElementById('mode-btn-online');
  const modeBtnBot = document.getElementById('mode-btn-bot');
  const groupRoomId = document.getElementById('group-room-id');
  const groupBotDifficulty = document.getElementById('group-bot-difficulty');
  const groupBotTurn = document.getElementById('group-bot-turn');
  const selectBotDifficulty = document.getElementById('select-bot-difficulty');
  const selectBotTurn = document.getElementById('select-bot-turn');

  const displayRoomId = document.getElementById('display-room-id');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
  const btnBgmToggle = document.getElementById('btn-bgm-toggle');
  const btnStatsToggle = document.getElementById('btn-stats-toggle');
  const btnCloseStats = document.getElementById('btn-close-stats');
  const btnChangeName = document.getElementById('btn-change-name');

  const cardPlayerX = document.getElementById('card-player-x');
  const cardPlayerO = document.getElementById('card-player-o');
  const namePlayerX = document.getElementById('name-player-x');
  const namePlayerO = document.getElementById('name-player-o');
  const scorePlayerX = document.getElementById('score-player-x');
  const scorePlayerO = document.getElementById('score-player-o');

  const statusBanner = document.getElementById('status-banner');
  const turnProgressBar = document.getElementById('turn-progress-bar');
  const turnTimerDisplay = document.getElementById('turn-timer');

  const boardContainer = document.getElementById('caro-board');
  const boardSection = document.querySelector('.board-section');
  const movesListContainer = document.getElementById('moves-list');
  const chatMessagesContainer = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

  const btnUndo = document.getElementById('btn-undo');
  const btnHint = document.getElementById('btn-hint');
  const btnRematch = document.getElementById('btn-rematch');
  const btnSurrender = document.getElementById('btn-surrender');
  const btnLeaveRoom = document.getElementById('btn-leave-room');

  // Audio Context (Web Audio API Synthesizer)
  let audioCtx = null;
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
  }

  function playSound(type) {
    if (!soundEnabled || !audioCtx) return;
    try {
      if (audioCtx.state === 'suspended') audioCtx.resume();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.connect(gain);
      gain.connect(audioCtx.destination);

      const now = audioCtx.currentTime;

      if (type === 'move') {
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.08);
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.08);
        osc.start(now);
        osc.stop(now + 0.08);
      } else if (type === 'win') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.15);
        osc.frequency.setValueAtTime(783.99, now + 0.3);
        osc.frequency.setValueAtTime(1046.50, now + 0.45);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.8);
        osc.start(now);
        osc.stop(now + 0.8);
      } else if (type === 'lose') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.linearRampToValueAtTime(150, now + 0.4);
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      } else if (type === 'join') {
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(900, now + 0.12);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      }
    } catch (e) {
      console.warn('Audio play error:', e);
    }
  }

  // --- AMBIENT BGM SYNTHESIZER ---
  function toggleBGM() {
    initAudio();
    bgmEnabled = !bgmEnabled;
    btnBgmToggle.classList.toggle('active', bgmEnabled);

    if (bgmEnabled) {
      startAmbientBGM();
      showToast('🎵 Nhạc nền Chill BGM: BẬT');
    } else {
      stopAmbientBGM();
      showToast('🎵 Nhạc nền BGM: TẮT');
    }
  }

  function startAmbientBGM() {
    stopAmbientBGM();
    const chords = [
      [261.63, 329.63, 392.00, 493.88], // Cmaj7
      [220.00, 261.63, 329.63, 392.00], // Am7
      [293.66, 349.23, 440.00, 523.25], // Dm7
      [196.00, 246.94, 293.66, 349.23]  // G7
    ];
    let chordIdx = 0;

    function playChord() {
      if (!bgmEnabled || !audioCtx) return;
      try {
        if (audioCtx.state === 'suspended') audioCtx.resume();
        const now = audioCtx.currentTime;
        const currentChord = chords[chordIdx];
        chordIdx = (chordIdx + 1) % chords.length;

        currentChord.forEach(freq => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);

          gain.gain.setValueAtTime(0.001, now);
          gain.gain.linearRampToValueAtTime(0.025, now + 1.2);
          gain.gain.linearRampToValueAtTime(0.001, now + 4.5);

          osc.connect(gain);
          gain.connect(audioCtx.destination);
          osc.start(now);
          osc.stop(now + 4.6);
        });
      } catch (e) {
        console.warn('BGM error:', e);
      }
    }

    playChord();
    bgmInterval = setInterval(playChord, 4600);
  }

  function stopAmbientBGM() {
    if (bgmInterval) {
      clearInterval(bgmInterval);
      bgmInterval = null;
    }
  }

  // --- INITIALIZATION ---
  function init() {
    loadUserStats();
    setupRandomPlayerName();
    parseUrlRoomId();
    setupEventListeners();
    initSocketConnection();
  }

  function loadUserStats() {
    const saved = localStorage.getItem('caro_user_stats');
    if (saved) {
      try {
        userStats = JSON.parse(saved);
      } catch (e) {}
    }
  }

  function saveUserStats() {
    localStorage.setItem('caro_user_stats', JSON.stringify(userStats));
  }

  function setupRandomPlayerName() {
    const savedName = localStorage.getItem('caro_player_name');
    if (savedName) {
      playerInfo.name = savedName;
    } else {
      const randId = Math.floor(Math.random() * 900) + 100;
      playerInfo.name = `Cờ Thủ #${randId}`;
    }
    inputPlayerName.value = playerInfo.name;
  }

  function generateRandomRoomId() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  function parseUrlRoomId() {
    const urlParams = new URLSearchParams(window.location.search);
    let roomParam = urlParams.get('room') || window.location.hash.replace('#', '');
    if (roomParam) {
      inputRoomId.value = roomParam.toUpperCase().trim();
    } else {
      inputRoomId.value = generateRandomRoomId();
    }
  }

  // --- SOCKET & NETWORK ENGINE ---
  function initSocketConnection() {
    if (typeof io !== 'undefined') {
      socket = io({
        timeout: 2500,
        reconnectionAttempts: 1
      });

      socket.on('connect', () => {
        console.log('⚡ Kết nối Socket.io server thành công!');
        updateStatusBanner('Đã kết nối Socket Server!');
      });

      socket.on('connect_error', () => {
        console.log('🌐 Socket server không khả dụng. Chuyển sang P2P PeerJS / AI Bot Mode');
        if (socket) {
          socket.disconnect();
          socket = null;
        }
        initPeerJSFallback();
      });

      socket.on('room_joined', (data) => {
        playerInfo.role = data.role;
        roomData = data.roomState;
        updateUI();
        hideModal();
        showToast(`Bạn đã vào phòng với tư cách ${data.role === 'SPECTATOR' ? 'Khán giả' : 'Người chơi ' + data.role}`);
        playSound('join');
      });

      socket.on('room_updated', (newRoomState) => {
        roomData = newRoomState;
        updateUI();
      });

      socket.on('move_made', (data) => {
        roomData = data.roomState;
        playSound('move');
        updateUI();
        if (roomData.status === 'ended') {
          handleGameOver();
        }
      });

      socket.on('game_reset', (newRoomState) => {
        roomData = newRoomState;
        updateUI();
        showToast('Ván cờ mới đã bắt đầu!');
        playSound('join');
      });

      socket.on('surrender_event', (data) => {
        roomData = data.roomState;
        updateUI();
        handleGameOver();
      });

      socket.on('undo_requested', (data) => {
        if (confirm(`Đối thủ (${data.requesterName}) xin rút lại nước đi trước. Bạn có đồng ý không?`)) {
          socket.emit('accept_undo');
        } else {
          showToast('Bạn đã từ chối yêu cầu đi lại của đối thủ.');
        }
      });

      socket.on('emoji_reaction', (data) => {
        spawnFloatingEmoji(data.emoji);
        playSound('move');
      });

      socket.on('chat_message', (msg) => {
        appendChatMessage(msg);
      });

      socket.on('system_message', (msg) => {
        appendSystemMessage(msg.text);
      });
    } else {
      initPeerJSFallback();
    }
  }

  function initPeerJSFallback() {
    isPeerMode = true;
    updateStatusBanner('🌐 Chế độ WebRTC P2P / Đấu AI sẵn sàng');
  }

  // --- AI BOT MODE ENGINE ---
  function startBotGame(playerName, boardSize, difficulty, turnChoice, blockedRule) {
    gameMode = 'bot';
    botDifficulty = difficulty;
    botTurnChoice = turnChoice;
    boardSize = parseInt(boardSize) || 15;

    const isPlayerFirst = turnChoice === 'player_first';
    playerInfo.role = isPlayerFirst ? 'X' : 'O';
    botRole = isPlayerFirst ? 'O' : 'X';

    const diffText = difficulty === 'easy' ? 'Dễ' : difficulty === 'medium' ? 'Trung Bình' : 'Khó (Siêu AI)';
    const botName = `🤖 Máy AI (${diffText})`;

    roomData = {
      roomId: 'VS-AI-BOT',
      boardSize,
      board: createEmptyBoard(boardSize),
      players: {
        X: { name: isPlayerFirst ? playerName : botName, score: 0 },
        O: { name: isPlayerFirst ? botName : playerName, score: 0 }
      },
      turn: 'X',
      status: 'playing',
      winner: null,
      winningLine: null,
      blockedRule: blockedRule !== false,
      lastMove: null,
      moveHistory: []
    };

    hideModal();
    updateUI();
    showToast(`Đã bắt đầu đấu với Máy (${diffText})!`);
    playSound('join');
    appendSystemMessage(`Bắt đầu trận đấu với Máy AI (${diffText})!`);

    if (!isPlayerFirst) {
      triggerBotTurn();
    }
  }

  function triggerBotTurn() {
    if (roomData.status !== 'playing' || roomData.turn !== botRole) return;

    updateStatusBanner('🤖 Máy AI đang tính toán...', 'warning');

    setTimeout(() => {
      const bestMove = calculateBestBotMove(roomData.board, botRole, botDifficulty, roomData.blockedRule);
      if (bestMove) {
        executeMove(bestMove.row, bestMove.col, botRole);
      }
    }, 450);
  }

  // --- CARO AI BOT HEURISTIC ALGORITHM ---
  function calculateBestBotMove(board, aiSymbol, difficulty, blockedRule) {
    const size = board.length;
    const humanSymbol = aiSymbol === 'X' ? 'O' : 'X';

    const candidates = [];
    let hasAnyMove = false;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        if (board[r][c] !== null) {
          hasAnyMove = true;
        } else {
          let isNear = false;
          for (let dr = -2; dr <= 2 && !isNear; dr++) {
            for (let dc = -2; dc <= 2 && !isNear; dc++) {
              if (dr === 0 && dc === 0) continue;
              const nr = r + dr, nc = c + dc;
              if (nr >= 0 && nr < size && nc >= 0 && nc < size && board[nr][nc] !== null) {
                isNear = true;
              }
            }
          }
          if (isNear) candidates.push({ row: r, col: c });
        }
      }
    }

    if (!hasAnyMove || candidates.length === 0) {
      const center = Math.floor(size / 2);
      return { row: center, col: center };
    }

    if (difficulty === 'easy' && Math.random() < 0.25) {
      return candidates[Math.floor(Math.random() * candidates.length)];
    }

    let bestScore = -Infinity;
    let bestMove = candidates[0];

    const defenseWeight = difficulty === 'hard' ? 1.25 : difficulty === 'medium' ? 0.95 : 0.6;

    for (const pos of candidates) {
      board[pos.row][pos.col] = aiSymbol;
      const attackScore = evaluateCellScore(board, pos.row, pos.col, aiSymbol, blockedRule);
      board[pos.row][pos.col] = null;

      board[pos.row][pos.col] = humanSymbol;
      const defenseScore = evaluateCellScore(board, pos.row, pos.col, humanSymbol, blockedRule);
      board[pos.row][pos.col] = null;

      let score = attackScore + (defenseScore * defenseWeight);

      if (difficulty === 'easy') {
        score += Math.random() * 200;
      } else if (difficulty === 'medium') {
        score += Math.random() * 20;
      }

      if (score > bestScore) {
        bestScore = score;
        bestMove = pos;
      }
    }

    return bestMove;
  }

  function evaluateCellScore(board, row, col, symbol, blockedRule) {
    const size = board.length;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];
    let totalScore = 0;

    for (const [dr, dc] of directions) {
      let count = 1;
      let r = row + dr, c = col + dc;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
        count++; r += dr; c += dc;
      }
      const headOpen = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null);

      r = row - dr; c = col - dc;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
        count++; r -= dr; c -= dc;
      }
      const tailOpen = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === null);

      const openEnds = (headOpen ? 1 : 0) + (tailOpen ? 1 : 0);

      if (count >= 5) {
        if (blockedRule && count === 5 && openEnds === 0) continue;
        totalScore += 100000;
      } else if (count === 4) {
        if (openEnds === 2) totalScore += 20000;
        else if (openEnds === 1) totalScore += 4000;
      } else if (count === 3) {
        if (openEnds === 2) totalScore += 5000;
        else if (openEnds === 1) totalScore += 800;
      } else if (count === 2) {
        if (openEnds === 2) totalScore += 300;
        else if (openEnds === 1) totalScore += 50;
      }
    }

    return totalScore;
  }

  // --- WEBRTC PEERJS P2P ENGINE ---
  function startPeerJS(roomId, playerName, boardSize, blockedRule) {
    if (typeof Peer === 'undefined') {
      showToast('Không tải được thư viện PeerJS!', 'error');
      return;
    }

    const hostPeerId = `CARO-ROOM-${roomId}-HOST`;
    const guestPeerId = `CARO-ROOM-${roomId}-GUEST`;

    peer = new Peer(hostPeerId);

    peer.on('open', (id) => {
      console.log('👑 Chủ Phòng (Quân X) P2P:', id);
      playerInfo.role = 'X';
      initPeerRoomState(roomId, boardSize, blockedRule, playerName);
      updateStatusBanner('⏳ Đang chờ người chơi 2 bấm vào Link phòng...');
      hideModal();
      updateUI();
      showToast('Đã tạo phòng P2P! Gửi link cho bạn bè để cùng chơi.');
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        peer = new Peer(guestPeerId);
        peer.on('open', () => {
          playerInfo.role = 'O';
          peerConn = peer.connect(hostPeerId);
          setupPeerConnection(peerConn, playerName);
        });
      } else {
        console.warn('PeerJS error:', err);
      }
    });

    peer.on('connection', (conn) => {
      peerConn = conn;
      setupPeerConnection(conn, playerName);
    });
  }

  function initPeerRoomState(roomId, boardSize, blockedRule, hostName) {
    boardSize = parseInt(boardSize) || 15;
    roomData = {
      roomId,
      boardSize,
      board: createEmptyBoard(boardSize),
      players: { X: { name: hostName, score: 0 }, O: null },
      turn: 'X',
      status: 'waiting',
      winner: null,
      winningLine: null,
      blockedRule: blockedRule !== false,
      lastMove: null,
      moveHistory: []
    };
  }

  function setupPeerConnection(conn, myName) {
    conn.on('open', () => {
      hideModal();
      if (playerInfo.role === 'O') {
        conn.send({ type: 'JOIN', name: myName });
      }
    });

    conn.on('data', (data) => {
      handlePeerData(data);
    });

    conn.on('close', () => {
      showToast('Đối thủ đã ngắt kết nối!', 'error');
      roomData.status = 'waiting';
      updateUI();
    });
  }

  function handlePeerData(data) {
    if (data.type === 'JOIN') {
      roomData.players.O = { name: data.name, score: 0 };
      roomData.status = 'playing';
      updateUI();
      playSound('join');
      sendPeerState();
      appendSystemMessage(`Người chơi O (${data.name}) đã vào phòng!`);
    } else if (data.type === 'SYNC_STATE') {
      roomData = data.roomState;
      updateUI();
    } else if (data.type === 'MOVE') {
      executeMove(data.row, data.col, data.role);
    } else if (data.type === 'CHAT') {
      appendChatMessage(data);
    } else if (data.type === 'REMATCH') {
      resetPeerGame();
    } else if (data.type === 'SURRENDER') {
      handlePeerSurrender(data.role);
    } else if (data.type === 'REQUEST_UNDO') {
      if (confirm(`Đối thủ xin rút lại nước đi vừa rồi. Bạn có đồng ý không?`)) {
        undoLastMoves();
        sendPeerData({ type: 'ACCEPT_UNDO' });
      }
    } else if (data.type === 'ACCEPT_UNDO') {
      undoLastMoves();
      showToast('Đối thủ đã đồng ý cho bạn rút lại nước đi!');
    } else if (data.type === 'EMOJI') {
      spawnFloatingEmoji(data.emoji);
      playSound('move');
    }
  }

  function sendPeerData(data) {
    if (peerConn && peerConn.open) {
      peerConn.send(data);
    }
  }

  function sendPeerState() {
    sendPeerData({ type: 'SYNC_STATE', roomState: roomData });
  }

  function executeMove(row, col, role) {
    if (roomData.board[row][col] !== null) return;
    roomData.board[row][col] = role;
    roomData.lastMove = { row, col };
    roomData.moveHistory.push({ row, col, symbol: role });

    const winLine = checkWin(roomData.board, row, col, role, roomData.blockedRule);
    if (winLine) {
      roomData.status = 'ended';
      roomData.winner = role;
      roomData.winningLine = winLine;
      if (roomData.players[role]) roomData.players[role].score++;
    } else if (isBoardFull(roomData.board)) {
      roomData.status = 'ended';
      roomData.winner = 'DRAW';
    } else {
      roomData.turn = role === 'X' ? 'O' : 'X';
    }

    playSound('move');
    updateUI();

    if (roomData.status === 'ended') {
      handleGameOver();
    } else if (gameMode === 'bot' && roomData.turn === botRole) {
      triggerBotTurn();
    }
  }

  // --- UNDO MOVE FEATURE ---
  function handleUndoRequest() {
    if (roomData.status !== 'playing' || roomData.moveHistory.length === 0) return;

    if (gameMode === 'bot') {
      undoLastMoves();
      showToast('⏪ Đã rút lại nước cờ trước!');
    } else if (socket) {
      socket.emit('request_undo');
      showToast('⏳ Đã gửi yêu cầu đi lại tới đối thủ...');
    } else if (isPeerMode) {
      sendPeerData({ type: 'REQUEST_UNDO' });
      showToast('⏳ Đã gửi yêu cầu đi lại tới đối thủ...');
    }
  }

  function undoLastMoves() {
    if (roomData.moveHistory.length === 0) return;

    const popCount = (gameMode === 'bot' || roomData.moveHistory.length >= 2) ? 2 : 1;
    for (let i = 0; i < popCount; i++) {
      const last = roomData.moveHistory.pop();
      if (last) {
        roomData.board[last.row][last.col] = null;
      }
    }

    roomData.lastMove = roomData.moveHistory.length > 0 ? roomData.moveHistory[room.moveHistory.length - 1] : null;
    roomData.turn = playerInfo.role;
    updateUI();
  }

  // --- AI HINT FEATURE ---
  function handleAIHint() {
    if (roomData.status !== 'playing' || playerInfo.role !== roomData.turn) {
      showToast('Chỉ có thể lấy gợi ý khi đến lượt của bạn!', 'error');
      return;
    }

    const hint = calculateBestBotMove(roomData.board, playerInfo.role, 'hard', roomData.blockedRule);
    if (hint) {
      const cells = boardContainer.querySelectorAll('.cell');
      cells.forEach(cell => {
        if (parseInt(cell.dataset.row) === hint.row && parseInt(cell.dataset.col) === hint.col) {
          cell.classList.add('hint-cell');
          setTimeout(() => cell.classList.remove('hint-cell'), 3500);
        }
      });
      showToast(`💡 Gợi ý nước đi ngon: Hàng ${hint.row + 1}, Cột ${hint.col + 1}`);
      playSound('join');
    }
  }

  // --- FLOATING EMOJI ANIMATION ---
  function spawnFloatingEmoji(emoji) {
    const el = document.createElement('div');
    el.className = 'floating-emoji';
    el.textContent = emoji;

    const leftOffset = Math.floor(Math.random() * 60) + 20;
    el.style.left = `${leftOffset}%`;
    el.style.bottom = '40px';

    boardSection.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  // --- GAME OVER & STATS UPDATER ---
  function handleGameOver() {
    if (playerInfo.role === 'X' || playerInfo.role === 'O') {
      userStats.totalMatches++;

      if (roomData.winner === playerInfo.role) {
        userStats.wins++;
        userStats.currentStreak++;
        userStats.maxStreak = Math.max(userStats.maxStreak, userStats.currentStreak);
        playSound('win');
        triggerConfetti();
      } else if (roomData.winner === 'DRAW') {
        userStats.draws++;
        playSound('join');
      } else {
        userStats.losses++;
        userStats.currentStreak = 0;
        playSound('lose');
      }
      saveUserStats();
    }
  }

  function renderStatsUI() {
    const total = userStats.totalMatches;
    const wins = userStats.wins;
    const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

    document.getElementById('stats-streak-current').textContent = `${userStats.currentStreak} 🔥`;
    document.getElementById('stats-streak-max').textContent = `${userStats.maxStreak} 🏆`;
    document.getElementById('stats-win-rate').textContent = `${winRate}%`;
    document.getElementById('stats-total-matches').textContent = total;

    document.getElementById('stats-wins').textContent = userStats.wins;
    document.getElementById('stats-losses').textContent = userStats.losses;
    document.getElementById('stats-draws').textContent = userStats.draws;

    // Calculate Rank Title
    let rankIcon = '🌱';
    let rankName = '🌱 Cờ Thủ Tập Sự';

    if (wins >= 25 || userStats.maxStreak >= 10) {
      rankIcon = '👑';
      rankName = '👑 Thần Cờ Gomoku';
    } else if (wins >= 10 || userStats.maxStreak >= 5) {
      rankIcon = '🔥';
      rankName = '🔥 Đại Sư Bàn Cờ';
    } else if (wins >= 3 || userStats.maxStreak >= 2) {
      rankIcon = '⚡';
      rankName = '⚡ Cao Thủ Caro';
    }

    document.getElementById('stats-rank-icon').textContent = rankIcon;
    document.getElementById('stats-rank-name').textContent = rankName;
  }

  function triggerConfetti() {
    if (typeof confetti === 'function') {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    }
  }

  function resetPeerGame() {
    roomData.board = createEmptyBoard(roomData.boardSize);
    roomData.status = 'playing';
    roomData.turn = 'X';
    roomData.winner = null;
    roomData.winningLine = null;
    roomData.lastMove = null;
    roomData.moveHistory = [];
    updateUI();
    showToast('Ván mới đã bắt đầu!');
    playSound('join');

    if (gameMode === 'bot' && botTurnChoice === 'bot_first') {
      triggerBotTurn();
    }
  }

  function handlePeerSurrender(role) {
    const winnerRole = role === 'X' ? 'O' : 'X';
    roomData.status = 'ended';
    roomData.winner = winnerRole;
    if (roomData.players[winnerRole]) roomData.players[winnerRole].score++;
    updateUI();
    handleGameOver();
    appendSystemMessage(`Người chơi ${role} đã nhận đầu hàng!`);
  }

  function createEmptyBoard(size) {
    const board = [];
    for (let r = 0; r < size; r++) {
      board.push(new Array(size).fill(null));
    }
    return board;
  }

  function checkWin(board, row, col, symbol, blockedRule = true) {
    const size = board.length;
    const directions = [[0, 1], [1, 0], [1, 1], [1, -1]];

    for (const [dr, dc] of directions) {
      let count = 1;
      const line = [{ row, col }];

      let r = row + dr, c = col + dc;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
        count++; line.push({ row: r, col: c }); r += dr; c += dc;
      }
      const headBlocked = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== null && board[r][c] !== symbol);

      r = row - dr; c = col - dc;
      while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
        count++; line.unshift({ row: r, col: c }); r -= dr; c -= dc;
      }
      const tailBlocked = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== null && board[r][c] !== symbol);

      if (count >= 5) {
        if (blockedRule && count === 5 && headBlocked && tailBlocked) continue;
        return line;
      }
    }
    return null;
  }

  function isBoardFull(board) {
    return board.every(row => row.every(cell => cell !== null));
  }

  // --- UI UPDATER & RENDERER ---
  function updateUI() {
    displayRoomId.textContent = roomData.roomId || '-----';
    updateUrlRoomParam(roomData.roomId);

    namePlayerX.textContent = roomData.players.X ? roomData.players.X.name : 'Đang chờ...';
    namePlayerO.textContent = roomData.players.O ? roomData.players.O.name : 'Đang chờ...';
    scorePlayerX.textContent = roomData.players.X ? roomData.players.X.score : 0;
    scorePlayerO.textContent = roomData.players.O ? roomData.players.O.score : 0;

    cardPlayerX.classList.toggle('active-turn', roomData.status === 'playing' && roomData.turn === 'X');
    cardPlayerO.classList.toggle('active-turn', roomData.status === 'playing' && roomData.turn === 'O');

    if (roomData.status === 'waiting') {
      updateStatusBanner('⏳ Đang chờ đối thủ vào phòng qua Link...', 'warning');
      stopTurnTimer();
    } else if (roomData.status === 'playing') {
      const isMyTurn = playerInfo.role === roomData.turn;
      let turnText = isMyTurn ? '🔥 ĐẾN LƯỢT BẠN ĐI!' : `Đang chờ ${roomData.turn === 'X' ? roomData.players.X?.name : roomData.players.O?.name} suy nghĩ...`;
      if (gameMode === 'bot' && !isMyTurn) {
        turnText = '🤖 Máy AI đang tính toán nước đi...';
      }
      updateStatusBanner(turnText, isMyTurn ? 'my-turn' : 'normal');
      startTurnTimer();
    } else if (roomData.status === 'ended') {
      stopTurnTimer();
      if (roomData.winner === 'DRAW') {
        updateStatusBanner('🤝 HÒA CỜ! Bàn cờ đã đầy.', 'draw');
      } else {
        const winnerName = roomData.winner === 'X' ? roomData.players.X?.name : roomData.players.O?.name;
        const isIWin = playerInfo.role === roomData.winner;
        updateStatusBanner(isIWin ? '🎉 BẠN ĐÃ CHIẾN THẮNG!' : `🏆 ${winnerName} (${roomData.winner}) ĐÃ THẮNG!`, isIWin ? 'win' : 'lose');
      }
    }

    const isPlayer = playerInfo.role === 'X' || playerInfo.role === 'O';
    btnUndo.disabled = !isPlayer || roomData.status !== 'playing' || roomData.moveHistory.length === 0;
    btnRematch.disabled = !isPlayer || roomData.status !== 'ended';
    btnSurrender.disabled = !isPlayer || roomData.status !== 'playing';

    renderBoard();
    renderMovesList();
  }

  function updateStatusBanner(text, type = 'normal') {
    statusBanner.innerHTML = text;
    statusBanner.className = 'status-banner ' + type;
  }

  function renderBoard() {
    const size = roomData.boardSize || 15;
    boardContainer.innerHTML = '';
    boardContainer.className = `board board-${size}x${size}`;
    boardContainer.style.gridTemplateColumns = `repeat(${size}, 1fr)`;

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.row = r;
        cell.dataset.col = c;

        const val = roomData.board[r] ? roomData.board[r][c] : null;
        if (val) {
          cell.textContent = val;
          cell.classList.add(val === 'X' ? 'cell-x' : 'cell-o', 'occupied');
        }

        if (roomData.lastMove && roomData.lastMove.row === r && roomData.lastMove.col === c) {
          cell.classList.add('last-move');
        }

        if (roomData.winningLine) {
          const isWinCell = roomData.winningLine.some(item => item.row === r && item.col === c);
          if (isWinCell) cell.classList.add('winning-cell');
        }

        cell.addEventListener('click', () => handleCellClick(r, c));
        boardContainer.appendChild(cell);
      }
    }
  }

  function handleCellClick(r, c) {
    if (roomData.status !== 'playing') return;
    if (playerInfo.role !== roomData.turn) {
      showToast('Chưa đến lượt của bạn!', 'error');
      return;
    }
    if (roomData.board[r][c] !== null) return;

    if (socket) {
      socket.emit('make_move', { row: r, col: c });
    } else {
      executeMove(r, c, playerInfo.role);
      if (isPeerMode && gameMode === 'online') {
        sendPeerData({ type: 'MOVE', row: r, col: c, role: playerInfo.role });
      }
    }
  }

  function renderMovesList() {
    if (!roomData.moveHistory || roomData.moveHistory.length === 0) {
      movesListContainer.innerHTML = '<div class="empty-moves">Chưa có nước đi nào</div>';
      return;
    }

    movesListContainer.innerHTML = roomData.moveHistory.map((m, index) => `
      <div class="move-item">
        <span>#${index + 1} - Lượt ${m.symbol}</span>
        <span>Hàng ${m.row + 1}, Cột ${m.col + 1}</span>
      </div>
    `).reverse().join('');
  }

  // --- TURN TIMER ---
  function startTurnTimer() {
    stopTurnTimer();
    turnTimeLeft = 30;
    turnTimerDisplay.textContent = turnTimeLeft;
    turnProgressBar.style.width = '100%';

    turnTimerInterval = setInterval(() => {
      turnTimeLeft--;
      turnTimerDisplay.textContent = turnTimeLeft;
      turnProgressBar.style.width = `${(turnTimeLeft / 30) * 100}%`;

      if (turnTimeLeft <= 0) {
        stopTurnTimer();
      }
    }, 1000);
  }

  function stopTurnTimer() {
    if (turnTimerInterval) {
      clearInterval(turnTimerInterval);
      turnTimerInterval = null;
    }
  }

  function appendChatMessage({ sender, role, text, time }) {
    const div = document.createElement('div');
    div.className = `chat-bubble role-${role}`;
    div.innerHTML = `
      <span class="chat-sender">${sender || 'Vô danh'}</span>
      ${escapeHtml(text)}
      <span class="chat-time">${time}</span>
    `;
    chatMessagesContainer.appendChild(div);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function appendSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-msg';
    div.textContent = text;
    chatMessagesContainer.appendChild(div);
    chatMessagesContainer.scrollTop = chatMessagesContainer.scrollHeight;
  }

  function escapeHtml(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // --- EVENT LISTENERS ---
  function setupEventListeners() {
    document.addEventListener('click', initAudio, { once: true });

    modeBtnOnline.addEventListener('click', () => {
      gameMode = 'online';
      modeBtnOnline.classList.add('active');
      modeBtnBot.classList.remove('active');
      groupRoomId.classList.remove('hidden');
      groupBotDifficulty.classList.add('hidden');
      groupBotTurn.classList.add('hidden');
    });

    modeBtnBot.addEventListener('click', () => {
      gameMode = 'bot';
      modeBtnBot.classList.add('active');
      modeBtnOnline.classList.remove('active');
      groupRoomId.classList.add('hidden');
      groupBotDifficulty.classList.remove('hidden');
      groupBotTurn.classList.remove('hidden');
    });

    btnGenerateRoom.addEventListener('click', () => {
      inputRoomId.value = generateRandomRoomId();
    });

    btnStartGame.addEventListener('click', () => {
      const name = inputPlayerName.value.trim() || 'Cờ Thủ';
      const roomId = inputRoomId.value.trim().toUpperCase();
      const boardSize = selectBoardSize.value;
      const blockedRule = checkBlockedRule.checked;

      playerInfo.name = name;
      localStorage.setItem('caro_player_name', name);

      if (gameMode === 'bot') {
        const difficulty = selectBotDifficulty.value;
        const turnChoice = selectBotTurn.value;
        startBotGame(name, boardSize, difficulty, turnChoice, blockedRule);
      } else {
        if (!roomId) {
          showToast('Vui lòng nhập mã phòng!', 'error');
          return;
        }

        if (socket) {
          socket.emit('join_room', { roomId, playerName: name, boardSize, blockedRule });
        } else {
          startPeerJS(roomId, name, boardSize, blockedRule);
        }
      }
    });

    btnCopyLink.addEventListener('click', () => {
      const roomId = roomData.roomId || inputRoomId.value;
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

      navigator.clipboard.writeText(inviteUrl).then(() => {
        showToast('📋 Đã sao chép Link mời! Gửi link cho bạn bè để vào chơi cùng.');
      }).catch(() => {
        showToast('Mã phòng của bạn: ' + roomId);
      });
    });

    btnSoundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnSoundToggle.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
      showToast(soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT');
    });

    btnBgmToggle.addEventListener('click', toggleBGM);

    btnStatsToggle.addEventListener('click', () => {
      renderStatsUI();
      modalStats.classList.remove('hidden');
    });

    btnCloseStats.addEventListener('click', () => {
      modalStats.classList.add('hidden');
    });

    btnChangeName.addEventListener('click', () => {
      showModal();
    });

    btnUndo.addEventListener('click', handleUndoRequest);
    btnHint.addEventListener('click', handleAIHint);

    document.querySelectorAll('.emoji-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const emoji = btn.dataset.emoji;
        spawnFloatingEmoji(emoji);
        playSound('move');

        if (socket && gameMode === 'online') {
          socket.emit('send_emoji', { emoji });
        } else if (isPeerMode && gameMode === 'online') {
          sendPeerData({ type: 'EMOJI', emoji });
        }
      });
    });

    btnRematch.addEventListener('click', () => {
      if (gameMode === 'bot') {
        resetPeerGame();
      } else if (socket) {
        socket.emit('request_rematch');
      } else if (isPeerMode) {
        resetPeerGame();
        sendPeerData({ type: 'REMATCH' });
      }
    });

    btnSurrender.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn nhận đầu hàng ván này?')) {
        if (gameMode === 'bot') {
          handlePeerSurrender(playerInfo.role);
        } else if (socket) {
          socket.emit('surrender');
        } else if (isPeerMode) {
          handlePeerSurrender(playerInfo.role);
          sendPeerData({ type: 'SURRENDER', role: playerInfo.role });
        }
      }
    });

    btnLeaveRoom.addEventListener('click', () => {
      showModal();
    });

    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (!msg) return;

      const time = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
      const chatPayload = { sender: playerInfo.name, role: playerInfo.role, text: msg, time };

      if (gameMode === 'bot') {
        appendChatMessage(chatPayload);
        if (Math.random() < 0.4) {
          setTimeout(() => {
            const botReplies = ['Nước đi hay đấy!', 'Thử sức với tôi xem!', 'Tập trung nhé!', 'Chúc may mắn!'];
            const reply = botReplies[Math.floor(Math.random() * botReplies.length)];
            appendChatMessage({ sender: '🤖 Máy AI', role: botRole, text: reply, time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) });
          }, 800);
        }
      } else if (socket) {
        socket.emit('send_chat', { message: msg });
      } else if (isPeerMode) {
        appendChatMessage(chatPayload);
        sendPeerData({ type: 'CHAT', ...chatPayload });
      }
      chatInput.value = '';
    });

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.tab).classList.add('active');
      });
    });
  }

  function updateUrlRoomParam(roomId) {
    if (!roomId || gameMode === 'bot') return;
    const newUrl = `${window.location.pathname}?room=${roomId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
  }

  function showModal() {
    modalWelcome.classList.remove('hidden');
  }

  function hideModal() {
    modalWelcome.classList.add('hidden');
  }

  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
      toast.remove();
    }, 3500);
  }

  window.addEventListener('DOMContentLoaded', init);
})();
