import { initializeApp } from
  "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";

import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

import {
  getDatabase,
  ref,
  get,
  set,
  remove,
  onValue,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

// 1. FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyB1eBZqEE1XSAaeAlTl-x9b0I2F03JsOpI",
  authDomain: "duo-play0009.firebaseapp.com",

  // Copy this exact value from your currently working app.js.
  databaseURL: "PASTE_YOUR_EXISTING_DATABASE_URL_HERE",

  projectId: "duo-play0009",
  storageBucket: "duo-play0009.firebasestorage.app",
  messagingSenderId: "1026056502866",
  appId: "1:1026056502866:web:e1bd895725f399308fe98b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);

const homeScreen = $("homeScreen");
const gameScreen = $("gameScreen");
const nickname = $("nickname");
const roomInput = $("roomInput");
const homeMessage = $("homeMessage");
const createBtn = $("createBtn");
const joinBtn = $("joinBtn");
const copyBtn = $("copyBtn");
const restartBtn = $("restartBtn");
const backBtn = $("backBtn");
const boardElement = $("board");
const controlsElement = $("gameControls");

const GAME_NAMES = {
  tictactoe: "Tic-Tac-Toe",
  connectfour: "Connect Four",
  snakes: "Snakes & Ladders"
};

let me = null;
let selectedGame = "tictactoe";
let roomCode = "";
let roomData = null;
let unsubscribeRoom = null;
let moving = false;

// 2. SNAKES & LADDERS BOARD
const LADDERS = {
  3: 22,
  5: 8,
  11: 26,
  20: 29,
  27: 56,
  36: 44,
  51: 67,
  71: 91,
  80: 100
};

const SNAKES = {
  17: 4,
  19: 7,
  21: 9,
  43: 34,
  50: 32,
  54: 34,
  62: 18,
  64: 60,
  87: 24,
  95: 75,
  98: 79
};

// 3. GAME STATE
function emptyState(game) {
  if (game === "connectfour") {
    return {
      board: Array(42).fill(""),
      turn: "X",
      winner: null
    };
  }

  if (game === "snakes") {
    return {
      positions: { X: 0, O: 0 },
      turn: "X",
      winner: null,
      lastRoll: 0
    };
  }

  return {
    board: Array(9).fill(""),
    turn: "X",
    winner: null
  };
}

function gameTitle(game) {
  return GAME_NAMES[game] || GAME_NAMES.tictactoe;
}

function playerName() {
  return nickname.value.trim().slice(0, 18) || "Player";
}

function newCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);

  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => chars[byte % chars.length])
    .join("");
}

function showError(error) {
  console.error(error);

  homeMessage.textContent =
    "Error: " + (error?.message || "Please try again.");
}

// 4. SELECT THE GAME
document.querySelectorAll(".game-card").forEach((button) => {
  button.addEventListener("click", () => {
    selectedGame = button.dataset.game;

    document.querySelectorAll(".game-card").forEach((card) => {
      const selected = card === button;

      card.classList.toggle("selected", selected);
      card.querySelector(".game-check").textContent =
        selected ? "✓" : "";
    });
  });
});

// 5. ANONYMOUS AUTHENTICATION
onAuthStateChanged(
  auth,
  (user) => {
    if (user) {
      me = user;
      createBtn.disabled = false;
      joinBtn.disabled = false;
      homeMessage.textContent = "Connected! Let's play together. ❤️";
    } else {
      signInAnonymously(auth).catch(showError);
    }
  },
  showError
);

const inviteCode =
  new URLSearchParams(location.search).get("room");

if (inviteCode) {
  roomInput.value = inviteCode.toUpperCase();
}

// 6. CREATE A ROOM
async function createRoom() {
  if (!me) return;

  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    let code = "";

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newCode();
      const snapshot = await get(ref(db, `rooms/${candidate}`));

      if (!snapshot.exists()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error("Could not generate a room. Try again.");
    }

    const initial = {
      hostUid: me.uid,
      game: selectedGame,
      players: {
        [me.uid]: {
          name: playerName(),
          symbol: "X"
        }
      },
      state: emptyState(selectedGame)
    };

    await set(ref(db, `rooms/${code}`), initial);

    openRoom(code);
  } catch (error) {
    showError(error);
  } finally {
    createBtn.disabled = !me;
    joinBtn.disabled = !me;
  }
}

