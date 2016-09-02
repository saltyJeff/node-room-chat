//requires from npm
var ws = require("nodejs-websocket");
var crypto = require("crypto");
var mongoose = require("mongoose");
var process = require("process");
var log = require("loglevel");
//schemas
var userSchema = require("./schemas/user.js");
var groupSchema = require("./schemas/group.js");
//the stuff i wrote ;)
var conf = require("./conf.js");
var msgtypes = require("./msgtypes.js");
var out = msgtypes.toClient;

//start script
var connectedUsers = new Map();

//the server stuff
var server = ws.createServer(conf.options);

log.setLevel(conf.loglevel);
server.listen(conf.port);

server.on("listening", function () {
    log.warn("Server listening on port "+conf.port);
    log.warn("Ctrl+C to close server or send a SIGINT");
});
var autoauth = !conf.password;
//giant switch statement OF DEATH
server.on("connection", function (conn) {
    log.debug("client connected!");
    if(autoauth) {
        conn.auth = true;
    }
    conn.on("text", function (str) {
        log.debug(str);
        var msg = JSON.parse(str);
        if(!conn.auth) {
            if(msg.msgtype == "serverpass") {
                log.debug("trying to auth");
                if(msg.pass === conf.password) {
                    conn.auth = true;
                    log.debug("client authenticated");
                }
                else {
                    log.debug("someone tried to get in");
                    conn.close();
                }
            }
            return;
        }
        switch (msg.msgtype) {
            case "login":
                loginHandle(msg, conn);
                break;
            case "register":
                registerUser(msg, conn);
                break;
            default:
                if(!conn.user) {
                    log.debug("someone tried to do stuff without logging in");
                    conn.close();
                    return;
                }
                switch(msg.msgtype) {
                    case "creategroup":
                        createGroup(msg, conn);
                        break;
                    case "sendmsg":
                        sendMsg (msg, conn);
                        break;
                    case "addtogroup":
                        userToGroup(msg, conn);
                        break;
                    case "removeuser":
                        removeUser(msg, conn);
                        break;
                    case "addposttype":
                        addPostType(msg, conn);
                        break;
                    case "createpost":
                        createPost(msg,conn);
                        break;
                    case "changepost":
                        changePost(msg, conn);
                        break;
                    case "deletepost":
                        deletePost(msg, conn);
                        break;
                    default:
                        log.debug("some unrecognized msgtype was sent");
                        conn.close();
                        break;
                }
                break;
        }
    });

    conn.on("close", function (code, reason) {
        connectedUsers.delete(conn.user);
        log.debug("Client leaving code "+code);
    });

    conn.on("error", function (err) {
        log.debug("connection error (probably just the client closing the tab) code :"+err);
    });
});
//the database stuff
log.info("trying to connect to db");
mongoose.connect("mongodb://localhost:27017/test");
mongoose.Promise = global.Promise; //native promises
var db = mongoose.connection;
var User;
var Group;
db.once('open', function() {
    log.warn("connected to db");
    User = mongoose.model("User", userSchema);
    Group = mongoose.model("Group", groupSchema);  
});
//to broadcast a message to all users
function broadcast (group, msgobj, skip) {
    group.users.forEach(function (username) { //skip is an optional arg to skip sending the msg to one user
        if(skip != username && connectedUsers.has(username)) {
            connectedUsers.get(username).sendText(JSON.stringify(msgobj));
        }
    });
}
//hooks from switch statement
function loginHandle(msg, conn) {
    User.findOne({username: msg.username}, function(err, user) {
        if(err || !user) {
            conn.sendText(JSON.stringify(new out.errMsg("loginfail", "username or password invalid")));
            return;
        }
        var valid = user.checkPassword(msg.password);
        if (!valid) {
            conn.sendText(JSON.stringify(new out.errMsg("loginfail", "username or password invalid")));
            return;
        }
        if(connectedUsers.has(user.username)) {
            conn.sendText(JSON.stringify(new out.errMsg("loginfail", "logged in somewhere else")));
            return;
        }
        if (valid) {
            conn.sendText(JSON.stringify(new out.loggedInMsg(user.getPublicData())));
            conn.user = user.username;
            connectedUsers.set(user.username, conn);
            log.info("added "+conn.user+ " to connectedUsers");
            user.groups.forEach(function (groupId) {
                var id = mongoose.Types.ObjectId(groupId);
                Group.findOne({_id: id}, function (err, group) {
                    if(err || !group) {
                        return;
                    }
                    if(connectedUsers.has(user.username)) {
                        connectedUsers.get(user.username).sendText(JSON.stringify(new out.inGroupMsg(group)));
                    }
                });
            });
        }
    });
}

