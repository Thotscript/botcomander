// frontend/src/services/socket-io.js
import { io } from "socket.io-client";

let socket = null;

export default function openSocket() {
  if (socket) return socket;

  const token = localStorage.getItem("token"); // token puro (sem JSON.stringify)

  socket = io(process.env.REACT_APP_BACKEND_URL, {
    transports: ["websocket", "polling"],
    auth: { token },          // <-- envia no handshake (padrão v4)
    path: "/socket.io",
    autoConnect: true,
  });

  socket.on("connect_error", (err) => {
    console.error("[socket] connect_error:", err?.message || err);
  });

  return socket;
}

// permite atualizar o token quando fizer refresh/login
export function reattachAuth(newToken) {
  if (!socket) return;
  socket.auth = { token: newToken };
  if (socket.connected) socket.disconnect();
  socket.connect();
}
