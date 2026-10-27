"use strict";

// ======================================================
// SUPABASE
// ======================================================

const SUPABASE_URL =
  "https://yejubbxolhudirnqxzch.supabase.co";

const SUPABASE_KEY =
  "sb_publishable_-Co6Xer2naHTUKUbWbUgRg_jixXaJOh";

const db = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);


// ======================================================
// PALABRAS
// ======================================================

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
  "playa",
  "avión",
  "robot",
  "celular",
  "reloj",
  "hamburguesa"
];


// ======================================================
// JUEGO
// ======================================================

const Game = {

  playerId: null,

  room: null,

  role: null,

  channel: null,

  canvas: null,

  ctx: null,

  drawing: false,

  lastPoint: null,

  color: "#000000",

  brush: 5,

  tool: "pen",

  timer: null,

  processingGuess: false,

  processingRound: false,

  currentRound: 0,

  lastSnapshot: "",

  remoteDrawing: false,


  // ====================================================
  // INICIAR
  // ====================================================

  async init() {

    this.playerId =
      crypto.randomUUID
        ? crypto.randomUUID()
        : Math.random()
            .toString(36)
            .substring(2) +
          Date.now();

    this.canvas =
      document.getElementById("drawingCanvas");

    if (this.canvas) {

      this.ctx =
        this.canvas.getContext("2d");

      this.prepareCanvas();

      this.setupDrawing();
    }

    this.setupControls();

    this.updateTimerDisplay(60);

    console.log(
      "Juego iniciado:",
      this.playerId
    );
  },


  // ====================================================
  // UTILIDADES
  // ====================================================

  setStatus(message) {

    const element =
      document.getElementById("status");

    if (element) {
      element.textContent = message;
    }
  },


  setFeedback(message, correct = null) {

    const element =
      document.getElementById(
        "guessFeedback"
      );

    if (!element) return;

    element.textContent =
      message || "";

    if (correct === true) {

      element.style.color =
        "#16a34a";

    } else if (correct === false) {

      element.style.color =
        "#dc2626";

    } else {

      element.style.color = "";
    }
  },


  getRandomWord() {

    return WORDS[
      Math.floor(
        Math.random() *
        WORDS.length
      )
    ];
  },


  // ====================================================
  // CANVAS
  // ====================================================

  prepareCanvas() {

    if (!this.canvas) return;

    const rect =
      this.canvas.getBoundingClientRect();

    const ratio =
      window.devicePixelRatio || 1;

    this.canvas.width =
      Math.round(
        rect.width * ratio
      );

    this.canvas.height =
      Math.round(
        rect.height * ratio
      );

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

      x:
        event.clientX -
        rect.left,

      y:
        event.clientY -
        rect.top
    };
  },


  drawLine(
    from,
    to,
    color,
    brush,
    tool
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

    this.ctx.strokeStyle =
      color;

    this.ctx.lineWidth =
      brush;

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


  drawDot(
    point,
    color,
    brush,
    tool
  ) {

    this.ctx.save();

    if (tool === "eraser") {

      this.ctx.globalCompositeOperation =
        "destination-out";

    } else {

      this.ctx.globalCompositeOperation =
        "source-over";
    }

    this.ctx.beginPath();

    this.ctx.fillStyle =
      color;

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


  // ====================================================
  // DIBUJAR
  // ====================================================

  setupDrawing() {

    if (!this.canvas) return;


    this.canvas.addEventListener(
      "pointerdown",
      event => {

        if (
          !this.room ||
          this.role !== "drawer" ||
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

        this.drawDot(
          this.lastPoint,
          this.color,
          this.brush,
          this.tool
        );

        this.channel?.send({

          type: "broadcast",

          event: "stroke",

          payload: {

            kind: "start",

            point: this.lastPoint,

            color: this.color,

            brush: this.brush,

            tool: this.tool
          }
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

        this.drawLine(
          this.lastPoint,
          point,
          this.color,
          this.brush,
          this.tool
        );

        this.channel?.send({

          type: "broadcast",

          event: "stroke",

          payload: {

            kind: "move",

            from:
              this.lastPoint,

            to:
              point,

            color:
              this.color,

            brush:
              this.brush,

            tool:
              this.tool
          }
        });

        this.lastPoint =
          point;
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


  // ====================================================
  // CREAR PARTIDA
  // ====================================================

  async createGame() {

    try {

      const code =
        Math.random()
          .toString(36)
          .substring(2, 8)
          .toUpperCase();

      const word =
        this.getRandomWord();


      const { data, error } =
        await db
          .from("games")
          .insert({

            room_code:
              code,

            status:
              "waiting",

            drawer_id:
              this.playerId,

            guesser_id:
              null,

            secret_word:
              word,

            drawing:
              "",

            time_left:
              60,

            round_started_at:
              null,

            guess_feedback:
              null,

            guess_correct:
              false,

            round_version:
              1,

            drawer_score:
              0,

            guesser_score:
              0

          })
          .select()
          .single();


      if (error) {
        throw error;
      }


      this.room = data;

      this.role = "drawer";

      this.currentRound =
        data.round_version;


      await this.connectRoom();

      this.updateUI();

      this.setStatus(
        "Partida creada. Comparte el código."
      );

    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al crear la partida."
      );
    }
  },


  // ====================================================
  // UNIRSE
  // ====================================================

  async joinGame() {

    try {

      const input =
        document.getElementById(
          "roomCode"
        );

      const code =
        input?.value
          .trim()
          .toUpperCase();


      if (!code) {

        this.setStatus(
          "Escribe el código de la partida."
        );

        return;
      }


      const { data: room, error } =
        await db
          .from("games")
          .select("*")
          .eq(
            "room_code",
            code
          )
          .maybeSingle();


      if (error) {
        throw error;
      }


      if (!room) {

        this.setStatus(
          "No existe esa partida."
        );

        return;
      }


      if (
        room.guesser_id ||
        room.status !== "waiting"
      ) {

        this.setStatus(
          "La partida ya está ocupada."
        );

        return;
      }


      const start =
        new Date().toISOString();


      const {
        data: updated,
        error: updateError
      } =
        await db
          .from("games")
          .update({

            guesser_id:
              this.playerId,

            status:
              "playing",

            round_started_at:
              start,

            time_left:
              60

          })
          .eq(
            "room_code",
            code
          )
          .eq(
            "status",
            "waiting"
          )
          .is(
            "guesser_id",
            null
          )
          .select()
          .maybeSingle();


      if (updateError) {
        throw updateError;
      }


      if (!updated) {

        this.setStatus(
          "Otro jugador acaba de entrar."
        );

        return;
      }


      this.room = updated;

      this.role = "guesser";

      this.currentRound =
        updated.round_version;


      await this.connectRoom();

      this.updateUI();

      this.startTimer(
        updated.round_started_at
      );

      this.setStatus(
        "¡Partida iniciada!"
      );

    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al unirse a la partida."
      );
    }
  },


  // ====================================================
  // SUPABASE REALTIME
  // ====================================================

  async connectRoom() {

    if (!this.room) return;


    if (this.channel) {

      return;
    }


    this.channel =
      db.channel(
        "game-" +
        this.room.room_code
      );


    // --------------------------------
    // DIBUJO EN TIEMPO REAL
    // --------------------------------

    this.channel.on(
      "broadcast",
      {
        event: "stroke"
      },
      ({ payload }) => {

        if (
          this.role !== "guesser"
        ) {
          return;
        }


        if (
          payload.kind === "start"
        ) {

          this.drawDot(
            payload.point,
            payload.color,
            payload.brush,
            payload.tool
          );

        } else {

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


    // --------------------------------
    // LIMPIAR
    // --------------------------------

    this.channel.on(
      "broadcast",
      {
        event: "clear"
      },
      () => {

        if (
          this.role === "guesser"
        ) {

          this.clearLocalCanvas();
        }
      }
    );


    // --------------------------------
    // RESULTADO
    // --------------------------------

    this.channel.on(
      "broadcast",
      {
        event: "guess_result"
      },
      ({ payload }) => {

        this.setFeedback(
          payload.message,
          payload.correct
        );
      }
    );


    // --------------------------------
    // NUEVA RONDA
    // --------------------------------

    this.channel.on(
      "broadcast",
      {
        event: "new_round"
      },
      ({ payload }) => {

        this.applyNewRound(
          payload.room
        );
      }
    );


    // --------------------------------
    // CAMBIOS EN SUPABASE
    // --------------------------------

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


    this.channel.subscribe(
      status => {

        console.log(
          "Realtime:",
          status
        );
      }
    );
  },


  // ====================================================
  // ACTUALIZAR PARTIDA
  // ====================================================

  handleRoomUpdate(updated) {

    if (!updated) return;


    const oldRound =
      this.currentRound;


    this.room = updated;


    if (
      updated.drawer_id ===
      this.playerId
    ) {

      this.role =
        "drawer";

    } else if (
      updated.guesser_id ===
      this.playerId
    ) {

      this.role =
        "guesser";
    }


    this.currentRound =
      updated.round_version;


    // Nueva ronda

    if (
      oldRound !==
      updated.round_version
    ) {

      this.applyNewRound(
        updated
      );

      return;
    }


    // Feedback

    if (
      updated.guess_feedback
    ) {

      this.setFeedback(
        updated.guess_feedback,
        updated.guess_correct
      );
    }


    // Dibujo guardado

    if (
      updated.drawing &&
      this.role === "guesser"
    ) {

      this.loadSnapshot(
        updated.drawing
      );
    }


    // Temporizador

    if (
      updated.status === "playing" &&
      updated.round_started_at
    ) {

      this.startTimer(
        updated.round_started_at
      );
    }


    this.updateUI();
  },


  // ====================================================
  // NUEVA RONDA
  // ====================================================

  applyNewRound(room) {

    if (!room) return;


    this.room = room;


    this.role =
      room.drawer_id ===
      this.playerId
        ? "drawer"
        : "guesser";


    this.currentRound =
      room.round_version;


    this.clearLocalCanvas();

    this.lastSnapshot = "";

    this.setFeedback("");


    this.updateUI();


    this.startTimer(
      room.round_started_at
    );


    if (
      this.role === "drawer"
    ) {

      this.setStatus(
        "🎨 ¡Te toca dibujar!"
      );

    } else {

      this.setStatus(
        "🧠 ¡Te toca adivinar!"
      );
    }
  },


  // ====================================================
  // GUARDAR DIBUJO
  // ====================================================

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


  // ====================================================
  // CARGAR DIBUJO
  // ====================================================

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


  // ====================================================
  // BORRADOR
  // ====================================================

  activateEraser() {

    if (
      this.role !== "drawer"
    ) {
      return;
    }


    this.tool =
      "eraser";


    document
      .querySelectorAll(
        "[data-color]"
      )
      .forEach(button => {

        button.classList.remove(
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
  },


  // ====================================================
  // LIMPIAR TODO
  // ====================================================

  async clearCanvas() {

    if (
      !this.room ||
      this.role !== "drawer"
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


  // ====================================================
  // ADIVINAR
  // ====================================================

  async submitGuess() {

    if (
      this.processingGuess ||
      this.processingRound ||
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
      input?.value
        .trim()
        .toLocaleLowerCase("es");


    if (!answer) {

      this.setStatus(
        "Escribe una respuesta."
      );

      return;
    }


    this.processingGuess =
      true;


    try {

      const correct =
        answer ===
        String(
          this.room.secret_word
        )
          .trim()
          .toLocaleLowerCase("es");


      // --------------------------------
      // INCORRECTO
      // --------------------------------

      if (!correct) {

        const message =
          "❌ Incorrecto. ¡Inténtalo nuevamente!";


        this.setFeedback(
          message,
          false
        );


        this.channel?.send({

          type: "broadcast",

          event: "guess_result",

          payload: {

            message,

            correct: false
          }
        });


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


        input.value = "";

        return;
      }


      // --------------------------------
      // CORRECTO
      // --------------------------------

      this.setFeedback(
        "🎉 ¡CORRECTO!",
        true
      );


      this.channel?.send({

        type: "broadcast",

        event: "guess_result",

        payload: {

          message:
            "🎉 ¡CORRECTO! ¡Adivinaste!",

          correct: true
        }
      });


      await this.finishRound(
        "guesser"
      );


    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "Error al comprobar la respuesta."
      );

    }
    finally {

      this.processingGuess =
        false;
    }
  },


  // ====================================================
  // FINALIZAR RONDA
  // ====================================================

  async finishRound(winner) {

    if (
      this.processingRound ||
      !this.room
    ) {
      return;
    }


    this.processingRound =
      true;


    try {

      const oldRoom =
        this.room;


      let drawerScore =
        Number(
          oldRoom.drawer_score || 0
        );

      let guesserScore =
        Number(
          oldRoom.guesser_score || 0
        );


      // El ganador recibe un punto

      if (
        winner === "drawer"
      ) {

        drawerScore++;

      } else if (
        winner === "guesser"
      ) {

        guesserScore++;
      }


      // --------------------------------
      // INTERCAMBIO AUTOMÁTICO
      // --------------------------------

      const newDrawer =
        oldRoom.guesser_id;

      const newGuesser =
        oldRoom.drawer_id;


      const newWord =
        this.getRandomWord();


      const nextRound =
        Number(
          oldRoom.round_version || 1
        ) + 1;


      const start =
        new Date().toISOString();


      let feedback;


      if (
        winner === "guesser"
      ) {

        feedback =
          "🎉 ¡El adivinador acertó! +1 punto.";

      } else {

        feedback =
          "⏰ Se acabó el tiempo. ¡El dibujante gana +1 punto!";
      }


      // --------------------------------
      // ACTUALIZAR SUPABASE
      // --------------------------------

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
              start,

            guess_feedback:
              feedback,

            guess_correct:
              winner === "guesser",

            round_version:
              nextRound,

            drawer_score:
              drawerScore,

            guesser_score:
              guesserScore

          })
          .eq(
            "room_code",
            oldRoom.room_code
          )
          .eq(
            "round_version",
            oldRoom.round_version
          )
          .select()
          .maybeSingle();


      if (error) {
        throw error;
      }


      if (!data) {

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


      this.clearLocalCanvas();

      this.lastSnapshot = "";

      this.setFeedback("");


      this.updateUI();


      this.startTimer(
        data.round_started_at
      );


      // Avisar al otro jugador

      this.channel?.send({

        type: "broadcast",

        event: "new_round",

        payload: {
          room: data
        }
      });


      if (
        this.role === "drawer"
      ) {

        this.setStatus(
          feedback +
          " 🔄 ¡Ahora dibujas tú!"
        );

      } else {

        this.setStatus(
          feedback +
          " 🔄 ¡Ahora te toca adivinar!"
        );
      }

    }
    catch (error) {

      console.error(
        "Error terminando ronda:",
        error
      );

    }
    finally {

      this.processingRound =
        false;
    }
  },


  // ====================================================
  // INTERCAMBIO MANUAL
  // ====================================================

  async swapRoles() {

    if (
      !this.room ||
      this.processingRound
    ) {
      return;
    }


    if (
      !this.room.guesser_id
    ) {

      this.setStatus(
        "Esperen a que entre el segundo jugador."
      );

      return;
    }


    if (
      this.room.status !== "playing"
    ) {

      return;
    }


    // El intercambio manual
    // NO suma puntos.

    await this.changeRoles();
  },


  async changeRoles() {

    if (
      this.processingRound
    ) {
      return;
    }


    this.processingRound =
      true;


    try {

      const oldRoom =
        this.room;


      const newDrawer =
        oldRoom.guesser_id;

      const newGuesser =
        oldRoom.drawer_id;


      const newWord =
        this.getRandomWord();


      const nextRound =
        Number(
          oldRoom.round_version || 1
        ) + 1;


      const start =
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
              start,

            guess_feedback:
              null,

            guess_correct:
              false,

            round_version:
              nextRound

          })
          .eq(
            "room_code",
            oldRoom.room_code
          )
          .eq(
            "round_version",
            oldRoom.round_version
          )
          .select()
          .maybeSingle();


      if (error) {
        throw error;
      }


      if (!data) {
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


      this.clearLocalCanvas();

      this.lastSnapshot = "";

      this.setFeedback("");

      this.updateUI();

      this.startTimer(
        data.round_started_at
      );


      this.channel?.send({

        type: "broadcast",

        event: "new_round",

        payload: {
          room: data
        }
      });


    }
    catch (error) {

      console.error(error);

      this.setStatus(
        "No se pudieron intercambiar los puestos."
      );

    }
    finally {

      this.processingRound =
        false;
    }
  },


  // ====================================================
  // TEMPORIZADOR
  // ====================================================

  startTimer(startedAt) {

    this.stopTimer();


    if (!startedAt) {

      this.updateTimerDisplay(60);

      return;
    }


    const startTime =
      new Date(
        startedAt
      ).getTime();


    if (
      !Number.isFinite(
        startTime
      )
    ) {
      return;
    }


    const tick = () => {

      const elapsed =
        Math.floor(
          (
            Date.now() -
            startTime
          ) / 1000
        );


      const remaining =
        Math.max(
          0,
          60 - elapsed
        );


      this.updateTimerDisplay(
        remaining
      );


      if (
        remaining <= 0
      ) {

        this.stopTimer();

        this.handleTimeUp();
      }
    };


    tick();


    this.timer =
      setInterval(
        tick,
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


    const minutes =
      Math.floor(
        seconds / 60
      );


    const secs =
      seconds % 60;


    timer.textContent =
      String(minutes)
        .padStart(2, "0") +
      ":" +
      String(secs)
        .padStart(2, "0");


    timer.classList.toggle(
      "urgent",
      seconds <= 10
    );
  },


  // ====================================================
  // CUANDO LLEGA A 0
  // ====================================================

  async handleTimeUp() {

    if (
      !this.room ||
      this.room.status !== "playing"
    ) {
      return;
    }


    // Solo el dibujante procesa
    // el final para evitar doble punto.

    if (
      this.role !== "drawer"
    ) {

      this.setStatus(
        "⏰ ¡Se acabó el tiempo!"
      );

      return;
    }


    await this.finishRound(
      "drawer"
    );
  },


  // ====================================================
  // ACTUALIZAR INTERFAZ
  // ====================================================

  updateUI() {

    if (!this.room) return;


    const roomDisplay =
      document.getElementById(
        "roomDisplay"
      );


    if (roomDisplay) {

      roomDisplay.textContent =
        "Código: " +
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


    if (this.canvas) {

      this.canvas.style.pointerEvents =
        this.role === "drawer" &&
        this.room.status === "playing"
          ? "auto"
          : "none";
    }


    // -----------------------------
    // PUNTUACIÓN
    // -----------------------------

    const drawerScore =
      document.getElementById(
        "drawerScore"
      );


    const guesserScore =
      document.getElementById(
        "guesserScore"
      );


    if (drawerScore) {

      drawerScore.textContent =
        this.room.drawer_score || 0;
    }


    if (guesserScore) {

      guesserScore.textContent =
        this.room.guesser_score || 0;
    }


    // -----------------------------
    // CONTROLES DE DIBUJO
    // -----------------------------

    const canDraw =
      this.role === "drawer" &&
      this.room.status === "playing";


    document
      .querySelectorAll(
        "[data-color]"
      )
      .forEach(button => {

        button.disabled =
          !canDraw;
      });


    const brushSize =
      document.getElementById(
        "brushSize"
      );


    if (brushSize) {

      brushSize.disabled =
        !canDraw;
    }


    const eraser =
      document.getElementById(
        "eraserTool"
      );


    if (eraser) {

      eraser.disabled =
        !canDraw;
    }


    const clear =
      document.getElementById(
        "clearCanvas"
      );


    if (clear) {

      clear.disabled =
        !canDraw;
    }


    const swap =
      document.getElementById(
        "swapRoles"
      );


    if (swap) {

      swap.disabled =
        !this.room.guesser_id ||
        this.room.status !== "playing";
    }
  },


  // ====================================================
  // CONTROLES
  // ====================================================

  setupControls() {

    document
      .getElementById(
        "createGame"
      )
      ?.addEventListener(
        "click",
        () => this.createGame()
      );


    document
      .getElementById(
        "joinGame"
      )
      ?.addEventListener(
        "click",
        () => this.joinGame()
      );


    document
      .getElementById(
        "submitGuess"
      )
      ?.addEventListener(
        "click",
        () => this.submitGuess()
      );


    document
      .getElementById(
        "swapRoles"
      )
      ?.addEventListener(
        "click",
        () => this.swapRoles()
      );


    // --------------------------------
    // COLORES
    // --------------------------------

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


    // --------------------------------
    // GROSOR
    // --------------------------------

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


    // --------------------------------
    // BORRADOR
    // --------------------------------

    document
      .getElementById(
        "eraserTool"
      )
      ?.addEventListener(
        "click",
        () => this.activateEraser()
      );


    // --------------------------------
    // LIMPIAR TODO
    // --------------------------------

    document
      .getElementById(
        "clearCanvas"
      )
      ?.addEventListener(
        "click",
        () => this.clearCanvas()
      );


    // --------------------------------
    // ENTER
    // --------------------------------

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


// ======================================================
// INICIAR
// ======================================================

window.Game = Game;


if (
  document.readyState ===
  "loading"
) {

  document.addEventListener(
    "DOMContentLoaded",
    () => Game.init()
  );

} else {

  Game.init();
}
