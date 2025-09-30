import config from "@colyseus/tools";
import express from "express";

/**
 * Config
 */
import { authSettings } from "./config/auth.config";

/**
 * Routes
 */
import { monitor } from "@colyseus/monitor";
import { playground } from "@colyseus/playground";
import { auth } from "@colyseus/auth";
import { xsolla } from "./routes/xsolla";

/**
 * Import your Room files
 */
import { MyRoom } from "./rooms/MyRoom";


export default config({

    initializeGameServer: (gameServer) => {
        /**
         * Define your room handlers:
         */
        gameServer.define('my_room', MyRoom);

    },

    initializeExpress: (app) => {
        /**
         * Xsolla webhook endpoint
         */
        app.use("/xsolla", xsolla);

        // Parse incoming JSON bodies
        // IMPORTANT: Do not include JSON middleware before the Xsolla webhook endpoint
        app.use(express.json());

        app.use("/", express.static("public"));

        /**
         * Bind your custom express routes here:
         * Read more: https://expressjs.com/en/starter/basic-routing.html
         */
        app.get("/hello_world", (req, res) => {
            res.send("It's time to kick ass and chew bubblegum!");
        });

        /**
         * Use @colyseus/playground
         * (It is not recommended to expose this route in a production environment)
         */
        if (process.env.NODE_ENV !== "production") {
            app.use("/playground", playground());
        }

        /**
         * Use @colyseus/monitor
         * It is recommended to protect this route with a password
         * Read more: https://docs.colyseus.io/tools/monitor/#restrict-access-to-the-panel-using-a-password
         */
        app.use("/monitor", monitor());

        /**
         * Bind auth routes
         * TODO: configure your own auth settings on `./config/auth.config.ts`
         */
        app.use(auth.prefix, auth.routes(authSettings));
    },


    beforeListen: () => {
        /**
         * Before before gameServer.listen() is called.
         */
    }
});