function registerUser(msg, conn) {
    User.findOne({username: msg.username}, function (err, user) { 
	    if(!user) {
            var salt = crypto.randomBytes(8).toString("hex").slice(0,16);
            var saltyPassword = crypto.createHmac("sha512", salt)
            .update(msg.password)
            .digest("hex");
            var newUser = new User({
                username: msg.username,
                password: saltyPassword,
                salt: salt,
            });
            newUser.save(function (err, newOne) {
                log.info("Registered user "+newOne.username);
                conn.user = newOne.username;
                connectedUsers.set(newOne.username, conn);
                conn.sendText(JSON.stringify(new out.loggedInMsg(newOne.getPublicData())));
            });
        }
        else {
            conn.sendText(JSON.stringify(new out.errMsg("registerFail", "account exists")));
        }
    }); 
}

function createGroup(msg, conn) {
    var newGroup = new Group({
        name: msg.name
    });
    newGroup.save(function (err, group) {
        User.findOne({username: conn.user}, function (err, user) {
            log.debug("trying to create group");
            if(!user) {
                log.debug("no user found");
                return;
            }
            group.addUser(user, function (err) {
                if(err) {
                    conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                    return;
                }
                conn.sendText(JSON.stringify(new out.inGroupMsg(group)));
                log.info("group created: "+group.name);
            });
        });
    });
}
function userToGroup(msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        User.findOne({username: msg.newuser}, function (err, user) {
            if(!user) {
                return;
            }
            group.addUser(user, function (err) {
                if(err) {
                    conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                    return;
                }
                log.debug("user "+conn.newuser+" added to group "+group.name);
                broadcast(group, new out.userAdded(user.username,group._id.toString()),user.username);
                if(connectedUsers.has(user.username)) {
                    connectedUsers.get(user.username).sendText(JSON.stringify(new out.inGroupMsg(group)));
                }
            });
        });
    });
}

function removeUser (msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        User.findOne({username: msg.olduser}, function (err, user) {
            if(!user) {
                return;
            }
            group.removeUser(user, function (err) {
                if(err) {
                    conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                    return;
                }
                log.debug("user "+conn.olduser+" removed from group "+group.name);
                broadcast(group, new out.userRemoved(user.username,group._id.toString()));
            });
        });
    });
}
function sendMsg(msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid);
    Group.findOne({_id: id}, function (err, group) {
        group.sendMsg(conn.user, msg.msg, function (err) {
            if(err) {
                conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                return;
            }
            log.debug("message sent from "+conn.user+" :"+msg.msg.data);
            broadcast(group, new out.newMsgMsg(group._id.toString(), group.messages[group.messages.length - 1]));
        });
    });
}
function addPostType (msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        group.addPostType(conn.user,msg.url, function (err) {
            if(err) {
                conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                return;
            }
            log.debug("posttype added group: "+group.name+" url: "+msg.url);
            broadcast(group, new out.addPostTypeMsg(this._id.toString()));
        });
    });
}
function createPost(msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid);
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        group.createPost(conn.user, msg.posttype, function (err, newid) {
            if(err) {
                conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                return;
            }
            log.debug("post created. group: "+group.name);
            broadcast(group, new out.createPostMsg(msg.groupid, newid, msg.posttype));
        });
    });
}
function changePost(msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        group.changePost(conn.user, msg.postid, msg.newdata, function (err) {
            if(err) {
                conn.sendText(JSON.stringify(new out.errMsg(err.type, err.reason)));
                return;
            }
            log.debug("post changed. group: "+group.name);
            broadcast(group, new out.changePostMsg(msg.groupid, msg.postid, msg.newdata));
        });
    });
}
process.on("SIGINT", function () {
    log.debug("closing database");
    db.close();
    log.debug("closing websocket connections");
    server.connections.forEach(function (conn) {
		conn.close();
	});
    server.close();
    log.warn("Server shutdown");
    process.exit();
});