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

// 1. DUOPLAY FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyB1eBZqEE1XSAaeAlTl-x9b0I2F03JsOpI",
  authDomain: "duo-play0009.firebaseapp.com",
  databaseURL: "https://duo-play0009-default-rtdb.firebaseio.com",
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

const LADDERS = {
  3: 22, 5: 8, 11: 26, 20: 29,
  27: 56, 36: 44, 51: 67, 71: 91, 80: 100
};

const SNAKES = {
  17: 4, 19: 7, 21: 9, 43: 34,
  50: 32, 54: 34, 62: 18, 64: 60,
  87: 24, 95: 75, 98: 79
};

let me = null;
let selectedGame = "tictactoe";
let roomCode = "";
let roomData = null;
let unsubscribeRoom = null;
let moving = false;
let signingIn = false;

// 2. GAME SELECTION
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

// 3. ANONYMOUS AUTHENTICATION
function showError(error) {
  console.error(error);
  homeMessage.textContent =
    "Error: " + (error?.message || "Please try again.");
}

onAuthStateChanged(
  auth,
  (user) => {
    if (user) {
      me = user;
      createBtn.disabled = false;
      joinBtn.disabled = false;
      homeMessage.textContent =
        "Connected! Ready to play together. ❤️";
      return;
    }

    if (!signingIn) {
      signingIn = true;

      signInAnonymously(auth)
        .catch(showError)
        .finally(() => {
          signingIn = false;
        });
    }
  },
  showError
);

// Fill the room field when someone opens an invitation.
const inviteCode = new URLSearchParams(location.search).get("room");

if (inviteCode) {
  roomInput.value = inviteCode.toUpperCase();
}

// 4. HELPERS
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
      lastRoll: 1
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

// 5. OPEN THE CORRECT GAME
function openRoom(code, game) {
  // Connect Four uses the downloaded GitHub game.
  if (game === "connectfour") {
    const url = new URL(
      "/games/connect-four/index.html",
      window.location.origin
    );

    url.searchParams.set("room", code);

    window.location.href = url.href;
    return;
  }

  // Tic-Tac-Toe and Snakes & Ladders stay in DuoPlay.
  roomCode = code;

  homeScreen.classList.add("hidden");
  gameScreen.classList.remove("hidden");

  if (unsubscribeRoom) unsubscribeRoom();

  history.replaceState(
    null,
    "",
    `${location.pathname}?room=${code}`
  );

  unsubscribeRoom = onValue(
    ref(db, `rooms/${code}`),
    (snapshot) => {
      if (!snapshot.exists()) {
        roomData = null;
        $("gameStatus").textContent = "This room has closed.";
        return;
      }

      roomData = snapshot.val();

      if (roomData.game === "connectfour") {
        openRoom(code, "connectfour");
        return;
      }

      renderRoom();
    },
    (error) => {
      $("gameStatus").textContent =
        "Sync error: " + error.message;
    }
  );
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

      const snapshot = await get(
        ref(db, `rooms/${candidate}`)
      );

      if (!snapshot.exists()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error("Could not create a room. Try again.");
    }

    await set(ref(db, `rooms/${code}`), {
      hostUid: me.uid,
      game: selectedGame,
      players: {
        [me.uid]: {
          name: playerName(),
          symbol: "X"
        }
      },
      state: emptyState(selectedGame)
    });

    openRoom(code, selectedGame);
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
    homeMessage.textContent =
      "Enter a valid six-character room code.";
    return;
  }

  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error("Room not found. Check the room code.");
    }

    const room = snapshot.val();
    const players = room.players || {};

    if (!GAME_NAMES[room.game]) {
      throw new Error("This room has an unknown game.");
    }

    if (players[me.uid]) {
      openRoom(code, room.game);
      return;
    }

    if (Object.keys(players).length >= 2) {
      throw new Error("This room is full.");
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

    openRoom(code, room.game);
  } catch (error) {
    showError(error);
  } finally {
    createBtn.disabled = !me;
    joinBtn.disabled = !me;
  }
}

