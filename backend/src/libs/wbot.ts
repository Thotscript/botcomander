import qrCode from "qrcode-terminal";
import { Client, LocalAuth } from "whatsapp-web.js";
import { getIO } from "./socket";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import { attachWbotMessageListeners, handleMessage } from "../services/WbotServices/wbotMessageListener";

interface Session extends Client {
  id?: number;
}

const sessions: Session[] = [];

const syncUnreadMessages = async (wbot: Session) => {
  try {
    const chats = await wbot.getChats();
    for (const chat of chats) {
      if (chat.unreadCount > 0) {
        // CORREÇÃO: Apenas marca como lida, não processa as mensagens
        await chat.sendSeen();
      }
    }
  } catch (error) {
    logger.error("Error syncing unread messages:", error);
  }
};

export const initWbot = async (whatsapp: Whatsapp): Promise<Session> => {
  return new Promise((resolve, reject) => {
    try {
      const io = getIO();
      const sessionName = whatsapp.name;
      let sessionCfg;

      if (whatsapp && whatsapp.session) {
        sessionCfg = JSON.parse(whatsapp.session);
      }

      const args: string = process.env.CHROME_ARGS || "";

      const wbot: Session = new Client({
        session: sessionCfg,
        authStrategy: new LocalAuth({ clientId: "bd_" + whatsapp.id }),
        puppeteer: {
          executablePath: process.env.CHROME_BIN || undefined,
          // @ts-ignore
          browserWSEndpoint: process.env.CHROME_WS || undefined,
          args: args.split(" ")
        }
      });

      wbot.initialize();

      wbot.on("qr", async qr => {
        logger.info("Session:", sessionName);
        qrCode.generate(qr, { small: true });
        await whatsapp.update({ qrcode: qr, status: "qrcode", retries: 0 });

        const idx = sessions.findIndex(s => s.id === whatsapp.id);
        if (idx === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        io.emit("whatsappSession", { action: "update", session: whatsapp });
      });

      wbot.on("authenticated", async () => {
        logger.info(`Session: ${sessionName} AUTHENTICATED`);
      });

      wbot.on("auth_failure", async msg => {
        logger.error(`Session: ${sessionName} AUTHENTICATION FAILURE! Reason: ${msg}`);

        if (whatsapp.retries > 1) {
          await whatsapp.update({ session: "", retries: 0 });
        }

        await whatsapp.update({ status: "DISCONNECTED", retries: whatsapp.retries + 1 });

        io.emit("whatsappSession", { action: "update", session: whatsapp });
        reject(new Error("Error starting whatsapp session."));
      });

      wbot.on("ready", async () => {
        logger.info(`Session: ${sessionName} READY`);

        await whatsapp.update({ status: "CONNECTED", qrcode: "", retries: 0 });
        io.emit("whatsappSession", { action: "update", session: whatsapp });

        const idx = sessions.findIndex(s => s.id === whatsapp.id);
        if (idx === -1) {
          wbot.id = whatsapp.id;
          sessions.push(wbot);
        }

        wbot.sendPresenceAvailable();
        await syncUnreadMessages(wbot);

        // ✅ zera listeners antigos e registra apenas os oficiais
        wbot.removeAllListeners("message");
        wbot.removeAllListeners("message_create");
        wbot.removeAllListeners("media_uploaded");
        wbot.removeAllListeners("message_ack");

        attachWbotMessageListeners(wbot);

        resolve(wbot);
      });

      wbot.on("disconnected", async reason => {
        logger.warn(`Session: ${sessionName} DISCONNECTED - Reason: ${reason}`);

        await whatsapp.update({ status: "DISCONNECTED" });
        io.emit("whatsappSession", { action: "update", session: whatsapp });

        const idx = sessions.findIndex(s => s.id === whatsapp.id);
        if (idx !== -1) sessions.splice(idx, 1);
      });
    } catch (err) {
      logger.error("Error initializing wbot:", err);
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
      wbot.destroy();
      sessions.splice(idx, 1);
      logger.info(`Session ${whatsappId} removed successfully`);
    }
  } catch (err) {
    logger.error("Error removing wbot:", err);
  }
};