// 7. JOIN A ROOM
async function joinRoom() {
  if (!me) return;

  const code = roomInput.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    homeMessage.textContent = "Enter a valid six-character room code.";
    return;
  }

  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    const snapshot = await get(ref(db, `rooms/${code}`));

    if (!snapshot.exists()) {
      throw new Error("Room not found. Check the invitation code.");
    }

    const room = snapshot.val();
    const players = room.players || {};

    if (players[me.uid]) {
      openRoom(code);
      return;
    }

    if (Object.keys(players).length >= 2) {
      throw new Error("This room already has two players.");
    }

    const symbol = Object.values(players)
      .some((player) => player.symbol === "X") ? "O" : "X";

    await set(
      ref(db, `rooms/${code}/players/${me.uid}`),
      {
        name: playerName(),
        symbol
      }
    );

    openRoom(code);
  } catch (error) {
    showError(error);
  } finally {
    createBtn.disabled = !me;
    joinBtn.disabled = !me;
  }
}

// 8. OPEN A ROOM
function openRoom(code) {
  roomCode = code;

  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  $("roomCodeLabel").textContent = code;

  history.replaceState(
    null,
    "",
    `${location.pathname}?room=${code}`
  );

  if (unsubscribeRoom) unsubscribeRoom();

  unsubscribeRoom = onValue(
    ref(db, `rooms/${code}`),
    (snapshot) => {
      if (!snapshot.exists()) {
        roomData = null;
        $("gameStatus").textContent = "This room has been closed.";
        boardElement.replaceChildren();
        controlsElement.replaceChildren();
        return;
      }

      roomData = snapshot.val();
      renderRoom();
    },
    (error) => {
      $("gameStatus").textContent =
        "Could not synchronize the room: " + error.message;
    }
  );
}

// 9. TIC-TAC-TOE WIN CHECK
function tttWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5],
    [6, 7, 8], [0, 3, 6],
    [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  return null;
}