// 8. GAME RESULT CHECKS
function tttWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5],
    [6, 7, 8], [0, 3, 6],
    [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] &&
        board[b] === board[c]) {
      return board[a];
    }
  }

  return null;
}

function gameResult(game, state) {
  let winner = state.winner || null;
  let draw = false;

  if (game === "tictactoe") {
    const board = state.board || Array(9).fill("");
    winner = winner || tttWinner(board);
    draw = !winner && board.every(Boolean);
  }

  return { winner, draw };
}

// 9. RENDER ROOM
function renderRoom() {
  if (!roomData || !me) return;

  const game = roomData.game;
  const state = roomData.state || emptyState(game);

  const players = Object.entries(roomData.players || {})
    .map(([uid, player]) => ({ uid, ...player }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const mine = players.find((player) => player.uid === me.uid);
  const ready = players.length === 2;

  $("gameTitle").textContent = gameTitle(game);

  const playersRow = $("playersRow");
  playersRow.replaceChildren();

  players.forEach((player) => {
    const chip = document.createElement("div");
    chip.className = "player-chip";
    chip.textContent =
      `${player.symbol} · ${player.name}` +
      (player.uid === me.uid ? " (You)" : "");
    playersRow.appendChild(chip);
  });

  const result = gameResult(game, state);

  if (!mine) {
    $("gameStatus").textContent = "You are not in this room.";
  } else if (!ready) {
    $("gameStatus").textContent =
      "Waiting for your partner. Share the room code! ❤️";
  } else if (result.winner) {
    const winningPlayer = players.find(
      (player) => player.symbol === result.winner
    );

    $("gameStatus").textContent =
      `${winningPlayer?.name || result.winner} wins! 🎉`;
  } else if (result.draw) {
    $("gameStatus").textContent = "It's a draw! Play again.";
  } else if (mine.symbol === state.turn) {
    $("gameStatus").textContent = "Your turn! ❤️";
  } else {
    const nextPlayer = players.find(
      (player) => player.symbol === state.turn
    );

    $("gameStatus").textContent =
      `Waiting for ${nextPlayer?.name || "your partner"}...`;
  }

  if (game === "snakes") {
    renderSnakes(state, ready, mine, result);
  } else {
    renderTicTacToe(state, ready, mine, result);
  }
}

// 10. TIC-TAC-TOE BOARD
function renderTicTacToe(state, ready, mine, result) {
  const board = state.board || Array(9).fill("");

  boardElement.className = "board ttt-grid";
  boardElement.replaceChildren();
  controlsElement.replaceChildren();

  $("gameHint").textContent =
    "Get three marks in a row to win. ❤️";

  board.forEach((symbol, index) => {
    const cell = document.createElement("button");
    cell.className = "cell";
    cell.textContent = symbol || "·";

    if (symbol === "X") cell.classList.add("x");
    if (symbol === "O") cell.classList.add("o");

    cell.disabled =
      moving || !ready || !mine ||
      mine.symbol !== state.turn ||
      Boolean(symbol) || result.winner || result.draw;

    cell.addEventListener("click", () => playTicTacToe(index));

    boardElement.appendChild(cell);
  });
}

// 11. SNAKES & LADDERS BOARD
function renderSnakes(state, ready, mine, result) {
  const positions = state.positions || { X: 0, O: 0 };

  boardElement.className = "board snakes-board";
  boardElement.replaceChildren();
  controlsElement.replaceChildren();

  $("gameHint").textContent =
    `🔴 Player X: ${positions.X}/100 · 🔵 Player O: ${positions.O}/100`;

  for (let row = 9; row >= 0; row--) {
    for (let col = 0; col < 10; col++) {
      const number = row % 2 === 0
        ? row * 10 + col + 1
        : row * 10 + 10 - col;

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

      decoration.textContent = tokens.length
        ? tokens.join("")
        : LADDERS[number] ? "🪜"
        : SNAKES[number] ? "🐍" : "";

      if (positions.X === number) tile.classList.add("player-one");
      if (positions.O === number) tile.classList.add("player-two");

      tile.append(numberLabel, decoration);
      boardElement.appendChild(tile);
    }
  }

  const controls = document.createElement("div");
  controls.className = "snake-controls";

  const dice = document.createElement("div");
  dice.className = "dice-face";
  dice.textContent =
    ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"][
      (state.lastRoll || 1) - 1
    ];

  const roll = document.createElement("button");
  roll.className = "dice-button";
  roll.textContent = "🎲 Roll dice";

  roll.disabled =
    moving || !ready || !mine ||
    mine.symbol !== state.turn || Boolean(result.winner);

  roll.addEventListener("click", rollDice);

  controls.append(dice, roll);
  controlsElement.appendChild(controls);
}

// 12. SAFE MULTIPLAYER STATE UPDATES
async function transactMove(updater) {
  if (!me || !roomCode || !roomData || moving) return;

  moving = true;
  renderRoom();

  try {
    const transaction = await runTransaction(
      ref(db, `rooms/${roomCode}/state`),
      updater,
      { applyLocally: false }
    );

    if (!transaction.committed) {
      $("gameStatus").textContent =
        "Move not accepted. Please try again.";
    }
  } catch (error) {
    $("gameStatus").textContent =
      "Move failed: " + error.message;
  } finally {
    moving = false;
    if (roomData) renderRoom();
  }
}

// 13. TIC-TAC-TOE MOVE
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

    return {
      board,
      turn: mine.symbol === "X" ? "O" : "X",
      winner: tttWinner(board)
    };
  });
}

