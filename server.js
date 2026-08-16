const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Store active game rooms
// roomId -> { boardSize, board, players: { X: { id, name, score }, O: { id, name, score } }, turn: 'X', status: 'waiting'|'playing'|'ended', winner: null, winningLine: null, blockedRule: true }
const rooms = new Map();

function createEmptyBoard(size) {
  const board = [];
  for (let r = 0; r < size; r++) {
    board.push(new Array(size).fill(null));
  }
  return board;
}

function checkWin(board, row, col, symbol, blockedRule = true) {
  const size = board.length;
  const directions = [
    [0, 1],   // Ngang
    [1, 0],   // Dọc
    [1, 1],   // Chéo chính
    [1, -1]   // Chéo phụ
  ];

  for (const [dr, dc] of directions) {
    let count = 1;
    const line = [{ row, col }];

    // Đi theo hướng dương
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
      count++;
      line.push({ row: r, col: c });
      r += dr;
      c += dc;
    }
    const headBlocked = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== null && board[r][c] !== symbol);

    // Đi theo hướng âm
    r = row - dr;
    c = col - dc;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r][c] === symbol) {
      count++;
      line.unshift({ row: r, col: c });
      r -= dr;
      c -= dc;
    }
    const tailBlocked = (r >= 0 && r < size && c >= 0 && c < size && board[r][c] !== null && board[r][c] !== symbol);

    // Luật 5 quân liên tiếp
    if (count >= 5) {
      if (blockedRule && count === 5 && headBlocked && tailBlocked) {
        // Bị chặn 2 đầu khi đủ 5 quân -> không thắng
        continue;
      }
      return line;
    }
  }

  return null;
}

function isBoardFull(board) {
  return board.every(row => row.every(cell => cell !== null));
}

