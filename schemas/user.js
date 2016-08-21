var crypto = require("crypto");
var mongoose = require("mongoose");
userSchema = mongoose.Schema({
    username: { type: String, required: true, unique: true, index: true },
    password: { type: String, required: true },
    salt: String,

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
        groups: this.groups,
        contacts: this.contacts,
    };
};
module.exports = userSchema;