// 14. SNAKES & LADDERS DICE
async function rollDice() {
  const mine = roomData?.players?.[me?.uid];
  if (!mine) return;

  const roll = Math.floor(Math.random() * 6) + 1;

  await transactMove((current) => {
    if (!current || !current.positions) return;
    if (current.turn !== mine.symbol || current.winner) return;

    const positions = {
      X: Number(current.positions.X || 0),
      O: Number(current.positions.O || 0)
    };

    let next = positions[mine.symbol];

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

// 15. PLAY AGAIN
async function restartGame() {
  if (!roomCode || !me || !roomData?.players?.[me.uid]) return;

  try {
    await set(
      ref(db, `rooms/${roomCode}/state`),
      emptyState(roomData.game)
    );
  } catch (error) {
    $("gameStatus").textContent =
      "Could not restart: " + error.message;
  }
}

// 16. COPY ROOM INVITATION
async function copyInvite() {
  const url = new URL("/", location.origin);
  url.searchParams.set("room", roomCode);

  try {
    await navigator.clipboard.writeText(url.href);
    copyBtn.textContent = "Copied ✓";
  } catch {
    window.prompt("Copy this invitation link:", url.href);
  }
}

// 17. LEAVE THE ROOM
async function leaveRoom() {
  const code = roomCode;

  if (unsubscribeRoom) unsubscribeRoom();
  unsubscribeRoom = null;

  try {
    if (code && me && roomData?.players?.[me.uid]) {
      if (roomData.hostUid === me.uid) {
        await remove(ref(db, `rooms/${code}`));
      } else {
        await set(
          ref(db, `rooms/${code}/state`),
          emptyState(roomData.game)
        );

        await remove(ref(db, `rooms/${code}/players/${me.uid}`));
      }
    }
  } catch (error) {
    console.error("Leave room error:", error);
  }

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

// 18. BUTTON EVENTS
createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", joinRoom);
copyBtn.addEventListener("click", copyInvite);
restartBtn.addEventListener("click", restartGame);
backBtn.addEventListener("click", leaveRoom);