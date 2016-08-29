var process = require("process");
module.exports = {
    port: 8001, //port to listen on
    db: "mongodb://localhost:27017/test",
    password: "abc",
    options: {},
    loglevel: "debug",
    msghistory: 50, 
    posthistory: 20
};
