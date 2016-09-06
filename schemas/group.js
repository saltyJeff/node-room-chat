var mongoose = require("mongoose");
var conf = require("../conf.js");
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
    postTypes: conf("types") //hrefs to post elements
});
groupSchema.methods.addUser = function (user, cmplt) {
    var theGroup = this;
    var err = null;
    if(theGroup.users.indexOf(user.username) != -1) {
        err = {
            "type": "groupfail",
            "reason": "User is already in group"
        };
        cmplt(err);
        return;
    }
    theGroup.users.push(user.username);
    theGroup.save(function () {
        user.groups.push(theGroup._id.toString());
        cmplt(err);
        user.save();
    });
};
groupSchema.methods.removeUser = function (username, cmplt) {
    var theGroup = this;
    var err = null;
    if(theGroup.users.indexOf(username) == -1) {
        err = {
            "type": "groupfail",
            "reason": "User not in group"
        };
        cmplt(err);
        return;
    }
    theGroup.users.splice(theGroup.users.indexOf(username), 1);
    if(theGroup.users.length < 1) {
        console.log("no users, removed group "+theGroup.name);
        theGroup.remove();
        cmplt(err);
        return;
    }
    theGroup.save(function () {
        cmplt(err);
    });
    console.log(goneUser+" removed from group "+theGroup.name);
};
groupSchema.methods.sendMsg = function (username, msg, cmplt) {
    var theGroup = this;
    var err = null;
    if(theGroup.users.indexOf(username) == -1) {
        err = {
            "type": "groupfail",
            "reason": "User not in group"
        };
        cmplt(err);
        return;
    }
    //sanity checks (clients be crazy)
    if(msg.datatype != "text" && msg.datatype != "rtf" && msg.datatype != "image" && msg.datatype != "link" && msg.datatype != "base64") {
        err = {
            "type": "msgfail",
            "reason": msg.datatype+" is not a data type"
        };
        cmplt(err);
        return;
    }
    var newMsgObj = {
        "sender": username,
        "datatype": msg.datatype,
        "data": msg.data,
        "time": Date.now()
    };
    theGroup.messages.push(newMsgObj);
    while(theGroup.messages.length > conf("msghistory")) { //set max msg back
        theGroup.messages.shift();
    }
    theGroup.save(function () {
        cmplt(err);
    });
};
groupSchema.methods.addPostType = function (username, url, cmplt, fail) {
    console.log("adding post type");
    var err = null;
    if(this.users.indexOf(username) == -1) {
        err = {
            "type": "groupfail",
            "reason": "User not in group"
        };
        cmplt(err);
        return;
    }
    if(this.postTypes.indexOf(url) != -1) {
        err = {
            "type": "postfail",
            "reason": "Post type already in group"
        };
        cmplt(err);
        return;
    }
    else {
        this.postTypes.push(url);
        this.save(function () {
            cmplt(err);
        });
    }
};
groupSchema.methods.createPost = function (username, type, cmplt) {
    var err = null;
    if(this.users.indexOf(user.username) == -1) {
        err = {
            "type": "groupfail",
            "reason": "User not in group"
        };
        cmplt(err);
        return;
    }
    var newpost = this.posts.create({
        "user": username,
        "type": type,
        "time": Date.now()
    });
    this.posts.push(newpost);
    while(this.posts.length > conf("posthistory")) { //set max post back
        this.posts.shift();
    }
    this.save(function () {
        cmplt(err, newpost._id);
    });
};
groupSchema.methods.changePost = function (user, postid, newdata, cmplt, fail) {
    var post = this.posts.id(postid);
    if(post.user != user.username) {
        err = {
            "type": "groupfail",
            "reason": "User not owner of post"
        };
        cmplt(err);
        return;
    }
    post.data = newdata;
    post.save();
    this.save(function () {
        cmplt(err);
    });
};
module.exports = groupSchema;