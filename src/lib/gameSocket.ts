import { io, Socket } from "socket.io-client";

const GAME_SERVER_URL = "https://technical-test-fps-server.onrender.com";

let socket: Socket | null = null;

export function getGameSocket(token: string): Socket {
  if (socket && socket.connected) {
    return socket;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
  socket = io(GAME_SERVER_URL, { auth: { token }, transports: ["websocket"] });
  return socket;
}

export function disconnectGameSocket() {
  socket?.disconnect();
  socket = null;
}