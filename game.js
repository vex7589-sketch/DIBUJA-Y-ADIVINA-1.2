
"use strict";

// 1. CONFIGURACIÓN DE SUPABASE
const SUPABASE_URL = "https://yejubbxolhudirnqxzch.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Co6Xer2naHTUKUbWbUgRg_jixXaJOh";

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

const WORDS = [
  "gato", "perro", "casa", "árbol", "sol",
  "avión", "pelota", "pizza", "bicicleta", "pez",
  "flor", "estrella", "montaña", "teléfono", "manzana"
];

const Game = {
  playerId: "",
  room: null,
  role: null,
  channel: null,
  seconds: 60,
  timer: null,
  canvas: null,
  ctx: null,
  color: "#000000",
  brush: 5,
  tool: "pen",
  drawing: false,
  lastPoint: null,
  lastRemoteSnapshot: "",
  remoteDrawing: false,
  swapBusy: false,
  finishBusy: false,
  lastRoundVersion: null,

  makeId() {
    return Math.random().toString(36).slice(2, 12);
  },

  async init() {
    this.playerId = this.makeId();

    this.canvas = document.getElementById("drawingCanvas");
    this.ctx = this.canvas.getContext("2d");

    this.prepareCanvas();
    this.setupDrawing();
    this.setupControls();
    this.updateTimer();

    this.setStatus("Crea una partida o únete usando un código.");
  },

  setStatus(message) {
    const el = document.getElementById("status");
    if (el) el.textContent = message;
  },

  setFeedback(message, correct = null) {
    const el = document.getElementById("guessFeedback");
    if (el) {
      el.textContent = message;
      el.style.color =
        correct === true ? "#16a34a" :
        correct === false ? "#dc2626" : "";
    }
  },

  prepareCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);

    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.clearLocalCanvas();
  },

  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  },

  setupDrawing() {
    this.canvas.addEventListener("pointerdown", async (event) => {
      if (this.role !== "drawer" || !this.room ||
          this.room.status !== "playing") return;

      this.drawing = true;
      this.canvas.setPointerCapture(event.pointerId);

      this.lastPoint = this.getPoint(event);

      const payload = {
        kind: "start",
        ...this.lastPoint,
        color: this.color,
        brush: this.brush,
        tool: this.tool
      };

      this.drawDot(payload, payload.color, payload.brush, payload.tool);

      this.channel?.send({
        type: "broadcast",
        event: "stroke",
        payload
      });
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.drawing || this.role !== "drawer" ||
          !this.room || this.room.status !== "playing") return;

      const point = this.getPoint(event);
      const from = this.lastPoint;

      const payload = {
        kind: "move",
        from,
        to: point,
        color: this.color,
        brush: this.brush,
        tool: this.tool
      };

      this.drawLine(from, point, this.color, this.brush, this.tool);
      this.lastPoint = point;

      // Enviar los trazos sin esperar a la respuesta de la red.
      this.channel?.send({
        type: "broadcast",
        event: "stroke",
        payload
      });
    });

    const stop = async () => {
      if (!this.drawing) return;

      this.drawing = false;
      this.lastPoint = null;

      await this.saveSnapshot();
    };

    this.canvas.addEventListener("pointerup", stop);
    this.canvas.addEventListener("pointercancel", stop);
    this.canvas.addEventListener("lostpointercapture", stop);
  },

  drawDot(point, color, brush, tool = "pen") {
    this.ctx.save();

    if (tool === "eraser") {
      this.ctx.globalCompositeOperation = "destination-out";
    } else {
      this.ctx.globalCompositeOperation = "source-over";
    }

    this.ctx.beginPath();
    this.ctx.fillStyle = color;
    this.ctx.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.restore();
  },

  drawLine(from, to, color, brush, tool = "pen") {
    if (!from || !to) return;

    this.ctx.save();

    if (tool === "eraser") {
      this.ctx.globalCompositeOperation = "destination-out";
    } else {
      this.ctx.globalCompositeOperation = "source-over";
    }

    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = brush;
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();

    this.ctx.restore();
  },

  async createGame() {
    try {
      if (this.room) {
        this.setStatus("Ya estás en una partida. Recarga la página para iniciar otra.");
        return;
      }

      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];

      const { data, error } = await db.from("games").insert({
        room_code: code,
        status: "waiting",
        drawer_id: this.playerId,
        guesser_id: null,
        secret_word: word,
        drawing: "",
        time_left: 60,
        round_started_at: null,
        guess_feedback: null,
        guess_correct: false,
        round_version: 1
      }).select().single();

      if (error) throw error;

      this.room = data;
      this.role = "drawer";
      this.lastRoundVersion = data.round_version;

      await this.connectRoom();
      this.updateUI();

      this.setStatus("Partida creada. Comparte el código con el segundo jugador.");
      this.setFeedback("");
    } catch (error) {
      console.error(error);
      this.setStatus("No se pudo crear la partida: " + error.message);
    }
  },

  async joinGame() {
    try {
      if (this.room) {
        this.setStatus("Ya estás en una partida. Recarga la página para unirte a otra.");
        return;
      }

      const code = document.getElementById("roomCode")
        .value.trim().toUpperCase();

      if (!code) {
        this.setStatus("Escribe el código de la partida.");
        return;
      }

      const { data, error } = await db.from("games")
        .select("*")
        .eq("room_code", code)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        this.setStatus("No encontramos esa partida. Revisa el código.");
        return;
      }

      if (data.status !== "waiting" || data.guesser_id) {
        this.setStatus("La partida ya empezó o está llena.");
        return;
      }

      // La condición evita ocupar una partida que ya cambió de estado.
      const { data: updated, error: updateError } = await db.from("games")
        .update({
          guesser_id: this.playerId,
          status: "playing",
          round_started_at: new Date().toISOString(),
          time_left: 60,
          guess_feedback: null,
          guess_correct: false
        })
        .eq("room_code", code)
        .eq("status", "waiting")
        .is("guesser_id", null)
        .select()
        .maybeSingle();

      if (updateError) throw updateError;

      if (!updated) {
        this.setStatus("Otro jugador acaba de unirse. Intenta con otra partida.");
        return;
      }

      this.room = updated;
      this.role = "guesser";
      this.lastRoundVersion = updated.round_version;

      await this.connectRoom();
      this.updateUI();
      this.setStatus("¡Conectado! Observa el dibujo y adivina.");
      this.setFeedback("");

      if (updated.drawing) this.loadSnapshot(updated.drawing);
      this.startTimer(updated.round_started_at);
    } catch (error) {
      console.error(error);
      this.setStatus("No se pudo unir a la partida: " + error.message);
    }
  },

  async connectRoom() {
    if (this.channel) {
      await db.removeChannel(this.channel);
    }

    this.channel = db.channel("room-" + this.room.room_code, {
      config: { broadcast: { self: false } }
    });

    this.channel
      .on("broadcast", { event: "stroke" }, ({ payload }) => {
        if (this.role === "drawer") return;

        if (payload.kind === "start") {
          this.drawDot(
            payload, payload.color, payload.brush, payload.tool
          );
        } else if (payload.kind === "move") {
          this.drawLine(
            payload.from, payload.to,
            payload.color, payload.brush, payload.tool
          );
        }
      })
      .on("broadcast", { event: "clear" }, () => {
        if (this.role !== "drawer") this.clearLocalCanvas();
      })
      .on("broadcast", { event: "snapshot" }, ({ payload }) => {
        if (this.role !== "drawer" && payload.image) {
          this.loadSnapshot(payload.image);
        }
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: "room_code=eq." + this.room.room_code
      }, ({ new: updated }) => {
        this.handleRoomUpdate(updated);
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.setStatus("Conectado a la partida " + this.room.room_code);
        }
      });
  },

  handleRoomUpdate(updated) {
    const previousVersion = this.lastRoundVersion;
    this.room = updated;

    this.role = updated.drawer_id === this.playerId
      ? "drawer"
      : updated.guesser_id === this.playerId
        ? "guesser"
        : null;

    const newRound = previousVersion !== updated.round_version;
    this.lastRoundVersion = updated.round_version;

    if (newRound) {
      this.clearLocalCanvas();
      this.lastRemoteSnapshot = "";
      this.setFeedback("");
    }

    this.updateUI();

    if (this.role === "drawer") {
      document.getElementById("secretWord").textContent =
        "TU PALABRA ES: " + updated.secret_word;
    } else if (this.role === "guesser") {
      document.getElementById("secretWord").textContent =
        "¡Adivina la palabra!";
    }

    if (updated.drawing && this.role === "guesser") {
      this.loadSnapshot(updated.drawing);
    } else if (newRound && this.role === "guesser") {
      this.clearLocalCanvas();
    }

    if (updated.guess_feedback) {
      this.setFeedback(
        updated.guess_feedback,
        updated.guess_correct
      );
    }

    if (updated.status === "playing" && updated.round_started_at) {
      this.startTimer(updated.round_started_at);
    } else if (updated.status === "finished") {
      this.stopTimer();
      this.setStatus("Ronda terminada.");
    } else if (updated.status === "waiting") {
      this.stopTimer();
    }
  },

  async saveSnapshot() {
    if (!this.canvas || !this.room || this.role !== "drawer") return;

    const image = this.canvas.toDataURL("image/png");

    this.channel?.send({
      type: "broadcast",
      event: "snapshot",
      payload: { image }
    });

    const { error } = await db.from("games")
      .update({ drawing: image })
      .eq("room_code", this.room.room_code);

    if (error) console.error("No se pudo guardar el dibujo:", error.message);
  },

  loadSnapshot(image) {
    if (!image || image === this.lastRemoteSnapshot || this.remoteDrawing) {
      return;
    }

    this.remoteDrawing = true;

    const img = new Image();

    img.onload = () => {
      const rect = this.canvas.getBoundingClientRect();

      this.ctx.clearRect(0, 0, rect.width, rect.height);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, rect.width, rect.height);
      this.ctx.drawImage(img, 0, 0, rect.width, rect.height);

      this.lastRemoteSnapshot = image;
      this.remoteDrawing = false;
    };

    img.onerror = () => {
      this.remoteDrawing = false;
    };

    img.src = image;
  },

  async clearCanvas() {
    if (this.role !== "drawer" || !this.room) {
      this.setStatus("Solo quien dibuja puede limpiar el lienzo.");
      return;
    }

    this.clearLocalCanvas();
    this.lastRemoteSnapshot = "";

    this.channel?.send({
      type: "broadcast",
      event: "clear",
      payload: {}
    });

    await this.saveSnapshot();
  },

  clearLocalCanvas() {
    if (!this.canvas || !this.ctx) return;

    const rect = this.canvas.getBoundingClientRect();

    this.ctx.save();
    this.ctx.globalCompositeOperation = "source-over";
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.restore();
  },

  async submitGuess() {
    if (!this.room || this.role !== "guesser" ||
        this.room.status !== "playing") {
      this.setStatus("Únete a una partida activa para adivinar.");
      return;
    }

    const input = document.getElementById("guessInput");
    const answer = input.value.trim().toLocaleLowerCase("es");
    if (!answer) return;

    const correct = answer ===
      String(this.room.secret_word).trim().toLocaleLowerCase("es");

    const feedback = correct
      ? "🎉 ¡Respuesta correcta! ¡Has acertado la palabra!"
      : "❌ No es correcto. ¡Inténtalo otra vez!";

    this.setFeedback(feedback, correct);

    const { error } = await db.from("games")
      .update({
        guess_feedback: feedback,
        guess_correct: correct,
        ...(correct ? { status: "finished", time_left: 0 } : {})
      })
      .eq("room_code", this.room.room_code)
      .eq("status", "playing");

    if (error) {
      console.error(error);
      this.setStatus("No se pudo guardar el resultado: " + error.message);
      return;
    }

    input.value = "";

    if (correct) {
      this.stopTimer();
      this.setStatus("¡Partida ganada!");
    }
  },

  async swapRoles() {
    if (this.swapBusy || !this.room) return;

    if (!this.room.guesser_id ||
        this.room.status === "waiting") {
      this.setStatus("Esperen a que se una el segundo jugador.");
      return;
    }

    if (this.room.status === "finished") {
      this.setStatus("La ronda terminó. Recarga para crear otra partida.");
      return;
    }

    this.swapBusy = true;

    try {
      const newDrawer = this.room.guesser_id;
      const newGuesser = this.room.drawer_id;
      const newWord = WORDS[Math.floor(Math.random() * WORDS.length)];
      const nextVersion = Number(this.room.round_version || 1) + 1;

      // Actualización conjunta: ambos roles cambian en la misma operación.
      const { data, error } = await db.from("games")
        .update({
          drawer_id: newDrawer,
          guesser_id: newGuesser,
          secret_word: newWord,
          drawing: "",
          status: "playing",
          time_left: 60,
          round_started_at: new Date().toISOString(),
          guess_feedback: null,
          guess_correct: false,
          round_version: nextVersion
        })
        .eq("room_code", this.room.room_code)
        .eq("round_version", this.room.round_version)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        this.setStatus("La partida cambió al mismo tiempo. Espera un momento.");
        return;
      }

      this.handleRoomUpdate(data);
      this.setStatus("🔄 ¡Puestos intercambiados! Comienza la nueva ronda.");
    } catch (error) {
      console.error(error);
      this.setStatus("No se pudieron intercambiar los puestos: " + error.message);
    } finally {
      this.swapBusy = false;
    }
  },

  updateUI() {
    if (!this.room) return;

    const roomDisplay = document.getElementById("roomDisplay");
    if (roomDisplay) {
      roomDisplay.textContent = "Código de partida: " + this.room.room_code;
    }

    const title = document.getElementById("gameTitle");
    if (title) {
      title.textContent = this.role === "drawer"
        ? "Tu espacio de dibujo"
        : "Adivina el dibujo";
    }

    const word = document.getElementById("secretWord");
    if (word) {
      word.textContent = this.role === "drawer"
        ? "TU PALABRA ES: " + this.room.secret_word
        : "¡Adivina la palabra!";
    }

    const guessArea = document.getElementById("guessArea");
    if (guessArea) {
      guessArea.style.display = this.role === "guesser" ? "flex" : "none";
    }

    this.canvas.style.pointerEvents =
      this.role === "drawer" && this.room.status === "playing"
        ? "auto" : "none";

    this.canvas.style.touchAction = "none";

    document.querySelectorAll("[data-color]").forEach((el) => {
      el.disabled = this.role !== "drawer" ||
        this.room.status !== "playing";
    });

    const brushInput = document.getElementById("brushSize");
    if (brushInput) {
      brushInput.disabled = this.role !== "drawer" ||
        this.room.status !== "playing";
    }

    const clearButton = document.getElementById("clearCanvas");
    if (clearButton) {
      clearButton.disabled = this.role !== "drawer" ||
        this.room.status !== "playing";
    }

    const eraserButton = document.getElementById("eraserTool");
    if (eraserButton) {
      eraserButton.disabled = this.role !== "drawer" ||
        this.room.status !== "playing";
      eraserButton.classList.toggle("selected", this.tool === "eraser");
    }

    const swapButton = document.getElementById("swapRoles");
    if (swapButton) {
      swapButton.disabled = !this.room.guesser_id ||
        this.room.status !== "playing";
    }
  },

  startTimer(startedAt) {
    this.stopTimer();

    if (!startedAt) return;

    const start = new Date(startedAt).getTime();
    if (!Number.isFinite(start)) return;

    const tick = async () => {
      const elapsed = Math.floor((Date.now() - start) / 1000);
      this.seconds = Math.max(0, 60 - elapsed);
      this.updateTimer();

      if (this.seconds === 0) {
        this.stopTimer();

        if (this.room && this.room.status === "playing" &&
            this.role === "drawer" && !this.finishBusy) {
          this.finishBusy = true;

          const { error } = await db.from("games")
            .update({
              status: "finished",
              time_left: 0,
              guess_feedback: "⏰ ¡Se acabó el tiempo!",
              guess_correct: false
            })
            .eq("room_code", this.room.room_code)
            .eq("status", "playing");

          if (error) console.error(error);
          this.finishBusy = false;
        }
      }
    };

    tick();
    this.timer = setInterval(tick, 250);
  },

  stopTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  updateTimer() {
    const el = document.getElementById("timer");
    if (!el) return;

    const seconds = Math.max(0, this.seconds);
    el.textContent =
      String(Math.floor(seconds / 60)).padStart(2, "0") + ":" +
      String(seconds % 60).padStart(2, "0");

    el.classList.toggle("urgent", seconds <= 10);
  },

  setupControls() {
    document.getElementById("createGame")
      ?.addEventListener("click", () => this.createGame());

    document.getElementById("joinGame")
      ?.addEventListener("click", () => this.joinGame());

    document.getElementById("submitGuess")
      ?.addEventListener("click", () => this.submitGuess());

    document.getElementById("swapRoles")
      ?.addEventListener("click", () => this.swapRoles());

    document.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        this.color = button.dataset.color;
        this.tool = "pen";

        document.querySelectorAll("[data-color]").forEach((item) => {
          item.classList.toggle("selected", item === button);
        });

        document.getElementById("eraserTool")
          ?.classList.remove("selected");
      });
    });

    document.getElementById("brushSize")
      ?.addEventListener("input", (event) => {
        this.brush = Number(event.target.value);
      });

    document.getElementById("clearCanvas")
      ?.addEventListener("click", () => this.clearCanvas());

    document.getElementById("eraserTool")
      ?.addEventListener("click", () => {
        if (this.role !== "drawer") return;

        this.tool = "eraser";

        document.querySelectorAll("[data-color]").forEach((item) => {
          item.classList.remove("selected");
        });

        document.getElementById("eraserTool")
          ?.classList.add("selected");

        this.setStatus("🧽 Borrador activado. Pasa sobre las partes que quieras borrar.");
      });

    document.getElementById("guessInput")
      ?.addEventListener("keydown", (event) => {
        if (event.key === "Enter") this.submitGuess();
      });
  }
};

window.Game = Game;

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Game.init());
} else {
  Game.init();
}
