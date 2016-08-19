var ws = require("nodejs-websocket");
var crypto = require("crypto");
var mongoose = require("mongoose");
var process = require("process");
var port = 8001;

var connectedUsers = new Map();

//the server stuff
var server = ws.createServer();

server.listen(port);

server.on("listening", function () {
    console.log("server listening on port "+port);
});

server.on("connection", function (conn) {
    console.log("client connected!");

    //giant switch statement OF DEATH
    conn.on("text", function (str) {
        console.log(str);
        var msg = JSON.parse(str);
        switch (msg.msgtype) {
            case "login":
                loginHandle(msg, conn);
                break;
            case "creategroup":
                createGroup(msg, conn);
                break;
            case "register":
                registerUser(msg, conn);
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
                console.log("invalid msgtype "+msg.msgtype);
                conn.close();
                break;
        }
    });

    conn.on("close", function (code, reason) {
        connectedUsers.delete(conn.user);
        console.log("Client leaving code "+code);
    });

    conn.on("error", function (err) {
        console.log("connection error (probably just the client closing the tab) code :"+err);
    });
});
//the database stuff
mongoose.connect("mongodb://localhost:27017/test");
mongoose.Promise = global.Promise; //native promises
var db = mongoose.connection;
var userSchema;
var groupSchema;
var User;
var Group;
db.once('open', function() {
    console.log("connected to db");
    //define User schemas
    userSchema = mongoose.Schema({
        username: { type: String, required: true, unique: true, index: true },
        password: { type: String, required: true },
        salt: String,
        screenname: String,

        groups: Array,
        contacts: Object
    });
    userSchema.methods.checkPassword = function (pass) {
         var saltyPassword = crypto.createHmac("sha512", this.salt)
        .update(pass)
        .digest("hex");
        return saltyPassword == this.password;
    };
    userSchema.methods.getPublicData = function () {
        return {
            username: this.username,
            screenname: this.screenname,
            groups: this.groups,
            contacts: this.contacts,
        };
    };
    User = mongoose.model("User", userSchema);
    //define message schemas
    var msgSchema = mongoose.Schema({
        "sender": String, //who sent the message
	    "time": {type: Number, default: Date.now()}, //millisecond message was sent
	    "datatype": String, //text, rtf, image, webpage, base64
	    "data": String
    });
    //define post schema
    var postSchema = mongoose.Schema({
        "user": String,
        "data": String,
        "type": String,
        "pinned": Boolean,
        "time": Number
    });
    //define Group schemas
    var groupSchema = mongoose.Schema({
        users: Array,
        name: String,
        messages: [msgSchema],
        posts: [postSchema],
        postTypes: Array
    });
    groupSchema.methods.addToGroup = function (newUsername, conn) {
        var theGroup = this;
        if(theGroup.users.indexOf(newUsername) != -1) {
            conn.sendText(JSON.stringify(new errMsg("groupfail", "User already in group")));
            return;
        }
        User.findOne({username: newUsername}, function (err, user) {
            if(err || !user) {
                conn.sendText(JSON.stringify(new errMsg("groupfail", "User doesn't exist")));
                return;
            }
            theGroup.users.push(user.username);
            user.groups.push(theGroup._id.toString());
            user.save();
            theGroup.save();
            theGroup.users.forEach(function(itUser) {
                if(connectedUsers.has(itUser)) {
                    if(itUser == newUsername) {
                        connectedUsers.get(itUser).sendText(JSON.stringify(new inGroupMsg(theGroup)));
                    }
                    else {
                        connectedUsers.get(itUser).sendText(JSON.stringify(new userAdded(newUsername, theGroup._id.toString())));
                    }
                }
            });
            console.log(newUsername+" added to group "+theGroup.name);
        });
    };
    groupSchema.methods.removeUser = function (goneUser) {
        var theGroup = this;
        if(theGroup.users.indexOf(goneUser) == -1) {
            conn.sendText(JSON.stringify(new errMsg("groupfail", "User not in group")));
            return;
        }
        User.findOne({username: goneUser}, function (err, user) {
            if(err || !user) {
                conn.sendText(JSON.stringify(new errMsg("groupfail", "User doesn't exist")));
                return;
            }
            theGroup.users.splice(theGroup.users.indexOf(goneUser), 1);
            user.groups.splice(user.groups.indexOf(theGroup._id.toString()), 1);
            user.save();
            theGroup.users.forEach(function(itUser) {
                if(connectedUsers.has(itUser)) {
                    connectedUsers.get(itUser).sendText(JSON.stringify(new userRemoved(goneUser, theGroup._id.toString())));
                }
            });
            connectedUsers.get(user.username).sendText(JSON.stringify(new userRemoved(goneUser, theGroup._id.toString())));
            if(theGroup.users.length < 1) {
                console.log("no users, removed group "+theGroup.name);
                theGroup.remove();
                return;
            }
            theGroup.save();
            console.log(goneUser+" removed from group "+theGroup.name);
        });
    };
    groupSchema.methods.sendMsg = function (user, msg) {
        var thegroup = this;
        if(thegroup.users.indexOf(user) == -1) {
            return;
        }
        //sanity checks
        if(msg.datatype != "text") {
            console.log("invalid datatype "+msg.datatype);
            return;
        }
        var newMsgObj = {
            "sender": user,
            "datatype": msg.datatype,
            "data": msg.data,
            "time": Date.now()
        };
        thegroup.messages.push(newMsgObj);
        while(thegroup.messages.length > 20) { //set max msg back
            thegroup.messages.shift();
        }
        thegroup.save();
        thegroup.users.forEach(function(theUser) {
            if(connectedUsers.has(theUser)) {
                connectedUsers.get(theUser).sendText(JSON.stringify(new newMsgMsg(thegroup._id.toString(), thegroup.messages[thegroup.messages.length - 1])));
            }
        });
        console.log("message added");
    };
    groupSchema.methods.addPostType = function (url) {
        console.log("adding post type");
        if(this.postTypes.indexOf(url) != -1) {
            console.log("post already exists");
            return;
        }
        else {
            this.postTypes.push(url);
            this.save();
            this.users.forEach(function(theUser) {
                if(connectedUsers.has(theUser)) {
                    connectedUsers.get(theUser).sendText(JSON.stringify(new addPostTypeMsg(this._id.toString(),url)));
                }
            },this);
        }
    };
    groupSchema.methods.createPost = function (user,type) {
        var newpost = this.posts.create({
            "user": user,
            "type":type,
            "time": Date.now()
        });
        this.posts.push(newpost);
        this.save();
        return newpost._id;
    };
    groupSchema.methods.changePost = function (user,postid,newdata) {
        var post = this.posts.id(postid);
        if(post.user != user) {
            return;
        }
        post.data = newdata;
        post.save();
        this.save();
    };
    groupSchema.methods.deletePost = function (user,postid) {
        var post = this.posts.id(postid);
        if(post.user != user) {
            return;
        }
        post.remove();
        this.save();
    };
    Group = mongoose.model("Group", groupSchema);  
});
//message constructors
function errMsg(type, reason) {
    this.msgtype = "err";
    this.error = type;
    this.reason = reason;
}
function loggedInMsg (userData) {
    this.msgtype = "loggedin";
    this.userData = userData;
}
function inGroupMsg (groupData) {
    this.msgtype = "ingroup";
    this.groupdata = groupData;
}
function newMsgMsg (groupid, newmsg) {
    this.msgtype = "newmsg";
    this.groupid = groupid;
    this.msg = newmsg;
}
function userAdded (newUsername, groupid) {
    this.msgtype = "useradded";
    this.newuser = newUsername;
    this.groupid = groupid;
}
function userRemoved (goneUser, groupid) {
    this.msgtype = "userremoved";
    this.olduser = goneUser;
    this.groupid = groupid;
}
function addPostTypeMsg (id,url) {
    this.msgtype = "newposttype";
    this.groupid = id;
    this.url = url;
}
function createPostMsg (groupid,postid,type) {
    this.msgtype = "createpost";
    this.groupid = groupid;
    this.postid = postid;
    this.posttype = type;
}
function changePostMsg (groupid, postid, newdata) {
    this.msgtype = "changepost";
    this.groupid = groupid;
    this.postid = postid;
    this.newdata = newdata;
}
//hooks from switch statement
function loginHandle(msg, conn) {
    User.findOne({username: msg.username}, function(err, user) {
        if(err || !user) {
            conn.sendText(JSON.stringify(new errMsg("loginfail", "username or password invalid")));
            return;
        }
        var valid = user.checkPassword(msg.password);
        if (!valid) {
            conn.sendText(JSON.stringify(new errMsg("loginfail", "username or password invalid")));
            return;
        }
        else if(connectedUsers.has(user.username)) {
            conn.sendText(JSON.stringify(new errMsg("loginfail", "logged in somewhere else")));
            return;
        }
        else if (valid) {
            conn.sendText(JSON.stringify(new loggedInMsg(user.getPublicData())));
            user.groups.forEach(function (groupId) {
                var id = mongoose.Types.ObjectId(groupId);
                Group.findOne({_id: id}, function (err, thegroup) {
                    if(err || !thegroup) {
                        return;
                    }
                    if(connectedUsers.has(user.username)) {
                        connectedUsers.get(user.username).sendText(JSON.stringify(new inGroupMsg(thegroup)));
                    }
                });
            });
            conn.user = user.username;
            connectedUsers.set(user.username, conn);
            console.log("added "+conn.user+ " to connectedUsers");
        }
    });
}