io.on('connection', (socket) => {
  console.log(`[Socket] Connected: ${socket.id}`);

  socket.on('join_room', ({ roomId, playerName, boardSize = 15, blockedRule = true }) => {
    if (!roomId) return;
    roomId = roomId.toUpperCase().trim();

    socket.join(roomId);
    socket.roomId = roomId;

    if (!rooms.has(roomId)) {
      rooms.set(roomId, {
        roomId,
        boardSize: parseInt(boardSize) || 15,
        board: createEmptyBoard(parseInt(boardSize) || 15),
        players: { X: null, O: null },
        spectators: [],
        turn: 'X',
        status: 'waiting',
        winner: null,
        winningLine: null,
        blockedRule: blockedRule !== false,
        moveHistory: []
      });
    }

    const room = rooms.get(roomId);
    let role = 'SPECTATOR';

    if (!room.players.X || room.players.X.id === socket.id) {
      role = 'X';
      room.players.X = {
        id: socket.id,
        name: playerName || 'Người chơi X',
        score: room.players.X ? room.players.X.score : 0
      };
    } else if (!room.players.O || room.players.O.id === socket.id) {
      role = 'O';
      room.players.O = {
        id: socket.id,
        name: playerName || 'Người chơi O',
        score: room.players.O ? room.players.O.score : 0
      };
    } else {
      room.spectators.push({ id: socket.id, name: playerName || 'Khán giả' });
    }

    socket.role = role;

    // Check if both players are present to start game
    if (room.players.X && room.players.O && room.status === 'waiting') {
      room.status = 'playing';
    }

    // Send current state to joined user
    socket.emit('room_joined', {
      roomId: room.roomId,
      role,
      roomState: getRoomState(room)
    });

    // Notify all users in room
    io.to(roomId).emit('room_updated', getRoomState(room));
    io.to(roomId).emit('system_message', {
      text: `${role === 'SPECTATOR' ? 'Khán giả' : 'Người chơi ' + role} (${playerName || 'Vô danh'}) đã vào phòng.`
    });
  });

  socket.on('make_move', ({ row, col }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.status !== 'playing') return;
    if (socket.role !== room.turn) return; // Not your turn

    row = parseInt(row);
    col = parseInt(col);

    if (row < 0 || row >= room.boardSize || col < 0 || col >= room.boardSize) return;
    if (room.board[row][col] !== null) return; // Cell already occupied

    // Execute move
    room.board[row][col] = socket.role;
    room.moveHistory.push({ row, col, symbol: socket.role, timestamp: Date.now() });

    // Check win condition
    const winLine = checkWin(room.board, row, col, socket.role, room.blockedRule);

    if (winLine) {
      room.status = 'ended';
      room.winner = socket.role;
      room.winningLine = winLine;
      if (room.players[socket.role]) {
        room.players[socket.role].score++;
      }
    } else if (isBoardFull(room.board)) {
      room.status = 'ended';
      room.winner = 'DRAW';
    } else {
      // Switch turn
      room.turn = room.turn === 'X' ? 'O' : 'X';
    }

    io.to(roomId).emit('move_made', {
      row,
      col,
      symbol: socket.role,
      roomState: getRoomState(room)
    });
  });

  socket.on('request_rematch', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (socket.role !== 'X' && socket.role !== 'O') return;

    // Reset board
    room.board = createEmptyBoard(room.boardSize);
    room.status = (room.players.X && room.players.O) ? 'playing' : 'waiting';
    room.turn = 'X';
    room.winner = null;
    room.winningLine = null;
    room.moveHistory = [];

    io.to(roomId).emit('game_reset', getRoomState(room));
    io.to(roomId).emit('system_message', {
      text: `${socket.role === 'X' ? room.players.X?.name : room.players.O?.name} đã yêu cầu chơi lại ván mới!`
    });
  });

  socket.on('surrender', () => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.status !== 'playing') return;
    if (socket.role !== 'X' && socket.role !== 'O') return;

    const winnerRole = socket.role === 'X' ? 'O' : 'X';
    room.status = 'ended';
    room.winner = winnerRole;
    if (room.players[winnerRole]) {
      room.players[winnerRole].score++;
    }

    io.to(roomId).emit('surrender_event', {
      surrenderedRole: socket.role,
      roomState: getRoomState(room)
    });
    io.to(roomId).emit('system_message', {
      text: `Người chơi ${socket.role} đã nhận đầu hàng!`
    });
  });

  socket.on('send_chat', ({ message }) => {
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId) || !message.trim()) return;

    const room = rooms.get(roomId);
    const senderName = socket.role === 'X' 
      ? room.players.X?.name 
      : socket.role === 'O' 
      ? room.players.O?.name 
      : 'Khán giả';

    io.to(roomId).emit('chat_message', {
      sender: senderName,
      role: socket.role,
      text: message.trim(),
      time: new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    });
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Disconnected: ${socket.id}`);
    const roomId = socket.roomId;
    if (!roomId || !rooms.has(roomId)) return;

    const room = rooms.get(roomId);
    if (room.players.X && room.players.X.id === socket.id) {
      room.players.X = null;
      if (room.status === 'playing') room.status = 'waiting';
    } else if (room.players.O && room.players.O.id === socket.id) {
      room.players.O = null;
      if (room.status === 'playing') room.status = 'waiting';
    } else {
      room.spectators = room.spectators.filter(s => s.id !== socket.id);
    }

    io.to(roomId).emit('room_updated', getRoomState(room));
    io.to(roomId).emit('system_message', {
      text: `Một người chơi/khán giả đã thoát phòng.`
    });

    // Clean up room if empty
    if (!room.players.X && !room.players.O && room.spectators.length === 0) {
      rooms.delete(roomId);
    }
  });
});

function getRoomState(room) {
  return {
    roomId: room.roomId,
    boardSize: room.boardSize,
    board: room.board,
    players: room.players,
    turn: room.turn,
    status: room.status,
    winner: room.winner,
    winningLine: room.winningLine,
    blockedRule: room.blockedRule,
    moveCount: room.moveHistory.length,
    lastMove: room.moveHistory.length > 0 ? room.moveHistory[room.moveHistory.length - 1] : null
  };
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 Game Caro Online đang chạy tại http://localhost:${PORT}`);
});
