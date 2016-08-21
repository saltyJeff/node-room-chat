var mongoose = require("mongoose");
//defines message schema
var msgSchema = mongoose.Schema({
    "sender": String, //who sent the message
	"time": {type: Number, default: Date.now()}, //millisecond message was sent
	"datatype": String, //text, rtf, image, link, base64
	"data": String //the message contents
});
//define post schema
var postSchema = mongoose.Schema({
    "user": String, //the user that originally posted
    "data": String, //data for the post
    "type": String, //the element name of the type of post
    "time": Number //millisecond post was posted
});
//define Group schemas
var groupSchema = mongoose.Schema({
    users: Array, //users in the group
    name: String, //name of the group
    messages: [msgSchema], //messages in the group
    posts: [postSchema], //posts in the group
    postTypes: Array //hrefs to post elements
});
groupSchema.methods.addUser = function (user, cmplt, fail) {
    var theGroup = this;
    if(theGroup.users.indexOf(user.username) != -1) {
        fail("groupfail", "User is already in group");
        return;
    }
    theGroup.users.push(user.username);
    theGroup.save(function () {
        user.groups.push(theGroup._id.toString());
        cmplt();
        user.save();
    });
};
groupSchema.methods.removeUser = function (username, cmplt, fail) {
    var theGroup = this;
    if(theGroup.users.indexOf(username) == -1) {
        fail("groupfail", "User not in group");
        return;
    }
    theGroup.users.splice(theGroup.users.indexOf(username), 1);
    if(theGroup.users.length < 1) {
        console.log("no users, removed group "+theGroup.name);
        theGroup.remove();
        cmplt();
        return;
    }
    theGroup.save(function () {
        cmplt();
    });
    console.log(goneUser+" removed from group "+theGroup.name);
};
groupSchema.methods.sendMsg = function (username, msg, cmplt, fail) {
    var theGroup = this;
    if(theGroup.users.indexOf(username) == -1) {
        fail("groupfail", "User not in group");
        return;
    }
    //sanity checks
    if(msg.datatype != "text" && msg.datatype != "rtf" && msg.datatype != "image" && msg.datatype != "link" && msg.datatype != "base64") {
        fail("msgfail", msg.datatype+" is not a valid data type");
        return;
    }
    var newMsgObj = {
        "sender": username,
        "datatype": msg.datatype,
        "data": msg.data,
        "time": Date.now()
    };
    theGroup.messages.push(newMsgObj);
    while(theGroup.messages.length > 10) { //set max msg back
        theGroup.messages.shift();
    }
    theGroup.save(function () {
        cmplt();
    });
    //MIGRATE TO NRC.JS
    /*
    thegroup.users.forEach(function(theUser) {
        if(connectedUsers.has(theUser)) {
        connectedUsers.get(theUser).sendText(JSON.stringify(new out.newMsgMsg(thegroup._id.toString(), thegroup.messages[thegroup.messages.length - 1])));
        }
    });
    */
};
groupSchema.methods.addPostType = function (username, url, cmplt, fail) {
    console.log("adding post type");
    if(this.users.indexOf(username) == -1) {
        fail("groupfail", "User not in group");
        return;
    }
    if(this.postTypes.indexOf(url) != -1) {
        fail("postfail", "post type already exists");
        return;
    }
    else {
        this.postTypes.push(url);
        this.save(function () {
            cmplt();
        });
    }
};
groupSchema.methods.createPost = function (username, type, cmplt, fail) {
    if(this.users.indexOf(user.username) == -1) {
        fail("groupfail", "User not in group");
        return;
    }
    var newpost = this.posts.create({
        "user": username,
        "type": type,
        "time": Date.now()
    });
    this.posts.push(newpost);
    this.save(function () {
        cmplt(newpost._id);
    });
};
groupSchema.methods.changePost = function (user, postid, newdata, cmplt, fail) {
    var post = this.posts.id(postid);
    if(post.user != user.username) {
        fail("groupfail", "User not in group");
        return;
    }
    post.data = newdata;
    post.save();
    this.save(function () {
        cmplt();
    });
};
module.exports = groupSchema;