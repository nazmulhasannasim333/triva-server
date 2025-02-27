const express = require("express");
const cors = require("cors");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
require("dotenv").config();

const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
// Create server and Socket.IO instance
const server = http.createServer(app);
const allowedOrigins = ["https://triva-game-topaz.vercel.app", "http://localhost:5173"];

app.use(cors({ origin: allowedOrigins, credentials: true }));

const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
  transports: ["websocket", "polling"],
});

// Quiz and lobby data
const quizzes = [
  {
    "id": 1,
    "category": "General Knowledge",
    "questions": [
      {
        "id": 1,
        "question": "What is the capital of France?",
        "options": ["Berlin", "Madrid", "Paris", "Lisbon"],
        "correctAnswer": "Paris"
      },
      {
        "id": 2,
        "question": "Which planet is known as the Red Planet?",
        "options": ["Earth", "Mars", "Jupiter", "Venus"],
        "correctAnswer": "Mars"
      },
      {
        "id": 3,
        "question": "What is the largest ocean on Earth?",
        "options": ["Atlantic Ocean", "Indian Ocean", "Pacific Ocean", "Arctic Ocean"],
        "correctAnswer": "Pacific Ocean"
      }
    ]
  },
  {
    "id": 2,
    "category": "Science",
    "questions": [
      {
        "id": 4,
        "question": "What is the chemical symbol for water?",
        "options": ["H2O", "O2", "CO2", "H2"],
        "correctAnswer": "H2O"
      },
      {
        "id": 5,
        "question": "What gas do plants primarily absorb from the atmosphere?",
        "options": ["Oxygen", "Nitrogen", "Carbon Dioxide", "Hydrogen"],
        "correctAnswer": "Carbon Dioxide"
      },
      {
        "id": 6,
        "question": "Who developed the theory of relativity?",
        "options": ["Isaac Newton", "Albert Einstein", "Galileo Galilei", "Nikola Tesla"],
        "correctAnswer": "Albert Einstein"
      }
    ]
  },
  {
    "id": 3,
    "category": "History",
    "questions": [
      {
        "id": 7,
        "question": "Who was the first President of the United States?",
        "options": ["Thomas Jefferson", "Abraham Lincoln", "George Washington", "John Adams"],
        "correctAnswer": "George Washington"
      },
      {
        "id": 8,
        "question": "In which year did World War II end?",
        "options": ["1940", "1945", "1950", "1955"],
        "correctAnswer": "1945"
      },
      {
        "id": 9,
        "question": "Which ancient civilization built the pyramids?",
        "options": ["Romans", "Aztecs", "Egyptians", "Mayans"],
        "correctAnswer": "Egyptians"
      }
    ]
  },
  {
    "id": 4,
    "category": "Sports",
    "questions": [
      {
        "id": 10,
        "question": "How many players are on a soccer team?",
        "options": ["9", "10", "11", "12"],
        "correctAnswer": "11"
      },
      {
        "id": 11,
        "question": "Which sport is known as 'America's pastime'?",
        "options": ["Football", "Basketball", "Baseball", "Hockey"],
        "correctAnswer": "Baseball"
      },
      {
        "id": 12,
        "question": "In tennis, what is the term for a score of zero?",
        "options": ["Love", "Nil", "Zero", "Void"],
        "correctAnswer": "Love"
      }
    ]
  }
]
const lobbies = {};

// Socket.IO events
io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;

  if (!userId) {
    console.log("User connected without a valid userId");
    return;
  }

  console.log(`User connected: socketId=${socket.id}, userId=${userId}`);

  // Cancel disconnect timeout if the user reconnects
  if (socket.disconnectTimeoutId) {
    clearTimeout(socket.disconnectTimeoutId);
    console.log(`Reconnect detected for userId=${userId}, timeout cleared.`);
  }

