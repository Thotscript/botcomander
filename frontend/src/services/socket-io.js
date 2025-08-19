// Este arquivo deve estar em frontend/src/services/socket-io.js

import openSocket from "socket.io-client";

function connectSocket() {
  const token = localStorage.getItem("token");
  
  return openSocket(process.env.REACT_APP_BACKEND_URL, {
    transports: ["websocket", "polling"],
    query: {
      token: token
    }
  });
}

export default connectSocket;
