/**
 * CARO ONLINE - MAIN FRONTEND APPLICATION ENGINE
 * Dual Network Engine:
 * 1. Socket.io Server (Primary when Node backend runs)
 * 2. PeerJS WebRTC P2P (Fallback for Static Vercel/Netlify hosting)
 */

(function () {
  'use strict';

  // State Variables
  let socket = null;
  let peer = null;
  let peerConn = null;
  let isPeerMode = false;

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

  let soundEnabled = true;
  let turnTimerInterval = null;
  let turnTimeLeft = 30;

  // DOM Elements
  const modalWelcome = document.getElementById('modal-welcome');
  const inputPlayerName = document.getElementById('input-player-name');
  const inputRoomId = document.getElementById('input-room-id');
  const selectBoardSize = document.getElementById('select-board-size');
  const checkBlockedRule = document.getElementById('check-blocked-rule');
  const btnStartGame = document.getElementById('btn-start-game');
  const btnGenerateRoom = document.getElementById('btn-generate-room');

  const displayRoomId = document.getElementById('display-room-id');
  const btnCopyLink = document.getElementById('btn-copy-link');
  const btnSoundToggle = document.getElementById('btn-sound-toggle');
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
  const movesListContainer = document.getElementById('moves-list');
  const chatMessagesContainer = document.getElementById('chat-messages');
  const chatForm = document.getElementById('chat-form');
  const chatInput = document.getElementById('chat-input');

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

  // --- INITIALIZATION ---
  function init() {
    setupRandomPlayerName();
    parseUrlRoomId();
    setupEventListeners();
    initSocketConnection();
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
        console.log('🌐 Socket server không khả dụng. Chuyển tự động sang WebRTC PeerJS P2P!');
        socket.disconnect();
        socket = null;
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

  // --- WEBRTC PEERJS P2P ENGINE (For Vercel / Netlify Static Hosting) ---
  function initPeerJSFallback() {
    isPeerMode = true;
    updateStatusBanner('🌐 Đang khởi tạo kết nối P2P PeerJS...');
  }

  function startPeerJS(roomId, playerName, boardSize, blockedRule) {
    if (typeof Peer === 'undefined') {
      showToast('Không tải được thư viện PeerJS!', 'error');
      return;
    }

    const hostPeerId = `CARO-ROOM-${roomId}-HOST`;
    const guestPeerId = `CARO-ROOM-${roomId}-GUEST`;

    // Try becoming host first
    peer = new Peer(hostPeerId);

    peer.on('open', (id) => {
      console.log('👑 Bạn là Chủ Phòng (Quân X) P2P:', id);
      playerInfo.role = 'X';
      initPeerRoomState(roomId, boardSize, blockedRule, playerName);
      updateStatusBanner('⏳ Đang chờ người chơi 2 bấm vào Link phòng...');
      hideModal();
      updateUI();
      showToast('Đã tạo phòng P2P! Gửi link cho bạn bè để cùng chơi.');
    });

    peer.on('error', (err) => {
      if (err.type === 'unavailable-id') {
        // Host ID is taken -> We are Guest (Player O)
        console.log('🎮 Phòng đã có Chủ. Đang kết nối với tư cách Khách (Quân O)...');
        peer = new Peer(guestPeerId);

        peer.on('open', () => {
          playerInfo.role = 'O';
          peerConn = peer.connect(hostPeerId);
          setupPeerConnection(peerConn, playerName);
        });

        peer.on('error', (e) => {
          showToast('Phòng chơi đã đầy hoặc không khả dụng!', 'error');
        });
      } else {
        console.warn('PeerJS error:', err);
      }
    });

    peer.on('connection', (conn) => {
      peerConn = conn;
      console.log('🤝 Khách (Quân O) đã kết nối vào phòng!');
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
        // Send join event to Host
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
    if (roomData.status === 'ended') handleGameOver();
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
      const turnText = isMyTurn ? '🔥 ĐẾN LƯỢT BẠN ĐI!' : `Đang chờ ${roomData.turn === 'X' ? roomData.players.X?.name : roomData.players.O?.name} suy nghĩ...`;
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
    } else if (isPeerMode) {
      executeMove(r, c, playerInfo.role);
      sendPeerData({ type: 'MOVE', row: r, col: c, role: playerInfo.role });
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

  function handleGameOver() {
    if (roomData.winner === playerInfo.role) {
      playSound('win');
      triggerConfetti();
    } else if (roomData.winner === 'DRAW') {
      playSound('join');
    } else if (playerInfo.role === 'X' || playerInfo.role === 'O') {
      playSound('lose');
    }
  }

  function triggerConfetti() {
    if (typeof confetti === 'function') {
      confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
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

      if (!roomId) {
        showToast('Vui lòng nhập mã phòng!', 'error');
        return;
      }

      if (socket) {
        socket.emit('join_room', { roomId, playerName: name, boardSize, blockedRule });
      } else if (isPeerMode) {
        startPeerJS(roomId, name, boardSize, blockedRule);
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

    btnChangeName.addEventListener('click', () => {
      showModal();
    });

    btnRematch.addEventListener('click', () => {
      if (socket) {
        socket.emit('request_rematch');
      } else if (isPeerMode) {
        resetPeerGame();
        sendPeerData({ type: 'REMATCH' });
      }
    });

    btnSurrender.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn nhận đầu hàng ván này?')) {
        if (socket) {
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

      if (socket) {
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
    if (!roomId) return;
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