function registerUser(msg, conn) {
    User.findOne({name: msg.username}, function (err, user) { 
	    if(!user) {
            var salt = crypto.randomBytes(8).toString("hex").slice(0,16);
            var saltyPassword = crypto.createHmac("sha512", salt)
            .update(msg.password)
            .digest("hex");
            var newUser = new User({
                username: msg.username,
                password: saltyPassword,
                salt: salt,
                screenname: msg.screenname
            });
            newUser.save(function (err, newOne) {
                console.log("Registered user "+newOne.username);
                conn.user = newOne.username;
                connectedUsers.set(newOne.username, conn);
                conn.sendText(JSON.stringify(new loggedInMsg(newOne.getPublicData())));
            });
        }
        else {
            conn.sendText(JSON.stringify(new errMsg("registerFail", "account exists")));
        }
    }); 
}

function createGroup(msg, conn) {
    if(conn.user === null || conn.user === undefined) {
        console.log("invalid connection");
        conn.close();
        return;
    }
    var newGroup = new Group({
        name: msg.name,
    });
    newGroup.save(function (err, newOne) {
        console.log("Group created: "+newOne.name);
        newOne.addToGroup(conn.user, conn);
    });
}

function sendMsg(msg, conn) {
    var id = mongoose.Types.ObjectId(msg.groupid);
    Group.findOne({_id: id}, function (err, group) {
        group.sendMsg(conn.user, msg.msg);
    });
}

