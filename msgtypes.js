module.exports.toClient = {
    errMsg: function (type, reason) {
        this.msgtype = "err";
        this.error = type;
        this.reason = reason;
    },
    loggedInMsg: function (userData) {
        this.msgtype = "loggedin";
        this.userdata = userData;
    },
    inGroupMsg: function (groupData) {
        this.msgtype = "ingroup";
        this.groupdata = groupData;
    },
    newMsgMsg: function (groupid, newmsg) {
        this.msgtype = "newmsg";
        this.groupid = groupid;
        this.msg = newmsg;
    },
    userAdded: function (newUsername, groupid) {
        this.msgtype = "useradded";
        this.newuser = newUsername;
        this.groupid = groupid;
    },
    userRemoved: function (goneUser, groupid) {
        this.msgtype = "userremoved";
        this.olduser = goneUser;
        this.groupid = groupid;
    },
    addPostTypeMsg: function (id,url) {
        this.msgtype = "newposttype";
        this.groupid = id;
        this.url = url;
    },
    createPostMsg: function (groupid,postid,type) {
        this.msgtype = "createpost";
        this.groupid = groupid;
        this.postid = postid;
        this.posttype = type;
    },
    changePostMsg: function (groupid, postid, newdata) {
        this.msgtype = "changepost";
        this.groupid = groupid;
        this.postid = postid;
        this.newdata = newdata;
    },
    deletePostMsg: function (groupid, postid) {
        this.msgtype = "deletepost";
        this.groupid = groupid;
        this.postid = postid;
    }
};