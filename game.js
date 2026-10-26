
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
  playerId: this.makeId?.() || Math.random().toString(36).slice(2),
  room: null,
  role: null,
  channel: null,
  seconds: 60,
  timer: null,
  canvas: null,
  ctx: null,
  color: "#000000",
  brush: 5,
  drawing: false,
  lastPoint: null,
  lastSnapshot: "",
  remoteDrawing: false,

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
    this.setStatus("Crea una partida o únete usando un código.");
  },

  setStatus(message) {
    const el = document.getElementById("status");
    if (el) el.textContent = message;
  },

  prepareCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    this.canvas.width = rect.width * ratio;
    this.canvas.height = rect.height * ratio;
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
  },

  getPoint(event) {
    const rect = this.canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  },

  setupDrawing() {
    this.canvas.addEventListener("pointerdown", async (event) => {
      if (this.role !== "drawer" || !this.room) return;
      this.drawing = true;
      this.canvas.setPointerCapture(event.pointerId);
      this.lastPoint = this.getPoint(event);
      await this.channel?.send({
        type: "broadcast",
        event: "stroke",
        payload: {
          kind: "start", ...this.lastPoint,
          color: this.color, brush: this.brush
        }
      });
      this.drawDot(this.lastPoint, this.color, this.brush);
    });

    this.canvas.addEventListener("pointermove", async (event) => {
      if (!this.drawing || this.role !== "drawer" || !this.room) return;
      const point = this.getPoint(event);
      const from = this.lastPoint;
      this.drawLine(from, point, this.color, this.brush);
      this.lastPoint = point;
      await this.channel?.send({
        type: "broadcast",
        event: "stroke",
        payload: {
          kind: "move", from, to: point,
          color: this.color, brush: this.brush
        }
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
    this.canvas.addEventListener("pointerleave", stop);
  },

  drawDot(point, color, brush) {
    this.ctx.beginPath();
    this.ctx.fillStyle = color;
    this.ctx.arc(point.x, point.y, brush / 2, 0, Math.PI * 2);
    this.ctx.fill();
  },

  drawLine(from, to, color, brush) {
    if (!from || !to) return;
    this.ctx.beginPath();
    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = brush;
    this.ctx.lineCap = "round";
    this.ctx.moveTo(from.x, from.y);
    this.ctx.lineTo(to.x, to.y);
    this.ctx.stroke();
  },

  async createGame() {
    try {
      const code = Math.random().toString(36).slice(2, 8).toUpperCase();
      const word = WORDS[Math.floor(Math.random() * WORDS.length)];

      const { data, error } = await db.from("games").insert({
        room_code: code,
        status: "waiting",
        drawer_id: this.playerId,
        secret_word: word,
        drawing: "",
        time_left: 60
      }).select().single();

      if (error) throw error;

      this.room = data;
      this.role = "drawer";
      await this.connectRoom();
      this.updateUI();
      document.getElementById("secretWord").textContent =
        "TU PALABRA ES: " + data.secret_word;
      this.setStatus("Partida creada. Esperando al segundo jugador…");
    } catch (error) {
      console.error(error);
      this.setStatus("No se pudo crear la partida: " + error.message);
    }
  },

  async joinGame() {
    try {
      const code = document.getElementById("roomCode").value.trim().toUpperCase();
      if (!code) {
        this.setStatus("Escribe el código de la partida.");
        return;
      }

      const { data, error } = await db.from("games")
        .select("*").eq("room_code", code).maybeSingle();

      if (error) throw error;
      if (!data) {
        this.setStatus("No encontramos esa partida. Revisa el código.");
        return;
      }
      if (data.guesser_id && data.guesser_id !== this.playerId) {
        this.setStatus("Ya hay un segundo jugador en esta partida.");
        return;
      }

      const { data: updated, error: updateError } = await db.from("games")
        .update({
          guesser_id: this.playerId,
          status: "playing"
        }).eq("room_code", code).select().single();

      if (updateError) throw updateError;

      this.room = updated;
      this.role = "guesser";
      await this.connectRoom();
      this.updateUI();
      document.getElementById("secretWord").textContent = "¡Adivina la palabra!";
      this.setStatus("¡Te has unido! Observa el dibujo y escribe tu respuesta.");
      if (updated.drawing) this.loadSnapshot(updated.drawing);
      this.startTimer();
    } catch (error) {
      console.error(error);
      this.setStatus("No se pudo unir a la partida: " + error.message);
    }
  },

  async connectRoom() {
    if (this.channel) await db.removeChannel(this.channel);

    this.channel = db.channel("room-" + this.room.room_code, {
      config: { broadcast: { self: false } }
    });

    this.channel
      .on("broadcast", { event: "stroke" }, ({ payload }) => {
        if (this.role === "drawer") return;
        if (payload.kind === "start") {
          this.drawDot(payload, payload.color, payload.brush);
        } else if (payload.kind === "move") {
          this.drawLine(payload.from, payload.to, payload.color, payload.brush);
        }
      })
      .on("broadcast", { event: "clear" }, () => {
        this.clearLocalCanvas();
      })
      .on("broadcast", { event: "snapshot" }, ({ payload }) => {
        if (this.role !== "drawer" && payload.image) this.loadSnapshot(payload.image);
      })
      .on("postgres_changes", {
        event: "UPDATE",
        schema: "public",
        table: "games",
        filter: "room_code=eq." + this.room.room_code
      }, (payload) => {
        this.room = payload.new;
        if (payload.new.drawing && this.role !== "drawer") {
          this.loadSnapshot(payload.new.drawing);
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          this.setStatus("Conectado a la partida " + this.room.room_code);
        }
      });
  },

  async saveSnapshot() {
    if (!this.canvas || !this.room || this.role !== "drawer") return;
    const image = this.canvas.toDataURL("image/png");
    this.lastSnapshot = image;
    await this.channel?.send({
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
    if (!image || this.remoteDrawing) return;
    this.remoteDrawing = true;
    const img = new Image();
    img.onload = () => {
      const rect = this.canvas.getBoundingClientRect();
      this.ctx.clearRect(0, 0, rect.width, rect.height);
      this.ctx.fillStyle = "#ffffff";
      this.ctx.fillRect(0, 0, rect.width, rect.height);
      this.ctx.drawImage(img, 0, 0, rect.width, rect.height);
      this.remoteDrawing = false;
    };
    img.onerror = () => { this.remoteDrawing = false; };
    img.src = image;
  },

  async clearCanvas() {
    if (this.role !== "drawer") {
      this.setStatus("Solo quien dibuja puede limpiar el lienzo.");
      return;
    }
    this.clearLocalCanvas();
    await this.channel?.send({ type: "broadcast", event: "clear", payload: {} });
    await this.saveSnapshot();
  },

  clearLocalCanvas() {
    const rect = this.canvas.getBoundingClientRect();
    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
  },

  async submitGuess() {
    if (!this.room || this.role !== "guesser") {
      this.setStatus("Únete a una partida para adivinar.");
      return;
    }

    const input = document.getElementById("guessInput");
    const answer = input.value.trim().toLowerCase();
    if (!answer) return;

    if (answer === String(this.room.secret_word).toLowerCase()) {
      this.setStatus("🎉 ¡Correcto! La palabra era " + this.room.secret_word + ".");
      await db.from("games").update({ status: "finished" })
        .eq("room_code", this.room.room_code);
    } else {
      this.setStatus("Todavía no. ¡Inténtalo de nuevo!");
    }
    input.value = "";
  },

  async swapRoles() {
    if (!this.room || !this.room.guesser_id) {
      this.setStatus("Necesitan estar los dos jugadores para intercambiar puestos.");
      return;
    }

    const oldDrawer = this.room.drawer_id;
    const oldGuesser = this.room.guesser_id;
    const newDrawer = oldGuesser;
    const newGuesser = oldDrawer;

    const { data, error } = await db.from("games").update({
      drawer_id: newDrawer,
      guesser_id: newGuesser,
      secret_word: WORDS[Math.floor(Math.random() * WORDS.length)],
      drawing: "",
      status: "playing",
      time_left: 60
    }).eq("room_code", this.room.room_code).select().single();

    if (error) {
      this.setStatus("No se pudieron intercambiar los puestos: " + error.message);
      return;
    }

    this.room = data;
    this.role = this.playerId === data.drawer_id ? "drawer" : "guesser";
    this.clearLocalCanvas();
    this.updateUI();
    document.getElementById("secretWord").textContent =
      this.role === "drawer" ? "TU PALABRA ES: " + data.secret_word : "¡Adivina la palabra!";
    this.setStatus("¡Puestos intercambiados!");
    await this.connectRoom();
    if (this.role === "drawer") this.startTimer();
  },

  updateUI() {
    document.getElementById("roomDisplay").textContent =
      "Código de partida: " + this.room.room_code;
    document.getElementById("gameTitle").textContent =
      this.role === "drawer" ? "Tu espacio de dibujo" : "Adivina el dibujo";
    document.getElementById("secretWord").textContent =
      this.role === "drawer" ? "TU PALABRA ES: " + this.room.secret_word : "¡Adivina la palabra!";
    document.getElementById("guessArea").style.display =
      this.role === "guesser" ? "flex" : "none";
    this.canvas.style.pointerEvents = this.role === "drawer" ? "auto" : "none";
    document.querySelectorAll("[data-color]").forEach(el => {
      el.disabled = this.role !== "drawer";
    });
    document.getElementById("brushSize").disabled = this.role !== "drawer";
    document.getElementById("clearCanvas").disabled = this.role !== "drawer";
  },

  startTimer() {
    clearInterval(this.timer);
    this.seconds = 60;
    this.updateTimer();
    this.timer = setInterval(async () => {
      this.seconds--;
      this.updateTimer();
      if (this.seconds <= 0) {
        clearInterval(this.timer);
        this.setStatus("⏰ ¡Se acabó el tiempo!");
        if (this.room) {
          await db.from("games").update({ time_left: 0 })
            .eq("room_code", this.room.room_code);
        }
      }
    }, 1000);
  },

  updateTimer() {
    const el = document.getElementById("timer");
    if (el) {
      el.textContent = String(Math.floor(this.seconds / 60)).padStart(2, "0")
        + ":" + String(this.seconds % 60).padStart(2, "0");
    }
  },

  setupControls() {
    document.getElementById("createGame").addEventListener("click", () => this.createGame());
    document.getElementById("joinGame").addEventListener("click", () => this.joinGame());
    document.getElementById("submitGuess").addEventListener("click", () => this.submitGuess());
    document.getElementById("swapRoles").addEventListener("click", () => this.swapRoles());

    document.querySelectorAll("[data-color]").forEach(button => {
      button.addEventListener("click", () => {
        this.color = button.dataset.color;
        document.querySelectorAll("[data-color]").forEach(item =>
          item.classList.toggle("selected", item === button));
      });
    });

    document.getElementById("brushSize").addEventListener("input", event => {
      this.brush = Number(event.target.value);
    });

    document.getElementById("clearCanvas").addEventListener("click", () => this.clearCanvas());
    document.getElementById("guessInput").addEventListener("keydown", event => {
      if (event.key === "Enter") this.submitGuess();
    });
  }
};

window.Game = Game;
document.addEventListener("DOMContentLoaded", () => Game.init());
