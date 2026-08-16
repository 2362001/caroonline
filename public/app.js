/**
 * CARO ONLINE - MAIN FRONTEND APPLICATION ENGINE
 * Supports dual mode: Socket.io Server (Primary) & PeerJS WebRTC P2P (Fallback)
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
      socket = io();

      socket.on('connect', () => {
        console.log('⚡ Kết nối Socket.io thành công!');
        updateStatusBanner('Đã kết nối server. Sẵn sàng vào phòng!');
      });

      socket.on('connect_error', () => {
        console.warn('Không thể kết nối Socket.io server. Chuyển sang P2P PeerJS...');
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

  function initPeerJSFallback() {
    isPeerMode = true;
    console.log('🌐 Bật chế độ WebRTC P2P PeerJS');
    updateStatusBanner('Chế độ P2P PeerJS (Không dùng server)');
  }

  // --- UI UPDATER & RENDERER ---
  function updateUI() {
    // Header & Room Info
    displayRoomId.textContent = roomData.roomId || '-----';
    updateUrlRoomParam(roomData.roomId);

    // Player Cards
    namePlayerX.textContent = roomData.players.X ? roomData.players.X.name : 'Đang chờ...';
    namePlayerO.textContent = roomData.players.O ? roomData.players.O.name : 'Đang chờ...';
    scorePlayerX.textContent = roomData.players.X ? roomData.players.X.score : 0;
    scorePlayerO.textContent = roomData.players.O ? roomData.players.O.score : 0;

    // Turn Indicators
    cardPlayerX.classList.toggle('active-turn', roomData.status === 'playing' && roomData.turn === 'X');
    cardPlayerO.classList.toggle('active-turn', roomData.status === 'playing' && roomData.turn === 'O');

    // Status Banner
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

    // Action Buttons State
    const isPlayer = playerInfo.role === 'X' || playerInfo.role === 'O';
    btnRematch.disabled = !isPlayer || roomData.status !== 'ended';
    btnSurrender.disabled = !isPlayer || roomData.status !== 'playing';

    // Render Board
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

        // Highlight last move
        if (roomData.lastMove && roomData.lastMove.row === r && roomData.lastMove.col === c) {
          cell.classList.add('last-move');
        }

        // Highlight winning line
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
        // Time expired auto-switch turn or handle timeout
      }
    }, 1000);
  }

  function stopTurnTimer() {
    if (turnTimerInterval) {
      clearInterval(turnTimerInterval);
      turnTimerInterval = null;
    }
  }

  // --- GAME OVER & CELEBRATION ---
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
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 }
      });
    }
  }

  // --- CHAT SYSTEM ---
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
    // Audio initialization on first user interaction
    document.addEventListener('click', initAudio, { once: true });

    // Generate room button
    btnGenerateRoom.addEventListener('click', () => {
      inputRoomId.value = generateRandomRoomId();
    });

    // Start game button
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
      }
    });

    // Copy Invite Link Button
    btnCopyLink.addEventListener('click', () => {
      const roomId = roomData.roomId || inputRoomId.value;
      const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;

      navigator.clipboard.writeText(inviteUrl).then(() => {
        showToast('📋 Đã sao chép Link mời! Gửi link cho bạn bè để vào chơi cùng.');
      }).catch(() => {
        showToast('Mã phòng của bạn: ' + roomId);
      });
    });

    // Sound Toggle
    btnSoundToggle.addEventListener('click', () => {
      soundEnabled = !soundEnabled;
      btnSoundToggle.innerHTML = soundEnabled ? '<i class="fa-solid fa-volume-high"></i>' : '<i class="fa-solid fa-volume-xmark"></i>';
      showToast(soundEnabled ? 'Âm thanh: BẬT' : 'Âm thanh: TẮT');
    });

    // Change Name
    btnChangeName.addEventListener('click', () => {
      showModal();
    });

    // Action Buttons
    btnRematch.addEventListener('click', () => {
      if (socket) socket.emit('request_rematch');
    });

    btnSurrender.addEventListener('click', () => {
      if (confirm('Bạn có chắc chắn muốn nhận đầu hàng ván này?')) {
        if (socket) socket.emit('surrender');
      }
    });

    btnLeaveRoom.addEventListener('click', () => {
      showModal();
    });

    // Chat Form
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const msg = chatInput.value.trim();
      if (!msg) return;

      if (socket) {
        socket.emit('send_chat', { message: msg });
        chatInput.value = '';
      }
    });

    // Sidebar Tabs Switcher
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

  // Start app
  window.addEventListener('DOMContentLoaded', init);
})();
