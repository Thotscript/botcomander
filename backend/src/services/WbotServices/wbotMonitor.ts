import * as Sentry from "@sentry/node";
import { Client } from "whatsapp-web.js";

import { getIO } from "../../libs/socket";
import Whatsapp from "../../models/Whatsapp";
import { logger } from "../../utils/logger";
import { StartWhatsAppSession } from "./StartWhatsAppSession";

interface Session extends Client {
  id?: number;
}

const wbotMonitor = async (
  wbot: Session,
  whatsapp: Whatsapp
): Promise<void> => {
  const io = getIO();
  const sessionName = whatsapp.name;
  const traceId = `wpp:${whatsapp.id}`;

  try {
    logger.info({ traceId, sessionName }, "wbotMonitor: attach listeners");

    wbot.on("change_state", async (newState: any) => {
      logger.info({ traceId, sessionName, newState }, "Monitor: change_state");

      // Mapeia estados para algo útil na UI/DB e evita sobrescrever CONNECTED sem necessidade
      const mapped =
        newState === "READY" ? "CONNECTED" : String(newState || "").toUpperCase();

      const allowed = new Set(["OPENING", "QRCODE", "AUTHENTICATED", "CONNECTED"]);
      if (!allowed.has(mapped)) {
        logger.debug({ traceId, mapped }, "Monitor: state ignored");
        return;
      }

      try {
        await whatsapp.update({ status: mapped });
      } catch (err) {
        Sentry.captureException(err);
        logger.error({ traceId, err }, "Monitor: change_state update failed");
      }

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });
    });

    wbot.on("change_battery", async batteryInfo => {
      const { battery, plugged } = batteryInfo as any;
      logger.info(
        { traceId, sessionName, battery, plugged },
        "Monitor: change_battery"
      );

      try {
        await whatsapp.update({ battery, plugged });
      } catch (err) {
        Sentry.captureException(err);
        logger.error({ traceId, err }, "Monitor: change_battery update failed");
      }

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });
    });

    wbot.on("disconnected", async reason => {
      logger.info({ traceId, sessionName, reason }, "Monitor: disconnected");
      try {
        await whatsapp.update({ status: "OPENING", session: "" });
      } catch (err) {
        Sentry.captureException(err);
        logger.error({ traceId, err }, "Monitor: disconnected update failed");
      }

      io.emit("whatsappSession", {
        action: "update",
        session: whatsapp
      });

      // Tenta reabrir após um pequeno atraso
      setTimeout(() => {
        logger.info({ traceId, sessionName }, "Monitor: restarting session");
        StartWhatsAppSession(whatsapp);
      }, 2000);
    });
  } catch (err) {
    Sentry.captureException(err);
    logger.error({ traceId, err }, "wbotMonitor: outer error");
  }
};

export default wbotMonitor;
