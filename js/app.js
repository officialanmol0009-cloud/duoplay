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

// 1. YOUR FIREBASE CONFIGURATION
const firebaseConfig = {
  apiKey: "AIzaSyB1eBZqEE1XSAaeAlTl-x9b0I2F03JsOpI",
  authDomain: "duo-play0009.firebaseapp.com",
  databaseURL: "https://duo-play0009-default-rtdb.firebaseio.com/",
  projectId: "duo-play0009",
  storageBucket: "duo-play0009.firebasestorage.app",
  messagingSenderId: "1026056502866",
  appId: "1:1026056502866:web:e1bd895725f399308fe98b"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

const $ = (id) => document.getElementById(id);

let me = null;
let roomCode = "";
let roomData = null;
let unsubscribeRoom = null;
let moving = false;

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

const inviteCode =
  new URLSearchParams(location.search).get("room");

if (inviteCode) {
  roomInput.value = inviteCode.toUpperCase();
}

// 2. ANONYMOUS AUTHENTICATION — NO LOGIN SCREEN
onAuthStateChanged(auth, (user) => {
  if (user) {
    me = user;
    createBtn.disabled = false;
    joinBtn.disabled = false;
    homeMessage.textContent = "Connected! You're ready to play. ❤️";
  } else {
    signInAnonymously(auth).catch(showError);
  }
}, showError);

function showError(error) {
  homeMessage.textContent =
    "Connection error: " + (error?.message || "Please try again.");
}

function playerName() {
  return nickname.value.trim().slice(0, 18) || "Player";
}

function newCode() {
  const characters = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);

  crypto.getRandomValues(bytes);

  return [...bytes]
    .map((byte) => characters[byte % characters.length])
    .join("");
}

function emptyState() {
  return {
    board: ["", "", "", "", "", "", "", "", ""],
    turn: "X",
    winner: null
  };
}

// 3. CREATE A PRIVATE ROOM
async function createRoom() {
  if (!me) return;

  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    let code;

    for (let attempt = 0; attempt < 5; attempt++) {
      const candidate = newCode();
      const snapshot = await get(ref(db, `rooms/${candidate}`));

      if (!snapshot.exists()) {
        code = candidate;
        break;
      }
    }

    if (!code) {
      throw new Error("Couldn't create a room. Try again.");
    }

    await set(ref(db, `rooms/${code}`), {
      hostUid: me.uid,
      players: {
        [me.uid]: {
          name: playerName(),
          symbol: "X"
        }
      },
      state: emptyState()
    });

    openRoom(code);
  } catch (error) {
    showError(error);
  } finally {
    createBtn.disabled = !me;
    joinBtn.disabled = !me;
  }
}

// 4. JOIN A ROOM
async function joinRoom() {
  if (!me) return;

  const code = roomInput.value.trim().toUpperCase();

  if (!/^[A-Z0-9]{6}$/.test(code)) {
    homeMessage.textContent = "Enter the six-character room code.";
    return;
  }

  createBtn.disabled = true;
  joinBtn.disabled = true;

  try {
    const roomRef = ref(db, `rooms/${code}`);
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      throw new Error("Room not found. Check the code.");
    }

    const room = snapshot.val();
    const players = room.players || {};

    if (players[me.uid]) {
      openRoom(code);
      return;
    }

    if (Object.keys(players).length >= 2) {
      throw new Error("This room is full.");
    }

    const symbol = Object.values(players)
      .some((player) => player.symbol === "X") ? "O" : "X";

    await set(ref(db, `rooms/${code}/players/${me.uid}`), {
      name: playerName(),
      symbol
    });

    openRoom(code);
  } catch (error) {
    showError(error);
  } finally {
    createBtn.disabled = !me;
    joinBtn.disabled = !me;
  }
}

// 5. OPEN THE ROOM AND RECEIVE LIVE UPDATES
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
        return;
      }

      roomData = snapshot.val();
      renderRoom();
    },
    (error) => {
      $("gameStatus").textContent =
        "Sync error: " + error.message;
    }
  );
}

