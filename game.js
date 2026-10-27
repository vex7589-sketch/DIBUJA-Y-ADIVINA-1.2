"use strict";

// ==========================================
// SUPABASE
// ==========================================

const SUPABASE_URL = "https://yejubbxolhudirnqxzch.supabase.co";
const SUPABASE_KEY = "sb_publishable_-Co6Xer2naHTUKUbWbUgRg_jixXaJOh";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// ==========================================
// PALABRAS
// ==========================================

const WORDS = [
  "gato",
  "perro",
  "casa",
  "árbol",
  "sol",
  "avión",
  "pelota",
  "pizza",
  "bicicleta",
  "pez",
  "flor",
  "estrella",
  "montaña",
  "teléfono",
  "manzana",
  "computadora",
  "fútbol",
  "coche",
  "helado",
  "playa"
];


// ==========================================
// JUEGO
// ==========================================

const Game = {

  playerId: "",
  room: null,
  role: null,

  channel: null,

  canvas: null,
  ctx: null,

  color: "#000000",
  brush: 5,
  tool: "pen",

  drawing: false,
  lastPoint: null,

  timer: null,
  seconds: 60,

  processingGuess: false,
  processingSwap: false,

  currentRound: 0,
  lastFeedback: "",

  remoteDrawing: false,
  lastSnapshot: "",


  // ========================================
  // INICIAR
  // ========================================

  async init() {

    this.playerId =
      crypto.randomUUID?.() ||
      Math.random().toString(36).substring(2) +
      Date.now();

    this.canvas =
      document.getElementById("drawingCanvas");

    this.ctx =
      this.canvas.getContext("2d");

    this.prepareCanvas();

    this.setupDrawing();

    this.setupControls();

    this.updateTimerDisplay(60);

    this.setStatus(
      "Crea una partida o únete usando un código."
    );
  },


  // ========================================
  // MENSAJES
  // ========================================

  setStatus(message) {

    const element =
      document.getElementById("status");

    if (element) {
      element.textContent = message;
    }
  },


  setFeedback(message, correct = null) {

    const element =
      document.getElementById("guessFeedback");

    if (!element) return;

    element.textContent = message;

    if (correct === true) {
      element.style.color = "#16a34a";
    }
    else if (correct === false) {
      element.style.color = "#dc2626";
    }
    else {
      element.style.color = "";
    }
  },


  // ========================================
  // CANVAS
  // ========================================

  prepareCanvas() {

    const rect =
      this.canvas.getBoundingClientRect();

    const ratio =
      window.devicePixelRatio || 1;

    this.canvas.width =
      Math.round(rect.width * ratio);

    this.canvas.height =
      Math.round(rect.height * ratio);

    this.ctx.setTransform(
      ratio,
      0,
      0,
      ratio,
      0,
      0
    );

    this.ctx.lineCap = "round";
    this.ctx.lineJoin = "round";

    this.clearLocalCanvas();
  },


  getPoint(event) {

    const rect =
      this.canvas.getBoundingClientRect();

    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top
    };
  },


  drawDot(point, color, brush, tool = "pen") {

    this.ctx.save();

    if (tool === "eraser") {

      this.ctx.globalCompositeOperation =
        "destination-out";

    } else {

      this.ctx.globalCompositeOperation =
        "source-over";
    }

    this.ctx.beginPath();

    this.ctx.fillStyle = color;

    this.ctx.arc(
      point.x,
      point.y,
      brush / 2,
      0,
      Math.PI * 2
    );

    this.ctx.fill();

    this.ctx.restore();
  },


  drawLine(
    from,
    to,
    color,
    brush,
    tool = "pen"
  ) {

    if (!from || !to) return;

    this.ctx.save();

    if (tool === "eraser") {

      this.ctx.globalCompositeOperation =
        "destination-out";

    } else {

      this.ctx.globalCompositeOperation =
        "source-over";
    }

    this.ctx.beginPath();

    this.ctx.strokeStyle = color;
    this.ctx.lineWidth = brush;

    this.ctx.moveTo(
      from.x,
      from.y
    );

    this.ctx.lineTo(
      to.x,
      to.y
    );

    this.ctx.stroke();

    this.ctx.restore();
  },


  // ========================================
  // DIBUJAR
  // ========================================

  setupDrawing() {

    this.canvas.addEventListener(
      "pointerdown",
      async event => {

        if (
          this.role !== "drawer" ||
          !this.room ||
          this.room.status !== "playing"
        ) {
          return;
        }

        this.drawing = true;

        this.canvas.setPointerCapture(
          event.pointerId
        );

        this.lastPoint =
          this.getPoint(event);

        const payload = {

          kind: "start",

          x: this.lastPoint.x,
          y: this.lastPoint.y,

          color: this.color,

          brush: this.brush,

          tool: this.tool
        };

        this.drawDot(
          payload,
          this.color,
          this.brush,
          this.tool
        );

        this.channel?.send({

          type: "broadcast",

          event: "stroke",

          payload

        });
      }
    );


    this.canvas.addEventListener(
      "pointermove",
      event => {

        if (
          !this.drawing ||
          this.role !== "drawer" ||
          !this.room ||
          this.room.status !== "playing"
        ) {
          return;
        }

        const point =
          this.getPoint(event);

        const payload = {

          kind: "move",

          from: this.lastPoint,

          to: point,

          color: this.color,

          brush: this.brush,

          tool: this.tool
        };

        this.drawLine(
          payload.from,
          payload.to,
          payload.color,
          payload.brush,
          payload.tool
        );

        this.lastPoint = point;

        this.channel?.send({

          type: "broadcast",

          event: "stroke",

          payload

        });
      }
    );


    const stopDrawing = async () => {

      if (!this.drawing) return;

      this.drawing = false;

      this.lastPoint = null;

      await this.saveSnapshot();
    };


    this.canvas.addEventListener(
      "pointerup",
      stopDrawing
    );

    this.canvas.addEventListener(
      "pointercancel",
      stopDrawing
    );

    this.canvas.addEventListener(
      "lostpointercapture",
      stopDrawing
    );
  },


  // ========================================
  // CREAR PARTIDA
  // ========================================

  async createGame() {

    try {

      if (this.room) {

        this.setStatus(
          "Ya estás dentro de una partida."
        );

        return;
      }

      const code =
        Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();

      const word =
        WORDS[
          Math.floor(
            Math.random() * WORDS.length
          )
        ];

      const { data, error } =
        await db
          .from("games")
          .insert({

            room_code: code,

            status: "waiting",

            drawer_id:
              this.playerId,

            guesser_id: null,

            secret_word: word,

            drawing: "",

            time_left: 60,

            round_started_at: null,

            guess_feedback: null,

            guess_correct: false,

            round_version: 1

          })
          .select()
          .single();


      if (error) throw error;


      this.room = data;

      this.role = "drawer";

      this.currentRound =
        data.round_version;


      await this.connectRoom();

      this.updateUI();

      this.setStatus(
        "Partida creada. Comparte el código con el otro jugador."
      );

      this.setFeedback("");

    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al crear partida: " +
        error.message
      );
    }
  },


  // ========================================
  // UNIRSE
  // ========================================

  async joinGame() {

    try {

      if (this.room) {

        this.setStatus(
          "Ya estás dentro de una partida."
        );

        return;
      }

      const code =
        document
          .getElementById("roomCode")
          .value
          .trim()
          .toUpperCase();


      if (!code) {

        this.setStatus(
          "Escribe el código de la partida."
        );

        return;
      }


      const { data, error } =
        await db
          .from("games")
          .select("*")
          .eq("room_code", code)
          .maybeSingle();


      if (error) throw error;


      if (!data) {

        this.setStatus(
          "No encontramos esa partida."
        );

        return;
      }


      if (
        data.status !== "waiting" ||
        data.guesser_id
      ) {

        this.setStatus(
          "La partida ya está ocupada."
        );

        return;
      }


      const startTime =
        new Date().toISOString();


      const { data: updated, error: updateError } =
        await db
          .from("games")
          .update({

            guesser_id:
              this.playerId,

            status:
              "playing",

            round_started_at:
              startTime,

            time_left:
              60,

            guess_feedback:
              null,

            guess_correct:
              false

          })
          .eq("room_code", code)
          .eq("status", "waiting")
          .is("guesser_id", null)
          .select()
          .maybeSingle();


      if (updateError) {
        throw updateError;
      }


      if (!updated) {

        this.setStatus(
          "La partida acaba de ser ocupada."
        );

        return;
      }


      this.room = updated;

      this.role = "guesser";

      this.currentRound =
        updated.round_version;


      await this.connectRoom();

      this.updateUI();

      this.setFeedback("");

      this.setStatus(
        "¡Te has unido! ¡Empieza la ronda!"
      );


      this.startTimer(
        updated.round_started_at
      );


    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al unirse: " +
        error.message
      );
    }
  },


  // ========================================
  // CONEXIÓN EN TIEMPO REAL
  // ========================================

  async connectRoom() {

    if (!this.room) return;


    // IMPORTANTE:
    // Solo creamos la conexión una vez
    // para evitar que el intercambio
    // deje la pantalla cargando.

    if (
      this.channel &&
      this.channel.state === "joined"
    ) {

      return;
    }


    this.channel =
      db.channel(
        "room-" +
        this.room.room_code,

        {
          config: {
            broadcast: {
              self: false
            }
          }
        }
      );


    // -----------------------------
    // TRAZOS
    // -----------------------------

    this.channel.on(
      "broadcast",
      { event: "stroke" },

      ({ payload }) => {

        if (
          this.role === "drawer"
        ) {
          return;
        }

        if (
          payload.kind === "start"
        ) {

          this.drawDot(
            payload,
            payload.color,
            payload.brush,
            payload.tool
          );

        }
        else if (
          payload.kind === "move"
        ) {

          this.drawLine(
            payload.from,
            payload.to,
            payload.color,
            payload.brush,
            payload.tool
          );
        }
      }
    );


    // -----------------------------
    // LIMPIAR TODO
    // -----------------------------

    this.channel.on(
      "broadcast",
      { event: "clear" },

      () => {

        if (
          this.role !== "drawer"
        ) {

          this.clearLocalCanvas();
        }
      }
    );


    // -----------------------------
    // SNAPSHOT
    // -----------------------------

    this.channel.on(
      "broadcast",
      { event: "snapshot" },

      ({ payload }) => {

        if (
          this.role !== "drawer" &&
          payload?.image
        ) {

          this.loadSnapshot(
            payload.image
          );
        }
      }
    );


    // -----------------------------
    // RESULTADO
    // -----------------------------

    this.channel.on(
      "broadcast",
      { event: "guess_result" },

      ({ payload }) => {

        this.setFeedback(
          payload.message,
          payload.correct
        );

        if (payload.correct) {

          this.setStatus(
            "🎉 ¡Respuesta correcta!"
          );
        }
      }
    );


    // -----------------------------
    // CAMBIO DE RONDA
    // -----------------------------

    this.channel.on(
      "broadcast",
      { event: "new_round" },

      ({ payload }) => {

        this.room =
          payload.room;

        this.role =
          payload.room.drawer_id ===
          this.playerId
            ? "drawer"
            : "guesser";

        this.currentRound =
          payload.room.round_version;

        this.clearLocalCanvas();

        this.lastSnapshot = "";

        this.setFeedback("");

        this.updateUI();

        this.startTimer(
          payload.room.round_started_at
        );

        this.setStatus(
          this.role === "drawer"
            ? "🎨 ¡Te toca dibujar!"
            : "👀 ¡Te toca adivinar!"
        );
      }
    );


    // -----------------------------
    // CAMBIO DE ESTADO EN SUPABASE
    // -----------------------------

    this.channel.on(
      "postgres_changes",

      {
        event: "UPDATE",

        schema: "public",

        table: "games",

        filter:
          "room_code=eq." +
          this.room.room_code
      },

      ({ new: updated }) => {

        this.handleRoomUpdate(
          updated
        );
      }
    );


    // -----------------------------
    // SUSCRIBIR
    // -----------------------------

    this.channel.subscribe(
      status => {

        if (
          status === "SUBSCRIBED"
        ) {

          console.log(
            "Conectado a la sala"
          );
        }
      }
    );
  },


  // ========================================
  // ACTUALIZAR SALA
  // ========================================

  handleRoomUpdate(updated) {

    if (!updated) return;


    const oldRound =
      this.currentRound;


    this.room = updated;


    this.role =
      updated.drawer_id ===
      this.playerId
        ? "drawer"
        : updated.guesser_id ===
          this.playerId
          ? "guesser"
          : null;


    this.currentRound =
      updated.round_version;


    // -----------------------------
    // NUEVA RONDA
    // -----------------------------

    if (
      oldRound !==
      updated.round_version
    ) {

      this.clearLocalCanvas();

      this.lastSnapshot = "";

      this.setFeedback("");

      this.startTimer(
        updated.round_started_at
      );
    }


    // -----------------------------
    // TIMER
    // -----------------------------

    if (
      updated.status === "playing" &&
      updated.round_started_at
    ) {

      this.startTimer(
        updated.round_started_at
      );
    }


    if (
      updated.status === "finished"
    ) {

      this.stopTimer();
    }


    // -----------------------------
    // FEEDBACK
    // -----------------------------

    if (
      updated.guess_feedback
    ) {

      this.setFeedback(
        updated.guess_feedback,
        updated.guess_correct
      );
    }


    // -----------------------------
    // DIBUJO
    // -----------------------------

    if (
      updated.drawing &&
      this.role === "guesser"
    ) {

      this.loadSnapshot(
        updated.drawing
      );
    }


    this.updateUI();
  },


  // ========================================
  // GUARDAR DIBUJO
  // ========================================

  async saveSnapshot() {

    if (
      !this.canvas ||
      !this.room ||
      this.role !== "drawer"
    ) {

      return;
    }


    const image =
      this.canvas.toDataURL(
        "image/png"
      );


    this.lastSnapshot =
      image;


    this.channel?.send({

      type: "broadcast",

      event: "snapshot",

      payload: {
        image
      }

    });


    const { error } =
      await db
        .from("games")
        .update({

          drawing:
            image

        })
        .eq(
          "room_code",
          this.room.room_code
        );


    if (error) {

      console.error(
        "Error guardando dibujo:",
        error
      );
    }
  },


  // ========================================
  // CARGAR DIBUJO
  // ========================================

  loadSnapshot(image) {

    if (
      !image ||
      image === this.lastSnapshot ||
      this.remoteDrawing
    ) {

      return;
    }


    this.remoteDrawing = true;


    const img =
      new Image();


    img.onload = () => {

      const rect =
        this.canvas.getBoundingClientRect();


      this.ctx.save();

      this.ctx.globalCompositeOperation =
        "source-over";


      this.ctx.clearRect(
        0,
        0,
        rect.width,
        rect.height
      );


      this.ctx.fillStyle =
        "#ffffff";


      this.ctx.fillRect(
        0,
        0,
        rect.width,
        rect.height
      );


      this.ctx.drawImage(
        img,
        0,
        0,
        rect.width,
        rect.height
      );


      this.ctx.restore();


      this.lastSnapshot =
        image;

      this.remoteDrawing =
        false;
    };


    img.onerror = () => {

      this.remoteDrawing =
        false;
    };


    img.src = image;
  },


  // ========================================
  // LIMPIAR TODO
  // ========================================

  async clearCanvas() {

    if (
      this.role !== "drawer" ||
      !this.room
    ) {

      return;
    }


    this.clearLocalCanvas();

    this.lastSnapshot = "";


    this.channel?.send({

      type: "broadcast",

      event: "clear",

      payload: {}

    });


    await this.saveSnapshot();
  },


  clearLocalCanvas() {

    if (
      !this.canvas ||
      !this.ctx
    ) {

      return;
    }


    const rect =
      this.canvas.getBoundingClientRect();


    this.ctx.save();

    this.ctx.globalCompositeOperation =
      "source-over";


    this.ctx.clearRect(
      0,
      0,
      rect.width,
      rect.height
    );


    this.ctx.fillStyle =
      "#ffffff";


    this.ctx.fillRect(
      0,
      0,
      rect.width,
      rect.height
    );


    this.ctx.restore();
  },


  // ========================================
  // RESPUESTA
  // ========================================

  async submitGuess() {

    if (
      this.processingGuess ||
      !this.room ||
      this.role !== "guesser" ||
      this.room.status !== "playing"
    ) {

      return;
    }


    const input =
      document.getElementById(
        "guessInput"
      );


    const answer =
      input.value
        .trim()
        .toLocaleLowerCase("es");


    if (!answer) return;


    this.processingGuess = true;


    try {

      const correct =
        answer ===
        String(
          this.room.secret_word
        )
          .trim()
          .toLocaleLowerCase("es");


      const message =
        correct
          ? "🎉 ¡CORRECTO! ¡Adivinaste la palabra!"
          : "❌ Incorrecto. ¡Inténtalo nuevamente!";


      // Mostrar inmediatamente
      // al jugador que respondió.

      this.setFeedback(
        message,
        correct
      );


      // Enviar inmediatamente
      // al otro jugador.

      this.channel?.send({

        type: "broadcast",

        event: "guess_result",

        payload: {

          message,

          correct

        }

      });


      if (!correct) {

        const { error } =
          await db
            .from("games")
            .update({

              guess_feedback:
                message,

              guess_correct:
                false

            })
            .eq(
              "room_code",
              this.room.room_code
            )
            .eq(
              "status",
              "playing"
            );


        if (error) {
          console.error(error);
        }


        input.value = "";

        return;
      }


      // ==================================
      // RESPUESTA CORRECTA
      // ==================================

      const newWord =
        WORDS[
          Math.floor(
            Math.random() *
            WORDS.length
          )
        ];


      const nextRound =
        Number(
          this.room.round_version || 1
        ) + 1;


      const newStart =
        new Date().toISOString();


      // Quien estaba adivinando
      // pasa a dibujar.

      const newDrawer =
        this.room.guesser_id;


      const newGuesser =
        this.room.drawer_id;


      const { data, error } =
        await db
          .from("games")
          .update({

            drawer_id:
              newDrawer,

            guesser_id:
              newGuesser,

            secret_word:
              newWord,

            drawing:
              "",

            status:
              "playing",

            time_left:
              60,

            round_started_at:
              newStart,

            guess_feedback:
              message,

            guess_correct:
              true,

            round_version:
              nextRound

          })
          .eq(
            "room_code",
            this.room.room_code
          )
          .eq(
            "round_version",
            this.room.round_version
          )
          .select()
          .maybeSingle();


      if (error) throw error;


      if (!data) {

        this.setStatus(
          "La ronda cambió. Espera un momento."
        );

        return;
      }


      this.room =
        data;


      this.role =
        this.playerId ===
        data.drawer_id
          ? "drawer"
          : "guesser";


      this.currentRound =
        data.round_version;


      // Actualizar inmediatamente
      // al jugador que acertó.

      this.clearLocalCanvas();

      this.setFeedback(
        "🎉 ¡CORRECTO! Nueva ronda.",
        true
      );

      this.updateUI();

      this.startTimer(
        data.round_started_at
      );


      // Avisar al otro dispositivo.

      this.channel?.send({

        type: "broadcast",

        event: "new_round",

        payload: {
          room: data
        }

      });


      input.value = "";


    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al procesar la respuesta."
      );

    }
    finally {

      this.processingGuess =
        false;
    }
  },


  // ========================================
  // INTERCAMBIAR PUESTOS
  // ========================================

  async swapRoles() {

    if (
      this.processingSwap ||
      !this.room
    ) {

      return;
    }


    if (
      !this.room.guesser_id
    ) {

      this.setStatus(
        "Esperen a que se una el segundo jugador."
      );

      return;
    }


    if (
      this.room.status !== "playing"
    ) {

      this.setStatus(
        "La ronda no está activa."
      );

      return;
    }


    this.processingSwap =
      true;


    const swapButton =
      document.getElementById(
        "swapRoles"
      );


    if (swapButton) {
      swapButton.disabled = true;
    }


    try {

      const newDrawer =
        this.room.guesser_id;


      const newGuesser =
        this.room.drawer_id;


      const newWord =
        WORDS[
          Math.floor(
            Math.random() *
            WORDS.length
          )
        ];


      const nextRound =
        Number(
          this.room.round_version || 1
        ) + 1;


      const newStart =
        new Date().toISOString();


      const { data, error } =
        await db
          .from("games")
          .update({

            drawer_id:
              newDrawer,

            guesser_id:
              newGuesser,

            secret_word:
              newWord,

            drawing:
              "",

            status:
              "playing",

            time_left:
              60,

            round_started_at:
              newStart,

            guess_feedback:
              null,

            guess_correct:
              false,

            round_version:
              nextRound

          })
          .eq(
            "room_code",
            this.room.room_code
          )
          .eq(
            "round_version",
            this.room.round_version
          )
          .select()
          .maybeSingle();


      if (error) throw error;


      if (!data) {

        this.setStatus(
          "El cambio ya fue realizado. Actualizando..."
        );

        return;
      }


      // NO cerramos el canal.
      // Esto evita que ambas pantallas
      // queden cargando.

      this.room =
        data;


      this.role =
        this.playerId ===
        data.drawer_id
          ? "drawer"
          : "guesser";


      this.currentRound =
        data.round_version;


      this.clearLocalCanvas();

      this.lastSnapshot = "";

      this.setFeedback("");


      this.updateUI();


      this.startTimer(
        data.round_started_at
      );


      // Avisar directamente al otro jugador.

      this.channel?.send({

        type: "broadcast",

        event: "new_round",

        payload: {
          room: data
        }

      });


      this.setStatus(
        this.role === "drawer"
          ? "🔄 ¡Ahora dibujas tú!"
          : "🔄 ¡Ahora te toca adivinar!"
      );


    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "No se pudieron intercambiar los puestos: " +
        error.message
      );

    }
    finally {

      this.processingSwap =
        false;

      if (swapButton) {

        swapButton.disabled =
          !this.room?.guesser_id ||
          this.room?.status !== "playing";
      }
    }
  },


  // ========================================
  // ACTUALIZAR INTERFAZ
  // ========================================

  updateUI() {

    if (!this.room) return;


    const roomDisplay =
      document.getElementById(
        "roomDisplay"
      );


    if (roomDisplay) {

      roomDisplay.textContent =
        "Código de partida: " +
        this.room.room_code;
    }


    const title =
      document.getElementById(
        "gameTitle"
      );


    if (title) {

      title.textContent =
        this.role === "drawer"
          ? "Tu espacio de dibujo"
          : "Adivina el dibujo";
    }


    const secretWord =
      document.getElementById(
        "secretWord"
      );


    if (secretWord) {

      secretWord.textContent =
        this.role === "drawer"
          ? "TU PALABRA ES: " +
            this.room.secret_word
          : "¡Adivina la palabra!";
    }


    const guessArea =
      document.getElementById(
        "guessArea"
      );


    if (guessArea) {

      guessArea.style.display =
        this.role === "guesser"
          ? "flex"
          : "none";
    }


    // Canvas

    this.canvas.style.pointerEvents =
      this.role === "drawer" &&
      this.room.status === "playing"
        ? "auto"
        : "none";


    // Herramientas

    document
      .querySelectorAll(
        "[data-color]"
      )
      .forEach(button => {

        button.disabled =
          this.role !== "drawer" ||
          this.room.status !== "playing";
      });


    const brushSize =
      document.getElementById(
        "brushSize"
      );


    if (brushSize) {

      brushSize.disabled =
        this.role !== "drawer" ||
        this.room.status !== "playing";
    }


    const clearButton =
      document.getElementById(
        "clearCanvas"
      );


    if (clearButton) {

      clearButton.disabled =
        this.role !== "drawer" ||
        this.room.status !== "playing";
    }


    const eraser =
      document.getElementById(
        "eraserTool"
      );


    if (eraser) {

      eraser.disabled =
        this.role !== "drawer" ||
        this.room.status !== "playing";

      eraser.classList.toggle(
        "selected",
        this.tool === "eraser"
      );
    }


    const swapButton =
      document.getElementById(
        "swapRoles"
      );


    if (swapButton) {

      swapButton.disabled =
        !this.room.guesser_id ||
        this.room.status !== "playing";
    }
  },


  // ========================================
  // TEMPORIZADOR SINCRONIZADO
  // ========================================

  startTimer(startedAt) {

    this.stopTimer();


    if (!startedAt) {

      this.seconds = 60;

      this.updateTimerDisplay(
        this.seconds
      );

      return;
    }


    const startTime =
      new Date(startedAt).getTime();


    if (
      !Number.isFinite(startTime)
    ) {

      return;
    }


    const update = () => {

      const elapsed =
        Math.floor(
          (Date.now() - startTime) /
          1000
        );


      const remaining =
        Math.max(
          0,
          60 - elapsed
        );


      this.seconds =
        remaining;


      this.updateTimerDisplay(
        remaining
      );


      if (remaining <= 0) {

        this.stopTimer();

        this.handleTimeUp();
      }
    };


    update();


    // Cada 250 ms para que
    // ambas pantallas se vean fluidas.

    this.timer =
      setInterval(
        update,
        250
      );
  },


  stopTimer() {

    if (this.timer) {

      clearInterval(
        this.timer
      );

      this.timer = null;
    }
  },


  updateTimerDisplay(seconds) {

    const timer =
      document.getElementById(
        "timer"
      );


    if (!timer) return;


    timer.textContent =
      String(
        Math.floor(seconds / 60)
      ).padStart(2, "0") +
      ":" +
      String(
        seconds % 60
      ).padStart(2, "0");


    timer.classList.toggle(
      "urgent",
      seconds <= 10
    );
  },


  // ========================================
  // FIN DEL TIEMPO
  // ========================================

  async handleTimeUp() {

    if (
      !this.room ||
      this.room.status !== "playing"
    ) {

      return;
    }


    // Solo el dibujante actual
    // cambia el estado para evitar
    // dos actualizaciones simultáneas.

    if (
      this.role !== "drawer"
    ) {

      this.setStatus(
        "⏰ ¡Se acabó el tiempo!"
      );

      return;
    }


    const { error } =
      await db
        .from("games")
        .update({

          status:
            "finished",

          time_left:
            0,

          guess_feedback:
            "⏰ ¡Se acabó el tiempo!",

          guess_correct:
            false

        })
        .eq(
          "room_code",
          this.room.room_code
        )
        .eq(
          "status",
          "playing"
        );


    if (error) {

      console.error(
        error
      );

      return;
    }


    this.setStatus(
      "⏰ ¡Se acabó el tiempo!"
    );

    this.setFeedback(
      "⏰ ¡Se acabó el tiempo!",
      false
    );
  },


  // ========================================
  // CONTROLES
  // ========================================

  setupControls() {

    document
      .getElementById("createGame")
      ?.addEventListener(
        "click",
        () => this.createGame()
      );


    document
      .getElementById("joinGame")
      ?.addEventListener(
        "click",
        () => this.joinGame()
      );


    document
      .getElementById("submitGuess")
      ?.addEventListener(
        "click",
        () => this.submitGuess()
      );


    document
      .getElementById("swapRoles")
      ?.addEventListener(
        "click",
        () => this.swapRoles()
      );


    // -----------------------------
    // COLORES
    // -----------------------------

    document
      .querySelectorAll(
        "[data-color]"
      )
      .forEach(button => {

        button.addEventListener(
          "click",
          () => {

            this.color =
              button.dataset.color;

            this.tool =
              "pen";


            document
              .querySelectorAll(
                "[data-color]"
              )
              .forEach(item => {

                item.classList.toggle(
                  "selected",
                  item === button
                );
              });


            document
              .getElementById(
                "eraserTool"
              )
              ?.classList.remove(
                "selected"
              );
          }
        );
      });


    // -----------------------------
    // GROSOR
    // -----------------------------

    document
      .getElementById(
        "brushSize"
      )
      ?.addEventListener(
        "input",
        event => {

          this.brush =
            Number(
              event.target.value
            );
        }
      );


    // -----------------------------
    // BORRADOR
    // -----------------------------

    document
      .getElementById(
        "eraserTool"
      )
      ?.addEventListener(
        "click",
        () => {

          if (
            this.role !== "drawer"
          ) return;


          this.tool =
            "eraser";


          document
            .querySelectorAll(
              "[data-color]"
            )
            .forEach(item => {

              item.classList.remove(
                "selected"
              );
            });


          document
            .getElementById(
              "eraserTool"
            )
            ?.classList.add(
              "selected"
            );


          this.setStatus(
            "🧽 Borrador activado."
          );
        }
      );


    // -----------------------------
    // LIMPIAR TODO
    // -----------------------------

    document
      .getElementById(
        "clearCanvas"
      )
      ?.addEventListener(
        "click",
        () => this.clearCanvas()
      );


    // -----------------------------
    // ENTER PARA ADIVINAR
    // -----------------------------

    document
      .getElementById(
        "guessInput"
      )
      ?.addEventListener(
        "keydown",
        event => {

          if (
            event.key === "Enter"
          ) {

            this.submitGuess();
          }
        }
      );
  }
};


// ==========================================
// INICIAR JUEGO
// ==========================================

window.Game = Game;

if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => Game.init()
  );

}
else {

  Game.init();
}