// 10. CONNECT FOUR WIN CHECK
function connectFourWinner(board, row, col, symbol) {
  const directions = [
    [0, 1],
    [1, 0],
    [1, 1],
    [1, -1]
  ];

  for (const [dr, dc] of directions) {
    let count = 1;

    for (const sign of [-1, 1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;

      while (
        r >= 0 && r < 6 &&
        c >= 0 && c < 7 &&
        board[r * 7 + c] === symbol
      ) {
        count++;
        r += dr * sign;
        c += dc * sign;
      }
    }

    if (count >= 4) return symbol;
  }

  return null;
}

// 11. GAME STATUS
function calculateStatus(game, state, players) {
  if (!state) return { winner: null, draw: false };

  let winner = state.winner || null;
  let draw = false;

  if (game === "tictactoe") {
    const board = state.board || Array(9).fill("");
    winner = winner || tttWinner(board);
    draw = !winner && board.every(Boolean);
  }

  if (game === "connectfour") {
    const board = state.board || Array(42).fill("");
    draw = !winner && board.every(Boolean);
  }

  const winningPlayer = players.find((player) => player.symbol === winner);

  return {
    winner,
    winningPlayer,
    draw
  };
}

// 12. RENDER THE ROOM
function renderRoom() {
  if (!roomData || !me) return;

  const game = roomData.game || "tictactoe";
  const state = roomData.state || emptyState(game);

  const players = Object.entries(roomData.players || {})
    .map(([uid, player]) => ({ uid, ...player }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const mine = players.find((player) => player.uid === me.uid);
  const ready = players.length === 2;
  const result = calculateStatus(game, state, players);

  $("gameTitle").textContent = gameTitle(game);

  const playersRow = $("playersRow");
  playersRow.replaceChildren();

  for (const player of players) {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.textContent =
      `${player.symbol} · ${player.name}` +
      (player.uid === me.uid ? " (You)" : "");

    playersRow.appendChild(chip);
  }

  if (!mine) {
    $("gameStatus").textContent = "You are not a player in this room.";
  } else if (!ready) {
    $("gameStatus").textContent =
      "Waiting for your partner. Share the invitation link! ❤️";
  } else if (result.winner) {
    $("gameStatus").textContent =
      `${result.winningPlayer?.name || result.winner} wins! 🎉`;
  } else if (result.draw) {
    $("gameStatus").textContent = "It's a draw! Play another round.";
  } else {
    const turnPlayer = players.find(
      (player) => player.symbol === state.turn
    );

    $("gameStatus").textContent =
      mine.symbol === state.turn
        ? "Your turn! ❤️"
        : `Waiting for ${turnPlayer?.name || "your partner"}...`;
  }

  if (game === "tictactoe") {
    renderTicTacToe(state, ready, mine, result);
  } else if (game === "connectfour") {
    renderConnectFour(state, ready, mine, result);
  } else if (game === "snakes") {
    renderSnakes(state, ready, mine, result);
  }
}

// 13. TIC-TAC-TOE BOARD
function renderTicTacToe(state, ready, mine, result) {
  const board = state.board || Array(9).fill("");

  boardElement.className = "board ttt-grid";
  boardElement.replaceChildren();
  controlsElement.replaceChildren();

  $("gameHint").textContent =
    "Get three marks in a row to win. ❤️";

  for (let i = 0; i < 9; i++) {
    const cell = document.createElement("button");

    cell.className = "cell";
    cell.textContent = board[i] || "·";

    if (board[i] === "X") cell.classList.add("x");
    if (board[i] === "O") cell.classList.add("o");

    cell.disabled =
      moving ||
      !ready ||
      !mine ||
      mine.symbol !== state.turn ||
      Boolean(board[i]) ||
      Boolean(result.winner) ||
      result.draw;

    cell.addEventListener("click", () => playTicTacToe(i));

    boardElement.appendChild(cell);
  }
}

// 14. CONNECT FOUR BOARD
function renderConnectFour(state, ready, mine, result) {
  const board = state.board || Array(42).fill("");

  boardElement.className = "board connect-grid";
  boardElement.replaceChildren();
  controlsElement.replaceChildren();

  $("gameHint").textContent =
    "Drop a disc into a column. Connect four discs to win!";

  for (let col = 0; col < 7; col++) {
    const column = document.createElement("button");

    column.className = "connect-column";
    column.setAttribute("aria-label", `Drop disc in column ${col + 1}`);

    column.disabled =
      moving ||
      !ready ||
      !mine ||
      mine.symbol !== state.turn ||
      Boolean(result.winner) ||
      result.draw ||
      board[col] !== "" &&
        board[7 + col] !== "" &&
        board[14 + col] !== "" &&
        board[21 + col] !== "" &&
        board[28 + col] !== "" &&
        board[35 + col] !== "";

    for (let row = 0; row < 6; row++) {
      const slot = document.createElement("span");
      const value = board[row * 7 + col];

      slot.className = "connect-slot";

      if (value === "X") slot.classList.add("red");
      if (value === "O") slot.classList.add("yellow");

      column.appendChild(slot);
    }

    column.addEventListener("click", () => playConnectFour(col));
    boardElement.appendChild(column);
  }
}

// 15. SNAKES & LADDERS BOARD
function renderSnakes(state, ready, mine, result) {
  const positions = state.positions || { X: 0, O: 0 };

  boardElement.className = "board snakes-board";
  boardElement.replaceChildren();
  controlsElement.replaceChildren();

  $("gameHint").textContent =
    `🔴 Player X: ${positions.X} / 100   ·   🔵 Player O: ${positions.O} / 100`;

  // Visual rows are generated from top to bottom.
  // Numbering snakes back and forth across every row.
  for (let visualRow = 9; visualRow >= 0; visualRow--) {
    for (let col = 0; col < 10; col++) {
      const number = visualRow % 2 === 0
        ? visualRow * 10 + col + 1
        : visualRow * 10 + (10 - col);

      const tile = document.createElement("div");
      tile.className = "snake-tile";

      const numberLabel = document.createElement("span");
      numberLabel.className = "tile-number";
      numberLabel.textContent = number;

      const decoration = document.createElement("span");
      decoration.className = "tile-decoration";

      const tokens = [];

      if (positions.X === number) tokens.push("🔴");
      if (positions.O === number) tokens.push("🔵");

      if (tokens.length) {
        decoration.textContent = tokens.join("");
      } else if (LADDERS[number]) {
        decoration.textContent = "🪜";
      } else if (SNAKES[number]) {
        decoration.textContent = "🐍";
      }

      if (positions.X === number) tile.classList.add("player-one");
      if (positions.O === number) tile.classList.add("player-two");
      if (number === 1 || number === 100) {
        tile.classList.add("special-start");
      }

      tile.title = `Square ${number}`;
      tile.append(numberLabel, decoration);
      boardElement.appendChild(tile);
    }
  }

  const controls = document.createElement("div");
  controls.className = "snake-controls";

  const dice = document.createElement("div");
  dice.className = "dice-face";
  dice.textContent = diceSymbol(state.lastRoll || 1);

  const rollButton = document.createElement("button");
  rollButton.className = "dice-button";
  rollButton.textContent = moving ? "Rolling..." : "🎲 Roll dice";

  rollButton.disabled =
    moving ||
    !ready ||
    !mine ||
    mine.symbol !== state.turn ||
    Boolean(result.winner);

  rollButton.addEventListener("click", rollSnakesDice);

  controls.append(dice, rollButton);
  controlsElement.replaceChildren(controls);

  const legend = document.createElement("div");
  legend.className = "snake-legend";
  legend.textContent = "🪜 Ladders move you up · 🐍 Snakes send you down";

  controlsElement.appendChild(legend);
}

function diceSymbol(number) {
  return ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][number - 1] || "⚀";
}

// 16. MAKE A MOVE SAFELY THROUGH A TRANSACTION
async function transactMove(updater) {
  if (!me || !roomCode || !roomData || moving) return;

  moving = true;
  renderRoom();

  try {
    const result = await runTransaction(
      ref(db, `rooms/${roomCode}/state`),
      updater,
      { applyLocally: false }
    );

    if (!result.committed) {
      $("gameStatus").textContent =
        "Move not accepted. Please check whose turn it is.";
    }
  } catch (error) {
    $("gameStatus").textContent =
      "Move failed: " + error.message;
  } finally {
    moving = false;
    if (roomData) renderRoom();
  }
}

// 17. PLAY TIC-TAC-TOE
async function playTicTacToe(index) {
  const mine = roomData?.players?.[me?.uid];
  if (!mine) return;

  await transactMove((current) => {
    if (!current || !Array.isArray(current.board)) return;

    const board = [...current.board];

    if (
      current.turn !== mine.symbol ||
      board[index] ||
      current.winner ||
      board.every(Boolean)
    ) {
      return;
    }

    board[index] = mine.symbol;

    const winner = tttWinner(board);

    return {
      board,
      turn: mine.symbol === "X" ? "O" : "X",
      winner
    };
  });
}

// 18. PLAY CONNECT FOUR
async function playConnectFour(col) {
  const mine = roomData?.players?.[me?.uid];
  if (!mine) return;

  await transactMove((current) => {
    if (!current || !Array.isArray(current.board)) return;

    if (
      current.turn !== mine.symbol ||
      current.winner ||
      current.board.every(Boolean)
    ) {
      return;
    }

    const board = [...current.board];

    let targetRow = -1;

    for (let row = 5; row >= 0; row--) {
      if (!board[row * 7 + col]) {
        targetRow = row;
        break;
      }
    }

    if (targetRow === -1) return;

    board[targetRow * 7 + col] = mine.symbol;

    const winner = connectFourWinner(
      board,
      targetRow,
      col,
      mine.symbol
    );

    return {
      board,
      turn: mine.symbol === "X" ? "O" : "X",
      winner
    };
  });
}

// 19. ROLL THE DICE IN SNAKES & LADDERS
async function rollSnakesDice() {
  const mine = roomData?.players?.[me?.uid];
  if (!mine || moving) return;

  const roll = Math.floor(Math.random() * 6) + 1;

  await transactMove((current) => {
    if (!current || !current.positions) return;

    if (current.turn !== mine.symbol || current.winner) {
      return;
    }

    const positions = {
      X: Number(current.positions.X || 0),
      O: Number(current.positions.O || 0)
    };

    let next = positions[mine.symbol];

    // A player must land exactly on square 100 to win.
    if (next + roll <= 100) {
      next += roll;

      if (LADDERS[next]) next = LADDERS[next];
      else if (SNAKES[next]) next = SNAKES[next];
    }

    positions[mine.symbol] = next;

    return {
      positions,
      lastRoll: roll,
      turn: next === 100
        ? mine.symbol
        : mine.symbol === "X" ? "O" : "X",
      winner: next === 100 ? mine.symbol : null
    };
  });
}

// 20. PLAY AGAIN
async function restartGame() {
  if (!roomCode || !me || !roomData?.players?.[me.uid]) return;

  const game = roomData.game || "tictactoe";

  try {
    await set(
      ref(db, `rooms/${roomCode}/state`),
      emptyState(game)
    );
  } catch (error) {
    $("gameStatus").textContent =
      "Could not restart: " + error.message;
  }
}

// 21. COPY INVITATION LINK
async function copyInvite() {
  const url =
    `${location.origin}${location.pathname}?room=${roomCode}`;

  try {
    await navigator.clipboard.writeText(url);
    copyBtn.textContent = "Copied ✓";
  } catch {
    window.prompt("Copy this invitation link:", url);
  }
}

// 22. LEAVE THE ROOM
async function leaveRoom() {
  if (unsubscribeRoom) unsubscribeRoom();

  try {
    if (roomCode && me && roomData?.players?.[me.uid]) {
      if (roomData.hostUid === me.uid) {
        await remove(ref(db, `rooms/${roomCode}`));
      } else {
        await set(
          ref(db, `rooms/${roomCode}/state`),
          emptyState(roomData.game || "tictactoe")
        );

        await remove(
          ref(db, `rooms/${roomCode}/players/${me.uid}`)
        );
      }
    }
  } catch (error) {
    console.error("Leave room error:", error);
  }

  unsubscribeRoom = null;
  roomCode = "";
  roomData = null;
  moving = false;

  history.replaceState(null, "", location.pathname);

  gameScreen.classList.add("hidden");
  homeScreen.classList.remove("hidden");

  roomInput.value = "";
  copyBtn.textContent = "Invite ↗";
  homeMessage.textContent = "You're connected anonymously. ❤️";
}

// 23. BUTTON EVENTS
createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", joinRoom);
copyBtn.addEventListener("click", copyInvite);
restartBtn.addEventListener("click", restartGame);
backBtn.addEventListener("click", leaveRoom);