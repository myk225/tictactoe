// client.js (polished)
const socket = io();

const roomInput = document.getElementById('room');
const nameInput = document.getElementById('name');
const joinBtn = document.getElementById('join');
const leaveBtn = document.getElementById('leave');
const rematchBtn = document.getElementById('rematch');
const status = document.getElementById('status');
const playersEl = document.getElementById('players');
const boardEl = document.getElementById('board');
const messageEl = document.getElementById('message');
const toastHolder = document.getElementById('toastHolder');

let mySymbol = null;
let myId = null;
let currentRoom = null;
let boardState = Array(9).fill(null);
let latestWinnerLine = [];

function showToast(text, timeout = 2600) {
  const id = 't' + Date.now();
  const toastHtml = document.createElement('div');
  toastHtml.innerHTML = `
    <div id="${id}" class="toast align-items-center text-bg-light border-0" role="alert" aria-live="assertive" aria-atomic="true">
      <div class="d-flex">
        <div class="toast-body">${text}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast" aria-label="Close"></button>
      </div>
    </div>`;
  toastHolder.appendChild(toastHtml.firstElementChild);
  const bsToast = new bootstrap.Toast(document.getElementById(id), { delay: timeout });
  bsToast.show();
  setTimeout(() => { try { document.getElementById(id).remove(); } catch(e){} }, timeout + 800);
}

// helper to compute winning indices (same logic as server)
function winningLine(board) {
  const lines = [
    [0,1,2],[3,4,5],[6,7,8],
    [0,3,6],[1,4,7],[2,5,8],
    [0,4,8],[2,4,6]
  ];
  for (const [a,b,c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return [a,b,c];
    }
  }
  return null;
}

function renderBoard(board) {
  boardEl.innerHTML = '';
  const winLine = winningLine(board) || [];
  latestWinnerLine = winLine;
  board.forEach((cell, idx) => {
    const div = document.createElement('div');
    const isWinCell = winLine && winLine.includes(idx);
    div.className = 'cell' + (cell ? ' disabled' : '') + (cell === 'X' ? ' x' : '') + (cell === 'O' ? ' o' : '') + (isWinCell ? ' winner' : '');
    div.textContent = cell || '';
    if (!cell && (!latestWinnerLine.length) && isMyTurn()) {
      // clickable if empty and game ongoing and my turn
      div.style.cursor = 'pointer';
    }
    div.addEventListener('click', () => {
      if (!currentRoom) return showToast('Join a room first');
      if (!isMyTurn()) return showToast('Not your turn');
      if (boardState[idx] !== null) return;
      socket.emit('make-move', { index: idx });
    });
    boardEl.appendChild(div);
  });
}

function setPlayers(players) {
  playersEl.textContent = 'Players: ' + players.map(p => `${p.name}(${p.symbol})`).join(' | ');
}

function setMessage(msg) {
  messageEl.textContent = msg || '';
}

// turn logic
function isMyTurn() {
  // when server sends room-update it includes `turn` and `status`; we track via boardState & mySymbol and message text
  // we'll infer allowed move by checking payload lastTurn variable in handler
  return mySymbol && currentTurn === mySymbol && currentStatus === 'playing';
}

let currentTurn = null;
let currentStatus = 'waiting';

joinBtn.addEventListener('click', () => {
  const roomId = (roomInput.value || 'demo').trim();
  const name = (nameInput.value || 'Guest').trim();
  if (!roomId) return alert('Enter room id');
  socket.emit('join', { roomId, name });
  currentRoom = roomId;
});

leaveBtn.addEventListener('click', () => {
  socket.emit('leave');
  currentRoom = null;
  mySymbol = null;
  myId = null;
  status.textContent = 'left';
  setMessage('');
  renderBoard(Array(9).fill(null));
  playersEl.textContent = '';
  showToast('Left room');
});

rematchBtn.addEventListener('click', () => {
  socket.emit('request-rematch');
  showToast('Rematch requested');
});

socket.on('connect', () => {
  status.textContent = 'connected';
  myId = socket.id;
});

socket.on('disconnect', () => {
  status.textContent = 'disconnected';
});

socket.on('join-error', (msg) => {
  alert(msg);
});

socket.on('room-update', (payload) => {
  // payload: players[], board[], turn, status, winner, you (optional)
  setPlayers(payload.players || []);
  boardState = payload.board || Array(9).fill(null);
  currentTurn = payload.turn;
  currentStatus = payload.status || currentStatus;
  renderBoard(boardState);

  // show messages
  if (payload.status === 'waiting') {
    setMessage('Waiting for second player...');
  } else if (payload.status === 'playing') {
    if (payload.you && payload.you.symbol) {
      mySymbol = payload.you.symbol;
    }
    if (payload.winner) {
      // winner exists: show result
      if (payload.winner === 'draw') setMessage('Game ended: Draw');
      else setMessage(`Game ended: Winner ${payload.winner}`);
      showToast(`Game Over — ${payload.winner === 'draw' ? 'Draw' : 'Winner ' + payload.winner}`, 3500);
    } else {
      setMessage(`Turn: ${payload.turn} ${payload.you ? (payload.you.symbol === payload.turn ? '(Your move)' : '') : ''}`);
    }
  } else if (payload.status === 'ended') {
    if (payload.winner === 'draw') setMessage('Game ended: Draw');
    else setMessage(`Game ended: Winner ${payload.winner}`);
  }

  // set mySymbol if server included "you"
  if (payload.you) {
    mySymbol = payload.you.symbol;
    showToast(`You are ${mySymbol}`);
  }
});

socket.on('rematch-votes', ({ votes, needed }) => {
  setMessage(`Rematch votes: ${votes}/${needed}`);
});

// helper: show toast on simple events
socket.on('info', (msg) => showToast(msg));

renderBoard(boardState);
