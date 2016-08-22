module.exports = {
    port: 8001, //port to listen on
    db: "mongodb://localhost:27017/test", //server url for the mongod database
    options: {}, //options to pass to server
    /*
        set "secure" to true inside the object to use SSL (REALLY HIGHLY RECOMMMENDED FOR PRODUCTION SERVERS)
        rest of the options object is passed to net/tls .createServer (put the url of the key and cert in here)
    */
    loglevel: "info", //recommended for production servers (notifies on user register and groups created)
    //can be set to "debug" | "info" | "warn" | "trace"
    //debug for development and warn for minimal console prints
    //trace to get every little thing that ever happens (messages in and out)
    msghistory: 50, //number of messages to store on server
    posthistory: 20 //number of posts to store on server
};