// 6. CHECK WHO WON
function calculateWinner(board) {
  const lines = [
    [0, 1, 2], [3, 4, 5],
    [6, 7, 8], [0, 3, 6],
    [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (
      board[a] &&
      board[a] === board[b] &&
      board[b] === board[c]
    ) {
      return board[a];
    }
  }

  return null;
}

// 7. UPDATE THE SCREEN
function renderRoom() {
  if (!roomData || !me) return;

  const players = Object.entries(roomData.players || {})
    .map(([uid, player]) => ({ uid, ...player }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));

  const mine = players.find((player) => player.uid === me.uid);
  const state = roomData.state || emptyState();
  const board = state.board;
  const winner = state.winner || calculateWinner(board);
  const draw = !winner && board.every(Boolean);
  const ready = players.length === 2;

  const playersRow = $("playersRow");
  playersRow.replaceChildren();

  for (const player of players) {
    const item = document.createElement("div");
    item.className = "player-chip";
    item.textContent =
      `${player.symbol} · ${player.name}` +
      (player.uid === me.uid ? " (You)" : "");

    playersRow.appendChild(item);
  }

  if (!ready) {
    $("gameStatus").textContent =
      "Waiting for your partner. Share the invite link! ❤️";
  } else if (winner) {
    const winningPlayer = players.find(
      (player) => player.symbol === winner
    );

    $("gameStatus").textContent =
      `${winningPlayer?.name || winner} wins! ❤️`;
  } else if (draw) {
    $("gameStatus").textContent = "It's a draw! Play again.";
  } else if (mine?.symbol === state.turn) {
    $("gameStatus").textContent = "Your turn! Make your move.";
  } else {
    const nextPlayer = players.find(
      (player) => player.symbol === state.turn
    );

    $("gameStatus").textContent =
      `Waiting for ${nextPlayer?.name || "your partner"}...`;
  }

  document.querySelectorAll(".cell").forEach((cell) => {
    const index = Number(cell.dataset.index);
    const value = board[index];

    cell.textContent = value || "·";
    cell.classList.toggle("x", value === "X");
    cell.classList.toggle("o", value === "O");

    cell.disabled =
      moving ||
      !ready ||
      !mine ||
      mine.symbol !== state.turn ||
      Boolean(value) ||
      Boolean(winner) ||
      draw;
  });
}

// 8. PLAY A MOVE
async function playCell(index) {
  if (!me || !roomData || moving) return;

  const mine = roomData.players?.[me.uid];

  if (!mine) return;

  moving = true;
  renderRoom();

  try {
    const stateRef = ref(db, `rooms/${roomCode}/state`);

    // Transactions help prevent two simultaneous moves overwriting each other.
    const result = await runTransaction(
      stateRef,
      (current) => {
        if (!current || !Array.isArray(current.board)) return;

        const board = current.board;

        if (
          current.turn !== mine.symbol ||
          board[index] ||
          current.winner ||
          board.every(Boolean)
        ) {
          return;
        }

        const nextBoard = [...board];
        nextBoard[index] = mine.symbol;

        return {
          board: nextBoard,
          turn: mine.symbol === "X" ? "O" : "X",
          winner: calculateWinner(nextBoard)
        };
      },
      { applyLocally: false }
    );

    if (!result.committed) {
      $("gameStatus").textContent =
        "That move is no longer available. Try again.";
    }
  } catch (error) {
    $("gameStatus").textContent = "Move failed: " + error.message;
  } finally {
    moving = false;
    if (roomData) renderRoom();
  }
}

// 9. START A NEW ROUND
async function restartGame() {
  if (!roomCode || !roomData?.players?.[me?.uid]) return;

  try {
    await set(ref(db, `rooms/${roomCode}/state`), emptyState());
  } catch (error) {
    $("gameStatus").textContent =
      "Could not restart: " + error.message;
  }
}

// 10. COPY THE INVITATION LINK
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

// 11. LEAVE THE ROOM
async function leaveRoom() {
  try {
    if (roomCode && me && roomData) {
      if (roomData.hostUid === me.uid) {
        // The host closes the room.
        await remove(ref(db, `rooms/${roomCode}`));
      } else {
        // Other players remove only their own player entry.
        await remove(
          ref(db, `rooms/${roomCode}/players/${me.uid}`)
        );
      }
    }
  } catch (error) {
    console.error("Leave room error:", error);
  }

  if (unsubscribeRoom) unsubscribeRoom();

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

// 12. BUTTON EVENTS
createBtn.addEventListener("click", createRoom);
joinBtn.addEventListener("click", joinRoom);
copyBtn.addEventListener("click", copyInvite);
restartBtn.addEventListener("click", restartGame);
backBtn.addEventListener("click", leaveRoom);

document.querySelectorAll(".cell").forEach((cell) => {
  cell.addEventListener("click", () => {
    playCell(Number(cell.dataset.index));
  });
});