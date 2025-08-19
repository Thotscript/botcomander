import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import { verify } from "jsonwebtoken";
import AppError from "../errors/AppError";
import { logger } from "../utils/logger";
import authConfig from "../config/auth";

let io: SocketIO;

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL,
      credentials: true
    }
  });

  io.on("connection", socket => {
    console.log("🔌 Nova conexão socket tentando...");
    
    const { token } = socket.handshake.query;
    let tokenData = null;

    if (!token) {
      console.log("❌ Token não fornecido!");
      socket.disconnect();
      return;
    }

    try {
      tokenData = verify(token as string, authConfig.secret);
      logger.debug(JSON.stringify(tokenData), "io-onConnection: tokenData");
      console.log("✅ Token válido, usuário autenticado");
    } catch (error) {
      logger.error(JSON.stringify(error), "Error decoding token");
      console.log("❌ Token inválido!");
      socket.disconnect();
      return;
    }

    logger.info("Client Connected");
    console.log("🔌 Cliente conectado com sucesso:", socket.id);

    socket.on("joinChatBox", (ticketId: string) => {
      logger.info("A client joined a ticket channel");
      console.log(`📥 Cliente ${socket.id} entrou na sala do ticket: ${ticketId}`);
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      logger.info("A client joined notification channel");
      console.log(`📥 Cliente ${socket.id} entrou na sala: notification`);
      socket.join("notification");
      
      // Lista todas as salas após entrar
      const rooms = io.sockets.adapter.rooms;
      console.log("🏠 Salas após joinNotification:");
      rooms.forEach((value, key) => {
        if (!key.startsWith("socket:")) {
          console.log(`  - ${key}: ${value.size} clientes`);
        }
      });
    });

    socket.on("joinTickets", (status: string) => {
      logger.info(`A client joined to ${status} tickets channel.`);
      console.log(`📥 Cliente ${socket.id} entrando na sala: ${status}`);
      socket.join(status);
      
      // Confirma que o cliente foi adicionado à sala
      const rooms = Array.from(socket.rooms);
      console.log(`✅ Cliente ${socket.id} está nas salas:`, rooms);
      
      // Lista todas as salas após entrar
      const allRooms = io.sockets.adapter.rooms;
      console.log("🏠 Salas após joinTickets:");
      allRooms.forEach((value, key) => {
        if (!key.startsWith("socket:")) {
          console.log(`  - ${key}: ${value.size} clientes`);
        }
      });
    });

    socket.on("disconnect", () => {
      logger.info("Client disconnected");
      console.log("🔌 Cliente desconectado:", socket.id);
    });
  });

  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};
