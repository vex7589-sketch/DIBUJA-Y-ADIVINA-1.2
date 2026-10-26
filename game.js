
"use strict";

// =====================================
// DIBUJA Y ADIVINA
// Lógica del juego
// =====================================

const Game = {
  timer: null,
  seconds: 60,
  currentRole: null,
  currentColor: "#000000",
  brushSize: 5,
  isDrawing: false,
  canvas: null,
  ctx: null,

  // Inicializar el juego
  init() {
    this.canvas = document.getElementById("drawingCanvas");

    if (this.canvas) {
      this.ctx = this.canvas.getContext("2d");
      this.prepareCanvas();
      this.setupDrawing();
    }

    this.setupControls();
    console.log("Dibuja y Adivina está listo.");
  },

  // Preparar el lienzo
  prepareCanvas() {
    const canvas = this.canvas;
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;

    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;

    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";
    this.ctx.strokeStyle = this.currentColor;
    this.ctx.lineWidth = this.brushSize;
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
  },

  // Obtener posición del puntero
  getPosition(event) {
    const rect = this.canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  },

  // Configurar dibujo con mouse o pantalla táctil
  setupDrawing() {
    const canvas = this.canvas;

    canvas.addEventListener("pointerdown", (event) => {
      this.isDrawing = true;
      canvas.setPointerCapture(event.pointerId);

      const pos = this.getPosition(event);
      this.ctx.beginPath();
      this.ctx.moveTo(pos.x, pos.y);
      this.ctx.lineTo(pos.x + 0.1, pos.y + 0.1);
      this.ctx.stroke();
    });

    canvas.addEventListener("pointermove", (event) => {
      if (!this.isDrawing) return;

      const pos = this.getPosition(event);

      this.ctx.strokeStyle = this.currentColor;
      this.ctx.lineWidth = this.brushSize;
      this.ctx.lineTo(pos.x, pos.y);
      this.ctx.stroke();
    });

    const stopDrawing = () => {
      this.isDrawing = false;
      this.ctx.beginPath();
    };

    canvas.addEventListener("pointerup", stopDrawing);
    canvas.addEventListener("pointercancel", stopDrawing);
    canvas.addEventListener("pointerleave", stopDrawing);
  },

  // Cambiar color del pincel
  setColor(color) {
    this.currentColor = color;

    if (this.ctx) {
      this.ctx.strokeStyle = color;
    }
  },

  // Cambiar grosor del pincel
  setBrushSize(size) {
    const parsedSize = Number(size);

    if (Number.isFinite(parsedSize)) {
      this.brushSize = Math.max(1, Math.min(40, parsedSize));

      if (this.ctx) {
        this.ctx.lineWidth = this.brushSize;
      }
    }
  },

  // Limpiar el lienzo
  clearCanvas() {
    if (!this.canvas || !this.ctx) return;

    const rect = this.canvas.getBoundingClientRect();

    this.ctx.clearRect(0, 0, rect.width, rect.height);
    this.ctx.fillStyle = "#ffffff";
    this.ctx.fillRect(0, 0, rect.width, rect.height);
    this.ctx.beginPath();
  },

  // Iniciar el temporizador
  startTimer(duration = 60, onFinish = null) {
    this.stopTimer();
    this.seconds = duration;
    this.updateTimerDisplay();

    this.timer = setInterval(() => {
      this.seconds--;
      this.updateTimerDisplay();

      if (this.seconds <= 0) {
        this.stopTimer();

        if (typeof onFinish === "function") {
          onFinish();
        }
      }
    }, 1000);
  },

  // Detener el temporizador
  stopTimer() {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
  },

  // Mostrar tiempo restante
  updateTimerDisplay() {
    const timerElement = document.getElementById("timer");

    if (timerElement) {
      const minutes = Math.floor(this.seconds / 60);
      const seconds = this.seconds % 60;

      timerElement.textContent =
        `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

      timerElement.classList.toggle("urgent", this.seconds <= 10);
    }
  },

  // Seleccionar el rol del jugador
  chooseRole(role) {
    if (role !== "draw" && role !== "guess") return;

    this.currentRole = role;

    const status = document.getElementById("status");

    if (status) {
      status.textContent =
        role === "draw"
          ? "Has elegido dibujar. ¡Prepárate!"
          : "Has elegido adivinar. ¡Prepárate!";
    }
  },

  // Conectar controles disponibles
  setupControls() {
    document.querySelectorAll("[data-color]").forEach((button) => {
      button.addEventListener("click", () => {
        this.setColor(button.dataset.color);

        document.querySelectorAll("[data-color]").forEach((item) => {
          item.classList.toggle("selected", item === button);
        });
      });
    });

    const brushInput = document.getElementById("brushSize");

    if (brushInput) {
      brushInput.addEventListener("input", () => {
        this.setBrushSize(brushInput.value);
      });
    }

    const clearButton = document.getElementById("clearCanvas");

    if (clearButton) {
      clearButton.addEventListener("click", () => {
        this.clearCanvas();
      });
    }
  }
};

window.Game = Game;

// Inicializar después de cargar el documento
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => Game.init());
} else {
  Game.init();
}
