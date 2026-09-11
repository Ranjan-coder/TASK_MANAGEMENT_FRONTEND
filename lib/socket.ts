import { io, Socket } from "socket.io-client";

let socket: Socket | null = null;

export const getSocket = (token?: string): Socket => {
  if (!socket) {
    const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:5000";
    socket = io(SOCKET_URL, {
      withCredentials: true,
      autoConnect: false,
      auth: { token }
    });
  }
  return socket;
};

export const connectSocket = (token?: string) => {
  const s = getSocket(token);
  if (!s.connected) {
    s.connect();
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
};
