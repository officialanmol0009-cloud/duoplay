document.addEventListener("DOMContentLoaded", async () => {
  const grid = document.querySelector(".grid");
  const result = document.querySelector("#result");
  const currentPlayerDisplay = document.querySelector("#current-player");

  const roomCode = new URLSearchParams(location.search)
    .get("room")?.toUpperCase();

  let me = null;
  let roomData = null;
  let busy = false;
  let roomListenerStarted = false;

  if (!grid || !result || !currentPlayerDisplay) {
    console.error("Connect Four HTML elements are missing.");
    return;
  }

  if (!roomCode || !/^[A-Z0-9]{6}$/.test(roomCode)) {
    result.textContent =
      "Open Connect Four using a valid DuoPlay room invitation.";
    return;
  }

  // YOUR FIREBASE CONFIGURATION
  const firebaseConfig = {
    apiKey: "AIzaSyB1eBZqEE1XSAaeAlTl-x9b0I2F03JsOpI",
    authDomain: "duo-play0009.firebaseapp.com",
    databaseURL: "https://duo-play0009-default-rtdb.firebaseio.com",
    projectId: "duo-play0009",
    storageBucket: "duo-play0009.firebasestorage.app",
    messagingSenderId: "1026056502866",
    appId: "1:1026056502866:web:e1bd895725f399308fe98b"
  };

  // Create the board: 6 rows x 7 columns.
  grid.replaceChildren();

  for (let i = 0; i < 42; i++) {
    const cell = document.createElement("div");
    cell.dataset.index = i;
    grid.appendChild(cell);
  }

  try {
    const appSDK = await import(
      "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js"
    );

    const authSDK = await import(
      "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js"
    );

    const dbSDK = await import(
      "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js"
    );

    const app = appSDK.initializeApp(firebaseConfig);
    const auth = authSDK.getAuth(app);
    const db = dbSDK.getDatabase(app);

    const roomRef = dbSDK.ref(db, `rooms/${roomCode}`);
    const stateRef = dbSDK.ref(db, `rooms/${roomCode}/state`);

    let signingIn = false;

    function showError(error) {
      console.error(error);
      result.textContent =
        "Connection error: " + (error?.message || "Please try again.");
    }

    // Anonymous authentication — no login screen.
    authSDK.onAuthStateChanged(
      auth,
      (user) => {
        if (!user) {
          if (!signingIn) {
            signingIn = true;

            authSDK.signInAnonymously(auth)
              .catch(showError)
              .finally(() => {
                signingIn = false;
              });
          }

          return;
        }

        me = user;

        if (roomListenerStarted) return;
        roomListenerStarted = true;

        dbSDK.onValue(
          roomRef,
          (snapshot) => {
            if (!snapshot.exists()) {
              roomData = null;
              result.textContent = "This room no longer exists.";
              return;
            }

            roomData = snapshot.val();

            if (roomData.game !== "connectfour") {
              result.textContent =
                "This room is not a Connect Four room. Create one from DuoPlay.";
              return;
            }

            renderBoard();
          },
          showError
        );
      },
      showError
    );

    // Find four connected discs.
    function getWinner(board) {
      const directions = [
        [0, 1],
        [1, 0],
        [1, 1],
        [1, -1]
      ];

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 7; col++) {
          const symbol = board[row * 7 + col];

          if (!symbol) continue;

          for (const [dr, dc] of directions) {
            let count = 1;

            for (let step = 1; step < 4; step++) {
              const nextRow = row + dr * step;
              const nextCol = col + dc * step;

              if (
                nextRow < 0 || nextRow >= 6 ||
                nextCol < 0 || nextCol >= 7 ||
                board[nextRow * 7 + nextCol] !== symbol
              ) {
                break;
              }

              count++;
            }

            if (count >= 4) return symbol;
          }
        }
      }

      return null;
    }

    // Refresh the board from Firebase.
    function renderBoard() {
      if (!roomData || !me) return;

      const players = Object.entries(roomData.players || {})
        .map(([uid, player]) => ({ uid, ...player }));

      const mine = players.find((player) => player.uid === me.uid);
      const state = roomData.state || {};
      const board = Array.isArray(state.board)
        ? state.board
        : Array(42).fill("");

      if (!mine) {
        result.textContent =
          "Join this room through DuoPlay before playing.";
        return;
      }

      if (board.length !== 42) {
        result.textContent = "Invalid Connect Four board state.";
        return;
      }

      const winner = state.winner || getWinner(board);
      const draw = !winner && board.every(Boolean);

      grid.replaceChildren();

      board.forEach((symbol, index) => {
        const cell = document.createElement("div");

        cell.dataset.index = index;

        if (symbol === "X") cell.classList.add("player-one");
        if (symbol === "O") cell.classList.add("player-two");

        grid.appendChild(cell);
      });

      const ready = players.length === 2;

      currentPlayerDisplay.textContent =
        state.turn === "X" ? "1 (Red)" : "2 (Blue)";

      if (!ready) {
        result.textContent = "Waiting for your partner to join...";
      } else if (winner) {
        const winningPlayer = players.find(
          (player) => player.symbol === winner
        );

        result.textContent =
          `${winningPlayer?.name || "Player " + winner} wins! 🎉`;
      } else if (draw) {
        result.textContent = "It's a draw! Start another round.";
      } else if (mine.symbol === state.turn) {
        result.textContent = "Your turn! Choose a column.";
      } else {
        const nextPlayer = players.find(
          (player) => player.symbol === state.turn
        );

        result.textContent =
          `Waiting for ${nextPlayer?.name || "your partner"}...`;
      }
    }

    // Drop a disc into the chosen column.
    async function playColumn(col) {
      if (!me || !roomData || busy) return;

      const players = roomData.players || {};
      const mine = players[me.uid];

      if (
        !mine ||
        players[me.uid].symbol !== roomData.state?.turn ||
        players[me.uid].symbol !== "X" &&
          players[me.uid].symbol !== "O"
      ) {
        return;
      }

      if (Object.keys(players).length !== 2) return;

      busy = true;

      try {
        const transaction = await dbSDK.runTransaction(
          stateRef,
          (current) => {
            if (
              !current ||
              !Array.isArray(current.board) ||
              current.board.length !== 42 ||
              current.turn !== mine.symbol ||
              current.winner ||
              current.board.every(Boolean)
            ) {
              return;
            }

            const board = [...current.board];

            let targetRow = -1;

            // Search from the bottom of the column upwards.
            for (let row = 5; row >= 0; row--) {
              if (!board[row * 7 + col]) {
                targetRow = row;
                break;
              }
            }

            if (targetRow === -1) return;

            board[targetRow * 7 + col] = mine.symbol;

            const winner = getWinner(board);

            return {
              board,
              turn: mine.symbol === "X" ? "O" : "X",
              winner
            };
          },
          { applyLocally: false }
        );

        if (!transaction.committed) {
          result.textContent =
            "That move isn't available. Check the current turn.";
        }
      } catch (error) {
        showError(error);
      } finally {
        busy = false;

        if (roomData) renderBoard();
      }
    }

    // Clicking any cell chooses its column.
    grid.addEventListener("click", (event) => {
      const cell = event.target.closest("[data-index]");

      if (!cell) return;

      playColumn(Number(cell.dataset.index) % 7);
    });

  } catch (error) {
    console.error(error);

    result.textContent =
      "Could not load Firebase. Refresh the page and check your connection.";
  }
});