function userToGroup(msg, conn) {
    if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        group.addToGroup(msg.newuser, conn);
    });
}

function removeUser (msg, conn) {
    if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        group.removeUser(msg.olduser);
    });
}

function addPostType (msg, conn) {
    if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        if(group.users.indexOf(conn.user) != -1) {
            group.addPostType(msg.url);
        }
    });
}
function createPost(msg, conn) {
    if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid); 
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        else if(group.users.indexOf(conn.user) != -1) {
            var newid = group.createPost(conn.user,msg.posttype);
            group.users.forEach(function(theUser) {
                if(connectedUsers.has(theUser)) {
                    connectedUsers.get(theUser).sendText(JSON.stringify(new createPostMsg(msg.groupid,newid,msg.posttype)));
                }
            });
        }
    });
}
function changePost(msg, conn) {
    if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid);
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        else if(group.users.indexOf(conn.user) != -1) {
            group.changePost(conn.user,msg.postid,msg.newdata);
            group.users.forEach(function(theUser) {
                if(connectedUsers.has(theUser)) {
                    connectedUsers.get(theUser).sendText(JSON.stringify(new changePostMsg(msg.groupid,msg.postid,msg.newdata)));
                }
            });
        }
    });
}
function deletePost(msg, conn) {
   if(!conn.user) {
        conn.close();
        return;
    }
    var id = mongoose.Types.ObjectId(msg.groupid);
    Group.findOne({_id: id}, function (err, group) {
        if(err || !group) {
            return;
        }
        else if(group.users.indexOf(conn.user) != -1) {
            group.deletePost(conn.user,msg.postid);
            group.users.forEach(function(theUser) {
                if(connectedUsers.has(theUser)) {
                    connectedUsers.get(theUser).sendText(JSON.stringify(new deletePostMsg(msg.groupid,msg.postid)));
                }
            });
        }
    }); 
}
//getting connection input (probably just for debugging)
var readline = require('readline');

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});
rl.on('line', function(line) {
    switch (line) {
        case "users":
            console.log(connectedUsers.keys());
            break;
        case "conns":
            console.log(connectedUsers.values());
            break;
        default:
            console.log("incorrect command, try again");
            break;
    }
});
process.on("SIGINT", function () {
    console.log("closing database");
    db.close();
    console.log("closing websocket connections");
    server.connections.forEach(function (conn) {
		conn.close();
	});
    server.close();
    console.log("Server shutdown");
    process.exit();
});