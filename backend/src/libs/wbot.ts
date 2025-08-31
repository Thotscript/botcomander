import qrCode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { getIO } from "./socket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import { attachWbotMessageListeners } from "../services/WbotServices/wbotMessageListener";

interface Session extends Client {
  id?: number;
}

const sessions: Session[] = [];

const syncUnreadMessages = async (wbot: Session) => {
  try {
    const chats = await wbot.getChats();
    for (const chat of chats) {
      if ((chat as any).unreadCount > 0) {
        await chat.sendSeen();
      }
    }
    logger.debug("syncUnreadMessages: done");
  } catch (error) {
    logger.error({ err: error }, "Error syncing unread messages");
  }
};

export const initWbot = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise((resolve, reject) => {
    const io = getIO();
    const sessionName = whatsapp.name;
    const traceId = `wpp:${whatsapp.id}`;

    // flag pra não resolver duas vezes
    let resolved = false;
    const resolveOnce = (wb: Session) => {
      if (!resolved) {
        resolved = true;
        resolve(wb);
      }
    };

    try {
      logger.info({ traceId, sessionName }, "initWbot: begin");

      const extraArgs = (process.env.CHROME_ARGS || "")
        .split(" ")
        .filter(Boolean);

      const wbot: Session = new Client({
        authStrategy: new LocalAuth({ clientId: "bd_" + whatsapp.id }),
        puppeteer: {
          executablePath: process.env.CHROME_BIN || undefined,
          // @ts-ignore
          browserWSEndpoint: process.env.CHROME_WS || undefined,
          args: [
            ...extraArgs,
            "--no-sandbox",
            "--disable-setuid-sandbox",
            "--disable-dev-shm-usage",
            "--disable-accelerated-2d-canvas",
            "--no-zygote",
            "--no-first-run",
            "--disable-gpu"
          ]
        }
      });

      // ===== Watchdog: AUTHENTICATED sem READY =====
      let readyTimer: NodeJS.Timeout | null = null;
      const armReadyWatchdog = () => {
        if (readyTimer) clearTimeout(readyTimer);
        readyTimer = setTimeout(async () => {
          logger.warn({ traceId, sessionName }, "Watchdog: stuck after AUTHENTICATED; destroying client");
          try {
            wbot.removeAllListeners();
            await (wbot as any).destroy?.();
          } catch (e) {
            logger.error({ traceId, err: e }, "Watchdog: error destroying stuck client");
          }
        }, 90_000);
      };
      const disarmReadyWatchdog = () => {
        if (readyTimer) {
          clearTimeout(readyTimer);
          readyTimer = null;
        }
      };

      // ===== Console da página (erros do WA Web) =====
      // (só depois do initialize() a pupPage existe; por isso re-anexamos também em 'ready')
      const attachPageDebug = async () => {
        try {
          // @ts-ignore
          const page = (wbot as any).pupPage;
          if (!page || page.__debugHooked) return;
          page.__debugHooked = true;

          page.on("console", (msg: any) => {
            try {
              logger.debug(
                { traceId, sessionName, type: msg.type?.(), text: msg.text?.() },
                "WA Console"
              );
            } catch {}
          });
          page.on("pageerror", (err: any) => {
            logger.error({ traceId, sessionName, err: String(err) }, "WA PageError");
          });
          page.on("requestfailed", (req: any) => {
            logger.warn(
              { traceId, sessionName, url: req.url?.(), errText: req.failure?.()?.errorText },
              "WA RequestFailed"
            );
          });
          logger.info({ traceId, sessionName }, "Page debug attached");
        } catch (e) {
          logger.warn({ traceId, sessionName, err: e }, "attachPageDebug failed");
        }
      };

      // ===== Fallback: promover CONNECTED manualmente =====
      const promoteConnected = async () => {
        try {
          await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
        } catch (e) {
          logger.error({ traceId, err: e }, "promoteConnected: failed to update whatsapp row");
        }
        io.emit("whatsappSession", { action: "update", session: whatsapp });

        try {
          await (wbot as any).sendPresenceAvailable?.();
        } catch (e) {
          logger.warn({ traceId, err: e }, "promoteConnected: sendPresenceAvailable failed (non-critical)");
        }

        await syncUnreadMessages(wbot);

        // listeners “oficiais”
        wbot.removeAllListeners("message");
        wbot.removeAllListeners("message_create");
        wbot.removeAllListeners("media_uploaded");
        wbot.removeAllListeners("message_ack");
        attachWbotMessageListeners(wbot);

        logger.info({ traceId, sessionName }, "promoteConnected: resolved as ready-like");
        resolveOnce(wbot);
      };

      let pollTimer: NodeJS.Timeout | null = null;
      const startStatePolling = () => {
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(async () => {
          try {
            const state = await (wbot as any).getState?.();
            logger.info({ traceId, sessionName, state }, "Polling getState");
            if (state === "CONNECTED") {
              clearInterval(pollTimer!);
              disarmReadyWatchdog();
              await attachPageDebug();
              await promoteConnected();
            }
          } catch (e) {
            logger.warn({ traceId, sessionName, err: e }, "Polling getState error");
          }
        }, 1500);
      };

      // ========================= Eventos =========================
      wbot.on("qr", async qr => {
        logger.info({ traceId, sessionName, hasQR: true }, "Event: qr");
        qrCode.generate(qr, { small: true });

        try {
          await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });
        } catch (e) {
          logger.error({ traceId, err: e }, "qr: failed to update whatsapp row");
        }

        const idx = sessions.findIndex(s => s.id === whatsapp.id);
        if (idx === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        io.emit("whatsappSession", { action: "update", session: whatsapp });
      });

      wbot.on("loading_screen", (percent, message) => {
        logger.info({ traceId, sessionName, percent, message }, "Event: loading_screen");
      });

      wbot.on("authenticated", async () => {
        logger.info({ traceId, sessionName }, "Event: authenticated");
        armReadyWatchdog();
        startStatePolling();     // <<=== começa o fallback
      });

      wbot.on("auth_failure", async msg => {
        logger.error({ traceId, sessionName, msg }, "Event: auth_failure");

        try {
          if (whatsapp.retries > 1) {
            await whatsapp.update({ session: "", retries: 0 });
          }
          await whatsapp.update({ status: "DISCONNECTED", retries: whatsapp.retries + 1 });
        } catch (e) {
          logger.error({ traceId, err: e }, "auth_failure: failed to update whatsapp row");
        }

        io.emit("whatsappSession", { action: "update", session: whatsapp });
        return reject(new Error("Error starting whatsapp session."));
      });

      wbot.on("ready", async () => {
        if (pollTimer) clearInterval(pollTimer);
        logger.info({ traceId, sessionName }, "Event: ready");
        disarmReadyWatchdog();

        await attachPageDebug();
        await promoteConnected(); // centraliza o fluxo de “ficou pronto”
      });

      wbot.on("disconnected", async reason => {
        if (pollTimer) clearInterval(pollTimer);
        logger.warn({ traceId, sessionName, reason }, "Event: disconnected");
        disarmReadyWatchdog();

        try {
          await whatsapp.update({ status: "DISCONNECTED" });
        } catch (e) {
          logger.error({ traceId, err: e }, "disconnected: failed to update whatsapp row");
        }

        io.emit("whatsappSession", { action: "update", session: whatsapp });

        const idx = sessions.findIndex(s => s.id === whatsapp.id);
        if (idx !== -1) sessions.splice(idx, 1);
      });

      // Inicializa após listeners
      wbot.initialize().then(attachPageDebug).catch(err => {
        logger.error({ traceId, sessionName, err }, "wbot.initialize: exception");
        reject(err);
      });

      logger.info({ traceId, sessionName }, "initWbot: initialized (pending events)");

    } catch (err) {
      logger.error({ err }, "initWbot: outer error");
      reject(err);
    }
  });
};

export const getWbot = (whatsappId: number): Session => {
  const idx = sessions.findIndex(s => s.id === whatsappId);
  if (idx === -1) throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  return sessions[idx];
};

export const removeWbot = (whatsappId: number): void => {
  try {
    const idx = sessions.findIndex(s => s.id === whatsappId);
    if (idx !== -1) {
      const wbot = sessions[idx];
      wbot.removeAllListeners();
      (wbot as any).destroy?.();
      sessions.splice(idx, 1);
      logger.info({ whatsappId }, "removeWbot: Session removed successfully");
    }
  } catch (err) {
    logger.error({ err }, "removeWbot: error removing wbot");
  }
};