// Update the player's socketId in all lobbies
Object.keys(lobbies).forEach((lobbyCode) => {
  const lobby = lobbies[lobbyCode];

  const player = lobby.players.find((player) => player.userId === userId);
  if (player) {
    player.socketId = socket.id;
    console.log(`Updated socketId for userId=${userId} in lobby=${lobbyCode}`);
  }

  if (lobby.leader.userId === userId) {
    lobby.leader.socketId = socket.id;
    console.log(
      `Updated socketId for leader userId=${userId} in lobby=${lobbyCode}`
    );
  }
});

  // Fetch quizzes
  socket.on("getQuizzes", () => {
    socket.emit("quizzes", quizzes);
    console.log("Quizzes sent to client");
  });

  // Fetch lobby data
  socket.on("getLobby", (lobbyCode, callback) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
      return callback({ success: false, message: "Lobby not found" });
    }

    console.log(`Lobby data sent to client: ${lobby.lobbyCode}`);

    const quiz = quizzes.find((quiz) => quiz.category === lobby.quizId);
    if (!quiz) {
      return callback({ success: false, message: "Quiz not found" });
    }

    const data = {
      lobby,
      quiz: {
        category: quiz.category,
        title: quiz.title,
        questions: quiz.questions,
      },
    };

    callback({ success: true, data });
  });

  // Create a lobby
  socket.on("createLobby", (data, callback) => {
    const { name, quizId, lobbyCode } = data;

    if (!name || !quizId || !lobbyCode) {
      return callback({ success: false, message: "Invalid data" });
    }

    const selectedQuiz = quizzes.find((quiz) => quiz.category === quizId);
    if (!selectedQuiz) {
      return callback({ success: false, message: "Invalid quiz ID" });
    }
    const quiz = quizzes.find((quiz) => quiz.category === quizId);
    if (!quiz) {
      return callback({ success: false, message: "Quiz not found" });
    }

    lobbies[lobbyCode] = {
      leader: { userId, socketId: socket.id, name },
      quizId,
      quizTitle: selectedQuiz.category,
      lobbyCode,
      quiz,
      players: [
        {
          userId,
          socketId: socket.id,
          name,
          joinedAt: new Date().toISOString(),
        },
      ],
      currentQuestion: 0,
      answers: {},
    };

    socket.join(lobbyCode);
    callback({ success: true, lobbyCode });
    console.log(`Lobby created: ${lobbyCode} by ${name}`);
  });

  // Join a lobby
  socket.on("joinLobby", (data, callback) => {
    const { name, lobbyCode } = data;

    if (!name || !lobbyCode) {
      return callback({ success: false, message: "Invalid data" });
    }

    const lobby = lobbies[lobbyCode];
    if (!lobby) {
      return callback({ success: false, message: "Lobby not found" });
    }

    if (lobby.players.length >= 4) {
      return callback({ success: false, message: "Lobby is full" });
    }

    let player = lobby.players.find((player) => player.userId === userId);
    if (player) {
      player.socketId = socket.id;
      console.log(`Player rejoined: ${name} in lobby ${lobbyCode}`);
    } else {
      player = {
        userId,
        socketId: socket.id,
        name,
        joinedAt: new Date().toISOString(),
      };
      lobby.players.push(player);
    }

    socket.join(lobbyCode);
    // new player joined to send message to all players
    io.to(lobbyCode).emit("playerJoined", `${name} has joined`);
    io.to(lobbyCode).emit("updatePlayers", lobby.players);
    callback({ success: true, lobbyCode });
    console.log(`Player ${name} joined lobby: ${lobbyCode}`);
  });

  socket.on("startQuiz", (lobbyCode) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
      socket.emit("error", "Lobby not found");
      return;
    }
  
    if (lobby.leader.userId !== userId) {
      socket.emit("error", "Only the lobby leader can start the quiz");
      return;
    }
  
    // If the quiz is already started, send the current state to the leader
    if (lobby.quizStarted) {
      socket.emit("quizStarted");
      if (lobby.currentQuestion < lobby.quiz.questions.length) {
        const question = lobby.quiz.questions[lobby.currentQuestion];
        socket.emit("newQuestion", {
          question: question.question,
          options: question.options,
          questionIndex: lobby.currentQuestion,
        });
      } else {
        const results = calculateResults(lobby);
        socket.emit("quizEnded", results);
      }
      return;
    }
  
    // Initialize the quiz if it hasn't started
    lobby.quizStarted = true;
    lobby.currentQuestion = 0;
    lobby.answers = {};
  
    io.to(lobbyCode).emit("quizStarted");
  
    console.log(`Quiz started for lobby ${lobbyCode}`, lobby);
  
    const sendNextQuestion = () => {
      if (lobby.currentQuestion < lobby.quiz.questions.length) {
        const question = lobby.quiz.questions[lobby.currentQuestion];
        io.to(lobbyCode).emit("newQuestion", {
          question: question.question,
          options: question.options,
          questionIndex: lobby.currentQuestion,
        });
  
        // Timer
        let timeLeft = 10; 
        const timerInterval = setInterval(() => {
          timeLeft -= 1;
          io.to(lobbyCode).emit("timer", timeLeft);
  
          if (timeLeft <= 0) {
            clearInterval(timerInterval);
          }
        }, 1000);
  
        lobby.currentQuestion += 1;
        lobby.questionTimer = setTimeout(() => {
          clearInterval(timerInterval);
          sendNextQuestion();
        }, 10000); 
      } else {
        clearTimeout(lobby.questionTimer);
        const results = calculateResults(lobby);
        io.to(lobbyCode).emit("quizEnded", results);
      }
    };
  
    sendNextQuestion();
  });

  socket.on("restartQuiz", (lobbyCode) => {
    const lobby = lobbies[lobbyCode];
    if (!lobby) {
      socket.emit("error", "Lobby not found");
      return;
    }

    if (lobby.leader.userId !== userId) {
      socket.emit("error", "Only the lobby leader can restart the quiz");
      return;
    }

    // Reset quiz state
    lobby.quizStarted = false;
    lobby.currentQuestion = 0;
    lobby.answers = {};

    io.to(lobbyCode).emit("quizReset");
  });
  
    // Handle player answers
    socket.on("submitAnswer", ({ lobbyCode, questionIndex, answer }) => {
      const lobby = lobbies[lobbyCode];
      if (!lobby || !lobby.quizStarted) {
        socket.emit("error", "Quiz not found or not started");
        return;
      }
  
      if (!lobby.answers[userId]) {
        lobby.answers[userId] = [];
      }
  
      const question = lobby.quiz.questions[questionIndex];
      const isCorrect = question.correctAnswer === answer;
  
      lobby.answers[userId][questionIndex] = {
        answer,
        correct: isCorrect,
      };
  
      console.log(
        `Answer received from userId=${userId} for questionIndex=${questionIndex}: ${answer}`
      );
    });
  
    // Calculate quiz results
    const calculateResults = (lobby) => {
      const results = lobby.players.map((player) => {
        const answers = lobby.answers[player.userId] || [];
        const correctAnswers = answers.filter((a) => a.correct).length;
  
        return {
          userId: player.userId,
          name: player.name,
          correctAnswers,
        };
      });
  
      return results;
    };

  // Handle player disconnect
socket.on("disconnect", () => {
  console.log(`User disconnected: ${socket.id}`);

  // Set a grace period for reconnection
  const disconnectTimeout = setTimeout(() => {
    Object.keys(lobbies).forEach((lobbyCode) => {
      const lobby = lobbies[lobbyCode];
      const playerIndex = lobby.players.findIndex((player) => player.socketId === socket.id);

      if (playerIndex !== -1) {
        const player = lobby.players.splice(playerIndex, 1)[0];
        io.to(lobbyCode).emit("playerLeft", `${player.name} has left`);
        io.to(lobbyCode).emit("updatePlayers", lobby.players);

        // Delete lobby if empty
        if (lobby.players.length === 0) {
          delete lobbies[lobbyCode];
          console.log(`Lobby ${lobbyCode} closed`);
        }
      }
    });
  }, 2000);

  // Store the timeout ID in case the user reconnects
  socket.disconnectTimeoutId = disconnectTimeout;
});

});


// Test route
app.get("/", (req, res) => {
  res.send("Trivia game server is running");
});

// Start server
server.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
