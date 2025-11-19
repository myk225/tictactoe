const express=require('express');
const http=require('http');
const {Server} = require('socket.io');

const app= express();
app.use(express.static('public'));

const server=http.createServer(app);
//usually named io
const socketServerMain=new Server(server,{cors:{origin:"*"}});

const rooms={}

function createRoomIfMissing(roomId){
    if(!rooms[roomId]){
        rooms[roomId]={
            players:{},
            board: Array(9).fill(null),
            turn : "X",
            status: "waiting",
            winner : null,
            rematchVotes:{}
        };

    }
    return rooms[roomId];
}

function checkWinner(board){
    const lines = [
        [0,1,2],[3,4,5],[6,7,8],
        [0,3,6],[1,4,7],[2,5,8],
        [0,4,8],[2,4,6]
      ];

      for (const [a,b,c] of lines) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
          return board[a]; // 'X' or 'O'
        }
      }
      if (board.every(cell => cell !== null)) return 'draw';
      return null;
}

socketServerMain.on("connection",(socket)=>{
    console.log('connection established',socket.id);
    socket.on('join',({roomId,name})=>{
        roomId=String((roomId||'')).trim() || 'default';
        name=String((name||"Player")).trim();
        const room=createRoomIfMissing(roomId);

        //if room already has two members , throw error
        if(Object.keys(room.players).length >=2){
            socket.emit("join-error","Room Full");
            return;
        }
        //assign symbol
        const assigned=Object.values(room.players).map(p=>p.symbol);
        const symbol=assigned.includes('X') ? 'O' : 'X';
        room.players[socket.id] = {symbol,name};
        socket.join(roomId);
        socket.data.roomId=roomId;
        //update status
        if(Object.keys(room.players).length == 2){
            room.status="playing";
            room.board = Array(9).fill(null);
            room.turn = 'X';
            room.winner = null;
            room.rematchVotes = {};
        }

        //send room state to everyone here 2 members
        socketServerMain.in(roomId).emit("room-update",{
            players: Object.values(room.players).map(p => ({ name: p.name, symbol: p.symbol })),
            board: room.board,
            turn: room.turn,
            status: room.status,
            you: { id: socket.id, symbol }
        })
        //
        console.log(`[${roomId}] ${name} joined as ${symbol}`);
    })

    // make move
    socket.on('make-move',({index})=>{
        const roomId=socket.data.roomId;
        if(!roomId) return;
        const room=rooms[roomId];
        if(!room) return;
        const player=room.players[socket.id];
        if(!player) return;

        if(room.status != 'playing') return;
        if(player.symbol !== room.turn) return;
        if(index < 0 || index>8) return;
        if(room.board[index] !== null) return;

        // apply move
        room.board[index]=player.symbol;
        const win=checkWinner(room.board);
        if(win){
            room.status="ended";
            room.winner=win;
        }else{
            room.turn=room.turn === "X" ? "O" : "X";
        }
        //send update 
        socketServerMain.in(roomId).emit('room-update',{
            players: Object.values(room.players).map(p => ({ name: p.name, symbol: p.symbol })),
            board: room.board,
            turn: room.turn,
            status: room.status,
            winner: room.winner
        })
    })

    //
    socket.on("request-rematch",()=>{
        const roomId=socket.data.roomId;
        if(!roomId) return;
        const room=rooms[roomId];
        if(!room) return;
        room.rematchVotes[socket.id] = true;
        //if all players request rematch or reset button is pressed
        const playerCount = Object.keys(room.players).length;
        const votes=Object.keys(room.rematchVotes).length;
        socketServerMain.in(roomId).emit('rematch-votes',{votes,needed:playerCount});

        if(votes >= playerCount && playerCount>0){
            room.board=Array(9).fill(null);
            room.status="playing";
            room.turn="X";
            room.winner=null;
            room.rematchVotes={};
            socketServerMain.in(roomId).emit('room-update',{
                players: Object.values(room.players).map(p=>({name:p.name,symbol:p.symbol})),
                board: room.board,
                 turn: room.turn,
             status: room.status,
                 winner: room.winner
            })
        }
    });


    socket.on('leave',()=>{
        const roomId=socket.data.roomId;
        if(!roomId) return;
        const room=rooms[roomId];
        if(!room) return;
        delete room.players[socket.id];
        socket.leave(roomId);
        socket.data.roomId = null;
        if(Object.keys(room.players).length <2){
            room.status= 'waiting';
            room.rematchVotes={};
        }
        socketServerMain.in(roomId).emit('room-update', {
            players: Object.values(room.players).map(p => ({ name: p.name, symbol: p.symbol })),
            board: room.board,
            turn: room.turn,
            status: room.status,
            winner: room.winner
          });
    })

    socket.on('disconnect',()=>{
        const roomId=socket.data.roomId;
        if(!roomId) return;
        const room=rooms[roomId];
        if(!room) return;
        delete room.players[socket.id];
        socket.leave(roomId);
        socket.data.roomId = null;
        if (Object.keys(room.players).length < 2) {
            room.status = 'waiting';
            room.rematchVotes = {};
          }
          socketServerMain.in(roomId).emit('room-update', {
            players: Object.values(room.players).map(p => ({ name: p.name, symbol: p.symbol })),
            board: room.board,
            turn: room.turn,
            status: room.status,
            winner: room.winner
          });
    })
    

})

const PORT = process.env.PORT || 4001;
server.listen(PORT, () => console.log(`TicTacToe server listening on http://localhost:${PORT}`));
