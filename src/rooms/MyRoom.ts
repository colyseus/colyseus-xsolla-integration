import { Room, Client, CloseCode } from "colyseus";
import { MyRoomState } from "./schema/MyRoomState.js";

export class MyRoom extends Room {
  maxClients = 4;
  state = new MyRoomState();

  messages = {
    yourMessageType: (client: Client, message: any) => {
      /**
       * Handle "yourMessageType" message.
       */
    }
  }

  onCreate (options: any) {

    this.presence.subscribe("order", (data: any) => {
      const client = this.clients.get(data.sessionId);
      client?.send("ordered", data.order);
    });

  }

  onJoin (client: Client, options: any) {
    console.log(client.sessionId, "joined!");
  }

  onLeave (client: Client, code: CloseCode) {
    console.log(client.sessionId, "left!", code);
  }

  onDispose() {
    console.log("room", this.roomId, "disposing...");
  }

}
