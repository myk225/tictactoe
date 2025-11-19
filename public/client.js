// client.js
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

let mySymbol = null;
let myId = null;
let currentRoom = null;
let boardState = Array(9).fill(null);

function renderBoard(board, clickable=true) {
  boardEl.innerHTML = '';
  board.forEach((cell, idx) => {
    const div = document.createElement('div');
    div.className = 'cell' + (cell ? ' disabled' : '');
    div.textContent = cell || '';
    div.addEventListener('click', () => {
      if (!currentRoom) return alert('Join a room first');
      if (boardState[idx] !== null) return;
      // send move
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
  renderBoard(Array(9).fill(null), false);
  playersEl.textContent = '';
});

rematchBtn.addEventListener('click', () => {
  socket.emit('request-rematch');
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
  renderBoard(boardState);
  if (payload.status === 'waiting') {
    setMessage('Waiting for second player...');
  } else if (payload.status === 'playing') {
    if (!mySymbol) {
      // find my symbol by matching id (server sends "you" only at join but may not)
      // Instead infer by comparing socket id in players: server gives only names/symbols for brevity here
      // Keep mySymbol from "you" if included
    }
    const turn = payload.turn;
    setMessage((payload.winner ? '' : `Turn: ${turn}`) + (payload.winner ? ` Winner: ${payload.winner}` : ''));
  } else if (payload.status === 'ended') {
    const w = payload.winner;
    if (w === 'draw') setMessage('Game ended: Draw');
    else setMessage(`Game ended: Winner ${w}`);
  }
  // If server included "you" (only at join), set mySymbol
  if (payload.you) {
    mySymbol = payload.you.symbol;
    // show a personalized message
    setMessage(`You are ${mySymbol}. ${payload.status === 'waiting' ? 'Waiting for opponent...' : ''}`);
  }
});

socket.on('rematch-votes', ({ votes, needed }) => {
  setMessage(`Rematch votes: ${votes}/${needed}`);
});
